// Called after rebuild() — computes which walls clip which based on intersection
function applyClipping(s) {
  const H_avail = H_fixed - KICK;
  // Reset all clip planes
  ['A','B','C','D'].forEach(id => { if(wallMats[id]) wallMats[id].clippingPlanes=[]; });

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
      ['B','C','D'].forEach(id => { if(wallMats[id]) wallMats[id].clippingPlanes=[planeA]; });
    } else {
      // Back walls have priority → clip A at x=bWidth
      if(wallMats['A']) wallMats['A'].clippingPlanes=[planeClipA];
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
function makeSidePanelGroup(depth, h, r, startY, startX, mat) {
  const g = new THREE.Group();
  g.position.set(startX, startY, depth/2); g.rotation.y = -Math.PI/2;
  const geo = new THREE.PlaneGeometry(depth, h); geo.translate(0, h/2, 0);
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.rotation.x = -r;  // -r because after -PI/2 Y rotation, +x rotation = lean away; -r = lean toward +X world
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0x88cc66})));
  g.add(mesh);
  g.userData.panelMesh = mesh;
  return g;
}

// Side-wall panel with potentially different top heights at z=0 and z=depth.
// hAtZ0/hAtZ1 are vertical panel heights above startY before applying lean.
function makeSidePanelSkewedGroup(depth, hAtZ0, hAtZ1, r, startY, startX, mat) {
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
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow=true; return m;
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

// ── Back-wall section builder (B, C, D) ──
function buildBackSection(group, w, angleDeg, pivotX, roofEdgeZ, wallId) {
  const r = angleDeg * Math.PI/180;
  const r2 = r / 2;  // upper section at half the angle
  const roofBackY = roofUnderY(0);
  const roofEdgeY = roofUnderY(roofEdgeZ);
  const H_base = roofBackY - KICK;
  const H_availAtEdge = roofEdgeY - KICK;
  const mat = getWallMat(wallId);
  const xL = pivotX - w/2, xR = pivotX + w/2;

  // Kick
  const kickPanel = makeFlatPanel(w, KICK, 0, pivotX, 0, 0, mat);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (angleDeg === 0) {
    const mainPanel = makeFlatPanel(w, H_base, 0, pivotX, KICK, 0, mat);
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
    const singlePanel = makeFlatPanel(w, singleH/Math.cos(r), r, pivotX, KICK, 0, mat);
    group.add(singlePanel);
    registerSectionHover(singlePanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, singleH, KICK));
    [xL,xR].forEach(x => group.add(makeSideInfill(mat,[
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

  const lowerPanel = makeFlatPanel(w, h1/Math.cos(r), r,  pivotX, KICK,   0,      mat);
  const upperPanel = makeFlatPanel(w, upperH,          r2, pivotX, splitY, splitZ, mat);
  group.add(lowerPanel);
  group.add(upperPanel);
  registerSectionHover(lowerPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angleDeg, h1, KICK));
  registerSectionHover(upperPanel.userData.panelMesh, sectionInfo(wallId, 'Section 2', angleDeg / 2, h2, splitY));

  [xL,xR].forEach(x => {
    // One quad traces the full side profile: base-back → split-back → split-face → roof-face
    group.add(makeSideInfill(mat,[
      {x, y:KICK,    z:0},
      {x, y:splitY,  z:0},
      {x, y:splitY,  z:splitZ},
      {x, y:roofEdgeY, z:roofEdgeZ},
    ]));
    // Close the back edge from split to roof underside.
    group.add(makeSideInfill(mat,[
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
  const mat = getWallMat(wallId);

  // Kick
  const kickPanel = makeSidePanelGroup(depth, KICK, 0, 0, 0, mat);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (angleDeg === 0) {
    const mainPanel = makeSidePanelSkewedGroup(depth, roofY0 - KICK, roofY1 - KICK, 0, KICK, 0, mat);
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
        group.add(makeSideInfill(mat,[
          {x:0,    y:KICK,    z},
          {x:0,    y:topY, z},
          {x:topX, y:topY, z},
        ]));
      } else {
        // Full side profile quad: base-back → split-back → split-face → roof-face
        group.add(makeSideInfill(mat,[
          {x:0,      y:KICK,        z},
          {x:0,      y:KICK+h1_vert,z},
          {x:splitX, y:KICK+h1_vert,z},
          {x:topX,   y:topY,     z},
        ]));
        // Back edge triangle: split-back → roof-back → roof-face
        group.add(makeSideInfill(mat,[
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
      mat
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

  const lowerPanel = makeSidePanelSkewedGroup(depth, h1 / Math.cos(r), h1 / Math.cos(r), r, KICK, 0, mat);
  const upperPanel = makeSidePanelSkewedGroup(
    depth,
    upperHAtZ0 / Math.cos(r2),
    upperHAtZ1 / Math.cos(r2),
    r2,
    splitY,
    splitX,
    mat
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
  const mat = getWallMat(wallId);
  const xL = pivotX - w/2;
  const xR = pivotX + w/2;

  const kickPanel = makeFlatPanel(w, KICK, 0, pivotX, 0, 0, mat);
  group.add(kickPanel);
  registerSectionHover(kickPanel.userData.panelMesh, sectionInfo(wallId, 'Kick', 0, KICK, 0));

  if (Math.abs(angle1Deg) < 0.001 && Math.abs(angle2Deg) < 0.001) {
    const mainPanel = makeFlatPanel(w, H_base, 0, pivotX, KICK, 0, mat);
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

  const lowerPanel = makeFlatPanel(w, h1 / Math.cos(r1), r1, pivotX, KICK, 0, mat);
  const upperPanel = makeFlatPanel(w, h2 / Math.cos(r2), r2, pivotX, KICK + h1, splitZ, mat);
  group.add(lowerPanel);
  group.add(upperPanel);
  registerSectionHover(lowerPanel.userData.panelMesh, sectionInfo(wallId, 'Section 1', angle1Deg, h1, KICK));
  registerSectionHover(upperPanel.userData.panelMesh, sectionInfo(wallId, 'Section 2', angle2Deg, h2, KICK + h1));

  [xL, xR].forEach(x => {
    group.add(makeSideInfill(mat, [
      {x, y:KICK,    z:0},
      {x, y:KICK+h1, z:0},
      {x, y:KICK+h1, z:splitZ},
    ]));
    group.add(makeSideInfill(mat, [
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
  const mat = getWallMat(wallId);
  const zBase = D;
  const RX = rightEdgeX; // right edge x-coordinate

  // Width at vertical height h above kick (interpolates bot→top over full H_avail)
  const wAt = h => wBot + (wTop - wBot) * h / H_avail;

  // Build a trapezoidal face strip between vertical heights h0 and h1
  const makeTrapFace = (h0, h1) => {
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
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow=true; m.receiveShadow=true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xcc88ff})));
    group.add(m);
  };

  // Side infills
  const makeFSideInfills = (h0, h1, isRight) => {
    const w0 = wAt(h0), w1 = wAt(h1);
    const y0 = KICK+h0, z0 = zBase - h0*Math.tan(r);
    const y1 = KICK+h1, z1 = zBase - h1*Math.tan(r);
    if (isRight) {
      group.add(makeSideInfill(mat,[
        {x:RX, y:y0, z:zBase},
        {x:RX, y:y0, z:z0},
        {x:RX, y:y1, z:z1},
        {x:RX, y:y1, z:zBase},
      ]));
    } else {
      const xBot = RX-w0, xTop = RX-w1;
      group.add(makeSideInfill(mat,[
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
  kickGeo.computeVertexNormals();
  const kickMesh = new THREE.Mesh(kickGeo, mat);
  kickMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(kickGeo), new THREE.LineBasicMaterial({color:0xcc88ff})));
  group.add(kickMesh);

  if (angleDeg === 0) {
    makeTrapFace(0, H_avail);
    return;
  }

  const singleTopZ = zBase - H_avail * Math.tan(r);
  const roofInnerZ = zBase - roofEdgeDepth;

  if (singleTopZ >= roofInnerZ - 0.005) {
    makeTrapFace(0, H_avail);
    [false, true].forEach(isRight => makeFSideInfills(0, H_avail, isRight));
    return;
  }

  // Two sections at r and r/2
  const tanR = Math.tan(r), tanR2 = Math.tan(r2);
  let h1 = (roofEdgeDepth - H_avail * tanR2) / (tanR - tanR2);
  h1 = Math.max(0.1, Math.min(H_avail * 0.9, h1));

  makeTrapFace(0, h1);
  makeTrapFace(h1, H_avail);
  [false, true].forEach(isRight => {
    makeFSideInfills(0,  h1,      isRight);
    makeFSideInfills(h1, H_avail, isRight);
  });
}

// ── Wall F: two stacked sections, both right-aligned at x=W ──
// Section 1: adjustable height (minimum 2.0m), adjustable angle/width.
// Section 2: fills the remainder to roof.
function buildFWall(group, f1Width, f1Angle, f2Angle, f2WidthTop, f1Height=2.0) {
  const H_base = roofUnderY(0) - KICK;
  const F1_H = Math.max(2.0, Math.min(H_base - 0.1, f1Height));
  const mat  = getWallMat('F');
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

  const makeFace = (BL,BR,TR,TL) => {
    const verts = [BL,BR,TR,TL].flatMap(p=>[p.x,p.y,p.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    geo.setIndex([0,1,2, 0,2,3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow=true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xcc88ff})));
    group.add(m);
    return m;
  };

  // ── Kick (vertical, at z=zBase) ──
  const kickBL = {x:xL1, y:0,     z:zBase};
  const kickBR = {x:W,   y:0,     z:zBase};
  const kickTR = {x:W,   y:yKick, z:zBase};
  const kickTL = {x:xL1, y:yKick, z:zBase};
  const kickMesh = makeFace(kickBL, kickBR, kickTR, kickTL);
  registerSectionHover(
    kickMesh,
    sectionInfoFromCorners('F', 'Kick', 0, KICK, 0, kickBL, kickBR, kickTL, kickTR)
  );

  // ── Section 1 face ──
  const section1BL = {x:xL1, y:yKick, z:zBase};
  const section1BR = {x:W,   y:yKick, z:zBase};
  const section1TR = {x:W,   y:y1Top, z:z1Top};
  const section1TL = {x:xL1, y:y1Top, z:z1Top};
  const section1Mesh = makeFace(section1BL, section1BR, section1TR, section1TL);
  registerSectionHover(
    section1Mesh,
    sectionInfoFromCorners('F', 'Section 1', f1Angle, F1_H, yKick, section1BL, section1BR, section1TL, section1TR)
  );

  // ── Section 2 face (trapezoid — sec1 width at base, f2WidthTop at roof) ──
  const section2BL = {x:xL1, y:y1Top, z:z1Top};
  const section2BR = {x:W,   y:y1Top, z:z1Top};
  const section2TR = {x:W,   y:yRoof, z:z2Top};
  const section2TL = {x:xL2, y:yRoof, z:z2Top};
  const section2Mesh = makeFace(section2BL, section2BR, section2TR, section2TL);
  registerSectionHover(
    section2Mesh,
    sectionInfoFromCorners('F', 'Section 2', f2Angle, F2_H, y1Top, section2BL, section2BR, section2TL, section2TR)
  );

  // ── RIGHT side infill (x=W, constant) ──
  // Profile: (yKick,zBase) → (y1Top,z1Top) → (yRoof,z2Top), back to (yRoof,zBase) → (yKick,zBase)
  // Split into two quads at the sec1/sec2 kink
  // Right side is a single pentagon; split into two shapes:
  // Lower right: (yKick,zBase), (y1Top,zBase), (y1Top,z1Top)
  group.add(makeSideInfill(mat,[
    {x:W, y:yKick, z:zBase},
    {x:W, y:y1Top, z:zBase},
    {x:W, y:y1Top, z:z1Top},
  ]));
  // Upper right: (y1Top,zBase), (yRoof,zBase), (yRoof,z2Top), (y1Top,z1Top)
  group.add(makeSideInfill(mat,[
    {x:W, y:y1Top, z:zBase},
    {x:W, y:yRoofBack, z:zBase},
    {x:W, y:yRoof, z:z2Top},
    {x:W, y:y1Top, z:z1Top},
  ]));

  // ── LEFT side infill ──
  // Sec1 left side is at constant x=xL1:
  // Profile: (yKick,zBase) → (yKick,zBase) kick bottom, (y1Top,z1Top) face, back to (y1Top,zBase)
  group.add(makeSideInfill(mat,[
    {x:xL1, y:yKick, z:zBase},
    {x:xL1, y:y1Top, z:zBase},
    {x:xL1, y:y1Top, z:z1Top},
  ]));
  // Sec2 left side: x goes from xL1 (at y1Top) to xL2 (at yRoof) — not planar.
  // Represent it as one triangulated quad.
  group.add(makeSideInfill(mat,[
    {x:xL1, y:y1Top, z:zBase},
    {x:xL1, y:y1Top, z:z1Top},
    {x:xL2, y:yRoof, z:z2Top},
    {x:xL2, y:yRoofBack, z:zBase},
  ]));
  // The sec2 side quad above already spans the back and face edges; adding an alternate
  // diagonal over the same area creates coplanar overlap artifacts while orbiting.
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
  const t = 0.06;
  const capBaseYAtZ = z => capBaseY + z * ROOF_PITCH_TAN;
  const capTopYAtZ = z => capBaseYAtZ(z) + t;
  const plyT = 0.017;
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
    spanMesh.castShadow = true;
    spanMesh.receiveShadow = true;
    spanMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(spanMesh.geometry),
      new THREE.LineBasicMaterial({color:0x80b8ff})
    ));
    group.add(spanMesh);
  }
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
  const kickMesh = new THREE.Mesh(kickGeo, getWallMat('E'));
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
