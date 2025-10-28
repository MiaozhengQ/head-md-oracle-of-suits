let balls = [];
let maxBalls = 25;
let lastTouchTime = 0;
let touchCooldown = 300; // ms per-ball cooldown

// --- selection state ---
let selectedBall = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;
const RELEASE_DISTANCE = 80; // px threshold to release when finger moves away
const RELEASE_Z = 0.12; // z threshold to release when finger is far from camera

// --- new: depth-pick baseline and thresholds ---
let baselineFingerZ = null;           // reference fingertip z (basic distance to screen)
const DEPTH_PICK_PX = 100;            // require within 100 pixels of baseline to pick
const DEPTH_SCALE = 800;              // empirical scale: z-diff -> approx pixels

function setup() {

  // full window canvas
  createCanvas(windowWidth, windowHeight);

  // initialize MediaPipe settings
  setupHands();
  // start camera using MediaPipeHands.js helper
  setupVideo();
  //set color mode to HSB for better color blending
  colorMode(HSB, 255);
  // create many random balls
  for (let i = 0; i < maxBalls; i++) {
    balls.push({
      x: random(width * 0.1, width * 0.9),
      y: random(height * 0.1, height * 0.9),
      baseRadius: random(20, 60),
      radius: 0, // will be set below
      color: color(random(255), 200, 200),
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
  resizeCanvas(windowWidth, windowHeight);
}


function draw() {
  // clear the canvas
  // background with transparency for trail effect
  //vanish slowly
  //clear the canvas after 10 frames
  //set background clolor with light transparency
  //color mode to HSB for better color blending
  if (frameCount % 10 === 0) {
    background(119, 10, 20, 100);
  }

  if (isVideoReady()) {
    //image(videoElement, 0, 0);
  }

  strokeWeight(2);

  if (detections) {
    // for each detected hand
    for (let hand of detections.multiHandLandmarks) {
      drawIndex(hand);
      drawConnections(hand);

      // index fingertip coordinates
      const m = hand[FINGER_TIPS.index];
      if (!m) continue;
      const ix = m.x * width;
      const iy = m.y * height;
      
      // initialize or slowly track a baseline fingertip z when hand present
      if (baselineFingerZ === null) baselineFingerZ = m.z;
      else if (selectedBall < 0) baselineFingerZ = lerp(baselineFingerZ, m.z, 0.04);
      
      // If no ball selected: try to pick nearest ball under fingertip 
      if (selectedBall < 0) {
        let nearestIndex = -1;
        let nearestDist = Infinity;
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.active) continue;
          const d = dist(ix, iy, b.x, b.y);
          if (d <= b.radius && d < nearestDist) {
            nearestDist = d;
            nearestIndex = i;
          }
        }
        // only pick if fingertip depth is close to baseline (convert z-diff to approx pixels)
        const depthPx = Math.abs(m.z - (baselineFingerZ || m.z)) * DEPTH_SCALE;
        if (nearestIndex >= 0 && (millis() - balls[nearestIndex].lastTouched > touchCooldown) && depthPx <= DEPTH_PICK_PX) {
           // select this ball
           selectedBall = nearestIndex;
           dragOffsetX = balls[selectedBall].x - ix;
           dragOffsetY = balls[selectedBall].y - iy;
           // mark touched and quick visual pulse
           balls[selectedBall].lastTouched = millis();
           balls[selectedBall].color = color(random(255), 220, 220);
           const prev = balls[selectedBall].radius;
           balls[selectedBall].radius = prev + 12;
           setTimeout(() => { if (balls[selectedBall]) balls[selectedBall].radius = prev; }, 160);
         }
      } else {
        // a ball is selected: move it with fingertip
        const b = balls[selectedBall];
        if (b) {
          b.x = ix + dragOffsetX;
          b.y = iy + dragOffsetY;
          // release if finger moves far away (screen space)
          const dToFinger = dist(ix, iy, b.x, b.y);
          if (dToFinger > RELEASE_DISTANCE) {
            releaseBall(selectedBall);
          }
          // release if fingertip z indicates finger moved away from camera
          if (typeof m.z !== 'undefined' && Math.abs(m.z) > RELEASE_Z) {
            releaseBall(selectedBall);
          }
        } else {
          selectedBall = -1;
        }
      }
    } // end hands loop
  } // end detections

  // draw all balls
  drawBalls();
} // end draw


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
  circle(x, y, 20);
   

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
    circle(x, y, 6);
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
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    fill(b.color);
    // if selected, follow exact position (no wiggle)
    let rx = 0, ry = 0;
    if (i !== selectedBall) {
      const t = frameCount;
      rx = (noise(b.noiseX + t * b.wiggleSpeed)) * 10 * b.wiggle;
      ry = (noise(b.noiseY + t * b.wiggleSpeed)) * 10 * b.wiggle;
    }
    circle(b.x + rx, b.y + ry, b.radius * 2);
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

// -- new helper: release a ball and restore its original size
function releaseBall(index) {
  if (index >= 0 && balls[index]) {
    balls[index].radius = balls[index].baseRadius;
  }
  if (selectedBall === index) selectedBall = -1;
}