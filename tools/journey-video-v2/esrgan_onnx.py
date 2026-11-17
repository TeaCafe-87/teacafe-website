"""Run Real-ESRGAN x4plus_anime_6B without PyTorch.

Reads the .pth (a torch zip pickle) with a stub unpickler, builds the
RRDBNet graph directly in ONNX and runs it tile-by-tile in onnxruntime.

usage: python3 esrgan_onnx.py weights.pth in.png out.png
"""
import pickle, sys, zipfile
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
import onnxruntime as ort
from PIL import Image

DT = {'FloatStorage': np.float32, 'HalfStorage': np.float16}


def load_pth(path):
    z = zipfile.ZipFile(path)
    prefix = z.namelist()[0].split('/')[0]

    class Storage:
        def __init__(self, key, dtype): self.key, self.dtype = key, dtype

    def rebuild(storage, offset, size, stride, *a):
        raw = np.frombuffer(z.read(f'{prefix}/data/{storage.key}'), dtype=storage.dtype)
        if not size:
            return raw[offset:offset + 1].astype(np.float32).reshape(())
        return np.lib.stride_tricks.as_strided(
            raw[offset:], shape=tuple(size), strides=[s * raw.itemsize for s in stride]).astype(np.float32)

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if name in DT: return name
            if name == 'OrderedDict':
                import collections; return collections.OrderedDict
            return super().find_class(mod, name)

        def persistent_load(self, pid):
            # ('storage', storage_type, key, location, numel)
            return Storage(pid[2], DT[pid[1]] if isinstance(pid[1], str) else np.float32)

    sd = U(z.open(f'{prefix}/data.pkl')).load()
    return sd.get('params_ema', sd.get('params', sd))


def build(sd, num_block=6):
    nodes, inits = [], []
    cnt = [0]

    def name(p):
        cnt[0] += 1
        return f'{p}_{cnt[0]}'

    def conv(x, key):
        w, b = sd[key + '.weight'], sd[key + '.bias']
        inits.append(numpy_helper.from_array(w, key + '.weight'))
        inits.append(numpy_helper.from_array(b, key + '.bias'))
        o = name('conv')
        nodes.append(helper.make_node('Conv', [x, key + '.weight', key + '.bias'], [o], pads=[1, 1, 1, 1]))
        return o

    def lrelu(x):
        o = name('lr'); nodes.append(helper.make_node('LeakyRelu', [x], [o], alpha=0.2)); return o

    def cat(xs):
        o = name('cat'); nodes.append(helper.make_node('Concat', xs, [o], axis=1)); return o

    def scale_add(x, res, s=0.2):
        k = name('k'); inits.append(numpy_helper.from_array(np.array(s, np.float32), k))
        m = name('mul'); nodes.append(helper.make_node('Mul', [x, k], [m]))
        o = name('add'); nodes.append(helper.make_node('Add', [m, res], [o])); return o

    def add(a, b):
        o = name('add'); nodes.append(helper.make_node('Add', [a, b], [o])); return o

    def up2(x):
        sc = name('sc'); inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), sc))
        o = name('up'); nodes.append(helper.make_node('Resize', [x, '', sc], [o], mode='nearest')); return o

    def rdb(x, p):
        x1 = lrelu(conv(x, p + '.conv1'))
        x2 = lrelu(conv(cat([x, x1]), p + '.conv2'))
        x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3'))
        x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4'))
        x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5')
        return scale_add(x5, x)

    feat = conv('input', 'conv_first')
    h = feat
    for i in range(num_block):
        p = f'body.{i}'
        r = rdb(rdb(rdb(h, p + '.rdb1'), p + '.rdb2'), p + '.rdb3')
        h = scale_add(r, h)
    feat = add(feat, conv(h, 'conv_body'))
    feat = lrelu(conv(up2(feat), 'conv_up1'))
    feat = lrelu(conv(up2(feat), 'conv_up2'))
    out = conv(lrelu(conv(feat, 'conv_hr')), 'conv_last')
    nodes.append(helper.make_node('Identity', [out], ['output']))
    g = helper.make_graph(nodes, 'rrdb',
                          [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])],
                          [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8; return m


def main(wpath, inp, outp, tile=192, pad=12):
    sd = load_pth(wpath)
    model = build(sd)
    so = ort.SessionOptions(); so.intra_op_num_threads = 2
    sess = ort.InferenceSession(model.SerializeToString(), so, providers=['CPUExecutionProvider'])
    im = Image.open(inp)
    alpha = None
    if im.mode == 'RGBA':
        alpha = im.getchannel('A')
    x = np.asarray(im.convert('RGB'), np.float32) / 255.0
    H, W, _ = x.shape
    out = np.zeros((H * 4, W * 4, 3), np.float32)
    ys = list(range(0, H, tile)); xs = list(range(0, W, tile))
    total = len(ys) * len(xs); done = 0
    for y0 in ys:
        for x0 in xs:
            y1, x1 = min(y0 + tile, H), min(x0 + tile, W)
            py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
            py1, px1 = min(y1 + pad, H), min(x1 + pad, W)
            t = x[py0:py1, px0:px1].transpose(2, 0, 1)[None]
            r = sess.run(None, {'input': t})[0][0].transpose(1, 2, 0)
            oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
            out[y0 * 4:y1 * 4, x0 * 4:x1 * 4] = r[oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
            done += 1
            print(f'tile {done}/{total}', flush=True)
    img = Image.fromarray(np.clip(out * 255 + .5, 0, 255).astype(np.uint8))
    if alpha is not None:
        img.putalpha(alpha.resize(img.size, Image.LANCZOS))
    img.save(outp)
    print('saved', outp, img.size)


if __name__ == '__main__':
    main(*sys.argv[1:4])
