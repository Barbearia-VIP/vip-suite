/**
 * Hook para carregar os modelos do @vladmandic/face-api a partir do CDN.
 * Os modelos são carregados uma única vez e cacheados na memória.
 */
import { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';

const CDN_BASE = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663029099127/Gw6CU8nRy9T64yBMvKuEjJ';

// Mapeamento dos nomes padrão do face-api para os nomes com hash no CDN
const MODEL_URL_MAP: Record<string, string> = {
  'tiny_face_detector_model-weights_manifest.json': `${CDN_BASE}/tiny_face_detector_model-weights_manifest_25da6e32.json`,
  'tiny_face_detector_model.bin': `${CDN_BASE}/tiny_face_detector_model_443e8936.bin`,
  'face_landmark_68_model-weights_manifest.json': `${CDN_BASE}/face_landmark_68_model-weights_manifest_ae05382c.json`,
  'face_landmark_68_model.bin': `${CDN_BASE}/face_landmark_68_model_3f8370af.bin`,
  'face_recognition_model-weights_manifest.json': `${CDN_BASE}/face_recognition_model-weights_manifest_c14f8742.json`,
  'face_recognition_model.bin': `${CDN_BASE}/face_recognition_model_d774b10d.bin`,
  'face_expression_model-weights_manifest.json': `${CDN_BASE}/face_expression_model-weights_manifest_100e193d.json`,
  'face_expression_model.bin': `${CDN_BASE}/face_expression_model_711bfd80.bin`,
};

/**
 * Fetch interceptor: substitui as URLs padrão do face-api pelas URLs do CDN com hash.
 * O face-api usa fetch internamente para carregar os modelos.
 */
function patchFetchForFaceApi() {
  const originalFetch = window.fetch;
  (window as any)._faceApiOriginalFetch = originalFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    // Extrair apenas o nome do arquivo da URL
    const fileName = url.split('/').pop() ?? '';
    if (MODEL_URL_MAP[fileName]) {
      url = MODEL_URL_MAP[fileName];
      return originalFetch(url, init);
    }
    return originalFetch(input, init);
  };
}

function restoreFetch() {
  if ((window as any)._faceApiOriginalFetch) {
    window.fetch = (window as any)._faceApiOriginalFetch;
  }
}

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export type FaceApiStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useFaceApi() {
  const [status, setStatus] = useState<FaceApiStatus>(modelsLoaded ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadModels = async () => {
    if (modelsLoaded) {
      if (mountedRef.current) setStatus('ready');
      return;
    }

    if (loadingPromise) {
      if (mountedRef.current) setStatus('loading');
      await loadingPromise;
      if (mountedRef.current) setStatus('ready');
      return;
    }

    if (mountedRef.current) setStatus('loading');

    loadingPromise = (async () => {
      try {
        // Patch fetch para redirecionar para CDN com hash
        patchFetchForFaceApi();

        // Usar uma URL base qualquer — o fetch interceptor vai redirecionar
        const MODEL_URL = `${CDN_BASE}/models`;

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);

        restoreFetch();
        modelsLoaded = true;
      } catch (err) {
        restoreFetch();
        loadingPromise = null;
        throw err;
      }
    })();

    try {
      await loadingPromise;
      if (mountedRef.current) setStatus('ready');
    } catch (err) {
      loadingPromise = null;
      if (mountedRef.current) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Erro ao carregar modelos de IA');
      }
    }
  };

  return { status, error, loadModels, isReady: status === 'ready' };
}
