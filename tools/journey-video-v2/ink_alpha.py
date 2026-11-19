"""Ink strength of the upscaled painting against its paper colour -> work/ink_alpha.npy"""
import numpy as np
from PIL import Image

P = np.array([226, 213, 189], np.float32)          # measured paper colour
x4 = np.asarray(Image.open('work/src_x4.png').convert('RGB'), np.float32)
dark = np.max((P - x4) / P, axis=2)                # ink darker than paper
light = np.max((x4 - P) / (255 - P), axis=2)       # mist lighter than paper
np.save('work/ink_alpha.npy', np.clip(np.maximum(dark, light), 0, 1).astype(np.float16))
