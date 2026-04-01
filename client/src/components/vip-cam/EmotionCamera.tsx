/**
 * EmotionCamera — Componente de câmera ao vivo com reconhecimento facial.
 *
 * Suporta:
 * - Webcam USB via getUserMedia (modo "usb")
 * - Câmera IP via snapshot MJPEG/HTTP (modo "ip")
 *
 * Lógica de detecção:
 * - Loop a ~4 FPS (250ms)
 * - Buffer de 1.5s para acumular expressões e descriptors
 * - Cooldown de 4s após cada captura
 * - Cache de descritores recarregado a cada 60s
 * - Threshold de matching: 0.55
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
import { Loader2, Camera, CameraOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
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

// ─────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────

export function EmotionCamera({ unitId, config, onDetection }: EmotionCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ipImgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureBufferRef = useRef<{ expressions: ExpressionScores[]; descriptors: Float32Array[] }>({ expressions: [], descriptors: [] });
  const captureWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false);
  const isCapturingRef = useRef(false);
  const clientCacheRef = useRef<Array<{ id: number; faceDescriptor: number[] | null }>>([]);

  const { status: faceApiStatus, error: faceApiError, loadModels } = useFaceApi();

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [lastDetection, setLastDetection] = useState<DetectionResult | null>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [ipConnected, setIpConnected] = useState(false);

  const cameraType = config?.cameraType ?? 'usb';
  const cooldownMs = (config?.cooldownSeconds ?? 4) * 1000;
  const captureWindowMs = config?.captureWindowMs ?? 1500;

  // ── tRPC mutations ──────────────────────────

  const saveCaptureM = trpc.vipCam.saveCapture.useMutation();
  const uploadImageM = trpc.vipCam.uploadFaceImage.useMutation();

  // ── Cache de descritores ────────────────────

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

  // ── Listar câmeras disponíveis ──────────────

  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);

      // Preferência por câmeras externas/USB
      const preferred = videoDevices.find(d =>
        /usb|logitech|c920|external|webcam/i.test(d.label)
      );
      if (preferred) {
        setSelectedCameraId(preferred.deviceId);
      } else if (videoDevices.length > 0) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch {
      // Sem permissão ainda — ok
    }
  }, []);

  // ── Iniciar câmera USB ──────────────────────

  const startUSBCamera = useCallback(async () => {
    try {
      setCameraError(null);

      // Tentar 1080p primeiro
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        // Fallback sem restrições
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Recarregar lista de câmeras com labels (após permissão)
      await listCameras();
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao acessar câmera';
      setCameraError(msg);
      toast.error('Erro ao iniciar câmera: ' + msg);
    }
  }, [selectedCameraId, listCameras]);

  // ── Parar câmera ────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    if (captureWindowRef.current) clearTimeout(captureWindowRef.current);
    setCameraActive(false);
  }, []);

  // ── Capturar frame como base64 ──────────────

  const captureFrame = useCallback((): string | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  // ── Processar captura final (após buffer de 1.5s) ──

  const processFinalCapture = useCallback(async () => {
    const buffer = captureBufferRef.current;
    if (buffer.expressions.length === 0 || buffer.descriptors.length === 0) {
      isCapturingRef.current = false;
      return;
    }

    // Média das expressões
    const avgExpressions = averageExpressions(buffer.expressions);
    const { satisfactionLevel, dominantExpression } = classifyExpression(avgExpressions);

    // Média dos descritores
    const avgDescriptor = new Float32Array(buffer.descriptors[0].length);
    for (const d of buffer.descriptors) {
      for (let i = 0; i < d.length; i++) avgDescriptor[i] += d[i];
    }
    for (let i = 0; i < avgDescriptor.length; i++) {
      avgDescriptor[i] /= buffer.descriptors.length;
    }

    // Encontrar cliente no cache
    const match = findMatchingClient(avgDescriptor, clientCacheRef.current);

    // Capturar imagem do rosto
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

    // Salvar no banco
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

      // Atualizar cache local imediatamente
      if (saved.isNewCliente) {
        clientCacheRef.current.push({
          id: saved.clienteId,
          faceDescriptor: Array.from(avgDescriptor),
        });
      } else {
        const idx = clientCacheRef.current.findIndex(c => c.id === saved.clienteId);
        if (idx >= 0) {
          // Atualizar descriptor no cache: 70% velho + 30% novo
          const old = clientCacheRef.current[idx].faceDescriptor ?? [];
          if (old.length === avgDescriptor.length) {
            clientCacheRef.current[idx].faceDescriptor = old.map((v, i) => v * 0.7 + avgDescriptor[i] * 0.3);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao salvar captura:', err);
    }

    // Limpar buffer e ativar cooldown
    captureBufferRef.current = { expressions: [], descriptors: [] };
    isCapturingRef.current = false;
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, cooldownMs);
  }, [unitId, captureFrame, saveCaptureM, uploadImageM, onDetection, cooldownMs]);

  // ── Loop de detecção ────────────────────────

  const runDetection = useCallback(async () => {
    if (cooldownRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.25 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

      if (!detection) {
        // Sem rosto: cancelar captura em andamento
        if (isCapturingRef.current) {
          if (captureWindowRef.current) clearTimeout(captureWindowRef.current);
          captureBufferRef.current = { expressions: [], descriptors: [] };
          isCapturingRef.current = false;
        }
        return;
      }

      const { expressions, descriptor } = detection;

      if (!isCapturingRef.current) {
        // Iniciar janela de captura de 1.5s
        isCapturingRef.current = true;
        captureBufferRef.current = { expressions: [], descriptors: [] };

        captureWindowRef.current = setTimeout(() => {
          processFinalCapture();
        }, captureWindowMs);
      }

      // Acumular no buffer
      captureBufferRef.current.expressions.push(expressions as unknown as ExpressionScores);
      captureBufferRef.current.descriptors.push(descriptor);

    } catch {
      // Ignorar erros de detecção individuais
    }
  }, [processFinalCapture, captureWindowMs]);

  // ── Iniciar detecção quando câmera ativa ────

  useEffect(() => {
    if (!cameraActive || faceApiStatus !== 'ready') return;

    // Carregar cache inicial
    loadCache();

    // Loop de detecção a 4 FPS
    detectionIntervalRef.current = setInterval(runDetection, 250);

    // Recarregar cache a cada 60s
    cacheIntervalRef.current = setInterval(loadCache, 60_000);

    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    };
  }, [cameraActive, faceApiStatus, runDetection, loadCache]);

  // ── Construir URL da câmera IP ──────────────

  const buildIpCameraUrl = useCallback(() => {
    if (!config?.rtspUrl) return null;
    let url = config.rtspUrl;
    // Se tiver login/senha, injetar na URL
    if (config.rtspLogin && config.rtspPassword) {
      try {
        const parsed = new URL(url);
        parsed.username = config.rtspLogin;
        parsed.password = config.rtspPassword;
        url = parsed.toString();
      } catch {
        // URL inválida
      }
    }
    return url;
  }, [config]);

  // ── Renderização ────────────────────────────

  const isUSB = cameraType === 'usb';
  const isIP = cameraType === 'ip';

  return (
    <div className="flex flex-col gap-4">
      {/* Status dos modelos de IA */}
      {faceApiStatus === 'idle' && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Clique em "Iniciar Câmera" para carregar os modelos de IA e ativar o reconhecimento facial.
          </AlertDescription>
        </Alert>
      )}
      {faceApiStatus === 'loading' && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando modelos de IA... (pode levar alguns segundos na primeira vez)
          </AlertDescription>
        </Alert>
      )}
      {faceApiStatus === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>Erro ao carregar IA: {faceApiError}</AlertDescription>
        </Alert>
      )}
      {cameraError && (
        <Alert variant="destructive">
          <AlertDescription>{cameraError}</AlertDescription>
        </Alert>
      )}

      {/* Controles de câmera USB */}
      {isUSB && (
        <div className="flex items-center gap-2 flex-wrap">
          {availableCameras.filter(cam => !!cam.deviceId).length > 0 && (
            <Select value={selectedCameraId || undefined} onValueChange={setSelectedCameraId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecionar câmera" />
              </SelectTrigger>
              <SelectContent>
                {availableCameras
                  .filter(cam => !!cam.deviceId)
                  .map((cam, idx) => (
                    <SelectItem key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Câmera ${idx + 1}`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {!cameraActive ? (
            <Button
              onClick={async () => {
                await listCameras();
                await loadModels();
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
      )}

      {/* Controles de câmera IP */}
      {isIP && (
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
          </div>
          {!cameraActive ? (
            <Button
              onClick={async () => {
                await loadModels();
                const url = buildIpCameraUrl();
                if (!url) {
                  toast.error('Configure a URL da câmera IP nas configurações');
                  return;
                }
                setIpConnected(true);
                setCameraActive(true);
              }}
              disabled={faceApiStatus === 'loading'}
            >
              {faceApiStatus === 'loading' ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Carregando IA...</>
              ) : (
                <><Camera className="h-4 w-4 mr-2" />Conectar Câmera IP</>
              )}
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopCamera}>
              <CameraOff className="h-4 w-4 mr-2" />Desconectar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={async () => {
            stopCamera();
            await new Promise(r => setTimeout(r, 500));
            const url = buildIpCameraUrl();
            if (url) { setIpConnected(true); setCameraActive(true); }
          }}>
            <RefreshCw className="h-4 w-4 mr-1" />Reconectar
          </Button>
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

        {/* Câmera IP — snapshot via img tag (MJPEG/HTTP) */}
        {isIP && cameraActive && (
          <div className="w-full h-full flex items-center justify-center">
            <img
              ref={ipImgRef}
              src={buildIpCameraUrl() ?? ''}
              className="w-full h-full object-cover"
              alt="Câmera IP"
              onLoad={() => setIpConnected(true)}
              onError={() => setIpConnected(false)}
            />
            {/* Canvas oculto para captura de frames da câmera IP */}
            <video
              ref={videoRef}
              className="hidden"
              autoPlay
              muted
              playsInline
            />
          </div>
        )}

        {/* Placeholder quando câmera inativa */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-3">
            <Camera className="h-16 w-16 opacity-30" />
            <p className="text-sm opacity-60">
              {isUSB ? 'Câmera inativa' : 'Câmera IP desconectada'}
            </p>
          </div>
        )}

        {/* Overlay de detecção */}
        {cameraActive && faceApiStatus === 'ready' && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <Badge className="bg-black/70 text-white text-xs">
              🔴 AO VIVO
            </Badge>
            <Badge className="bg-black/70 text-white text-xs">
              {detectionCount} capturas
            </Badge>
          </div>
        )}

        {/* Resultado da última detecção */}
        {lastDetection && cameraActive && (
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

      {/* Canvas oculto para captura de frames */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
