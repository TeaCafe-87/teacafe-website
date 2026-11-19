"""TeaCafe journey video — parallax camera renderer / encoder.

Usage:
  python3 render.py preview            # full-size stills at key moments -> /tmp/journey_preview
  python3 render.py encode OUT.mp4     # 24 s / 30 fps all-intra H.264 (scroll-scrubbable)
  python3 render.py poster OUT_BASE    # first & last frame as webp+jpg posters

The camera dollies into the painting: each layer scales about the
projection centre by s = depth / (depth - cam), so nearby layers enlarge
and sweep past the viewer faster than distant ridges (true parallax,
not a flat zoom).  Layers dissolve shortly before the camera reaches
them, and mist bands thicken as they are crossed, which keeps mountain
shapes stable and hides layer exits.
"""

from __future__ import annotations

import subprocess
import sys
import time

import numpy as np
from PIL import Image

import paint
from paint import VIEW_W, VIEW_H, PAD, OVERSAMPLE

FPS = 30
DURATION = 24.0
FRAMES = int(FPS * DURATION)
CAM_END = 2.9


def smoother(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)


def cam_at(t):
    """Camera depth plus projection centre for t in [0,1]."""
    e = smoother((t - 0.02) / 0.98) if t > 0.02 else 0.0
    cam = CAM_END * e
    cx = VIEW_W * (0.5 + 0.022 * np.sin(e * np.pi * 1.1))
    cy = VIEW_H * (0.47 - 0.055 * e)
    return cam, cx, cy


def fade_alpha(s, fade):
    s0, s1 = fade
    if s <= s0:
        return 1.0
    if s >= s1:
        return 0.0
    k = (s - s0) / (s1 - s0)
    return 1.0 - (k * k * (3 - 2 * k))


class Renderer:
    def __init__(self):
        t0 = time.time()
        self.stack = paint.build_all()
        print(f"layers painted in {time.time() - t0:.1f}s", flush=True)
        # static finishing passes: paper grain + corner vignette
        g = paint.value_noise_2d(VIEW_W // 3, VIEW_H // 3, cell=3, octaves=2, seed=999)
        g = np.asarray(Image.fromarray((g * 255).astype(np.uint8))
                       .resize((VIEW_W, VIEW_H), Image.BILINEAR), float) / 255
        self.grain = (g - 0.5) * 9.0
        yy, xx = np.mgrid[0:VIEW_H, 0:VIEW_W]
        r = np.hypot((xx - VIEW_W / 2) / (VIEW_W / 2), (yy - VIEW_H / 2) / (VIEW_H / 2))
        self.vignette = 1.0 - 0.07 * np.clip(r - 0.62, 0, 1) ** 2

    def frame(self, t):
        cam, cx, cy = cam_at(t)
        out = None
        for layer in self.stack:
            img = layer["img"]
            if layer["depth"] is None:                       # sky: slow drift only
                s = 1.0 + 0.05 * (cam / CAM_END)
                alpha = 1.0
            else:
                d = layer["depth"]
                if d - cam < 0.08:
                    continue
                s = d / (d - cam)
                alpha = fade_alpha(s, layer["fade"])
                if layer.get("mist"):
                    alpha *= 1.0 + 1.1 * np.exp(-((s - 2.1) ** 2) / (2 * 0.55 ** 2))
                if alpha <= 0.004:
                    continue
            # viewport in base-view coordinates (inverse of q = c + (p-c)*s)
            bx0 = cx - cx / s
            by0 = cy - cy / s
            bw = VIEW_W / s
            bh = VIEW_H / s
            # into layer pixels
            lx0 = (bx0 + PAD * VIEW_W) * OVERSAMPLE
            ly0 = (by0 + PAD * VIEW_H) * OVERSAMPLE
            lw = bw * OVERSAMPLE
            lh = bh * OVERSAMPLE
            if layer.get("drift"):
                lx0 += layer["drift"] * OVERSAMPLE * (0.25 + 0.75 * t)
            lx0 = min(max(lx0, 0), img.width - lw)
            ly0 = min(max(ly0, 0), img.height - lh)
            crop = img.crop((int(lx0), int(ly0), int(lx0 + lw), int(ly0 + lh)))
            crop = crop.resize((VIEW_W, VIEW_H), Image.BILINEAR)
            arr = np.asarray(crop, float)
            a = arr[..., 3:4] / 255.0 * min(alpha, 1.0)
            if out is None:
                out = arr[..., :3].copy()
            else:
                out = arr[..., :3] * a + out * (1 - a)
        out += self.grain[..., None]
        out *= self.vignette[..., None]
        return np.clip(out, 0, 255).astype(np.uint8)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "preview"
    r = Renderer()
    if mode == "preview":
        import pathlib
        outdir = pathlib.Path("/tmp/journey_preview")
        outdir.mkdir(exist_ok=True)
        for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
            Image.fromarray(r.frame(t)).save(outdir / f"t{int(t * 100):03d}.png")
            print(f"preview t={t}", flush=True)
    elif mode == "poster":
        base = sys.argv[2]
        for name, t in (("start", 0.0), ("end", 1.0)):
            img = Image.fromarray(r.frame(t))
            img.save(f"{base}-{name}.webp", quality=72, method=6)
        print("posters written", flush=True)
    elif mode == "encode":
        out = sys.argv[2]
        tmp = out + ".tmp.mp4"
        proc = subprocess.Popen([
            "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{VIEW_W}x{VIEW_H}", "-r", str(FPS), "-i", "-",
            "-vf", "scale=1600:900",
            "-c:v", "libx264", "-preset", "slow", "-crf", "26",
            "-x264-params", "keyint=4:min-keyint=4:scenecut=0",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", tmp,
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        t0 = time.time()
        for i in range(FRAMES):
            proc.stdin.write(r.frame(i / (FRAMES - 1)).tobytes())
            if i % 60 == 0:
                print(f"frame {i}/{FRAMES} ({time.time() - t0:.0f}s)", flush=True)
        proc.stdin.close()
        code = proc.wait()
        if code != 0:
            sys.exit(f"ffmpeg failed: {code}")
        import os
        os.replace(tmp, out)
        print(f"encoded {out} in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
