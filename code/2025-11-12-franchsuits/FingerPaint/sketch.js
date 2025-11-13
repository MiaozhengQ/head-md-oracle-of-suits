let balls = [];
let maxBalls = 10;  // decrease from 25 to 10 (4 suits + 6 circles)
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
const INDEX_CIRCLE_RADIUS = 90;
let indexPos = null; // position of index finger circle
let canvasBG; // background color
let maskColor; // color tint inside the circular mask
const SUIT_SCALE = 1.8;
const MIRROR_SCALE = 2.2;
const MIRROR_ALPHA = 180;
const EDGE_MARGIN = 20; // minimum distance from any image edge to canvas border
// snap settings
const SNAP_HOLD_FRAMES = 30;   // how many consecutive frames inside mask before snapping
const SNAP_LERP = 0.15;        // how fast the suit moves to the target
const TARGET_PAD = 80;         // padding from edges for slot positions
let suitTargets = {};          // computed target positions for each suit

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
  // keep targets safely inside canvas
  const leftX   = EDGE_MARGIN + TARGET_PAD;
  const rightX  = width - (EDGE_MARGIN + TARGET_PAD);
  const topY    = EDGE_MARGIN + TARGET_PAD;
  const bottomY = height - (EDGE_MARGIN + TARGET_PAD); // 修正：用加号
  const midX = width / 2;
  const midY = height / 2;
  suitTargets = {
    diamond: { x: midX,  y: topY },    // top-center
    club:    { x: rightX, y: midY },   // right-center
    heart:   { x: midX,  y: bottomY }, // bottom-center
    spade:   { x: leftX,  y: midY }    // left-center
  };
}

function setup() {
  cnv = createCanvas(450, 580);
  centerCanvas();
  setupHands();
  setupVideo();
  colorMode(HSB, 255);

  // set canvas background color
  canvasBG = color(210, 80, 30);
  // set mask color (HSB: hue, saturation, brightness, alpha)
  maskColor = color(150, 100, 200, 120); // tweak these values

  circleG = createGraphics(width, height);
  mainG = createGraphics(width, height);
  mainG.pixelDensity(1);
  mainG.colorMode(HSB, 255);

  // 基于 frame.png 生成“内窗为白”的遮罩（一次性）
  if (frameImg && frameImg.width > 0) {
    const tmp = createGraphics(width, height);
    tmp.clear();
    // 拉伸到画布大小（确保尺寸匹配）
    tmp.image(frameImg, 0, 0, width, height);
    tmp.loadPixels();
    frameMaskImg = createImage(width, height);
    frameMaskImg.loadPixels();
    // 反转 alpha：mask = 255 - alpha(frame)
    for (let i = 0; i < tmp.pixels.length; i += 4) {
      const a = tmp.pixels[i + 3];
      const m = 255 - a; // 中心透明(0) -> 255(保留)，边框不透明(255) -> 0(裁切)
      frameMaskImg.pixels[i] = m;
      frameMaskImg.pixels[i + 1] = m;
      frameMaskImg.pixels[i + 2] = m;
      frameMaskImg.pixels[i + 3] = 255;
    }
    frameMaskImg.updatePixels();
    frameMaskReady = true;
  }

  initSuitTargets(); // compute snap targets based on current canvas size

  // shuffle suits so each appears exactly once
  const suitsPool = shuffle(['diamond', 'club', 'heart', 'spade']);

  // create balls: one of each suit + plain circles
  for (let i = 0; i < maxBalls; i++) {
    const suit = (i < suitsPool.length) ? suitsPool[i] : null;
    const mirrorIndex = (suit === null) ? ((i - suitsPool.length) % mirrorImgs.length) : -1;

    const baseR = random(20, 60);
    // pre‑compute max rendered radius for proper initial placement
    const renderRadius = suit
      ? baseR * SUIT_SCALE
      : (baseR * 2.5 * MIRROR_SCALE); // mirror: drawH = baseR*5*MIRROR_SCALE so radius = half
    const minX = renderRadius + EDGE_MARGIN;
    const maxX = width - renderRadius - EDGE_MARGIN;
    const minY = renderRadius + EDGE_MARGIN;
    const maxY = height - renderRadius - EDGE_MARGIN;

    balls.push({
      x: random(minX, maxX),
      y: random(minY, maxY),
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
  // reposition canvas to stay centered on window resize
  centerCanvas();
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
  // place canvas so its center matches the window center
  const x = floor((windowWidth - width) / 2);
  const y = floor((windowHeight - height) / 2);
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

  // 方式改为：先用反转 mask 裁剪 mainG，再叠加 frame 装饰
  let composed = mainG.get(); // p5.Image
  if (frameMaskReady && frameMaskImg) {
    composed.mask(frameMaskImg); // 白=保留，黑=裁切
  }
  image(composed, 0, 0);
  if (frameImg && frameImg.width > 0) {
    image(frameImg, 0, 0, width, height); // 最上层相框装饰
  }

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
  const r = currentRenderRadius(b);
  b.x = constrain(b.x, r + EDGE_MARGIN, width - (r + EDGE_MARGIN));
  b.y = constrain(b.y, r + EDGE_MARGIN, height - (r + EDGE_MARGIN));
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
          // set random exit direction (outside canvas)
          const angle = random(TWO_PI);
          const distance = 500; // how far outside to move
          b.targetX = indexPos.x + cos(angle) * distance;
          b.targetY = indexPos.y + sin(angle) * distance;
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
      // reposition
      b.x = random(width * 0.1, width * 0.9);
      b.y = random(height * 0.1, height * 0.9);
      attempts++;
    }
  }
}

let transferred = false; // 新增：防止重复跳转