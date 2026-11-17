import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from gen import S, PAPER, INK, BLUE, SEAL, comp, rounded, seal, noise, smooth, mask, to_rgba, FONT
import gen2
from gen2 import paper, scene, mistband, load, yy

def calligraphy(img, text, x, y0, size, color=INK, alpha=0.9):
    lay = Image.new('L', (S, S), 0); d = ImageDraw.Draw(lay)
    for i, c in enumerate(text):
        f = ImageFont.truetype(FONT.format(c), size)
        d.text((x, y0 + i * size * 0.98), c, font=f, fill=255, anchor='mt')
    a = np.array(lay, float) / 255
    nz = noise(20)
    return comp(img, color, a * alpha * (0.85 + 0.15 * nz))

def hut(img, x, y, s=1.0):
    """pavilion-house with upturned eaves and a lit window, on a mist bank"""
    glow = np.zeros((S, S)); cv2.circle(glow, (int(x), int(y - 30 * s)), int(60 * s), 1.0, -1)
    img = comp(img, np.array([242, 188, 104]) / 255, cv2.GaussianBlur(glow, (0, 0), 26 * s) * 0.6)
    W, H = 40 * s, 34 * s
    wall = np.array([[x - W, y], [x - W, y - H], [x + W, y - H], [x + W, y]])
    img = comp(img, np.array([222, 204, 168]) / 255, mask(wall))
    roof = smooth([(x - 74 * s, y - H - 2 * s), (x - 50 * s, y - H - 8 * s), (x - 26 * s, y - H - 30 * s),
                   (x + 26 * s, y - H - 30 * s), (x + 50 * s, y - H - 8 * s), (x + 74 * s, y - H - 2 * s)], 120, closed=False)
    under = smooth([(x + 74 * s, y - H - 2 * s), (x + 40 * s, y - H + 4 * s), (x - 40 * s, y - H + 4 * s), (x - 74 * s, y - H - 2 * s)], 60, closed=False)
    img = comp(img, np.array([58, 74, 98]) / 255, mask(np.vstack([roof, under])))
    for wx in (-20, 20):
        win = np.array([[x + (wx - 11) * s, y - 8 * s], [x + (wx - 11) * s, y - 24 * s], [x + (wx + 11) * s, y - 24 * s], [x + (wx + 11) * s, y - 8 * s]])
        img = comp(img, np.array([248, 172, 64]) / 255, mask(win))
    ol = np.zeros((S, S), np.float32)
    cv2.polylines(ol, [np.round(wall).astype(np.int32)], True, 1.0, max(2, int(3 * s)), cv2.LINE_AA)
    cv2.line(ol, (int(x - 90 * s), int(y + 2)), (int(x + 90 * s), int(y + 2)), 1.0, max(2, int(3 * s)), cv2.LINE_AA)
    img = comp(img, INK, ol * 0.75)
    # small tree
    t = np.zeros((S, S), np.float32)
    tx = int(x - 70 * s)
    cv2.line(t, (tx, int(y)), (tx + int(6 * s), int(y - 70 * s)), 1.0, max(2, int(4 * s)), cv2.LINE_AA)
    for k in range(5):
        cv2.ellipse(t, (tx + int((k % 2 * 18 - 9) * s), int(y - (50 + k * 10) * s)), (int(20 * s), int(8 * s)), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
    img = comp(img, np.array([52, 92, 84]) / 255, t * 0.85)
    return img

def base_scene(sun=True):
    img = paper()
    if sun:
        disk = np.zeros((S, S)); cv2.circle(disk, (700, 300), 170, 1.0, -1, cv2.LINE_AA)
        img = comp(img, np.array([226, 178, 104]) / 255, cv2.GaussianBlur(disk, (0, 0), 2) * 0.5)
    img = scene(img, 1.55, 470, 120)
    return img

def concept_e():
    img = base_scene()
    img = mistband(img, 600, 950)
    img = hut(img, 700, 860, 1.25)
    img = mistband(img, 900, 1100, 0.5)
    img = calligraphy(img, '茶咖暖居', 880, 120, 130)
    img = seal(img, 880, 690, 105, '茶', rot=-3)
    return to_rgba(img, rounded(200))

def concept_f():
    img = base_scene()
    img = mistband(img, 600, 950)
    img = hut(img, 600, 870, 1.1)
    img = mistband(img, 910, 1100, 0.5)
    img = seal(img, 830, 300, 230, '茶咖暖居', rot=-2)
    return to_rgba(img, rounded(200))

def concept_g():
    img = paper()
    # carved peak silhouette inside a vermilion seal
    sz = 820; x0 = (S - sz) // 2
    sealm = rounded(70, x0)
    nz = cv2.resize(np.random.default_rng(3).random((140, 140)), (S, S), interpolation=cv2.INTER_CUBIC)
    sealm = np.where(nz > 0.92, cv2.erode(sealm, np.ones((9, 9))), sealm)
    L = load('main', 1.25, 512 - 0.555 * S * 1.25, 150 - 0.185 * S * 1.25)
    R = load('near_right', 1.25, 512 - 0.555 * S * 1.25, 150 - 0.185 * S * 1.25)
    pk = np.clip(L[..., 3] + R[..., 3] * 0.0, 0, 1)
    pk = (cv2.GaussianBlur(pk, (0, 0), 2) > 0.35).astype(float)
    pk *= (yy < 700)
    pk = cv2.GaussianBlur(pk, (0, 0), 1.2)
    border = rounded(40, x0 + 46)
    carve = np.clip(pk * border, 0, 1)
    # text carved in bottom band
    lay = Image.new('L', (S, S), 0); d = ImageDraw.Draw(lay)
    for i, c in enumerate('茶咖暖居'):
        f = ImageFont.truetype(FONT.format(c), 150)
        d.text((x0 + 120 + i * 194, 805), c, font=f, fill=255, anchor='mm')
    t = cv2.dilate(np.array(lay, float) / 255, np.ones((3, 3)))
    # ridge lines inside peak (carved thin red lines back in)
    lum = (L[..., :3] @ np.array([.3, .59, .11]))
    dark = ((lum < 0.47) * (L[..., 3] > 0.6)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(float)
    ridge = cv2.GaussianBlur(dark, (0, 0), 1.2) * cv2.erode(carve, np.ones((15, 15)))
    sun = np.zeros((S, S)); cv2.circle(sun, (720, 300), 95, 1.0, -1, cv2.LINE_AA)
    sun = sun * (1 - cv2.dilate(pk, np.ones((25, 25))))
    carve = np.clip(carve - ridge * 0.9 + sun, 0, 1)
    ink = np.clip(sealm - carve - t, 0, 1) * (0.86 + 0.14 * nz)
    img = comp(img, SEAL, ink)
    # keep a hint of 青綠 colour inside the carved peak top
    col = L[..., :3]
    img = comp(img, col, carve * L[..., 3] * 0.0)
    return to_rgba(img, rounded(200))

for n, f in [('e', concept_e), ('f', concept_f), ('g', concept_g)]:
    f().save(f'out/concept-{n}.png')

f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc',26,index=2)
names=[('a','A（原版）'),('e','E｜主峰＋直書題款＋暖燈小屋'),('f','F｜主峰＋四字印＋暖燈小屋'),('g','G｜印章刻出主峰')]
W=1500;H=330*4
im=Image.new('RGB',(W,H),(250,248,243)); d=ImageDraw.Draw(im)
for i,(n,label) in enumerate(names):
    c=Image.open(f'out/concept-{n}.png'); y=i*330+50
    d.text((20,y-40),label,font=f,fill=(40,40,40))
    big=c.resize((256,256),Image.LANCZOS); im.paste(big,(20,y),big)
    x=310
    for bg in [(244,239,228),(23,27,22)]:
        d.rectangle([x,y,x+560,y+256],fill=bg); xx=x+20
        for s in [128,64,40,32,16]:
            r=c.resize((s,s),Image.LANCZOS); im.paste(r,(xx,y+128-s//2),r); xx+=s+24
        x+=590
im.save('out/concepts-sheet-2.png')
