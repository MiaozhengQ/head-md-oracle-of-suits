let balls = [];
let maxBalls = 8;  // 4 suits + 16 mirror pieces
let lastTouchTime = 0;
let touchCooldown = 300; // ms per-ball cooldown

// suit images
let diamondImg, clubImg, heartImg, spadeImg;
let mirrorImgs = []; // mirror1..mirror4

// p5 canvas reference so we can position it in the page
let cnv = null;

// --- moving canvas circle setup ---
let circleG; // offscreen graphics for circular canvas
let mainG;  // 主 offscreen，把所有内容先画到这里
let frameImg; // 最外围蒙版 frame.png（素材相框）
let frameMaskImg = null; // 由 frame.png 反转 alpha 生成的遮罩（白=保留，黑=裁切）
let frameMaskReady = false;
let frameInnerBounds = { x: 0, y: 0, w: 0, h: 0 }; // 镜框内窗的内接矩形（用于约束位置）
const INDEX_CIRCLE_RADIUS = 90;
let indexPos = null; // position of index finger circle
let canvasBG; // background color
let maskColor; // color tint inside the circular mask
const SUIT_SCALE = 1.8;
const MIRROR_SCALE = 2.2;
const MIRROR_ALPHA = 180;
const EDGE_MARGIN = 20; // minimum distance from any image edge to canvas border
// 花色垂直带状范围（相对于镜框内窗高度的比例）
const SUIT_Y_BAND_TOP = 0.05;     // 扩大带宽：更靠近顶部
const SUIT_Y_BAND_BOTTOM = 0.85;  // 扩大带宽：更靠近底部
const SUIT_Y_GAP = 90;            // 花色之间的最小“垂直间距”（像素）
// snap settings
const SNAP_HOLD_FRAMES = 30;   // how many consecutive frames inside mask before snapping
const SNAP_LERP = 0.15;        // how fast the suit moves to the target
const TARGET_PAD = 80;         // padding from edges for slot positions
let suitTargets = {};          // computed target positions for each suit

// 花色分布参数
const SUIT_CENTER_Y_OFFSET = -0.02; // 负值上移约 22% 内窗高度
const SUIT_SPREAD_X = 0.30;         // 水平分布半径（越大越分散）
const SUIT_SPREAD_Y = 1.92;         // 垂直分布半径（扩大上下范围）

function preload() {
  // put diamond.png, club.png, heart.png, spade.png in an "assets" folder next to this sketch
  diamondImg = loadImage('assets/diamond.png');
  clubImg    = loadImage('assets/club.png');
  heartImg   = loadImage('assets/heart.png');
  spadeImg   = loadImage('assets/spade.png');
  // load broken mirror images: assets/mirror1.png ... assets/mirror4.png
  for (let i = 1; i <= 4; i++) {
    mirrorImgs.push(loadImage(`assets/mirror${i}.png`));
  }
  // 加载最外层蒙版图片（需与画布同尺寸或按画布缩放）
  frameImg = loadImage('assets/frame.png');
}

// selection / dragging state
let selectedBall = -1;
let selectedHand = -1; // index of the hand that grabbed the ball
let dragOffsetX = 0;
let dragOffsetY = 0;
const RELEASE_DISTANCE = 120; // px threshold to release when finger moves away
const ballRadius = 50; // fallback used by helper (if needed)

// --- depth-based pick settings (pick-by-depth / approach) ---
let baselineFingerZ = [];            // per-hand baseline z to detect approach
const DEPTH_THRESHOLD = 0.08;        // z-delta required to consider "approach" (tune)
const PICK_RADIUS = 140;             // px radius to search nearest ball when approach happens
const RELEASE_DEPTH_FACTOR = 0.5;    // fraction of DEPTH_THRESHOLD below which to release

function initSuitTargets() {
  // keep targets inside frame inner window
  const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
  const leftX   = ib.x + EDGE_MARGIN + TARGET_PAD;
  const rightX  = ib.x + ib.w - (EDGE_MARGIN + TARGET_PAD);
  const topY    = ib.y + EDGE_MARGIN + TARGET_PAD;
  const bottomY = ib.y + ib.h - (EDGE_MARGIN + TARGET_PAD);
  const midX = ib.x + ib.w / 2;
  const midY = ib.y + ib.h / 2;
  suitTargets = {
    diamond: { x: midX,  y: topY },    // top-center
    club:    { x: rightX, y: midY },   // right-center
    heart:   { x: midX,  y: bottomY }, // bottom-center
    spade:   { x: leftX,  y: midY }    // left-center
  };
}

function setup() {
  // 保持镜框原始比例 450:580
  const targetW = 450;
  const targetH = 580;
  const scale = min(windowWidth / targetW, windowHeight / targetH);
  const canvasW = targetW * scale;
  const canvasH = targetH * scale;
  cnv = createCanvas(canvasW, canvasH);
  centerCanvas();
  pixelDensity(1);
  setupHands();
  setupVideo();
  colorMode(HSB, 255);

  // set canvas background color
  canvasBG = color(210, 80, 30);
  // set mask color (HSB: hue, saturation, brightness, alpha)
  maskColor = color(150, 100, 200, 120);

  circleG = createGraphics(width, height);
  circleG.pixelDensity(1);
  mainG = createGraphics(width, height);
  mainG.pixelDensity(1);
  mainG.colorMode(HSB, 255);

  // 生成"内窗为白"的遮罩（基于 frame.png，使用 copy 保证尺寸与像素密度一致）
  if (frameImg && frameImg.width > 0) {
    const scaledFrame = createImage(width, height);
    scaledFrame.copy(frameImg, 0, 0, frameImg.width, frameImg.height, 0, 0, width, height);
    scaledFrame.loadPixels();
    frameMaskImg = createImage(width, height);
    frameMaskImg.loadPixels();
    for (let i = 0; i < scaledFrame.pixels.length; i += 4) {
      const a = scaledFrame.pixels[i + 3];
      const m = 255 - a; // 中心透明(0)->255，边框不透明(255)->0
      // p5.Image.mask 使用的是 mask 的 alpha 通道
      frameMaskImg.pixels[i]     = 255; // RGB 随意
      frameMaskImg.pixels[i + 1] = 255;
      frameMaskImg.pixels[i + 2] = 255;
      frameMaskImg.pixels[i + 3] = m;   // 关键：alpha = m（白=保留，黑=裁切）
    }
    frameMaskImg.updatePixels();
    frameMaskReady = true;
    computeFrameInnerBounds(); // 基于 mask 计算镜框内窗的内接矩形
  }

  initSuitTargets(); // compute snap targets based on current canvas size

  // shuffle suits so each appears exactly once
  const suitsPool = shuffle(['diamond', 'club', 'heart', 'spade']);

  // create balls: one of each suit + plain circles
  for (let i = 0; i < maxBalls; i++) {
    const suit = (i < suitsPool.length) ? suitsPool[i] : null;
    const mirrorIndex = (suit === null) ? ((i - suitsPool.length) % mirrorImgs.length) : -1;

    const baseR = random(20, 60);
    const renderRadius = suit
      ? baseR * SUIT_SCALE
      : (baseR * 2.5 * MIRROR_SCALE);
    // 生成在镜框内窗范围内
    const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
    const minX = ib.x + renderRadius + EDGE_MARGIN;
    const maxX = ib.x + ib.w - renderRadius - EDGE_MARGIN;
    const minY = ib.y + renderRadius + EDGE_MARGIN;
    const maxY = ib.y + ib.h - renderRadius - EDGE_MARGIN;
    // 花色在可用带状区域内生成
    const bandMinY = ib.y + ib.h * SUIT_Y_BAND_TOP  + renderRadius + EDGE_MARGIN;
    const bandMaxY = ib.y + ib.h * SUIT_Y_BAND_BOTTOM - renderRadius - EDGE_MARGIN;

    // 采样位置：花色增加“垂直间距”约束
    let initX = random(minX, maxX);
    let initY = suit ? random(bandMinY, bandMaxY) : random(minY, maxY);
    if (suit) {
      let placed = false;
      for (let t = 0; t < 60; t++) {
        const tx = random(minX, maxX);
        const ty = random(bandMinY, bandMaxY);
        let ok = true;
        for (const o of balls) {
          if (!o.suit) continue;
          if (abs(ty - o.y) < SUIT_Y_GAP) { ok = false; break; } // 垂直最小间距
        }
        if (ok) { initX = tx; initY = ty; placed = true; break; }
      }
      if (!placed) { initX = random(minX, maxX); initY = random(bandMinY, bandMaxY); }
    }

    balls.push({
      x: initX,
      y: initY,
      baseRadius: baseR,
      radius: 0,
      color: color(random(255), 200, 200),
      suit: suit,
      wiggle: random(-2, 2),
      wiggleSpeed: random(0.03, 0.08),
      noiseX: random(1000),
      noiseY: random(1000),
      lastTouched: 0,
      active: true,
      isMirror: suit === null,
      mirrorIndex: mirrorIndex,
      // snap state (suits only)
      insideCount: 0,
      snap: false,
      locked: false,
      targetX: suit ? suitTargets[suit].x : undefined,
      targetY: suit ? suitTargets[suit].y : undefined
    });
  }
  balls.forEach(b => b.radius = b.baseRadius);
  enforceMaxOverlap(0.10);
  keepInsideAllBalls(); // final clamp after overlap adjustment
}

function windowResized() {
  // 保持原始比例缩放
  const targetW = 450;
  const targetH = 580;
  const scale = min(windowWidth / targetW, windowHeight / targetH);
  const canvasW = targetW * scale;
  const canvasH = targetH * scale;
  resizeCanvas(canvasW, canvasH);
   
   // 重新生成 offscreen graphics
   circleG = createGraphics(width, height);
   circleG.pixelDensity(1);
   mainG = createGraphics(width, height);
   mainG.pixelDensity(1);
   mainG.colorMode(HSB, 255);
  
  // 重新生成 frame mask
  if (frameImg && frameImg.width > 0) {
    const scaledFrame = createImage(width, height);
    scaledFrame.copy(frameImg, 0, 0, frameImg.width, frameImg.height, 0, 0, width, height);
    scaledFrame.loadPixels();
    frameMaskImg = createImage(width, height);
    frameMaskImg.loadPixels();
    for (let i = 0; i < scaledFrame.pixels.length; i += 4) {
      const a = scaledFrame.pixels[i + 3];
      const m = 255 - a;
      frameMaskImg.pixels[i]     = 255;
      frameMaskImg.pixels[i + 1] = 255;
      frameMaskImg.pixels[i + 2] = 255;
      frameMaskImg.pixels[i + 3] = m;
    }
    frameMaskImg.updatePixels();
    frameMaskReady = true;
    computeFrameInnerBounds();
  }
  
  initSuitTargets();
  // refresh target positions for suits
  for (const b of balls) {
    if (b.suit) {
      b.targetX = suitTargets[b.suit].x;
      b.targetY = suitTargets[b.suit].y;
    }
  }
  keepInsideAllBalls();
}

// center the canvas element on the page
function centerCanvas() {
  if (!cnv) return;
  // 画布居中显示
  const x = (windowWidth - width) / 2;
  const y = (windowHeight - height) / 2;
  cnv.position(x, y);
}
 
function draw() {
  // 先清空并绘制到 offscreen
  mainG.clear();
  mainG.background(canvasBG);
  circleG.clear();

  if (isVideoReady()) {
    // video ready
  }

  strokeWeight(2);

  if (detections) {
    for (let h = 0; h < detections.multiHandLandmarks.length; h++) {
      const hand = detections.multiHandLandmarks[h];

      // update indexPos (center of moving circle)
      drawIndex(hand);
      
      // draw hand connections INTO circleG
      drawConnectionsToGraphics(hand, circleG);

      const m = hand[FINGER_TIPS.index];
      if (m) {
        const ix = m.x * width;
        const iy = m.y * height;
        const z = (typeof m.z === 'number') ? m.z : 0;

        if (baselineFingerZ[h] == null) baselineFingerZ[h] = z;

        const dz = baselineFingerZ[h] - z;
        const approached = dz > DEPTH_THRESHOLD;

        if (!approached) baselineFingerZ[h] = lerp(baselineFingerZ[h], z, 0.02);

        if (selectedBall === -1) {
          for (let bi = 0; bi < balls.length; bi++) {
            const b = balls[bi];
            if (!b.active) continue;
            const d = dist(ix, iy, b.x, b.y);
            if (d <= b.radius && approached && (millis() - b.lastTouched > touchCooldown)) {
               selectedBall = bi;
               selectedHand = h;
               dragOffsetX = b.x - ix;
               dragOffsetY = b.y - iy;
               b.lastTouched = millis();
               b.color = color(random(255), 220, 220);
               b.radius += 12;
               setTimeout(() => { b.radius = max(b.baseRadius, b.radius - 12); }, 160);
               break;
             }
           }
         } else if (selectedBall !== -1 && selectedHand === h) {
           const b = balls[selectedBall];
           if (b) {
             b.x = ix + dragOffsetX;
             b.y = iy + dragOffsetY;
 
             const releaseByDepth = dz < (DEPTH_THRESHOLD * RELEASE_DEPTH_FACTOR);
             const d2 = dist(ix, iy, b.x, b.y);
             const releaseByDist = d2 > RELEASE_DISTANCE;
             if (releaseByDepth || releaseByDist) {
               b.radius = b.baseRadius;
               selectedBall = -1;
               selectedHand = -1;
             }
           } else {
             selectedBall = -1;
             selectedHand = -1;
           }
         }
       }
     }
  }

  if (selectedBall !== -1) {
    keepInsideAllBalls();
  }

  // check if any suit is inside the mask
  let suitInsideMask = false;
  if (indexPos) {
    for (const b of balls) {
      if (b.suit && dist(b.x, b.y, indexPos.x, indexPos.y) <= INDEX_CIRCLE_RADIUS) {
        suitInsideMask = true;
        break;
      }
    }
  }

  // change mask color to white if suit is inside, otherwise use original color
  let currentMaskColor = suitInsideMask ? color(0, 0, 255, 200) : maskColor; // HSB: (0,0,255) = white

  // draw balls INTO circleG
  drawBallsToGraphics(circleG);

  // --- render circular mask into mainG ---
  if (indexPos) {
    mainG.push();
    mainG.drawingContext.beginPath();
    mainG.drawingContext.arc(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS, 0, TWO_PI);
    mainG.drawingContext.clip();
    mainG.noStroke();
    mainG.fill(currentMaskColor);
    mainG.rect(0, 0, width, height);
    mainG.image(circleG, 0, 0);
    mainG.pop();
    // 可选轮廓
    mainG.push();
    mainG.noFill();
    mainG.stroke(0, 255, 255);
    mainG.strokeWeight(2);
    mainG.circle(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS * 2);
    mainG.pop();
  } else {
    // 没有手势时也显示内容，便于调试
    mainG.image(circleG, 0, 0);
  }

  // 先清空主画布，避免上帧残留在蒙版外
  clear();
  // 先用反转 mask 裁剪 mainG，再叠加 frame 装饰
  let composed = mainG.get(); // p5.Image 的拷贝
  if (frameMaskReady && frameMaskImg) {
    composed.mask(frameMaskImg); // 白=保留，黑=裁切
  }
  // 把裁剪后的内容画到主画布
  image(composed, 0, 0);
  if (frameImg && frameImg.width > 0) {
    image(frameImg, 0, 0, width, height); // 最上层相框装饰
  }

  // 显示文字提示
  push();
  fill(0, 0, 255); // 白色（HSB 模式：H,S,B）
  textSize(18);
  //显示在镜子中间
 //向上移动一点
  textAlign(CENTER, CENTER);
  text('Please find the suits to fix the mirror', width / 2, height / 2 - 100);
  pop();

  // --- after existing rendering / logic ---
  if (!transferred) {
    // 统计已被 lock 的花色数量
    const lockedSuitCount = balls.reduce((acc, b) => acc + ((b.suit && b.locked) ? 1 : 0), 0);
    if (lockedSuitCount >= 4) {
      transferred = true;
      // 把四个花色的最终数据保存到 localStorage（在目标页面可读取）
      const suitsData = balls.filter(b => b.suit).map(b => ({
        suit: b.suit, x: b.x, y: b.y, targetX: b.targetX, targetY: b.targetY, locked: b.locked
      }));
      try { localStorage.setItem('foundSuits', JSON.stringify(suitsData)); } catch(e) { /* ignore */ }

      // 跳转到目标页面（根据你的项目结构调整 URL）
      const redirectUrl = 'http://127.0.0.1:5500/code/2025-11-12-mirror1/index.html';
      // 若你希望在同一窗口打开，使用 location.href；若新窗口使用 window.open
      window.location.href = redirectUrl;
      // window.open(redirectUrl, '_blank');
    }
  }
}

// compute current (non‑pulsed) render radius for clamping
function currentRenderRadius(b) {
  if (b.suit) return b.radius * SUIT_SCALE;
  if (b.isMirror) return b.radius * 2.5 * MIRROR_SCALE; // mirror draw radius
  return b.radius;
}

function clampBallInside(b) {
  // 已锁定的 suit 不再约束（允许逃脱）
  if (b.suit && b.locked) return;
  
  // 已逃脱的碎片也需要约束在屏幕内（可选：让它们完全自由则删除此段）
  if (b.isMirror && b.escapedMask) {
    // 已逃脱的碎片：限制在逃脱范围内（以镜框边界为中心，最多移动 ESCAPE_MAX_DISTANCE）
    const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
    const centerX = ib.x + ib.w / 2;
    const centerY = ib.y + ib.h / 2;
    const dist2center = dist(b.x, b.y, centerX, centerY);
    
    if (dist2center > ESCAPE_MAX_DISTANCE) {
      // 超过逃脱距离，推回到边界
      const angle = atan2(b.y - centerY, b.x - centerX);
      b.x = centerX + cos(angle) * ESCAPE_MAX_DISTANCE;
      b.y = centerY + sin(angle) * ESCAPE_MAX_DISTANCE;
    }
    
    // 也限制离屏幕边缘的距离
    b.x = constrain(b.x, ESCAPE_EDGE_MARGIN, width - ESCAPE_EDGE_MARGIN);
    b.y = constrain(b.y, ESCAPE_EDGE_MARGIN, height - ESCAPE_EDGE_MARGIN);
    return;
  }
   
   const r = currentRenderRadius(b);
   const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
   b.x = constrain(b.x, ib.x + r + EDGE_MARGIN, ib.x + ib.w - (r + EDGE_MARGIN));
   b.y = constrain(b.y, ib.y + r + EDGE_MARGIN, ib.y + ib.h - (r + EDGE_MARGIN));
}

function keepInsideAllBalls() {
  for (const b of balls) clampBallInside(b);
}

// update index finger position (center of moving circle)
function drawIndex(landmarks) {
  if (!landmarks) { indexPos = null; return; }
  let mark = landmarks[FINGER_TIPS.index];
  if (!mark) { indexPos = null; return; }
  
  indexPos = createVector(mark.x * width, mark.y * height);
}

// draw hand connections INTO offscreen graphics
function drawConnectionsToGraphics(landmarks, g) {
  if (!landmarks || !g) return;
  g.stroke(frameCount % 255, 100, 255 - (frameCount % 255));
  g.strokeWeight(2);
  for (let connection of HAND_CONNECTIONS) {
    const a = landmarks[connection[0]];
    const b = landmarks[connection[1]];
    if (!a || !b) continue;
    let ax = a.x * width;
    let ay = a.y * height;
    let bx = b.x * width;
    let by = b.y * height;
    g.line(ax, ay, bx, by);
    let cx = (ax + bx) / 2 + random(-20, 20);
    let cy = (ay + by) / 2 + random(-20, 20);
    g.noFill();
    g.bezier(ax, ay, cx, cy, cx, cy, bx, by);
  }
}

// draw balls INTO offscreen graphics
function drawBallsToGraphics(g) {
  if (!g) return;
  g.noStroke();
  const now = millis();
  
  for (let b of balls) {
    // skip rendering locked suits (they've exited the canvas)
    if (b.locked) continue;
    
    g.fill(b.color);
    const t = frameCount;
    
    // initialize pulse state per ball
    if (b.pulseStart == null) b.pulseStart = 0;
    if (b.wasInside == null) b.wasInside = false;
    
    // only suits wiggle; mirrors stay static (unless locked, still allow small wiggle if you want)
    let rx = 0, ry = 0;
    if (b.suit) {
      const wig = b.locked ? 0.3 : 1; // reduce wiggle after locked, optional
      rx = (noise(b.noiseX + t * b.wiggleSpeed)) * 20 * b.wiggle * wig;
      ry = (noise(b.noiseY + t * b.wiggleSpeed)) * 20 * b.wiggle * wig;
    }
    
    // check if suit is inside the circle mask
    const inside = indexPos && dist(b.x, b.y, indexPos.x, indexPos.y) <= INDEX_CIRCLE_RADIUS;
    
    // snap logic: after staying inside for SNAP_HOLD_FRAMES, start moving outside canvas
    if (b.suit && !b.locked) {
      if (inside) {
        b.insideCount = (b.insideCount || 0) + 1;
        if (!b.snap && b.insideCount >= SNAP_HOLD_FRAMES) {
          b.snap = true;
          // snap 到圆心边缘附近（镜框内），然后锁定
          const angle = atan2(indexPos.y - b.y, indexPos.x - b.x);
          const snapRadius = INDEX_CIRCLE_RADIUS + 20;
          b.targetX = indexPos.x + cos(angle) * snapRadius;
          b.targetY = indexPos.y + sin(angle) * snapRadius;
          // 夹紧目标到镜框内
          const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
          const r = currentRenderRadius(b);
          b.targetX = constrain(b.targetX, ib.x + r, ib.x + ib.w - r);
          b.targetY = constrain(b.targetY, ib.y + r, ib.y + ib.h - r);
         }
       } else {
         b.insideCount = 0;
       }
       if (b.snap && b.targetX != null && b.targetY != null) {
         b.x = lerp(b.x, b.targetX, SNAP_LERP);
         b.y = lerp(b.y, b.targetY, SNAP_LERP);
         // lock when very close; also disable interaction
         if (dist(b.x, b.y, b.targetX, b.targetY) < 5) {
           b.x = b.targetX;
           b.y = b.targetY;
           b.locked = true;
           b.active = false;
           b.snap = false;
         }
       }
    }
    
    // 镜子碎片逃脱蒙版后，标记为 escapedMask（不再约束）
    if (b.isMirror) {
      if (inside) {
        b.escapedMask = false; // 还在蒙版内，重置标记
      } else if (!inside && b.escapedMask === false && b.wasInside) {
        // 从蒙版内逃出
        b.escapedMask = true;
      }
      if (b.escapedMask === undefined) b.escapedMask = false; // 初始化
    }
    
    // trigger pulse when entering the circle
    if (b.suit && inside && !b.wasInside) {
      b.wasInside = true;
      b.pulseStart = now;
    } else if (!inside) {
      b.wasInside = false;
    }
    
    // compute pulse multiplier (grows then settles)
    let pulseMul = 1;
    const PULSE_DURATION = 1200; // ms
    if (b.suit && b.pulseStart && (now - b.pulseStart) < PULSE_DURATION) {
      const e = (now - b.pulseStart) / PULSE_DURATION; // 0..1
      const ease = 1 - (1 - e) * (1 - e);
      pulseMul = 1 + 1.2 * (1 - ease);
    } else if (b.suit && b.pulseStart && (now - b.pulseStart) >= PULSE_DURATION) {
      b.pulseStart = 0;
    }
    
    // flash alpha when inside
    let imgAlpha = 255;
    if (b.suit && inside) {
      imgAlpha = 150 + floor(105 * (0.5 + 0.5 * sin(TWO_PI * (0.06 * t + b.noiseY))));
    }
    
    if (b.suit) {
      let img = null;
      if (b.suit === 'diamond') img = diamondImg;
      else if (b.suit === 'club') img = clubImg;
      else if (b.suit === 'heart') img = heartImg;
      else if (b.suit === 'spade') img = spadeImg;

      if (img) {
        g.push();
        g.imageMode(CENTER);
        g.tint(255, imgAlpha);
        const drawW = (b.radius * 2) * pulseMul * SUIT_SCALE * (img.width / max(img.height, 1));
        const drawH = (b.radius * 2) * pulseMul * SUIT_SCALE;
        g.image(img, b.x + rx, b.y + ry, drawW, drawH);
        g.pop();
        continue;
      }
    }
    
    // draw broken mirror image instead of circle
    if (b.isMirror && b.mirrorIndex >= 0 && mirrorImgs[b.mirrorIndex]) {
      g.push();
      g.imageMode(CENTER);
      const img = mirrorImgs[b.mirrorIndex];
      g.tint(255, MIRROR_ALPHA);
      const drawH = b.radius * 5 * MIRROR_SCALE;
      const drawW = drawH * (img.width / max(img.height, 1));
      g.image(img, b.x, b.y, drawW, drawH);
      g.noTint();
      g.pop();
    } else {
      g.circle(b.x, b.y, b.radius * 2);
    }
  }
}

function effectiveRadius(b) {
  if (b.suit) return b.baseRadius * SUIT_SCALE;
  if (b.isMirror) return (b.baseRadius * 5 * MIRROR_SCALE) * 0.5; // drawH is diameter
  return b.baseRadius;
}

function circleOverlapArea(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= abs(r1 - r2)) return PI * pow(min(r1, r2), 2);
  const alpha = acos((d*d + r1*r1 - r2*r2)/(2*d*r1));
  const beta  = acos((d*d + r2*r2 - r1*r1)/(2*d*r2));
  return r1*r1*alpha + r2*r2*beta - 0.5*sqrt( max(0, (-d + r1 + r2)*(d + r1 - r2)*(d - r1 + r2)*(d + r1 + r2)) );
}

function overlapFraction(b1, b2) {
  const r1 = effectiveRadius(b1);
  const r2 = effectiveRadius(b2);
  const d = dist(b1.x, b1.y, b2.x, b2.y);
  const area = circleOverlapArea(r1, r2, d);
  const minArea = PI * pow(min(r1, r2), 2);
  return minArea === 0 ? 0 : area / minArea;
}

function enforceMaxOverlap(maxFrac = 0.10, attemptsPerBall = 120) {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    let attempts = 0;
    while (attempts < attemptsPerBall) {
      let tooMuch = false;
      for (let j = 0; j < i; j++) {
        const other = balls[j];
        if (overlapFraction(b, other) > maxFrac) {
          tooMuch = true;
          break;
        }
      }
      if (!tooMuch) break;
      // reposition 在镜框内窗范围内
      const r = currentRenderRadius(b);
      const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
      const minX = ib.x + r + EDGE_MARGIN;
      const maxX = ib.x + ib.w - r - EDGE_MARGIN;
      const minY = ib.y + r + EDGE_MARGIN;
      const maxY = ib.y + ib.h - r - EDGE_MARGIN;
      const bandMinY = ib.y + ib.h * SUIT_Y_BAND_TOP  + r + EDGE_MARGIN;
      const bandMaxY = ib.y + ib.h * SUIT_Y_BAND_BOTTOM - r - EDGE_MARGIN;

      if (b.suit) {
        // 花色：在更宽垂直带内采样，并强制最小“垂直间距”
        let bestPos = { x: random(minX, maxX), y: random(bandMinY, bandMaxY) };
        let bestScore = -Infinity;
        for (let tries = 0; tries < 60; tries++) {
          const testX = random(minX, maxX);
          const testY = random(bandMinY, bandMaxY);
          // 垂直间距约束（仅对花色）
          let ok = true;
          for (let j = 0; j < i; j++) {
            const o = balls[j];
            if (!o.suit) continue;
            if (abs(testY - o.y) < SUIT_Y_GAP) { ok = false; break; }
          }
          if (!ok) continue;
          // 评分：离所有元素越远越好
          let minDistToOthers = Infinity;
          for (let j = 0; j < i; j++) {
            const d = dist(testX, testY, balls[j].x, balls[j].y);
            minDistToOthers = min(minDistToOthers, d);
          }
          if (minDistToOthers > bestScore) {
            bestScore = minDistToOthers;
            bestPos = { x: testX, y: testY };
          }
        }
        b.x = bestPos.x;
        b.y = bestPos.y;
      } else {
        // 碎片：以镜框内窗中心为核心，均匀分布
        const ib = frameInnerBounds.w > 0 ? frameInnerBounds : { x: 0, y: 0, w: width, h: height };
        const centerX = ib.x + ib.w / 2;
        const centerY = ib.y + ib.h / 2;
        const spreadRadiusX = ib.w * 0.42; // 水平半径：内窗宽的 42%，增大以分散
        const spreadRadiusY = ib.h * 0.42; // 竖直半径：内窗高的 42%，增大以分散
         
        let bestPos = null;
        let bestMinDist = -Infinity;
         
        for (let tries = 0; tries < 15; tries++) { // 增加尝试次数
           // 改为在椭圆内均匀随机（使用 sqrt 校正距离分布）
           const angle = random(TWO_PI);
           const distance = sqrt(random(1)); // sqrt 使分布均匀（不会偏向中心）
           const testX = centerX + cos(angle) * distance * spreadRadiusX;
           const testY = centerY + sin(angle) * distance * spreadRadiusY;
           
           // 确保在镜框内
           if (testX < minX || testX > maxX || testY < minY || testY > maxY) continue;
           
           let minDistToOthers = Infinity;
           for (let j = 0; j < i; j++) {
             const d = dist(testX, testY, balls[j].x, balls[j].y);
             minDistToOthers = min(minDistToOthers, d);
           }
           
           if (minDistToOthers > bestMinDist) {
             bestMinDist = minDistToOthers;
             bestPos = { x: testX, y: testY };
           }
         }
         
         if (bestPos) {
           b.x = bestPos.x;
           b.y = bestPos.y;
         } else {
           // 备选：若无法在中心附近找到位置，使用全范围随机
           b.x = random(minX, maxX);
           b.y = random(minY, maxY);
         }
       }
        attempts++;
      }
    }
  }

let transferred = false; // 新增：防止重复跳转

// 逃脱碎片的距离控制
const ESCAPE_MAX_DISTANCE = 2000;  // 碎片逃出后离镜框中心的最大距离（像素）
const ESCAPE_EDGE_MARGIN = 30;     // 逃脱碎片离屏幕边缘的最小距离

// 基于 mask 计算镜框内窗的内接矩形
function computeFrameInnerBounds() {
  if (!frameMaskReady || !frameMaskImg) {
    frameInnerBounds = { x: 0, y: 0, w: width, h: height };
    return;
  }
  frameMaskImg.loadPixels();
  let minX = width, maxX = -1, minY = height, maxY = -1;
  // 采样步长（加快扫描，越小越精确）
  const step = 2;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = 4 * (y * width + x);
      const a = frameMaskImg.pixels[idx + 3]; // alpha
      if (a > 10) { // 在保留区域内
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX >= minX && maxY >= minY) {
    // 分别调整水平和竖直的内缩距离
    const padHorizontal = 100; // 左右内缩距离，减小以平衡左右
    const padVertical = 100;   // 上下内缩距离
     minX = constrain(minX + padHorizontal, 0, width);
     minY = constrain(minY + padVertical, 0, height);
     maxX = constrain(maxX - padHorizontal, 0, width);
     maxY = constrain(maxY - padVertical, 0, height);
     frameInnerBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else {
      frameInnerBounds = { x: 0, y: 0, w: width, h: height };
    }
}