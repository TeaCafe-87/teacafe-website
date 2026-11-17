"""TeaCafe journey video — procedural ink-landscape painting (shan shui).

Builds the painting as separate depth layers (foreground rocks & pines,
near hills + lake + boat, mid ranges, main peak, far ranges, mist bands,
sky/paper) so render.py can move a camera *into* the scene with true
parallax instead of enlarging one flat image.

Style: literati ink-wash landscape — warm paper, mineral blue-grey
washes with tea-ochre accents, graded 沒骨 fills whose bases dissolve
into mist, a darker 勾勒 line along each ridge, plenty of empty paper.
All geometry is value-noise driven and deterministic (seeded); no
external artwork is used.

Coordinates: layers are painted on a padded canvas (PAD on each side of
the 1920x1080 base view, at OVERSAMPLE resolution).  vx()/vy() convert
*visible-view* fractions into layer pixels; everything is placed with
those, so composition fractions mean what they say on screen at t=0.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

RNG = np.random.default_rng(20261117)

VIEW_W, VIEW_H = 1920, 1080
PAD = 0.30                       # padding fraction on each side of the base view
OVERSAMPLE = 2.0                 # layer pixels per base-view pixel

LAY_W = int(VIEW_W * (1 + 2 * PAD) * OVERSAMPLE)   # 6144
LAY_H = int(VIEW_H * (1 + 2 * PAD) * OVERSAMPLE)   # 3456
OX = int(VIEW_W * PAD * OVERSAMPLE)                # origin of base view inside layer
OY = int(VIEW_H * PAD * OVERSAMPLE)
S = OVERSAMPLE

def vx(f):  # view fraction -> layer px (x)
    return OX + f * VIEW_W * S

def vy(f):  # view fraction -> layer px (y)
    return OY + f * VIEW_H * S

def vw(f):  # view-width fraction -> px
    return f * VIEW_W * S

def vh(f):  # view-height fraction -> px
    return f * VIEW_H * S

# per-column view fraction for the whole layer width (goes <0 / >1 in padding)
U = (np.arange(LAY_W) - OX) / (VIEW_W * S)

PAPER_TOP = np.array([245, 239, 226], float)
PAPER_BOT = np.array([237, 229, 212], float)
INK = {
    "far":   (174, 183, 192),
    "far2":  (150, 162, 174),
    "mid":   (106, 123, 138),
    "peak":  (84, 102, 120),
    "near":  (64, 74, 86),
    "fg":    (38, 44, 52),
    "ochre": (181, 139, 90),
}
MIST = (247, 242, 230)


def value_noise_1d(n, octaves=4, persistence=0.55, seed=None):
    rng = np.random.default_rng(seed) if seed is not None else RNG
    out = np.zeros(n)
    amp, freq = 1.0, 4
    for _ in range(octaves):
        pts = rng.standard_normal(freq + 1)
        xs = np.linspace(0, freq, n)
        i = np.clip(xs.astype(int), 0, freq - 1)
        f = xs - i
        f = f * f * (3 - 2 * f)
        out += amp * ((1 - f) * pts[i] + f * pts[i + 1])
        amp *= persistence
        freq *= 2
    return out


def value_noise_2d(w, h, cell, octaves=3, persistence=0.5, seed=None):
    rng = np.random.default_rng(seed) if seed is not None else RNG
    out = np.zeros((h, w))
    amp = 1.0
    c = cell
    for _ in range(octaves):
        gw, gh = max(2, int(w / c)), max(2, int(h / c))
        grid = rng.random((gh, gw))
        img = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
        out += amp * (np.asarray(img, float) / 255.0)
        amp *= persistence
        c = max(2, c / 2)
    out -= out.min()
    out /= max(out.max(), 1e-6)
    return out


def noise_image(w, h, cell, octaves, seed, down=4):
    n = value_noise_2d(w // down, h // down, cell=cell, octaves=octaves, seed=seed)
    return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), float) / 255


def new_layer():
    return np.zeros((LAY_H, LAY_W, 4), float)


def composite_onto(base, rgba):
    a = rgba[..., 3:4]
    base[..., :3] = rgba[..., :3] * a + base[..., :3] * (1 - a)
    base[..., 3:4] = a + base[..., 3:4] * (1 - a)


def to_image(layer):
    out = layer.copy()
    out[..., :3] = np.clip(out[..., :3], 0, 255)
    out[..., 3] = np.clip(out[..., 3], 0, 1) * 255
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def ridge_profile(base_y, amp, octaves, seed, peaks=()):
    """Ridge height (layer px) per column.  peaks: (view_x_frac, h_px, w_px, sharp)."""
    n = value_noise_1d(LAY_W, octaves=octaves, seed=seed)
    n = (n - n.mean()) / max(np.abs(n).max(), 1e-6)
    y = base_y - n * amp
    xs = np.arange(LAY_W)
    for (pxf, ph, pw, sharp) in peaks:
        d = (xs - vx(pxf)) / pw
        y -= ph * np.exp(-np.abs(d) ** sharp)
    return y


def paint_range(layer, ridge_y, color, top_alpha, fade_len, grain=0.0,
                edge=0.0, ochre_mix=0.0, streak=0.0, seed=0):
    """Graded wash below the ridge, dissolving over fade_len px."""
    h, w = LAY_H, LAY_W
    yy = np.arange(h)[:, None].astype(float)
    ry = ridge_y[None, :]
    depth = yy - ry
    dpos = np.clip(depth, 0, None)
    alpha = np.where(depth < 0, 0.0, top_alpha * np.exp(-dpos / fade_len))
    alpha *= np.clip(depth + 1.5, 0, 1.5) / 1.5          # ridge antialias
    if grain:
        g = noise_image(w, h, cell=22, octaves=3, seed=seed + 7)
        alpha *= (1 - grain) + grain * (0.4 + 0.85 * g)
    if streak:
        # 斧劈皴: variation across x, long down y, only in patches of the slope
        rngs = np.random.default_rng(seed + 21)
        grid = rngs.random((max(2, h // 640), max(2, w // 52)))
        stn = np.asarray(Image.fromarray((grid * 255).astype(np.uint8))
                         .resize((w, h), Image.BILINEAR), float) / 255
        patch = np.clip((noise_image(w, h, cell=12, octaves=2, seed=seed + 23, down=8) - 0.4) * 2.2, 0, 1)
        reach = np.exp(-dpos / (fade_len * 1.1))
        alpha *= np.clip(1 + streak * (stn - 0.5) * 2 * reach * patch, 0, 1.4)
    col = np.array(color, float)
    rgb = np.empty((h, w, 3))
    if ochre_mix:
        m = noise_image(w, h, cell=9, octaves=2, seed=seed + 13, down=6)
        m = np.clip((m - 0.56) * 3.2, 0, 1) * ochre_mix
        oc = np.array(INK["ochre"], float)
        rgb[:] = col[None, None, :] * (1 - m[..., None]) + oc[None, None, :] * m[..., None]
    else:
        rgb[:] = col[None, None, :]
    # pigment thins into the paper at the base: colour drifts toward mist so
    # overlapping ranges read as atmosphere rather than stained glass
    thin = (1 - np.exp(-dpos / (fade_len * 1.3))) ** 1.4 * 0.75
    rgb = rgb * (1 - thin[..., None]) + np.array(MIST, float)[None, None, :] * thin[..., None]
    if edge:
        line = np.exp(-dpos / (5.5 * S)) * (depth >= 0)
        alpha = np.clip(alpha + edge * line * top_alpha, 0, 1)
        rgb = rgb * (1 - 0.4 * line[..., None]) + np.array([32, 36, 42])[None, None, :] * (0.4 * line[..., None])
    composite_onto(layer, np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], axis=2))


def mist_band(center_frac, thickness_frac, strength, seed, extra_w=1.5):
    """RGBA mist strip (wider than the layer, for horizontal drift)."""
    w2 = int(LAY_W * extra_w)
    n = noise_image(w2, LAY_H, cell=20, octaves=2, seed=seed, down=8)
    yy = np.arange(LAY_H)[:, None].astype(float)
    wave = value_noise_1d(w2, octaves=3, seed=seed + 1)
    wave = (wave - wave.mean()) / max(np.abs(wave).max(), 1e-6)
    cy = vy(center_frac) + wave[None, :] * vh(0.035)      # the band meanders
    th = vh(thickness_frac)
    dy = yy - cy
    band = np.where(dy < 0, np.exp(-dy ** 2 / (2 * (th * 0.75) ** 2)),
                    np.exp(-dy ** 2 / (2 * (th * 1.7) ** 2)))
    alpha = strength * band * (0.62 + 0.5 * n)
    rgb = np.empty((LAY_H, w2, 3))
    rgb[:] = np.array(MIST, float)[None, None, :]
    return to_image(np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], axis=2))


def needle_pad(draw, cx, cy, pw, ink, rng):
    """One foliage pad: a row of small overlapping ellipses, dense centre."""
    n = max(4, int(pw / (3.5 * S)))
    for i in range(n):
        k = i / max(n - 1, 1) * 2 - 1                    # -1..1 across the pad
        ex = cx + k * pw * 0.5
        ey = cy + abs(k) * pw * 0.1 + rng.uniform(-0.5, 0.5) * S
        er = pw * (0.16 - 0.07 * abs(k)) + rng.uniform(0, 1.2) * S
        a = int(170 - 70 * abs(k) + rng.integers(0, 30))
        draw.ellipse([ex - er, ey - er * 0.45, ex + er, ey + er * 0.45], fill=(*ink, a))


def draw_pine(draw, x, y, h, rng, ink=(34, 39, 46)):
    """A literati pine: leaning trunk with flat layered needle pads."""
    lean = rng.uniform(-0.25, 0.25)
    segs = 7
    px, py = x, y
    pts = [(px, py)]
    for _ in range(segs):
        px += lean * h / segs + rng.uniform(-1, 1) * h * 0.02
        py -= h / segs
        pts.append((px, py))
    for i in range(segs):
        draw.line([pts[i], pts[i + 1]], fill=(*ink, 235), width=int(max(1.2 * S, (segs - i) * 0.5 * S)))
    for i in range(3, segs):
        if rng.random() < 0.8:
            bx, by = pts[i]
            side = -1 if rng.random() < 0.5 else 1
            blen = h * rng.uniform(0.18, 0.3) * (1 - i / (segs + 3))
            ex, ey = bx + side * blen, by - blen * rng.uniform(0.1, 0.3)
            draw.line([(bx, by), (ex, ey)], fill=(*ink, 220), width=int(1.3 * S))
            needle_pad(draw, ex, ey, blen * rng.uniform(1.1, 1.5), ink, rng)
    needle_pad(draw, pts[-1][0], pts[-1][1], h * rng.uniform(0.3, 0.42), ink, rng)


def side_fade(ridge, base, ramp, seed):
    """Sink the ridge below paint level where ramp->1: noisy border, then a
    1-D blur so the sunken slope never reads as a vertical cliff on zoom."""
    j = value_noise_1d(LAY_W, octaves=3, seed=seed)
    j = (j - j.mean()) / max(np.abs(j).max(), 1e-6)
    r = np.clip(ramp + j * 0.14, 0, 1)
    r = r * r * (3 - 2 * r)
    out = ridge * (1 - r) + (base + vh(0.25)) * r
    k = int(vw(0.012)) | 1
    kernel = np.exp(-np.linspace(-2, 2, k) ** 2)
    kernel /= kernel.sum()
    return np.convolve(out, kernel, mode="same")


def rock_mass(layer, cx_frac, base_frac, w_frac, h_frac, color, seed, alpha=0.95):
    """Foreground rock: jagged ridged profile, textured wash, clipped to its span."""
    rng = np.random.default_rng(seed)
    cx, base_y = vx(cx_frac), vy(base_frac)
    w, hgt = vw(w_frac), vh(h_frac)
    x0c, x1c = max(int(cx - w / 2), 0), min(int(cx + w / 2), LAY_W)
    width = x1c - x0c
    if width <= 0:
        return
    prof = 1 - np.abs(value_noise_1d(width, octaves=5, seed=seed))      # ridged noise
    prof = (prof - prof.min()) / max(np.ptp(prof), 1e-6)
    dome = np.sin(np.linspace(0.12, np.pi - 0.12, width)) ** 0.55
    top = base_y - (0.5 * prof ** 1.6 + 0.6 * dome) * hgt
    ridge = np.full(LAY_W, base_y + vh(0.5))
    ridge[x0c:x1c] = top
    sub = new_layer()
    paint_range(sub, ridge, color, top_alpha=alpha, fade_len=hgt * 2.5, grain=0.5, edge=0.45,
                streak=0.5, seed=seed)
    mask = np.zeros((LAY_H, LAY_W))
    yy = np.arange(LAY_H)[:, None]
    mask[:, x0c:x1c] = (yy >= top[None, :] - 2)
    sub[..., 3] *= mask
    composite_onto(layer, sub)


def birds(draw, cx_frac, cy_frac, count, size, seed):
    rng = np.random.default_rng(seed)
    cx, cy = vx(cx_frac), vy(cy_frac)
    for _ in range(count):
        bx = cx + rng.uniform(-13, 13) * size
        by = cy + rng.uniform(-5, 5) * size
        s = size * rng.uniform(0.5, 1.1)
        a = int(rng.integers(120, 185))
        draw.arc([bx - 2 * s, by - s * 0.6, bx, by + s * 0.8], 200, 340, fill=(60, 66, 74, a), width=int(0.9 * S))
        draw.arc([bx, by - s * 0.6, bx + 2 * s, by + s * 0.8], 260, 40, fill=(60, 66, 74, a), width=int(0.9 * S))


def boat(draw, x_frac, y_frac, s):
    """Small skiff with a standing boatman, plus faint reflection strokes."""
    x, y = vx(x_frac), vy(y_frac)
    ink = (46, 52, 60)
    draw.arc([x - 10 * s, y - 8 * s, x + 10 * s, y + 4 * s], 20, 160, fill=(*ink, 245), width=int(1.7 * s))
    draw.line([(x - 8.8 * s, y - 1.6 * s), (x + 8.8 * s, y - 1.6 * s)], fill=(*ink, 245), width=int(1.2 * s))
    draw.line([(x - 1.6 * s, y - 1.8 * s), (x - 1.6 * s, y - 6.4 * s)], fill=(*ink, 235), width=int(1.1 * s))
    draw.ellipse([x - 2.6 * s, y - 8.0 * s, x - 0.6 * s, y - 6.0 * s], fill=(*ink, 225))
    draw.line([(x + 1.2 * s, y - 2 * s), (x + 4.6 * s, y - 7.6 * s)], fill=(*ink, 200), width=int(0.8 * s))
    draw.line([(x - 7 * s, y + 3.0 * s), (x + 7 * s, y + 3.0 * s)], fill=(*ink, 55), width=int(0.8 * s))
    draw.line([(x - 4 * s, y + 5.0 * s), (x + 4 * s, y + 5.0 * s)], fill=(*ink, 32), width=int(0.8 * s))


# ---------------------------------------------------------------- layers

def make_sky():
    h, w = LAY_H, LAY_W
    t = (np.arange(h) / h)[:, None, None]
    rgb = PAPER_TOP[None, None, :] * (1 - t) + PAPER_BOT[None, None, :] * t
    n = noise_image(w, h, cell=10, octaves=2, seed=3, down=8)
    rgb = rgb + (n[..., None] - 0.5) * 5
    return to_image(np.concatenate([rgb, np.ones((h, w, 1))], axis=2))


def make_far(seed, base_frac, amp_frac, color, top_alpha, fade_frac, peaks=()):
    layer = new_layer()
    ridge = ridge_profile(vy(base_frac), vh(amp_frac), octaves=4, seed=seed, peaks=peaks)
    paint_range(layer, ridge, color, top_alpha=top_alpha, fade_len=vh(fade_frac),
                grain=0.12, seed=seed)
    return to_image(layer)


def make_mid(seed, side):
    """Mid-ground range weighted to one side so the camera passes between."""
    layer = new_layer()
    c = 0.16 if side == "left" else 0.86
    peaks = [(c, vh(0.26), vw(0.085), 1.7),
             (c + (0.13 if side == "left" else -0.12), vh(0.15), vw(0.07), 1.9),
             (c + (0.06 if side == "left" else -0.055), vh(0.19), vw(0.045), 1.6),
             (c - (0.12 if side == "left" else -0.1), vh(0.1), vw(0.06), 2.1)]
    base = vy(0.70)
    ridge = ridge_profile(base, vh(0.034), octaves=5, seed=seed, peaks=peaks)
    ramp = np.clip((U - (c + 0.3)) / 0.32, 0, 1) if side == "left" else np.clip(((c - 0.3) - U) / 0.32, 0, 1)
    ridge = side_fade(ridge, base, ramp, seed + 31)
    paint_range(layer, ridge, INK["mid"], top_alpha=0.9, fade_len=vh(0.17),
                grain=0.4, edge=0.3, ochre_mix=0.5, streak=0.3, seed=seed)
    return to_image(layer)


def make_main_peak(seed):
    layer = new_layer()
    c = 0.6
    peaks = [(c, vh(0.42), vw(0.055), 1.45),
             (c - 0.07, vh(0.2), vw(0.05), 1.8),
             (c + 0.075, vh(0.16), vw(0.045), 1.9)]
    base = vy(0.66)
    ridge = ridge_profile(base, vh(0.016), octaves=5, seed=seed, peaks=peaks)
    ramp = np.clip((np.abs(U - c) - 0.17) / 0.26, 0, 1)
    ridge = side_fade(ridge, base, ramp, seed + 31)
    paint_range(layer, ridge, INK["peak"], top_alpha=0.94, fade_len=vh(0.2),
                grain=0.45, edge=0.38, ochre_mix=0.55, streak=0.35, seed=seed)
    img = to_image(layer)
    birds(ImageDraw.Draw(img, "RGBA"), 0.4, 0.17, 9, 4.2 * S, seed + 5)
    return img


def make_near(seed):
    """Near hills left+right, lake wash between, boat on the water."""
    layer = new_layer()
    for i, (cx, hgt) in enumerate(((0.08, 0.2), (0.95, 0.15))):
        peaks = [(cx, vh(hgt), vw(0.08), 1.6),
                 (cx + (0.11 if i == 0 else -0.1), vh(hgt * 0.45), vw(0.055), 1.9)]
        base = vy(0.84)
        ridge = ridge_profile(base, vh(0.012), octaves=5, seed=seed + i * 3, peaks=peaks)
        ramp = np.clip((np.abs(U - cx) - 0.18) / 0.24, 0, 1)
        ridge = side_fade(ridge, base, ramp, seed + i * 3 + 31)
        paint_range(layer, ridge, INK["near"], top_alpha=0.92, fade_len=vh(0.15),
                    grain=0.5, edge=0.4, ochre_mix=0.4, streak=0.35, seed=seed + i * 3)
    img = to_image(layer)
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(seed + 11)
    for _ in range(22):                                   # calm ripple strokes
        y = vy(rng.uniform(0.82, 0.96))
        x = vx(rng.uniform(0.28, 0.76))
        ln = vw(rng.uniform(0.02, 0.06))
        a = int(26 + 46 * rng.random())
        d.line([(x - ln / 2, y), (x + ln / 2, y)], fill=(98, 110, 120, a), width=int(1.0 * S))
    boat(d, 0.56, 0.875, 3.0 * S)
    for _ in range(3):
        draw_pine(d, vx(rng.uniform(0.03, 0.12)), vy(rng.uniform(0.66, 0.7)), vh(rng.uniform(0.05, 0.065)), rng)
    return img


def make_foreground(seed):
    """Dark corner rocks + pines that sweep past the viewer first."""
    layer = new_layer()
    rock_mass(layer, 0.04, 1.06, 0.4, 0.26, INK["fg"], seed)
    rock_mass(layer, 0.98, 1.09, 0.34, 0.2, INK["fg"], seed + 2)
    img = to_image(layer)
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(seed + 4)
    draw_pine(d, vx(0.075), vy(0.9), vh(0.19), rng)
    draw_pine(d, vx(0.012), vy(0.95), vh(0.13), rng)
    draw_pine(d, vx(0.945), vy(0.97), vh(0.13), rng)
    return img


def build_all():
    """Full layer stack, far to near, with camera depths and fade windows."""
    far1 = make_far(101, 0.5, 0.055, INK["far"], 0.42, 0.055,
                    peaks=[(0.28, vh(0.14), vw(0.05), 1.7), (0.78, vh(0.17), vw(0.045), 1.6)])
    far2 = make_far(102, 0.55, 0.05, INK["far2"], 0.55, 0.065,
                    peaks=[(0.45, vh(0.16), vw(0.055), 1.7), (0.06, vh(0.11), vw(0.05), 1.9)])
    return [
        dict(name="sky",   img=make_sky(),            depth=None, fade=None),
        dict(name="far1",  img=far1,                  depth=7.0,  fade=(3.4, 4.8)),
        dict(name="mist1", img=mist_band(0.5, 0.05, 0.8, 201), depth=6.0, fade=(2.6, 4.0), mist=True, drift=24),
        dict(name="far2",  img=far2,                  depth=5.5,  fade=(3.2, 4.6)),
        dict(name="peak",  img=make_main_peak(105),   depth=3.9,  fade=(2.6, 3.6)),
        dict(name="mist2", img=mist_band(0.63, 0.06, 0.85, 202), depth=4.5, fade=(2.8, 4.2), mist=True, drift=40),
        dict(name="midL",  img=make_mid(103, "left"), depth=3.4,  fade=(2.6, 3.8)),
        dict(name="midR",  img=make_mid(104, "right"),depth=3.15, fade=(2.6, 3.8)),
        dict(name="near",  img=make_near(106),        depth=2.3,  fade=(2.2, 3.3)),
        dict(name="mist3", img=mist_band(0.84, 0.06, 0.75, 203), depth=2.0, fade=(2.4, 3.6), mist=True, drift=60),
        dict(name="fg",    img=make_foreground(107),  depth=1.35, fade=(1.7, 2.7)),
    ]
