import numpy as np, cv2, os
from PIL import Image
import gen
from gen import S, PAPER, INK, BLUE, comp, rounded, seal, noise, smooth, mask, to_rgba

def load(n, k=1.0, dx=0, dy=0, size=None):
    im = Image.open(f'L_{n}.png').convert('RGBA')
    w = int(S * k)
    im = im.resize((w, w), Image.LANCZOS)
    a = np.array(im, float) / 255
    out = np.zeros((S, S, 4))
    x0, y0 = int(dx), int(dy)
    xs, ys = slice(max(0, x0), min(S, x0 + w)), slice(max(0, y0), min(S, y0 + w))
    out[ys, xs] = a[ys.start - y0: ys.stop - y0, xs.start - x0: xs.stop - x0]
    return out

def scene(img, k, cx, top, layers=('far', 'main', 'near_right')):
    w = S * k; dx = cx - 0.555 * w; dy = top - 0.185 * w
    for n in layers:
        L = load(n, k, dx, dy)
        img = comp(img, L[..., :3], L[..., 3])
    return img

def paper():
    nz = noise(5, 3)
    return PAPER[None, None] * (0.975 + 0.04 * nz[..., None]) * np.ones((S, S, 1))

yy = np.arange(S)[:, None] * np.ones((1, S))

def mistband(img, y0, y1, a=1.0):
    nz = noise(140)
    t = np.clip((yy - y0) / (y1 - y0), 0, 1)
    return comp(img, PAPER, (t ** 1.3 * (0.75 + 0.25 * nz) + t ** 3 * 0.4) * a)

def concept_a():
    img = paper()
    disk = np.zeros((S, S)); cv2.circle(disk, (700, 300), 170, 1.0, -1, cv2.LINE_AA)
    img = comp(img, np.array([226, 178, 104]) / 255, cv2.GaussianBlur(disk, (0, 0), 2) * 0.5)
    img = scene(img, 1.55, 470, 120)
    img = mistband(img, 600, 950)
    img = seal(img, 815, 815, 170, '茶')
    return to_rgba(img, rounded(200))

def concept_b():
    img = paper()
    land = scene(paper(), 1.3, 500, 80)
    land = mistband(land, 500, 690, 0.9)
    cx, rim_y, rx, ry = 512, 690, 280, 46
    t = np.linspace(0, np.pi, 240)
    lo = np.stack([cx + rx * np.cos(t), rim_y + ry * np.sin(t)], 1)
    up = np.stack([cx + rx * np.cos(t), rim_y - ry * np.sin(t)], 1)
    inside = mask(np.vstack([lo, up[::-1]]), 1)
    img = comp(img, land, np.clip((yy < rim_y) + inside, 0, 1))
    img = comp(img, np.array([214, 178, 112]) / 255, inside * np.clip((yy - rim_y + 30) / 60, 0, 1) * 0.75)
    cup = smooth([(cx - rx, rim_y), (cx - rx + 22, 800), (cx - 170, 880), (cx, 902), (cx + 170, 880), (cx + rx - 22, 800), (cx + rx, rim_y)], closed=False)
    body = np.clip(mask(np.vstack([cup, [[cx + rx, rim_y]]])) - inside, 0, 1)
    xx = np.ones((S, 1)) * np.arange(S)[None]
    nz = noise(50)
    glaze = PAPER * 1.04 * np.ones((S, S, 1)) * (0.97 + 0.04 * nz[..., None])
    glaze = comp(glaze, np.array([120, 160, 150]) / 255, np.clip((xx - cx + 40) / 300, 0, 1) * 0.45)
    band = np.exp(-((yy - (rim_y + 60 + 0.0006 * (xx - cx) ** 2 * 0)) / 9) ** 2)
    glaze = comp(glaze, BLUE, band * 0.85)
    glaze = comp(glaze, BLUE, np.exp(-((yy - (rim_y + 82)) / 4) ** 2) * 0.7)
    img = comp(img, glaze, body)
    ol = np.zeros((S, S), np.float32)
    cv2.polylines(ol, [np.round(np.vstack([up, lo[::-1]])).astype(np.int32)], True, 1.0, 5, cv2.LINE_AA)
    cv2.polylines(ol, [np.round(cup).astype(np.int32)], False, 1.0, 6, cv2.LINE_AA)
    img = comp(img, INK, cv2.GaussianBlur(ol, (0, 0), 1) * 0.85)
    foot = smooth([(cx - 120, 893), (cx - 110, 930), (cx, 936), (cx + 110, 930), (cx + 120, 893)], closed=False)
    fm = mask(np.vstack([foot, [[cx, 900]]]))
    img = comp(img, glaze * 0.92, fm)
    fo = np.zeros((S, S), np.float32); cv2.polylines(fo, [np.round(foot).astype(np.int32)], False, 1.0, 5, cv2.LINE_AA)
    img = comp(img, INK, fo * 0.8)
    st = np.zeros((S, S), np.float32)
    for x0, ph, top in [(400, 0.0, 330), (620, 1.9, 380)]:
        ys = np.linspace(rim_y - 20, top, 100); xs = x0 + 26 * np.sin((rim_y - ys) / 60 + ph)
        cv2.polylines(st, [np.stack([xs, ys], 1).astype(np.int32)], False, 1.0, 12, cv2.LINE_AA)
    st = cv2.GaussianBlur(st, (0, 0), 7) * np.clip((yy - 300) / 160, 0, 1)
    img = comp(img, np.array([250, 247, 238]) / 255, st * 0.75)
    img = seal(img, 815, 230, 130, '茶')
    return to_rgba(img, rounded(200))

def concept_c():
    img = paper()
    img = seal(img, 512, 512, 760, '茶咖暖居', rot=0)
    return to_rgba(img, rounded(200))

def concept_d():
    """wordmark seal 茶 over landscape circle (round badge)"""
    img = paper()
    img = scene(img, 1.5, 512, 130)
    img = mistband(img, 560, 860)
    circ = np.zeros((S * 4, S * 4), np.uint8); cv2.circle(circ, (S * 2, S * 2), S * 2 - 8, 255, -1, cv2.LINE_AA)
    a = cv2.resize(circ, (S, S), interpolation=cv2.INTER_AREA) / 255
    img = seal(img, 512, 830, 150, '茶', rot=0)
    return to_rgba(img, a)

os.makedirs('out', exist_ok=True)
for n, f in [('a', concept_a), ('b', concept_b), ('c', concept_c), ('d', concept_d)]:
    f().save(f'out/concept-{n}.png')

def sheet():
    names = 'abcd'
    W = 1500; H = 280 * len(names)
    im = Image.new('RGB', (W, H), (255, 255, 255))
    for i, n in enumerate(names):
        c = Image.open(f'out/concept-{n}.png')
        y = i * 280 + 10
        im.paste(c.resize((256, 256), Image.LANCZOS), (10, y), c.resize((256, 256), Image.LANCZOS))
        x = 290
        for bg in [(244, 239, 228), (23, 27, 22)]:
            im.paste(Image.new('RGB', (560, 256), bg), (x, y))
            xx = x + 20
            for s in [128, 64, 40, 32, 16]:
                r = c.resize((s, s), Image.LANCZOS)
                im.paste(r, (xx, y + 128 - s // 2), r); xx += s + 24
            x += 590
    im.save('/tmp/sheet.png')
sheet()
