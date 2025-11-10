// global detections from MediaPipeHands.js
let detections = null;

let balls = [];
let maxBalls = 25;
let lastTouchTime = 0;
let touchCooldown = 300;

// suit images
let diamondImg, clubImg, heartImg, spadeImg;
let mirrorImgs = []; // mirror1..mirror4

let cnv = null;
let clipG, maskG;
let indexPos = null;
const INDEX_CIRCLE_RADIUS = 90;
const SUIT_SCALE = 1.6;
const CIRCLE_COUNT = 6;
let canvasBG;
let maskColor;

const FINGER_TIPS = { thumb: 4, index: 8 };
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20]
];

// unified canvas coordinates (mirror video)
const MIRROR_VIDEO = true;
const cx = (u) => (MIRROR_VIDEO ? (1 - u) : u) * width;
const cy = (v) => v * height;

function preload() {
  diamondImg = loadImage('assets/diamond.png');
  clubImg    = loadImage('assets/club.png');
  heartImg   = loadImage('assets/heart.png');
  spadeImg   = loadImage('assets/spade.png');
  for (let i = 1; i <= 4; i++) {
    mirrorImgs.push(loadImage(`assets/mirror${i}.png`));
  }
}

let selectedBall = -1;
let selectedHand = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;
const RELEASE_DISTANCE = 120;
const ballRadius = 50;

let baselineFingerZ = [];
const DEPTH_THRESHOLD = 0.08;
const PICK_RADIUS = 140;
const RELEASE_DEPTH_FACTOR = 0.5;

function setup() {
  cnv = createCanvas(450, 580);
  centerCanvas();
  
  clipG = createGraphics(width, height);
  maskG = createGraphics(width, height);
 
  setupHands();
  setupVideo();
  colorMode(HSB, 255);
  canvasBG = color(210, 80, 20);
  maskColor = color(200, 40, 60, 120);

  const suitsPool = shuffle(['diamond', 'club', 'heart', 'spade']);
  const totalBalls = suitsPool.length + CIRCLE_COUNT;
  maxBalls = totalBalls;
  for (let i = 0; i < totalBalls; i++) {
    const suit = (i < suitsPool.length) ? suitsPool[i] : null;
    const mirrorIndex = (suit === null) ? ((i - suitsPool.length) % mirrorImgs.length) : -1;
    balls.push({
      x: random(width * 0.1, width * 0.9),
      y: random(height * 0.1, height * 0.9),
      baseRadius: random(20, 60),
      radius: 0,
      color: color(random(255), 200, 200),
      suit: suit,
      wiggle: abs(random(-1, 1)) + 0.4,
      wiggleSpeed: random(0.03, 0.08),
      noiseX: random(1000),
      noiseY: random(1000),
      lastTouched: 0,
      active: true,
      mirrorIndex: mirrorIndex,
      isMirror: suit === null,
      wasInside: false,
      pulseStart: 0
    });
  }
  balls.forEach(b => b.radius = b.baseRadius);
}

function windowResized() {
  centerCanvas();
}

function centerCanvas() {
  if (!cnv) return;
  const x = floor((windowWidth - width) / 2);
  const y = floor((windowHeight - height) / 2);
  cnv.position(x, y);
}
 
function draw() {
  background(canvasBG);

  if (!detections) {
    push();
    fill(255);
    textSize(12);
    text('Waiting for MediaPipe hands...', 10, 20);
    pop();
    if (frameCount % 60 === 0) {
      if (!hands) setupHands();
      if (!camera) setupVideo();
    }
    return;
  }

  clipG.clear();
  clipG.push();
  clipG.noStroke();
  clipG.pop();

  strokeWeight(2);
  
  if (detections && detections.multiHandLandmarks) {
    for (let h = 0; h < detections.multiHandLandmarks.length; h++) {
      const hand = detections.multiHandLandmarks[h];

      drawIndex(hand);
      drawConnections(hand, clipG);
      drawTips(hand, clipG);
      drawLandmarks(hand, clipG);
      drawThumb(hand, clipG);
     
      const m = hand[FINGER_TIPS.index];
      if (m) {
        const ix = cx(m.x);
        const iy = cy(m.y);
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
  } else {
    indexPos = null;
  }

  drawBalls(clipG);

  if (indexPos) {
    push();
    drawingContext.beginPath();
    drawingContext.arc(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS, 0, TWO_PI);
    drawingContext.clip();

    noStroke();
    fill(maskColor);
    rect(0, 0, width, height);

    image(clipG, 0, 0);
    
    pop();
    
    push();
    noFill();
    stroke(0, 255, 255);
    strokeWeight(2);
    circle(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS * 2);
    pop();
  }
}

function drawIndex(landmarks) {
  if (!landmarks) { indexPos = null; return; }
  let mark = landmarks[FINGER_TIPS.index];
  if (!mark) { indexPos = null; return; }
  indexPos = createVector(cx(mark.x), cy(mark.y));
}

function drawThumb(landmarks, g) {
  if (!landmarks) return;
  let mark = landmarks[FINGER_TIPS.thumb];
  if (!mark) return;
  const tgt = g || clipG;
  if (!tgt) return;
  tgt.push();
  tgt.noStroke();
  tgt.fill(255, 255, 0);
  let x = cx(mark.x), y = cy(mark.y);
  tgt.circle(x, y, 20);
  tgt.stroke(random(255), 90, 100);
  tgt.strokeWeight(1);
  tgt.line(x, y, x, 0);
  tgt.line(x, y, x, height);
  tgt.line(x, y, 0, y);
  tgt.line(x, y, width, y);
  tgt.pop();
}

function drawTips(landmarks, g) {
  if (!landmarks) return;
  const tips = [4, 8, 12, 16, 20];
  const tgt = g || clipG;
  if (!tgt) return;
  tgt.push();
  tgt.noStroke();
  tgt.fill(0, 0, 255);
  for (let tipIndex of tips) {
    let mark = landmarks[tipIndex];
    if (!mark) continue;
    let x = cx(mark.x), y = cy(mark.y);
    tgt.circle(x, y, 18);
  }
  tgt.pop();
}

function drawLandmarks(landmarks, g) {
  if (!landmarks) return;
  const tgt = g || clipG;
  if (!tgt) return;
  tgt.push();
  tgt.noStroke();
  tgt.fill(255, 0, 0);
  for (let mark of landmarks) {
    if (!mark) continue;
    let x = cx(mark.x), y = cy(mark.y);
    tgt.circle(x, y, 6);
  }
  tgt.pop();
}

function drawConnections(landmarks, g) {
  if (!landmarks) return;
  const tgt = g || clipG;
  if (!tgt) return;
  tgt.push();
  tgt.stroke(frameCount % 255, 100, 255 - (frameCount % 255));
  tgt.strokeWeight(2);
  for (let connection of HAND_CONNECTIONS) {
    const a = landmarks[connection[0]];
    const b = landmarks[connection[1]];
    if (!a || !b) continue;
    let ax = cx(a.x), ay = cy(a.y);
    let bx = cx(b.x), by = cy(b.y);
    tgt.line(ax, ay, bx, by);
    let cxm = (ax + bx) / 2 + random(-20, 20);
    let cym = (ay + by) / 2 + random(-20, 20);
    tgt.noFill();
    tgt.bezier(ax, ay, cxm, cym, cxm, cym, bx, by);
  }
  tgt.pop();
}

function drawBalls(g) {
  const tgt = g || clipG;
  if (!tgt) return;
  tgt.push();
  tgt.noStroke();
  const t = frameCount;
  const now = millis();

  for (let b of balls) {
    let bx = b.x;
    let by = b.y;

    if (b.suit) {
      const nx = noise(b.noiseX + t * b.wiggleSpeed) - 0.5;
      const ny = noise(b.noiseY + t * b.wiggleSpeed) - 0.5;
      bx += nx * 30 * (b.wiggle || 1);
      by += ny * 30 * (b.wiggle || 1);
    }

    const inside = indexPos && dist(bx, by, indexPos.x, indexPos.y) <= INDEX_CIRCLE_RADIUS;

    let pulseMul = 1;
    let imgAlpha = 255;
    if (b.suit) {
      if (inside && !b.wasInside) {
        b.wasInside = true;
        b.pulseStart = now;
      } else if (!inside) {
        b.wasInside = false;
      }
      const PULSE_DURATION = 480;
      if (b.pulseStart && (now - b.pulseStart) < PULSE_DURATION) {
        const e = (now - b.pulseStart) / PULSE_DURATION;
        const ease = 1 - (1 - e) * (1 - e);
        pulseMul = 1 + 0.6 * (1 - ease);
      } else if (b.pulseStart && (now - b.pulseStart) >= PULSE_DURATION) {
        b.pulseStart = 0;
      }
      imgAlpha = inside ? 255 : 200;
    }

    if (b.suit) {
      let img = null;
      if (b.suit === 'diamond') img = diamondImg;
      else if (b.suit === 'club') img = clubImg;
      else if (b.suit === 'heart') img = heartImg;
      else if (b.suit === 'spade') img = spadeImg;
      if (img) {
        tgt.push();
        tgt.imageMode(CENTER);
        tgt.tint(255, imgAlpha);
        const drawH = (b.radius * 2) * pulseMul * SUIT_SCALE;
        const drawW = drawH * (img.width / max(img.height, 1));
        tgt.image(img, bx, by, drawW, drawH);
        tgt.pop();
        continue;
      }
    }

    if (b.isMirror && b.mirrorIndex >= 0 && mirrorImgs[b.mirrorIndex]) {
      tgt.push();
      tgt.imageMode(CENTER);
      const img = mirrorImgs[b.mirrorIndex];
      const drawH = b.radius * 2;
      const drawW = drawH * (img.width / max(img.height, 1));
      tgt.image(img, b.x, b.y, drawW, drawH);
      tgt.pop();
      continue;
    }

    tgt.fill(b.color);
    tgt.circle(b.x, b.y, b.radius * 2);
  }

  tgt.pop();
}

function isBallTouched(landmarks) {
  if (!landmarks) return false;
  const mark = landmarks[FINGER_TIPS.index];
  if (!mark) return false;
  const ix = cx(mark.x);
  const iy = cy(mark.y);
  const bx = width / 2;
  const by = height / 2;
  return dist(ix, iy, bx, by) <= ballRadius;
}

function setMaskColor(h, s, b, a = 120) {
  maskColor = color(h, s, b, a);
}

// Ensure MediaPipe is ready on page load
window.addEventListener('load', () => {
  console.log('Page loaded. hands:', typeof hands, 'camera:', typeof camera);
  setTimeout(() => {
    console.log('Attempting setup. hands:', typeof hands, 'camera:', typeof camera);
    if (!hands) {
      console.log('Calling setupHands()');
      setupHands();
    }
    if (!camera) {
      console.log('Calling setupVideo()');
      setupVideo();
    }
    console.log('After setup. hands:', typeof hands, 'camera:', typeof camera);
  }, 500);
});