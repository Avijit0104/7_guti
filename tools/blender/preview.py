# Renders front views of one or more glTF/GLB files side by side (Blender, background mode).
# blender -b --python tools/blender/preview.py -- out.png file1 [file2 ...] [--face]
import bpy, sys, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
face = '--face' in args
args = [a for a in args if a != '--face']
out, files = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
xs = 0.0
tops = []
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.name.startswith('Icosphere'): o.hide_render = True
        if o.parent is None: o.location.x += xs
    bpy.context.view_layer.update()
    zmax = max((max((o.matrix_world @ mathutils.Vector(c)).z for c in o.bound_box) for o in new if o.type == 'MESH' and not o.hide_render), default=1.7)
    tops.append(zmax)
    xs += 0.9
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = (700, 700) if face else (max(500, 330 * len(files)), 800)
sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.7, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(-25)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cx = (xs - 0.9) / 2
top = max(tops)
if face:
    cam.data.lens = 85
    cam.location = (0, -1.25, top - 0.13); cam.rotation_euler = (math.radians(90), 0, 0)
else:
    cam.data.lens = 50
    d = max(3.2, 1.4 * len(files) + 1.5)
    cam.location = (cx, -d, top * 0.55); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('WROTE', out)
