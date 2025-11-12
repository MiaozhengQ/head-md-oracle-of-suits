let img, frameImg, maskedImg, maskImg;
let imagesReady = false;

let w, h; // mask/frame 大小
let bbox = {}; // {minX,minY,maxX,maxY,bboxW,bboxH,drawX,drawY,drawW,drawH}
let useTestCircleMask = false; // 切换为 true 以测试圆形蒙版（便于确认 pipeline）

function preload() {
  img = loadImage('assets/back-board.png');
  frameImg = loadImage('assets/frame.png'); // 用作蒙版并叠加显示
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  if (!img || !frameImg) {
    console.warn('Images missing — 检查 assets 路径');
    return;
  }

  // 以 frame 图的尺寸作为 mask 的坐标系（更可靠）
  w = frameImg.width;
  h = frameImg.height;

  // 生成 maskImg（基于 frame），支持 alpha / 灰度并自动反转中心透明的情况
  maskImg = createImage(w, h);
  maskImg.loadPixels();
  frameImg.loadPixels();

  if (useTestCircleMask) {
    // 测试用：圆形白色 mask（中心可见）
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (x + y * w) * 4;
        const dx = x - w / 2;
        const dy = y - h / 2;
        const inside = dx * dx + dy * dy < Math.min(w, h) * 0.25;
        maskImg.pixels[i] = 255;
        maskImg.pixels[i + 1] = 255;
        maskImg.pixels[i + 2] = 255;
        maskImg.pixels[i + 3] = inside ? 255 : 0;
      }
    }
    maskImg.updatePixels();
  } else {
    // 自动从 frameImg 计算 mask，优先用 alpha 通道，否则用亮度；若中心透明则反转
    let frameHasAlpha = false;
    for (let i = 3; i < frameImg.pixels.length; i += 4) {
      if (frameImg.pixels[i] !== 255) { frameHasAlpha = true; break; }
    }
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const centerIdx = (cx + cy * w) * 4 + 3;
    const centerAlpha = frameImg.pixels[centerIdx];
    const invert = centerAlpha < 10; // 中心透明则反转
    console.log('frameHasAlpha:', frameHasAlpha, 'centerAlpha:', centerAlpha, 'invertMask:', invert);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (x + y * w) * 4;
        const r = frameImg.pixels[i];
        const g = frameImg.pixels[i + 1];
        const b = frameImg.pixels[i + 2];
        const a = frameImg.pixels[i + 3];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const base = (frameHasAlpha) ? a : lum;
        const alpha = invert ? 255 - base : base;
        maskImg.pixels[i] = 255;
        maskImg.pixels[i + 1] = 255;
        maskImg.pixels[i + 2] = 255;
        maskImg.pixels[i + 3] = alpha;
      }
    }
    maskImg.updatePixels();
  }

  // 计算 mask 的非透明区域包围盒（用于把 back-board 放到蒙版中间）
  maskImg.loadPixels();
  let minX = w, minY = h, maxX = 0, maxY = 0;
  const alphaThreshold = 20;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (x + y * w) * 4;
      const a = maskImg.pixels[i + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  // 计算 mask 的像素质心（centroid），用于更精确地把 back-board 居中放入可见区域
  let sumX = 0, sumY = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (x + y * w) * 4;
      const a = maskImg.pixels[i + 3];
      if (a > alphaThreshold) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  // 若无有效像素则退回到 bbox 中心或画布中心
  let centerX = w / 2, centerY = h / 2;
  if (count > 0) {
    centerX = sumX / count;
    centerY = sumY / count;
  } else {
    centerX = minX + bboxW / 2;
    centerY = minY + bboxH / 2;
  }

  // 计算把 back-board 缩放并居中到 bbox 的参数（会在 draw 中使用）
  const iw = img.width;
  const ih = img.height;
  const scale = Math.min(bboxW / iw, bboxH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  // 使用质心将 back-board 居中放置在可见区域
  let drawX = centerX - drawW / 2;
  let drawY = centerY - drawH / 2;
  // 夹紧到画布范围，避免越界
  drawX = Math.max(0, Math.min(drawX, w - drawW));
  drawY = Math.max(0, Math.min(drawY, h - drawH));

  bbox = { minX, minY, maxX, maxY, bboxW, bboxH, drawX, drawY, drawW, drawH };

  // 调试输出：检查尺寸与 bbox
  console.log('mask size w,h:', w, h);
  console.log('back-board size iw,ih:', iw, ih);
  console.log('bbox:', bbox);
  // 检查 mask 是否有非零 alpha 像素
  let maskHasAlpha = false;
  for (let i = 3; i < maskImg.pixels.length; i += 4) {
    if (maskImg.pixels[i] > 10) { maskHasAlpha = true; break; }
  }
  console.log('maskHasAlpha:', maskHasAlpha);

  imagesReady = true;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);

  if (!imagesReady) {
    fill(0);
    textSize(14);
    text('Loading images... 检查浏览器控制台或 assets 路径', 10, 20);
    return;
  }

  // 在 mask 坐标系大小的临时 graphics 上绘制 back-board，再 mask
  const g = createGraphics(w, h);
  g.clear();
  g.image(img, bbox.drawX, bbox.drawY, bbox.drawW, bbox.drawH);

  let temp = g.get();

  // 去除调试预览
  temp.mask(maskImg); // mask 会修改 temp

  // 将结果按比例缩放以适应窗口并居中显示（使用 mask 的尺寸 w,h）  // 将结果按比例缩放以适应窗口并居中显示（使用 mask 的尺寸 w,h）
  const scaleToWindow = Math.min(width / w, height / h); / w, height / h);
  const dw = w * scaleToWindow;  const dw = w * scaleToWindow;
  const dh = h * scaleToWindow;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  image(temp, dx, dy, dw, dh);

  // 叠加原始 frame（保留边框视觉）  // 叠加原始 frame（保留边框视觉）
  image(frameImg, dx, dy, dw, dh);dh);
}