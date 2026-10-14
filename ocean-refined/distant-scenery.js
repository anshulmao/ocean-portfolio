import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { waveHeight, sea } from './shaders.js';

// Original low-detail coastal geometry. All distances are world metres.
export function createDistantScenery({ economy = false, skyMap } = {}) {
  const root = new THREE.Group();
  root.name = 'Distant islands and passing ships';
  const rock = new THREE.MeshStandardMaterial({ color: '#577268', roughness: 1 });
  const green = new THREE.MeshStandardMaterial({ color: '#354f43', roughness: 1 });
  const hull = new THREE.MeshStandardMaterial({ color: '#334b53', roughness: .85 });
  const cream = new THREE.MeshStandardMaterial({ color: '#e6e1cd', roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#586569', roughness: .8 });
  const cargo = new THREE.MeshStandardMaterial({ color: '#796b5e', roughness: 1 });
  const sail = new THREE.MeshStandardMaterial({ color: '#f1ebdc', roughness: .95, side: THREE.DoubleSide });

  // Blend distant silhouettes into the actual directional sky, before tone
  // mapping. A fixed cyan fog color made islands glow against dusk/night skies.
  if (skyMap) for (const material of [rock, green, hull, cream, metal, cargo, sail]) {
    material.fog = false;
    material.onBeforeCompile = shader => {
      shader.uniforms.uCoastSky = skyMap;
      shader.vertexShader = 'varying vec3 vCoastRay;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCoastRay=(modelMatrix*vec4(transformed,1.0)).xyz-cameraPosition;');
      shader.fragmentShader = 'uniform sampler2D uCoastSky; varying vec3 vCoastRay;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 coastRay=normalize(vec3(vCoastRay.x,max(vCoastRay.y,0.0),vCoastRay.z));
        vec2 coastP=coastRay.xz/(abs(coastRay.x)+coastRay.y+abs(coastRay.z));
        vec3 coastSky=texture2D(uCoastSky,vec2(coastP.x+coastP.y,coastP.x-coastP.y)*.498047+.5).rgb;
        float coastHaze=1.0-exp(-length(vCoastRay)*.0019);
        outgoingLight=mix(outgoingLight,coastSky*coastSky*4.0,coastHaze);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'directional-coast-haze-v1';
  }

  function mesh(geometry, material, parent = root) {
    const result = new THREE.Mesh(geometry, material);
    parent.add(result);
    return result;
  }
  function combine(parts, material, parent = root) {
    const geometry = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    return mesh(geometry, material, parent);
  }
  function box(x, y, z, sx, sy, sz) {
    return new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
  }
  function cylinder(x, y, z, radius, height) {
    return new THREE.CylinderGeometry(radius, radius, height, 6).translate(x, y, z);
  }
  function triangles(points) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  // Raised interior strips meet an irregular shoreline beneath the water.
  // Multiple peaks and a smooth beach apron read as terrain rather than cones.
  const islands = [
    { x: -211.4, z: -326.2, w: 75, d: 33, h: 17, phase: .3 },
    { x: -376.6, z: -547.4, w: 96, d: 46, h: 25, phase: 2.1 },
    { x: 239.4, z: -378, w: 86, d: 38, h: 11, phase: 3.5 },
    { x: 393.4, z: -593.6, w: 105, d: 49, h: 23, phase: 4.7 },
  ];
  const terrainParts = [], treeParts = [];
  islands.forEach((island, islandIndex) => {
    const columns = economy ? 28 : 42, rows = economy ? 8 : 12;
    const positions = [], indices = [];
    const elevation = (u, v) => {
      const outline = Math.pow(Math.max(0, Math.sin(Math.PI * u)), .65);
      const cross = Math.pow(Math.max(0, Math.sin(Math.PI * v)), 1.25);
      const ridge = .42 + .33 * Math.exp(-Math.pow((u - .35) / .13, 2))
        + .42 * Math.exp(-Math.pow((u - .64) / .16, 2));
      const variation = 1 + .07 * Math.sin(u * 39 + v * 13 + island.phase);
      return island.h * outline * cross * ridge * variation - .65;
    };
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= columns; i++) {
        const u = i / columns;
        const taper = .4 + .6 * Math.pow(Math.sin(Math.PI * u), .6);
        positions.push(island.x + (u - .5) * island.w,
          elevation(u, v), island.z + (v - .5) * island.d * taper
          + Math.sin(u * 16 + island.phase) * 1.5);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i, b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    terrainParts.push(geometry.toNonIndexed()); geometry.dispose();
    // A broken, restrained canopy line gives the closer ridges a living edge.
    if (islandIndex === 0 || islandIndex === 2) {
      for (let i = 0; i < (economy ? 11 : 17); i++) {
        const u = .17 + i / (economy ? 11 : 17) * .65, v = .43;
        const h = .8 + .55 * (1 + Math.sin(i * 2.7 + island.phase));
        const crown = new THREE.ConeGeometry(.75 + h * .25, h, 5).toNonIndexed();
        crown.translate(island.x + (u - .5) * island.w, elevation(u, v) + h * .36,
          island.z + (v - .5) * island.d * (.4 + .6 * Math.pow(Math.sin(Math.PI * u), .6))
          + Math.sin(u * 16 + island.phase) * 1.5);
        treeParts.push(crown);
      }
    }
  });
  combine(terrainParts, rock);
  combine(treeParts, green);

  // Hull cross sections keep the bow pointed and the waterline narrow.
  function shipHull(length, width, height) {
    const shape = new THREE.Shape();
    shape.moveTo(-length * .5, 0);
    shape.lineTo(-length * .36, -width * .5);
    shape.lineTo(length * .34, -width * .5);
    shape.lineTo(length * .5, 0);
    shape.lineTo(length * .34, width * .5);
    shape.lineTo(-length * .36, width * .5);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -.3, 0);
    return geometry;
  }
  const yacht = new THREE.Group(); yacht.name = 'Distant sailing yacht'; root.add(yacht);
  mesh(shipHull(9, 2.3, .85), hull, yacht);
  combine([box(-.3, .6, 0, 4.5, .25, 1.65), box(-.6, 1, 0, 2.3, .7, 1.3)], cream, yacht);
  combine([cylinder(.4, 4.8, 0, .075, 9), box(-1.8, 1.4, 0, 4.4, .09, .09)], metal, yacht);
  mesh(triangles([
    .36, 1.52, .06, .36, 9, .06, -3.6, 1.52, .45,
    .6, 1.4, -.06, 3.5, 1.4, -.25, .6, 7.8, -.06,
  ]), sail, yacht);
  const freighter = new THREE.Group(); freighter.name = 'Far coastal freighter'; root.add(freighter);
  mesh(shipHull(24, 4.6, 1.65), hull, freighter);
  combine([box(-7.1, 2.5, 0, 4.2, 2.6, 3.7), box(-7.4, 4.1, 0, 3.3, .7, 4),
    box(-7.8, 5.4, 0, .14, 2, .14)], cream, freighter);
  combine([box(-5.1, 4.2, 0, .85, 1.8, .85), box(-7.3, 3.96, -2.02, 2.8, .35, .05)], metal, freighter);
  combine([box(0, 2, -.95, 4.8, 1.55, 1.6), box(0, 2, .95, 4.8, 1.55, 1.6),
    box(5.2, 2, -.95, 4.8, 1.55, 1.6), box(5.2, 2, .95, 4.8, 1.55, 1.6)], cargo, freighter);
  yacht.rotation.y = -.18; freighter.rotation.y = .08;

  const counts = { islands: islands.length, ships: 2, meshes: 0, triangles: 0 };
  root.traverse(object => {
    if (!object.isMesh) return;
    counts.meshes++;
    counts.triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  function update(elapsed, night, underwater) {
    root.visible = underwater < .4;
    if (!root.visible) return;
    // Very slow bounded crossings avoid jumps on long-running previews.
    yacht.position.set(89 + Math.sin(elapsed * .0018) * 23, 0, -188);
    freighter.position.set(-83 - Math.sin(elapsed * .0009) * 36, 0, -355);
    for (const boat of [yacht, freighter]) {
      boat.position.y = waveHeight(boat.position.x, boat.position.z, elapsed) * .16;
      // A heavier sea rolls and pitches the hulls; rain haze (scene fog) hides them with the islands.
      const heave = 1 + (sea.gain - 1) * 9 + sea.swell * 14;
      boat.rotation.z = Math.sin(elapsed * .25 + boat.position.x) * .003 * heave;
      boat.rotation.x = Math.sin(elapsed * .19 + boat.position.z) * .0016 * (heave - 1);
    }
  }
  update(0, 0, 0);
  return { root, update, counts };
}
