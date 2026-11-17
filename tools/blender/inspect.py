# Lists meshes, bones, materials and animations of the Quaternius files (run with Blender in background).
import bpy, sys, os
base = sys.argv[sys.argv.index('--') + 1]
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
for rel in ['UBC/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf',
            'UBC/Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Long.gltf',
            'UAL/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb']:
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(base, rel))
    print('=====', rel)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            print('MESH', o.name, 'verts', len(o.data.vertices), 'dims', [round(v, 3) for v in o.dimensions], 'mats', [m.name for m in o.data.materials if m], 'groups', len(o.vertex_groups), 'parent', o.parent.name if o.parent else None)
        elif o.type == 'ARMATURE':
            print('ARMATURE', o.name, 'bones', len(o.data.bones))
            print('  ', ', '.join(b.name for b in o.data.bones))
    for m in bpy.data.materials:
        imgs = [n.image.name for n in (m.node_tree.nodes if m.node_tree else []) if n.type == 'TEX_IMAGE' and n.image]
        print('MAT', m.name, imgs)
    acts = bpy.data.actions
    print('ACTIONS', len(acts))
    print('  ', ', '.join(f'{a.name}({a.frame_range[1]-a.frame_range[0]:.0f})' for a in acts))
