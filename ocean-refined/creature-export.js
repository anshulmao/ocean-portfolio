import * as THREE from './vendor/three.module.min.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { SPECIES, creature, siteLength } from './creature-species.js';
import { CORAL_VARIETIES, buildCoralSpecimen } from './coral-varieties.js';

// The model set as files. An animal is a self-contained GLB: the skinned mesh at true scale (metres), its skeleton
// and every swim clip. A coral is a still colony at true scale. Runs in the page (creature-studio) and in Node
// (tools/export-creature-set.mjs).
export async function creatureGLB(id) {
  const template = creature(id), { object } = template.instantiate();
  object.updateMatrixWorld(true);
  return new GLTFExporter().parseAsync(object, { binary: true, animations: template.clips, onlyVisible: false });
}
/** What the set's manifest records for each animal. */
export function creatureFacts(id) {
  const template = creature(id), spec = template.spec;
  return {
    id, name: spec.name, scientific: spec.scientific, group: spec.group, lengthMetres: spec.length, realLengthMetres: spec.realLength, ...(spec.span ? { discWidthMetres: spec.span, realDiscWidthMetres: spec.realSpan } : {}),
    boundsMetres: template.size.toArray().map(v => Math.round(v * 1000) / 1000), triangles: template.triangles, bones: template.bones,
    clips: template.clips.map(clip => ({ name: clip.name, seconds: Math.round(clip.duration * 1000) / 1000, loop: !clip.userData?.once })), note: spec.note
  };
}
export const creatureIds = () => SPECIES.map(species => species.id);

const ZONES = { shallow: 'Shallow reef, in strong light', mid: 'Mid reef and terraces', deep: 'Deep slope and rock faces' };
/**
 * One coral colony at the site's scale: built at its real width, then enlarged by the same rule as the animals
 * (siteLength), so a colony stands with the reef's own corals and the fish that live round it.
 */
export function coralSpecimen(id) {
  const specimen = buildCoralSpecimen(id), variety = CORAL_VARIETIES.find(entry => entry.id === id);
  specimen.scale.setScalar(siteLength(variety.size) / variety.size); specimen.updateMatrixWorld(true);
  return specimen;
}
/** A coral colony for a file: plain vertex-coloured meshes, without the sway attribute a GLB has no use for. */
export function coralObject(id) {
  const specimen = coralSpecimen(id), variety = CORAL_VARIETIES.find(entry => entry.id === id), group = new THREE.Group(), grow = specimen.scale.x;
  group.name = `coral-${id}`; group.userData = { variety: id, name: variety.name, scientific: variety.scientific, widthMetres: siteLength(variety.size), realWidthMetres: variety.size, up: '+Y', units: 'metres', license: 'Made for this project; no third-party assets' };
  specimen.traverse(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone(); for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: `${id} coral`, vertexColors: true, roughness: node.material.roughness ?? .7, metalness: 0, side: node.material.side }));
    // The colony's enlargement is baked into the mesh, so the file needs no scale on import.
    geometry.applyMatrix4(new THREE.Matrix4().compose(node.position.clone().multiplyScalar(grow), node.quaternion, node.scale.clone().multiplyScalar(grow)));
    mesh.name = `coral-${id}${/sway|soft/i.test(node.material.name || '') ? '_soft' : ''}_mesh`; group.add(mesh);
  });
  return group;
}
export async function coralGLB(id) { const object = coralObject(id); object.updateMatrixWorld(true); return new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: false }); }
export function coralFacts(id) {
  const variety = CORAL_VARIETIES.find(entry => entry.id === id), specimen = buildCoralSpecimen(id);
  // Measured on the vertices that go into the file, not the colony's padded culling box.
  const bounds = new THREE.Box3().setFromObject(coralObject(id), true).getSize(new THREE.Vector3()).toArray();
  return { id: `coral-${id}`, name: variety.name, scientific: variety.scientific, group: 'coral', widthMetres: siteLength(variety.size), realWidthMetres: variety.size, boundsMetres: bounds.map(v => Math.round(v * 1000) / 1000), triangles: Math.round(specimen.userData.triangles), zone: variety.zone, note: ZONES[variety.zone] };
}
export const coralIds = () => CORAL_VARIETIES.map(variety => variety.id);
