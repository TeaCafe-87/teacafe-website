import numpy as np, os, io
from PIL import Image
import gen3
from gen3 import *
from gen import to_rgba, rounded

def f_img(small=False):
    img = base_scene()
    img = mistband(img, 600, 950)
    if not small:
        img = hut(img, 600, 870, 1.1)
        img = mistband(img, 910, 1100, 0.5)
        img = seal(img, 830, 300, 230, '茶咖暖居', rot=-2)
    else:
        img = seal(img, 790, 300, 330, '茶咖暖居', rot=0)
    return img

out = '/home/claude/teacafe-website/dist/image/brand'; os.makedirs(out, exist_ok=True)
full, small = f_img(), f_img(True)
R = rounded(200)
master = to_rgba(full, R); master.save('/home/claude/icon/out/teacafe-icon-master.png')
def save(im, name, size, **kw):
    im.resize((size, size), Image.LANCZOS).save(f'{out}/{name}', optimize=True, **kw)
for s in (1024, 512, 192):
    save(master, f'teacafe-icon-{s}.png', s)
sq = to_rgba(full, np.ones_like(R))
save(sq.convert('RGB'), 'apple-touch-icon.png', 180)
# maskable: content inside the 80% safe zone on paper
pad = Image.new('RGB', (1024, 1024), tuple(int(c * 255) for c in PAPER))
inner = master.resize((820, 820), Image.LANCZOS); pad.paste(inner, (102, 102), inner)
pad.resize((512, 512), Image.LANCZOS).save(f'{out}/teacafe-icon-maskable-512.png', optimize=True)
sm = to_rgba(small, rounded(160))
for s in (48, 32, 16):
    save(sm, f'favicon-{s}.png', s)
sm.resize((256, 256), Image.LANCZOS).save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# share image 1200x630
og = Image.new('RGB', (1200, 630), tuple(int(c * 255) for c in PAPER))
ic = master.resize((520, 520), Image.LANCZOS); og.paste(ic, (340, 55), ic)
og.save(f'{out}/teacafe-og.png', optimize=True)
for f in sorted(os.listdir(out)): print(f, os.path.getsize(f'{out}/{f}') // 1024, 'KB')
