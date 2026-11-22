"""Build dist/data/scenes/<id>.camera.json from Cowork's hand-off (docs/scenes/<id>/).

    python tools/scenes/build_scene_data.py wiki-01 wiki-02 wiki-03

Writes only numbers the live layer (dist/assets/js/scene-live.js) needs; no local paths.
  track    per frame [x, y, z, rx, ry, rz] (camera_path.json: location + XYZ euler)
  river    [y, centre x, half width] every 10 m (build_scene.py river_x / half_width)
  waterfall curtain shape (build_scene.py waterfall())
  cover    per frame visible water / waterfall share, permille (masks_coverage.json)
  lanterns world positions + per-frame visible indices (camera_analysis.json)
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
RIVER = [[-20,-8.904,70],[-10,-4.55,70],[0,0.0,70],[10,4.55,70],[20,8.904,70],[30,12.872,70],[40,16.284,68.109],[50,18.851,63.125],[60,19.793,56.078],[70,18.91,48.0],[80,16.91,39.922],[90,14.993,32.875],[100,14.166,27.891],[110,14.62,26],[120,15.487,26],[130,15.438,26],[140,13.836,26],[150,10.36,26],[160,5.008,26],[170,-1.874,26],[180,-9.632,26],[190,-17.393,26],[200,-24.208,26],[210,-29.205,27.185],[220,-31.732,34.0],[230,-31.471,40.815],[240,-28.486,42],[250,-23.214,42],[260,-16.386,42],[270,-8.904,42],[280,-1.686,42]]
WATERFALL = {"x0":-21.248,"width":10,"widen":0.5,"top":78,"y0":250,"lean":2.0,"bow":1.2}


def build(sid):
    doc = ROOT / 'docs' / 'scenes' / sid
    path = json.loads((doc / 'camera_path.json').read_text(encoding='utf-8'))
    out = {
        'source': f'Cowork {sid} camera_path.json + build_scene.py (river, waterfall)',
        'fps': path['fps'], 'frames': len(path['frames']),
        'lensMm': path['lens_mm'], 'sensorMm': path['sensor_mm'],
        'track': [[round(v, 4) for v in f['location']] + [round(v, 5) for v in f['rotation_euler']] for f in path['frames']],
    }
    cov = doc / 'masks_coverage.json'
    if cov.exists():
        c = json.loads(cov.read_text(encoding='utf-8'))
        out['river'] = RIVER
        out['waterfall'] = WATERFALL
        out['cover'] = {v: {'water': [round(r[1] * 1000) for r in rows], 'fall': [round(r[2] * 1000) for r in rows]} for v, rows in c.items()}
    an = json.loads((doc / 'camera_analysis.json').read_text(encoding='utf-8'))
    if any(f['desktop'].get('lanterns_visible') for f in an['frames']):
        out['lanterns'] = {
            'world': an['lanterns_world'],
            'visible': {v: [[l[0] for l in f[v].get('lanterns_visible', [])] for f in an['frames']] for v in ('desktop', 'mobile')},
        }
    dst = ROOT / 'dist' / 'data' / 'scenes' / f'{sid}.camera.json'
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(sid, dst.stat().st_size, 'bytes')


for sid in sys.argv[1:] or ['wiki-01', 'wiki-02', 'wiki-03']:
    build(sid)
