# Renders the animation pack's mannequin, and a built character, in a given clip and frame.
# blender -b --python tools/blender/preview_anim.py -- out.png Clip frame ual.glb [character.glb Piece1,Piece2]
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
out, clip, frame, ual = a[0], a[1], int(a[2]), a[3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ual)
act = bpy.data.actions[clip]
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
arms[0].animation_data_create(); arms[0].animation_data.action = act
if len(a) > 4:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=a[4])
    new = [o for o in bpy.data.objects if o not in before]
    keep = set(a[5].split(','))
    for o in new:
        if o.type == 'MESH': o.hide_render = o.name.split('.')[0] not in keep
        if o.parent is None: o.location.x += 1.0
        if o.type == 'ARMATURE':
            o.animation_data_create(); o.animation_data.action = act
for o in bpy.data.objects:
    if o.name.startswith('Icosphere'): o.hide_render = True
sc = bpy.context.scene; sc.frame_set(frame)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 800, 700
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.9, 0, -0.5); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0.5, -5, 1.0); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE')
