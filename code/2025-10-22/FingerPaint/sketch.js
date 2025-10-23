let balls = [];
let maxBalls = 25;
let lastTouchTime = 0;
let touchCooldown = 300; // ms per-ball cooldown

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

    // for each detected hand
    for (let hand of detections.multiHandLandmarks) {
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
      

      // touch check per hand (check all balls)
      const m = hand[FINGER_TIPS.index];
      if (m) {
        const ix = m.x * width;
        const iy = m.y * height;
        for (let b of balls) {
          if (!b.active) continue;
          const d = dist(ix, iy, b.x, b.y);
          if (d <= b.radius && (millis() - b.lastTouched > touchCooldown)) {
            // change color randomly when this ball is touched
            b.color = color(random(255), 220, 220);
            b.lastTouched = millis();
            // small pulse
            const prev = b.radius;
            b.radius = prev + 12;
            setTimeout(() => { b.radius = prev; }, 160);
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
  circle(x, y, 20);
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
  for (let b of balls) {
    fill(b.color);
    // smooth, deterministic wiggle using Perlin noise (stable across frames)
    const t = frameCount;
    const rx = (noise(b.noiseX + t * b.wiggleSpeed)) * 10 * b.wiggle;
    const ry = (noise(b.noiseY + t * b.wiggleSpeed)) * 10 * b.wiggle;
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