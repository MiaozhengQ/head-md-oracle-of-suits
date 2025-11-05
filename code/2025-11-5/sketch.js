function setup() {
  createCanvas(400, 400);
  // start webcam capture
  capture = createCapture(VIDEO);
  capture.size(width, height);
  capture.hide(); // hide the default DOM element; we'll draw to the canvas
}

function draw() {
  background(220);
  // mirror the video so it feels like a camera selfie
  push();
  translate(width, 0);
  scale(-1, 1);
  image(capture, 0, 0, width, height);
  pop();
}
