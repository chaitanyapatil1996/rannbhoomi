const { Jimp } = require('jimp');

async function recolorLogo() {
  console.log('Loading image...');
  const img = await Jimp.read('images/RB.png');

  // Work at 1500x1500 for speed — still high quality for web
  img.resize({ w: 1500, h: 1500 });
  const width = img.bitmap.width;
  const height = img.bitmap.height;
  const data = img.bitmap.data;
  console.log(`Working at ${width}x${height}`);

  // ── Step 1: Binary mask — use alpha channel (background is transparent, alpha=0) ──
  const logo = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    logo[i] = data[i * 4 + 3] > 10 ? 1 : 0; // alpha > 10 = logo pixel
  }

  // ── Step 2: Separable morphological open (erode → dilate) ──
  // At 1500px, slash ≈ 4-8px wide, letters ≈ 70-100px wide → K=11 kills slash
  const K = 11;
  const half = Math.floor(K / 2);
  console.log(`Morphological open (kernel=${K})...`);

  // Horizontal erosion
  const eroH = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1;
      for (let kx = -half; kx <= half; kx++) {
        const nx = x + kx;
        if (nx < 0 || nx >= width || !logo[y * width + nx]) { v = 0; break; }
      }
      eroH[y * width + x] = v;
    }
  }
  // Vertical erosion
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1;
      for (let ky = -half; ky <= half; ky++) {
        const ny = y + ky;
        if (ny < 0 || ny >= height || !eroH[ny * width + x]) { v = 0; break; }
      }
      eroded[y * width + x] = v;
    }
  }
  // Horizontal dilation
  const dilH = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let kx = -half; kx <= half; kx++) {
        const nx = x + kx;
        if (nx >= 0 && nx < width && eroded[y * width + nx]) { v = 1; break; }
      }
      dilH[y * width + x] = v;
    }
  }
  // Vertical dilation → final text mask
  const textMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let ky = -half; ky <= half; ky++) {
        const ny = y + ky;
        if (ny >= 0 && ny < height && dilH[ny * width + x]) { v = 1; break; }
      }
      textMask[y * width + x] = v;
    }
  }

  // ── Step 3: Apply brand colours ──
  console.log('Applying colours...');
  const od = img.bitmap.data;
  for (let i = 0; i < width * height; i++) {
    const bi = i * 4;
    if (logo[i]) {
      if (textMask[i]) {
        od[bi] = 76; od[bi+1] = 0; od[bi+2] = 7; od[bi+3] = 255;   // Crimson #4c0007
      } else {
        od[bi] = 222; od[bi+1] = 193; od[bi+2] = 137; od[bi+3] = 255; // Gold #dec189
      }
    } else {
      od[bi] = 255; od[bi+1] = 255; od[bi+2] = 255; od[bi+3] = 0; // Transparent background
    }
  }

  await img.write('images/logo-rb-colored.png');
  console.log('Done → images/logo-rb-colored.png');
}

recolorLogo().catch(console.error);
