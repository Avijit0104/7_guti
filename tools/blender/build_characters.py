# Builds the game's character files from the Quaternius Universal Base Characters (CC0).
#
#   blender -b --factory-startup --python tools/blender/build_characters.py -- <quaternius folder> <output folder>
#
# For each base body (female, male) it:
#   * rebinds the hairstyles from the pack to the body's skeleton,
#   * cuts clothing pieces out of the body surface itself (so they bend exactly like the body):
#     tees, tank, polo collar, blouse, shorts, capris, trousers, sneakers, sandals,
#   * builds a knee skirt and a full saree (skirt + pallu over the left shoulder) with vertex-coloured gold borders,
#   * builds jewellery: temple necklace, bangles, jhumka earrings, bindi,
#   * exports ONE compressed GLB per body containing all pieces. The game shows/hides pieces and colours them.
# The animation clips (Universal Animation Library) are exported separately to anims.glb.
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
Q, OUT = args[0], args[1]
UBC = os.path.join(Q, 'UBC', 'Universal Base Characters[Standard]')
BASE = os.path.join(UBC, 'Base Characters', 'Godot - UE')
HAIR = os.path.join(UBC, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')
TEX = os.path.join(UBC, 'Base Characters', 'Textures')
UAL = os.path.join(Q, 'UAL', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb')
os.makedirs(OUT, exist_ok=True)

GOLD = (0.83, 0.62, 0.2, 1)


def log(*a):
    print('[build]', *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
            new.remove(o)
    return new


def set_active(o):
    for s in bpy.context.selected_objects:
        s.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def apply_mods(o):
    set_active(o)
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            continue
        bpy.ops.object.modifier_apply(modifier=m.name)


def material(name, color, metal=0.0, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = color
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


def vcol_material(name, metal=0.0, rough=0.8):
    # base colour comes from the mesh's colour attribute
    m = material(name, (1, 1, 1, 1), metal, rough)
    nt = m.node_tree
    a = nt.nodes.new('ShaderNodeVertexColor')
    a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m


def bind(obj, arm, groups):
    """Skin a new object to the armature. groups: callable(world_pos) -> {bone: weight}"""
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    vg = {}
    mw = obj.matrix_world
    for v in obj.data.vertices:
        for b, w in groups(mw @ v.co).items():
            if w <= 0:
                continue
            if b not in vg:
                vg[b] = obj.vertex_groups.new(name=b)
            vg[b].add([v.index], w, 'REPLACE')


class Body:
    def __init__(self, arm, body):
        self.arm, self.body = arm, body
        self.mw = body.matrix_world.copy()
        self.bones = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
        me = body.data
        self.gname = {g.index: g.name for g in body.vertex_groups}
        self.pos = [self.mw @ v.co for v in me.vertices]
        self.dom, self.t = [], []
        for v, p in zip(me.vertices, self.pos):
            best, bw = None, 0
            for g in v.groups:
                if g.weight > bw:
                    best, bw = self.gname[g.group], g.weight
            self.dom.append(best)
            if best in self.bones:
                h, t = self.bones[best]
                d = t - h
                self.t.append(max(-1, min(2, (p - h).dot(d) / max(d.length_squared, 1e-9))))
            else:
                self.t.append(0)
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.transform(self.mw)
        self.bvh = BVHTree.FromBMesh(bm)
        bm.free()

    def bone(self, n):
        return self.bones[n]

    # ---- clothing cut from the body surface
    def piece(self, name, spec, offset, mat, thick=0.004, extra=None, border=None, smooth=0):
        """spec: {bone: (t0, t1)}; extra(i, pos) -> bool can veto a vertex"""
        sel = set()
        for i, (b, t, p) in enumerate(zip(self.dom, self.t, self.pos)):
            if b in spec and spec[b][0] <= t <= spec[b][1] and (extra is None or extra(i, p)):
                sel.add(i)
        o = self.body.copy()
        o.data = self.body.data.copy()
        o.name = name
        o.data.name = name
        bpy.context.collection.objects.link(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        bm.normal_update()
        normals = [v.normal.copy() for v in bm.verts]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in sel for v in f.verts)], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        for v in bm.verts:
            pass
        bm.to_mesh(o.data)
        bm.free()
        # push outwards along the body normals (normals are in mesh space, same as co)
        me = o.data
        kept = {}
        # map back by position (indices changed after delete): rebuild from original normals via nearest original vertex
        orig = self.body.data.vertices
        kd = __import__('mathutils').kdtree.KDTree(len(orig))
        for v in orig:
            kd.insert(v.co, v.index)
        kd.balance()
        for v in me.vertices:
            _, idx, _ = kd.find(v.co)
            v.co = v.co + normals[idx] * offset
        o.data.materials.clear()
        o.data.materials.append(mat)
        if smooth:  # fabric does not follow every muscle: blur the surface, keeping its volume
            ls = o.modifiers.new('Lap', 'LAPLACIANSMOOTH'); ls.lambda_factor = smooth; ls.iterations = 6
            ls.use_volume_preserve = True; ls.use_normalized = True
            bpy.context.view_layer.objects.active = o
            while o.modifiers[0].name != 'Lap':
                bpy.ops.object.modifier_move_up(modifier='Lap')
            apply_mods(o)
        if border:  # colour the open edges before the solidify closes them
            add_border_colour(o, *border)
        if thick > 0:
            s = o.modifiers.new('Solidify', 'SOLIDIFY')
            s.thickness = thick
            s.offset = -1
            s.use_rim = True
            # keep the armature modifier last
            bpy.context.view_layer.objects.active = o
            while o.modifiers[0].name != 'Solidify':
                bpy.ops.object.modifier_move_up(modifier='Solidify')
            apply_mods(o)
        if not o.data.polygons:
            log('WARNING empty piece', name)
        return o

    def cutout(self, name, spec):
        """A copy of the body with the faces in spec removed (skin hidden under long clothes, so legs never poke
        through a saree or skirt). Uses the body's own material."""
        gone = {i for i, (b, t) in enumerate(zip(self.dom, self.t)) if b in spec and spec[b][0] <= t <= spec[b][1]}
        o = self.body.copy(); o.data = self.body.data.copy(); o.name = name; o.data.name = name
        bpy.context.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in gone for v in f.verts)], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(o.data); bm.free()
        return o

    def front_sign(self):
        return -1.0  # characters face -Y in Blender after the glTF import

    def surface(self, origin, direction):
        loc, n, i, d = self.bvh.ray_cast(origin, direction.normalized())
        return loc, n

    def radius_at(self, z, bones, axis):
        vals = [abs(p[axis] - 0) for b, p in zip(self.dom, self.pos) if b in bones and abs(p.z - z) < 0.02]
        return max(vals) if vals else 0.15


def skirt(B, name, z_top, z_hem, mat, colour, flare, legs_follow=0.5, rings=14, seg=36, margin=0.03):
    """A skirt / saree: an elliptic tube from the waist to the hem that clears the hips, coloured per vertex."""
    bones = {'pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}
    cy = B.bone('pelvis')[0].y
    prof = []
    for r in range(rings + 1):
        s = r / rings
        z = z_top + (z_hem - z_top) * s
        # every body vertex at this height counts (the arms are far above in the T-pose), so the hips never poke out
        pts = [(p.x, p.y - cy) for p in B.pos if abs(p.z - z) < 0.03 and abs(p.x) < 0.4]
        rx = max([abs(x) for x, _ in pts] or [0.15]) + margin
        ry = max([abs(y) for _, y in pts] or [0.12]) + margin
        prof.append((z, rx, ry))
    # never narrower than the widest point above (cloth falls straight from the hips), plus the flare
    bm = bmesh.new()
    rows = []
    mx_x = mx_y = 0
    for r, (z, rx, ry) in enumerate(prof):
        s = r / rings
        mx_x, mx_y = max(mx_x, rx), max(mx_y, ry)
        ax = max(rx, mx_x) * (1 + flare * s * s)
        ay = max(ry, mx_y) * (1 + flare * 0.8 * s * s)
        row = [bm.verts.new((math.cos(a) * ax, cy + math.sin(a) * ay, z)) for a in [2 * math.pi * k / seg for k in range(seg)]]
        rows.append(row)
    for r in range(rings):
        for k in range(seg):
            a, b = rows[r][k], rows[r][(k + 1) % seg]
            c, d = rows[r + 1][(k + 1) % seg], rows[r + 1][k]
            bm.faces.new((a, d, c, b))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    # colours
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        ca.data[v.index].color = colour(v.co, (z_top - v.co.z) / (z_top - z_hem))
    me.color_attributes.active_color = ca
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    s = o.modifiers.new('Solidify', 'SOLIDIFY'); s.thickness = 0.006; s.offset = -1
    apply_mods(o)
    lx = B.bone('thigh_l')[0].x

    def w(p):
        s = max(0.0, min(1.0, (z_top - p.z) / (z_top - z_hem)))
        side = max(0.0, min(1.0, 0.5 + (p.x / abs(lx or 0.1)) * 0.5))  # 1 at the left leg, 0 at the right
        f = legs_follow * s
        top = 1 - f
        if s < 0.08:  # the waistband rides on the lower spine
            return {'spine_01': 0.5 * (1 - s / 0.08), 'pelvis': 0.5 + 0.5 * s / 0.08}
        return {'pelvis': top, 'thigh_l': f * side, 'thigh_r': f * (1 - side)}
    bind(o, B.arm, w)
    return o


def ribbon(B, name, pts, width, mat, base, border, offset=0.03):
    """A band of cloth through the given points, pulled onto the body surface (the saree's pallu)."""
    from mathutils import geometry
    curve = [Vector(p) for p in pts]
    # resample along the polyline
    dense = []
    for i in range(len(curve) - 1):
        a, b = curve[i], curve[i + 1]
        n = max(2, int((b - a).length / 0.03))
        for k in range(n):
            dense.append(a.lerp(b, k / n))
    dense.append(curve[-1])
    bm = bmesh.new()
    cols = []
    U = [0, 0.08, 0.1, 0.5, 0.9, 0.92, 1]
    rows = []
    for i, p in enumerate(dense):
        t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
        # outward = away from the body centre line, upward over the shoulder
        c = Vector((0, B.bone('spine_03')[0].y, p.z))
        out = (p - c); out.z = 0
        if p.z > B.bone('spine_03')[1].z - 0.03:
            out += Vector((0, 0, 3 * (p.z - B.bone('spine_03')[1].z + 0.05)))
        out.normalize()
        side = t.cross(out).normalized()
        row = []
        for u in U:
            row.append(bm.verts.new(p + side * (u - 0.5) * width))
            cols.append(border if (u < 0.09 or u > 0.91) else base)
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(len(U) - 1):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols):
        ca.data[i].color = c
    me.color_attributes.active_color = ca
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    # pull onto the body, keep a gap, then give it thickness
    sw = o.modifiers.new('Shrink', 'SHRINKWRAP'); sw.target = B.body; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.wrap_mode = 'OUTSIDE_SURFACE'; sw.offset = offset
    sm = o.modifiers.new('Smooth', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 6
    s = o.modifiers.new('Solidify', 'SOLIDIFY'); s.thickness = 0.005; s.offset = -1
    apply_mods(o)
    # weights: copy the nearest body vertex's weights
    transfer_weights(B, o)
    return o


def transfer_weights(B, o, only=None):
    from mathutils import kdtree
    kd = kdtree.KDTree(len(B.pos))
    for i, p in enumerate(B.pos):
        kd.insert(p, i)
    kd.balance()
    bverts = B.body.data.vertices
    o.parent = B.arm
    o.matrix_parent_inverse = B.arm.matrix_world.inverted()
    mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = B.arm
    vg = {}
    mw = o.matrix_world
    for v in o.data.vertices:
        p = mw @ v.co
        near = kd.find_n(p, 4)
        acc = {}
        tot = 0
        for co, idx, dist in near:
            wt = 1 / (dist + 1e-4)
            tot += wt
            for g in bverts[idx].groups:
                nm = B.gname[g.group]
                if only and nm not in only:
                    continue
                acc[nm] = acc.get(nm, 0) + g.weight * wt
        for nm, wv in acc.items():
            if nm not in vg:
                vg[nm] = o.vertex_groups.new(name=nm)
            vg[nm].add([v.index], wv / tot, 'REPLACE')


def mesh_obj(name, geom_fn, mat):
    bm = bmesh.new()
    geom_fn(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    me.materials.append(mat)
    return o


def torus(bm, center, axis, R, r, seg=28, sides=8):
    axis = axis.normalized()
    q = Vector((0, 0, 1)).rotation_difference(axis)
    res = bmesh.ops.create_cone  # noqa (not used)
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        rad = Vector((math.cos(a), math.sin(a), 0))
        row = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            p = c + rad * math.cos(b) * r + Vector((0, 0, math.sin(b) * r))
            row.append(bm.verts.new(center + q @ p))
        rows.append(row)
    for i in range(seg):
        for j in range(sides):
            a, b = rows[i][j], rows[i][(j + 1) % sides]
            c, d = rows[(i + 1) % seg][(j + 1) % sides], rows[(i + 1) % seg][j]
            bm.faces.new((a, b, c, d))


def ball(bm, center, r, sx=1, sy=1, sz=1):
    m = Matrix.Translation(center) @ Matrix.Diagonal((r * sx, r * sy, r * sz, 1))
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1, matrix=m)


def disc(bm, center, normal, r, h):
    q = Vector((0, 0, 1)).rotation_difference(normal.normalized())
    m = Matrix.Translation(center) @ q.to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r, depth=h, matrix=m)


# ---------------------------------------------------------------------------------------------------------------
def rebind_hair(file, arm, name):
    objs = import_gltf(os.path.join(HAIR, file))
    hair = [o for o in objs if o.type == 'MESH'][0]
    old_arm = [o for o in objs if o.type == 'ARMATURE'][0]
    mw = hair.matrix_world.copy()
    hair.parent = arm
    hair.matrix_world = mw
    for m in hair.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    bpy.data.objects.remove(old_arm, do_unlink=True)
    hair.name = name
    return hair


def shrink_textures(size=1024):
    for img in bpy.data.images:
        if img.size[0] > size:
            img.scale(size, size)


def export(path, anims=False):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_animations=anims, export_skins=True, export_yup=True,
        # Draco is not used: this PC's application-control policy blocks Blender's Draco DLL.
        # tools/compress_models.sh compresses the files afterwards with meshoptimizer instead.
        export_draco_mesh_compression_enable=False,
        export_image_format='JPEG', export_jpeg_quality=86, export_vertex_color='ACTIVE',
        export_extras=False)
    log('wrote', path, os.path.getsize(path) // 1024, 'KB')


# ---------------------------------------------------------------------------------------------------------------
def reshape_kanu(B):
    """Kanu: a short, skinny 18-year-old with a round face and a soft little belly. Moves the body's vertices only;
    the skeleton stays the same, so every animation still fits."""
    body = B.body
    inv = body.matrix_world.inverted()
    eyes = [o for o in bpy.data.objects if o.name == 'Eyes'][0]
    ev = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    eye_z = sum(p.z for p in ev) / len(ev)
    head_pts = [p for b, p in zip(B.dom, B.pos) if b == 'Head']
    chin_z = min(p.z for p in head_pts)
    head_y = B.bone('Head')[0].y
    cy = B.bone('spine_02')[0].y
    navel_z = B.bone('spine_01')[0].z + 0.03

    def ss(a, b, x):
        t = max(0.0, min(1.0, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)
    # thinner arms and legs (shrunk towards the bone), fading in away from the shoulders and hips
    limb = {'upperarm_l': 0.8, 'upperarm_r': 0.8, 'lowerarm_l': 0.84, 'lowerarm_r': 0.84,
            'thigh_l': 0.84, 'thigh_r': 0.84, 'calf_l': 0.86, 'calf_r': 0.86}
    new_pos = [None] * len(B.pos)
    for i, (b, t, p) in enumerate(zip(B.dom, B.t, B.pos)):
        q = p.copy()
        if b in limb:
            h, tl = B.bone(b)
            axis = h + (tl - h) * max(0.0, min(1.0, t))
            fade = ss(0.0, 0.3, t) if b.startswith(('upperarm', 'thigh')) else 1.0
            k = 1 - (1 - limb[b]) * fade
            q = axis + (p - axis) * k
        elif abs(p.x) < 0.3 and b not in ('Head', 'neck_01') and not b.startswith(('hand', 'index', 'middle', 'ring', 'pinky', 'thumb')):
            # narrower waist ...
            wz = math.exp(-((p.z - (navel_z + 0.08)) / 0.13) ** 2)
            q.x = p.x * (1 - 0.09 * wz)
            # ... with a soft little belly in front
            if p.y < cy - 0.02 and abs(p.x) < 0.15:
                bump = math.exp(-((p.z - (navel_z - 0.01)) / 0.09) ** 2) * ss(cy - 0.02, cy - 0.08, p.y) * (1 - (p.x / 0.15) ** 2)
                q.y = p.y - 0.048 * bump
        elif b == 'Head' and p.z < eye_z:
            # rounder face: fuller cheeks and jaw, a shorter, softer chin
            s_ = ss(eye_z, chin_z, p.z)
            front = ss(head_y + 0.04, head_y - 0.02, p.y)
            q.x = p.x * (1 + 0.16 * (s_ ** 0.5) * (0.5 + 0.5 * front))
            q.z = eye_z - (eye_z - p.z) * 0.85
            q.y = p.y + 0.016 * s_ * front
        new_pos[i] = q
    face_features(B, new_pos, eyes)
    for i, q in enumerate(new_pos):
        body.data.vertices[i].co = inv @ q
    body.data.update()
    log('reshaped Kanu: eye_z', round(eye_z, 3), 'chin_z', round(chin_z, 3))


def face_features(B, new_pos, eyes):
    """Narrower lips, eyes less wide open (lids a little lower / higher), a softer, rounder, less pointed nose.
    Landmarks are found on the original face; the moves are added on top of the round-face reshape."""
    def ss(a, b, x):
        t = max(0.0, min(1.0, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)
    head = [(i, p) for i, (b, p) in enumerate(zip(B.dom, B.pos)) if b == 'Head']
    ev = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    centres = []
    for sx in (1, -1):
        side = [p for p in ev if p.x * sx > 0]
        c = sum(side, Vector()) / len(side)
        front = min(p.y for p in side)
        centres.append(Vector((c.x, front, c.z)))
    ez = sum(c.z for c in centres) / 2
    mid = [p for i, p in head if abs(p.x) < 0.01 and p.z < ez - 0.01]
    nose = min(mid, key=lambda p: p.y)                       # tip of the nose: the most forward point
    below = [p for p in mid if p.z < nose.z - 0.022]
    lip = min(below, key=lambda p: p.y)                      # front of the upper lip
    mouth_z = lip.z - 0.007
    log('face landmarks: eyes', [tuple(round(v, 3) for v in c) for c in centres], 'nose', tuple(round(v, 3) for v in nose), 'mouth z', round(mouth_z, 3))
    for i, p in head:
        q = new_pos[i]
        if p.y > nose.y + 0.06:
            continue  # only the front of the face
        # lips: pull the mouth corners in
        wm = math.exp(-((p.z - mouth_z) / 0.013) ** 2) * ss(0.05, 0.022, abs(p.x)) * ss(lip.y + 0.03, lip.y + 0.005, p.y)
        q.x -= p.x * 0.24 * wm
        # nose: a little wider and rounder at the tip, less pointed
        wn = math.exp(-((p.z - (nose.z + 0.004)) / 0.016) ** 2) * ss(0.03, 0.0, abs(p.x)) * ss(nose.y + 0.03, nose.y + 0.004, p.y)
        q.x += p.x * 0.14 * wn
        q.y += 0.005 * wn
        # eyes: lower the upper lid and raise the lower lid a little, so the eyes look less wide open
        for c in centres:
            dx = (p.x - c.x) / 0.021
            dz = (p.z - c.z) / 0.016
            if dx * dx + dz * dz < 1 and p.y < c.y + 0.012:
                g = (1 - dx * dx) * (1 - dz * dz)
                q.z += (-0.0026 if p.z > c.z else 0.0012) * g
        new_pos[i] = q


def lengthen_hair(B, hair):
    """Hair_Long reaches the shoulders; Kanu's falls well past them. Stretch the lower hair down, keep it outside the
    body, and let the long part follow the upper back instead of the head so it does not cut through the shoulders."""
    mw, inv = hair.matrix_world, hair.matrix_world.inverted()
    head = B.bone('Head')[0]
    neck = B.bone('neck_01')[0]
    top = head.z + 0.02
    def ss(a, b, x):
        t = max(0.0, min(1.0, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)
    gh = hair.vertex_groups.get('Head') or hair.vertex_groups.new(name='Head')
    gs = hair.vertex_groups.get('spine_03') or hair.vertex_groups.new(name='spine_03')
    for v in hair.data.vertices:
        p = mw @ v.co
        if p.z < top:
            p.z = top - (top - p.z) * 3.3
        # below the neck the long hair must stay outside the body (shoulders, back, chest)
        if p.z < neck.z:
            loc, nrm, idx, dist = B.bvh.find_nearest(p)
            if loc is not None and (p - loc).dot(nrm) < 0.025:
                p = loc + nrm * 0.025
        v.co = inv @ p
        w = ss(neck.z + 0.02, neck.z - 0.14, p.z)
        gh.add([v.index], 1 - w, 'REPLACE')
        if w > 0:
            gs.add([v.index], w, 'REPLACE')
    hair.data.update()
    log('lengthened hair, lowest point', round(min((mw @ v.co).z for v in hair.data.vertices), 3))


def build(kind, kanu=False):
    reset()
    objs = import_gltf(os.path.join(BASE, f'Superhero_{kind}_FullBody.gltf'))
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    # the body is the biggest skinned mesh (the male file names it differently)
    body = max((o for o in objs if o.type == 'MESH' and o.parent == arm), key=lambda o: len(o.data.vertices))
    arm.name = 'Rig'
    body.name = 'Body'
    for o in objs:
        if o.type == 'MESH' and o.name.startswith('Eyebrows'):
            o.name = 'Brows'
        if o.type == 'MESH' and o.name.startswith('Eyes'):
            o.name = 'Eyes'
    # use the light skin texture as the base; the game tints it to each character's skin tone
    light = os.path.join(TEX, 'T_Superhero_Female_Light_BaseColor.png' if kind == 'Female' else 'T_Superhero_Male_Ligh.png')
    for n in body.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'Dark' in n.image.name:
            n.image = bpy.data.images.load(light)
        if n.type == 'TEX_IMAGE' and n.image and 'Roughness' in n.image.name:
            pass
    B = Body(arm, body)
    if kanu:
        reshape_kanu(B)
        B = Body(arm, body)  # measure the new shape before cutting clothes from it
    fx = 1  # +x is the character's left

    cloth = lambda n: material('M_' + n, (1, 1, 1, 1), 0, 0.85)
    up = lambda a, b: (a, b)
    full = (-1, 2)
    # shirts reach a little below the waistband so they overlap the shorts / trousers (worn untucked)
    torso = {'pelvis': (0.45, 2), 'spine_01': full, 'spine_02': full, 'spine_03': full, 'clavicle_l': full, 'clavicle_r': full}
    # tees: short sleeves cover the top ~45% of the upper arm
    sm = 0.35 if kind == 'Male' else 0.25
    if not kanu:
        B.piece('Tee', dict(torso, upperarm_l=up(-1, 0.45), upperarm_r=up(-1, 0.45)), 0.022, cloth('Tee'), smooth=sm)
        B.piece('Tank', {'pelvis': (0.45, 2), 'spine_01': full, 'spine_02': full, 'spine_03': full}, 0.021, cloth('Tank'), smooth=sm,
                extra=lambda i, p: not (abs(p.x) > 0.105 and p.z > B.bone('spine_03')[0].z + 0.06))
        B.piece('Collar', {'neck_01': (-1, 0.3)}, 0.012, cloth('Collar'), thick=0.008)
        B.piece('Sleeves', {'upperarm_l': up(-1, 1.2), 'upperarm_r': up(-1, 1.2), 'lowerarm_l': up(-1, 0.85), 'lowerarm_r': up(-1, 0.85)}, 0.01, cloth('Sleeves'))
        legs_top = {'pelvis': full}
        B.piece('Shorts', dict(legs_top, thigh_l=up(-1, 0.45), thigh_r=up(-1, 0.45)), 0.016, cloth('Shorts'), smooth=0.25)
        B.piece('KneeShorts', dict(legs_top, thigh_l=up(-1, 0.88), thigh_r=up(-1, 0.88)), 0.016, cloth('KneeShorts'), smooth=0.25)
        B.piece('Capris', dict(legs_top, thigh_l=full, thigh_r=full, calf_l=up(-1, 0.55), calf_r=up(-1, 0.55)), 0.012, cloth('Capris'))
        B.piece('Trousers', dict(legs_top, thigh_l=full, thigh_r=full, calf_l=up(-1, 0.93), calf_r=up(-1, 0.93)), 0.016, cloth('Trousers'), smooth=0.25)
        B.piece('Sneakers', {'foot_l': full, 'foot_r': full, 'ball_l': full, 'ball_r': full, 'calf_l': (0.94, 2), 'calf_r': (0.94, 2)}, 0.02, cloth('Sneakers'), thick=0.012, smooth=0.6)
    B.piece('Sandals', {'foot_l': full, 'foot_r': full, 'ball_l': full, 'ball_r': full}, 0.006, cloth('Sandals'), thick=0.01,
            extra=lambda i, p: p.z < 0.03)

    if kind == 'Female':
        # saree blouse: chest and short sleeves, midriff bare
        spine2 = B.bone('spine_02')[0].z
        bl = B.piece('Blouse', {'spine_02': full, 'spine_03': full, 'clavicle_l': full, 'clavicle_r': full,
                                'upperarm_l': up(-1, 0.33), 'upperarm_r': up(-1, 0.33)}, 0.009, cloth('Blouse'),
                     extra=lambda i, p: p.z > spine2 + 0.02, border=((0.045, 0.02, 0.03, 1), GOLD, 0.02))
        bl.data.materials.clear(); bl.data.materials.append(vcol_material('M_BlouseVC', 0, 0.7))

        waist = B.bone('spine_01')[0].z + 0.06
        knee = B.bone('calf_l')[0].z
        ankle = B.bone('foot_l')[0].z + 0.02
        # sundress skirt (knee length, white by default, coloured in the game)
        if not kanu:
            skirt(B, 'Skirt', waist, knee + 0.03, vcol_material('M_Skirt', 0, 0.85), lambda co, s: (1, 1, 1, 1), flare=0.55)
        # the saree: white with a broad gold border at the hem, a thin gold line above it, and front pleats
        white = (0.94, 0.92, 0.86, 1)
        pleat = (0.86, 0.83, 0.76, 1)

        def saree_col(co, s):
            if s > 0.9 or 0.84 < s < 0.86:
                return GOLD
            if co.y < -0.02 and abs(co.x) < 0.075:
                return pleat if int((co.x + 0.075) / 0.019) % 2 else white
            return white
        skirt(B, 'Saree', waist + 0.01, ankle, vcol_material('M_Saree', 0, 0.75), saree_col, flare=0.3, legs_follow=0.28, rings=18, margin=0.05)
        # pallu: right hip front -> across the chest -> over the LEFT shoulder -> down the back
        s3h, s3t = B.bone('spine_03')
        cl = B.bone('clavicle_l')[1]
        hipR = B.bone('thigh_r')[0]
        f = -1  # front is -y
        y0 = s3h.y
        pts = [
            (hipR.x - 0.02, y0 + f * 0.16, waist + 0.0),
            (hipR.x * 0.4, y0 + f * 0.17, s3h.z - 0.02),
            (cl.x * 0.35, y0 + f * 0.17, s3h.z + 0.12),
            (cl.x * 0.95, y0 + f * 0.08, s3t.z + 0.02),
            (cl.x * 1.05, y0 + 0.0, s3t.z + 0.07),
            (cl.x * 0.95, y0 + 0.1, s3t.z + 0.01),
            (cl.x * 0.75, y0 + 0.16, s3h.z),
            (cl.x * 0.6, y0 + 0.2, waist - 0.05),
            (cl.x * 0.5, y0 + 0.22, knee + 0.15),
        ]
        ribbon(B, 'Pallu', pts, 0.24, vcol_material('M_Pallu', 0, 0.7), white, GOLD)
        jewellery(B)
        full = (-1, 2)
        B.cutout('BodySaree', {'thigh_l': full, 'thigh_r': full, 'calf_l': (-1, 0.8), 'calf_r': (-1, 0.8)})
        if not kanu:
            B.cutout('BodySkirt', {'thigh_l': (0.15, 2), 'thigh_r': (0.15, 2)} if False else {'thigh_l': (0.1, 0.85), 'thigh_r': (0.1, 0.85)})

    # hairstyles
    hairs = ['Hair_Long'] if kanu else ['Hair_Long', 'Hair_Buns', 'Hair_SimpleParted', 'Hair_BuzzedFemale'] if kind == 'Female' else ['Hair_SimpleParted', 'Hair_Buzzed']
    for h in hairs:
        ho = rebind_hair(h + '.gltf', arm, h)
        if kanu and h == 'Hair_Long':
            lengthen_hair(B, ho)

    shrink_textures(1024)
    for o in bpy.data.objects:
        log(o.type, o.name, len(o.data.vertices) if o.type == 'MESH' else '')
    export(os.path.join(OUT, 'kanu.glb' if kanu else f'{kind.lower()}.glb'))


def add_border_colour(o, base, border, width):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    edge_verts = [v.co.copy() for e in bm.edges if e.is_boundary for v in e.verts]
    bm.free()
    from mathutils import kdtree
    kd = kdtree.KDTree(len(edge_verts))
    for i, p in enumerate(edge_verts):
        kd.insert(p, i)
    kd.balance()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        _, _, d = kd.find(v.co)
        ca.data[v.index].color = border if d < width else base
    me.color_attributes.active_color = ca


def jewellery(B):
    gold = material('M_Gold', GOLD, 1.0, 0.32)
    ruby = material('M_Ruby', (0.55, 0.02, 0.06, 1), 0.1, 0.25)
    red = material('M_Bindi', (0.75, 0.02, 0.04, 1), 0, 0.5)
    silver = material('M_Silver', (0.8, 0.8, 0.82, 1), 1.0, 0.3)
    neck_h, neck_t = B.bone('neck_01')
    head_h = B.bone('Head')[0]
    s3t = B.bone('spine_03')[1]
    # temple necklace: a collar ring plus a row of gold discs along the front and a big pendant with a ruby
    nr = max(0.055, B.radius_at(neck_h.z - 0.01, {'neck_01', 'spine_03'}, 0)) + 0.012
    c = Vector((neck_h.x, neck_h.y, neck_h.z - 0.035))

    def neck_geo(bm):
        torus(bm, c, Vector((0, 0.45, 1)), nr, 0.006)
        torus(bm, c + Vector((0, -0.006, -0.03)), Vector((0, 0.5, 1)), nr + 0.012, 0.005)
        for k in range(-5, 6):
            a = math.radians(k * 13)
            p = c + Vector((math.sin(a) * (nr + 0.02), -math.cos(a) * (nr + 0.025), -0.045 - 0.01 * math.cos(a)))
            disc(bm, p, Vector((math.sin(a), -math.cos(a), 0.4)), 0.011 if k else 0.0, 0.004)
        pend = c + Vector((0, -(nr + 0.035), -0.1))
        disc(bm, pend, Vector((0, -1, 0.25)), 0.032, 0.006)
        for k in range(-2, 3):
            ball(bm, pend + Vector((k * 0.013, -0.004, -0.04 - abs(k) * -0.004)), 0.007)
    neck = mesh_obj('Necklace', neck_geo, gold)
    transfer_weights(B, neck, only={'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r', 'spine_02'})
    stone = mesh_obj('NecklaceStone', lambda bm: ball(bm, c + Vector((0, -(nr + 0.042), -0.1)), 0.011, 1, 0.6, 1.2), ruby)
    transfer_weights(B, stone, only={'spine_03', 'spine_02'})

    # bangles: stacks near each wrist (gold on the left, one silver on the right, like everyday wear)
    for side, mat_main in (('l', gold), ('r', silver)):
        wrist = B.bone(f'hand_{side}')[0]
        el = B.bone(f'lowerarm_{side}')[0]
        axis = (wrist - el).normalized()
        r = B.radius_at(wrist.z, {f'lowerarm_{side}', f'hand_{side}'}, 1) - abs(wrist.y - B.bone('spine_03')[0].y) * 0 + 0.0
        # measure the forearm thickness around the wrist
        pts = [p for b, p in zip(B.dom, B.pos) if b == f'lowerarm_{side}' and abs((p - wrist).dot(axis)) < 0.03]
        rad = max(((p - wrist) - axis * (p - wrist).dot(axis)).length for p in pts) if pts else 0.03
        n = 8 if side == 'l' else 1

        def bang(bm, side=side, wrist=wrist, axis=axis, rad=rad, n=n):
            for k in range(n):
                torus(bm, wrist - axis * (0.012 + k * 0.0105), axis, rad + 0.009, 0.0045, 22, 6)
        b = mesh_obj(f'Bangles_{side}', bang, mat_main)
        transfer_weights(B, b, only={f'lowerarm_{side}', f'hand_{side}'})

    # jhumka earrings under each earlobe
    head_pts = [p for b, p in zip(B.dom, B.pos) if b == 'Head']
    ear_z = head_h.z + 0.06
    for sx in (1, -1):
        side = [p for p in head_pts if abs(p.z - ear_z) < 0.015 and p.x * sx > 0]
        ex = max(abs(p.x) for p in side) if side else 0.075
        ey = sorted(side, key=lambda p: -abs(p.x))[0].y if side else head_h.y

        def jh(bm, sx=sx, ex=ex, ey=ey):
            top = Vector((sx * (ex - 0.004), ey + 0.006, ear_z - 0.03))
            ball(bm, top, 0.006)
            m = Matrix.Translation(top + Vector((0, 0, -0.022)))
            bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.014, radius2=0.004, depth=0.02, matrix=m)
            for k in range(6):
                a = 2 * math.pi * k / 6
                ball(bm, top + Vector((math.cos(a) * 0.014, math.sin(a) * 0.014, -0.034)), 0.003)
        e = mesh_obj('Earring_' + ('l' if sx > 0 else 'r'), jh, gold)
        transfer_weights(B, e, only={'Head'})

    # bindi: a small red dot on the forehead, found by casting a ray at the face
    eyes = [o for o in bpy.data.objects if o.name == 'Eyes'][0]
    ez = max((eyes.matrix_world @ v.co).z for v in eyes.data.vertices)
    org = Vector((0, -1.0, ez + 0.04))
    loc, nrm = B.surface(org, Vector((0, 1, 0)))
    if loc is not None:
        bnd = mesh_obj('Bindi', lambda bm: disc(bm, loc + nrm * 0.0015, nrm, 0.0055, 0.0015), red)
        transfer_weights(B, bnd, only={'Head'})


def build_anims():
    reset()
    import_gltf(UAL)
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    keep = {'Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Loop', 'Jump_Start', 'Death01', 'Spell_Simple_Shoot',
            'Spell_Simple_Idle_Loop', 'Punch_Cross', 'PickUp_Table', 'Push_Loop', 'Idle_Torch_Loop', 'Hit_Chest', 'Dance_Loop', 'Interact'}
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    arm.animation_data_create()
    for a in list(bpy.data.actions):
        if a.name not in keep:
            bpy.data.actions.remove(a)
    # one NLA track per action so the exporter writes each as its own clip
    for a in bpy.data.actions:
        t = arm.animation_data.nla_tracks.new(); t.name = a.name
        t.strips.new(a.name, int(a.frame_range[0]), a)
    arm.animation_data.action = None
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'anims.glb'), export_format='GLB', export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True, export_force_sampling=True,
                              export_optimize_animation_size=True)
    log('wrote anims', os.path.getsize(os.path.join(OUT, 'anims.glb')) // 1024, 'KB', len(bpy.data.actions), 'clips')


which = args[2] if len(args) > 2 else 'all'
if which in ('all', 'female'):
    build('Female')
if which in ('all', 'kanu'):
    build('Female', kanu=True)
if which in ('all', 'male'):
    build('Male')
if which in ('all', 'anims'):
    build_anims()
