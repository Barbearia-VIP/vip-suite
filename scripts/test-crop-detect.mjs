/**
 * Testa detecção facial com recorte e zoom da região onde pessoas aparecem
 * na câmera olho de peixe Dahua
 */
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import { writeFileSync } from 'fs';

const MODELS_PATH = '/home/ubuntu/vip-suite/client/public/models';

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

console.log('Carregando modelos SSD MobileNet...');
await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
console.log('Modelos carregados!');

const img = await loadImage('/tmp/frame_fresh.jpg');
const W = img.width, H = img.height;
console.log(`Frame original: ${W}x${H}`);

// Estratégia 1: Frame completo com escala 2x (upscale)
{
  const scale = 2;
  const canvas = createCanvas(W * scale, H * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W * scale, H * scale);
  
  const t0 = Date.now();
  const dets = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
    .withFaceLandmarks()
    .withFaceExpressions();
  
  console.log(`\n[2x upscale] ${dets.length} faces em ${Date.now()-t0}ms`);
  for (const d of dets) {
    const top = Object.entries(d.expressions).sort((a,b) => b[1]-a[1])[0];
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]} box=[${(d.detection.box.x/scale).toFixed(0)},${(d.detection.box.y/scale).toFixed(0)},${(d.detection.box.width/scale).toFixed(0)},${(d.detection.box.height/scale).toFixed(0)}]`);
  }
}

// Estratégia 2: Recortar região central-esquerda (onde barbeiro está)
// Região: x=380-580, y=240-420 (barbeiro com boné)
{
  const cx = 380, cy = 240, cw = 200, ch = 180;
  const scale = 3;
  const canvas = createCanvas(cw * scale, ch * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);
  
  // Salvar para inspeção
  writeFileSync('/tmp/crop_barbeiro.jpg', canvas.toBuffer('image/jpeg'));
  
  const t0 = Date.now();
  const dets = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
    .withFaceLandmarks()
    .withFaceExpressions();
  
  console.log(`\n[Crop barbeiro 3x] ${dets.length} faces em ${Date.now()-t0}ms`);
  for (const d of dets) {
    const top = Object.entries(d.expressions).sort((a,b) => b[1]-a[1])[0];
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]} box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
  }
}

// Estratégia 3: Recortar metade superior (onde rostos geralmente aparecem)
{
  const cx = 0, cy = 0, cw = W, ch = Math.round(H * 0.6);
  const scale = 2;
  const canvas = createCanvas(cw * scale, ch * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);
  
  const t0 = Date.now();
  const dets = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
    .withFaceLandmarks()
    .withFaceExpressions();
  
  console.log(`\n[Top 60% 2x] ${dets.length} faces em ${Date.now()-t0}ms`);
  for (const d of dets) {
    const top = Object.entries(d.expressions).sort((a,b) => b[1]-a[1])[0];
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]} box=[${(d.detection.box.x/scale).toFixed(0)},${(d.detection.box.y/scale).toFixed(0)},${(d.detection.box.width/scale).toFixed(0)},${(d.detection.box.height/scale).toFixed(0)}]`);
  }
}

console.log('\nCrop salvo em /tmp/crop_barbeiro.jpg para inspeção');
