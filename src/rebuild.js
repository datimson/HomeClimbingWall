// ── Main rebuild ──
function rebuild() {
  // Clear dynamic groups
  while(wallGroup.children.length) wallGroup.remove(wallGroup.children[0]);
  while(dimGroup.children.length)  dimGroup.remove(dimGroup.children[0]);
  while(labelGroup.children.length) labelGroup.remove(labelGroup.children[0]);
  while(hoverDimGroup.children.length) hoverDimGroup.remove(hoverDimGroup.children[0]);
  hoverTargets.length = 0;
  adjPivot = null;

  const s = wallState;
  const dWidth = Math.max(0.1, W - s.bWidth - s.cWidth); // D fills remainder
  const fixedSideLen = s.aWidth;
  const adjLen = D - fixedSideLen;
  const HAvail = H_fixed - KICK;
  const roofBaseAvail = (H_fixed + 0.001) - KICK;

  // Top-edge depths used for the D↔F ceiling infill panel.
  const d1H = Math.max(0.1, Math.min(HAvail - 0.1, s.d1Height));
  const dTan1 = Math.tan(THREE.MathUtils.degToRad(s.dAngle));
  const dTan2 = Math.tan(THREE.MathUtils.degToRad(s.d2Angle));
  const dDen = Math.max(0.05, 1 - ROOF_PITCH_TAN * dTan2);
  const dRoofZRaw = (d1H * dTan1) + ((roofBaseAvail - d1H) * dTan2);
  const dRoofZ = THREE.MathUtils.clamp(
    dRoofZRaw / dDen,
    0,
    D
  );

  const f1H = Math.max(2.0, Math.min(HAvail - 0.1, s.f1Height));
  const fTan1 = Math.tan(THREE.MathUtils.degToRad(s.f1Angle));
  const fTan2 = Math.tan(THREE.MathUtils.degToRad(s.f2Angle));
  const fDen = Math.max(0.05, 1 + ROOF_PITCH_TAN * fTan2);
  const fRoofZRaw = D - (f1H * fTan1) - ((roofBaseAvail - f1H) * fTan2);
  const fRoofZ = THREE.MathUtils.clamp(
    fRoofZRaw / fDen,
    0,
    D
  );

  // ── Fixed walls ──
  buildBackSection(wallGroup, s.bWidth, s.bAngle, s.bWidth/2,                       fixedSideLen, 'B');
  buildBackSection(wallGroup, s.cWidth, s.cAngle, s.bWidth + s.cWidth/2,            fixedSideLen, 'C');
  buildBackSectionTwoStage(wallGroup, dWidth, s.dAngle, s.d2Angle, s.bWidth + s.cWidth + dWidth/2, s.d1Height, 'D');
  buildSideSection(wallGroup, fixedSideLen, s.aAngle, fixedSideLen, 'A');
  buildFWall(wallGroup, s.f1Width, s.f1Angle, s.f2Angle, s.f2WidthTop, s.f1Height);

  // Apply collision clipping
  applyClipping(s);

  // ── L-shaped roof cap ──
  buildLRoof(wallGroup, fixedSideLen, dWidth, s.f2WidthTop, dRoofZ, fRoofZ);

  // ── Adjustable panel ──
  buildAdjPanel(wallGroup, adjLen, fixedSideLen);

  // ── Labels ──
  function findWallLabelMesh(wallId) {
    const matches = hoverTargets.filter(m => m.userData?.sectionInfo?.wall === wallId);
    if (!matches.length) return null;
    return (
      matches.find(m => m.userData.sectionInfo.section === 'Section 1') ||
      matches.find(m => m.userData.sectionInfo.section === 'Section 2') ||
      matches.find(m => m.userData.sectionInfo.section === 'Kick') ||
      null
    );
  }
  const findGapMesh = () => {
    let found = null;
    wallGroup.traverse(obj => {
      if (found) return;
      if (obj?.isMesh && obj.userData?.labelWall === 'G') found = obj;
    });
    return found;
  };
  const labelDefs = [
    {id:'A', sub:s.aAngle+'°', normal:{x:0,y:0,z:-1}, up:{x:0,y:1,z:0}, width:0.56},
    {id:'B', sub:s.bAngle+'°', normal:{x:0,y:0,z:1},  up:{x:0,y:1,z:0}, width:0.56},
    {id:'C', sub:s.cAngle+'°', normal:{x:0,y:0,z:1},  up:{x:0,y:1,z:0}, width:0.56},
    {id:'D', sub:s.dAngle+'°/'+s.d2Angle+'°', normal:{x:0,y:0,z:1}, up:{x:0,y:1,z:0}, width:0.56},
  ];
  labelDefs.forEach(def => {
    const mesh = findWallLabelMesh(def.id);
    if (!mesh) return;
    addLocalFaceLabel(mesh, def.id, def.sub, {
      normalLocal: def.normal,
      upLocal: def.up,
      useFaceSlope: !!def.useFaceSlope,
      width: def.width,
      height: 0.28,
      normalOffset: 0.012,
    });
  });
  const fMesh = findWallLabelMesh('F');
  if (fMesh) {
    const fInfo = fMesh.userData.sectionInfo;
    placeFaceLabel(labelGroup, fMesh, fInfo, 'F', s.f1Angle+'°/'+s.f2Angle+'°', {
      width: 0.62,
      height: 0.28,
      alongFace: 0.52,
      normalOffset: 0.014,
      normalSign: -1,
    });
  }
  const gapMesh = findGapMesh();
  if (gapMesh) {
    addLocalFaceLabel(gapMesh, 'G', 'ply 17mm', {
      normalLocal: {x:0, y:-1, z:0},
      upLocal: {x:0, y:0, z:-1},
      width: 0.58,
      height: 0.26,
      normalOffset: 0.01,
    });
  }

  // ── Dimensions ──
  const off=0.35;
  // Floor W (along X, at z=D+off)
  addDim(dimGroup, new THREE.Vector3(0,-0.05,D+off), new THREE.Vector3(W,-0.05,D+off), '4.0m', 0xddcc88);
  // Floor D (along Z, at x=-off)
  addDim(dimGroup, new THREE.Vector3(-off,-0.05,0), new THREE.Vector3(-off,-0.05,D), '3.5m', 0xddcc88);
  // Kick height (along Y) — moved beside total height at wall D side
  addDim(dimGroup, new THREE.Vector3(W+off, 0, 0.45), new THREE.Vector3(W+off, KICK, 0.45), KICK.toFixed(2)+'m', 0xaaaaaa);
  // E reach dims — moved to front perimeter
  // E pivots at x=0, swings toward +X. Wall A occupies x=0 up to z=fixedSideLen.
  const ePanelH = H_adj - KICK;
  const eHorizReach = ePanelH * Math.sin(s.eAngle * Math.PI/180);
  const eTipX = Math.min(eHorizReach, W);
  const eGap = Math.max(0, W - eHorizReach);
  const ez = D + off + 0.45;
  // Blue: x=0 → E's tip (E's horizontal reach from its base)
  // Orange: E's tip → W (remaining gap to far wall)
  addDim(dimGroup, new THREE.Vector3(0,-0.05,ez), new THREE.Vector3(eTipX,-0.05,ez),
    eHorizReach.toFixed(2)+'m E', 0x55aaff);
  if (eGap > 0.01) {
    addDim(dimGroup, new THREE.Vector3(eTipX,-0.05,ez), new THREE.Vector3(W,-0.05,ez),
      eGap.toFixed(2)+'m', 0xffaa55);
  }
  // Cap W
  addDim(dimGroup, new THREE.Vector3(0,H_fixed+0.1,-off), new THREE.Vector3(W,H_fixed+0.1,-off), '4.0m', 0x88bbdd);
  // Cap D (fixedSideLen) — moved to opposite roof end
  addDim(dimGroup, new THREE.Vector3(-off,H_fixed+0.1,0), new THREE.Vector3(-off,H_fixed+0.1,fixedSideLen),
    fixedSideLen.toFixed(2)+'m', 0x88bbdd);
  // Ceiling infill wall (between D and F on the roof plane)
  const zNearMain = Math.min(dRoofZ, fRoofZ);
  const zFar = Math.max(dRoofZ, fRoofZ);
  const zNear = Math.min(zNearMain, fixedSideLen);
  const zGap = zFar - zNear;
  if (zGap > 0.01) {
    const yRoofDim = H_fixed + 0.22;
    addDim(dimGroup,
      new THREE.Vector3(W + 0.16, yRoofDim, zNear),
      new THREE.Vector3(W + 0.16, yRoofDim, zFar),
      zGap.toFixed(2)+'m G',
      0x5aaeff
    );
  }
  // Wall widths on floor (A, B, C, D)
  const wY = -0.05;
  addDim(dimGroup, new THREE.Vector3(0,wY,0.14), new THREE.Vector3(s.bWidth,wY,0.14),
    s.bWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(s.bWidth,wY,0.26), new THREE.Vector3(s.bWidth+s.cWidth,wY,0.26),
    s.cWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(s.bWidth+s.cWidth,wY,0.38), new THREE.Vector3(W,wY,0.38),
    dWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(0.14,wY,0), new THREE.Vector3(0.14,wY,fixedSideLen),
    fixedSideLen.toFixed(2)+'m', 0x88cc88);
  // Wall height (vertical)
  addDim(dimGroup, new THREE.Vector3(W+off, 0, 0), new THREE.Vector3(W+off, H_fixed, 0), H_fixed.toFixed(1)+'m', 0xdd88bb);
  // F widths moved to floor / ceiling like other width dimensions
  // F section 1 width (floor)
  addDim(
    dimGroup,
    new THREE.Vector3(W - s.f1Width, -0.05, D + off),
    new THREE.Vector3(W, -0.05, D + off),
    s.f1Width.toFixed(2)+'m F↓',
    0x9a5faa
  );
  // F section 2 top width (ceiling)
  addDim(
    dimGroup,
    new THREE.Vector3(W - s.f2WidthTop, H_fixed + 0.1, D + off),
    new THREE.Vector3(W, H_fixed + 0.1, D + off),
    s.f2WidthTop.toFixed(2)+'m F↑',
    0xcc99ff
  );
  // E width (inside room)
  addDim(dimGroup, new THREE.Vector3(0.22,0,fixedSideLen), new THREE.Vector3(0.22,0,D),
    adjLen.toFixed(2)+'m', 0xdd9944);

  // E adjustability arc
  const arcMin = -5;
  const arcMax = 60;
  const arcR = 0.95;
  const arcZ = fixedSideLen + Math.max(0.2, adjLen - 0.08);
  const arcStart = THREE.MathUtils.degToRad(90 - arcMax);
  const arcEnd = THREE.MathUtils.degToRad(90 - arcMin);
  const arcCurve = new THREE.EllipseCurve(0, KICK, arcR, arcR, arcStart, arcEnd, false, 0);
  const arcPts = arcCurve.getPoints(72).map(p => new THREE.Vector3(p.x, p.y, arcZ));
  const arcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({color:0xffaa55, depthTest:false})
  );
  arcLine.renderOrder = 2;
  dimGroup.add(arcLine);

  const rayMat = new THREE.LineBasicMaterial({color:0xffaa55, depthTest:false});
  const eArcPt = deg => {
    const rad = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(arcR * Math.sin(rad), KICK + arcR * Math.cos(rad), arcZ);
  };
  [arcMin, arcMax].forEach(deg => {
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, KICK, arcZ), eArcPt(deg)]),
      rayMat
    );
    ray.renderOrder = 2;
    dimGroup.add(ray);
  });

  const arcText = dimTextSprite('E -5°..60°');
  arcText.scale.set(0.50, 0.125, 1);
  arcText.position.copy(eArcPt((arcMin + arcMax) / 2)).add(new THREE.Vector3(0.28, 0.18, 0));
  dimGroup.add(arcText);
}

// Initial build
rebuild();

// ── Floor slab (static) ──
const floor = box(W, 0.05, D, new THREE.MeshLambertMaterial({color:0x222222}), 0,0,0, W/2, -0.025, D/2);
scene.add(floor);

// ── Crash mats (toggleable) ──
(function() {
  const seam = 0.02;
  const matW = (W - seam) * 0.5;
  const matD = (D - seam) * 0.5;
  const matY = CRASH_MAT_THICKNESS * 0.5;
  const matMaterial = new THREE.MeshLambertMaterial({
    color: 0x3f5f7f,
    transparent: true,
    opacity: 0.9
  });
  const edgeMaterial = new THREE.LineBasicMaterial({color: 0x6d91b7});

  crashMatsGroup = new THREE.Group();
  for (let ix = 0; ix < 2; ix++) {
    for (let iz = 0; iz < 2; iz++) {
      const cx = matW * 0.5 + ix * (matW + seam);
      const cz = matD * 0.5 + iz * (matD + seam);
      const pad = box(matW, CRASH_MAT_THICKNESS, matD, matMaterial, 0,0,0, cx, matY, cz);
      pad.add(new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), edgeMaterial));
      crashMatsGroup.add(pad);
    }
  }
  crashMatsGroup.visible = crashMatsEnabled;
  scene.add(crashMatsGroup);
})();

// ── Human scale reference (man.png, 1.75m visible height) ──
(function() {
  const personH = 1.75;
  const personOpacity = 0.5;
  const baseX = W * 0.5;
  const baseZ = D * 0.5;
  const facingY = -0.35;

  function addFallback() {
    scalePersonBillboard = null;
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, personH - 0.24, 6, 12),
      new THREE.MeshLambertMaterial({
        color:0x9aa3ad,
        transparent:true,
        opacity:personOpacity,
        depthWrite:false
      })
    );
    m.userData.personYOffset = personH * 0.5;
    m.position.set(baseX, getActiveFloorY() + m.userData.personYOffset, baseZ);
    m.rotation.y = facingY;
    m.castShadow = true;
    m.receiveShadow = true;
    scalePersonMesh = m;
    scene.add(m);
  }

  const embeddedManImage = (
    (typeof MAN_PNG_DATA_URL === 'string' && MAN_PNG_DATA_URL.length > 64)
      ? MAN_PNG_DATA_URL
      : (
          typeof window !== 'undefined' &&
          typeof window.MAN_PNG_DATA_URL === 'string' &&
          window.MAN_PNG_DATA_URL.length > 64
        )
          ? window.MAN_PNG_DATA_URL
          : null
  );
  const manImageUrl = (typeof embeddedManImage === 'string' && embeddedManImage.startsWith('data:image/'))
    ? embeddedManImage
    : null;
  if (!manImageUrl) {
    addFallback();
    return;
  }
  new THREE.TextureLoader().load(
    manImageUrl,
    tex => {
      const img = tex.image;
      if (!img || !img.width || !img.height) {
        addFallback();
        return;
      }

      const w = img.width;
      const h = img.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, w, h);
      const dst = ctx.createImageData(w, h);

      // Prefer alpha masking when transparency exists; otherwise separate the figure
      // from background using adaptive color-distance from corner samples.
      let hasTransparency = false;
      for (let i = 3; i < src.data.length; i += 4) {
        if (src.data[i] < 250) { hasTransparency = true; break; }
      }
      const cornerIdx = [
        0,
        ((w - 1) * 4),
        (((h - 1) * w) * 4),
        (((h - 1) * w + (w - 1)) * 4),
      ];
      let bgR = 0, bgG = 0, bgB = 0;
      cornerIdx.forEach(ci => {
        bgR += src.data[ci];
        bgG += src.data[ci + 1];
        bgB += src.data[ci + 2];
      });
      bgR /= 4; bgG /= 4; bgB /= 4;
      let maxColorDist = 0;
      if (!hasTransparency) {
        for (let i = 0; i < src.data.length; i += 4) {
          const r = src.data[i];
          const g = src.data[i + 1];
          const b = src.data[i + 2];
          const d = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          if (d > maxColorDist) maxColorDist = d;
        }
      }
      const adaptiveDistThresh = Math.max(3, maxColorDist * 0.18);

      let minX = w, minY = h, maxX = -1, maxY = -1;
      let keepCount = 0;
      for (let i = 0; i < src.data.length; i += 4) {
        const r = src.data[i];
        const g = src.data[i + 1];
        const b = src.data[i + 2];
        const a = src.data[i + 3];
        const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        let keep = false;
        if (hasTransparency) keep = a > 16;
        else keep = colorDist > adaptiveDistThresh;
        const di = i;
        if (keep) {
          // Normalize to a clearer silhouette while preserving anti-aliased edges.
          dst.data[di] = 196;
          dst.data[di + 1] = 204;
          dst.data[di + 2] = 214;
          dst.data[di + 3] = 255;
          keepCount++;
          const px = ((i / 4) % w) | 0;
          const py = ((i / 4) / w) | 0;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        } else {
          dst.data[di] = 0;
          dst.data[di + 1] = 0;
          dst.data[di + 2] = 0;
          dst.data[di + 3] = 0;
        }
      }
      const contentHRaw = (maxY >= minY) ? (maxY - minY + 1) : 0;
      const contentWRaw = (maxX >= minX) ? (maxX - minX + 1) : 0;
      if (keepCount < 64 || contentHRaw < h * 0.2 || contentWRaw < w * 0.1) {
        addFallback();
        return;
      }
      ctx.putImageData(dst, 0, 0);

      const silhouetteTex = new THREE.CanvasTexture(c);
      silhouetteTex.needsUpdate = true;
      silhouetteTex.minFilter = THREE.LinearFilter;
      silhouetteTex.magFilter = THREE.LinearFilter;
      if (renderer?.capabilities?.getMaxAnisotropy) {
        silhouetteTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }

      const contentH = contentHRaw;
      const contentW = contentWRaw;
      const planeH = personH * (h / contentH);
      const planeW = planeH * (w / h);
      const bottomMargin = (h - 1) - maxY;
      const yCenter = planeH * 0.5 - (bottomMargin / h) * planeH;
      const contentCenterX = (minX + maxX + 1) * 0.5;
      const xPixelOffset = contentCenterX - (w * 0.5);
      const xCenterOffset = -(xPixelOffset / w) * planeW;

      const billboard = new THREE.Mesh(
        new THREE.PlaneGeometry(planeW, planeH),
        new THREE.MeshBasicMaterial({
          map: silhouetteTex,
          transparent: true,
          opacity: personOpacity,
          alphaTest: 0.4,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      billboard.userData.personYOffset = yCenter;
      billboard.position.set(baseX + xCenterOffset, getActiveFloorY() + yCenter, baseZ);
      billboard.rotation.y = facingY;
      scene.add(billboard);
      scalePersonBillboard = billboard;
      scalePersonMesh = billboard;
      tex.dispose();
    },
    undefined,
    () => addFallback()
  );
})();

// ── Axis indicator (static, bottom-left corner area) ──
(function() {
  const origin = new THREE.Vector3(-0.6, 0.1, D + 0.6);
  const len = 0.22;
  const axes = [
    { dir: new THREE.Vector3(1,0,0), color: 0xff4444, label: '+X (width)' },
    { dir: new THREE.Vector3(0,1,0), color: 0x44ff44, label: '+Y (height)' },
    { dir: new THREE.Vector3(0,0,-1), color: 0x4488ff, label: '-Z (depth)' },
  ];
  axes.forEach(({dir, color, label}) => {
    const end = origin.clone().addScaledVector(dir, len);
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({color, depthTest:false})));
    // Arrowhead cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.075, 6),
      new THREE.MeshBasicMaterial({color, depthTest:false})
    );
    cone.position.copy(end);
    // Orient cone along dir
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    scene.add(cone);
    // Label
    const cw=180,ch=52;
    const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0)';
    ctx.fillRect(0,0,cw,ch);
    ctx.fillStyle = '#'+color.toString(16).padStart(6,'0');
    ctx.font='bold 20px monospace';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(label, 4, ch/2);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
    spr.scale.set(0.48,0.15,1);
    spr.position.copy(end).addScaledVector(dir, 0.16);
    scene.add(spr);
  });
})();
