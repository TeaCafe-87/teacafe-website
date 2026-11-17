"""Paint the new elements in the original's blue-green-gold palette.

- waterfall + stream on the far layer   -> work/layers/far_fx.png
- cloud sea (front + back banks)        -> work/layers/cloud_front.png / cloud_back.png
- geometry for the live overlay         -> work/overlay_geom.json

All coordinates are original-painting pixels (1583x800); images are
drawn at the layer's native scale (K px per original px).
"""
import json
import numpy as np
import cv2
from PIL import Image, ImageDraw

K = 4
P = np.array([226, 213, 189], np.float32)
WATER = np.array([246, 243, 233], np.float32)
SLATE = np.array([84, 104, 120], np.float32)
FLOW = np.array([150, 172, 184], np.float32)
GOLD = np.array([196, 160, 104], np.float32)


def over(dst_rgb, dst_a, src_rgb, src_a):
    """Porter-Duff over on straight-alpha float arrays (a in 0..1)."""
    out_a = src_a + dst_a * (1 - src_a)
    out = (src_rgb * src_a[..., None] + dst_rgb * (dst_a * (1 - src_a))[..., None]) / np.maximum(out_a, 1e-5)[..., None]
    return out, out_a


def resample(pts, n):
    pts = np.asarray(pts, np.float32)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    t = np.linspace(0, seg[-1], n)
    return np.c_[np.interp(t, seg, pts[:, 0]), np.interp(t, seg, pts[:, 1])], t / seg[-1]


def stroke_mask(shape, pts, widths, off=(0, 0), scale=K):
    """Variable-width polyline as a float mask (round joins)."""
    m = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    q = [((x - off[0]) * scale, (y - off[1]) * scale) for x, y in pts]
    for i in range(len(q) - 1):
        w = max(1, int(round(widths[i] * scale)))
        d.line([q[i], q[i + 1]], fill=255, width=w)
        r = w / 2
        d.ellipse([q[i][0] - r, q[i][1] - r, q[i][0] + r, q[i][1] + r], fill=255)
    return np.asarray(m, np.float32) / 255


def blob(shape, cx, cy, rx, ry, off=(0, 0), scale=K):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    X = xx / scale + off[0]
    Y = yy / scale + off[1]
    return np.exp(-(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2))


# ------------------------------------------------------------------ waterfall
far = np.asarray(Image.open('work/layers/far.png'), np.float32)
rgb, al = far[..., :3], far[..., 3] / 255
rgb = np.where(al[..., None] > 0.004, rgb, P)          # clean colours under zero alpha

# work in a local window for speed
U0, V0, U1, V1 = 250, 150, 520, 480
win = (slice(V0 * K, V1 * K), slice(U0 * K, U1 * K))
wr = np.zeros_like(rgb[win]) + P
wa = np.zeros_like(al[win])
shape = wa.shape
off = (U0, V0)

UPPER = [(326, 176), (326.3, 192), (327.2, 210), (328.0, 228), (328.6, 241)]
LOWER = [(329.8, 251), (330.2, 272), (331.2, 300), (332.0, 328), (332.8, 356), (333.6, 388)]
STREAM = [(336, 401), (346, 408), (360, 413), (376, 418), (392, 425), (410, 433), (428, 441), (448, 450), (470, 458)]

H_, W_ = shape
yy = (np.arange(H_) / K + V0)[:, None]
xx = (np.arange(W_) / K + U0)[None, :]
rng = np.random.default_rng(7)


def streaks(h, w, cell_y, cell_x, seed):
    g = np.random.default_rng(seed).random((max(2, int(h / cell_y)), max(2, int(w / cell_x))))
    return cv2.resize(g.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC).clip(0, 1)


def fall(pts, w0, w1, seed):
    """Masks for one fall segment: water, left cliff shadow, right cliff light."""
    pts = np.asarray(pts, np.float32)
    v = yy[:, 0]
    xc = np.interp(v, pts[:, 1], pts[:, 0])[:, None]
    t = np.clip((v - pts[0, 1]) / (pts[-1, 1] - pts[0, 1]), 0, 1)[:, None]
    inside = ((v >= pts[0, 1] - 1) & (v <= pts[-1, 1] + 1))[:, None].astype(np.float32)
    wob = cv2.resize(np.random.default_rng(seed).random((max(2, H_ // 60), 1)).astype(np.float32), (1, H_),
                     interpolation=cv2.INTER_CUBIC)
    hw = (w0 + (w1 - w0) * t) / 2 * (0.85 + 0.3 * wob)
    edge_n = streaks(H_, W_, 10 * K, 2 * K, seed + 1)
    dx = xx - xc
    d = np.abs(dx) + (edge_n - 0.5) * 0.8
    water = np.clip((hw + 0.45 - d) / 0.9, 0, 1) * inside
    water *= np.clip((v[:, None] - pts[0, 1]) / 5, 0, 1)          # emerges from the rock notch
    st = streaks(H_, W_, 22 * K, 0.7 * K, seed + 2)                # silky vertical threads
    water_a = water * (0.62 + 0.36 * st)
    rock_n = streaks(H_, W_, 7 * K, 3 * K, seed + 3)
    left = np.clip(1 - (-dx - hw) / 3.6, 0, 1) * (dx < -hw + 0.3) * inside * (0.5 + 0.6 * rock_n)
    right = np.clip(1 - (dx - hw) / 2.0, 0, 1) * (dx > hw - 0.3) * inside * (0.4 + 0.6 * rock_n)
    return water_a, np.clip(left, 0, 1), np.clip(right, 0, 1), st


wu, lu, ru, stu = fall(UPPER, 3.6, 5.0, 11)
wl, ll, rl, stl = fall(LOWER, 5.0, 8.4, 21)
water_a = np.maximum(wu, wl)
shadow = np.maximum(lu, ll) * np.clip((392 - yy) / 26, 0, 1)
lightr = np.maximum(ru, rl) * np.clip((392 - yy) / 26, 0, 1)
wr, wa = over(wr, wa, np.broadcast_to(SLATE, wr.shape), shadow * 0.36)
wr, wa = over(wr, wa, np.broadcast_to(np.array([120, 140, 150], np.float32), wr.shape), lightr * 0.16)
wr, wa = over(wr, wa, np.broadcast_to(WATER, wr.shape), water_a * 0.93)
# faint blue threads inside the water
thr = np.maximum(wu, wl) * np.clip((np.maximum(stu, stl) - 0.72) * 3, 0, 1)
wr, wa = over(wr, wa, np.broadcast_to(FLOW, wr.shape), thr * 0.4)

# spray at the ledge and a soft plunge mist at the base (no glow)
spray = blob(shape, 329.2, 247, 5.0, 2.0, off) * 0.35 + blob(shape, 334, 396, 20, 6.5, off) * 0.55 \
        + blob(shape, 333.5, 391, 8, 3.5, off) * 0.45
spray *= 0.75 + 0.5 * streaks(H_, W_, 2 * K, 2 * K, 5)
wr, wa = over(wr, wa, np.broadcast_to(WATER, wr.shape), np.clip(spray, 0, 0.8))

# stream: a calm pale ribbon with broken ink banks, fading into mist downstream
line = Image.new('L', (W_, H_), 0)
ImageDraw.Draw(line).line([((x - U0) * K, (y - V0) * K) for x, y in STREAM], fill=255, width=1)
dist = cv2.distanceTransform((255 - np.asarray(line)).astype(np.uint8), cv2.DIST_L2, 5) / K
st_pts, _ = resample(STREAM, 400)
tt = np.clip((xx - STREAM[0][0]) / (STREAM[-1][0] - STREAM[0][0]), 0, 1)
hw = (2.4 + 3.8 * tt) / 2
fade = np.clip(1 - (yy - 402) / 60, 0, 1) * np.clip((xx - 334) / 6, 0, 1)
river = np.clip((hw + 0.5 - dist) / 1.0, 0, 1) * fade
wr, wa = over(wr, wa, np.broadcast_to(np.array([238, 239, 233], np.float32), wr.shape), river * 0.62)
bank_n = streaks(H_, W_, 14 * K, 30 * K, 31)
bank = np.exp(-((dist - hw) / 0.4) ** 2) * np.clip((bank_n - 0.3) * 2.5, 0, 1) * fade
wr, wa = over(wr, wa, np.broadcast_to(SLATE, wr.shape), bank * 0.26)
for k in range(16):
    i = int(rng.uniform(10, len(st_pts) - 20))
    x, y = st_pts[i]
    L = rng.uniform(2.0, 4.5)
    rp = stroke_mask(shape, [(x - L / 2, y + rng.uniform(-0.8, 0.8)), (x + L / 2, y + rng.uniform(-0.8, 0.8))], [0.28, 0.28], off)
    wr, wa = over(wr, wa, np.broadcast_to(FLOW, wr.shape), cv2.GaussianBlur(rp, (0, 0), 0.35 * K) * 0.55 * river)

Image.fromarray(np.dstack([np.clip(wr, 0, 255), np.clip(wa, 0, 1) * 255]).astype(np.uint8), 'RGBA') \
    .save('work/layers/fall.png', compress_level=3)   # origin (U0, V0), native K
print('waterfall painted')


# ------------------------------------------------------------------ clouds
def cloud_bank(u0, u1, v0, v1, scale, rim_v, seed, rmin=16, rmax=50, rows=3, body=90, rim_line=0.12):
    """Layered billows, back to front, each with a bright crown, warm hollow
    and a thin pale contour on its upper arc (gongbi cloud style)."""
    rng = np.random.default_rng(seed)
    Wc, Hc = int((u1 - u0) * scale), int((v1 - v0) * scale)
    rgb = np.zeros((Hc, Wc, 3), np.float32) + np.array([244, 239, 228], np.float32)
    a = np.zeros((Hc, Wc), np.float32)
    top = np.array([246, 242, 233], np.float32)
    low = np.array([239, 232, 218], np.float32)
    line_c = np.array([128, 148, 162], np.float32)
    bills = []
    for row in range(rows):
        base = rim_v + row * (rmax * 0.55)
        u = u0 - rmax
        while u < u1 + rmax:
            r = (rmin + (rmax - rmin) * rng.random() ** 1.8) * (1 - 0.22 * row)
            swell = 10 * np.sin(u / 83 + seed + row) + 5 * np.sin(u / 31 + 2 * seed)
            cy = base + r * 0.8 - swell * (1 - 0.4 * row) + rng.uniform(-4, 4)
            bills.append((row, cy, u + rng.uniform(-6, 6), r))
            u += r * rng.uniform(0.9, 1.5)
    bills.sort(key=lambda b: (b[0], b[1]))
    for row, cy, cu, r in bills:
        x0, x1 = int((cu - r - 2 - u0) * scale), int((cu + r + 2 - u0) * scale)
        y0, y1 = int((cy - r - 2 - v0) * scale), int((cy + r * 0.2 + body * 0.6 - v0) * scale)
        x0c, x1c, y0c, y1c = max(x0, 0), min(x1, Wc), max(y0, 0), min(y1, Hc)
        if x1c <= x0c or y1c <= y0c:
            continue
        Y, X = np.mgrid[y0c:y1c, x0c:x1c].astype(np.float32)
        U = X / scale + u0 - cu
        V = Y / scale + v0 - cy
        dist = np.hypot(U, V * 1.85)
        crown = np.clip((r - dist) / 3.0, 0, 1)
        # below its centre a billow melts into the bank: alpha fades, no hard bottom
        melt = np.where(V > 0, np.clip(1 - V / (r * 0.95), 0, 1) ** 1.4, 1.0)
        disc = crown * melt
        tz = np.clip((V + r) / (1.7 * r), 0, 1)[..., None]
        col = top * (1 - tz) + low * tz
        warm = np.clip((U + r * 0.3) / (1.3 * r), 0, 1) * np.clip(V / r + 0.6, 0, 1) * 0.10
        col = col * (1 - warm[..., None]) + GOLD * warm[..., None]
        ang = np.clip(-V / (np.abs(U) + 1e-3), 0, None)               # upper arc only
        ring = np.exp(-((dist - r + 0.45) / 0.33) ** 2) * np.clip(ang * 0.9 - 0.15, 0, 1)
        col = col * (1 - ring[..., None] * rim_line) + line_c * (ring[..., None] * rim_line)
        da = np.clip(disc + ring * rim_line * 0.7, 0, 1)
        sl = (slice(y0c, y1c), slice(x0c, x1c))
        nr, na = over(rgb[sl], a[sl], col, da * 0.97)
        rgb[sl], a[sl] = nr, na
    vv = (np.arange(Hc) / scale + v0)[:, None]
    # continuous soft body under the crowns, fading out downward
    body_top = rim_v + rmax * 0.9
    fill = np.clip((vv - body_top + rmax * 0.6) / (rmax * 0.6), 0, 1) * np.clip(1 - (vv - body_top - rmax * rows * 0.4) / body, 0, 1)
    fill = np.broadcast_to(fill, a.shape)
    rgb, a = over(np.broadcast_to(low, rgb.shape).copy(), fill * 0.9, rgb, a)
    a = a * np.clip(1 - (vv - (body_top + rmax * rows * 0.4 + body)) / 20, 0, 1)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), 'RGBA')


CF = dict(u0=560, u1=1440, v0=60, v1=330, scale=7, rim_v=132, seed=3, rmin=8, rmax=26, rows=3, rim_line=0.12)
CB = dict(u0=300, u1=1600, v0=220, v1=520, scale=4, rim_v=318, seed=11)
cloud_bank(**CF).save('work/layers/cloud_front.png', compress_level=3)
cloud_bank(rmin=22, rmax=64, rows=2, body=120, rim_line=0.16, **CB).save('work/layers/cloud_back.png', compress_level=3)
print('clouds painted')

geom = {
    'waterfall': {'depth': 12.0, 'upper': UPPER, 'lower': LOWER, 'upperWidth': [3.4, 4.8], 'lowerWidth': [4.6, 7.8],
                  'pool': [334, 395, 22, 7], 'ledge': [328.8, 246]},
    'stream': {'depth': 12.0, 'path': STREAM, 'width': [2.6, 6.2]},
    'clouds': {'front': {**CF, 'depth': 4.55}, 'back': {**CB, 'depth': 7.0}},
}
json.dump(geom, open('work/overlay_geom.json', 'w'), indent=1)
