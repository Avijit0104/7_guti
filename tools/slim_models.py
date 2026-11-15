"""Shrinks the KayKit character files for the web.

Each original .glb carries 76 animations; the game uses six. This script reads the originals from
models_src/, keeps only the listed clips, drops the data nothing refers to any more, and writes the
small files to models/.

Run from the project folder:   python tools/slim_models.py
"""
import json
import os
import struct
import sys

KEEP = ['Idle', 'Running_A', 'Jump_Idle', 'Death_A', 'Throw', '2H_Melee_Idle']
SRC, DST = 'models_src', 'models'


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, _ = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF' and version == 2, path + ' is not a glTF 2 binary'
    jlen = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack('<I', data[off:off + 4])[0]
    return doc, data[off + 8:off + 8 + blen]


def slim(doc, blob):
    doc['animations'] = [a for a in doc.get('animations', []) if a['name'] in KEEP]
    missing = set(KEEP) - {a['name'] for a in doc['animations']}
    assert not missing, 'missing clips: %s' % missing

    used = set()
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p:
                used.add(p['indices'])
            for t in p.get('targets', []):
                used.update(t.values())
    for s in doc.get('skins', []):
        if 'inverseBindMatrices' in s:
            used.add(s['inverseBindMatrices'])
    for a in doc['animations']:
        for s in a['samplers']:
            used.update((s['input'], s['output']))

    acc_map = {old: new for new, old in enumerate(sorted(used))}
    accessors = [doc['accessors'][i] for i in sorted(used)]
    assert not any('sparse' in a for a in accessors), 'sparse accessors are not handled'

    views_used = sorted({a['bufferView'] for a in accessors if 'bufferView' in a} |
                        {i['bufferView'] for i in doc.get('images', []) if 'bufferView' in i})
    view_map = {old: new for new, old in enumerate(views_used)}
    out = bytearray()
    views = []
    for old in views_used:
        v = dict(doc['bufferViews'][old])
        start = v.get('byteOffset', 0)
        while len(out) % 4:
            out.append(0)
        v['byteOffset'] = len(out)
        v['buffer'] = 0
        out += blob[start:start + v['byteLength']]
        views.append(v)
    while len(out) % 4:
        out.append(0)

    for a in accessors:
        if 'bufferView' in a:
            a['bufferView'] = view_map[a['bufferView']]
    for i in doc.get('images', []):
        if 'bufferView' in i:
            i['bufferView'] = view_map[i['bufferView']]
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in doc.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for a in doc['animations']:
        for s in a['samplers']:
            s['input'], s['output'] = acc_map[s['input']], acc_map[s['output']]

    doc['accessors'], doc['bufferViews'] = accessors, views
    doc['buffers'] = [{'byteLength': len(out)}]
    return doc, bytes(out)


def write_glb(path, doc, blob):
    js = json.dumps(doc, separators=(',', ':')).encode('utf8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)


if __name__ == '__main__':
    files = [f for f in sorted(os.listdir(SRC)) if f.endswith('.glb')]
    if not files:
        sys.exit('no .glb files in ' + SRC)
    for f in files:
        doc, blob = read_glb(os.path.join(SRC, f))
        before = os.path.getsize(os.path.join(SRC, f))
        doc, blob = slim(doc, blob)
        write_glb(os.path.join(DST, f), doc, blob)
        print('%-18s %5.2f MB -> %5.2f MB' % (f, before / 1e6, os.path.getsize(os.path.join(DST, f)) / 1e6))
