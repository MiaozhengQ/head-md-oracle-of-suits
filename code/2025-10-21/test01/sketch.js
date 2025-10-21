function setup() {
  createCanvas(windowWidth, windowHeight);

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  circle(width / 2, height / 2, width*0.9);

}
