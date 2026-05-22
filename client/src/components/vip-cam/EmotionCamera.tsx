/**
 * EmotionCamera — Componente de câmera ao vivo com reconhecimento facial.
 *
 * Suporta:
 * - Webcam USB via getUserMedia (modo "usb")
 *   → Reconhecimento facial no BROWSER (face-api.js) — comportamento inalterado
 * - Câmera IP via snapshot MJPEG/HTTP (modo "ip")
 *   → Reconhecimento facial no SERVIDOR (worker permanente) — sem face-api no browser
 *   → Browser apenas exibe frames via polling (~2.5fps)
 *
 * Lógica de detecção USB (inalterada):
 * - Loop a ~4 FPS (250ms)
 * - Buffer de 1.5s para acumular expressões e descriptors
 * - Cooldown de 4s após cada captura
 * - Cache de descritores recarregado a cada 60s
 * - Threshold de matching: 0.55
 *
 * Lógica de detecção IP (nova):
 * - Worker permanente no servidor detecta faces a cada 30s
 * - Salva capturas no banco sem precisar do browser aberto
 * - Browser apenas exibe frames e mostra status do worker
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { trpc } from '@/lib/trpc';
import { useFaceApi } from '@/hooks/useFaceApi';
import {
  classifyExpression,
  averageExpressions,
  findMatchingClient,
  ExpressionScores,
  SatisfactionLevel,
  SATISFACTION_LABELS,
  SATISFACTION_COLORS,
  SATISFACTION_EMOJIS,
} from '@/lib/emotionClassifier';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, CameraOff, RefreshCw, Wifi, WifiOff, Bot } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

interface DetectionResult {
  satisfactionLevel: SatisfactionLevel;
  expression: string;
  confidence: number;
  clienteId: number | null;
  isNew: boolean;
  faceImageUrl?: string;
}

interface CameraConfig {
  cameraType: 'usb' | 'ip';
  unitId?: number | null;
  rtspUrl?: string | null;
  rtspLogin?: string | null;
  rtspPassword?: string | null;
  cooldownSeconds?: number | null;
  captureWindowMs?: number | null;
  detectionThreshold?: string | null;
}

interface EmotionCameraProps {
  unitId: number;
  config?: CameraConfig | null;
  onDetection?: (result: DetectionResult) => void;
}

interface WorkerStatus {
  unitId: number;
  running: boolean;
  hasFrame: boolean;
  lastFrameAge: number;
  uptime: number;
  retryCount: number;
  lastDetectionAt: number;
  lastDetectionCount: number;
  totalCapturesSaved: number;
}

// ─────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────

export function EmotionCamera({ unitId, config, onDetection }: EmotionCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ipImgRef = useRef<HTMLImageElement>(null);
  const ipWsRef = useRef<WebSocket | null>(null);
  const ipBlobUrlRef = useRef<string | null>(null);
  const ipPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ipFrameCountRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureBufferRef = useRef<{ expressions: ExpressionScores[]; descriptors: Float32Array[] }>({ expressions: [], descriptors: [] });
  const captureWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false);
  const isCapturingRef = useRef(false);
  const clientCacheRef = useRef<Array<{ id: number; faceDescriptor: number[] | null }>>([]);
  const workerStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const ipContainerRef = useRef<HTMLDivElement>(null);
  const detectionsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { status: faceApiStatus, error: faceApiError, loadModels } = useFaceApi();

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [lastDetection, setLastDetection] = useState<DetectionResult | null>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [ipConnected, setIpConnected] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);

  // Face boxes para overlay na câmera IP
  interface FaceBoxData {
    x: number; y: number; width: number; height: number;
    satisfaction: 'satisfied' | 'neutral' | 'unsatisfied';
    expression: string; confidence: number; detectedAt: number;
  }
  const [faceBoxes, setFaceBoxes] = useState<FaceBoxData[]>([]);

  const cameraType = config?.cameraType ?? 'usb';
  const cooldownMs = (config?.cooldownSeconds ?? 4) * 1000;
  const captureWindowMs = config?.captureWindowMs ?? 1500;

  // ── tRPC mutations ──────────────────────────

  const saveCaptureM = trpc.vipCam.saveCapture.useMutation();
  const uploadImageM = trpc.vipCam.uploadFaceImage.useMutation();

  // ── Cache de descritores (USB only) ────────

  const { refetch: refetchDescriptors } = trpc.vipCam.getFaceDescriptors.useQuery(
    { unitId },
    { enabled: false }
  );

  const loadCache = useCallback(async () => {
    const result = await refetchDescriptors();
    if (result.data) {
      clientCacheRef.current = result.data.map((c: { id: number; faceDescriptor: unknown }) => ({
        id: c.id,
        faceDescriptor: c.faceDescriptor as number[] | null,
      }));
    }
  }, [refetchDescriptors]);

  // ── Listar câmeras disponíveis ──────────────────

  const listCameras = useCallback(async (autoSelect = true) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      if (!autoSelect) return;
      const preferred = videoDevices.find(d =>
        /usb|logitech|c920|c930|c270|c615|brio|external|webcam|hd pro|hd cam/i.test(d.label)
      );
      if (preferred) {
        setSelectedCameraId(preferred.deviceId);
      } else if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch {
      // Sem permissão ainda — ok
    }
  }, [selectedCameraId]);

  useEffect(() => {
    listCameras();
    const handler = () => listCameras(false);
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Iniciar câmera USB ──────────────────────

  const friendlyError = useCallback((err: unknown): string => {
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'NotReadableError' || msg.includes('Could not start video source')) {
      return 'A câmera está sendo usada por outro programa (Zoom, Teams, OBS, etc.). Feche os outros programas, desconecte e reconecte a câmera USB, e tente novamente.';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Permissão de câmera negada. Clique no ícone de câmera na barra de endereço do browser e permita o acesso.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Nenhuma câmera encontrada. Verifique se a câmera USB está conectada corretamente e tente novamente.';
    }
    if (name === 'OverconstrainedError') {
      return 'A câmera não suporta as configurações solicitadas. Tente selecionar outra câmera na lista.';
    }
    if (name === 'AbortError') {
      return 'Acesso à câmera foi interrompido. Tente novamente.';
    }
    return msg || 'Erro desconhecido ao acessar câmera';
  }, []);

  const startUSBCamera = useCallback(async () => {
    setCameraError(null);

    const attempts: (() => Promise<MediaStream>)[] = [
      ...(selectedCameraId ? [() => navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })] : []),
      ...(selectedCameraId ? [() => navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCameraId } },
      })] : []),
      () => navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      }),
      () => navigator.mediaDevices.getUserMedia({ video: true }),
    ];

    let lastErr: unknown;
    for (const attempt of attempts) {
      try {
        const stream = await attempt();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        await listCameras();
        setCameraActive(true);
        return;
      } catch (err) {
        lastErr = err;
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotReadableError') break;
      }
    }

    const msg = friendlyError(lastErr);
    setCameraError(msg);
    toast.error('Erro ao iniciar câmera', { description: msg, duration: 8000 });
  }, [selectedCameraId, listCameras, friendlyError]);

  // ── Parar câmera ────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    if (captureWindowRef.current) clearTimeout(captureWindowRef.current);
    if (workerStatusIntervalRef.current) {
      clearInterval(workerStatusIntervalRef.current);
      workerStatusIntervalRef.current = null;
    }
    if (ipWsRef.current) {
      ipWsRef.current.close();
      ipWsRef.current = null;
    }
    if (ipPollingRef.current) {
      clearInterval(ipPollingRef.current);
      ipPollingRef.current = null;
    }
    ipFrameCountRef.current = 0;
    if (ipBlobUrlRef.current) {
      URL.revokeObjectURL(ipBlobUrlRef.current);
      ipBlobUrlRef.current = null;
    }
    setIpConnected(false);
    setCameraActive(false);
    console.log('[IP Camera] Exibição pausada (worker continua capturando no servidor)');
  }, []);

  // ── Capturar frame como base64 (USB only) ──

  const captureFrame = useCallback((): string | null => {
    const canvas = canvasRef.current;
    const source: HTMLVideoElement | null = videoRef.current;
    if (!canvas || !source) return null;
    canvas.width = source.videoWidth || 640;
    canvas.height = source.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  // ── Processar captura final (USB only) ──────

  const processFinalCapture = useCallback(async () => {
    const buffer = captureBufferRef.current;
    if (buffer.expressions.length === 0 || buffer.descriptors.length === 0) {
      isCapturingRef.current = false;
      return;
    }

    const avgExpressions = averageExpressions(buffer.expressions);
    const { satisfactionLevel, dominantExpression } = classifyExpression(avgExpressions);

    const avgDescriptor = new Float32Array(buffer.descriptors[0].length);
    for (const d of buffer.descriptors) {
      for (let i = 0; i < d.length; i++) avgDescriptor[i] += d[i];
    }
    for (let i = 0; i < avgDescriptor.length; i++) {
      avgDescriptor[i] /= buffer.descriptors.length;
    }

    const match = findMatchingClient(avgDescriptor, clientCacheRef.current);

    const frameBase64 = captureFrame();
    let faceImageUrl: string | undefined;
    if (frameBase64) {
      try {
        const result = await uploadImageM.mutateAsync({ unitId, imageBase64: frameBase64 });
        faceImageUrl = result.url;
      } catch {
        // Continuar sem imagem
      }
    }

    const confidence = avgExpressions[dominantExpression as keyof ExpressionScores] ?? 0;
    try {
      const saved = await saveCaptureM.mutateAsync({
        unitId,
        faceDescriptor: Array.from(avgDescriptor),
        satisfactionLevel,
        expression: dominantExpression,
        confidence,
        faceImageUrl,
        existingClienteId: match?.clienteId,
      });

      const result: DetectionResult = {
        satisfactionLevel,
        expression: dominantExpression,
        confidence,
        clienteId: saved.clienteId,
        isNew: saved.isNewCliente,
        faceImageUrl,
      };

      setLastDetection(result);
      setDetectionCount(c => c + 1);
      onDetection?.(result);

      if (saved.isNewCliente) {
        clientCacheRef.current.push({
          id: saved.clienteId,
          faceDescriptor: Array.from(avgDescriptor),
        });
      } else {
        const idx = clientCacheRef.current.findIndex(c => c.id === saved.clienteId);
        if (idx >= 0) {
          const old = clientCacheRef.current[idx].faceDescriptor ?? [];
          if (old.length === avgDescriptor.length) {
            clientCacheRef.current[idx].faceDescriptor = old.map((v, i) => v * 0.7 + avgDescriptor[i] * 0.3);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao salvar captura:', err);
    }

    captureBufferRef.current = { expressions: [], descriptors: [] };
    isCapturingRef.current = false;
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, cooldownMs);
  }, [unitId, captureFrame, saveCaptureM, uploadImageM, onDetection, cooldownMs]);

  // ── Loop de detecção (USB only) ─────────────

  const runDetection = useCallback(async () => {
    if (cooldownRef.current) return;
    const source: HTMLVideoElement | null = videoRef.current;
    if (!source || source.readyState < 2) return;

    try {
      const detection = await faceapi
        .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.45 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

      if (!detection) {
        if (isCapturingRef.current) {
          if (captureWindowRef.current) clearTimeout(captureWindowRef.current);
          captureBufferRef.current = { expressions: [], descriptors: [] };
          isCapturingRef.current = false;
        }
        return;
      }

      const { expressions, descriptor } = detection;

      if (!isCapturingRef.current) {
        isCapturingRef.current = true;
        captureBufferRef.current = { expressions: [], descriptors: [] };

        captureWindowRef.current = setTimeout(() => {
          processFinalCapture();
        }, captureWindowMs);
      }

      captureBufferRef.current.expressions.push(expressions as unknown as ExpressionScores);
      captureBufferRef.current.descriptors.push(descriptor);

    } catch {
      // Ignorar erros de detecção individuais
    }
  }, [processFinalCapture, captureWindowMs]);

  // ── Iniciar detecção quando câmera USB ativa ─

  useEffect(() => {
    if (!cameraActive || faceApiStatus !== 'ready' || cameraType !== 'usb') return;

    loadCache();
    detectionIntervalRef.current = setInterval(runDetection, 250);
    cacheIntervalRef.current = setInterval(loadCache, 60_000);

    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    };
  }, [cameraActive, faceApiStatus, cameraType, runDetection, loadCache]);

  // ── Polling de status do worker IP ──────────

  const fetchWorkerStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/vip-cam/streams/status', { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json() as { streams: WorkerStatus[] };
      const ws = data.streams.find(s => s.unitId === unitId);
      if (ws) setWorkerStatus(ws);
    } catch {
      // Silencioso
    }
  }, [unitId]);

  useEffect(() => {
    if (cameraType !== 'ip' || !cameraActive) return;

    fetchWorkerStatus();
    workerStatusIntervalRef.current = setInterval(fetchWorkerStatus, 10_000);

    return () => {
      if (workerStatusIntervalRef.current) clearInterval(workerStatusIntervalRef.current);
    };
  }, [cameraType, cameraActive, fetchWorkerStatus]);

  // ── Polling de detecções (face boxes) para overlay na câmera IP ──────────

  const fetchDetections = useCallback(async () => {
    const id = config?.unitId ?? unitId;
    if (!id) return;
    try {
      const resp = await fetch(`/api/vip-cam/stream/${id}/detections`, { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json() as { detections: FaceBoxData[] };
      // Descartar detecções com mais de 60s (worker detecta a cada 30s)
      const cutoff = Date.now() - 60_000;
      setFaceBoxes(data.detections.filter(d => d.detectedAt > cutoff));
    } catch {
      // Silencioso
    }
  }, [unitId, config]);

  useEffect(() => {
    if (cameraType !== 'ip' || !cameraActive) return;

    fetchDetections();
    detectionsIntervalRef.current = setInterval(fetchDetections, 5_000);

    return () => {
      if (detectionsIntervalRef.current) clearInterval(detectionsIntervalRef.current);
    };
  }, [cameraType, cameraActive, fetchDetections]);

  // ── Desenhar boxes no canvas overlay ─────────────────────────────────────

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const img = ipImgRef.current;
    const container = ipContainerRef.current;
    if (!canvas || !img || !container || !ipConnected) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sincronizar dimensões do canvas com o container
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    canvas.width = containerW;
    canvas.height = containerH;

    ctx.clearRect(0, 0, containerW, containerH);

    if (faceBoxes.length === 0) return;

    // A imagem da câmera é 1280x720 (aprox), o canvas tem dimensões do container
    // Precisamos escalar as coordenadas
    const imgNaturalW = img.naturalWidth || 1280;
    const imgNaturalH = img.naturalHeight || 720;

    // object-cover: calcula a escala e offset para cobrir o container
    const scaleX = containerW / imgNaturalW;
    const scaleY = containerH / imgNaturalH;
    const scale = Math.max(scaleX, scaleY);
    const offsetX = (containerW - imgNaturalW * scale) / 2;
    const offsetY = (containerH - imgNaturalH * scale) / 2;

    for (const box of faceBoxes) {
      const color = SATISFACTION_COLORS[box.satisfaction];
      const x = box.x * scale + offsetX;
      const y = box.y * scale + offsetY;
      const w = box.width * scale;
      const h = box.height * scale;

      // Retângulo
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Fundo do label
      const label = `${SATISFACTION_EMOJIS[box.satisfaction]} ${Math.round(box.confidence * 100)}%`;
      ctx.font = 'bold 11px sans-serif';
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = color + 'cc';
      ctx.fillRect(x, y - 18, textW + 8, 18);

      // Texto do label
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 4, y - 4);
    }
  }, [faceBoxes, ipConnected]);

  // ── Inicia o worker permanente no servidor e o polling de exibição ──────────

  const connectIpCamera = useCallback(async () => {
    const id = config?.unitId ?? unitId;
    if (!id) return;

    try {
      await fetch(`/api/vip-cam/worker/${id}/start`, { method: 'POST' });
      console.log('[IP Camera] Worker iniciado no servidor para unidade', id);
    } catch (e) {
      console.warn('[IP Camera] Falha ao iniciar worker:', e);
    }

    startIpPolling(id);
  }, [config, unitId]);

  // ── Polling de snapshots para exibição ──────

  const startIpPolling = useCallback((id: number) => {
    if (ipPollingRef.current) {
      clearInterval(ipPollingRef.current);
      ipPollingRef.current = null;
    }
    console.log('[IP Camera] Iniciando polling de snapshots...');
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const resp = await fetch(`/api/vip-cam/stream/${id}/snapshot`, { cache: 'no-store' });
        if (!resp.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 5) setIpConnected(false);
          return;
        }
        const blob = await resp.blob();
        if (blob.size < 100) return;
        consecutiveErrors = 0;
        setIpConnected(true);
        const newUrl = URL.createObjectURL(blob);
        if (ipImgRef.current) ipImgRef.current.src = newUrl;
        if (ipBlobUrlRef.current) URL.revokeObjectURL(ipBlobUrlRef.current);
        ipBlobUrlRef.current = newUrl;
      } catch (e) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) setIpConnected(false);
      }
    };

    poll();
    ipPollingRef.current = setInterval(poll, 400);
  }, []);

  // ── Auto-iniciar câmera IP ao montar (worker já roda no servidor) ──

  useEffect(() => {
    if (cameraType !== 'ip') return;
    const id = config?.unitId ?? unitId;
    if (!id) return;
    // Para câmera IP, auto-conectar sem precisar clicar no botão
    // O worker já está rodando no servidor independentemente do browser
    fetch('/api/vip-cam/streams/status')
      .then(r => r.json())
      .then((data: { streams: Array<{ unitId: number; running: boolean; hasFrame: boolean }> }) => {
        const ws = data.streams.find(s => s.unitId === id);
        if (ws?.running) {
          console.log('[IP Camera] Worker ativo — auto-conectando exibição...');
          setCameraActive(true);
          startIpPolling(id);
        } else {
          // Worker não está rodando — tentar iniciar
          fetch(`/api/vip-cam/worker/${id}/start`, { method: 'POST' })
            .then(() => {
              setCameraActive(true);
              startIpPolling(id);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraType, config?.unitId, unitId]);

  // ── Renderização ────────────────────────────

  const isUSB = cameraType === 'usb';
  const isIP = cameraType === 'ip';

  return (
    <div className="flex flex-col gap-4">
      {/* Status dos modelos de IA — apenas para câmera USB */}
      {isUSB && faceApiStatus === 'idle' && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Clique em "Iniciar Câmera" para carregar os modelos de IA e ativar o reconhecimento facial.
          </AlertDescription>
        </Alert>
      )}
      {isUSB && faceApiStatus === 'loading' && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando modelos de IA... (pode levar alguns segundos na primeira vez)
          </AlertDescription>
        </Alert>
      )}
      {isUSB && faceApiStatus === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>Erro ao carregar IA: {faceApiError}</AlertDescription>
        </Alert>
      )}
      {cameraError && (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="flex flex-col gap-2">
              <span>{cameraError}</span>
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-white/30 text-white hover:bg-white/10 h-7 text-xs"
                  onClick={async () => {
                    setCameraError(null);
                    await listCameras();
                    await loadModels();
                    await startUSBCamera();
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />Tentar Novamente
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Controles de câmera USB */}
      {isUSB && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={selectedCameraId || undefined}
              onValueChange={(val) => {
                setSelectedCameraId(val);
                if (cameraActive) {
                  stopCamera();
                  setTimeout(() => startUSBCamera(), 300);
                }
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecionar câmera..." />
              </SelectTrigger>
              <SelectContent>
                {availableCameras.filter(cam => !!cam.deviceId).length === 0 ? (
                  <SelectItem value="__none__" disabled>Nenhuma câmera detectada</SelectItem>
                ) : (
                  availableCameras
                    .filter(cam => !!cam.deviceId)
                    .map((cam, idx) => (
                      <SelectItem key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Câmera ${idx + 1}`}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
                  tmp.getTracks().forEach(t => t.stop());
                } catch { /* ignora */ }
                await listCameras(true);
              }}
              title="Atualizar lista de câmeras"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {!cameraActive ? (
              <Button
                onClick={async () => {
                  await loadModels();
                  await listCameras(true);
                  await startUSBCamera();
                }}
                disabled={faceApiStatus === 'loading'}
              >
                {faceApiStatus === 'loading' ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Carregando IA...</>
                ) : (
                  <><Camera className="h-4 w-4 mr-2" />Iniciar Câmera</>
                )}
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopCamera}>
                <CameraOff className="h-4 w-4 mr-2" />Parar Câmera
              </Button>
            )}
          </div>

          {!cameraActive && availableCameras.filter(c => !!c.deviceId).length <= 1 && (
            <p className="text-xs text-muted-foreground">
              💡 Se a câmera USB não aparecer, conecte-a e clique em <strong>🔄</strong> para atualizar a lista.
            </p>
          )}
        </div>
      )}

      {/* Controles de câmera IP */}
      {isIP && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {ipConnected ? (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <Wifi className="h-3 w-3 mr-1" />Câmera IP Conectada
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-500 border-red-500">
                  <WifiOff className="h-3 w-3 mr-1" />Câmera IP Desconectada
                </Badge>
              )}
              {/* Badge de captura automática server-side */}
              {workerStatus?.running && (
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  <Bot className="h-3 w-3 mr-1" />
                  Captura automática ativa
                  {workerStatus.totalCapturesSaved > 0 && ` · ${workerStatus.totalCapturesSaved} salvas`}
                </Badge>
              )}
            </div>
            {!cameraActive ? (
              <Button
                onClick={async () => {
                  if (!config?.rtspUrl) {
                    toast.error('Configure a URL da câmera IP nas configurações');
                    return;
                  }
                  setCameraActive(true);
                  await connectIpCamera();
                }}
              >
                <Camera className="h-4 w-4 mr-2" />Conectar Câmera IP
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopCamera}>
                <CameraOff className="h-4 w-4 mr-2" />Desconectar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={async () => {
              stopCamera();
              await new Promise(r => setTimeout(r, 500));
              if (config?.rtspUrl) {
                setCameraActive(true);
                await connectIpCamera();
              }
            }}>
              <RefreshCw className="h-4 w-4 mr-1" />Reconectar
            </Button>
          </div>

          {/* Informações do worker server-side */}
          {workerStatus && cameraActive && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span>Uptime: {Math.floor(workerStatus.uptime / 60)}min</span>
              {workerStatus.lastDetectionAt > 0 && (
                <span>
                  Última detecção: {new Date(workerStatus.lastDetectionAt).toLocaleTimeString('pt-BR')}
                  {workerStatus.lastDetectionCount > 0 && ` (${workerStatus.lastDetectionCount} face${workerStatus.lastDetectionCount > 1 ? 's' : ''})`}
                </span>
              )}
              <span className="text-blue-600 font-medium">
                Reconhecimento facial automático no servidor — sem necessidade do browser aberto
              </span>
            </div>
          )}
        </div>
      )}

      {/* Visualização da câmera */}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '480px' }}>
        {/* Câmera USB */}
        {isUSB && (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            style={{ display: cameraActive ? 'block' : 'none' }}
          />
        )}

        {/* Câmera IP — frames via polling de snapshots do worker permanente */}
        {isIP && cameraActive && (
          <div ref={ipContainerRef} className="w-full h-full relative flex items-center justify-center">
            <img
              ref={ipImgRef}
              src={undefined}
              className="w-full h-full object-cover"
              alt="Câmera IP"
              style={{ display: ipConnected ? 'block' : 'none' }}
            />
            {/* Canvas overlay para face boxes — posicionado sobre a imagem */}
            {ipConnected && (
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%' }}
              />
            )}
            {!ipConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
                <p className="text-xs">Conectando câmera...</p>
              </div>
            )}
          </div>
        )}

        {/* Placeholder quando câmera inativa */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-3">
            <Camera className="h-16 w-16 opacity-30" />
            <p className="text-sm opacity-60">
              {isUSB ? 'Câmera inativa' : 'Câmera IP desconectada'}
            </p>
            {isIP && (
              <p className="text-xs opacity-40 text-center px-4">
                O reconhecimento facial continua ativo no servidor mesmo sem o browser aberto
              </p>
            )}
          </div>
        )}

        {/* Overlay de status — USB: contador de capturas / IP: indicador server-side */}
        {cameraActive && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <Badge className="bg-black/70 text-white text-xs">
              🔴 AO VIVO
            </Badge>
            {isUSB && faceApiStatus === 'ready' && (
              <Badge className="bg-black/70 text-white text-xs">
                {detectionCount} capturas
              </Badge>
            )}
            {isIP && workerStatus?.running && (
              <Badge className="bg-blue-900/80 text-blue-200 text-xs">
                <Bot className="h-3 w-3 mr-1" />IA no servidor
              </Badge>
            )}
          </div>
        )}

        {/* Resultado da última detecção (USB only — IP salva direto no servidor) */}
        {isUSB && lastDetection && cameraActive && (
          <div
            className="absolute bottom-2 left-2 right-2 rounded-lg p-3 text-white text-sm"
            style={{ backgroundColor: SATISFACTION_COLORS[lastDetection.satisfactionLevel] + 'cc' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">{SATISFACTION_EMOJIS[lastDetection.satisfactionLevel]}</span>
              <div>
                <p className="font-semibold">{SATISFACTION_LABELS[lastDetection.satisfactionLevel]}</p>
                <p className="text-xs opacity-90">
                  {lastDetection.isNew ? '✨ Novo cliente' : `Cliente #${lastDetection.clienteId}`}
                  {' · '}{Math.round(lastDetection.confidence * 100)}% confiança
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Canvas oculto para captura de frames USB */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video oculto (referência para câmera USB) */}
      {isIP && <video ref={videoRef} className="hidden" autoPlay muted playsInline />}
    </div>
  );
}
