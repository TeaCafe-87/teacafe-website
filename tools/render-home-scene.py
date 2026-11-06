"""Render whole-scene water refraction. pip install pillow numpy opencv-python-headless imageio-ffmpeg"""
from pathlib import Path
import math, subprocess
import numpy as np
import cv2
from PIL import Image, ImageOps
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/video'
OUT.mkdir(parents=True,exist_ok=True)
FPS,SECONDS=30,8
source=Image.open(ROOT/'dist/image/index.png').convert('RGB')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def render(width,height,name,center):
    base=np.asarray(ImageOps.fit(source,(width,height),Image.Resampling.LANCZOS,centering=center))
    yy,xx=np.mgrid[:height,:width].astype(np.float32)
    waves=[]
    for ox,oy,frequency,speed,amplitude in [(.32,.42,20,2,4.8),(.78,.68,16,1,3.2),(.51,.12,23,3,1.6)]:
        dx=(xx-width*ox)/width;dy=(yy-height*oy)/width
        radius=np.sqrt(dx*dx+dy*dy+0.0001)
        waves.append((radius*frequency,dx/radius,dy/radius,speed,amplitude*width/1920))
    def frame(phase):
        phase = phase % 1.0
        mx=xx.copy();my=yy.copy()
        for distance,nx,ny,speed,amplitude in waves:
            ripple=np.sin(distance-math.tau*speed*phase)*amplitude
            mx+=nx*ripple;my+=ny*ripple
        return cv2.remap(base,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT_101)
    assert np.array_equal(frame(0),frame(1)), 'Loop seam mismatch'
    path=OUT/name
    cmd=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-g','8','-keyint_min','8','-sc_threshold','0','-bf','0','-movflags','+faststart',str(path)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for index in range(FPS*SECONDS):
        process.stdin.write(frame(index/(FPS*SECONDS)).tobytes())
        if index%60==0: print(f'{name}: {index}/{FPS*SECONDS}',flush=True)
    process.stdin.close()
    if process.wait(): raise RuntimeError('Encoding failed')
    print(f'{name}: {path.stat().st_size/1048576:.2f} MiB',flush=True)
render(1920,1080,'teacafe-flow-desktop.mp4',(.5,.5))
render(720,1280,'teacafe-flow-mobile.mp4',(.38,.5))

