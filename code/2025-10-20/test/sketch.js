// Flowing ribbon/grid renderer
// Controls: complexity (smoothness/detail) and seed (repeatable layouts)

let complexitySlider, seedInput, randomBtn;
let params = {
	seed: 2025,
	cols: 10,
	rows: 8,
	padding: 40,
	complexity: 0.5 // 0..1 controls noise scale and ribbon detail
};

function setup() {
	createCanvas(800, 800);

	// Simple controls: complexity slider, seed input, randomize
	const ctrlDiv = createDiv('').style('display', 'flex').style('gap', '12px').style('align-items','center').position(10, height + 10);

	ctrlDiv.child(createSpan('Complexity').style('font-family','sans-serif'));
	complexitySlider = createSlider(0, 100, params.complexity * 100, 1);
	ctrlDiv.child(complexitySlider);

	ctrlDiv.child(createSpan('Seed').style('font-family','sans-serif'));
	seedInput = createInput(String(params.seed));
	seedInput.attribute('size', '6');
	ctrlDiv.child(seedInput);

	randomBtn = createButton('Randomize');
	ctrlDiv.child(randomBtn);

	complexitySlider.input(() => redraw());
	randomBtn.mousePressed(() => {
		params.seed = floor(random(0, 100000));
		seedInput.value(String(params.seed));
		redraw();
	});

	seedInput.elt.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			const v = parseInt(seedInput.value(), 10);
			if (!isNaN(v)) {
				params.seed = v;
				redraw();
			}
		}
	});

	noLoop();
	redraw();
}

function draw() {
	background(250);
	params.complexity = complexitySlider.value() / 100;
	const parsed = parseInt(seedInput.value(), 10);
	if (!isNaN(parsed)) params.seed = parsed;
	randomSeed(params.seed);
	noiseSeed(params.seed + 1);

	// layout
	const cols = params.cols;
	const rows = params.rows;
	const padding = params.padding;
	const w = width - padding * 2;
	const h = height - padding * 2;

	// base palette (soft translucent colors)
	const palette = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#b197fc'];

	// draw faint grid lines
	stroke(220);
	strokeWeight(1);
	for (let i = 0; i <= cols; i++) {
		const x = padding + (i * w) / cols;
		line(x, padding, x, padding + h);
	}
	for (let j = 0; j <= rows; j++) {
		const y = padding + (j * h) / rows;
		line(padding, y, padding + w, y);
	}

	// for each horizontal band, draw flowing ribbons formed from samples across columns
	const bands = rows + 1;
	for (let b = 0; b < bands; b++) {
		// choose color and thickness
		const cHex = random(palette);
		const col = color(cHex);
		col.setAlpha(140);
		const thickness = map(params.complexity, 0, 1, 6, 40) * random(0.6, 1.2);

		// sample points across width
		const samples = cols * 6;
		const pts = [];
		for (let i = 0; i <= samples; i++) {
			const t = i / samples;
			const x = padding + t * w;
			// baseline along grid lines with small offset per band
			const baseY = padding + (b * h) / rows;
			// use noise to generate smooth vertical displacement
			const n = noise(t * (1 + params.complexity * 6) + b * 0.3, params.seed * 0.0001 + b * 0.1);
			const amp = map(params.complexity, 0, 1, 6, 160);
			const y = baseY + map(n, 0, 1, -amp, amp) * (sin(t * PI) * 0.8 + 0.2);
			pts.push(createVector(x, y));
		}

		// draw multiple offset strokes to simulate a translucent ribbon
		const layers = int(map(params.complexity, 0, 1, 6, 18));
		for (let layer = 0; layer < layers; layer++) {
			const offset = map(layer, 0, layers - 1, -thickness / 2, thickness / 2);
			stroke(col);
			strokeWeight(1.2);
			noFill();
			beginShape();
			for (let k = 0; k < pts.length; k++) {
				const p = pts[k];
				// offset perpendicular using derivative
				let px = p.x;
				let py = p.y;
				if (k > 0 && k < pts.length - 1) {
					const prev = pts[k - 1];
					const next = pts[k + 1];
					const dx = next.x - prev.x;
					const dy = next.y - prev.y;
					const len = sqrt(dx * dx + dy * dy) || 1;
					const ux = -dy / len;
					const uy = dx / len;
					px += ux * offset * (0.6 + 0.4 * sin(k * 0.3 + layer));
					py += uy * offset * (0.6 + 0.4 * sin(k * 0.3 + layer));
				}
				curveVertex(px, py);
			}
			endShape();
		}

		// small dots at sample points for that band
		noStroke();
		for (let p of pts) {
			const dcol = color(random(palette));
			dcol.setAlpha(200);
			fill(dcol);
			ellipse(p.x, p.y, 4, 4);
		}
	}
}

function windowResized() {
	// keep canvas size fixed for layout simplicity
}

