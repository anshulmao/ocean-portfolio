import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { simplify, breathe, turn as nextTask, floatSkinIndices, modelBytes } from './assets.js';
import { buildHelmet, buildNursery, buildNautilus, buildDescentLine } from './landmark-builds.js';
import { RESUME_SITE } from './reef.js';

const ASSET = new URL('./assets/models/', import.meta.url);
// The portfolio landmarks are built in code (landmark-builds.js); only the coral habitats are downloaded.
const MODEL_FILES = {
  coral: [
    'coral_waterverbruik_gezond.glb', 'coral_landbouw_gezond.glb',
    'coral_anker_kleur.glb', 'coral_uitstoot_gezond.glb', 'coral_visnet_gezond_fish.glb'
  ]
};
const CORAL_CACHE_SCHEMA = 1;
const CORAL_CACHE = new URL('./assets/models/prepared-corals/', import.meta.url);
// Placing a model walks every triangle of it over the terrain: tens of milliseconds for a hull, and it may happen while
// the visitor is still looking at the surface. The long loops hand the frame loop a turn every few milliseconds:
// breathe() where a slice may be over, nextTask() (turn, in assets.js) to end one outright.

function visibleBounds(object) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().makeEmpty();
  const visit = (node, parentVisible = true) => {
    if (!parentVisible || !node.visible) return;
    if (node.isMesh && node.geometry) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      if (node.geometry.boundingBox) bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
    for (const child of node.children) visit(child, true);
  };
  visit(object);
  return bounds;
}

function normalizeWrapper(wrapper, targetLength, alignBottom = true, minScale = .01, maxScale = Infinity) {
  const originalBounds = visibleBounds(wrapper);
  const originalSize = originalBounds.getSize(new THREE.Vector3());
  const span = Math.max(originalSize.x, originalSize.z, originalSize.y, .001);
  const scale = THREE.MathUtils.clamp(targetLength / span, minScale, maxScale);
  wrapper.scale.multiplyScalar(scale);
  const scaledBounds = visibleBounds(wrapper);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, alignBottom ? -scaledBounds.min.y : -center.y, -center.z);
  scaledBounds.translate(offset);
  wrapper.position.add(offset);
  wrapper.updateWorldMatrix(true, true);
  return { box: visibleBounds(wrapper), offset, scale };
}

// The prepared corals, downloaded while the world under the water is still being built (world.js startUnderwater):
// placing them needs the finished reef, fetching and checking them does not. Only the published build's gzipped
// copies are fetched this way (modelBytes). The landmarks themselves are built in code and download nothing.
const coralsEarly = new Map();
const earlyLoader = new GLTFLoader();
// Only the downloads, from the start of the page (world.js boot).
export function fetchLandmarkFiles(economy = false) {
  coralFiles(economy).catch(() => {});
}
// Settles when the prepared coral files are in (or could not be fetched): what follows them on the connection (the
// creature set, world.js prefetchEnrichment) does not compete with what a first dive waits for. The coral checks go on behind.
export function prefetchLandmarks(economy = false) {
  fetchLandmarkFiles(economy);
  preparedCoralData(economy).catch(() => {});
  return coralFiles(economy).then(files => files.geometry).catch(() => {});
}

// The prepared coral cache (tools/prepare-corals.mjs), checked against its sources and parsed: everything about it that
// does not need the reef. Rejects when the cache cannot be used; the corals are then built from their source models.
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
// Its recipe and its geometry (most of the bytes), fetched ahead of the checks below; used only once they pass.
const coralFetched = new Map();
function coralFiles(economy) {
  const variant = economy ? 'economy' : 'full';
  if (!coralFetched.has(variant)) coralFetched.set(variant, (async () => {
    const response = await fetch(new URL(`${variant}.json`, CORAL_CACHE), { cache: 'no-cache' });
    if (!response.ok) throw Error('Prepared coral metadata unavailable');
    const metadata = await response.json();
    if (metadata.schema !== CORAL_CACHE_SCHEMA || metadata.variant !== variant || metadata.habitats.length !== 15 || metadata.coralLoaded !== 5) throw Error('Prepared coral recipe mismatch');
    if (metadata.sources?.length !== 2 || !['reef.js', 'model-scene.js'].every(file => metadata.sources.some(source => source.file === file)) || metadata.assets?.length !== MODEL_FILES.coral.length || !MODEL_FILES.coral.every(file => metadata.assets.some(asset => asset.file === file))) throw Error('Incomplete prepared coral input validators');
    // Gzipped where the build put a copy (modelBytes, assets.js); checked byte for byte either way.
    const bytesURL = new URL(metadata.glb.file, CORAL_CACHE).href;
    const geometry = modelBytes(bytesURL).then(async bytes => {
      if (bytes && bytes.byteLength === metadata.glb.bytes) return bytes;
      const bytesResponse = await fetch(bytesURL);
      if (!bytesResponse.ok) throw Error('Prepared coral geometry unavailable');
      return bytesResponse.arrayBuffer();
    });
    geometry.catch(() => {});
    return { metadata, geometry };
  })());
  return coralFetched.get(variant);
}
function preparedCoralData(economy) {
  const variant = economy ? 'economy' : 'full';
  if (!coralsEarly.has(variant)) coralsEarly.set(variant, (async () => {
    const { metadata, geometry } = await coralFiles(economy);
    if (!globalThis.crypto?.subtle) throw Error('Source checks unavailable');
    // Code hashes catch changes to the terrain and grounding/LOD recipe.
    // Cheap HEAD validators catch replacement source models without fetching
    // the original 24 MB merely to decide whether the cache is current.
    await Promise.all([
      ...metadata.sources.map(async source => {
        const sourceResponse = await fetch(new URL(source.file, import.meta.url), { cache: 'force-cache' });
        if (!sourceResponse.ok || await sha256(await sourceResponse.arrayBuffer()) !== source.sha256) throw Error(`Coral source changed: ${source.file}`);
      }),
      ...metadata.assets.map(async asset => {
        const head = await fetch(new URL(asset.file, ASSET), { method: 'HEAD', cache: 'no-cache' });
        const length = head.headers.get('content-length'), modified = head.headers.get('last-modified'), etag = head.headers.get('etag');
        // Compression servers may omit HEAD length or report encoded bytes.
        // Their unchanged opaque ETag plus modification date is still a
        // build-recorded validator; absent validators decline the cache.
        const sizeMatches = length !== null && !head.headers.get('content-encoding') && Number(length) === asset.bytes;
        const tagMatches = Boolean(asset.etag && etag === asset.etag);
        if (!head.ok || (!sizeMatches && !tagMatches) || !modified || modified !== asset.lastModified) throw Error(`Coral asset validator changed or unavailable: ${asset.file}`);
      })
    ]);
    const bytes = await geometry;
    if (bytes.byteLength !== metadata.glb.bytes || await sha256(bytes) !== metadata.glb.sha256) throw Error('Prepared coral geometry checksum mismatch');
    await nextTask();
    const gltf = await earlyLoader.parseAsync(bytes, CORAL_CACHE.href);
    return { metadata, gltf, bytes: bytes.byteLength };
  })());
  return coralsEarly.get(variant);
}

function report(onStatus, id, status, extra = {}) {
  onStatus?.({ id, status, ...extra });
}

export function createModelScene({ reef, terrainHeightAt, collisions, economy = false, onStatus, preparedCorals = true } = {}) {
  const root = new THREE.Group();
  root.name = 'Uploaded ocean landmarks';
  // What shows above the water: the descent line's buoy. world.js adds it to the scene beside root, which is hidden at the surface.
  const surface = new THREE.Group();
  surface.name = 'Landmark surface markers';
  const loader = new GLTFLoader();
  const landmarkGroups = new Map();
  // The built landmarks by id (landmark-builds.js): their reveals and per-frame motion.
  const built = new Map();
  const coralCopies = [];
  const coralBatches = [];
  const coralProxyRecords = [];
  const coralCache = { status: 'idle', reason: '', bytes: 0, habitats: 0, batches: 0, durationMs: 0 };
  let loadPromise = null;
  let disposed = false;
  let motionEnabled = false;
  let coralLoaded = 0;
  let reefFishCount = 0;
  let reefFishGroups = 0;
  let loaded = 0;
  let failed = 0;

  // Each approach point faces an open lane, away from the landmark proxy.
  const floorAt = (x, z) => terrainHeightAt?.(x, z) ?? -12;
  const landmarks = [
    { id: 'about', position: [-12, floorAt(-12, -15) + 1.4, -15], interactionPosition: [-6.8, floorAt(-12, -15) + 5.3, -15], maxRange: 6.2 },
    { id: 'experience', position: [-18, floorAt(-18, -82) + 1.3, -82], interactionPosition: [-12, floorAt(-18, -82) + 4.3, -82], maxRange: 6.5 },
    { id: 'projects', position: [18, floorAt(18, -39) + 1.6, -39], interactionPosition: [24, floorAt(18, -39) + 4.4, -39], maxRange: 6.5 },
    // The résumé slate hangs at safety-stop depth on the descent line (reef.js RESUME_SITE), not on the sand.
    { id: 'resume', position: [...RESUME_SITE.position], interactionPosition: [RESUME_SITE.position[0] + 2.8, RESUME_SITE.position[1], RESUME_SITE.position[2]], maxRange: 4 }
  ];

  const positions = new Map(landmarks.map(item => [item.id, item.position]));
  const groundPosition = (id) => {
    const [x, , z] = positions.get(id);
    return new THREE.Vector3(x, terrainHeightAt?.(x, z) ?? -12, z);
  };

  // Imported origins are arbitrary. Place the transformed visible geometry,
  // then find its first contact with the actual terrain across its footprint.
  // Triangle interiors matter: a wide hull/base may have only corner vertices.
  async function groundModel(object, x, z, clearance = .015) {
    let box = visibleBounds(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.x += x - center.x;
    object.position.z += z - center.z;
    object.updateWorldMatrix(true, true);
    let lift = -Infinity, samples = 0;
    const contact = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
    const sample = p => {
      const offset = floorAt(p.x, p.z) - p.y;
      if (offset > lift) { lift = offset; contact.copy(p); }
      samples++;
    };
    const meshes = [];
    object.traverseVisible(node => { if (node.isMesh && node.geometry?.attributes.position) meshes.push(node); });
    for (const node of meshes) {
      const geometry = node.geometry, count = geometry.index?.count ?? geometry.attributes.position.count;
      const vertex = (index, out) => node.getVertexPosition(geometry.index ? geometry.index.getX(index) : index, out).applyMatrix4(node.matrixWorld);
      for (let i = 0; i + 2 < count; i += 3) {
        if (i % 24 === 0) { const pause = breathe(); if (pause) await pause; }
        vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
        sample(a); sample(b); sample(c);
        const span = Math.max(Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(a.x-c.x,a.z-c.z),Math.hypot(b.x-c.x,b.z-c.z));
        const steps = Math.min(32, Math.ceil(span / .4));
        for (let u = 0; u <= steps && steps > 1; u++) {
          for (let v = 0; v <= steps-u; v++) {
            point.copy(a).multiplyScalar(1-(u+v)/steps).addScaledVector(b,u/steps).addScaledVector(c,v/steps);
            sample(point);
          }
        }
      }
    }
    if (Number.isFinite(lift)) { object.position.y += lift + clearance; contact.y += lift + clearance; }
    object.updateWorldMatrix(true, true);
    box = visibleBounds(object);
    object.userData.grounding = { samples, clearance, contact: contact.toArray(), min: box.min.toArray(), max: box.max.toArray(), center: box.getCenter(new THREE.Vector3()).toArray() };
    return box;
  }

  // A built landmark sets where it is read from (its focus box's centre) and where the diver hovers to read it.
  function updateLandmark(id, focus, approach) {
    const landmark = landmarks.find(item => item.id === id);
    if (!landmark) return;
    const center = focus.getCenter(new THREE.Vector3());
    landmark.position.splice(0, 3, ...center.toArray());
    landmark.interactionPosition.splice(0, 3, ...approach.toArray());
    landmark.maxRange = Math.max(landmark.maxRange, approach.distanceTo(center) + .9);
  }
  async function groundCoralBases(coral){
    // Authored habitats contain separate coral sculptures at different heights.
    // A single contact for the whole group leaves their other roots suspended.
    const roots=[];const p=new THREE.Vector3(),worldOffset=new THREE.Vector3();
    coral.updateWorldMatrix(true,true);
    coral.traverseVisible(mesh=>{if(mesh.isMesh&&!mesh.isSkinnedMesh&&mesh.geometry?.attributes.position)roots.push(mesh);});
    for(const mesh of roots){
      const box=new THREE.Box3().setFromObject(mesh),height=box.max.y-box.min.y;
      let gap=Infinity,count=0;const contact=new THREE.Vector3();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        if(i%512===0){const pause=breathe();if(pause)await pause;}
        mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
        if(p.y>box.min.y+Math.max(.04,height*.10))continue;
        const candidate=p.y-floorAt(p.x,p.z);if(candidate<gap){gap=candidate;contact.copy(p);}count++;
      }
      if(Number.isFinite(gap)){
        const origin=mesh.getWorldPosition(new THREE.Vector3());worldOffset.copy(origin);worldOffset.y-=gap+.06;
        mesh.position.copy(mesh.parent.worldToLocal(worldOffset));mesh.updateWorldMatrix(true,true);
        contact.y-=gap+.06;mesh.userData.baseGrounding={samples:count,previousGap:gap,clearance:-.06,contact:contact.toArray()};
      }
    }
    coral.userData.groundedRoots=roots.length;
    const box=visibleBounds(coral),first=roots.find(mesh=>mesh.userData.baseGrounding);
    if(first)coral.userData.grounding={samples:roots.reduce((sum,mesh)=>sum+(mesh.userData.baseGrounding?.samples||0),0),clearance:-.06,contact:first.userData.baseGrounding.contact,min:box.min.toArray(),max:box.max.toArray(),center:box.getCenter(new THREE.Vector3()).toArray()};
  }

  function addStaticProxy(box, name) {
    if (!collisions?.addBox || box.isEmpty()) return;
    const bounds = box.clone();
    const scale = bounds.getSize(new THREE.Vector3());
    if (scale.x < .18) { bounds.min.x -= .09; bounds.max.x += .09; }
    if (scale.y < .18) { bounds.min.y -= .09; bounds.max.y += .09; }
    if (scale.z < .18) { bounds.min.z -= .09; bounds.max.z += .09; }
    collisions.addBox(bounds, { mesh: name, imported: true });
    if (name.startsWith('Coral habitat')) coralProxyRecords.push({ min: bounds.min.toArray(), max: bounds.max.toArray(), mesh: name, imported: true });
  }

  function addCoralProxies(object, habitatName) {
    object.updateWorldMatrix(true, true);
    const visit = (node, parentVisible = true) => {
      if (!parentVisible || !node.visible) return;
      if (node.isMesh && node.geometry && !/(sand|ground|base|floor|plane|water)/i.test(node.name || '')) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        if (node.geometry.boundingBox) {
          const bounds = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
          const size = bounds.getSize(new THREE.Vector3());
          // Tiny detail is passable; broad habitat bases become open lanes.
          if (Math.max(size.x, size.z) > .24 && Math.max(size.x, size.z) < 3.2 && size.y > .055) {
            const center = bounds.getCenter(new THREE.Vector3());
            const half = size.multiplyScalar(.39);
            const proxy = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
            addStaticProxy(proxy, `${habitatName} coral`);
          }
        }
      }
      for (const child of node.children) visit(child, true);
    };
    visit(object);
  }

  // The three copies of a habitat stand within a few metres of each other and
  // share their materials, so each trio is baked into one static mesh per
  // material: a dozen meshes for the fifteen habitats, each culled as a
  // cluster, where instancing every sculpture cost a draw call per sculpture.
  // (Baked, not instanced: each sculpture is grounded on its own terrain.)
  // Between one mesh and the next the page gets a frame: baked in one go, this was the longest stall of the load.
  async function batchCoralMeshes() {
    const rootInverse = root.matrixWorld.clone().invert();
    const localMatrix = new THREE.Matrix4(), groups = new Map();
    for (const habitat of coralCopies) {
      habitat.updateWorldMatrix(true, true);
      habitat.traverseVisible(node => {
        if (node.isLight) { node.visible = false; return; }
        if (!node.isMesh || node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length) return;
        if (Array.isArray(node.material) || !node.material || !node.geometry.getAttribute('normal')) return;
        const key = `${node.material.uuid}:${node.renderOrder || 0}`;
        if (!groups.has(key)) groups.set(key, { material: node.material, renderOrder: node.renderOrder, layers: node.layers.mask, nodes: [] });
        groups.get(key).nodes.push(node);
      });
    }
    for (const group of groups.values()) {
      // Only the attributes every sculpture of the group carries are kept.
      const names = ['position', 'normal', 'uv', 'color'].filter(name => group.nodes.every(node => node.geometry.getAttribute(name)));
      const pieces = group.nodes.map(node => {
        const piece = new THREE.BufferGeometry();
        // Plain float copies: the files pack some attributes interleaved or as normalized integers.
        for (const name of names) {
          const source = node.geometry.getAttribute(name), size = source.itemSize;
          let data;
          if (source.isInterleavedBufferAttribute || source.normalized || !(source.array instanceof Float32Array)) {
            data = new Float32Array(source.count * size);
            for (let i = 0; i < source.count; i++) for (let j = 0; j < size; j++) data[i * size + j] = source.getComponent(i, j);
          } else data = source.array.slice(0, source.count * size);
          piece.setAttribute(name, new THREE.BufferAttribute(data, size));
        }
        const index = node.geometry.index ? Array.from(node.geometry.index.array) : Array.from({ length: node.geometry.getAttribute('position').count }, (_, i) => i);
        localMatrix.multiplyMatrices(rootInverse, node.matrixWorld);
        // A mirrored placement turns its triangles inside out; wind them back.
        if (localMatrix.determinant() < 0) for (let i = 0; i < index.length; i += 3) { const swap = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = swap; }
        piece.setIndex(index); piece.applyMatrix4(localMatrix);
        return piece;
      });
      const geometry = pieces.length > 1 ? mergeGeometries(pieces, false) : pieces[0];
      if (!geometry) continue;
      if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, group.material);
      mesh.name = `Coral habitat batch · ${group.material.name || 'coral'}`;
      mesh.renderOrder = group.renderOrder; mesh.layers.mask = group.layers;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      group.nodes.forEach(node => { node.visible = false; });
      // A lighter copy stands in once the whole cluster is ten metres off: the sculptures are dense, and mostly seen far away.
      const batch = { mesh, sphere: geometry.boundingSphere.clone().applyMatrix4(root.matrixWorld), full: geometry, light: null };
      coralBatches.push(batch);
      await nextTask();
      if (disposed) return;
      batch.light = await simplify(geometry, .4, 2500, breathe);
      await nextTask();
      if (disposed) return;
    }
    // The batches now draw every static coral mesh. A habitat with nothing
    // left to show (its rigged fish are hidden) still carried ~180 nodes and
    // ~120 bones through every frame's matrix update, so it leaves the graph.
    for (const habitat of coralCopies) {
      let drawn = false;
      habitat.traverseVisible(node => { if (node.isMesh || node.isPoints || node.isLine) drawn = true; });
      if (!drawn) root.remove(habitat);
    }
  }

  // view: { frustum, eye, range }, or null to show everything. The renderer
  // culls each habitat against the view; the haze range is tested here.
  function cull(view = null) {
    for (const { mesh, sphere, full, light } of coralBatches) {
      const distance = view ? view.eye.distanceTo(sphere.center) - sphere.radius : 0;
      mesh.visible = distance < (view ? view.range : Infinity);
      if (light) { const geometry = distance > 10 ? light : full; if (mesh.geometry !== geometry) mesh.geometry = geometry; }
    }
  }

  // Builds a landmark in place on the terrain, gives it collision boxes and its reading position, and keeps its
  // reveal. The model status counts it as one of the eight models, as the downloaded landmarks were.
  async function placeBuilt(id, key, build, counted = true) {
    await nextTask();
    if (disposed) return;
    const [x, , z] = positions.get(id);
    const site = build({ x, z, floorAt, economy });
    root.add(site.root);
    for (const object of site.free || []) root.add(object);
    if (site.surface) surface.add(site.surface);
    landmarkGroups.set(id, site.root);
    site.root.updateWorldMatrix(true, true);
    for (const [index, box] of site.solids.entries()) addStaticProxy(box, `${id} landmark ${index + 1}`);
    updateLandmark(id, site.focus, site.approach);
    built.set(id, site);
    if (counted) { loaded++; report(onStatus, key, 'loaded', { loaded, total: 8 }); }
    await nextTask();
  }

  async function loadCoral(file, index) {
    const key = `coral-${index + 1}`;
    const gltf = await new Promise(resolve => loader.load(new URL(file, ASSET).href, resolve, undefined, () => resolve(null)));
    if (!gltf || disposed) {
      if (!gltf) { failed++; report(onStatus, key, 'fallback', { loaded, total: 8 }); }
      return;
    }
    await nextTask(); floatSkinIndices(gltf.scene); await nextTask();
    // Coral GLBs can carry animated fish along with the reef sculpture.
    // Hide those branches; schooling fish use the stable instanced marine-life scene.
    gltf.scene.traverse(node => {
      // Some exporter roots are named "Coral5fishfbx" and contain both reef
      // and fish. Hiding that root used to erase the entire coral sculpture.
      const name = node.name || '';
      if (node.isSkinnedMesh || (/fish|tang|clown/i.test(name) && !/coral|fbx/i.test(name))) node.visible = false;
    });
    const habitats = [
      [[-25,-17],[-43,-25],[-18,-27]],
      [[27,-30],[43,-38],[20,-48]],
      [[-29,-45],[-42,-57],[-20,-66]],
      [[31,-57],[43,-70],[17,-78]],
      [[4,-72],[-6,-88],[27,-91]]
    ];
    const yaw = [0, 1.1, 2.7, 4.1, 5.1][index];
    const placements = habitats[index];
    let template = null;
    for (let copyIndex = 0; copyIndex < placements.length; copyIndex++) {
      const [x, z] = placements[copyIndex];
      const ground = terrainHeightAt?.(x, z) ?? -18;
      let coral;
      if (!template) {
        coral = new THREE.Group();
        coral.name = `Coral habitat ${index + 1}.1`;
        coral.position.set(x, ground + .16, z);
        const visual = new THREE.Group();
        visual.rotation.y = yaw;
        visual.add(gltf.scene);
        normalizeWrapper(visual, economy ? 3.7 : 4.2, true, .25, 1.25);
        coral.add(visual);
        template = coral;
      } else {
        // Object3D cloning shares the imported meshes' geometry and materials.
        coral = template.clone(true);
        coral.name = `Coral habitat ${index + 1}.${copyIndex + 1}`;
        coral.position.set(x, ground + .16, z);
        coral.children[0].rotation.y = yaw + copyIndex * 1.37;
        coral.children[0].scale.multiplyScalar(.82 + (copyIndex % 2) * .12);
      }
      root.add(coral);
      coral.updateWorldMatrix(true, true);
      await groundModel(coral, x, z);
      await groundCoralBases(coral);
      addCoralProxies(coral, coral.name);
      coralCopies.push(coral);
      // Each copy is grounded triangle by triangle: let a frame through before the next.
      await nextTask();
      if (disposed) return;
    }
    coralLoaded++;
    loaded++;
    report(onStatus, key, 'loaded', { loaded, total: 8 });
  }

  async function loadPreparedCorals() {
    if (!preparedCorals) { coralCache.status = 'disabled'; return false; }
    const started = performance.now();
    coralCache.status = 'checking';
    try {
      // Parsed once (see preparedCoralData); a second scene in the same page builds its corals from the source models.
      const data = await preparedCoralData(economy);
      coralsEarly.delete(economy ? 'economy' : 'full'); coralFetched.delete(economy ? 'economy' : 'full');
      const { metadata, gltf } = data;
      const imported = new Map(); gltf.scene.traverse(node => { if (node.isMesh) imported.set(node.name, node); });
      const prepared = [];
      for (const spec of metadata.batches) {
        const mesh = imported.get(spec.full), lightMesh = imported.get(spec.light);
        if (!mesh?.geometry || !lightMesh?.geometry || Array.isArray(mesh.material)) throw Error('Prepared coral batch missing');
        mesh.name = spec.name; mesh.renderOrder = spec.renderOrder; mesh.layers.mask = spec.layers;
        mesh.material.flatShading = spec.material.flatShading;
        mesh.material.depthWrite = spec.material.depthWrite;
        mesh.material.depthTest = spec.material.depthTest;
        mesh.material.alphaTest = spec.material.alphaTest;
        mesh.material.side = spec.material.side;
        mesh.matrixAutoUpdate = false; mesh.visible = true;
        mesh.geometry.computeBoundingSphere(); lightMesh.geometry.computeBoundingSphere();
        prepared.push({ mesh, sphere: new THREE.Sphere(new THREE.Vector3().fromArray(spec.sphere.center), spec.sphere.radius), full: mesh.geometry, light: spec.lightTriangles ? lightMesh.geometry : null });
      }
      if (disposed) return false;
      for (const batch of prepared) { root.add(batch.mesh); coralBatches.push(batch); }
      for (const proxy of metadata.proxies) {
        collisions?.addBox?.(new THREE.Box3(new THREE.Vector3().fromArray(proxy.min), new THREE.Vector3().fromArray(proxy.max)), { mesh: proxy.mesh, imported: true });
        coralProxyRecords.push(proxy);
      }
      root.userData.preparedCoralHabitats = metadata.habitats;
      coralLoaded = metadata.coralLoaded; loaded += metadata.coralLoaded;
      Object.assign(coralCache, { status: 'hit', bytes: data.bytes, habitats: metadata.habitats.length, batches: prepared.length, durationMs: Math.round(performance.now() - started) });
      report(onStatus, 'prepared-corals', 'loaded', { loaded, total: 8, cache: coralCache });
      return true;
    } catch (error) {
      Object.assign(coralCache, { status: 'fallback', reason: String(error.message || error), durationMs: Math.round(performance.now() - started) });
      return false;
    }
  }

  // Offline preparation uses the same placement, grounding and simplification
  // functions as the live fallback, without loading the interactive landmarks.
  async function prepareCoralCache() {
    const jobs = MODEL_FILES.coral.map((file, index) => () => loadCoral(file, index));
    let cursor = 0;
    const worker = async () => { while (cursor < jobs.length) await jobs[cursor++](); };
    await Promise.all([worker(), worker()]);
    root.updateWorldMatrix(true, true); await batchCoralMeshes();
    if (failed || coralLoaded !== 5 || coralCopies.length !== 15 || !coralBatches.length) throw Error('Incomplete offline coral preparation');
    return {
      batches: coralBatches, proxies: coralProxyRecords,
      habitats: coralCopies.map(habitat => ({ name: habitat.name, position: habitat.position.toArray(), groundedRoots: habitat.userData.groundedRoots, grounding: habitat.userData.grounding })),
      coralLoaded
    };
  }

  function load() {
    if (loadPromise) return loadPromise;
    report(onStatus, 'models', 'loading', { loaded: 0, total: 8 });
    const preparedPromise = loadPreparedCorals();
    const jobs = [
      () => placeBuilt('about', 'about-helmet', buildHelmet),
      () => placeBuilt('projects', 'projects-nursery', buildNursery),
      () => placeBuilt('experience', 'experience-nautilus', buildNautilus),
      () => placeBuilt('resume', 'resume-line', buildDescentLine, false),
      ...MODEL_FILES.coral.map((file, index) => async () => { if (!await preparedPromise) await loadCoral(file, index); })
    ];
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try { await job(); }
        catch (error) {
          failed++;
          report(onStatus, 'optional-model', 'fallback', { message: String(error?.message || error), loaded, total: 8 });
        }
      }
    };
    loadPromise = Promise.all([worker(), worker()]).then(() => {
      root.updateWorldMatrix(true, true);
      if (coralCache.status !== 'hit') return batchCoralMeshes();
    }).then(() => {
      report(onStatus, 'models', 'ready', { loaded, failed, coralLoaded, reefFishGroups, reefFishCount, total: 8 });
      return { loaded, failed, coralLoaded, reefFishGroups, reefFishCount };
    });
    return loadPromise;
  }

  function update(dt, elapsed, playerPosition, night = 0, view = null) {
    // The same 0.1 s cap as the rest of the world, so clips do not slow down against movement below 20 fps.
    const step = Math.min(Math.max(dt || 0, 0), .1);
    motionEnabled = step > 0;
    cull(view);
    const eye = playerPosition?.isVector3 ? playerPosition : null;
    for (const site of built.values()) site.update(step, elapsed, eye);
  }

  // The surface markers move with the waves, above water as well as below (world.js calls this from the sky's update).
  function updateSurface(elapsed) {
    for (const site of built.values()) site.updateSurface?.(elapsed);
  }

  // Opening: the seconds the landmark's reveal takes before its records should open (0 where it is immediate, or motion
  // is off); closing: true. False for a site with nothing built (landmark-interactions.js then opens at once).
  function interact(id, open = true) {
    const site = built.get(id);
    if (!site) return false;
    return site.reveal(open, motionEnabled);
  }

  function dispose() {
    disposed = true;
    for (const site of built.values()) site.dispose?.();
    const release = object => {
      if (!object.isMesh) return;
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose?.());
    };
    root.traverse(release);
    surface.traverse(release);
    for (const batch of coralBatches) { batch.full.dispose(); batch.light?.dispose(); }
    // Habitats detached after batching still own their hidden meshes.
    for (const habitat of coralCopies) if (!habitat.parent) habitat.traverse(release);
  }

  return {
    root, surface, load, update, updateSurface, interact, dispose, landmarks, prepareCoralCache, loadPreparedCorals, coralCache,
    get fishCount() { return reefFishCount; },
    get reefFishGroups() { return reefFishGroups; }
  };
}
