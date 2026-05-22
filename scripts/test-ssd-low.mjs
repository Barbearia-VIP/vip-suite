/**
 * Testa SSD MobileNet com minConfidence=0.15 (mesmo valor do faceRecognitionService)
 * para verificar se detecta rostos na câmera olho de peixe Dahua
 */
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import * as faceapi from '@vladmandic/face-api';

const MODELS_PATH = '/home/ubuntu/vip-suite/client/public/models';

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

console.log('Carregando modelos SSD MobileNet...');
await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
console.log('Modelos carregados!');

const img = await loadImage('/tmp/frame_fresh.jpg');
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

console.log(`Frame: ${img.width}x${img.height}`);

// Testar com minConfidence=0.15 (mesmo do faceRecognitionService)
const t0 = Date.now();
const detections = await faceapi
  .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
  .withFaceLandmarks()
  .withFaceDescriptors()
  .withFaceExpressions();

console.log(`SSD minConf=0.15: ${detections.length} faces em ${Date.now()-t0}ms`);

// Filtrar por tamanho mínimo (>= 15px)
const filtered = detections.filter(d => d.detection.box.width >= 15 && d.detection.box.height >= 15);
console.log(`Após filtro (>= 15px): ${filtered.length} faces`);

for (const d of filtered) {
  const exprs = d.expressions;
  const top = Object.entries(exprs).sort((a,b) => b[1]-a[1])[0];
  console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]}(${(top[1]*100).toFixed(0)}%) box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
}

// Mostrar todas as detecções (incluindo pequenas) para debug
if (detections.length > filtered.length) {
  console.log('\nDetecções descartadas (< 15px):');
  for (const d of detections.filter(d => d.detection.box.width < 15 || d.detection.box.height < 15)) {
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
  }
}
