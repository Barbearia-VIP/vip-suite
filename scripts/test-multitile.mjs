/**
 * Testa a estratégia multi-tile (2x2 quadrantes com zoom 2.5x)
 * para câmera olho de peixe Dahua
 */
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import * as faceapi from '@vladmandic/face-api';

const MODELS_PATH = '/home/ubuntu/vip-suite/client/public/models';
const SSD_MIN_CONFIDENCE = 0.5;
const TILE_SCALE = 2.5;
const TILE_OVERLAP = 0.15;
const IOU_DEDUP_THRESHOLD = 0.3;

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

console.log('Carregando modelos SSD MobileNet...');
await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
console.log('Modelos carregados!');

const img = await loadImage('/tmp/frame_fresh.jpg');
const W = img.width, H = img.height;
console.log(`Frame: ${W}x${H}`);

const cols = 2, rows = 2;
const tileW = Math.round(W / cols * (1 + TILE_OVERLAP));
const tileH = Math.round(H / rows * (1 + TILE_OVERLAP));
const stepX = Math.round(W / cols);
const stepY = Math.round(H / rows);

const allDetections = [];
const t0 = Date.now();

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const srcX = col * stepX;
    const srcY = row * stepY;
    const srcW = Math.min(tileW, W - srcX);
    const srcH = Math.min(tileH, H - srcY);
    const dstW = Math.round(srcW * TILE_SCALE);
    const dstH = Math.round(srcH * TILE_SCALE);

    const tileCanvas = createCanvas(dstW, dstH);
    const tileCtx = tileCanvas.getContext('2d');
    tileCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH);

    const dets = await faceapi
      .detectAllFaces(tileCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_MIN_CONFIDENCE }))
      .withFaceLandmarks()
      .withFaceExpressions();

    console.log(`  Tile [${col},${row}] (${srcX},${srcY},${srcW}x${srcH} → ${dstW}x${dstH}): ${dets.length} faces`);
    for (const d of dets) {
      const top = Object.entries(d.expressions).sort((a,b) => b[1]-a[1])[0];
      const origBox = {
        x: Math.round(srcX + d.detection.box.x / TILE_SCALE),
        y: Math.round(srcY + d.detection.box.y / TILE_SCALE),
        width: Math.round(d.detection.box.width / TILE_SCALE),
        height: Math.round(d.detection.box.height / TILE_SCALE),
      };
      console.log(`    score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]}(${(top[1]*100).toFixed(0)}%) origBox=[${origBox.x},${origBox.y},${origBox.width},${origBox.height}]`);
      allDetections.push({ score: d.detection.score, box: origBox, expressions: d.expressions });
    }
  }
}

console.log(`\nTotal antes de dedup: ${allDetections.length} faces em ${Date.now()-t0}ms`);

// Dedup por IoU
function iou(a, b) {
  const ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx2 = b.x + b.width, by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2-ix1)*(iy2-iy1);
  return inter / (a.width*a.height + b.width*b.height - inter);
}

const sorted = [...allDetections].sort((a,b) => b.score-a.score);
const kept = [];
for (const det of sorted) {
  if (!kept.some(k => iou(det.box, k.box) > IOU_DEDUP_THRESHOLD)) {
    kept.push(det);
  }
}

const filtered = kept.filter(d => d.box.width >= 15 && d.box.height >= 15);
console.log(`Após dedup+filtro: ${filtered.length} faces`);
for (const d of filtered) {
  const top = Object.entries(d.expressions).sort((a,b) => b[1]-a[1])[0];
  console.log(`  score=${(d.score*100).toFixed(1)}% expr=${top[0]} box=[${d.box.x},${d.box.y},${d.box.width},${d.box.height}]`);
}
