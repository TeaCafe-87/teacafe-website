"""TeaCafe journey v2 — 2.5D camera through the Art-Of-Ink painting.

usage:
  python3 render.py preview desktop|portrait [p1 p2 ...]   -> work/preview/<fmt>_<p>.jpg
  python3 render.py encode  desktop|portrait OUT.mp4        -> video + OUT.camera.json

Projection (all layers share it):
  a point (u, v) of a layer at depth D, camera (cxw, cyw, Zc, zoom):
    x = W/2 + s0*zoom * ((u - UC)*D - cxw) / (D - Zc)
    y = H/2 + s0*zoom * ((v - VC)*D - cyw) / (D - Zc)
The overlay script uses exactly the same formula with the exported
per-frame camera, so live elements (waterfall flow, boat, birds) sit on
the video's painting.

The film contains only camera motion of still layers: nothing moves on
its own, so scrubbing backwards never makes water run uphill.
"""
import json, os, subprocess, sys, time
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator

UC, VC = 791.5, 400.0
P = (226, 213, 189)
FPS = 30
DUR = 24.0
NF = int(FPS * DUR)

FORMATS = {
    'desktop':  dict(W=1600, H=900, s0=1600 / 1583, cx=UC, cy=VC),
    'portrait': dict(W=810, H=1440, s0=1.62, cx=800.0, cy=VC),
}

# Keyframes: p, Zc, zoom, (D, u, v) look target placed at screen (sx, sy).
KEYS = {
    'desktop': [
        (0.000, 0.00, 1.00, (4.6, UC, VC), (0.50, 0.50)),
        (0.050, 0.18, 1.00, (2.8, 760, 412), (0.50, 0.50)),
        (0.165, 1.90, 1.00, (2.8, 642, 432), (0.50, 0.50)),
        (0.235, 2.95, 1.10, (2.8, 640, 428), (0.50, 0.50)),
        (0.310, 3.33, 1.58, (12.0, 342, 285), (0.27, 0.50)),
        (0.410, 3.42, 1.64, (12.0, 342, 287), (0.27, 0.50)),
        (0.495, 3.52, 1.30, (4.6, 800, 470), (0.50, 0.46)),
        (0.580, 3.62, 1.12, (4.6, 870, 532), (0.70, 0.56)),
        (0.670, 3.66, 1.15, (4.6, 870, 532), (0.70, 0.56)),
        (0.780, 3.69, 1.05, (4.6, 905, 330), (0.44, 0.50)),
        (0.880, 3.72, 0.86, (4.6, 915, 170), (0.27, 0.64)),
        (1.000, 3.76, 0.88, (4.6, 915, 170), (0.27, 0.64)),
    ],
    'portrait': [
        (0.000, 0.00, 1.00, (4.6, 800, VC), (0.50, 0.50)),
        (0.050, 0.18, 1.00, (2.8, 760, 412), (0.50, 0.50)),
        (0.165, 1.90, 1.00, (2.8, 642, 432), (0.50, 0.47)),
        (0.235, 2.95, 1.06, (2.8, 640, 428), (0.50, 0.42)),
        (0.310, 3.33, 1.18, (12.0, 350, 268), (0.50, 0.25)),
        (0.410, 3.42, 1.22, (12.0, 350, 270), (0.50, 0.25)),
        (0.495, 3.52, 1.05, (4.6, 820, 470), (0.50, 0.27)),
        (0.580, 3.62, 0.76, (4.6, 868, 530), (0.54, 0.27)),
        (0.670, 3.66, 0.78, (4.6, 868, 530), (0.54, 0.27)),
        (0.780, 3.69, 0.66, (4.6, 905, 330), (0.50, 0.28)),
        (0.880, 3.72, 0.52, (4.6, 915, 172), (0.48, 0.27)),
        (1.000, 3.76, 0.54, (4.6, 915, 172), (0.48, 0.27)),
    ],
}

# Half-blank composition: paper wash over the content side.
WASH = {
    'desktop': [  # (p_in0, p_in1, p_out0, p_out1, side)
        (0.255, 0.310, 0.410, 0.470, 'right'),
        (0.515, 0.580, 0.670, 0.735, 'left'),
        (0.810, 0.880, 1.10, 1.20, 'right'),
    ],
    'portrait': [
        (0.255, 0.310, 0.410, 0.470, 'bottom'),
        (0.515, 0.580, 0.670, 0.735, 'bottom'),
        (0.810, 0.880, 1.10, 1.20, 'bottom'),
    ],
}

CLOUD_GATE = (0.69, 0.77)
FALL_GATE = (0.10, 0.22)          # act 1 is the untouched painting; the waterfall appears on the way in
# cloud rims (cloud image coords) and where they should sit on screen at the act-4 key
CLOUD_RIM = {'cloud_front': (132, 60, 4.55), 'cloud_back': (318, 220, 7.0)}
RIM_TARGET = {'desktop': {'cloud_front': 0.80, 'cloud_back': 0.70},
              'portrait': {'cloud_front': 0.44, 'cloud_back': 0.36}}
P_ACT4 = 0.88


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def camera_track(fmt):
    F = FORMATS[fmt]
    W, H, s0 = F['W'], F['H'], F['s0']
    ps, rows = [], []
    for p, zc, zoom, (D, u, v), (sx, sy) in KEYS[fmt]:
        S = s0 * zoom
        cxw = (u - UC) * D - (sx * W - W / 2) * (D - zc) / S
        cyw = (v - VC) * D - (sy * H - H / 2) * (D - zc) / S
        ps.append(p)
        rows.append((cxw, cyw, zc, zoom))
    rows = np.array(rows)
    t = np.linspace(0, 1, NF)
    out = np.stack([PchipInterpolator(ps, rows[:, i])(t) for i in range(4)], 1)
    return out  # per frame: cxw, cyw, Zc, zoom


def wash_strength(fmt, p):
    res = []
    for a0, a1, b0, b1, side in WASH[fmt]:
        w = smooth((p - a0) / (a1 - a0)) * (1 - smooth((p - b0) / (b1 - b0)))
        if w > 0:
            res.append((side, w))
    return res


class Card:
    """A painted layer at one depth, with a small mip pyramid."""
    LEVELS = (8, 5.66, 4, 2.83, 2, 1.41, 1)

    def __init__(self, path, depth, native=4, off=(0, 0), gain=None, gate=None, mask=None, name=''):
        img = Image.open(path).convert('RGBA')
        arr = np.asarray(img).copy()
        a = arr[..., 3]
        arr[..., :3][a < 3] = P                      # clean colour under zero alpha
        if mask is not None:
            arr[..., 3] = (a.astype(np.float32) * mask).astype(np.uint8)
        img = Image.fromarray(arr, 'RGBA')
        self.depth, self.off, self.gain, self.gate, self.name = depth, off, gain, gate, name
        self.mips = {}
        for L in self.LEVELS:
            if L > native:
                continue
            if L == native:
                self.mips[L] = img
            else:
                f = L / native
                self.mips[L] = img.resize((max(1, int(img.width * f)), max(1, int(img.height * f))), Image.LANCZOS)

    def draw(self, canvas, cam, F, p):
        cxw, cyw, zc, zoom = cam
        D = self.depth
        if D - zc < 0.06:
            return None
        a = F['s0'] * zoom * D / (D - zc)          # screen px per original px
        ox = F['W'] / 2 + F['s0'] * zoom * (-UC * D - cxw) / (D - zc)
        oy = F['H'] / 2 + F['s0'] * zoom * (-VC * D - cyw) / (D - zc)
        alpha_mul = 1.0
        if self.gate:
            alpha_mul *= smooth((p - self.gate[0]) / (self.gate[1] - self.gate[0]))
        if self.gain:
            alpha_mul *= self.gain(D / (D - zc))
        if alpha_mul <= 0.003:
            return None
        # pick the level that is at least as dense as the screen
        Ls = sorted(self.mips)
        L = next((l for l in Ls if l >= a), Ls[-1])
        src = self.mips[L]
        # visible window check (skip if fully outside)
        u0 = (0 - ox) / a; u1 = (F['W'] - ox) / a
        v0 = (0 - oy) / a; v1 = (F['H'] - oy) / a
        lu0, lv0 = self.off
        lu1, lv1 = lu0 + src.width / L, lv0 + src.height / L
        if u1 < lu0 or u0 > lu1 or v1 < lv0 or v0 > lv1:
            return None
        k = L / a
        data = (k, 0, (-ox / a - lu0) * L, 0, k, (-oy / a - lv0) * L)
        layer = src.transform((F['W'], F['H']), Image.AFFINE, data, resample=Image.BICUBIC, fillcolor=(*P, 0))
        if abs(alpha_mul - 1) > 0.003:
            A = layer.getchannel('A').point(lambda x, m=alpha_mul: min(255, int(x * m + 0.5)))
            layer.putalpha(A)
        canvas.alpha_composite(layer)
        return layer.getchannel('A')


def aerial(max_gain, power):
    # nearer than painted -> stronger ink (less atmosphere)
    return lambda ratio: min(max_gain, max(1.0, ratio) ** power)


def place_clouds(cards, fmt, track):
    """Shift each cloud bank so its rim lands at the wanted screen height (and
    is centred on the view) at the act-4 keyframe of this format."""
    F = FORMATS[fmt]
    cxw, cyw, zc, zoom = track[int(round(P_ACT4 * (NF - 1)))]
    for c in cards:
        if c.name not in CLOUD_RIM:
            continue
        rim_v, v0, D = CLOUD_RIM[c.name]
        S = F['s0'] * zoom
        y_t = RIM_TARGET[fmt][c.name] * F['H']
        v_rim = VC + ((y_t - F['H'] / 2) * (D - zc) / S + cyw) / D
        u_c = UC + cxw / D
        half = (F['W'] / 2) * (D - zc) / (S * D)
        L = max(c.mips)
        width = c.mips[L].width / L
        c.off = (u_c - width / 2, v0 + (v_rim - rim_v))
        print(f'{c.name}: rim v={v_rim:.1f} view u {u_c - half:.0f}..{u_c + half:.0f} card u {c.off[0]:.0f}..{c.off[0] + width:.0f}')


def build_cards():
    L = 'work/layers/'
    water = np.asarray(Image.open(L + 'water.png'))
    cards = [
        Card(L + 'far.png', 12.0, gain=aerial(2.3, 1.7), name='far'),
        Card(L + 'fall.png', 11.99, off=(250, 150), gain=aerial(1.5, 1.0), gate=FALL_GATE, name='fall'),
        Card(L + 'cloud_back.png', 7.0, native=4, off=(300, 220), gate=CLOUD_GATE, name='cloud_back'),
        Card(L + 'mid.png', 7.0, gain=aerial(1.6, 0.8), name='mid'),
        Card(L + 'main.png', 4.6, name='main'),
        Card(L + 'cloud_front.png', 4.55, native=7, off=(560, 60), gate=CLOUD_GATE, name='cloud_front'),
        Card(L + 'near_right.png', 3.5, name='near_right'),
        Card(L + 'near_left.png', 2.8, name='near_left'),
    ]
    # water as a ground plane: horizontal strips, nearer toward the bottom
    H4 = water.shape[0]
    vv = np.arange(H4) / 4.0
    bands = [(600, 650, 2.6), (640, 700, 2.15), (690, 750, 1.75), (740, 800, 1.45)]
    for v0, v1, d in bands:
        m = np.clip((vv - v0 + 10) / 10, 0, 1) * np.clip((v1 + 10 - vv) / 10, 0, 1)
        cards.append(Card(L + 'water.png', d, mask=m[:, None], name=f'water{d}'))
    cards.sort(key=lambda c: -c.depth)
    return cards


def make_grain(F, seed=5):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((F['H'], F['W'])).astype(np.float32)
    from scipy.ndimage import gaussian_filter
    n = gaussian_filter(n, 0.7) * 2.6 + gaussian_filter(rng.standard_normal((F['H'], F['W'])).astype(np.float32), 3) * 2.0
    return n


BIRD_DEPTH = 6.0
OCC_GRID = {'desktop': (32, 18), 'portrait': (18, 32)}
FALL_PTS = [(326.5, 190), (327.5, 215), (328.5, 238), (330, 265), (331, 295), (332, 325), (333, 355), (333.6, 385)]


def project(F, cam, u, v, D):
    cxw, cyw, zc, zoom = cam
    S = F['s0'] * zoom
    return (F['W'] / 2 + S * ((u - UC) * D - cxw) / (D - zc), F['H'] / 2 + S * ((v - VC) * D - cyw) / (D - zc))


def frame(fmt, cards, cam, p, grain, occ_out=None):
    F = FORMATS[fmt]
    canvas = Image.new('RGBA', (F['W'], F['H']), (*P, 255))
    keep6, keep12 = None, None
    for c in cards:
        A = c.draw(canvas, cam, F, p)
        if A is None or occ_out is None:
            continue
        a = np.asarray(A, np.float32) / 255
        if c.depth < 11.9:
            keep12 = a if keep12 is None else 1 - (1 - keep12) * (1 - a)
        if c.depth < BIRD_DEPTH:
            keep6 = a if keep6 is None else 1 - (1 - keep6) * (1 - a)
    if occ_out is not None:
        gw, gh = OCC_GRID[fmt]
        g = np.zeros((gh, gw)) if keep6 is None else np.asarray(
            Image.fromarray((keep6 * 255).astype(np.uint8)).resize((gw, gh), Image.BOX), np.float32) / 255
        occ_out['occ'] = ''.join(str(min(9, int(x * 9.99))) for x in g.ravel())
        vis = []
        for (u, v) in FALL_PTS:
            x, y = project(F, cam, u, v, 12.0)
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < F['W'] and 0 <= yi < F['H']:
                vis.append(1.0 if keep12 is None else 1 - float(keep12[yi, xi]))
        occ_out['fall'] = round(float(np.mean(vis)) if vis else 0.0, 2)
    out = np.asarray(canvas.convert('RGB'), np.float32)
    W, H = F['W'], F['H']
    for side, w in wash_strength(fmt, p):
        if side in ('left', 'right'):
            x = np.arange(W) / W
            m = smooth((x - 0.40) / 0.22) if side == 'right' else 1 - smooth((x - 0.38) / 0.22)
            m = m[None, :]
        else:
            y = np.arange(H) / H
            m = smooth((y - 0.44) / 0.16)[:, None]
        m = m * w * 0.94
        out = out * (1 - m[..., None]) + np.array([241, 234, 219], np.float32) * m[..., None]
    out += grain[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    mode, fmt = sys.argv[1], sys.argv[2]
    F = FORMATS[fmt]
    t0 = time.time()
    cards = build_cards()
    print(f'cards ready {time.time() - t0:.0f}s', flush=True)
    track = camera_track(fmt)
    place_clouds(cards, fmt, track)
    grain = make_grain(F)
    if mode == 'preview':
        os.makedirs('work/preview', exist_ok=True)
        ps = [float(x) for x in sys.argv[3:]] or [0, 0.12, 0.2, 0.31, 0.45, 0.6, 0.78, 0.9]
        for p in ps:
            i = int(round(p * (NF - 1)))
            Image.fromarray(frame(fmt, cards, track[i], i / (NF - 1), grain)).save(
                f'work/preview/{fmt}_{int(p * 1000):04d}.jpg', quality=90)
            print('p', p, flush=True)
    elif mode == 'encode':
        out = sys.argv[3]
        tmp = out + '.tmp.mp4'
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f"{F['W']}x{F['H']}", '-r', str(FPS), '-i', '-',
               '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
               '-x264-params', 'keyint=4:min-keyint=4:scenecut=0',
               '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', tmp]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        occ_rows, fall_rows = [], []
        for i in range(NF):
            o = {}
            proc.stdin.write(frame(fmt, cards, track[i], i / (NF - 1), grain, o).tobytes())
            occ_rows.append(o['occ']); fall_rows.append(o['fall'])
            if i % 60 == 0:
                print(f'{fmt} frame {i}/{NF} {time.time() - t0:.0f}s', flush=True)
        proc.stdin.close()
        if proc.wait() != 0:
            sys.exit('ffmpeg failed')
        os.replace(tmp, out)
        cam = {
            'fps': FPS, 'frames': NF, 'width': F['W'], 'height': F['H'], 's0': F['s0'],
            'uc': UC, 'vc': VC,
            'track': [[round(float(x), 3) for x in r] for r in track],
            'wash': WASH[fmt],
            'fallGate': FALL_GATE, 'cloudGate': CLOUD_GATE,
            'occGrid': OCC_GRID[fmt], 'birdDepth': BIRD_DEPTH,
            'occ': occ_rows, 'fallVis': fall_rows,
        }
        json.dump(cam, open(out.replace('.mp4', '.camera.json'), 'w'), separators=(',', ':'))
        print('encoded', out, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
