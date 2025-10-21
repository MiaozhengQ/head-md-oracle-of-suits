let x;
let y;
function setup() {
  createCanvas(windowWidth, windowHeight);

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  //add a little wiggle to the circle position
  x += random(-1, 1);
  y += random(-1, 1);
  // Draw the circle diameter based on frameCount since mousePressed
  circle(x, y, frameCount * 0.2);
print(x);
}

function mousePressed() {
  x = mouseX;
  y = mouseY;
}