/**
 * URLs dos modelos @vladmandic/face-api hospedados no CDN.
 * Os arquivos foram enviados via manus-upload-file --webdev.
 * O face-api carrega os modelos a partir de uma URL base + nome do arquivo.
 * Como cada arquivo tem um hash único, usamos um custom model loader.
 */

const CDN_BASE = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663029099127/Gw6CU8nRy9T64yBMvKuEjJ';

export const FACE_API_MODEL_URLS = {
  tinyFaceDetector: {
    manifest: `${CDN_BASE}/tiny_face_detector_model-weights_manifest_25da6e32.json`,
    weights: `${CDN_BASE}/tiny_face_detector_model_443e8936.bin`,
  },
  faceLandmark68: {
    manifest: `${CDN_BASE}/face_landmark_68_model-weights_manifest_ae05382c.json`,
    weights: `${CDN_BASE}/face_landmark_68_model_3f8370af.bin`,
  },
  faceRecognition: {
    manifest: `${CDN_BASE}/face_recognition_model-weights_manifest_c14f8742.json`,
    weights: `${CDN_BASE}/face_recognition_model_d774b10d.bin`,
  },
  faceExpression: {
    manifest: `${CDN_BASE}/face_expression_model-weights_manifest_100e193d.json`,
    weights: `${CDN_BASE}/face_expression_model_711bfd80.bin`,
  },
} as const;

/**
 * URL base "virtual" para o face-api carregar os modelos.
 * O face-api espera uma URL base e adiciona o nome do arquivo padrão.
 * Usamos um service worker ou fetch interceptor para redirecionar.
 * 
 * Alternativa mais simples: usar loadFromUri com um proxy local.
 */
export const FACE_API_MODELS_BASE_URL = `${CDN_BASE}`;
