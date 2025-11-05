// The setup and draw functions are required for p5.js sketches
function setup() {
  // Create a canvas that fills the window
  createCanvas(400, 400);
}

// The draw function runs continuously in a loop
function draw() {
  //Set a pulsing background color like breathing white light
  let pulse = map(sin(frameCount * 0.05), -1, 1, 200, 255);
  background(pulse);
}
