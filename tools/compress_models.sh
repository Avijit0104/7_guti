#!/usr/bin/env sh
# Compresses the Blender output (models_src/built) into the files the game loads (models/chars),
# using meshoptimizer through gltf-transform (pure JavaScript, no native DLLs).
#   npm install -g @gltf-transform/cli@4.1.1   (or run it with npx)
#   sh tools/compress_models.sh
set -e
GT=${GT:-gltf-transform}
mkdir -p models/chars
for f in female male kanu; do
  $GT dedup models_src/built/$f.glb /tmp/$f.d.glb
  $GT meshopt /tmp/$f.d.glb models/chars/$f.glb --level medium
done
$GT resample models_src/built/anims.glb /tmp/anims.r.glb
$GT meshopt /tmp/anims.r.glb models/chars/anims.glb --level medium
