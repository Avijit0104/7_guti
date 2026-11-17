# Renders one character file with only the listed pieces visible: front, three-quarter and face views.
# blender -b --python tools/blender/preview_outfit.py -- file.glb out_prefix Piece1,Piece2,...
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
f, out, keep = a[0], a[1], set(a[2].split(','))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=f)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = o.name.split('.')[0] not in keep
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.66, 0.72, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2
sun.rotation_euler = (math.radians(55), 0, math.radians(-30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shot(name, loc, rot, lens, res):
    cam.location = loc; cam.rotation_euler = [math.radians(r) for r in rot]; cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = out + name + '.png'
    bpy.ops.render.render(write_still=True)
shot('_front', (0, -4.2, 0.95), (90, 0, 0), 50, (600, 800))
shot('_34', (-2.6, -3.0, 1.1), (88, 0, -40), 50, (600, 800))
shot('_back', (0.6, 4.2, 1.0), (90, 0, 172), 50, (600, 800))
shot('_face', (0, -1.15, 1.6), (90, 0, 0), 85, (600, 600))
print('DONE')
