import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import path from 'path';

const MODELS_PATH = '/home/ubuntu/vip-suite/client/public/models';

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

console.log('Carregando modelos TinyFaceDetector...');
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
console.log('Modelos carregados!');

const img = await loadImage('/tmp/current_frame2.jpg');
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

console.log(`Frame: ${img.width}x${img.height}`);
console.log('Detectando com TinyFaceDetector (scoreThreshold=0.4, inputSize=416)...');

const t0 = Date.now();
const detections = await faceapi
  .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
  .withFaceLandmarks()
  .withFaceDescriptors()
  .withFaceExpressions();

console.log(`Tempo: ${Date.now()-t0}ms | Faces: ${detections.length}`);
for (const d of detections) {
  const exprs = d.expressions;
  const top = Object.entries(exprs).sort((a,b) => b[1]-a[1])[0];
  console.log(`  score=${(d.detection.score*100).toFixed(1)}% expr=${top[0]}(${(top[1]*100).toFixed(0)}%) box=[${d.detection.box.x.toFixed(0)},${d.detection.box.y.toFixed(0)},${d.detection.box.width.toFixed(0)},${d.detection.box.height.toFixed(0)}]`);
}
