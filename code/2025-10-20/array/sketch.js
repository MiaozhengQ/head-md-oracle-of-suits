//creat an empty array
let myArray = [];

function setup() {
  //fit the canvas to the window size
  createCanvas(windowWidth, windowHeight);
  // add 100 random values to the array
  for (let i = 0; i < 100; i++) {
    myArray.push(random(0, height));
  }
}
//set the window to resize with the canvas
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(20);
  // display the values in the array as circles which fit the width of the canvas

  for (let i = 0; i < myArray.length; i++) {
    ellipse(i * (width / myArray.length), height - myArray[i], width / myArray.length, width / myArray.length);
    //randomize the array values every frame
    myArray[i] = random(0, height);
    //slow down the frame rate to see the changes
    frameRate(8);
    //add gradient random one series kind of color to the lines
    stroke(i * (255 / myArray.length), 100, 200);
    
  }
  //draw a circle at the mouse position with a size based on the average of the array values
  let avg = myArray.reduce((a, b) => a + b) / myArray.length;
  fill(255, 0, 0, 150);
  noStroke();
  ellipse(mouseX, mouseY, avg*0.3, avg*0.3);
  //The lines will not cross the circle
  for (let i = 0; i < myArray.length; i++) {
    let lineX = i * (width / myArray.length);
    let lineY = height - myArray[i];
    let d = dist(lineX, lineY, mouseX, mouseY);
    if (d < avg * 0.15) {
      myArray[i] = height - sqrt(sq(avg * 0.15) - sq(lineX - mouseX)) + mouseY;
    }
  }
}
