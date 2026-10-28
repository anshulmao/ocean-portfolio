"""Lossless WebP for the landmark models' PNG textures, and one copy of a texture a model carries twice.

The anchor, the wreck and the chest are downloaded before the first dive can go under (the dive waits for the landmarks,
see world.js), and two thirds of their bytes are PNG textures. Re-encoded as lossless WebP (EXT_texture_webp, which three's
GLTFLoader reads) they decode to the very same pixels: the script decodes every new image and refuses to write a model
whose pixels differ in any channel. JPEG textures stay as they are (a lossless re-encode of a JPEG is larger). An image
whose bytes repeat another one's (the anchor's colour map is stored twice) is dropped and its textures point at the first.

Every WebGL 2 browser decodes WebP (Safari since 14, WebGL 2 since 15), so the extension is marked required and the PNG
is not kept as a fallback. Run from the repository root (needs Pillow; a one-off, not part of the build):
    python ocean-refined/tools/webp-landmarks.py ocean-refined/assets/models/anchor.glb ...
then update preparedBytes/preparedSHA256 in assets/models/manifest.json (the script prints them).

--economy writes <name>-economy.glb beside each model instead, for economy detail (phones, small machines): every
texture at half its size, each texel the 2x2 average of four (what the GPU's own first mipmap level holds, so a phone
sees what a desktop sees from twice as far away), JPEGs included and every image lossless WebP. A quarter of the texture
bytes to download, decode and upload, and a quarter of the GPU memory they take.
"""
import hashlib, io, json, struct, sys
from PIL import Image

ECONOMY = '--economy' in sys.argv


def read_glb(data):
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
    offset, chunks = 12, {}
    while offset < length:
        size, kind = struct.unpack_from('<II', data, offset)
        chunks[kind] = data[offset + 8: offset + 8 + size]
        offset += 8 + size
    return json.loads(chunks[0x4E4F534A]), chunks.get(0x004E4942, b'')


def write_glb(gltf, binary):
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    return struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(binary), 0x004E4942) + binary


def pixels(data):
    image = Image.open(io.BytesIO(data))
    # The colour profile or gamma a PNG carries would be applied by a browser decoding it; none may be lost silently.
    assert not ({'icc_profile', 'gamma', 'srgb', 'chromaticity'} & set(image.info)) or image.format != 'PNG', 'PNG carries colour metadata'
    mode = 'RGBA' if image.mode in ('RGBA', 'LA', 'PA') or (image.mode == 'P' and 'transparency' in image.info) else 'RGB'
    return image.convert(mode)


def optimise(path):
    original = open(path, 'rb').read()
    gltf, binary = read_glb(original)
    views, images, textures = gltf['bufferViews'], gltf.get('images', []), gltf.get('textures', [])
    view_bytes = lambda index: binary[views[index].get('byteOffset', 0): views[index].get('byteOffset', 0) + views[index]['byteLength']]
    # One image per distinct file: a duplicate's textures point at the first, and the duplicate goes.
    first, remap = {}, {}
    for index, image in enumerate(images):
        digest = hashlib.sha256(view_bytes(image['bufferView'])).hexdigest()
        remap[index] = first.setdefault(digest, index)
    kept = sorted(set(remap.values()))
    renumber = {old: new for new, old in enumerate(kept)}
    # New bytes for each kept image: lossless WebP for a PNG, as long as it is smaller and decodes to the same pixels.
    blobs = []
    for old in kept:
        image, data = images[old], view_bytes(images[old]['bufferView'])
        if ECONOMY:
            source = Image.open(io.BytesIO(data)); source = source.convert('RGBA' if 'A' in source.getbands() or 'transparency' in source.info else 'RGB')
            half = source.resize((max(1, source.width // 2), max(1, source.height // 2)), Image.BOX)
            out = io.BytesIO(); half.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
            assert Image.open(io.BytesIO(out.getvalue())).convert(half.mode).tobytes() == half.tobytes(), f'{path}: image {old} changed in decoding'
            blobs.append((out.getvalue(), 'image/webp')); continue
        if image.get('mimeType') == 'image/png':
            source = pixels(data)
            out = io.BytesIO(); source.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
            webp = out.getvalue()
            again = Image.open(io.BytesIO(webp)).convert(source.mode)
            assert again.size == source.size and again.tobytes() == source.tobytes(), f'{path}: image {old} changed in decoding'
            if len(webp) < len(data): blobs.append((webp, 'image/webp')); continue
        blobs.append((data, image.get('mimeType')))
    # Rebuild the binary chunk: every buffer view that is not an image as it was, then the images.
    image_views = {image['bufferView'] for image in images}
    new_views, new_binary, moved = [], bytearray(), {}
    for index, view in enumerate(views):
        if index in image_views: continue
        new_binary += b'\0' * (-len(new_binary) % 4)
        start = len(new_binary); new_binary += view_bytes(index)
        moved[index] = len(new_views); new_views.append({**view, 'byteOffset': start})
    new_images = []
    for old, (data, mime) in zip(kept, blobs):
        new_binary += b'\0' * (-len(new_binary) % 4)
        start = len(new_binary); new_binary += data
        image = {key: value for key, value in images[old].items() if key not in ('bufferView', 'mimeType', 'uri')}
        new_images.append({**image, 'bufferView': len(new_views), 'mimeType': mime})
        new_views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(data)})
    for accessor in gltf.get('accessors', []):
        if 'bufferView' in accessor: accessor['bufferView'] = moved[accessor['bufferView']]
        sparse = accessor.get('sparse')
        if sparse: sparse['indices']['bufferView'] = moved[sparse['indices']['bufferView']]; sparse['values']['bufferView'] = moved[sparse['values']['bufferView']]
    webp_used = False
    for texture in textures:
        source = renumber[remap[texture['source']]]
        if new_images[source]['mimeType'] == 'image/webp':
            texture.pop('source'); texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': source}; webp_used = True
        else: texture['source'] = source
    gltf['bufferViews'], gltf['images'] = new_views, new_images
    gltf['buffers'] = [{**gltf['buffers'][0], 'byteLength': len(new_binary) + (-len(new_binary) % 4)}]
    if webp_used:
        for key in ('extensionsUsed', 'extensionsRequired'):
            gltf[key] = sorted(set(gltf.get(key, [])) | {'EXT_texture_webp'})
    result = write_glb(gltf, bytes(new_binary))
    target = path[:-4] + '-economy.glb' if ECONOMY else path
    open(target, 'wb').write(result)
    print(json.dumps({'file': target.split('/')[-1], 'before': len(original), 'preparedBytes': len(result), 'preparedSHA256': hashlib.sha256(result).hexdigest(), 'images': f'{len(images)} -> {len(new_images)}'}))


for argument in sys.argv[1:]:
    if not argument.startswith('--'): optimise(argument)
