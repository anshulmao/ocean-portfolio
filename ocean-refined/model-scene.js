import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkinned } from './vendor/SkeletonUtils.js';

const ASSET = new URL('./assets/models/', import.meta.url);
const MODEL_FILES = {
  anchor: 'anchor.glb', ship: 'sunken_ship_low_poly.glb', chest: 'treasure_chest.glb',
  coral: [
    'coral_waterverbruik_gezond.glb', 'coral_landbouw_gezond.glb',
    'coral_anker_kleur.glb', 'coral_uitstoot_gezond.glb', 'coral_visnet_gezond_fish.glb'
  ]
};
const GLOW_COLOR = new THREE.Color('#e3c585');

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

function report(onStatus, id, status, extra = {}) {
  onStatus?.({ id, status, ...extra });
}

export function createModelScene({ reef, terrainHeightAt, collisions, economy = false, onStatus } = {}) {
  const root = new THREE.Group();
  root.name = 'Uploaded ocean landmarks';
  const loader = new GLTFLoader();
  const landmarkGroups = new Map();
  const chests = new Map();
  const coralCopies = [];
  const mixers = [];
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
    { id: 'experience', position: [18, floorAt(18, -39) + 1.6, -39], interactionPosition: [24, floorAt(18, -39) + 4.4, -39], maxRange: 6.5 },
    { id: 'projects', position: [-18, floorAt(-18, -82) + 1.3, -82], interactionPosition: [-12, floorAt(-18, -82) + 4.3, -82], maxRange: 6.5 }
  ];

  const positions = new Map(landmarks.map(item => [item.id, item.position]));
  const groundPosition = (id) => {
    const [x, , z] = positions.get(id);
    return new THREE.Vector3(x, terrainHeightAt?.(x, z) ?? -12, z);
  };

  // Imported origins are arbitrary. Place the transformed visible geometry,
  // then find its first contact with the actual terrain across its footprint.
  // Triangle interiors matter: a wide hull/base may have only corner vertices.
  function groundModel(object, x, z, clearance = .015) {
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
    object.traverseVisible(node => {
      if (!node.isMesh || !node.geometry?.attributes.position) return;
      const geometry = node.geometry, count = geometry.index?.count ?? geometry.attributes.position.count;
      const vertex = (index, out) => node.getVertexPosition(geometry.index ? geometry.index.getX(index) : index, out).applyMatrix4(node.matrixWorld);
      for (let i = 0; i + 2 < count; i += 3) {
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
    });
    if (Number.isFinite(lift)) { object.position.y += lift + clearance; contact.y += lift + clearance; }
    object.updateWorldMatrix(true, true);
    box = visibleBounds(object);
    object.userData.grounding = { samples, clearance, contact: contact.toArray(), min: box.min.toArray(), max: box.max.toArray(), center: box.getCenter(new THREE.Vector3()).toArray() };
    return box;
  }

  function updateLandmark(id, box) {
    const landmark = landmarks.find(item => item.id === id);
    if (!landmark) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const approach = center.clone();
    // Frame the whole landmark from outside its proxy, including first-person eye offset.
    if (size.x <= size.z) approach.x = center.x + Math.max(size.x*.5+2.6, Math.max(size.y,size.z)*1.22+1);
    else approach.z = center.z + Math.max(size.z*.5+2.6, Math.max(size.y,size.x)*1.22+1);
    approach.y = Math.max(floorAt(approach.x, approach.z) + 2.8, center.y + .6);
    landmark.position.splice(0, 3, ...center.toArray());
    landmark.interactionPosition.splice(0, 3, ...approach.toArray());
    landmark.maxRange = Math.max(landmark.maxRange, approach.distanceTo(center) + .9);
  }
  function groundCoralBases(coral){
    // Authored habitats contain separate coral sculptures at different heights.
    // A single contact for the whole group leaves their other roots suspended.
    const roots=[];const p=new THREE.Vector3(),worldOffset=new THREE.Vector3();
    coral.updateWorldMatrix(true,true);
    coral.traverseVisible(mesh=>{if(mesh.isMesh&&!mesh.isSkinnedMesh&&mesh.geometry?.attributes.position)roots.push(mesh);});
    for(const mesh of roots){
      const box=new THREE.Box3().setFromObject(mesh),height=box.max.y-box.min.y;
      let gap=Infinity,count=0;const contact=new THREE.Vector3();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
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

  function batchCoralMeshes() {
    const identity = new WeakMap();
    let nextIdentity = 1;
    const idFor = object => {
      let id = identity.get(object);
      if (!id) { id = nextIdentity++; identity.set(object, id); }
      return id;
    };
    const batches = new Map();
    const rootInverse = root.matrixWorld.clone().invert();
    const localMatrix = new THREE.Matrix4();
    for (const habitat of coralCopies) {
      habitat.updateWorldMatrix(true, true);
      habitat.traverseVisible(node => {
        if (node.isLight) { node.visible = false; return; }
        if (!node.isMesh || node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (!materials.length || materials.some(material => !material)) return;
        const key = [idFor(node.geometry), ...materials.map(idFor), node.renderOrder || 0,
          node.castShadow ? 1 : 0, node.receiveShadow ? 1 : 0].join(':');
        let batch = batches.get(key);
        if (!batch) {
          batch = { geometry: node.geometry, material: node.material, name: node.name || 'coral mesh', nodes: [], matrices: [], castShadow: node.castShadow, receiveShadow: node.receiveShadow, renderOrder: node.renderOrder, layers: node.layers.mask };
          batches.set(key, batch);
        }
        localMatrix.multiplyMatrices(rootInverse, node.matrixWorld);
        batch.nodes.push(node);
        batch.matrices.push(localMatrix.clone());
      });
    }
    for (const batch of batches.values()) {
      if (!batch.matrices.length) continue;
      const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      instances.name = `Coral habitat batch · ${batch.name}`;
      instances.castShadow = batch.castShadow;
      instances.receiveShadow = batch.receiveShadow;
      instances.renderOrder = batch.renderOrder;
      instances.layers.mask = batch.layers;
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      batch.matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
      instances.computeBoundingSphere();
      root.add(instances);
      batch.nodes.forEach(node => { node.visible = false; });
    }
  }

  function addModel(id, gltf, targetLength, rotationY = 0, bottom = true, positionOverride = null) {
    const wrapper = new THREE.Group();
    wrapper.name = `${id} placement wrapper`;
    const model = gltf.scene;
    model.name = `${id} imported GLB`;
    wrapper.add(model);
    wrapper.rotation.y = rotationY;
    normalizeWrapper(wrapper, targetLength, bottom, .01, 6);
    const pos = positionOverride?.isVector3 ? positionOverride.clone() : groundPosition(id);
    wrapper.position.add(pos);
    root.add(wrapper);
    landmarkGroups.set(id, wrapper);
    wrapper.updateMatrixWorld(true);
    const box = bottom ? groundModel(wrapper, pos.x, pos.z) : visibleBounds(wrapper);
    updateLandmark(id, box);
    return { wrapper, model, box };
  }

  function openChest(id, open) {
    const chest = chests.get(id);
    if (!chest) return false;
    chest.open = !!open;
    const settle = action => {
      if (!action) return;
      action.reset().play();
      if (!motionEnabled) {
        action.time = action.getClip().duration;
        action.paused = true;
        chest.mixer.update(0);
      }
    };
    if (chest.open) {
      chest.closeAction?.stop();
      settle(chest.openAction);
    } else {
      chest.openAction?.stop();
      settle(chest.closeAction);
    }
    return true;
  }

  function loadOne(key, file, place) {
    return new Promise(resolve => {
      loader.load(new URL(file, ASSET).href, gltf => {
        if (disposed) { resolve(null); return; }
        try {
          place(gltf);
          loaded++;
          report(onStatus, key, 'loaded', { loaded, total: 8 });
        } catch (error) {
          failed++;
          report(onStatus, key, 'fallback', { message: String(error?.message || error), loaded, total: 8 });
        }
        resolve(gltf);
      }, undefined, error => {
        failed++;
        report(onStatus, key, 'fallback', { message: String(error?.message || error), loaded, total: 8 });
        resolve(null);
      });
    });
  }

  async function loadCoral(file, index) {
    const key = `coral-${index + 1}`;
    const gltf = await new Promise(resolve => loader.load(new URL(file, ASSET).href, resolve, undefined, () => resolve(null)));
    if (!gltf || disposed) {
      if (!gltf) { failed++; report(onStatus, key, 'fallback', { loaded, total: 8 }); }
      return;
    }
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
      groundModel(coral, x, z);
      groundCoralBases(coral);
      addCoralProxies(coral, coral.name);
      coralCopies.push(coral);
    }
    coralLoaded++;
    loaded++;
    report(onStatus, key, 'loaded', { loaded, total: 8 });
  }

  function load() {
    if (loadPromise) return loadPromise;
    report(onStatus, 'models', 'loading', { loaded: 0, total: 8 });
    const jobs = [
      () => loadOne('about-anchor', MODEL_FILES.anchor, gltf => {
        const { wrapper } = addModel('about', gltf, 3.6, Math.PI * .48);
        wrapper.rotation.z = -.82;
        const box = groundModel(wrapper, -12, -15);
        updateLandmark('about', box);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const shank = new THREE.Box3(center.clone().add(new THREE.Vector3(-size.x * .12, -size.y * .22, -size.z * .12)), center.clone().add(new THREE.Vector3(size.x * .12, size.y * .22, size.z * .12)));
        addStaticProxy(shank, 'fallen anchor shank');
        if (size.x >= size.z) {
          addStaticProxy(new THREE.Box3(center.clone().add(new THREE.Vector3(-size.x * .46, -size.y * .16, -size.z * .12)), center.clone().add(new THREE.Vector3(size.x * .46, size.y * .16, size.z * .12))), 'fallen anchor arms');
        } else {
          addStaticProxy(new THREE.Box3(center.clone().add(new THREE.Vector3(-size.x * .12, -size.y * .16, -size.z * .46)), center.clone().add(new THREE.Vector3(size.x * .12, size.y * .16, size.z * .46))), 'fallen anchor arms');
        }
      }),
      () => loadOne('experience-ship', MODEL_FILES.ship, gltf => {
        const { wrapper, box } = addModel('experience', gltf, 20, -.28);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const hullBottom = box.min.y, hullTop = box.min.y + Math.min(1.55, Math.max(.85, size.y * .22));
        // Two low regions cover the hull and leave a central swim-through open.
        if (size.z >= size.x) {
          const halfX = size.x * .38, halfZ = size.z * .24;
          addStaticProxy(new THREE.Box3(new THREE.Vector3(center.x - halfX, hullBottom, center.z - size.z * .46), new THREE.Vector3(center.x + halfX, hullTop, center.z - halfZ)), 'ship bow hull');
          addStaticProxy(new THREE.Box3(new THREE.Vector3(center.x - halfX, hullBottom, center.z + halfZ), new THREE.Vector3(center.x + halfX, hullTop, center.z + size.z * .46)), 'ship stern hull');
        } else {
          const halfZ = size.z * .38, halfX = size.x * .24;
          addStaticProxy(new THREE.Box3(new THREE.Vector3(center.x - size.x * .46, hullBottom, center.z - halfZ), new THREE.Vector3(center.x - halfX, hullTop, center.z + halfZ)), 'ship bow hull');
          addStaticProxy(new THREE.Box3(new THREE.Vector3(center.x + halfX, hullBottom, center.z - halfZ), new THREE.Vector3(center.x + size.x * .46, hullTop, center.z + halfZ)), 'ship stern hull');
        }
      }),
      () => loadOne('projects-chest-a', MODEL_FILES.chest, gltf => {
        addChest('projects', gltf, 2.45, -.3);
        const secondScene = cloneSkinned(gltf.scene);
        const floor = groundPosition('projects');
        const offset = new THREE.Vector3(2.9, 0, -1.35);
        const secondPosition = floor.add(offset);
        addChest('projects-second', { scene: secondScene, animations: gltf.animations }, 2.05, 1.0, secondPosition);
      }),
      ...MODEL_FILES.coral.map((file, index) => () => loadCoral(file, index))
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
      batchCoralMeshes();
      report(onStatus, 'models', 'ready', { loaded, failed, coralLoaded, reefFishGroups, reefFishCount, total: 8 });
      return { loaded, failed, coralLoaded, reefFishGroups, reefFishCount };
    });
    return loadPromise;
  }

  function addChest(id, gltf, target, yaw, positionOverride = null) {
    const { wrapper, box } = addModel(id, gltf, target, yaw, true, positionOverride);
    const center = box.getCenter(new THREE.Vector3());
    addStaticProxy(new THREE.Box3(center.clone().add(new THREE.Vector3(-.8, -.55, -.72)), center.clone().add(new THREE.Vector3(.8, .72, .72))), `${id} chest`);
    const emissiveMaterials = new Set();
    const emissiveState = [];
    wrapper.traverse(object => {
      if (!object.isMesh) return;
      if (id === 'projects-second') {
        object.material = Array.isArray(object.material)
          ? object.material.map(material => material.clone())
          : object.material.clone();
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (material?.isMeshStandardMaterial && !emissiveMaterials.has(material)) {
          emissiveMaterials.add(material);
          emissiveState.push({ material, color: material.emissive.clone(), intensity: material.emissiveIntensity });
        }
      });
    });
    const glowRingMaterial = new THREE.MeshBasicMaterial({ color: '#e3c585', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, .025, 5, 40), glowRingMaterial);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.set(center.x, box.min.y + .08, center.z);
    glowRing.name = `${id} proximity glow`;
    root.add(glowRing);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const openClip = gltf.animations.find(clip => /open/i.test(clip.name));
    const closeClip = gltf.animations.find(clip => /close/i.test(clip.name));
    const chest = { wrapper, worldCenter: center, mixer, open: false, emissiveState, glowRing, glowRingMaterial,
      openAction: openClip ? mixer.clipAction(openClip) : null,
      closeAction: closeClip ? mixer.clipAction(closeClip) : null };
    if (chest.openAction) chest.openAction.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    if (chest.closeAction) chest.closeAction.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    mixers.push(mixer);
    chests.set(id, chest);
  }

  function update(dt, elapsed, playerPosition, night = 0) {
    const step = Math.min(Math.max(dt || 0, 0), .05);
    motionEnabled = step > 0;
    for (const mixer of mixers) mixer.update(step);
    chests.forEach(chest => {
      const near = playerPosition?.isVector3
        ? 1 - THREE.MathUtils.smoothstep(playerPosition.distanceTo(chest.worldCenter), 2.8, 8)
        : 0;
      chest.emissiveState.forEach(({ material, color, intensity }) => {
        material.emissive.setRGB(color.r*intensity+GLOW_COLOR.r*near*.22,color.g*intensity+GLOW_COLOR.g*near*.22,color.b*intensity+GLOW_COLOR.b*near*.22);
        material.emissiveIntensity = 1;
      });
      chest.glowRingMaterial.opacity = near * .28;
      chest.glowRing.rotation.z = Math.sin(elapsed * .35) * .05;
    });
  }

  function interact(id, open = true) {
    return openChest(id, open);
  }

  function dispose() {
    disposed = true;
    mixers.forEach(mixer => mixer.stopAllAction());
    root.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose?.());
    });
  }

  return {
    root, load, update, interact, dispose, landmarks,
    get fishCount() { return reefFishCount; },
    get reefFishGroups() { return reefFishGroups; }
  };
}
