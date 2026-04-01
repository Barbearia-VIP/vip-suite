/**
 * Hook para carregar os modelos do @vladmandic/face-api a partir do servidor local.
 * Os modelos ficam em client/public/models/ e são servidos pelo Vite/Express.
 * Os modelos são carregados uma única vez e cacheados na memória.
 */
import { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';

// Caminho local — os modelos ficam em client/public/models/
// Servidos diretamente pelo Vite sem depender de CDN externo
const MODEL_URL = '/models';

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
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
      } catch (err) {
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
