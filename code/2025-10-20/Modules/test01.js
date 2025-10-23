// create a class named Star
class Thing {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
//draw with four rectangles with different colors   
  draw() {
    fill(255, 0, 0);
    rect(this.x, this.y, 20, 20);
    fill(0, 255, 0);
    rect(this.x + 25, this.y, 20, 20);
    fill(0, 0, 255);
    rect(this.x, this.y + 25, 20, 20);
    fill(255, 255, 0);
    rect(this.x + 25, this.y + 25, 20, 20);
  }
}
//set a canvas fits window size
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
