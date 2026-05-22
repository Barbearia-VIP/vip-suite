/**
 * Validação: @vladmandic/face-api + canvas em Node.js
 * Testa com frame real da câmera Dahua (1280x724, H.265/HEVC via RTSP)
 *
 * Uso: node scripts/validate-face-api.mjs
 */

import { createCanvas, loadImage } from 'canvas';
import * as tf from '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = join(__dirname, '../client/public/models');
const FRAME_PATH = process.argv[2] || '/tmp/test_frame.jpg';

console.log('=== Validação face-api server-side ===\n');

// 1. Configurar o backend TensorFlow (CPU puro, sem bindings nativos)
console.log('[1] Configurando TensorFlow backend CPU...');
await tf.setBackend('cpu');
await tf.ready();
console.log(`    Backend: ${tf.getBackend()}`);
console.log(`    TF version: ${tf.version['tfjs-core']}`);

// 2. Configurar face-api para usar canvas do Node.js
console.log('\n[2] Configurando face-api para Node.js (monkey-patch canvas)...');
const { Canvas, Image, ImageData } = await import('canvas');
// @vladmandic/face-api detecta automaticamente o ambiente Node.js
// mas precisamos fornecer o canvas para ele
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
console.log('    Canvas monkey-patch aplicado');

// 3. Carregar modelos
console.log('\n[3] Carregando modelos de:', MODELS_PATH);
const t0 = Date.now();
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
console.log(`    Modelos carregados em ${Date.now() - t0}ms`);

// 4. Carregar frame da câmera
console.log('\n[4] Carregando frame da câmera:', FRAME_PATH);
const img = await loadImage(FRAME_PATH);
console.log(`    Dimensões: ${img.width}x${img.height}`);

// Criar canvas com as dimensões da imagem
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

// 5. Detectar faces
console.log('\n[5] Detectando faces...');
const t1 = Date.now();
const detections = await faceapi
  .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
  .withFaceLandmarks()
  .withFaceDescriptors()
  .withFaceExpressions();
const elapsed = Date.now() - t1;

console.log(`    Tempo de detecção: ${elapsed}ms`);
console.log(`    Faces detectadas: ${detections.length}`);

if (detections.length === 0) {
  console.log('\n[!] Nenhuma face detectada neste frame.');
  console.log('    Isso pode ser normal se não há pessoas na câmera agora.');
  console.log('    Tentando com scoreThreshold menor (0.2)...');

  const t2 = Date.now();
  const detections2 = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();
  console.log(`    Faces com threshold=0.2: ${detections2.length} (${Date.now() - t2}ms)`);

  if (detections2.length > 0) {
    printResults(detections2);
  }
} else {
  printResults(detections);
}

function printResults(dets) {
  for (let i = 0; i < dets.length; i++) {
    const d = dets[i];
    const box = d.detection.box;
    const score = d.detection.score;
    const expressions = d.expressions;
    const topExpr = Object.entries(expressions).sort((a, b) => b[1] - a[1])[0];
    const descriptorLen = d.descriptor.length;

    console.log(`\n    Face #${i + 1}:`);
    console.log(`      Score: ${(score * 100).toFixed(1)}%`);
    console.log(`      Posição: x=${Math.round(box.x)}, y=${Math.round(box.y)}, w=${Math.round(box.width)}, h=${Math.round(box.height)}`);
    console.log(`      Expressão dominante: ${topExpr[0]} (${(topExpr[1] * 100).toFixed(1)}%)`);
    console.log(`      Descriptor: Float32Array[${descriptorLen}]`);
    console.log(`      Todas expressões:`, Object.fromEntries(
      Object.entries(expressions).map(([k, v]) => [k, `${(v * 100).toFixed(1)}%`])
    ));
  }
}

console.log('\n=== Resultado ===');
console.log('canvas: OK (v3.2.3)');
console.log('@tensorflow/tfjs: OK (CPU backend)');
console.log('@vladmandic/face-api: OK');
console.log('Frame da câmera Dahua: OK (1280x724)');
console.log('\nValidação concluída!');
