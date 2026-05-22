/**
 * Testa a detecção facial no frame atual da câmera IP
 */
import { createCanvas, loadImage } from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = path.join(__dirname, '../client/public/models');

// Configurar canvas para Node.js
const { Canvas, Image, ImageData } = await import('canvas');
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

console.log('Carregando modelos...');
await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
console.log('Modelos carregados!');

// Carregar frame atual da câmera
const framePath = '/tmp/current_frame2.jpg';
console.log('Carregando frame:', framePath);
const img = await loadImage(framePath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

console.log(`Frame: ${img.width}x${img.height}`);
console.log('Executando detecção...');

const t0 = Date.now();
const detections = await faceapi
  .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
  .withFaceLandmarks()
  .withFaceExpressions()
  .withFaceDescriptors();

console.log(`Detecção concluída em ${Date.now() - t0}ms`);
console.log(`Faces detectadas: ${detections.length}`);

for (const d of detections) {
  const expressions = d.expressions;
  const dominant = Object.entries(expressions).sort((a, b) => b[1] - a[1])[0];
  const box = d.detection.box;
  console.log(`  - Confiança: ${(d.detection.score * 100).toFixed(1)}%`);
  console.log(`    Expressão dominante: ${dominant[0]} (${(dominant[1] * 100).toFixed(1)}%)`);
  console.log(`    Box: x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}, w=${box.width.toFixed(0)}, h=${box.height.toFixed(0)}`);
}
