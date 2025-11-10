let balls = [];
let maxBalls = 25;
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

  // small window canvas 
  // create fixed-size canvas and keep a reference
  cnv = createCanvas(450, 580);
  // position the canvas in the center of the window
  centerCanvas();
 
  // initialize MediaPipe settings
  setupHands();
  // start camera using MediaPipeHands.js helper
  setupVideo();
  // set color mode to HSB for better color blending
  colorMode(HSB, 255);
  
  // create offscreen graphics for the circular moving canvas
  circleG = createGraphics(width, height);
  
  // create many random balls
  for (let i = 0; i < maxBalls; i++) {
    balls.push({
      x: random(width * 0.1, width * 0.9),
      y: random(height * 0.1, height * 0.9),
      baseRadius: random(20, 60),
      radius: 0, // will be set below
      color: color(random(255), 200, 200),
      // assign random suit (or null for plain circle)
      suit: random() < 0.6 ? random(['diamond','club','heart','spade']) : null,
      wiggle: random(-2, 2),
      wiggleSpeed: random(0.03, 0.08), // controls how fast it moves
      noiseX: random(1000), // per-ball noise offsets for stable motion
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
  background(20, 100, 100, 100);

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
  for (let b of balls) {
    g.fill(b.color);
    const t = frameCount;
    const rx = (noise(b.noiseX + t * b.wiggleSpeed)) * 10 * b.wiggle;
    const ry = (noise(b.noiseY + t * b.wiggleSpeed)) * 10 * b.wiggle;
    if (b.suit) {
      let img = null;
      if (b.suit === 'diamond') img = diamondImg;
      else if (b.suit === 'club') img = clubImg;
      else if (b.suit === 'heart') img = heartImg;
      else if (b.suit === 'spade') img = spadeImg;

      if (img) {
        g.push();
        g.imageMode(CENTER);
        const drawW = (b.radius * 2) * (img.width / max(img.height, 1));
        const drawH = b.radius * 2;
        g.image(img, b.x + rx, b.y + ry, drawW, drawH);
        g.pop();
        continue;
      }
    }
    g.circle(b.x + rx, b.y + ry, b.radius * 2);
  }
}

// remove old drawBalls() function — use drawBallsToGraphics() instead