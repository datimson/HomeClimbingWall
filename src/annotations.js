// ── Label textures / decals ──
function makeLabelTexture(letter, sub) {
  const cw=256, ch=128;
  const c=document.createElement('canvas'); c.width=cw; c.height=ch;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(15,15,15,0.88)';
  roundRect(ctx,8,8,cw-16,ch-16,14); ctx.fill();
  ctx.strokeStyle='#c8d88a'; ctx.lineWidth=3;
  roundRect(ctx,8,8,cw-16,ch-16,14); ctx.stroke();
  ctx.fillStyle='#c8d88a';
  ctx.font='bold 72px Georgia,serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(letter, sub?cw*0.38:cw/2, ch/2);
  if(sub){
    ctx.fillStyle='#aaa'; ctx.font='34px Georgia,serif'; ctx.textAlign='left';
    ctx.fillText(sub, cw*0.58, ch/2+4);
  }
  const tex=new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return {tex, cw, ch};
}

function makeLabelSprite(letter, sub) {
  const {tex} = makeLabelTexture(letter, sub);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  s.scale.set(0.6,0.3,1);
  return s;
}

function makeFaceLabelMesh(letter, sub, width=0.56, height=0.28) {
  const {tex} = makeLabelTexture(letter, sub);
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function addLocalFaceLabel(mesh, letter, sub, opts={}) {
  if (!mesh || !mesh.geometry) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (!bb) return null;

  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  let normal = toVec3(opts.normalLocal) || new THREE.Vector3(0, 0, 1);
  let up = toVec3(opts.upLocal) || new THREE.Vector3(0, 1, 0);
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
  else normal.normalize();

  if (opts.useFaceSlope) {
    const pos = mesh.geometry.attributes?.position;
    if (pos && pos.count >= 4) {
      const ys = [];
      for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i));
      let minY = ys[0], maxY = ys[0];
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] < minY) minY = ys[i];
        if (ys[i] > maxY) maxY = ys[i];
      }
      const spanY = maxY - minY;
      if (spanY > 1e-6) {
        const band = Math.max(1e-4, spanY * 0.15);
        const b = new THREE.Vector3();
        const t = new THREE.Vector3();
        let bn = 0, tn = 0;
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          if (v.y <= minY + band) {
            b.add(v);
            bn++;
          }
          if (v.y >= maxY - band) {
            t.add(v);
            tn++;
          }
        }
        if (bn > 0 && tn > 0) {
          b.multiplyScalar(1 / bn);
          t.multiplyScalar(1 / tn);
          const faceUp = t.sub(b);
          if (faceUp.lengthSq() > 1e-8) up = faceUp.normalize();
        }
      }
    }
  }

  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  else up.normalize();
  if (Math.abs(up.dot(normal)) > 0.98) up = new THREE.Vector3(0, 0, 1);

  let right = new THREE.Vector3().crossVectors(up, normal);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  up = new THREE.Vector3().crossVectors(normal, right).normalize();

  const alongUp = Number.isFinite(opts.alongUp) ? opts.alongUp : 0;
  const alongRight = Number.isFinite(opts.alongRight) ? opts.alongRight : 0;
  const normalOffset = Number.isFinite(opts.normalOffset) ? opts.normalOffset : 0.012;
  const width = Number.isFinite(opts.width) ? opts.width : Math.max(0.46, Math.min(0.66, size.x * 0.45));
  const height = Number.isFinite(opts.height) ? opts.height : Math.max(0.22, Math.min(0.32, size.y * 0.2));
  const halfAlongNormal =
    Math.abs(normal.x) * size.x * 0.5 +
    Math.abs(normal.y) * size.y * 0.5 +
    Math.abs(normal.z) * size.z * 0.5;

  const label = makeFaceLabelMesh(letter, sub, width, height);
  const p = center.clone()
    .add(up.clone().multiplyScalar(size.y * alongUp))
    .add(right.clone().multiplyScalar(size.x * alongRight))
    .add(normal.clone().multiplyScalar(halfAlongNormal + normalOffset));
  label.position.copy(p);
  const m = new THREE.Matrix4().makeBasis(right, up, normal);
  label.quaternion.setFromRotationMatrix(m);
  mesh.add(label);
  return label;
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ── Dimension helpers ──
function dimTextSprite(text) {
  const cw=320,ch=80;
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(10,10,10,0.80)';
  roundRect(ctx, 4, 4, cw-8, ch-8, 8); ctx.fill();
  ctx.fillStyle='#e8e0cc'; ctx.font='bold 30px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,cw/2,ch/2);
  const tex=new THREE.CanvasTexture(cv);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({
    map:tex,
    depthTest:false,
    depthWrite:false,
    transparent:true
  }));
  s.renderOrder = 1001;
  s.scale.set(0.56,0.14,1);
  return s;
}

function dimLine3(p1,p2,color=0xddcc88) {
  const g=new THREE.BufferGeometry().setFromPoints([p1,p2]);
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false}));
  l.renderOrder=1000; return l;
}

function addDim(grp,p1,p2,label,color=0xddcc88) {
  const span = p2.clone().sub(p1);
  const len = span.length();
  if (len < 1e-6) {
    const spr = dimTextSprite(label);
    spr.position.copy(p1.clone().add(new THREE.Vector3(0.12, 0.12, 0.12)));
    grp.add(spr);
    return;
  }
  grp.add(dimLine3(p1,p2,color));
  const dir=span.clone().multiplyScalar(1/len);
  const perp=new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(0.12);
  if(perp.lengthSq()<0.001) perp.set(0.12,0,0);
  grp.add(dimLine3(p1.clone().sub(perp),p1.clone().add(perp),color));
  grp.add(dimLine3(p2.clone().sub(perp),p2.clone().add(perp),color));
  const spr=dimTextSprite(label);
  // Keep text clear of the dimension line by shifting it outward.
  const labelOff = perp.clone().normalize().multiplyScalar(0.16);
  spr.position.copy(p1.clone().lerp(p2,0.5).add(labelOff));
  grp.add(spr);
}

function addDimLocal(group, adjLen, panelH) {
  const eDimOff=0.45, eDimZ=adjLen, color=0xdd9944;
  const p1=new THREE.Vector3(eDimOff,0,eDimZ);
  const p2=new THREE.Vector3(eDimOff,panelH,eDimZ);
  group.add(dimLine3(p1,p2,color));
  const perp=new THREE.Vector3(0.12,0,0);
  group.add(dimLine3(p1.clone().sub(perp),p1.clone().add(perp),color));
  group.add(dimLine3(p2.clone().sub(perp),p2.clone().add(perp),color));
  [[p1,0],[p2,panelH]].forEach(([pt])=>{
    const eg=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.05,pt.y,eDimZ),new THREE.Vector3(eDimOff,pt.y,eDimZ)]);
    const el=new THREE.Line(eg,new THREE.LineBasicMaterial({color,depthTest:false}));
    el.renderOrder=1; group.add(el);
  });
  const spr=dimTextSprite(panelH.toFixed(1)+'m');
  spr.position.set(eDimOff+0.42,panelH/2,eDimZ);
  group.add(spr);
}

function clearHoverSectionDimensions() {
  while (hoverDimGroup.children.length) hoverDimGroup.remove(hoverDimGroup.children[0]);
}

const HOVER_DIM_STYLE_DEFAULT = {
  face: 0xd8c67f,
  vert: 0xaad8aa,
  horiz: 0x88c8ee,
  bottom: 0xcc9bcc,
  top: 0xdd88bb,
  arc: 0x99c8ff,
  normalOffset: 0.1,
  lateralOffset: 0.22,
  sideSign: 1,
};

const HOVER_DIM_STYLES = {
  A: { face: 0x9fd88f, vert: 0x8fd7a6, horiz: 0x8ac4e6, arc: 0x8bb9ff, normalOffset: 0.11, lateralOffset: 0.30, sideSign: -1 },
  B: { face: 0xb9d98f, vert: 0xa3d48f, horiz: 0x95cbe6, arc: 0x92beff, normalOffset: 0.11, lateralOffset: 0.27, sideSign: -1 },
  C: { face: 0xb6d89f, vert: 0x96d5a6, horiz: 0x7bc3e9, arc: 0x87bcff, normalOffset: 0.11, lateralOffset: 0.24, sideSign: 1 },
  D: { face: 0xc2d89e, vert: 0x9dd19d, horiz: 0x75bde5, arc: 0x82b7ff, normalOffset: 0.13, lateralOffset: 0.30, sideSign: 1 },
  E: { face: 0xf0bd78, vert: 0xe2c08a, horiz: 0x7cc4ef, arc: 0xffb978, normalOffset: 0.16, lateralOffset: 0.26, sideSign: -1 },
  F: { face: 0xd3a7ef, vert: 0xbfa0e8, horiz: 0x87c4ec, arc: 0xc9a2ff, normalOffset: 0.14, lateralOffset: 0.29, sideSign: 1 },
};

function getHoverDimStyle(wallId) {
  return Object.assign({}, HOVER_DIM_STYLE_DEFAULT, HOVER_DIM_STYLES[wallId] || {});
}

function toVec3(value) {
  if (!value) return null;
  if (value.isVector3) return value.clone();
  const x = Number(value.x), y = Number(value.y), z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return new THREE.Vector3(x, y, z);
}

function getSectionWorldFrame(mesh, info) {
  if (!mesh || !info) return null;

  const faceBottomWorld = toVec3(info.faceBottomWorld);
  const faceTopWorld = toVec3(info.faceTopWorld);
  const faceBottomLocal = toVec3(info.faceBottomLocal);
  const faceTopLocal = toVec3(info.faceTopLocal);

  const bottom = faceBottomWorld || mesh.localToWorld(faceBottomLocal || new THREE.Vector3(0, 0, 0));
  const top = faceTopWorld || mesh.localToWorld(faceTopLocal || new THREE.Vector3(0, info.faceLength, 0));
  const faceVec = top.clone().sub(bottom);
  const faceLen = faceVec.length();
  if (faceLen < 1e-6) return null;
  const faceDir = faceVec.clone().normalize();

  const q = mesh.getWorldQuaternion(new THREE.Quaternion());
  let normal = toVec3(info.normalWorld);
  if (!normal) {
    const normalLocal = toVec3(info.normalLocal);
    normal = normalLocal ? normalLocal.applyQuaternion(q) : new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  }
  if (!Number.isFinite(normal.x) || normal.lengthSq() < 1e-8) {
    normal = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), faceDir);
  }
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
  else normal.normalize();

  let widthDir = toVec3(info.widthDirWorld);
  if (!widthDir) {
    const widthDirLocal = toVec3(info.widthDirLocal);
    if (widthDirLocal) widthDir = widthDirLocal.applyQuaternion(q);
    else widthDir = mesh.localToWorld(new THREE.Vector3(1, 0, 0)).sub(bottom);
  }
  if (!Number.isFinite(widthDir.x) || widthDir.lengthSq() < 1e-8) widthDir.set(1, 0, 0);
  else widthDir.normalize();

  // Keep width axis perpendicular to face axis for stable label orientation.
  widthDir.sub(faceDir.clone().multiplyScalar(widthDir.dot(faceDir)));
  if (widthDir.lengthSq() < 1e-8) widthDir = new THREE.Vector3().crossVectors(faceDir, normal);
  if (widthDir.lengthSq() < 1e-8) widthDir.set(1, 0, 0);
  else widthDir.normalize();

  const trueNormal = new THREE.Vector3().crossVectors(widthDir, faceDir).normalize();
  if (trueNormal.dot(normal) < 0) {
    widthDir.multiplyScalar(-1);
    trueNormal.multiplyScalar(-1);
  }

  return {
    bottom,
    top,
    faceDir,
    widthDir,
    normal: trueNormal,
    faceLen,
    horizVec: new THREE.Vector3(faceVec.x, 0, faceVec.z),
  };
}

function placeFaceLabel(parent, mesh, info, letter, sub, opts={}) {
  const frame = getSectionWorldFrame(mesh, info);
  if (!frame) return null;

  const alongFace = Number.isFinite(opts.alongFace) ? opts.alongFace : 0.5;
  const alongWidth = Number.isFinite(opts.alongWidth) ? opts.alongWidth : 0;
  const normalOffset = Number.isFinite(opts.normalOffset) ? opts.normalOffset : 0.012;
  const width = Number.isFinite(opts.width) ? opts.width : 0.56;
  const height = Number.isFinite(opts.height) ? opts.height : 0.28;
  const normalSign = opts.normalSign === -1 ? -1 : 1;
  const widthDir = frame.widthDir.clone().multiplyScalar(normalSign);
  const normal = frame.normal.clone().multiplyScalar(normalSign);

  const label = makeFaceLabelMesh(letter, sub, width, height);
  const anchor = frame.bottom.clone().lerp(frame.top, alongFace)
    .add(widthDir.clone().multiplyScalar(alongWidth))
    .add(normal.clone().multiplyScalar(normalOffset));

  const m = new THREE.Matrix4().makeBasis(widthDir, frame.faceDir, normal);
  label.quaternion.setFromRotationMatrix(m);
  label.position.copy(anchor);

  if (parent) parent.add(label);
  return label;
}

function getFaceEdgeAnchors(mesh, frame) {
  const pos = mesh?.geometry?.attributes?.position;
  if (!pos || pos.count < 2) return null;
  mesh.updateMatrixWorld(true);

  const samples = [];
  const tmp = new THREE.Vector3();
  let minF = Infinity, maxF = -Infinity;
  let minW = Infinity, maxW = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
    const rel = tmp.clone().sub(frame.bottom);
    const f = rel.dot(frame.faceDir);
    const w = rel.dot(frame.widthDir);
    samples.push({v: tmp.clone(), f, w});
    if (f < minF) minF = f;
    if (f > maxF) maxF = f;
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
  }

  if (!Number.isFinite(minF) || !Number.isFinite(maxF) || maxF - minF < 1e-6) return null;
  const spanF = maxF - minF;
  const spanW = Math.max(0.001, maxW - minW);
  const band = Math.max(0.01, spanF * 0.15);
  const sideBand = Math.max(0.01, spanW * 0.10);
  const bottomPts = samples.filter(s => s.f <= minF + band);
  const topPts = samples.filter(s => s.f >= maxF - band);

  const avg = pts => {
    const p = new THREE.Vector3();
    if (!pts.length) return null;
    pts.forEach(pt => p.add(pt.v));
    return p.multiplyScalar(1 / pts.length);
  };

  const pickSide = (pts, side) => {
    if (!pts.length) return null;
    const targetW = side === 'right' ? Math.max(...pts.map(p => p.w)) : Math.min(...pts.map(p => p.w));
    const near = pts.filter(p => Math.abs(p.w - targetW) <= sideBand);
    return avg(near.length ? near : pts);
  };

  let bottomLeft = pickSide(bottomPts, 'left');
  let bottomRight = pickSide(bottomPts, 'right');
  let topLeft = pickSide(topPts, 'left');
  let topRight = pickSide(topPts, 'right');

  if (!bottomLeft || !bottomRight || !topLeft || !topRight) {
    const halfW = spanW * 0.5;
    bottomLeft = frame.bottom.clone().add(frame.widthDir.clone().multiplyScalar(-halfW));
    bottomRight = frame.bottom.clone().add(frame.widthDir.clone().multiplyScalar(halfW));
    topLeft = frame.top.clone().add(frame.widthDir.clone().multiplyScalar(-halfW));
    topRight = frame.top.clone().add(frame.widthDir.clone().multiplyScalar(halfW));
  }

  return {bottomLeft, bottomRight, topLeft, topRight};
}

function drawHoverAngle(origin, dir, angleDeg, color=0x99c8ff) {
  const absAngle = Math.abs(angleDeg);
  if (absAngle < 0.001) return absAngle;

  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
  if (!Number.isFinite(axis.x) || axis.lengthSq() < 1e-8) return absAngle;

  const rayR = 0.42;
  hoverDimGroup.add(dimLine3(origin, origin.clone().add(up.clone().multiplyScalar(rayR)), color));
  hoverDimGroup.add(dimLine3(origin, origin.clone().add(dir.clone().multiplyScalar(rayR)), color));

  const theta = absAngle * Math.PI / 180;
  const arcR = 0.33;
  const arcPts = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = up.clone().applyAxisAngle(axis, theta * t).multiplyScalar(arcR).add(origin);
    arcPts.push(v);
  }
  const arcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({color, depthTest:false, depthWrite:false})
  );
  arcLine.renderOrder = 1000;
  hoverDimGroup.add(arcLine);

  const mid = up.clone().applyAxisAngle(axis, theta * 0.5).multiplyScalar(arcR + 0.08).add(origin);
  const sprite = dimTextSprite(`${absAngle.toFixed(1)}°`);
  sprite.scale.set(0.40, 0.10, 1);
  sprite.position.copy(mid);
  hoverDimGroup.add(sprite);
  return absAngle;
}

function drawHoverSectionDimensions(mesh, info) {
  clearHoverSectionDimensions();
  if (!mesh || !info) return null;
  const style = getHoverDimStyle(info.wall);
  const showTopDim =
    (info.wall === 'E' && info.section === 'Section 1') ||
    ((info.wall === 'F' || info.wall === 'D') && info.section === 'Section 1');

  const frame = getSectionWorldFrame(mesh, info);
  if (!frame) return null;
  const edges = getFaceEdgeAnchors(mesh, frame);
  const bottom = frame.bottom;
  const top = frame.top;
  const faceDir = frame.faceDir;
  const faceLen = frame.faceLen;
  const horizVec = frame.horizVec;
  const horizLen = horizVec.length();
  const vertLen = Math.abs(top.y - bottom.y);
  const normal = frame.normal.clone().normalize();
  const widthDir = frame.widthDir.clone().normalize();
  const widthPlanar = widthDir.clone().setY(0);
  if (widthPlanar.lengthSq() < 1e-8) widthPlanar.copy(widthDir);
  widthPlanar.normalize();

  const bLeft = edges ? edges.bottomLeft : bottom.clone().add(widthDir.clone().multiplyScalar(-0.2));
  const bRight = edges ? edges.bottomRight : bottom.clone().add(widthDir.clone().multiplyScalar(0.2));
  const tLeft = edges ? edges.topLeft : top.clone().add(widthDir.clone().multiplyScalar(-0.2));
  const tRight = edges ? edges.topRight : top.clone().add(widthDir.clone().multiplyScalar(0.2));
  const edgeBottom = style.sideSign >= 0 ? bRight : bLeft;
  const edgeTop = style.sideSign >= 0 ? tRight : tLeft;

  // Keep Face/Top on the top-edge side and push them farther off the wall.
  const topTrackOff = normal.clone().multiplyScalar(style.normalOffset + 0.32)
    .add(widthPlanar.clone().multiplyScalar(style.sideSign * 0.18));
  const p1 = edgeTop.clone().add(topTrackOff);
  const p0 = p1.clone().add(faceDir.clone().multiplyScalar(-faceLen));
  addDim(hoverDimGroup, p0, p1, `Face ${faceLen.toFixed(2)}m`, style.face);

  const vertBase = bLeft.clone().add(normal.clone().multiplyScalar(style.normalOffset + 0.12)).add(widthPlanar.clone().multiplyScalar(-0.10));
  const vBottom = new THREE.Vector3(vertBase.x, bottom.y, vertBase.z);
  const vTop = new THREE.Vector3(vertBase.x, top.y, vertBase.z);
  addDim(hoverDimGroup, vBottom, vTop, `Vert ${vertLen.toFixed(2)}m`, style.vert);

  const horizDir = horizVec.lengthSq() < 1e-8
    ? widthPlanar.clone()
    : horizVec.clone().normalize();
  const hBase = bLeft.clone().lerp(bRight, 0.5)
    .add(normal.clone().multiplyScalar(style.normalOffset + 0.16))
    .add(widthPlanar.clone().multiplyScalar(0.16));
  const hStart = new THREE.Vector3(hBase.x, bottom.y - 0.04, hBase.z);
  const hEnd = hStart.clone().add(horizDir.clone().multiplyScalar(horizLen));
  addDim(hoverDimGroup, hStart, hEnd, `Horiz ${horizLen.toFixed(2)}m`, style.horiz);

  const bBase = bLeft.clone().add(normal.clone().multiplyScalar(style.normalOffset + 0.22)).add(widthPlanar.clone().multiplyScalar(-0.22));
  const g1 = new THREE.Vector3(bBase.x, 0, bBase.z);
  const b1 = new THREE.Vector3(bBase.x, bottom.y, bBase.z);
  addDim(hoverDimGroup, g1, b1, `Bottom ${bottom.y.toFixed(2)}m`, style.bottom);

  if (showTopDim) {
    const tBase = edgeTop.clone().add(normal.clone().multiplyScalar(style.normalOffset + 0.36))
      .add(widthPlanar.clone().multiplyScalar(style.sideSign * 0.28));
    const g2 = new THREE.Vector3(tBase.x, 0, tBase.z);
    const t1 = new THREE.Vector3(tBase.x, top.y, tBase.z);
    addDim(hoverDimGroup, g2, t1, `Top ${top.y.toFixed(2)}m`, style.top);
  }

  const absAngle = drawHoverAngle(
    edgeTop.clone()
      .add(normal.clone().multiplyScalar(style.normalOffset + 0.40))
      .add(widthPlanar.clone().multiplyScalar(style.sideSign * 0.36)),
    faceDir,
    info.angleDeg,
    style.arc
  );

  return {
    wall: info.wall,
    section: info.section,
    angleDeg: Number.isFinite(absAngle) ? absAngle : Math.abs(info.angleDeg || 0),
    faceLength: faceLen,
    verticalHeight: vertLen,
    horizontalLength: horizLen,
    bottomY: bottom.y,
    topY: top.y,
  };
}
