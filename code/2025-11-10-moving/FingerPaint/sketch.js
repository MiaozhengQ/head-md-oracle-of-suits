let balls = [];
let maxBalls = 10;  // decrease from 25 to 10 (4 suits + 6 circles)
let lastTouchTime = 0;
let touchCooldown = 300; // ms per-ball cooldown

// suit images
let diamondImg, clubImg, heartImg, spadeImg;

// p5 canvas reference so we can position it in the page
let cnv = null;

// --- moving canvas circle setup ---
let circleG; // offscreen graphics for circular canvas
const INDEX_CIRCLE_RADIUS = 90;
let indexPos = null; // position of index finger circle
let canvasBG; // background color
let maskColor; // color tint inside the circular mask
const SUIT_SCALE = 1.8; // suit image size multiplier

function preload() {
  // put diamond.png, club.png, heart.png, spade.png in an "assets" folder next to this sketch
  diamondImg = loadImage('assets/diamond.png');
  clubImg    = loadImage('assets/club.png');
  heartImg   = loadImage('assets/heart.png');
  spadeImg   = loadImage('assets/spade.png');
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

function setup() {
  cnv = createCanvas(450, 580);
  centerCanvas();
  setupHands();
  setupVideo();
  colorMode(HSB, 255);
  
  // set canvas background color
  canvasBG = color(210, 80, 30);
  // set mask color (HSB: hue, saturation, brightness, alpha)
  maskColor = color(200, 40, 60, 120); // tweak these values
  
  circleG = createGraphics(width, height);
  
  // shuffle suits so each appears exactly once
  const suitsPool = shuffle(['diamond', 'club', 'heart', 'spade']);
  
  // create balls: one of each suit + plain circles
  for (let i = 0; i < maxBalls; i++) {
    const suit = (i < suitsPool.length) ? suitsPool[i] : null;
    
    balls.push({
      x: random(width * 0.1, width * 0.9),
      y: random(height * 0.1, height * 0.9),
      baseRadius: random(20, 60),
      radius: 0,
      color: color(random(255), 200, 200),
      suit: suit,
      wiggle: random(-2, 2),
      wiggleSpeed: random(0.03, 0.08),
      noiseX: random(1000),
      noiseY: random(1000),
      lastTouched: 0,
      active: true
    });
  }
  balls.forEach(b => b.radius = b.baseRadius);
}

function windowResized() {
  // reposition canvas to stay centered on window resize
  centerCanvas();
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
  background(canvasBG);
  
  // clear the offscreen circular canvas
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

  // draw balls INTO circleG
  drawBallsToGraphics(circleG);

  // --- render circular mask on main canvas ---
  if (indexPos) {
    // enable clipping for circular region
    push();
    drawingContext.beginPath();
    drawingContext.arc(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS, 0, TWO_PI);
    drawingContext.clip();

    // fill the clipped area with mask color BEFORE drawing content
    noStroke();
    fill(maskColor);
    rect(0, 0, width, height);

    // draw the offscreen graphics (only visible inside circle)
    image(circleG, 0, 0);

    pop();

    // optional: draw circle outline
    push();
    noFill();
    stroke(0, 255, 255);
    strokeWeight(2);
    circle(indexPos.x, indexPos.y, INDEX_CIRCLE_RADIUS * 2);
    pop();
  }
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
    g.fill(b.color);
    const t = frameCount;
    
    // initialize pulse state per ball
    if (b.pulseStart == null) b.pulseStart = 0;
    if (b.wasInside == null) b.wasInside = false;
    
    // only suits wiggle; circles stay static
    let rx = 0, ry = 0;
    if (b.suit) {
      rx = (noise(b.noiseX + t * b.wiggleSpeed)) * 20 * b.wiggle; // increased multiplier
      ry = (noise(b.noiseY + t * b.wiggleSpeed)) * 20 * b.wiggle;
    }
    
    // check if suit is inside the circle mask
    const inside = indexPos && dist(b.x, b.y, indexPos.x, indexPos.y) <= INDEX_CIRCLE_RADIUS;
    
    // trigger pulse when entering the circle
    if (b.suit && inside && !b.wasInside) {
      b.wasInside = true;
      b.pulseStart = now;
    } else if (!inside) {
      b.wasInside = false;
    }
    
    // compute pulse multiplier (grows then settles)
    let pulseMul = 1;
    const PULSE_DURATION = 1200; // ms — increased from 480 to 1200
    if (b.suit && b.pulseStart && (now - b.pulseStart) < PULSE_DURATION) {
      const e = (now - b.pulseStart) / PULSE_DURATION; // 0..1
      const ease = 1 - (1 - e) * (1 - e); // ease out quad
      pulseMul = 1 + 1.2 * (1 - ease); // increased pulse intensity from 0.6 to 1.2
    } else if (b.suit && b.pulseStart && (now - b.pulseStart) >= PULSE_DURATION) {
      b.pulseStart = 0;
    }
    
    // flash alpha when inside
    let imgAlpha = 255;
    if (b.suit && inside) {
      imgAlpha = 150 + floor(105 * (0.5 + 0.5 * sin(TWO_PI * (0.06 * t + b.noiseY)))); // slower flash
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
    
    // plain circle: no wiggle, no pulse
    g.circle(b.x + rx, b.y + ry, b.radius * 2);
  }
}

// remove old drawBalls() function — use drawBallsToGraphics() instead