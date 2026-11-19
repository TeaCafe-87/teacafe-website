"""TEST PATCH (not a Cowork deliverable): re-render wiki-01 frames without the baked koi, so the
website's live koi layer (scene-live.js) can be judged without ghosting.

Loads Cowork's scene.blend read-only (never saved), hides the Koi_* objects, renders with the
same settings as Cowork's deliver.py.
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b <wiki-01>/scene.blend \\
      -P tools/scenes/render_wiki01_nokoi.py -- desktop|mobile <first> <last> <out_dir>
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
mode, f0, f1, out = argv[0], int(argv[1]), int(argv[2]), argv[3]
sc = bpy.context.scene
for ob in bpy.data.objects:
    if ob.name.startswith("Koi_"):
        ob.hide_render = True
        for child in ob.children_recursive:
            child.hide_render = True
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 32
sc.render.resolution_percentage = 100
sc.render.use_overwrite = True
ims = sc.render.image_settings
ims.media_type = 'IMAGE'
if mode == "desktop":
    sc.camera = bpy.data.objects["FlightCam"]
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    ims.file_format = 'WEBP'; ims.color_mode = 'RGB'; ims.quality = 82
else:
    sc.camera = bpy.data.objects["FlightCamPortrait"]
    sc.render.resolution_x, sc.render.resolution_y = 720, 1280
    ims.file_format = 'PNG'; ims.color_mode = 'RGB'; ims.compression = 15
sc.render.filepath = os.path.join(out, "####")
sc.frame_start, sc.frame_end = f0, f1
bpy.ops.render.render(animation=True)
print("done", mode, f0, f1)
