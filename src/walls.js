// Called after rebuild() — computes which walls clip which based on intersection
function applyClipping(s) {
  const H_avail = H_fixed - KICK;
  // Reset all clip planes
  ['A','B','C','D'].forEach(id => setWallClipPlanes(id, []));

  // ── A vs back walls ──
  // Wall A's main face traces x = (y-KICK)·tan(rA) above the kick (z-independent).
  // It intersects back wall space when its top edge exceeds x=0 (the back wall plane).
  // aTopX = the x-reach of A's top edge.
  const rA = s.aAngle * Math.PI/180;
  const aTopX = H_avail * Math.tan(rA);

  // The boundary between A's space and the back walls is at x = s.bWidth (left edge of B).
  // Intersection occurs when aTopX > 0 (A leans inward at all) since B starts at x=0.
  // Practically we care when A reaches past x=0, which it always does if angle>0.
  // A's leaning face starts at y=KICK (not y=0), so the clip plane must be offset.
  // Plane: x*cos(rA) - (y-KICK)*sin(rA) = 0  => n=(cos,-sin,0), d=KICK*sin(rA)
  const CLIP_EPS = 0.002; // 2mm overlap to avoid visible seam cracks from precision.
  const planeA = new THREE.Plane(
    new THREE.Vector3(Math.cos(rA), -Math.sin(rA), 0),
    KICK * Math.sin(rA) + CLIP_EPS
  );
  // Clip plane to cut A at the back wall plane x=0: normal=(1,0,0), const=0 → keeps x>=0...
  // Actually we want to clip A where it enters back-wall territory: x >= 0 is back wall side.
  // Clip A: keep x <= 0 side... no. Think again:
  // Back walls live at x>=0, z=0 plane. A lives at x=0, z>=0 plane.
  // They intersect at the corner (x=0, z=0) vertical line.
  // If A leans in (+x direction), A's face at height y is at x = y·tan(rA).
  // B's face at height y is at z = y·tan(rB), at x in [0, bWidth].
  // They physically intersect when A's x-reach overlaps B's z-origin corner.
  // Simple: clip B (and C,D) by A's face plane — removes the part of B that's "behind" A.
  // Clip A by the back wall plane (x=0) — removes the part of A past x=0.
  // Wait — plane.constant is the d in n·x + d >= 0.
  // THREE.Plane: n·x + d = 0, CLIPS (hides) points where n·x + d < 0.
  // planeA: n=(cos rA,-sin rA,0), d=0 → hides points where x·cos(rA)-y·sin(rA) < 0
  //   i.e. hides points behind A's face — correct for clipping back walls!
  // For clipping A by back wall: hide the part of A where x > 0 (inside back wall territory)
  //   n=(-1,0,0), d=0 → hides x > 0 ✓ but that hides ALL of A since A leans to +x...
  // Better: clip A at the z=0 plane — hide part of A where z < 0 (behind back wall)
  //   Actually A is at z>0, so we clip A where it would intersect B's face.
  // B's face plane at angle rB: z·cos(rB) - y·sin(rB) = 0, facing -z side
  //   n=(0,-sin(rB),cos(rB))... getting complex. Use simpler geometric clip:
  // Clip A where it crosses into B's volume: A is clipped by the vertical plane x=bWidth
  //   n=(-1,0,0), d=bWidth → hides x > bWidth (keeps x <= bWidth) — clips A's far reach ✓
  const planeClipA = new THREE.Plane(new THREE.Vector3(-1, 0, 0), s.bWidth + CLIP_EPS);

  if (aTopX > 0.01) {
    const rankA = precedence.indexOf('A'), rankB = precedence.indexOf('B');
    if (rankA < rankB) {
      // A has priority → clip back walls by A's face
      ['B','C','D'].forEach(id => setWallClipPlanes(id, [planeA]));
    } else {
      // Back walls have priority → clip A at x=bWidth
      setWallClipPlanes('A', [planeClipA]);
    }
  }
}

// ── Geometry helpers ──
function roofUnderY(z) {
  return H_fixed + 0.001 + z * ROOF_PITCH_TAN;
}

// Flat panel for back walls: w wide, h tall (along face), leaning at r rad from vertical toward +Z.
// Positioned at world (pivotX, startY, startZ), optional Y rotation.
function makeFlatPanel(w, h, r, pivotX, startY, startZ, mat, facingY=0) {
  const g = new THREE.Group();
  g.position.set(pivotX, startY, startZ);
  if (facingY) g.rotation.y = facingY;
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h/2, 0);
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.rotation.x = r;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x88cc66})));
  g.add(mesh);
  g.userData.panelMesh = mesh;
  return g;
}

// Side-wall panel for wall A: depth wide, h tall, leaning at r rad toward +X.
// World position: pivot at (startX, startY, depth/2), rotated -PI/2 around Y.
function makeSidePanelGroup(depth, h, r, startY, startX, mat, mirrorU=false) {
  const g = new THREE.Group();
  g.position.set(startX, startY, depth/2); g.rotation.y = -Math.PI/2;
  const geo = new THREE.PlaneGeometry(depth, h); geo.translate(0, h/2, 0);
  if (mirrorU) {
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    uv.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.rotation.x = -r;  // -r because after -PI/2 Y rotation, +x rotation = lean away; -r = lean toward +X world
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x88cc66})));
  g.add(mesh);
  g.userData.panelMesh = mesh;
  return g;
}

// Side-wall panel with potentially different top heights at z=0 and z=depth.
// hAtZ0/hAtZ1 are vertical panel heights above startY before applying lean.
function makeSidePanelSkewedGroup(depth, hAtZ0, hAtZ1, r, startY, startX, mat, mirrorU=false) {
  const g = new THREE.Group();
  g.position.set(startX, startY, depth/2);
  g.rotation.y = -Math.PI/2;

  const xL = -depth / 2;
  const xR = depth / 2;
  const verts = [
    xL, 0,    0,
    xR, 0,    0,
    xR, hAtZ1, 0,
    xL, hAtZ0, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex([0,1,2, 0,2,3]);
  // Explicit UVs for section texture maps (u = along depth, v = bottom->top).
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(mirrorU ? [
    1, 0,
    0, 0,
    0, 1,
    1, 1,
  ] : [
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.x = -r;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x88cc66})));
  g.add(mesh);
  g.userData.panelMesh = mesh;
  return g;
}

// Side infill: triangular or quad panel from array of {x,y,z} world points
function makeSideInfill(mat, pts) {
  const buf = []; pts.forEach(p => buf.push(p.x, p.y, p.z));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf, 3));
  // Single winding only — material is DoubleSide so no need to duplicate
  if (pts.length === 3) geo.setIndex([0,1,2]);
  else                   geo.setIndex([0,1,2, 0,2,3]);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb) {
    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanZ = Math.max(0.001, bb.max.z - bb.min.z);
    const useXZ = spanX >= spanY;
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (useXZ) {
        uv[i * 2] = (x - bb.min.x) / spanX;
        uv[i * 2 + 1] = (z - bb.min.z) / spanZ;
      } else {
        uv[i * 2] = (z - bb.min.z) / spanZ;
        uv[i * 2 + 1] = (y - bb.min.y) / spanY;
      }
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow=true; return m;
}

function makeSolidFromVerts(verts, indices, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb) {
    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanZ = Math.max(0.001, bb.max.z - bb.min.z);
    const useXZ = spanX >= spanY;
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (useXZ) {
        uv[i * 2] = (x - bb.min.x) / spanX;
        uv[i * 2 + 1] = (z - bb.min.z) / spanZ;
      } else {
        uv[i * 2] = (z - bb.min.z) / spanZ;
        uv[i * 2 + 1] = (y - bb.min.y) / spanY;
      }
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Hanging truncated pyramid (flat top and flat bottom).
function makeFrustumVolume(topW, topD, bottomW, bottomD, height, mat) {
  const tHW = topW * 0.5;
  const tHD = topD * 0.5;
  const bHW = bottomW * 0.5;
  const bHD = bottomD * 0.5;
  const verts = [
    -tHW, 0, -tHD, // top
     tHW, 0, -tHD,
     tHW, 0,  tHD,
    -tHW, 0,  tHD,
    -bHW, -height, -bHD, // bottom
     bHW, -height, -bHD,
     bHW, -height,  bHD,
    -bHW, -height,  bHD,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,       // top
    5, 4, 7, 5, 7, 6,       // bottom
    0, 4, 5, 0, 5, 1,       // front
    1, 5, 6, 1, 6, 2,       // right
    2, 6, 7, 2, 7, 3,       // back
    3, 7, 4, 3, 4, 0,       // left
  ];
  return makeSolidFromVerts(verts, indices, mat);
}

// Corner overhang volume with a 4-vertex top cap (includes an outward "nose" vertex).
// bottomShiftX/Z let the lower footprint follow wall-angle drop so side faces can stay attached.
function makeCornerOverhangVolume(topX, topZ, topOut, bottomX, bottomZ, bottomOut, drop, bottomShiftX, bottomShiftZ, mat) {
  const yTopOut = topOut * ROOF_PITCH_TAN;
  const yTopZ = topZ * ROOF_PITCH_TAN;
  const verts = [
    0.00, 0.00,    0.00,      // 0 top corner point
    topX, 0.00,    0.00,      // 1 top X edge (on wall B plane)
    topOut * 0.90, yTopOut, topOut, // 2 top outward "nose" (pushed further along +X)
    0.00, yTopZ,   topZ,      // 3 top Z edge (on wall A plane)
    0.00 - bottomShiftX, -drop,          0.00 - bottomShiftZ, // 4 bottom corner point
    bottomX - bottomShiftX, -drop,        0.00 - bottomShiftZ, // 5 bottom X edge (on wall B plane)
    bottomOut * 0.80 - bottomShiftX, yTopOut - drop, bottomOut - bottomShiftZ, // 6 bottom outward point
    0.00 - bottomShiftX, yTopZ - drop,   bottomZ - bottomShiftZ, // 7 bottom Z edge (on wall A plane)
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,   // top (quad as 2 triangles)
    5, 4, 7, 5, 7, 6,   // bottom
    // side 0-1 omitted (wall B side; use wall surface instead)
    1, 5, 6, 1, 6, 2,   // side 1-2
    2, 6, 7, 2, 7, 3,   // side 2-3
    // side 3-0 omitted (wall A side; use wall surface instead)
  ];
  return makeSolidFromVerts(verts, indices, mat);
}

// Dart volume: slanted top triangle and elongated point toward wall below.
function makeDartVolume(width, topDepth, topBackDrop, tipDrop, mat) {
  const hw = width * 0.5;
  const verts = [
    -hw, tipDrop,               0.00,     // 0 top-left (on wall plane)
     hw, tipDrop,               0.00,     // 1 top-right (on wall plane)
      0, tipDrop - topBackDrop, topDepth, // 2 top apex (out from wall)
      0, 0,                     0.00,     // 3 lower wall point
  ];
  const indices = [
    0, 1, 2, // top slanted triangle
    0, 3, 1,
    1, 3, 2,
    2, 3, 0,
  ];
  return makeSolidFromVerts(verts, indices, mat);
}

function sectionInfo(wall, section, angleDeg, verticalHeight, bottomY, extra={}) {
  const rad = angleDeg * Math.PI / 180;
  const faceLength = verticalHeight / Math.max(0.0001, Math.cos(rad));
  const horizontalLength = Math.abs(verticalHeight * Math.tan(rad));
  return Object.assign({
    wall,
    section,
    angleDeg,
    faceLength,
    verticalHeight,
    horizontalLength,
    bottomY,
    topY: bottomY + verticalHeight,
  }, extra);
}

function sectionInfoFromCorners(wall, section, angleDeg, verticalHeight, bottomY, BL, BR, TL, TR) {
  const bottomMid = new THREE.Vector3(
    (BL.x + BR.x) * 0.5,
    (BL.y + BR.y) * 0.5,
    (BL.z + BR.z) * 0.5
  );
  const topMid = new THREE.Vector3(
    (TL.x + TR.x) * 0.5,
    (TL.y + TR.y) * 0.5,
    (TL.z + TR.z) * 0.5
  );

  const widthDir = new THREE.Vector3(BR.x - BL.x, BR.y - BL.y, BR.z - BL.z);
  if (widthDir.lengthSq() < 1e-8) widthDir.set(1, 0, 0);
  else widthDir.normalize();

  const faceDir = new THREE.Vector3(topMid.x - bottomMid.x, topMid.y - bottomMid.y, topMid.z - bottomMid.z);
  if (faceDir.lengthSq() < 1e-8) faceDir.set(0, 1, 0);
  else faceDir.normalize();

  const normal = new THREE.Vector3().crossVectors(widthDir, faceDir);
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
  else normal.normalize();

  return sectionInfo(wall, section, angleDeg, verticalHeight, bottomY, {
    faceBottomWorld: bottomMid,
    faceTopWorld: topMid,
    widthDirWorld: widthDir,
    normalWorld: normal,
  });
}

function registerSectionHover(mesh, info) {
  if (!mesh || !info) return;
  mesh.userData.sectionInfo = info;
  hoverTargets.push(mesh);
}

const HOLDABLE_WALL_IDS = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
const HOLD_DENSITY_SCALE = 1.2;

function holdHashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function holdSeededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let v = Math.imul(t ^ (t >>> 15), t | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function getSectionFrame(mesh, info) {
  if (!mesh?.geometry?.attributes?.position) return null;
  const pos = mesh.geometry.attributes.position;
  if (!pos || pos.count < 3) return null;

  mesh.updateWorldMatrix(true, false);
  const verts = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    verts.push(mesh.localToWorld(tmp.clone()));
  }
  if (verts.length < 3) return null;

  const centroid = new THREE.Vector3();
  verts.forEach(v => centroid.add(v));
  centroid.multiplyScalar(1 / verts.length);

  const roomCenter = new THREE.Vector3(W * 0.5, H_fixed * 0.52, D * 0.5);
  const toRoom = roomCenter.clone().sub(centroid);

  const worldQuat = new THREE.Quaternion();
  mesh.getWorldQuaternion(worldQuat);

  const normal = new THREE.Vector3();
  if (info?.wall === 'E') {
    // E is modeled as a thin box panel; holds should always stay on its +X climbing face.
    normal.set(1, 0, 0).applyQuaternion(worldQuat);
  } else if (info?.wall === 'A' || info?.wall === 'B' || info?.wall === 'C' || info?.wall === 'D') {
    // Fixed/side wall sections are plane-based; pin to local +Z to avoid face flips.
    normal.set(0, 0, 1).applyQuaternion(worldQuat);
  } else if (info?.normalWorld && Number.isFinite(info.normalWorld.x)) {
    normal.set(info.normalWorld.x, info.normalWorld.y, info.normalWorld.z);
  } else if ((mesh.geometry.type || '').includes('Box')) {
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
    const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat).normalize();
    const candidates = [
      axisX.clone(),
      axisX.clone().negate(),
      axisZ.clone(),
      axisZ.clone().negate(),
    ];
    let best = candidates[0];
    let bestScore = best.dot(toRoom);
    for (let i = 1; i < candidates.length; i++) {
      const score = candidates[i].dot(toRoom);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    normal.copy(best);
  } else if ((mesh.geometry.type || '').includes('Plane')) {
    normal.set(0, 0, 1).applyQuaternion(worldQuat);
  } else {
    const idx = mesh.geometry.index;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      mesh.localToWorld(a);
      mesh.localToWorld(b);
      mesh.localToWorld(c);
      normal.copy(b).sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() > 1e-10) break;
    }
  }
  if (normal.lengthSq() < 1e-10) return null;
  normal.normalize();
  if (normal.dot(toRoom) < 0) normal.negate();

  const upDir = new THREE.Vector3();
  if (info?.faceBottomWorld && info?.faceTopWorld) {
    upDir.set(
      info.faceTopWorld.x - info.faceBottomWorld.x,
      info.faceTopWorld.y - info.faceBottomWorld.y,
      info.faceTopWorld.z - info.faceBottomWorld.z
    );
  } else {
    upDir.set(0, 1, 0).addScaledVector(normal, -normal.y);
    if (upDir.lengthSq() < 1e-10) {
      upDir.set(0, 1, 0).applyQuaternion(worldQuat);
      upDir.addScaledVector(normal, -upDir.dot(normal));
    }
  }
  if (upDir.lengthSq() < 1e-10) return null;
  upDir.normalize();

  const widthDir = new THREE.Vector3();
  if (info?.widthDirWorld && Number.isFinite(info.widthDirWorld.x)) {
    widthDir.set(info.widthDirWorld.x, info.widthDirWorld.y, info.widthDirWorld.z);
    widthDir.addScaledVector(normal, -widthDir.dot(normal));
  } else {
    widthDir.crossVectors(upDir, normal);
  }
  if (widthDir.lengthSq() < 1e-10) return null;
  widthDir.normalize();
  upDir.crossVectors(normal, widthDir).normalize();

  const origin = verts[0].clone();
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  verts.forEach(v => {
    const rel = v.clone().sub(origin);
    const u = rel.dot(widthDir);
    const vv = rel.dot(upDir);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (vv < minV) minV = vv;
    if (vv > maxV) maxV = vv;
  });
  const width = maxU - minU;
  const height = maxV - minV;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 0.12 || height < 0.20) return null;

  return { origin, widthDir, upDir, normal, minU, maxU, minV, maxV, width, height };
}

function makeHoldGeometry(radius, depth, seed) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const rand = holdSeededRandom(seed);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  const backLimit = -Math.max(radius * 0.62, depth * 0.46);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.multiplyScalar(0.84 + rand() * 0.42);
    p.x += (rand() - 0.5) * radius * 0.26;
    p.y += (rand() - 0.5) * radius * 0.24;
    p.z += (rand() - 0.5) * radius * 0.34;
    if (p.z < backLimit) p.z = backLimit;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildClimbingHolds(group) {
  if (!climbingHoldsEnabled) return;
  if (!group || !Array.isArray(hoverTargets) || !hoverTargets.length) return;

  const sections = hoverTargets.filter(mesh => {
    const info = mesh?.userData?.sectionInfo;
    if (!info) return false;
    if (!HOLDABLE_WALL_IDS.has(info.wall)) return false;
    if (info.hoverKind) return false;
    return true;
  });
  if (!sections.length) return;

  sections.forEach(mesh => {
    const info = mesh.userData.sectionInfo;
    const frame = getSectionFrame(mesh, info);
    if (!frame) return;

    const area = frame.width * frame.height;
    let density = 2.4;
    let minCount = 2;
    let maxCount = 16;
    if (info.wall === 'E') density = 1.6;
    if (info.section === 'Kick') {
      density = 1.2;
      minCount = 1;
      maxCount = 8;
    }
    let count = Math.round(area * density * HOLD_DENSITY_SCALE);
    count = THREE.MathUtils.clamp(
      count,
      minCount,
      Math.max(minCount, Math.round(maxCount * HOLD_DENSITY_SCALE))
    );

    const marginU = Math.min(0.16, frame.width * 0.18);
    const marginVBottom = Math.min(0.26, frame.height * 0.22);
    const marginVTop = Math.min(0.18, frame.height * 0.18);
    const usableU0 = frame.minU + marginU;
    const usableU1 = frame.maxU - marginU;
    const usableV0 = frame.minV + marginVBottom;
    const usableV1 = frame.maxV - marginVTop;
    if (usableU1 <= usableU0 || usableV1 <= usableV0) return;

    // Keep hold layout stable while sliders move: seed by wall+section only.
    const seedBase = holdHashString(`${info.wall}-${info.section}`);
    const rand = holdSeededRandom(seedBase);
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.normal);

    for (let i = 0; i < count; i++) {
      const u = THREE.MathUtils.lerp(usableU0, usableU1, rand());
      const v = THREE.MathUtils.lerp(usableV0, usableV1, rand());
      const radius = 0.028 + rand() * 0.032;
      const depth = radius * (0.95 + rand() * 0.70);
      const holdSeed = (seedBase ^ (i * 2654435761)) >>> 0;
      const holdGeo = makeHoldGeometry(radius, depth, holdSeed);
      const hold = new THREE.Mesh(holdGeo, getHoldMaterial(holdSeed));
      hold.quaternion.copy(baseQuat);
      hold.rotateZ(rand() * Math.PI * 2);
      hold.position.copy(frame.origin)
        .addScaledVector(frame.widthDir, u)
        .addScaledVector(frame.upDir, v)
        .addScaledVector(frame.normal, depth * 0.28 + 0.006);
      hold.castShadow = true;
      hold.receiveShadow = true;
      group.add(hold);
    }
  });
}

function collectVolumeHoldFaces(mesh, normalFilter=null) {
  if (!mesh?.geometry?.attributes?.position) return [];
  mesh.updateMatrixWorld(true);

  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  if (triCount <= 0) return [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  const faces = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : (t * 3);
    const i1 = idx ? idx.getX(t * 3 + 1) : (t * 3 + 1);
    const i2 = idx ? idx.getX(t * 3 + 2) : (t * 3 + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);

    mesh.localToWorld(a);
    mesh.localToWorld(b);
    mesh.localToWorld(c);

    ab.copy(b).sub(a);
    ac.copy(c).sub(a);
    normal.copy(ab).cross(ac);
    const area = normal.length() * 0.5;
    if (area < 1e-6) continue;
    normal.normalize();

    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (normalFilter && !normalFilter(normal, center)) continue;

    faces.push({
      a: a.clone(),
      b: b.clone(),
      c: c.clone(),
      normal: normal.clone(),
      area,
    });
  }
  return faces;
}

function addHoldsToVolumeMesh(group, mesh, seedLabel, count, normalFilter=null) {
  if (!climbingHoldsEnabled || !group || !mesh || count <= 0) return;
  const faces = collectVolumeHoldFaces(mesh, normalFilter);
  if (!faces.length) return;

  let totalArea = 0;
  faces.forEach(f => { totalArea += f.area; });
  if (totalArea <= 1e-6) return;

  const seedBase = holdHashString(`volume-${seedLabel}`);
  const rand = holdSeededRandom(seedBase);
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < count; i++) {
    let pick = rand() * totalArea;
    let face = faces[0];
    for (let j = 0; j < faces.length; j++) {
      pick -= faces[j].area;
      if (pick <= 0) {
        face = faces[j];
        break;
      }
    }

    const r1 = Math.sqrt(rand());
    const r2 = rand();
    const wa = 1 - r1;
    const wb = r1 * (1 - r2);
    const wc = r1 * r2;
    const point = new THREE.Vector3()
      .addScaledVector(face.a, wa)
      .addScaledVector(face.b, wb)
      .addScaledVector(face.c, wc);

    const radius = 0.024 + rand() * 0.026;
    const depth = radius * (0.90 + rand() * 0.65);
    const holdSeed = (seedBase ^ (i * 2654435761)) >>> 0;
    const holdGeo = makeHoldGeometry(radius, depth, holdSeed);
    const hold = new THREE.Mesh(holdGeo, getHoldMaterial(holdSeed + 13));
    hold.quaternion.setFromUnitVectors(zAxis, face.normal);
    hold.rotateZ(rand() * Math.PI * 2);
    hold.position.copy(point).addScaledVector(face.normal, depth * 0.30 + 0.004);
    hold.castShadow = true;
    hold.receiveShadow = true;
    group.add(hold);
  }
}

function buildCeilingPanelHolds(group) {
  if (!climbingHoldsEnabled || !group) return;
  const panelMeshes = [];
  group.traverse(obj => {
    if (obj?.isMesh && obj.userData?.isCeilingPanel) panelMeshes.push(obj);
  });
  if (!panelMeshes.length) return;

  panelMeshes.forEach((mesh, idx) => {
    const box3 = new THREE.Box3().setFromObject(mesh);
    const spanX = Math.max(0.1, box3.max.x - box3.min.x);
    const spanZ = Math.max(0.1, box3.max.z - box3.min.z);
    const approxArea = spanX * spanZ;
    const count = THREE.MathUtils.clamp(
      Math.round(approxArea * 2.0 * HOLD_DENSITY_SCALE),
      4,
      Math.round(20 * HOLD_DENSITY_SCALE)
    );
    addHoldsToVolumeMesh(group, mesh, `ceiling-panel-${idx}`, count, (normal, center) => {
      if (normal.y > -0.30) return false;
      // Keep only underside faces of the 17mm panel.
      const roofUndersideY = roofUnderY(center.z) - CEILING_PLY_THICKNESS;
      return center.y <= roofUndersideY + 0.02;
    });
  });
}

// ── Back-wall section builder (B, C, D) ──
function buildBackSection(group, w, angleDeg, pivotX, roofEdgeZ, wallId) {
  const r = angleDeg * Math.PI/180;
  const r2 = r / 2;  // upper section at half the angle
  const roofBackY = roofUnderY(0);
  const roofEdgeY = roofUnderY(roofEdgeZ);
  const H_base = roofBackY - KICK;
  const H_availAtEdge = roofEdgeY - KICK;
  const matKick = getWallMat(wallId, 'kick');
  const matS1 = getWallMat(wallId, 's1');
  const matS2 = getWallMat(wallId, 's2');
  const xL = pivotX - w/2, xR = pivotX + w/2;

  // Kick
  const kickPanel = makeFlatPanel(w, KICK, 0, pivotX, 0, 0, matKick);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (angleDeg === 0) {
    const mainPanel = makeFlatPanel(w, H_base, 0, pivotX, KICK, 0, matS1);
    group.add(mainPanel);
    registerSectionHover(mainPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', 0, H_base, KICK));
    return;
  }

  const tanR = Math.tan(r);
  const singleDen = Math.max(0.05, 1 - ROOF_PITCH_TAN * tanR);
  const singleH = H_base / singleDen;
  const singleTopZ = singleH * tanR;
  const singleTopY = roofUnderY(singleTopZ);

  if (singleTopZ <= roofEdgeZ + 0.005) {
    // ── Single section ──
    const singlePanel = makeFlatPanel(w, singleH/Math.cos(r), r, pivotX, KICK, 0, matS1);
    group.add(singlePanel);
    registerSectionHover(singlePanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, singleH, KICK));
    [xL,xR].forEach(x => group.add(makeSideInfill(matS1,[
      {x, y:KICK,    z:0},
      {x, y:roofBackY, z:0},
      {x, y:singleTopY, z:singleTopZ},
    ])));
    return;
  }

  // ── Two sections ──
  // Upper section runs at r/2. Find split height h1 so that:
  //   h1*tan(r) + h2*tan(r/2) = roofEdgeZ  and  h1 + h2 = H_avail
  // → h1 = (roofEdgeZ - H_avail*tan(r/2)) / (tan(r) - tan(r/2))
  const tanR2 = Math.tan(r2);
  let h1 = (roofEdgeZ - H_availAtEdge * tanR2) / (tanR - tanR2);
  h1 = Math.max(0.1, Math.min(H_availAtEdge * 0.9, h1)); // clamp to sane range
  const h2 = H_availAtEdge - h1;

  const splitY = KICK + h1;
  const splitZ = h1 * tanR;
  const upperH = h2 / Math.cos(r2);

  const lowerPanel = makeFlatPanel(w, h1/Math.cos(r), r,  pivotX, KICK,   0,      matS1);
  const upperPanel = makeFlatPanel(w, upperH,          r2, pivotX, splitY, splitZ, matS2);
  group.add(lowerPanel);
  group.add(upperPanel);
  registerSectionHover(lowerPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, h1, KICK));
  registerSectionHover(upperPanel.userData.panelMesh, sectionInfo(wallId, 'Section 2', angleDeg / 2, h2, splitY));

  [xL,xR].forEach(x => {
    // One quad traces the full side profile: base-back → split-back → split-face → roof-face
    group.add(makeSideInfill(matS1,[
      {x, y:KICK,    z:0},
      {x, y:splitY,  z:0},
      {x, y:splitY,  z:splitZ},
      {x, y:roofEdgeY, z:roofEdgeZ},
    ]));
    // Close the back edge from split to roof underside.
    group.add(makeSideInfill(matS2,[
      {x, y:splitY,  z:0},
      {x, y:roofBackY, z:0},
      {x, y:roofEdgeY, z:roofEdgeZ},
    ]));
  });
}

// ── Side-wall section builder (A) ──
function buildSideSection(group, depth, angleDeg, roofEdgeZ, wallId) {
  const r = angleDeg * Math.PI/180;
  const r2 = r / 2;
  const roofY0 = roofUnderY(0);
  const roofY1 = roofUnderY(depth);
  const H_avail = roofY1 - KICK;
  const matKick = getWallMat(wallId, 'kick');
  const matS1 = getWallMat(wallId, 's1');
  const matS2 = getWallMat(wallId, 's2');
  const mirrorU = wallId === 'A';

  // Kick
  const kickPanel = makeSidePanelGroup(depth, KICK, 0, 0, 0, matKick, mirrorU);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (angleDeg === 0) {
    const mainPanel = makeSidePanelSkewedGroup(depth, roofY0 - KICK, roofY1 - KICK, 0, KICK, 0, matS1, mirrorU);
    group.add(mainPanel);
    registerSectionHover(mainPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', 0, H_avail, KICK));
    return;
  }

  const singleTopX = H_avail * Math.tan(r);

  const addSideInfills = (topXAtZ0, topXAtZ1, splitX, h1_vert) => {
    [0, depth].forEach((z, idx) => {
      const topY = idx === 0 ? roofY0 : roofY1;
      const topX = idx === 0 ? topXAtZ0 : topXAtZ1;
      if (splitX === undefined) {
        group.add(makeSideInfill(matS1,[
          {x:0,    y:KICK,    z},
          {x:0,    y:topY, z},
          {x:topX, y:topY, z},
        ]));
      } else {
        // Full side profile quad: base-back → split-back → split-face → roof-face
        group.add(makeSideInfill(matS1,[
          {x:0,      y:KICK,        z},
          {x:0,      y:KICK+h1_vert,z},
          {x:splitX, y:KICK+h1_vert,z},
          {x:topX,   y:topY,     z},
        ]));
        // Back edge triangle: split-back → roof-back → roof-face
        group.add(makeSideInfill(matS2,[
          {x:0,    y:KICK+h1_vert,z},
          {x:0,    y:topY,     z},
          {x:topX, y:topY,     z},
        ]));
      }
    });
  };

  if (singleTopX <= roofEdgeZ + 0.005) {
    const xTop0 = (roofY0 - KICK) * Math.tan(r);
    const xTop1 = (roofY1 - KICK) * Math.tan(r);
    const singlePanel = makeSidePanelSkewedGroup(
      depth,
      (roofY0 - KICK) / Math.cos(r),
      (roofY1 - KICK) / Math.cos(r),
      r,
      KICK,
      0,
      matS1,
      mirrorU
    );
    group.add(singlePanel);
    registerSectionHover(singlePanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, H_avail, KICK));
    addSideInfills(xTop0, xTop1, undefined, undefined);
    return;
  }

  // Two sections at r and r/2 — solve for split height h1
  const tanR = Math.tan(r), tanR2 = Math.tan(r2);
  let h1 = (roofEdgeZ - H_avail * tanR2) / (tanR - tanR2);
  h1 = Math.max(0.1, Math.min(H_avail * 0.9, h1));
  const h2 = H_avail - h1;
  const splitY = KICK + h1;
  const splitX = h1 * tanR;
  const upperHAtZ0 = roofY0 - splitY;
  const upperHAtZ1 = roofY1 - splitY;
  const topX0 = splitX + upperHAtZ0 * tanR2;
  const topX1 = splitX + upperHAtZ1 * tanR2;

  const lowerPanel = makeSidePanelSkewedGroup(depth, h1 / Math.cos(r), h1 / Math.cos(r), r, KICK, 0, matS1, mirrorU);
  const upperPanel = makeSidePanelSkewedGroup(
    depth,
    upperHAtZ0 / Math.cos(r2),
    upperHAtZ1 / Math.cos(r2),
    r2,
    splitY,
    splitX,
    matS2,
    mirrorU
  );
  group.add(lowerPanel);
  group.add(upperPanel);
  registerSectionHover(lowerPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, h1, KICK));
  registerSectionHover(upperPanel.userData.panelMesh, sectionInfo(wallId, 'Section 2', angleDeg / 2, h2, splitY));
  addSideInfills(topX0, topX1, splitX, h1);
}

// ── Back-wall explicit two-section builder (D) ──
// Section 1 uses angle1Deg up to splitHeight (default 2.0m above kick).
// Section 2 uses angle2Deg from split to roof.
function buildBackSectionTwoStage(group, w, angle1Deg, angle2Deg, pivotX, splitHeight=2.0, wallId='D') {
  const H_base = roofUnderY(0) - KICK;
  const H_avail = H_base;
  const h1 = Math.max(0.1, Math.min(H_avail - 0.1, splitHeight));
  const r1 = angle1Deg * Math.PI/180;
  const r2 = angle2Deg * Math.PI/180;
  const matKick = getWallMat(wallId, 'kick');
  const matS1 = getWallMat(wallId, 's1');
  const matS2 = getWallMat(wallId, 's2');
  const xL = pivotX - w/2;
  const xR = pivotX + w/2;

  const kickPanel = makeFlatPanel(w, KICK, 0, pivotX, 0, 0, matKick);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (Math.abs(angle1Deg) < 0.001 && Math.abs(angle2Deg) < 0.001) {
    const mainPanel = makeFlatPanel(w, H_base, 0, pivotX, KICK, 0, matS1);
    group.add(mainPanel);
    registerSectionHover(mainPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', 0, H_base, KICK));
    return;
  }

  const tanR1 = Math.tan(r1);
  const tanR2 = Math.tan(r2);
  const denom = Math.max(0.05, 1 - ROOF_PITCH_TAN * tanR2);
  const roofZRaw = (h1 * tanR1) + ((H_base - h1) * tanR2);
  const roofZ = THREE.MathUtils.clamp(roofZRaw / denom, 0, D);
  const roofY = roofUnderY(roofZ);
  const roofBackY = roofUnderY(0);
  const h2 = Math.max(0.1, roofY - KICK - h1);
  const splitZ = h1 * Math.tan(r1);

  const lowerPanel = makeFlatPanel(w, h1 / Math.cos(r1), r1, pivotX, KICK, 0, matS1);
  const upperPanel = makeFlatPanel(w, h2 / Math.cos(r2), r2, pivotX, KICK + h1, splitZ, matS2);
  group.add(lowerPanel);
  group.add(upperPanel);
  registerSectionHover(lowerPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angle1Deg, h1, KICK));
  registerSectionHover(upperPanel.userData.panelMesh, sectionInfo(wallId, 'Section 2', angle2Deg, h2, KICK + h1));

  [xL, xR].forEach(x => {
    group.add(makeSideInfill(matS1, [
      {x, y:KICK,    z:0},
      {x, y:KICK+h1, z:0},
      {x, y:KICK+h1, z:splitZ},
    ]));
    group.add(makeSideInfill(matS2, [
      {x, y:KICK+h1, z:0},
      {x, y:roofBackY, z:0},
      {x, y:roofY, z:roofZ},
      {x, y:KICK+h1, z:splitZ},
    ]));
  });
}

// ── Wall F builder — trapezoid face, right-aligned at rightEdgeX, facing -Z ──
// wBot/wTop = bottom/top widths. rightEdgeX = x of right edge (default W).
// panelMaxH = max vertical height above KICK (default H_fixed-KICK).
function buildFrontSection(group, wBot, wTop, angleDeg, roofEdgeDepth, wallId, rightEdgeX=W, panelMaxH=null) {
  const r   = angleDeg * Math.PI/180;
  const r2  = r / 2;
  const H_avail = panelMaxH !== null ? panelMaxH : (H_fixed - KICK);
  const matKick = getWallMat(wallId, 'kick');
  const matS1 = getWallMat(wallId, 's1');
  const matS2 = getWallMat(wallId, 's2');
  const zBase = D;
  const RX = rightEdgeX; // right edge x-coordinate

  // Width at vertical height h above kick (interpolates bot→top over full H_avail)
  const wAt = h => wBot + (wTop - wBot) * h / H_avail;

  // Build a trapezoidal face strip between vertical heights h0 and h1
  const makeTrapFace = (h0, h1, matFace) => {
    const w0 = wAt(h0), w1 = wAt(h1);
    const y0 = KICK + h0, z0 = zBase - h0 * Math.tan(r);
    const y1 = KICK + h1, z1 = zBase - h1 * Math.tan(r);
    const BL = {x:RX-w0, y:y0, z:z0};
    const BR = {x:RX,    y:y0, z:z0};
    const TR = {x:RX,    y:y1, z:z1};
    const TL = {x:RX-w1, y:y1, z:z1};
    const verts = [BL,BR,TR,TL].flatMap(p=>[p.x,p.y,p.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex([0,1,2, 0,2,3]);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ], 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, matFace);
    m.castShadow=true; m.receiveShadow=true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xcc88ff})));
    group.add(m);
  };

  // Side infills
  const makeFSideInfills = (h0, h1, isRight, matFace) => {
    const w0 = wAt(h0), w1 = wAt(h1);
    const y0 = KICK+h0, z0 = zBase - h0*Math.tan(r);
    const y1 = KICK+h1, z1 = zBase - h1*Math.tan(r);
    if (isRight) {
      group.add(makeSideInfill(matFace,[
        {x:RX, y:y0, z:zBase},
        {x:RX, y:y0, z:z0},
        {x:RX, y:y1, z:z1},
        {x:RX, y:y1, z:zBase},
      ]));
    } else {
      const xBot = RX-w0, xTop = RX-w1;
      group.add(makeSideInfill(matFace,[
        {x:xBot, y:y0, z:zBase},
        {x:xBot, y:y0, z:z0},
        {x:xTop, y:y1, z:z1},
        {x:xTop, y:y1, z:zBase},
      ]));
      // Non-vertical left side is represented by one triangulated quad.
      // Avoid adding the same surface again with the opposite diagonal, which causes z-fighting.
    }
  };

  // Kick
  const kv = [RX-wBot,0,zBase, RX,0,zBase, RX,KICK,zBase, RX-wBot,KICK,zBase];
  const kickGeo = new THREE.BufferGeometry();
  kickGeo.setAttribute('position', new THREE.Float32BufferAttribute(kv, 3));
  kickGeo.setIndex([0,1,2, 0,2,3]);
  kickGeo.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2));
  kickGeo.computeVertexNormals();
  const kickMesh = new THREE.Mesh(kickGeo, matKick);
  kickMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(kickGeo), new THREE.LineBasicMaterial({color:0xcc88ff})));
  group.add(kickMesh);

  if (angleDeg === 0) {
    makeTrapFace(0, H_avail, matS1);
    return;
  }

  const singleTopZ = zBase - H_avail * Math.tan(r);
  const roofInnerZ = zBase - roofEdgeDepth;

  if (singleTopZ >= roofInnerZ - 0.005) {
    makeTrapFace(0, H_avail, matS1);
    [false, true].forEach(isRight => makeFSideInfills(0, H_avail, isRight, matS1));
    return;
  }

  // Two sections at r and r/2
  const tanR = Math.tan(r), tanR2 = Math.tan(r2);
  let h1 = (roofEdgeDepth - H_avail * tanR2) / (tanR - tanR2);
  h1 = Math.max(0.1, Math.min(H_avail * 0.9, h1));

  makeTrapFace(0, h1, matS1);
  makeTrapFace(h1, H_avail, matS2);
  [false, true].forEach(isRight => {
    makeFSideInfills(0,  h1,      isRight, matS1);
    makeFSideInfills(h1, H_avail, isRight, matS2);
  });
}

// ── Wall F: two stacked sections, both right-aligned at x=W ──
// Section 1: adjustable height (minimum 2.0m), adjustable angle/width.
// Section 2: fills the remainder to roof.
function buildFWall(group, f1Width, f1Angle, f2Angle, f2WidthTop, f1Height=2.0) {
  const H_base = roofUnderY(0) - KICK;
  const F1_H = Math.max(2.0, Math.min(H_base - 0.1, f1Height));
  const matKick = getWallMat('F', 'kick');
  const matS1 = getWallMat('F', 's1');
  const matS2 = getWallMat('F', 's2');
  const r1   = f1Angle * Math.PI/180;
  const r2   = f2Angle * Math.PI/180;
  const zBase = D;
  const tanR1 = Math.tan(r1);
  const tanR2 = Math.tan(r2);

  // Key Z positions (world z where each section's face is at each height)
  const z1Top = zBase - F1_H * tanR1;   // z at top of sec1
  const denom = Math.max(0.05, 1 + ROOF_PITCH_TAN * tanR2);
  const z2TopRaw = zBase - (F1_H * tanR1) - ((H_base - F1_H) * tanR2);
  const z2Top = THREE.MathUtils.clamp(z2TopRaw / denom, 0, D);
  const yRoof = roofUnderY(z2Top);
  const yRoofBack = roofUnderY(zBase);

  // Key Y positions
  const yKick = KICK;
  const y1Top = KICK + F1_H;
  const F2_H = Math.max(0.1, yRoof - y1Top);

  // Key X positions (left edges — right edge always W)
  const xL1 = W - f1Width;       // left edge of sec1 (and kick)
  const xL2 = W - f2WidthTop;    // left edge of sec2 at roof

  const makeFace = (BL,BR,TR,TL, matFace) => {
    const verts = [BL,BR,TR,TL].flatMap(p=>[p.x,p.y,p.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    geo.setIndex([0,1,2, 0,2,3]);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      1, 0,
      0, 0,
      0, 1,
      1, 1,
    ], 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, matFace); m.castShadow=true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xcc88ff})));
    group.add(m);
    return m;
  };

  // ── Kick (vertical, at z=zBase) ──
  const kickBL = {x:xL1, y:0,     z:zBase};
  const kickBR = {x:W,   y:0,     z:zBase};
  const kickTR = {x:W,   y:yKick, z:zBase};
  const kickTL = {x:xL1, y:yKick, z:zBase};
  const kickMesh = makeFace(kickBL, kickBR, kickTR, kickTL, matKick);
  registerSectionHover(
    kickMesh,
    sectionInfoFromCorners('F', 'Kick', 0, KICK, 0, kickBL, kickBR, kickTL, kickTR)
  );

  // ── Section 1 face ──
  const section1BL = {x:xL1, y:yKick, z:zBase};
  const section1BR = {x:W,   y:yKick, z:zBase};
  const section1TR = {x:W,   y:y1Top, z:z1Top};
  const section1TL = {x:xL1, y:y1Top, z:z1Top};
  const section1Mesh = makeFace(section1BL, section1BR, section1TR, section1TL, matS1);
  registerSectionHover(
    section1Mesh,
    sectionInfoFromCorners('F', 'Section 1', f1Angle, F1_H, yKick, section1BL, section1BR, section1TL, section1TR)
  );

  // ── Section 2 face (trapezoid — sec1 width at base, f2WidthTop at roof) ──
  const section2BL = {x:xL1, y:y1Top, z:z1Top};
  const section2BR = {x:W,   y:y1Top, z:z1Top};
  const section2TR = {x:W,   y:yRoof, z:z2Top};
  const section2TL = {x:xL2, y:yRoof, z:z2Top};
  const section2Mesh = makeFace(section2BL, section2BR, section2TR, section2TL, matS2);
  registerSectionHover(
    section2Mesh,
    sectionInfoFromCorners('F', 'Section 2', f2Angle, F2_H, y1Top, section2BL, section2BR, section2TL, section2TR)
  );

  // ── RIGHT side infill (x=W, constant) ──
  // Profile: (yKick,zBase) → (y1Top,z1Top) → (yRoof,z2Top), back to (yRoof,zBase) → (yKick,zBase)
  // Split into two quads at the sec1/sec2 kink
  // Right side is a single pentagon; split into two shapes:
  // Lower right: (yKick,zBase), (y1Top,zBase), (y1Top,z1Top)
  group.add(makeSideInfill(matS1,[
    {x:W, y:yKick, z:zBase},
    {x:W, y:y1Top, z:zBase},
    {x:W, y:y1Top, z:z1Top},
  ]));
  // Upper right: (y1Top,zBase), (yRoof,zBase), (yRoof,z2Top), (y1Top,z1Top)
  group.add(makeSideInfill(matS2,[
    {x:W, y:y1Top, z:zBase},
    {x:W, y:yRoofBack, z:zBase},
    {x:W, y:yRoof, z:z2Top},
    {x:W, y:y1Top, z:z1Top},
  ]));

  // ── LEFT side infill ──
  // Sec1 left side is at constant x=xL1:
  // Profile: (yKick,zBase) → (yKick,zBase) kick bottom, (y1Top,z1Top) face, back to (y1Top,zBase)
  group.add(makeSideInfill(matS1,[
    {x:xL1, y:yKick, z:zBase},
    {x:xL1, y:y1Top, z:zBase},
    {x:xL1, y:y1Top, z:z1Top},
  ]));
  // Sec2 left side: x goes from xL1 (at y1Top) to xL2 (at yRoof) — not planar.
  // Represent it as one triangulated quad.
  group.add(makeSideInfill(matS2,[
    {x:xL1, y:y1Top, z:zBase},
    {x:xL1, y:y1Top, z:z1Top},
    {x:xL2, y:yRoof, z:z2Top},
    {x:xL2, y:yRoofBack, z:zBase},
  ]));
  // The sec2 side quad above already spans the back and face edges; adding an alternate
  // diagonal over the same area creates coplanar overlap artifacts while orbiting.
}

// ── Campus board on wall D ──
function buildCampusBoardOnD(group, s) {
  if (!s || !campusBoardEnabled) return;

  const dWidth = Math.max(0.1, W - s.bWidth - s.cWidth);
  const pivotX = s.bWidth + s.cWidth + dWidth * 0.5;

  const rungSpacing = 0.22;
  const rungWNominal = 0.32;
  const rungDepth = 0.025;
  const rungHeight = 0.045;
  const firstRungOffset = 1.20; // above active floor (mats top when enabled)
  const firstRungY = getActiveFloorY() + firstRungOffset;
  const faceOffset = 0.008;

  const H_base = roofUnderY(0) - KICK;
  const h1 = Math.max(0.1, Math.min(H_base - 0.1, Number(s.d1Height) || 2.0));
  const r1 = THREE.MathUtils.degToRad(Number(s.dAngle) || 0);
  const r2 = THREE.MathUtils.degToRad(Number(s.d2Angle) || 0);
  const tanR1 = Math.tan(r1);
  const tanR2 = Math.tan(r2);
  const splitY = KICK + h1;
  const splitZ = h1 * tanR1;

  const denom = Math.max(0.05, 1 - ROOF_PITCH_TAN * tanR2);
  const roofZRaw = (h1 * tanR1) + ((H_base - h1) * tanR2);
  const roofZ = THREE.MathUtils.clamp(roofZRaw / denom, 0, D);
  const roofY = roofUnderY(roofZ);

  // Try for 10 rungs first, then 9, otherwise use what fits.
  const maxRungY = roofY - 0.18;
  const capacity = Math.floor((maxRungY - firstRungY) / rungSpacing) + 1;
  if (capacity <= 0) return;
  const rungCount = capacity >= 10 ? 10 : (capacity >= 9 ? 9 : capacity);
  if (rungCount <= 0) return;

  const rungWidth = rungWNominal;
  if (dWidth <= 0.10) return;

  const addRungAt = (y, depth, height) => {
    const onLower = y <= splitY + 1e-5;
    const angle = onLower ? r1 : r2;
    const zFace = onLower
      ? (y - KICK) * tanR1
      : splitZ + (y - splitY) * tanR2;
    const z = zFace + depth * 0.5 + faceOffset;

    const rung = box(
      rungWidth, height, depth,
      campusRungMat,
      angle, 0, 0,
      pivotX, y, z
    );
    rung.castShadow = true;
    rung.receiveShadow = true;
    rung.add(new THREE.LineSegments(new THREE.EdgesGeometry(rung.geometry), campusRungEdgeMat));
    group.add(rung);
  };

  for (let i = 0; i < rungCount; i++) {
    const y = firstRungY + i * rungSpacing;
    addRungAt(y, rungDepth, rungHeight);
  }
}

// ── Concept volumes (toggleable) ──
function buildConceptVolumes(group, s) {
  if (!s || !conceptVolumesEnabled) return;

  const roofBaseAvail = (H_fixed + 0.001) - KICK;
  const dWidth = Math.max(0.1, W - s.bWidth - s.cWidth);
  const fixedSideLen = s.aWidth;

  // Derive D/F roof-edge depths to locate center of G.
  const d1H = Math.max(0.1, Math.min((H_fixed - KICK) - 0.1, s.d1Height));
  const dTan1 = Math.tan(THREE.MathUtils.degToRad(s.dAngle));
  const dTan2 = Math.tan(THREE.MathUtils.degToRad(s.d2Angle));
  const dDen = Math.max(0.05, 1 - ROOF_PITCH_TAN * dTan2);
  const dRoofZ = THREE.MathUtils.clamp(((d1H * dTan1) + ((roofBaseAvail - d1H) * dTan2)) / dDen, 0, D);

  const f1H = Math.max(2.0, Math.min((H_fixed - KICK) - 0.1, s.f1Height));
  const fTan1 = Math.tan(THREE.MathUtils.degToRad(s.f1Angle));
  const fTan2 = Math.tan(THREE.MathUtils.degToRad(s.f2Angle));
  const fDen = Math.max(0.05, 1 + ROOF_PITCH_TAN * fTan2);
  const fRoofZ = THREE.MathUtils.clamp((D - (f1H * fTan1) - ((roofBaseAvail - f1H) * fTan2)) / fDen, 0, D);

  const addVolume = (mesh, edgePairs=null) => {
    if (Array.isArray(edgePairs) && edgePairs.length && mesh?.geometry?.attributes?.position) {
      const pos = mesh.geometry.attributes.position;
      const pts = [];
      edgePairs.forEach(([a, b]) => {
        if (!Number.isInteger(a) || !Number.isInteger(b)) return;
        if (a < 0 || b < 0 || a >= pos.count || b >= pos.count) return;
        pts.push(
          new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)),
          new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
        );
      });
      if (pts.length >= 2) {
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(pts);
        mesh.add(new THREE.LineSegments(edgeGeo, conceptVolumeEdgeMat));
      }
    } else {
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), conceptVolumeEdgeMat));
    }
    group.add(mesh);
  };

  const keepHoldFaceForCorner = (normal, center) => {
    // Keep outward/downward faces; skip up-facing top contact near ceiling.
    if (normal.y > 0.35) return false;
    const ceilingY = roofUnderY(center.z) - CEILING_PLY_THICKNESS + 0.01;
    if (center.y > ceilingY - 0.04) return false;
    return (normal.x > 0.03 || normal.z > 0.03 || normal.y < -0.06);
  };
  const keepHoldFaceForG = (normal, center) => {
    // Use side and underside faces only, not upper attachment faces.
    if (normal.y > 0.25) return false;
    const ceilingY = roofUnderY(center.z) - CEILING_PLY_THICKNESS + 0.01;
    if (center.y > ceilingY - 0.05) return false;
    return true;
  };

  // 1) Corner volume fitting A + B + ceiling:
  // largest contact surface at ceiling, tapering narrower toward the bottom.
  const aRad = THREE.MathUtils.degToRad(s.aAngle);
  const bRad = THREE.MathUtils.degToRad(s.bAngle);
  // Solve corner anchor against B-plane and sloped ceiling underside so top sits flush.
  const tanB = Math.tan(bRad);
  const yCornerDen = Math.max(0.05, 1 - (tanB * ROOF_PITCH_TAN));
  const yCornerTop = (
    (H_fixed + 0.001) - CEILING_PLY_THICKNESS - (KICK * tanB * ROOF_PITCH_TAN)
  ) / yCornerDen + 0.002;
  const yCornerRel = Math.max(0, yCornerTop - KICK);
  const xAB = yCornerRel * Math.tan(aRad);
  const zAB = yCornerRel * tanB;
  const cornerDrop = 0.62;
  const cornerShiftX = cornerDrop * Math.tan(aRad);
  const cornerShiftZ = cornerDrop * Math.tan(bRad);
  const cornerVol = makeCornerOverhangVolume(
    0.64, 0.60, 0.84,
    0.30, 0.26, 0.44,
    cornerDrop,
    cornerShiftX, cornerShiftZ,
    getConceptVolumeMaterial('cornerAB')
  );
  cornerVol.userData.volumeType = 'cornerAB';
  cornerVol.position.set(xAB - 0.001, yCornerTop, zAB - 0.001);
  // Keep edge highlight only on exposed faces; omit A/B wall-contact boundaries.
  addVolume(cornerVol, [
    [1,2], [2,3],   // exposed top edges
    [5,6], [6,7],   // exposed bottom edges
    [2,6],          // front vertical ridge
  ]);
  addHoldsToVolumeMesh(
    group,
    cornerVol,
    'cornerAB',
    Math.max(1, Math.round(12 * HOLD_DENSITY_SCALE)),
    keepHoldFaceForCorner
  );

  // 2) Hanging volume from center of G: wider thin frustum with flat bottom.
  const xDInner = W - dWidth;
  const xFInner = W - s.f2WidthTop;
  const zG = THREE.MathUtils.clamp((dRoofZ + fRoofZ) * 0.5, fixedSideLen, D);
  const xGLeft = (xDInner + xFInner) * 0.5;
  const xGCenter = (xGLeft + W) * 0.5;
  const yGTop = roofUnderY(zG) - CEILING_PLY_THICKNESS - 0.004;
  const gHeight = 0.68;
  const gTopW = 0.52;
  const gBottomW = 0.24;
  const gTopD = 0.34;
  const gPitch = THREE.MathUtils.degToRad(ROOF_PITCH_DEG);
  // Cylinder frustum avoids stray triangulation artifacts and keeps a flat bottom.
  const gGeom = new THREE.CylinderGeometry(gTopW * 0.5, gBottomW * 0.5, gHeight, 4, 1, false);
  const gVol = new THREE.Mesh(gGeom, getConceptVolumeMaterial('ceilingG'));
  gVol.userData.volumeType = 'ceilingG';
  gVol.castShadow = true;
  gVol.receiveShadow = true;
  gVol.scale.z = gTopD / gTopW;
  gVol.rotation.set(-gPitch, Math.PI * 0.25, 0);
  gVol.position.set(xGCenter, yGTop - (gHeight * 0.5 * Math.cos(gPitch)) - 0.001, zG);
  addVolume(gVol);
  addHoldsToVolumeMesh(
    group,
    gVol,
    'ceilingG',
    Math.max(1, Math.round(9 * HOLD_DENSITY_SCALE)),
    keepHoldFaceForG
  );

  // 3) Smaller foothold volumes on C and B:
  // slanted top triangle with elongated point down/back to wall.
  const placeBackWallDart = (x, tipY, angleRad, width, topDepth, topBackDrop, tipDrop, volumeId='default') => {
    const faceZ = Math.max(0, (tipY - KICK) * Math.tan(angleRad));
    const v = makeDartVolume(width, topDepth, topBackDrop, tipDrop, getConceptVolumeMaterial(volumeId));
    v.userData.volumeType = volumeId;
    // Largest face lies on the wall plane; volume projects out and follows wall pitch.
    v.position.set(x, tipY, faceZ + 0.006);
    v.rotation.set(angleRad, 0, 0);
    addVolume(v);
  };

  const cTipY = getActiveFloorY() + 0.66;
  const cAngle = THREE.MathUtils.degToRad(s.cAngle);
  const cX = s.bWidth + s.cWidth * 0.62;
  // Press apex in a bit (smaller top) and increase top drop for a steeper profile.
  placeBackWallDart(cX, cTipY, cAngle, 0.26, 0.10, 0.10, 0.34, 'dartC');

  // Smaller companion copy on wall B, placed lower.
  const bTipY = getActiveFloorY() + 0.50;
  const bAngle = THREE.MathUtils.degToRad(s.bAngle);
  // Shift toward the B/C boundary so it sits closer to the C dart.
  const bX = Math.max(0.12, s.bWidth - 0.10);
  placeBackWallDart(bX, bTipY, bAngle, 0.19, 0.07, 0.08, 0.24, 'dartB');
}

let trainingRigPivot = null;
let trainingRigHoverInfo = null;
let trainingRigHoverAnchors = null;
const trainingRigTmpFront = new THREE.Vector3();
const trainingRigTmpBar = new THREE.Vector3();
const trainingRigTmpW1 = new THREE.Vector3();
const trainingRigTmpW2 = new THREE.Vector3();

function clearTrainingRigRuntime() {
  trainingRigPivot = null;
  trainingRigHoverInfo = null;
  trainingRigHoverAnchors = null;
}

function updateTrainingRigHoverInfo() {
  if (!trainingRigPivot || !trainingRigHoverInfo || !trainingRigHoverAnchors) return false;
  trainingRigPivot.updateMatrixWorld(true);

  trainingRigTmpFront.copy(trainingRigHoverAnchors.frameFrontLocal);
  trainingRigTmpBar.copy(trainingRigHoverAnchors.barLocal);
  trainingRigTmpW1.copy(trainingRigHoverAnchors.widthP1Local);
  trainingRigTmpW2.copy(trainingRigHoverAnchors.widthP2Local);
  trainingRigPivot.localToWorld(trainingRigTmpFront);
  trainingRigPivot.localToWorld(trainingRigTmpBar);
  trainingRigPivot.localToWorld(trainingRigTmpW1);
  trainingRigPivot.localToWorld(trainingRigTmpW2);

  trainingRigHoverInfo.frontX = trainingRigTmpFront.x;
  trainingRigHoverInfo.frontZ = trainingRigTmpFront.z;
  trainingRigHoverInfo.barX = trainingRigTmpBar.x;
  trainingRigHoverInfo.barZ = trainingRigTmpBar.z;
  trainingRigHoverInfo.widthP1 = {
    x: trainingRigTmpW1.x,
    y: trainingRigTmpW1.y,
    z: trainingRigTmpW1.z,
  };
  trainingRigHoverInfo.widthP2 = {
    x: trainingRigTmpW2.x,
    y: trainingRigTmpW2.y,
    z: trainingRigTmpW2.z,
  };
  const hangSide = Number(trainingRigHoverAnchors.hangSide) || -1;
  trainingRigHoverInfo.anchorX = Math.max(trainingRigTmpFront.x, trainingRigTmpBar.x) + 0.14;
  trainingRigHoverInfo.anchorZ = trainingRigTmpFront.z + (hangSide * 0.18);
  return true;
}

function setTrainingRigOpenAngle(deg) {
  if (!trainingRigPivot) return false;
  const clamped = THREE.MathUtils.clamp(Number(deg) || 0, 0, 180);
  trainingRigPivot.rotation.y = THREE.MathUtils.degToRad(clamped);
  updateTrainingRigHoverInfo();
  return true;
}

// ── Hinged external training rig + storage cabinet on the back of F ──
function buildTrainingRig(group, s) {
  clearTrainingRigRuntime();
  if (!s) return;
  const showRig = (typeof trainingRigEnabled === 'boolean') ? trainingRigEnabled : true;
  const showCabinet = (typeof trainingCabinetEnabled === 'boolean') ? trainingCabinetEnabled : true;
  if (!showRig && !showCabinet) return;

  const boardH = 0.22;
  const boardT = 0.045;
  const frameDepth = 0.05;
  const uprightW = 0.04;
  const frameOffsetFromAxisZ = frameDepth * 0.5 + 0.004;
  const extDepth = 0.16;
  const barClearance = 0.03;
  const barRadius = 0.018;
  const boardGap = 0.006;
  const hangSide = -1; // opposite side of bracket frame (toward wall when closed)
  const yBar = THREE.MathUtils.clamp(TRAINING_PULLUP_BAR_HEIGHT, KICK + 1.2, roofUnderY(D) + 1.0);
  const yTop = yBar + 0.02;
  const boardTop = Math.min(TRAINING_HANGBOARD_TOP_HEIGHT, yTop - 0.12);
  const boardY = boardTop - boardH * 0.5;
  const yBottom = boardY - boardH * 0.28;

  // Collapsed envelope constrained to F section 1 width.
  const f1Width = Math.max(0.12, Number(s.f1Width) || 0.6);
  const maxCollapsedW = Math.max(0.12, f1Width - 0.02);
  let boardW = Math.min(0.60, maxCollapsedW); // Beastmaker nominal width
  let spanW = Math.min(maxCollapsedW, boardW + 0.20);
  if (spanW < boardW + 0.04) boardW = Math.max(0.10, spanW - 0.04);

  const xCenter = W - (f1Width * 0.5);
  const hingeX = W + 0.045;
  // Push hinge out in +Z so board + bar can sit on the wall side and still fold closed.
  const hingeWallClearance = 0.01;
  const wallSideDepth = frameDepth * 0.5 + extDepth + barClearance + barRadius;
  const hingeZ = D + wallSideDepth + hingeWallClearance;

  if (showCabinet) {
    // Cabinet outside wall only (no recess modeling).
    const cabDepth = 0.30;
    const cabBottom = KICK + 0.08;
    const cabTop = Math.max(cabBottom + 0.45, boardY - boardH * 0.5 - 0.10);
    const cabH = cabTop - cabBottom;
    const cabW = Math.max(0.24, Math.min(maxCollapsedW, spanW));
    const cabCenterZ = D + cabDepth * 0.5 + 0.01;

    const cabinet = box(
      cabW, cabH, cabDepth,
      new THREE.MeshLambertMaterial({color:0x3c464f}),
      0, 0, 0,
      xCenter, cabBottom + cabH * 0.5, cabCenterZ
    );
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    cabinet.add(new THREE.LineSegments(new THREE.EdgesGeometry(cabinet.geometry), new THREE.LineBasicMaterial({color:0x738392})));
    group.add(cabinet);

    const cabDoorDepth = 0.02;
    const cabDoorGap = 0.002;
    const cabDoor = box(
      cabW - 0.04, cabH - 0.04, cabDoorDepth,
      new THREE.MeshLambertMaterial({color:0x5a6570}),
      0, 0, 0,
      xCenter, cabBottom + cabH * 0.5, D + cabDepth + 0.01 + (cabDoorDepth * 0.5) + cabDoorGap
    );
    cabDoor.castShadow = true;
    cabDoor.receiveShadow = true;
    group.add(cabDoor);
  }

  if (!showRig) return;

  // Hinge wraps around the side of F: side plate + back plate only.
  const yPlateCenter = (yTop + yBottom) * 0.5;
  const plateH = (yTop - yBottom) + 0.10;
  const hingeReach = Math.max(0.04, hingeZ - (D + 0.015));
  const plateSpine = box(
    0.05, plateH, hingeReach,
    trainingFrameMat,
    0, 0, 0,
    W + 0.02, yPlateCenter, D + 0.015 + hingeReach * 0.5
  );
  const plateBack = box(
    0.06, plateH, 0.03,
    trainingFrameMat,
    0, 0, 0,
    W - 0.01, yPlateCenter, D + 0.015
  );
  const plateSide = box(
    0.03, plateH, 0.06,
    trainingFrameMat,
    0, 0, 0,
    W + 0.015, yPlateCenter, D - 0.005
  );
  [plateSpine, plateBack, plateSide].forEach(m => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  // Hinged frame: slider drives 0° (closed) .. 90° (open beside F, along +X).
  const openDeg = THREE.MathUtils.clamp(Number(s.rigOpen) || 0, 0, 180);
  const openRad = THREE.MathUtils.degToRad(openDeg);

  const pivot = new THREE.Group();
  pivot.position.set(hingeX, 0, hingeZ);
  pivot.rotation.y = openRad;
  group.add(pivot);

  // Keep the hinge axis on the outside edge of the frame (no plate/frame overlap when closed).
  const rightXLocal = -uprightW * 0.5;
  const leftXLocal = rightXLocal - spanW + uprightW;
  const midXLocal = (leftXLocal + rightXLocal) * 0.5;
  const frameYMid = (yTop + yBottom) * 0.5;

  const addPivotFrame = (w, h, d, x, y, z=0) => {
    const m = box(w, h, d, trainingFrameMat, 0, 0, 0, x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
    return m;
  };
  addPivotFrame(0.04, yTop - yBottom, frameDepth, leftXLocal + 0.02, frameYMid, frameOffsetFromAxisZ);
  addPivotFrame(0.04, yTop - yBottom, frameDepth, rightXLocal, frameYMid, frameOffsetFromAxisZ);
  addPivotFrame(spanW, 0.04, frameDepth, midXLocal, yTop, frameOffsetFromAxisZ);
  addPivotFrame(spanW, 0.04, frameDepth, midXLocal, yBottom, frameOffsetFromAxisZ);

  // Hinge knuckles
  [yBottom + 0.06, yTop - 0.06].forEach(y => {
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.12, 12), pullupBarMat);
    knuckle.position.set(0, y, 0);
    knuckle.castShadow = true;
    knuckle.receiveShadow = true;
    pivot.add(knuckle);
  });

  // Hangboard on the opposite face of frame in closed state.
  const boardZLocal = frameOffsetFromAxisZ + hangSide * (frameDepth * 0.5 + boardT * 0.5 + boardGap);
  const board = box(boardW, boardH, boardT, hangboardMat, 0, 0, 0, midXLocal, boardY, boardZLocal);
  board.castShadow = true;
  board.receiveShadow = true;
  pivot.add(board);

  // Pockets
  const slotCount = 4;
  const slotW = boardW * 0.15;
  const slotSpan = boardW * 0.70;
  for (let i = 0; i < slotCount; i++) {
    const t = slotCount === 1 ? 0 : (i / (slotCount - 1) - 0.5);
    const x = midXLocal + t * slotSpan;
    // Keep slot geometry slightly embedded into the board to avoid coplanar shimmer.
    const slotZ = boardZLocal + hangSide * (boardT * 0.5 + 0.004);
    const slot = box(slotW, 0.03, 0.012, hangboardSlotMat, 0, 0, 0, x, boardY - 0.03, slotZ);
    slot.castShadow = true;
    slot.receiveShadow = true;
    pivot.add(slot);
  }

  // Extension and pull-up bar above hangboard.
  const extY = yBar;
  const zExtCenter = frameOffsetFromAxisZ + hangSide * (frameDepth * 0.5 + extDepth * 0.5);
  [leftXLocal + 0.02, rightXLocal].forEach(x => {
    const ext = box(0.045, 0.045, extDepth, trainingFrameMat, 0, 0, 0, x, extY, zExtCenter);
    ext.castShadow = true;
    ext.receiveShadow = true;
    pivot.add(ext);
  });
  const zBarMountLocal = frameOffsetFromAxisZ + hangSide * (frameDepth * 0.5 + extDepth);
  const barAxisZ = zBarMountLocal + (hangSide * barClearance);
  [leftXLocal + 0.02, rightXLocal].forEach(x => {
    const clampDepth = Math.abs(barAxisZ - zBarMountLocal);
    const clampZ = (zBarMountLocal + barAxisZ) * 0.5;
    const clamp = box(0.03, 0.03, clampDepth, trainingFrameMat, 0, 0, 0, x, extY, clampZ);
    clamp.castShadow = true;
    clamp.receiveShadow = true;
    pivot.add(clamp);
  });

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(barRadius, barRadius, spanW, 20), pullupBarMat);
  bar.rotation.z = Math.PI * 0.5;
  bar.position.set(midXLocal, extY, barAxisZ);
  bar.castShadow = true;
  bar.receiveShadow = true;
  pivot.add(bar);

  // Hover metadata: expose both X/Z so hover dim logic can choose dominant axis.
  const frameFaceLocalZ = frameOffsetFromAxisZ + hangSide * (frameDepth * 0.5);
  const rigInfo = sectionInfo('R', 'Training Rig', 0, yTop - yBottom, yBottom, {
    hoverKind: 'trainingRig',
    bracketTopY: yTop,
    bracketBottomY: yBottom,
    wallX: W,
    wallZ: D,
    widthM: spanW,
  });
  trainingRigPivot = pivot;
  trainingRigHoverInfo = rigInfo;
  trainingRigHoverAnchors = {
    hangSide,
    frameFrontLocal: new THREE.Vector3(midXLocal, yTop, frameFaceLocalZ),
    barLocal: new THREE.Vector3(midXLocal, extY, barAxisZ),
    widthP1Local: new THREE.Vector3(leftXLocal + 0.02, yBottom - 0.10, frameFaceLocalZ),
    widthP2Local: new THREE.Vector3(rightXLocal, yBottom - 0.10, frameFaceLocalZ),
  };
  updateTrainingRigHoverInfo();
  registerSectionHover(board, rigInfo);
}

// ── L-shaped roof cap ──
// New section:   x (W-fWidth)→W, z fixedSideLen→D  (over the F wall)
// Diagonal join: where dWidth ≠ fWidth, a triangle fills the gap at the inner corner.
//
// Inner corner of fixed cap: (W-dWidth, fixedSideLen)   [right edge of D section]
// Inner corner of F cap:     (W-fWidth, D)               [left edge of F section, far end]
// These two corners are connected by a diagonal if fWidth ≠ dWidth.
function buildLRoof(group, fixedSideLen, dWidth, fWidth, dRoofZ=fixedSideLen, fRoofZ=D) {
  // Roof is a constant-thickness slab with 5° runoff:
  // low at B/C/D side (z=0), high toward F side (higher z).
  const capBaseY = H_fixed + 0.001;
  const t = ROOF_CLADDING_THICKNESS;
  const capBaseYAtZ = z => capBaseY + z * ROOF_PITCH_TAN;
  const capTopYAtZ = z => capBaseYAtZ(z) + t;
  const plyT = CEILING_PLY_THICKNESS;
  const plyTopYAtZ = z => capBaseYAtZ(z);
  const plyBottomYAtZ = z => plyTopYAtZ(z) - plyT;
  const mat = claddingMat;

  // ── 1. Fixed back cap: full width × fixedSideLen ──
  const capVerts1 = [
    0,       capTopYAtZ(0),            0,
    W,       capTopYAtZ(0),            0,
    W,       capTopYAtZ(fixedSideLen), fixedSideLen,
    0,       capTopYAtZ(fixedSideLen), fixedSideLen,
    // bottom face
    0,       capBaseYAtZ(0),            0,
    W,       capBaseYAtZ(0),            0,
    W,       capBaseYAtZ(fixedSideLen), fixedSideLen,
    0,       capBaseYAtZ(fixedSideLen), fixedSideLen,
  ];
  group.add(makeSolidSlab(mat, capVerts1));

  // ── 2. F cap section: fWidth wide, from fixedSideLen to D ──
  // x: W-fWidth → W,  z: fixedSideLen → D
  const fx0 = W - fWidth;
  const capVerts2 = [
    fx0, capTopYAtZ(fixedSideLen), fixedSideLen,
    W,   capTopYAtZ(fixedSideLen), fixedSideLen,
    W,   capTopYAtZ(D),            D,
    fx0, capTopYAtZ(D),            D,
    fx0, capBaseYAtZ(fixedSideLen), fixedSideLen,
    W,   capBaseYAtZ(fixedSideLen), fixedSideLen,
    W,   capBaseYAtZ(D),            D,
    fx0, capBaseYAtZ(D),            D,
  ];
  group.add(makeSolidSlab(mat, capVerts2));

  // ── 3. Ceiling infill wall between D and F (auto-fit to their top edges) ──
  const xDInner = W - dWidth;
  const xFInner = W - fWidth;
  const zDTop = THREE.MathUtils.clamp(dRoofZ, 0, D);
  const zFTop = THREE.MathUtils.clamp(fRoofZ, 0, D);
  const addGapMesh = verts => {
    const mesh = makeSolidSlab(ceilingGapMat, verts);
    mesh.userData.labelWall = 'G';
    mesh.userData.isCeilingPanel = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({color:0x80b8ff})
    ));
    group.add(mesh);
  };
  if (Math.abs(zDTop - zFTop) > 0.01 || Math.abs(xDInner - xFInner) > 0.01) {
    const gapVerts = [
      xDInner, plyTopYAtZ(zDTop), zDTop,
      W,       plyTopYAtZ(zDTop), zDTop,
      W,       plyTopYAtZ(zFTop), zFTop,
      xFInner, plyTopYAtZ(zFTop), zFTop,
      xDInner, plyBottomYAtZ(zDTop), zDTop,
      W,       plyBottomYAtZ(zDTop), zDTop,
      W,       plyBottomYAtZ(zFTop), zFTop,
      xFInner, plyBottomYAtZ(zFTop), zFTop,
    ];
    addGapMesh(gapVerts);
  }

  // If the D↔F infill starts "in front of" the A→D ceiling edge, add a connector
  // so G also reaches that ceiling-panel edge (z = fixedSideLen).
  const zNearTop = Math.min(zDTop, zFTop);
  if (zNearTop > fixedSideLen + 0.01) {
    const joinVerts = [
      xDInner, plyTopYAtZ(fixedSideLen), fixedSideLen,
      W,       plyTopYAtZ(fixedSideLen), fixedSideLen,
      W,       plyTopYAtZ(zNearTop), zNearTop,
      xDInner, plyTopYAtZ(zNearTop), zNearTop,
      xDInner, plyBottomYAtZ(fixedSideLen), fixedSideLen,
      W,       plyBottomYAtZ(fixedSideLen), fixedSideLen,
      W,       plyBottomYAtZ(zNearTop), zNearTop,
      xDInner, plyBottomYAtZ(zNearTop), zNearTop,
    ];
    addGapMesh(joinVerts);
  }

  // ── 4. Ceiling panel from A across B/C to meet D (separate 17mm ply layer) ──
  // Fixed-room underside: x from A (0) to D start (xDInner), z from back wall (0) to A reach (fixedSideLen).
  if (xDInner > 0.01 && fixedSideLen > 0.01) {
    const spanVerts = [
      0,       plyTopYAtZ(0), 0,
      xDInner, plyTopYAtZ(0), 0,
      xDInner, plyTopYAtZ(fixedSideLen), fixedSideLen,
      0,       plyTopYAtZ(fixedSideLen), fixedSideLen,
      0,       plyBottomYAtZ(0), 0,
      xDInner, plyBottomYAtZ(0), 0,
      xDInner, plyBottomYAtZ(fixedSideLen), fixedSideLen,
      0,       plyBottomYAtZ(fixedSideLen), fixedSideLen,
    ];
    const spanMesh = makeSolidSlab(ceilingGapMat, spanVerts);
    spanMesh.userData.labelWall = 'G';
    spanMesh.userData.isCeilingPanel = true;
    spanMesh.castShadow = true;
    spanMesh.receiveShadow = true;
    spanMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(spanMesh.geometry),
      new THREE.LineBasicMaterial({color:0x80b8ff})
    ));
    group.add(spanMesh);
  }
}

// ── Optional polycarbonate roof extension over the currently open area ──
// Covers the non-roofed region (left of F roof segment) from z=fixedSideLen to z=D.
// It is raised so E has ~150mm clearance at full height, and is supported by posts
// that start on the existing roof line.
function buildPolyRoofExtension(group, fixedSideLen, fWidth) {
  if (!polyRoofEnabled) return;

  const overlap = 0.20; // 200 mm lap over existing roof planes
  const x0 = 0;
  const x1 = THREE.MathUtils.clamp((W - fWidth) + overlap, 0, W);
  const z0 = THREE.MathUtils.clamp(fixedSideLen - overlap, 0, D);
  const z1 = D;
  const spanX = x1 - x0;
  const spanZ = z1 - z0;
  if (spanX < 0.08 || spanZ < 0.08) return;

  const roofTopYAtZ = z => (H_fixed + 0.001 + z * ROOF_PITCH_TAN + ROOF_CLADDING_THICKNESS);
  const polyBottom0 = Math.max(H_adj + POLY_ROOF_CLEARANCE, roofTopYAtZ(z0) + 0.04);
  const polyBottomAtZ = z => polyBottom0 + (z - z0) * ROOF_PITCH_TAN;
  const polyBottom1 = polyBottomAtZ(z1);
  const polyTop0 = polyBottom0 + POLY_ROOF_THICKNESS;
  const polyTop1 = polyBottom1 + POLY_ROOF_THICKNESS;

  const polyVerts = [
    x0, polyTop0, z0,
    x1, polyTop0, z0,
    x1, polyTop1, z1,
    x0, polyTop1, z1,
    x0, polyBottom0, z0,
    x1, polyBottom0, z0,
    x1, polyBottom1, z1,
    x0, polyBottom1, z1,
  ];
  const polyMesh = makeSolidSlab(polyRoofMat, polyVerts);
  polyMesh.castShadow = true;
  polyMesh.receiveShadow = true;
  polyMesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(polyMesh.geometry),
    new THREE.LineBasicMaterial({color:0x9fc8ea})
  ));
  group.add(polyMesh);

  // Support posts from existing roof: three corner posts
  // (front-left, front-right, and rear-right over F-roof section).
  const postW = 0.05;
  const postD = 0.05;
  const edgePad = 0.03;
  const pxL = x0 + edgePad;
  const pxR = x1 - edgePad;
  const pzF = z0 + edgePad;
  const pzB = z1 - edgePad;
  if (pxR <= pxL + 0.02 || pzB <= pzF + 0.02) return;

  const placePost = (px, pz) => {
    const postBottomY = roofTopYAtZ(pz);
    const postTopY = polyBottomAtZ(pz);
    const postH = postTopY - postBottomY;
    if (postH <= 0.03) return;
    const post = box(postW, postH, postD, polyRoofPostMat, 0, 0, 0, px, postBottomY + postH * 0.5, pz);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  };
  placePost(pxL, pzF);
  placePost(pxR, pzF);
  placePost(pxR, pzB);
}

// Build a flat slab from 8 corners (top 4 then bottom 4, wound CCW from above)
function makeSolidSlab(mat, v) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex([
    0,1,2, 0,2,3,       // top
    5,4,7, 5,7,6,       // bottom
    0,4,5, 0,5,1,       // front (z=z0)
    1,5,6, 1,6,2,       // right
    2,6,7, 2,7,3,       // back
    3,7,4, 3,4,0,       // left
  ]);
  // Global room-space UV mapping keeps corrugation/texture scale consistent across slabs.
  const uv = new Float32Array(8 * 2);
  for (let i = 0; i < 8; i++) {
    const x = v[i * 3];
    const z = v[i * 3 + 2];
    uv[i * 2] = x / Math.max(0.001, W);
    uv[i * 2 + 1] = z / Math.max(0.001, D);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow=true; return m;
}
let adjPivot = null;

function buildAdjPanel(group, adjLen, fixedSideLen) {
  // Kick — vertical panel at x=0, facing into room (+X), spanning z: fixedSideLen → D
  // Same orientation as wall A's kick: rotate Y=-PI/2 to face +X, positioned at x=0
  const kickGroup = new THREE.Group();
  kickGroup.position.set(0, 0, fixedSideLen + adjLen/2);
  kickGroup.rotation.y = -Math.PI/2; // face toward +X (into room), same as wall A
  const kickGeo = new THREE.PlaneGeometry(adjLen, KICK);
  kickGeo.translate(0, KICK/2, 0);
  // Mirror U so E kick texture orientation matches the requested wall direction.
  const kickUv = kickGeo.getAttribute('uv');
  for (let i = 0; i < kickUv.count; i++) kickUv.setX(i, 1 - kickUv.getX(i));
  kickUv.needsUpdate = true;
  const kickMesh = new THREE.Mesh(kickGeo, getWallMat('E', 'kick'));
  kickMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(kickGeo), new THREE.LineBasicMaterial({color:0xffaa55})));
  kickGroup.add(kickMesh);
  group.add(kickGroup);
  registerSectionHover(kickMesh, sectionInfo('E', 'Kick', 0, KICK, 0));
  // Pivot group at top of kick
  adjPivot = new THREE.Group();
  adjPivot.position.set(0, KICK, fixedSideLen);
  const panelH = H_adj - KICK;
  const adjPanel = box(thick, panelH, adjLen, adjMat, 0,0,0, 0, panelH/2, adjLen/2);
  adjPanel.add(new THREE.LineSegments(new THREE.EdgesGeometry(adjPanel.geometry),
    new THREE.LineBasicMaterial({ color: 0xffaa55 })));
  adjPivot.add(adjPanel);
  registerSectionHover(adjPanel, sectionInfo('E', 'Section 1', wallState.eAngle, panelH, KICK));
  // E label
  addLocalFaceLabel(adjPanel, 'E', 'adj', {
    normalLocal: {x:1, y:0, z:0},
    upLocal: {x:0, y:1, z:0},
    width: 0.56,
    height: 0.28,
    normalOffset: 0.012,
  });
  // E height dim
  addDimLocal(adjPivot, adjLen, panelH);
  group.add(adjPivot);
  setAdjAngle(wallState.eAngle);
}

function setAdjAngle(deg) {
  if (adjPivot) adjPivot.rotation.z = -deg * Math.PI / 180;
}

// Visual guide: seam where A and B meet.
// Draws from floor corner through kick and up the A/B intersection profile.
function buildABCornerGuide(group, s, fixedSideLen) {
  if (!group || !s) return;

  const roofBackY = roofUnderY(0);
  const roofEdgeY = roofUnderY(fixedSideLen);
  const hBase = Math.max(0, roofBackY - KICK);
  const hEdge = Math.max(0, roofEdgeY - KICK);

  const aRad = THREE.MathUtils.degToRad(Number(s.aAngle) || 0);
  const bRad = THREE.MathUtils.degToRad(Number(s.bAngle) || 0);
  const tanA = Math.tan(aRad);
  const tanB = Math.tan(bRad);

  const xProfile = (() => {
    if (Math.abs(tanA) < 1e-8) {
      return { hTop: hEdge, hSplit: null, at: () => 0 };
    }
    const singleTopX = hEdge * tanA;
    if (singleTopX <= fixedSideLen + 0.005) {
      return { hTop: hEdge, hSplit: null, at: h => Math.max(0, h) * tanA };
    }
    const tanA2 = Math.tan(aRad * 0.5);
    const denom = tanA - tanA2;
    if (Math.abs(denom) < 1e-8) {
      return { hTop: hEdge, hSplit: null, at: h => Math.max(0, h) * tanA };
    }
    let h1 = (fixedSideLen - hEdge * tanA2) / denom;
    h1 = Math.max(0.1, Math.min(hEdge * 0.9, h1));
    const splitX = h1 * tanA;
    return {
      hTop: hEdge,
      hSplit: h1,
      at: h => {
        const hh = Math.max(0, h);
        if (hh <= h1) return hh * tanA;
        return splitX + (hh - h1) * tanA2;
      },
    };
  })();

  const zProfile = (() => {
    if (Math.abs(tanB) < 1e-8) {
      return { hTop: hBase, hSplit: null, at: () => 0 };
    }
    const singleDen = Math.max(0.05, 1 - ROOF_PITCH_TAN * tanB);
    const singleH = hBase / singleDen;
    const singleTopZ = singleH * tanB;
    if (singleTopZ <= fixedSideLen + 0.005) {
      return { hTop: singleH, hSplit: null, at: h => Math.max(0, h) * tanB };
    }
    const tanB2 = Math.tan(bRad * 0.5);
    const denom = tanB - tanB2;
    if (Math.abs(denom) < 1e-8) {
      return { hTop: hEdge, hSplit: null, at: h => Math.max(0, h) * tanB };
    }
    let h1 = (fixedSideLen - hEdge * tanB2) / denom;
    h1 = Math.max(0.1, Math.min(hEdge * 0.9, h1));
    const splitZ = h1 * tanB;
    return {
      hTop: hEdge,
      hSplit: h1,
      at: h => {
        const hh = Math.max(0, h);
        if (hh <= h1) return hh * tanB;
        return splitZ + (hh - h1) * tanB2;
      },
    };
  })();

  const hTop = Math.max(0, Math.min(xProfile.hTop, zProfile.hTop));
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, KICK, 0),
  ];

  const knotSet = new Set([0, hTop]);
  if (Number.isFinite(xProfile.hSplit)) knotSet.add(xProfile.hSplit.toFixed(6));
  if (Number.isFinite(zProfile.hSplit)) knotSet.add(zProfile.hSplit.toFixed(6));
  const knots = Array.from(knotSet)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v >= 0 && v <= hTop)
    .sort((a, b) => a - b);

  knots.forEach(h => {
    pts.push(new THREE.Vector3(
      xProfile.at(h),
      KICK + h,
      zProfile.at(h)
    ));
  });

  const seamGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const seamMat = new THREE.LineBasicMaterial({ color: 0x88cc66 });
  const seam = new THREE.Line(seamGeo, seamMat);
  seam.userData.isABCornerGuide = true;
  group.add(seam);
}
