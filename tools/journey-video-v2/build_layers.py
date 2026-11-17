"""Split the Art-Of-Ink painting into depth layers.

Inputs : src.png (1583x800 original), work/src_x4.png (ESRGAN x4), work/ink_alpha.npy
Outputs: work/layers/<name>.png  (RGBA at x4 = 6332x3200, ink unmixed from paper)
         work/sprites/boat.png, work/sprites/bird_<i>.png, work/sprites/sprites.json
         work/labels_view.png (debug)

Ownership: nearest layer first.  Each layer has a generous polygon in
original-pixel coords; inside it a column is owned from the first pixel
whose (smoothed) ink strength exceeds the layer's threshold down to the
polygon bottom.  That traces every ridge line exactly without hand-drawn
silhouettes.  Farther layers are then inpainted a little way underneath
nearer ones so no seam opens when the camera separates them.
"""
import json, os
import numpy as np
import cv2
from PIL import Image

W0, H0 = 1583, 800
K = 4
P = np.array([226, 213, 189], np.float32)          # paper
os.makedirs('work/layers', exist_ok=True)
os.makedirs('work/sprites', exist_ok=True)

x4 = np.asarray(Image.open('work/src_x4.png').convert('RGB'), np.float32)
a4 = np.load('work/ink_alpha.npy').astype(np.float32)


def up(m):     # orig-res float mask -> x4
    return cv2.resize(m.astype(np.float32), (W0 * K, H0 * K), interpolation=cv2.INTER_LINEAR)


def poly_mask(pts):
    m = np.zeros((H0, W0), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


# ------------------------------------------------------------ sprites
def cut_sprite(box, name, thr=0.06):
    u0, v0, u1, v1 = box
    rgb = x4[v0 * K:v1 * K, u0 * K:u1 * K]
    al = np.clip((a4[v0 * K:v1 * K, u0 * K:u1 * K] - thr) / (1 - thr) * 1.6, 0, 1)
    col = P + (rgb - P) / np.maximum(al[..., None], 1e-3)
    col = np.where(al[..., None] > 1e-3, np.clip(col, 0, 255), 0)
    img = np.dstack([col, al * 255]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(f'work/sprites/{name}.png')
    return al


sprites = {'scale': K, 'birds': []}
# boat (with reflection) — original-px box
BOAT = (884, 606, 950, 652)
cut_sprite(BOAT, 'boat', thr=0.05)
sprites['boat'] = {'box': BOAT}

# birds: connected components inside the flock box
BIRDS = (655, 100, 1040, 240)
bu0, bv0, bu1, bv1 = BIRDS
ab = a4[bv0 * K:bv1 * K, bu0 * K:bu1 * K]
n, lab, stats, _ = cv2.connectedComponentsWithStats((ab > 0.12).astype(np.uint8), 8)
bi = 0
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if area < 40 or area > 2500 or h > 120 or w > 220:
        continue
    pad = 6
    box = (bu0 + (x - pad) / K, bv0 + (y - pad) / K, bu0 + (x + w + pad) / K, bv0 + (y + h + pad) / K)
    ib = tuple(int(round(b)) for b in box)
    cut_sprite(ib, f'bird_{bi}', thr=0.06)
    sprites['birds'].append({'box': ib})
    bi += 1
json.dump(sprites, open('work/sprites/sprites.json', 'w'), indent=1)
print('birds', bi)

# remove boat + birds from the painting (sky/water there is near-paper)
rm = np.zeros((H0 * K, W0 * K), np.uint8)
rm[BOAT[1] * K:BOAT[3] * K, BOAT[0] * K:BOAT[2] * K] = 1
birdmask = np.zeros_like(ab, np.uint8)
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if 40 <= area <= 2500 and h <= 120 and w <= 220:
        birdmask[lab == i] = 1
rm[bv0 * K:bv1 * K, bu0 * K:bu1 * K] = cv2.dilate(birdmask, np.ones((11, 11))) > 0
small = cv2.resize(x4, (W0, H0), interpolation=cv2.INTER_AREA).astype(np.uint8)
rms = (cv2.resize(rm.astype(np.float32), (W0, H0), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8)
rms = cv2.dilate(rms, np.ones((3, 3)))
fill = cv2.inpaint(small, rms, 6, cv2.INPAINT_TELEA).astype(np.float32)
fill4 = cv2.resize(fill, (W0 * K, H0 * K), interpolation=cv2.INTER_CUBIC)
rmf = cv2.GaussianBlur(rm.astype(np.float32), (0, 0), 3)[..., None]
x4 = x4 * (1 - rmf) + fill4 * rmf
dark = np.max((P - x4) / P, axis=2)
light = np.max((x4 - P) / (255 - P), axis=2)
a4 = np.clip(np.maximum(dark, light), 0, 1)

# ------------------------------------------------------------ ownership
a0 = cv2.resize(a4, (W0, H0), interpolation=cv2.INTER_AREA)
a0s = cv2.GaussianBlur(a0, (0, 0), 1.2)
vv = np.arange(H0)[:, None]

LAYERS = [
    # name, depth, polygon (orig px), threshold (None = claim all), floor v (claim all below), median width
    ('near_left',  2.8, [(-60, 320), (60, 268), (420, 268), (440, 440), (470, 490), (500, 505),
                         (520, 555), (600, 558), (604, 652), (-60, 652)], 0.27, (470, 440), 1),
    ('near_right', 3.5, [(1000, 392), (1650, 318), (1650, 640), (940, 640), (948, 520), (965, 470), (985, 430)], 0.29, (505, 9999), 15),
    ('water',      2.0, [(0, 600), (440, 632), (604, 640), (640, 612), (780, 604), (1650, 606), (1650, 860), (-60, 860), (-60, 600)], None, 0, 1),
    ('main',       4.6, [(722, 300), (850, 140), (1012, 140), (1012, 400), (1060, 430), (1060, 612), (722, 612)], 0.14, (470, 9999), 9),
    ('mid',        7.0, [(432, 292), (745, 292), (745, 612), (520, 612), (500, 505), (470, 490), (440, 440), (432, 420)], 0.085, (470, 9999), 5),
    ('far',       12.0, [(0, 0), (W0, 0), (W0, H0), (0, H0)], None, 0, 1),
]

label = np.full((H0, W0), -1, np.int8)
floor_claim = {}
body_col = {}
for li, (name, d, poly, t, floor, med) in enumerate(LAYERS):
    pm = poly_mask(poly) & (label < 0)
    if t is None:
        own = pm
    else:
        cand = pm & (a0s > t)
        # drop thin vertical slivers so one faint stroke can't start a column
        if name != 'near_left':
            k = 3 if name == 'mid' else 5
            cand = cv2.morphologyEx(cand.astype(np.uint8), cv2.MORPH_OPEN, np.ones((1, k), np.uint8)) > 0
        # require a short vertical run so lone specks don't start a column
        # (2 px so thin diagonal outlines still count)
        run = cv2.erode(cand.astype(np.uint8), np.ones((2, 1), np.uint8), anchor=(0, 0)) > 0
        top = np.where(run.any(0), run.argmax(0), H0).astype(np.float32)
        from scipy.ndimage import median_filter
        if med > 1:
            top = median_filter(top, size=med, mode='nearest')
        else:
            # never lower a real peak, but close one-column gaps
            top = np.minimum(top, median_filter(top, size=7, mode='nearest'))
        top = top - (6 if name == 'near_left' else 3)       # take a few sky px above the ridge: keeps twigs/outlines
        own_col = pm & (vv >= top[None, :])
        fv, fu = floor
        uu = np.arange(W0)
        floor_line = fv + np.clip(uu - fu, 0, None) * 2.5          # floor slopes away instead of ending in a wall
        top = np.minimum(top, floor_line)
        own = pm & (vv >= top[None, :])
        floor_claim[li] = own & ~own_col
        body_col[li] = own_col & pm
    label[own] = li

# debug view
cols = np.array([[220, 70, 60], [60, 120, 220], [90, 200, 220], [80, 170, 80], [230, 180, 40], [200, 200, 200]], np.uint8)
view = cols[np.clip(label, 0, 5)]
src0 = cv2.resize(x4, (W0, H0), interpolation=cv2.INTER_AREA)
Image.fromarray((view * 0.45 + src0 * 0.55).astype(np.uint8)).save('work/labels_view.png')
np.save('work/labels.npy', label)

# ------------------------------------------------------------ layer images
GAIN = {'near_left': 2.6, 'near_right': 2.6, 'water': 1.4, 'main': 2.3, 'mid': 1.9, 'far': 1.3}
BAND = {'near_left': 0, 'near_right': 0, 'water': 0, 'main': 40, 'mid': 30, 'far': 36}  # orig px under nearer layers
srcs = cv2.resize(x4, (W0, H0), interpolation=cv2.INTER_AREA).astype(np.uint8)
meta = []
for li, (name, d, poly, t, floor, med) in enumerate(LAYERS):
    own = (label == li)
    nearer = (label >= 0) & (label < li)
    cover = own.astype(np.float32)
    rgb4 = x4.copy()
    if BAND[name]:
        # inpaint this layer's colours a band underneath nearer layers, fading out
        hole = nearer.astype(np.uint8)
        notown = (~own).astype(np.uint8)
        filled = cv2.inpaint(srcs.copy(), notown, 9, cv2.INPAINT_TELEA)   # colours come only from this layer
        dist_own = cv2.distanceTransform(notown, cv2.DIST_L2, 5)        # distance to this layer's pixels
        band = np.clip(1 - dist_own / BAND[name], 0, 1) * hole
        # only extend downward/sideways from this layer's own pixels (not up into sky)
        band_part = band
        mistmix = np.clip(dist_own / BAND[name], 0, 1)[..., None] * 0.4
        filled = filled.astype(np.float32) * (1 - mistmix) + P * mistmix
        f4 = cv2.resize(filled.astype(np.float32), (W0 * K, H0 * K), interpolation=cv2.INTER_CUBIC)
        h4 = up(hole.astype(np.float32))[..., None]
        rgb4 = x4 * (1 - h4) + f4 * h4
    if not BAND[name]:
        band_part = np.zeros_like(cover)
    soft = cv2.GaussianBlur(cover, (0, 0), 0.8)
    if name != 'far':
        PAD = 80
        pm_big = np.zeros((H0 + 2 * PAD, W0 + 2 * PAD), np.uint8)
        cv2.fillPoly(pm_big, [np.array(poly, np.int32) + PAD], 1)
        din = cv2.distanceTransform(pm_big, cv2.DIST_L2, 5)[PAD:-PAD, PAD:-PAD]
        pn = np.clip(din / 14.0, 0, 1); pn = pn * pn * (3 - 2 * pn)
        pw = np.clip(din / 42.0, 0, 1); pw = pw * pw * (3 - 2 * pw)
        bodyw = cv2.GaussianBlur(body_col.get(li, own).astype(np.float32), (0, 0), 6)
        soft = soft * (pn * bodyw + pw * (1 - bodyw))
    soft = np.maximum(soft, band_part)
    if li in floor_claim and floor_claim[li].any():
        # where a column was claimed by the floor rule, fade the top edge vertically
        fz = cv2.dilate(floor_claim[li].astype(np.uint8), np.ones((25, 9), np.uint8)).astype(np.float32)
        fz = cv2.GaussianBlur(fz, (0, 0), 4)
        vsoft = cv2.GaussianBlur(cover, (1, 0), sigmaX=1.0, sigmaY=9)
        vsoft = np.minimum(vsoft, cover + 0) if False else vsoft
        soft = soft * (1 - fz) + np.minimum(vsoft, soft + 0.0) * fz
    cover4 = np.clip(up(soft), 0, 1)
    dk = np.max((P - rgb4) / P, axis=2)
    lt = np.max((rgb4 - P) / (255 - P), axis=2)
    # ink (darker than paper) is boosted so mountains stay opaque when separated;
    # mist (lighter than paper) keeps its true transparency so cut edges vanish
    ink_dark = np.clip((dk - 0.03) / 0.97 * GAIN[name], 0, 1)
    ink_light = np.clip((lt - 0.03) / 0.97, 0, 1)
    ink = np.maximum(ink_dark, ink_light)
    col = np.clip(P + (rgb4 - P) / np.maximum(ink, 1e-3)[..., None], 0, 255)
    al = ink * cover4
    img = np.dstack([col, al * 255]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(f'work/layers/{name}.png', compress_level=3)
    meta.append({'name': name, 'depth': d})
    print('layer', name, 'own px', int(own.sum()))
json.dump({'scale': K, 'paper': P.tolist(), 'size': [W0, H0], 'layers': meta},
          open('work/layers/layers.json', 'w'), indent=1)
