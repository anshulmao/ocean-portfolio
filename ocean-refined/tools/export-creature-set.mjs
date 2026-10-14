// Writes the model set to assets/models/user-sets/sets/: creature-set/ holds one rigged, animated GLB per animal with its painted
// skin, coral-set/ one still GLB per coral colony, each folder with a manifest of names, sizes, bones and clips. The
// models are made in code (creature-kit.js, creature-species.js, coral-varieties.js); these files are their export
// for a 3D editor or another engine. Run it again after changing a species.
//   node tools/export-creature-set.mjs        (from ocean-refined/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// The exporter works through browser pieces Node does not have: FileReader to read its own buffers back, and a 2D
// canvas to turn a skin texture into PNG. These stand-ins do exactly what it asks of them and no more.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
};
globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(width, height, rgba) {
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length), body = Buffer.concat([Buffer.from(type), data]); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
globalThis.OffscreenCanvas ??= class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return { translate() {}, scale() {}, putImageData: image => { this.image = image; } }; }
  async convertToBlob() { return new Blob([png(this.width, this.height, this.image.data)], { type: 'image/png' }); }
};
const { creatureGLB, creatureFacts, creatureIds, coralGLB, coralFacts, coralIds } = await import('../creature-export.js');

const models = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'models', 'user-sets', 'sets');
const license = 'Made in code for this project; no third-party assets';
async function write(folder, key, ids, glb, facts, header) {
  const out = join(models, folder), manifest = { ...header, license, [key]: [] }; mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const fact = facts(id), buffer = Buffer.from(await glb(id));
    writeFileSync(join(out, `${fact.id}.glb`), buffer); manifest[key].push({ ...fact, file: `${fact.id}.glb`, bytes: buffer.length });
  }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`${folder}: ${ids.length} models, ${(manifest[key].reduce((sum, item) => sum + item.bytes, 0) / 1024).toFixed(0)} KB`);
}
const scale = 'Sized for the site: small reef fish match the schooling fish already in the scene, larger animals keep their order with the gaps squeezed (creature-species.js, siteLength). Real lengths are given alongside.';
await write('creature-set', 'creatures', creatureIds(), creatureGLB, creatureFacts, { units: 'metres', forward: '+Z', up: '+Y', scale });
await write('coral-set', 'corals', coralIds(), coralGLB, coralFacts, { units: 'metres', up: '+Y', base: 'y = 0', scale });
