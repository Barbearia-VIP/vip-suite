/**
 * Testa detecção com SSD MobileNet (melhor para rostos pequenos/distantes)
 * e diferentes parâmetros para câmera olho de peixe
 */
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import { existsSync } from 'fs';
import path from 'path';

const MODELS_PATH = '/home/ubuntu/vip-suite/client/public/models';
const SSD_MODELS_PATH = '/home/ubuntu/vip-suite/node_modules/.pnpm/@vladmandic+face-api@1.7.15/node_modules/@vladmandic/face-api/model';

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Verificar qual caminho tem os modelos SSD
const modelsPath = existsSync(path.join(MODELS_PATH, 'ssd_mobilenetv1_model-weights_manifest.json'))
  ? MODELS_PATH
  : SSD_MODELS_PATH;

console.log('Usando modelos de:', modelsPath);
console.log('Carregando modelos SSD MobileNet...');

await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
await faceapi.nets.faceExpressionNet.loadFromDisk(modelsPath);
console.log('Modelos carregados!');

const img = await loadImage('/tmp/current_frame2.jpg');
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

console.log(`Frame: ${img.width}x${img.height}`);

// Testar com diferentes thresholds
for (const minConf of [0.1, 0.2, 0.3, 0.5]) {
  const t0 = Date.now();
  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: minConf }))
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();

  console.log(`SSD minConf=${minConf}: ${detections.length} faces em ${Date.now()-t0}ms`);
  for (const d of detections) {
    const exprs = d.expressions;
    const top = Object.entries(exprs).sort((a,b) => b[1]-a[1])[0];
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]}(${(top[1]*100).toFixed(0)}%) box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
  }
}

// Testar TinyFaceDetector com inputSize maior
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
for (const inputSize of [320, 416, 608]) {
  const t0 = Date.now();
  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.2 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();

  console.log(`Tiny inputSize=${inputSize} score=0.2: ${detections.length} faces em ${Date.now()-t0}ms`);
  for (const d of detections) {
    const exprs = d.expressions;
    const top = Object.entries(exprs).sort((a,b) => b[1]-a[1])[0];
    console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]}(${(top[1]*100).toFixed(0)}%) box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
  }
}
