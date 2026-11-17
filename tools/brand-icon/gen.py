"""TeaCafe web icon concepts in the blue-green landscape style of the journey background."""
import numpy as np, cv2, sys
from PIL import Image, ImageDraw, ImageFont
from scipy.interpolate import splprep, splev

S = 1024
rng = np.random.default_rng(7)
PAPER = np.array([226, 213, 189]) / 255
BLUE = np.array([52, 86, 128]) / 255
TEAL = np.array([84, 146, 128]) / 255
OCHRE = np.array([205, 163, 92]) / 255
INK = np.array([38, 52, 74]) / 255
SEAL = np.array([178, 48, 36]) / 255
FONT = '/home/claude/icon/fonts/ma-shan-zheng_{}.ttf'


def smooth(pts, n=400, closed=True):
    p = np.array(pts, float)
    tck, _ = splprep([p[:, 0], p[:, 1]], s=0, per=closed)
    x, y = splev(np.linspace(0, 1, n), tck)
    return np.stack([x, y], 1)


def mask(poly, blur=1.2):
    m = np.zeros((S, S), np.uint8)
    cv2.fillPoly(m, [np.round(poly * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    m = m.astype(float) / 255
    return cv2.GaussianBlur(m, (0, 0), blur) if blur else m


def noise(scale, oct=4):
    out = np.zeros((S, S))
    for o in range(oct):
        n = max(2, int(S / scale * 2 ** o))
        out += cv2.resize(rng.random((n, n)), (S, S), interpolation=cv2.INTER_CUBIC) / 2 ** o
    out -= out.min(); return out / out.max()


def comp(img, col, a):
    a = np.clip(a, 0, 1)[..., None]
    col = np.asarray(col)
    return img * (1 - a) + (col if col.ndim == 3 else col[None, None]) * a


def peak_paint(img, poly, top_y, bot_y, tint=1.0):
    """青綠 shading: blue/teal at the rim, ochre in the body, green near the top."""
    m = mask(poly)
    d = cv2.distanceTransform((m > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    rim = np.exp(-d / 26)
    yy = np.linspace(0, 1, S)[:, None] * np.ones((1, S))
    h = np.clip((yy * S - top_y) / (bot_y - top_y), 0, 1)
    nz = noise(90)
    body = OCHRE[None, None] * (1 - 0.18 * nz[..., None])
    col = comp(body, TEAL, (1 - h) ** 1.4 * 0.85 + 0.15 * nz)
    col = comp(col, BLUE, np.clip(rim * 1.1 + (1 - h) ** 3 * 0.3, 0, 1))
    col = comp(col, PAPER, np.clip((h - 0.72) / 0.28, 0, 1) ** 1.5 * 0.9)  # base melts into mist
    img = comp(img, col, m * tint)
    edge = np.clip(m * (1 - m) * 4, 0, 1) * (1 - np.clip((h - 0.6) / 0.4, 0, 1))
    return comp(img, INK, edge * 0.85)


def texture_strokes(img, poly, n, seed, top_y):
    r = np.random.default_rng(seed)
    m = mask(poly, 0)
    layer = np.zeros((S, S), np.float32)
    ys, xs = np.nonzero(m > 0.5)
    for _ in range(n):
        i = r.integers(len(xs)); x, y = xs[i], ys[i]
        if y > top_y + (S - top_y) * 0.55: continue
        L = r.uniform(30, 80)
        pts = np.array([[x, y], [x + r.uniform(-8, 8), y + L * .5], [x + r.uniform(-14, 14), y + L]], np.int32)
        cv2.polylines(layer, [pts], False, 1.0, 2, cv2.LINE_AA)
    layer = cv2.GaussianBlur(layer, (0, 0), 0.8) * m
    return comp(img, INK, layer * 0.35)


def mist(img, cy, h, alpha=0.85, x0=0, x1=S):
    nz = noise(160)
    yy = np.arange(S)[:, None] * np.ones((1, S))
    xx = np.ones((S, 1)) * np.arange(S)[None]
    band = np.exp(-((yy - cy) / h) ** 2) * (0.6 + 0.4 * nz)
    band *= np.clip((xx - x0) / 60, 0, 1) * np.clip((x1 - xx) / 60, 0, 1)
    return comp(img, PAPER, band * alpha)


def paper_tile(radius=200, inset=0):
    m = np.zeros((S, S), np.uint8)
    cv2.rectangle(m, (inset, inset), (S - 1 - inset, S - 1 - inset), 255, -1)
    m = rounded(radius, inset)
    nz = noise(6, 3)
    img = PAPER[None, None] * (0.97 + 0.05 * nz[..., None]) * np.ones((S, S, 1))
    return img, m


def rounded(r, inset=0):
    m = np.zeros((S * 4, S * 4), np.uint8)
    a, b, R = inset * 4, (S - inset) * 4, r * 4
    cv2.rectangle(m, (a + R, a), (b - R, b), 255, -1)
    cv2.rectangle(m, (a, a + R), (b, b - R), 255, -1)
    for cx, cy in [(a + R, a + R), (b - R, a + R), (a + R, b - R), (b - R, b - R)]:
        cv2.circle(m, (cx, cy), R, 255, -1, cv2.LINE_AA)
    return cv2.resize(m, (S, S), interpolation=cv2.INTER_AREA).astype(float) / 255


def seal(img, cx, cy, size, chars, rot=-2):
    """Vermilion seal with carved (white) characters, rough edges."""
    sz = int(size)
    layer = Image.new('L', (sz * 2, sz * 2), 0)
    d = ImageDraw.Draw(layer)
    o = sz // 2
    d.rounded_rectangle([o, o, o + sz, o + sz], radius=sz * 0.08, fill=255)
    txt = Image.new('L', layer.size, 0); dt = ImageDraw.Draw(txt)
    if len(chars) == 1:
        f = ImageFont.truetype(FONT.format(chars), int(sz * 0.86))
        dt.text((o + sz / 2, o + sz / 2 + sz * 0.02), chars, font=f, fill=255, anchor='mm')
    else:  # 2x2 read right column top->bottom, then left column
        f = [ImageFont.truetype(FONT.format(c), int(sz * 0.46)) for c in chars]
        pos = [(0.73, 0.28), (0.73, 0.73), (0.27, 0.28), (0.27, 0.73)]
        for c, ft, (px, py) in zip(chars, f, pos):
            dt.text((o + sz * px, o + sz * py), c, font=ft, fill=255, anchor='mm')
    a = np.array(layer, float) / 255
    t = np.array(txt, float) / 255
    t = cv2.dilate(t, np.ones((3, 3)), iterations=max(1, sz // 160))
    n = cv2.resize(rng.random((sz // 6, sz // 6)), layer.size, interpolation=cv2.INTER_CUBIC)
    ero = cv2.erode(a, np.ones((5, 5))) if sz > 120 else a
    a = np.where(n > 0.9, ero, a)                         # chipped border
    ink = np.clip(a - t, 0, 1) * (0.86 + 0.14 * n)        # uneven pigment
    ink = Image.fromarray((ink * 255).astype(np.uint8)).rotate(rot, Image.BICUBIC)
    ink = np.array(ink, float) / 255
    x0, y0 = int(cx - sz), int(cy - sz)
    full = np.zeros((S, S))
    ys, xs = slice(max(0, y0), min(S, y0 + 2 * sz)), slice(max(0, x0), min(S, x0 + 2 * sz))
    full[ys, xs] = ink[ys.start - y0: ys.stop - y0, xs.start - x0: xs.stop - x0]
    return comp(img, SEAL, full)


MAIN = [(250, 940), (300, 600), (380, 330), (440, 175), (500, 130), (570, 160), (610, 300), (690, 560), (790, 940)]
LOBE = [(330, 940), (370, 640), (430, 470), (500, 420), (570, 470), (620, 640), (660, 940)]
SIDE_L = [(-40, 940), (60, 700), (150, 610), (230, 650), (330, 940)]
SIDE_R = [(640, 940), (740, 690), (840, 640), (930, 700), (1080, 940)]


def scale(pts, k, cx, cy, dx=0, dy=0):
    return [((x - 512) * k + cx + dx, (y - 512) * k + cy + dy) for x, y in pts]


def landscape(img, k=1.0, cx=512, cy=512, waterfall=True, birds=True):
    for pts, tint in [(SIDE_L, .9), (SIDE_R, .9)]:
        p = smooth(scale(pts, k, cx, cy), closed=False)
        p = np.vstack([p, [[p[-1, 0], S * 2], [p[0, 0], S * 2]]])
        img = peak_paint(img, p, min(y for _, y in scale(pts, k, cx, cy)), cy + 300 * k, tint)
    m = smooth(scale(MAIN, k, cx, cy), closed=False)
    m = np.vstack([m, [[m[-1, 0], S * 2], [m[0, 0], S * 2]]])
    top = cy + (130 - 512) * k
    img = peak_paint(img, m, top, cy + 380 * k)
    img = texture_strokes(img, m, 140, 3, top)
    lb = smooth(scale(LOBE, k, cx, cy), closed=False)
    lb = np.vstack([lb, [[lb[-1, 0], S * 2], [lb[0, 0], S * 2]]])
    img = peak_paint(img, lb, cy + (420 - 512) * k, cy + 400 * k, 0.95)
    if waterfall:
        fx = cx + (585 - 512) * k
        yy = np.arange(S)[:, None]; xx = np.arange(S)[None]
        y0, y1 = cy + (300 - 512) * k, cy + (700 - 512) * k
        w = 9 * k
        fall = np.exp(-((xx - fx - (yy - y0) * 0.04) / w) ** 2) * ((yy > y0) & (yy < y1))
        fall = cv2.GaussianBlur(fall.astype(float), (0, 0), 2 * k)
        img = comp(img, np.array([246, 240, 226]) / 255, np.clip(fall * 1.1, 0, 0.95))
    img = mist(img, cy + 250 * k, 90 * k, 0.95)
    img = mist(img, cy + 360 * k, 160 * k, 1.0)
    if birds:
        lay = np.zeros((S, S), np.float32)
        for bx, by, bs in [(700, 230, 22), (760, 200, 16), (800, 255, 13)]:
            x, y, s = cx + (bx - 512) * k, cy + (by - 512) * k, bs * k
            pts = np.array([[x - s, y - s * .3], [x - s * .4, y - s * .45], [x, y], [x + s * .4, y - s * .5], [x + s, y - s * .35]], np.int32)
            cv2.polylines(lay, [pts], False, 1.0, max(2, int(4 * k)), cv2.LINE_AA)
        img = comp(img, INK, lay * 0.8)
    return img


def to_rgba(img, alpha):
    return Image.fromarray(np.dstack([np.clip(img, 0, 1) * 255, np.clip(alpha, 0, 1) * 255]).astype(np.uint8), 'RGBA')


# ---- A: landscape tile + seal -------------------------------------------------
def concept_a():
    img, a = paper_tile(210)
    disk = np.zeros((S, S)); cv2.circle(disk, (620, 330), 210, 1.0, -1, cv2.LINE_AA)
    img = comp(img, np.array([232, 196, 128]) / 255, cv2.GaussianBlur(disk, (0, 0), 3) * 0.55)  # warm sun/tea disk
    img = landscape(img, 0.95, 480, 560)
    img = seal(img, 820, 800, 190, '茶')
    return to_rgba(img, a)


# ---- B: teacup holding the landscape ------------------------------------------
def concept_b():
    img, a = paper_tile(210)
    land = landscape(img.copy(), 0.72, 512, 430, birds=False)
    # cup: rim ellipse at y=600, bowl below
    cup = smooth([(170, 600), (210, 790), (330, 880), (512, 905), (694, 880), (814, 790), (854, 600)], closed=False)
    rim_y, rx, ry = 600, 342, 62
    cupm = mask(np.vstack([cup, [[854, 600]]]), 1)
    t = np.linspace(0, np.pi, 200)
    ell_lo = np.stack([512 + rx * np.cos(t), rim_y + ry * np.sin(t)], 1)
    ell_up = np.stack([512 + rx * np.cos(t), rim_y - ry * np.sin(t)], 1)
    inside = mask(np.vstack([ell_lo, ell_up[::-1]]), 1)
    yy = np.arange(S)[:, None] * np.ones((1, S))
    above = (yy < rim_y).astype(float)
    land_mask = np.clip(above + inside, 0, 1) * np.clip((yy - 60) / 40, 0, 1)
    img = comp(img, land, land_mask)
    # tea surface inside rim
    img = comp(img, np.array([196, 150, 84]) / 255, inside * np.clip((yy - rim_y + 10) / 50, 0, 1) * 0.85)
    body = np.clip(cupm - inside, 0, 1)
    xx = np.ones((S, 1)) * np.arange(S)[None]
    shade = np.clip((xx - 330) / 520, 0, 1)
    celadon = comp(np.array([150, 186, 168]) / 255 * np.ones((S, S, 1)), BLUE, shade[..., None].squeeze() * 0.55)
    img = comp(img, celadon, body)
    img = comp(img, np.array([238, 244, 232]) / 255, body * np.exp(-((xx - 300) / 40) ** 2) * 0.35)
    # rim line + outline
    outline = np.zeros((S, S), np.float32)
    cv2.polylines(outline, [np.round(np.vstack([ell_up, ell_lo[::-1]])).astype(np.int32)], True, 1.0, 7, cv2.LINE_AA)
    cv2.polylines(outline, [np.round(cup).astype(np.int32)], False, 1.0, 8, cv2.LINE_AA)
    img = comp(img, INK, cv2.GaussianBlur(outline, (0, 0), 1) * 0.9)
    # foot
    foot = np.zeros((S, S)); cv2.ellipse(foot, (512, 915), (150, 26), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
    img = comp(img, INK, foot * 0.75)
    # steam that becomes cloud around the peak
    st = np.zeros((S, S), np.float32)
    for k, (x0, ph) in enumerate([(395, 0.0), (640, 1.6)]):
        ys = np.linspace(560, 160 + 60 * k, 120)
        xs = x0 + 34 * np.sin((560 - ys) / 70 + ph)
        cv2.polylines(st, [np.stack([xs, ys], 1).astype(np.int32)], False, 1.0, 16, cv2.LINE_AA)
    st = cv2.GaussianBlur(st, (0, 0), 6) * np.clip((yy - 140) / 200, 0, 1)
    img = comp(img, np.array([250, 246, 236]) / 255, st * 0.8)
    img = seal(img, 838, 230, 150, '茶')
    return to_rgba(img, a)


# ---- C: seal mark, the painting's signature -------------------------------------
def concept_c():
    img = np.ones((S, S, 3)) * PAPER
    img = seal(img, 512, 512, 820, '茶咖暖居', rot=0)
    a = (np.abs(img - PAPER).sum(2) > 0.02).astype(float)
    a = cv2.GaussianBlur(a, (0, 0), 0.8)
    # carved white text becomes transparent? keep paper colour so it reads on dark backgrounds
    return to_rgba(img, np.maximum(a, rounded(60, 100)))


if __name__ == '__main__':
    out = '/home/claude/icon/out'
    import os; os.makedirs(out, exist_ok=True)
    for name, fn in [('a', concept_a), ('b', concept_b), ('c', concept_c)]:
        if len(sys.argv) > 1 and name not in sys.argv[1:]: continue
        fn().save(f'{out}/concept-{name}.png'); print(name)
