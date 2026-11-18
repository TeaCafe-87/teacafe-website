"""Render a clearly-labelled PLACEHOLDER ink-landscape flight for scroll-scene testing.

This is NOT the Cowork/Blender scene. It exists only so the scroll engine, motion
system and performance tests can run before the real wiki-01 renders arrive.
Every frame carries a 'PLACEHOLDER' watermark and its frame number, so scroll/frame
sync can be checked by eye.

Needs Pillow and imageio-ffmpeg (for the bundled ffmpeg binary).
  python tools/render-placeholder-scene.py            # desktop + mobile, all variants
Outputs go to dist/assets/scenes/wiki-01/ (git-ignored).
"""
import math, random, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

FPS, SECONDS = 30, 6
FRAMES = FPS * SECONDS
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'assets' / 'scenes' / 'wiki-01'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def ridge_fn(seed):
    rnd = random.Random(seed)
    waves = [(rnd.uniform(.002, .006) * k, rnd.uniform(0, 6.3), rnd.uniform(.5, 1) / k) for k in (1, 2.3, 5.1, 11)]
    peak = rnd.uniform(.7, 1.25)
    def h(x):
        v = sum(a * math.sin(x * f + p) for f, p, a in waves)
        return max(0.0, (v * .55 + .55)) * peak
    return h


def render(w, h, folder):
    folder.mkdir(parents=True, exist_ok=True)
    ridges = [(i * 140.0 + 120, ridge_fn(i)) for i in range(14)]  # (world z, height fn)
    try:
        font = ImageFont.truetype('arial.ttf', max(18, h // 36))
    except OSError:
        font = ImageFont.load_default()
    focal = min(w, h) * 1.15
    for f in range(FRAMES):
        t = f / (FRAMES - 1)
        ease = t * t * (3 - 2 * t)
        cam_z = ease * 1100                       # fly forward through the valley
        cam_x = math.sin(t * math.pi * 1.4) * 160  # gentle bank left/right
        cam_y = 70 + ease * 90                    # rise slowly over the ridges
        horizon = h * (.42 - .06 * ease)
        img = Image.new('RGB', (w, h), (238, 232, 216))
        sky = ImageDraw.Draw(img)
        for y in range(int(horizon) + 40):
            k = y / (horizon + 40)
            sky.line([(0, y), (w, y)], fill=(int(214 + 24 * k), int(212 + 20 * k), int(200 + 16 * k)))
        visible = sorted(((z - cam_z, fn, z) for z, fn in ridges if z - cam_z > 40), key=lambda r: -r[0])
        for depth, fn, z in visible:
            scale = focal / depth
            near = min(1.0, (depth - 40) / 220)               # ridges dissolve as the camera passes them
            ink = int(48 + 170 * min(1, depth / 1700))        # far ridges fade into mist
            center = 260 * math.sin(z * .0045)                # the valley meanders left/right
            pts = []
            for sx in range(-8, w + 9, 8):
                wx = (sx - w / 2) / scale + cam_x
                side = min(1.6, (abs(wx - center) / 420) ** 1.4)  # low valley floor, tall walls
                height = (.12 + side) * fn(wx * 1.7 + z) * 300
                pts.append((sx, horizon + (cam_y - height) * scale))
            pts += [(w + 8, h + 8), (-8, h + 8)]
            layer = Image.new('L', (w, h), 0)
            ImageDraw.Draw(layer).polygon(pts, fill=int(255 * near))
            soft = layer.resize((w // 6, h // 6)).filter(ImageFilter.GaussianBlur(.8)).resize((w, h))
            img.paste((ink, ink - 4, ink - 12), mask=soft)
            # mist band resting on the foot of each ridge
            mist = Image.new('L', (w, h), 0)
            base = horizon + cam_y * scale
            ImageDraw.Draw(mist).rectangle([0, base - 90 * scale, w, base + 20 * scale], fill=int(150 * min(1, depth / 700)))
            mist = mist.resize((w // 16, h // 16)).filter(ImageFilter.GaussianBlur(3)).resize((w, h))
            img.paste((236, 231, 218), mask=mist)
        d = ImageDraw.Draw(img)
        d.text((24, h - 24), f'PLACEHOLDER  wiki-01  f{f:03d}/{FRAMES - 1}', fill=(150, 40, 30), font=font, anchor='ls')
        img.save(folder / f'{f + 1:04d}.png')
        if f % 30 == 0:
            print(f'{folder.name}: frame {f}/{FRAMES}', flush=True)


def ffmpeg(*args):
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def encode(src, name, w, gop):
    # H.264 baseline-compatible yuv420p, no audio, moov at front for fast first frame.
    ffmpeg('-framerate', str(FPS), '-i', str(src / '%04d.png'), '-vf', f'scale={w}:-2',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p',
           '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0', '-bf', '0' if gop <= 2 else '2',
           '-movflags', '+faststart', '-an', str(OUT / name))


def frames(src, name, w, quality=72):
    dst = OUT / name
    dst.mkdir(parents=True, exist_ok=True)
    for png in sorted(src.glob('*.png')):
        im = Image.open(png)
        if im.width != w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(dst / (png.stem + '.webp'), 'WEBP', quality=quality, method=5)


if __name__ == '__main__':
    tmp = OUT / '_png'
    variants = sys.argv[1:] or ['desktop', 'mobile']
    for v in variants:
        w, h = (1920, 1080) if v == 'desktop' else (720, 1280)
        render(w, h, tmp / v)
    if 'desktop' in variants:
        for gop in (1, 8, 30):
            encode(tmp / 'desktop', f'desktop-g{gop}.mp4', 1920, gop)
        frames(tmp / 'desktop', 'frames-desktop', 1280)
        shutil.copy(tmp / 'desktop' / '0001.png', OUT / 'poster-desktop.png')
        Image.open(OUT / 'poster-desktop.png').convert('RGB').resize((960, 540)).save(OUT / 'poster-desktop.webp', quality=70)
    if 'mobile' in variants:
        for gop in (1, 8):
            encode(tmp / 'mobile', f'mobile-g{gop}.mp4', 720, gop)
        frames(tmp / 'mobile', 'frames-mobile', 540)
        Image.open(tmp / 'mobile' / '0001.png').convert('RGB').resize((360, 640)).save(OUT / 'poster-mobile.webp', quality=70)
    shutil.rmtree(tmp, ignore_errors=True)
    for p in sorted(OUT.iterdir()):
        size = p.stat().st_size if p.is_file() else sum(x.stat().st_size for x in p.iterdir())
        print(f'{p.name:24s} {size / 1048576:6.2f} MiB')
