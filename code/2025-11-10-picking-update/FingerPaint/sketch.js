let balls = [];
let maxBalls = 25;
let lastTouchTime = 0;
let touchCooldown = 300; // ms per-ball cooldown

// suit images
let diamondImg, clubImg, heartImg, spadeImg;

// p5 canvas reference so we can position it in the page
let cnv = null;

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
const DEPTH_RATIO_THRESHOLD = 0.1;   // ratio of change compared to baseline to consider as approached
const BASELINE_ADAPT_RATE = 0.02;   // rate at which baseline adapts when not approaching

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
  // clear the canvas
  // background with transparency for trail effect
  //vanish slowly
  //clear the canvas after 10 frames
  //set background clolor with light transparency
  //color mode to HSB for better color blending
  if (frameCount % 10 === 0) {
    background(20, 100, 100, 100);
  }

  // if the video connection is ready
  if (isVideoReady()) {
    // draw the capture image
    //image(videoElement, 0, 0);
  }

  // use thicker lines for drawing hand connections
  strokeWeight(2);
// draw a ball in the middle of canvas
  // make sure we have detections to draw
  if (detections) {

    // iterate by index so we can track per-hand selection
    for (let h = 0; h < detections.multiHandLandmarks.length; h++) {
      const hand = detections.multiHandLandmarks[h];

      // draw the index finger
      drawIndex(hand);
      // draw the thumb finger
     // drawThumb(hand);
      // draw fingertip points
     // drawTips(hand);xx
      // draw connections
      drawConnections(hand);
      // draw all landmarks
      // drawLandmarks(hand);

      // touch check per hand (guarded, with cooldown)
      

      // touch / grab check per hand (use 2D overlap to pick, approach to release)
      const m = hand[FINGER_TIPS.index];
      if (m) {
        const ix = m.x * width;
        const iy = m.y * height;
        const z = (typeof m.z === 'number') ? m.z : 0;

        // initialize baseline for this hand
        if (baselineFingerZ[h] == null) baselineFingerZ[h] = z;

        // compute approach delta: positive when fingertip is closer than baseline
        const dz = baselineFingerZ[h] - z;

        // relative detection: if hand is far, absolute dz may be tiny — use ratio test too
        const absBaseline = max(0.0001, Math.abs(baselineFingerZ[h]));
        const dzRatio = dz / absBaseline; // proportion change compared to baseline

        // consider approached when either absolute delta passes or relative ratio passes
        const approached = (dz > DEPTH_THRESHOLD) || (dzRatio > DEPTH_RATIO_THRESHOLD);

        // slowly adapt baseline when not approaching
        if (!approached) baselineFingerZ[h] = lerp(baselineFingerZ[h], z, BASELINE_ADAPT_RATE);

        // PICK: if no selection, require BOTH 2D overlap AND approach (depth) to grab
        if (selectedBall === -1) {
          for (let bi = 0; bi < balls.length; bi++) {
            const b = balls[bi];
            if (!b.active) continue;
            const d = dist(ix, iy, b.x, b.y);
            // require fingertip to overlap circle AND be moving closer than baseline
            if (d <= b.radius && approached && (millis() - b.lastTouched > touchCooldown)) {
               // grab this ball on 2D overlap
               selectedBall = bi;
               selectedHand = h;
               dragOffsetX = b.x - ix;
               dragOffsetY = b.y - iy;
               b.lastTouched = millis();
               b.color = color(random(255), 220, 220);
               // mark picked state for pulsing/flash animation
               b.isPicked = true;
               b.pulseStart = millis();
               b.flashUntil = millis() + 400; // flash duration in ms
               b.pulseBaseRadius = b.radius = b.baseRadius * 1.35; // immediate enlarge
               break;
             }
           }
         } else if (selectedBall !== -1 && selectedHand === h) {
           // MOVE: owning hand moves the selected ball while held
           const b = balls[selectedBall];
           if (b) {
             b.x = ix + dragOffsetX;
             b.y = iy + dragOffsetY;
 
            // RELEASE: when the finger retreats (depth) OR moves far in 2D
            // require both absolute and relative depth to have dropped for far hands
            const releaseByDepth = (dz < (DEPTH_THRESHOLD * RELEASE_DEPTH_FACTOR));
            const releaseByRatio = (dzRatio < (DEPTH_RATIO_THRESHOLD * RELEASE_DEPTH_FACTOR));
            const d2 = dist(ix, iy, b.x, b.y);
            const releaseByDist = d2 > RELEASE_DISTANCE;
            // consider release when distance OR both depth tests indicate retreat
            if (releaseByDist || (releaseByDepth && releaseByRatio)) {
               // clear picked state and restore base size
               b.isPicked = false;
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
     } // end of hands loop

  } // end of if detections
  // draw all balls
  drawBalls();
  
} // end of draw


// only the index finger tip landmark
function drawIndex(landmarks) {
 if (!landmarks) return;
  // get the index fingertip landmark
  let mark = landmarks[FINGER_TIPS.index];
  if (!mark) return;
  noStroke();
  // set fill color for index fingertip
  fill(0, 255, 255);

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * width;
  let y = mark.y * height;
  circle(x, y, 10);
  //draw lines from index tip randomly direction to borders of canvas
  stroke(random(255), 90, 100);
  strokeWeight(1);
  let direction = random(4);
  if (direction < 1) {
    line(x, y, x, 0); // top
  } else if (direction < 2) {
    line(x, y, x, height); // bottom
  } else if (direction < 3) {
    line(x, y, 0, y); // left
  } else {
    line(x, y, width, y); // right
  }   

}

//draws only the thumb tip 

// draw the thumb finger tip landmark
function drawThumb(landmarks) {

  if (!landmarks) return;
  // get the thumb fingertip landmark
  let mark = landmarks[FINGER_TIPS.thumb];
  if (!mark) return;

  noStroke();
  // set fill color for thumb fingertip
  fill(255, 255, 0);

  // adapt the coordinates (0..1) to video coordinates
  let x = mark.x * width;
  let y = mark.y * height;
  circle(x, y, 20);
  //draw lines from index tip to borders of canvas
  stroke(random(255), 90, 100);
  strokeWeight(1);
  line(x, y, x, 0); // top
  line(x, y, x, height); // bottom
  line(x, y, 0, y); // left
  line(x, y, width, y); // right

}
function drawTips(landmarks) {
if (!landmarks) return;
  noStroke();
  fill(0, 0, 255);
  const tips = [4, 8, 12, 16, 20];
  for (let tipIndex of tips) {
    let mark = landmarks[tipIndex];
    if (!mark) continue;              // guard added
    let x = mark.x * width;
    let y = mark.y * height;
    circle(x, y, 10);
  }
}

function drawLandmarks(landmarks) {
if (!landmarks) return;
  noStroke();
  fill(255, 0, 0);
  for (let mark of landmarks) {
    if (!mark) continue;              // guard added
    let x = mark.x * width;
    let y = mark.y * height;
    circle(x, y, 2);
  }
}


function drawConnections(landmarks) {
 if (!landmarks) return;
  stroke(frameCount % 255, 100, 255 - (frameCount % 255));
  for (let connection of HAND_CONNECTIONS) {
    const a = landmarks[connection[0]];
    const b = landmarks[connection[1]];
    if (!a || !b) continue;
    // use canvas coordinates (width/height) to match touch math
    let ax = a.x * width;
    let ay = a.y * height;
    let bx = b.x * width;
    let by = b.y * height;
    line(ax, ay, bx, by);
    let cx = (ax + bx) / 2 + random(-20, 20);
    let cy = (ay + by) / 2 + random(-20, 20);
    noFill();
    bezier(ax, ay, cx, cy, cx, cy, bx, by);
  }
}


// draw a circleball in the middle of canvas


function drawBalls() {
  noStroke();
  for (let b of balls) {
    // pulse if picked
    let pulseMul = 1;
    if (b.isPicked) {
      const t = (millis() - (b.pulseStart || 0)) * 0.006; // speed
      pulseMul = 1 + 0.12 * sin(TWO_PI * t);
    }

    // flash glow while flashUntil not passed
    const isFlashing = b.flashUntil && millis() < b.flashUntil;

    fill(b.color);
    // smooth, deterministic wiggle using Perlin noise (stable across frames)
    const tframe = frameCount;
    const rx = (noise(b.noiseX + tframe * b.wiggleSpeed)) * 10 * b.wiggle;
    const ry = (noise(b.noiseY + tframe * b.wiggleSpeed)) * 10 * b.wiggle;

    const drawRadius = (b.radius || b.baseRadius) * pulseMul;

    // draw glow ring when flashing
    if (isFlashing) {
      push();
      noFill();
      stroke(255, 200, 200, map(millis(), b.pulseStart, b.flashUntil, 220, 20, true));
      strokeWeight(6);
      circle(b.x + rx, b.y + ry, drawRadius * 2 + 18);
      pop();
    }

    // draw suit image when assigned, otherwise fallback to circle
    if (b.suit) {
      let img = null;
      if (b.suit === 'diamond') img = diamondImg;
      else if (b.suit === 'club') img = clubImg;
      else if (b.suit === 'heart') img = heartImg;
      else if (b.suit === 'spade') img = spadeImg;

      if (img) {
        push();
        imageMode(CENTER);
        // draw image scaled to ball radius (height = diameter)
        const drawH = drawRadius * 2;
        const drawW = drawH * (img.width / max(img.height, 1));
        image(img, b.x + rx, b.y + ry, drawW, drawH);
        pop();
        continue;
      }
    }
    // fallback
    circle(b.x + rx, b.y + ry, drawRadius * 2);
  }
}
 
 // fast, guarded touch test for index fingertip against the ball center
 function isBallTouched(landmarks) {
   if (!landmarks) return false;
   const mark = landmarks[FINGER_TIPS.index];
   if (!mark) return false;
   const ix = mark.x * width;
   const iy = mark.y * height;
   const bx = width / 2;
   const by = height / 2;
   return dist(ix, iy, bx, by) <= ballRadius;
 }

// offscreen canvas for crop+upscale (software zoom)
const zoomCanvas = document.createElement('canvas');
const zoomCtx = zoomCanvas.getContext('2d');

// tune these
const ZOOM_FACTOR = 1.6;        // >1 zooms in (1.4-2.0 recommended)
const MODEL_WIDTH = 640;        // what you send to MediaPipe
const MODEL_HEIGHT = 480;

// call this instead of setupVideo() / Camera helper directly
function startHandsWithCrop(videoEl, handsInstance) {
  if (!videoEl || !handsInstance) return;
  // lower detection thresholds so distant hands are detected
  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.35, // lower -> more sensitive (may increase false positives)
    minTrackingConfidence: 0.35,
    refineLandmarks: true
  });

  zoomCanvas.width = MODEL_WIDTH;
  zoomCanvas.height = MODEL_HEIGHT;

  // Use MediaPipe Camera helper if available
  if (typeof Camera !== 'undefined') {
    const cam = new Camera(videoEl, {
      onFrame: async () => {
        // compute centered crop area on the incoming video
        const vw = videoEl.videoWidth || videoEl.width || MODEL_WIDTH;
        const vh = videoEl.videoHeight || videoEl.height || MODEL_HEIGHT;
        const cropW = Math.floor(vw / ZOOM_FACTOR);
        const cropH = Math.floor(vh / ZOOM_FACTOR);
        const cx = Math.max(0, Math.floor((vw - cropW) / 2));
        const cy = Math.max(0, Math.floor((vh - cropH) / 2));
        // draw cropped region scaled to model size
        zoomCtx.drawImage(videoEl, cx, cy, cropW, cropH, 0, 0, MODEL_WIDTH, MODEL_HEIGHT);
        // send the offscreen canvas to MediaPipe
        await handsInstance.send({ image: zoomCanvas });
      },
      width: MODEL_WIDTH,
      height: MODEL_HEIGHT
    });
    cam.start();
    console.log('Started Camera with crop+upscale, ZOOM_FACTOR=', ZOOM_FACTOR);
  } else {
    // fallback: interval sender
    setInterval(async () => {
      const vw = videoEl.videoWidth || MODEL_WIDTH;
      const vh = videoEl.videoHeight || MODEL_HEIGHT;
      const cropW = Math.floor(vw / ZOOM_FACTOR);
      const cropH = Math.floor(vh / ZOOM_FACTOR);
      const cx = Math.max(0, Math.floor((vw - cropW) / 2));
      const cy = Math.max(0, Math.floor((vh - cropH) / 2));
      zoomCtx.drawImage(videoEl, cx, cy, cropW, cropH, 0, 0, MODEL_WIDTH, MODEL_HEIGHT);
      await handsInstance.send({ image: zoomCanvas });
    }, 33);
    console.log('Started fallback crop sender');
  }
}

// Example usage: call in your setup() after capture ready
// capture.elt.addEventListener('loadeddata', () => {
//   startHandsWithCrop(capture.elt, hands); // `hands` is your MediaPipe Hands instance
// });