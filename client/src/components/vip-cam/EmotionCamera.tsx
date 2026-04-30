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
  unitId?: number | null;        // ID da unidade — usado para montar a URL do proxy MJPEG
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
  const ipWsRef = useRef<WebSocket | null>(null);       // WebSocket para câmera IP
  const ipBlobUrlRef = useRef<string | null>(null);     // URL do último frame recebido
  const ipPollingRef = useRef<ReturnType<typeof setInterval> | null>(null); // Polling fallback
  const ipFrameCountRef = useRef(0);                    // Frames recebidos via WS
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
  }, [refetchDescriptors]);  // ── Listar câmeras disponíveis ──────────────────

  const listCameras = useCallback(async (autoSelect = true) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      if (!autoSelect) return;
      // Preferência por câmeras externas/USB (pelo label ou por ser a última da lista)
      const preferred = videoDevices.find(d =>
        /usb|logitech|c920|c930|c270|c615|brio|external|webcam|hd pro|hd cam/i.test(d.label)
      );
      if (preferred) {
        setSelectedCameraId(preferred.deviceId);
      } else if (videoDevices.length > 0 && !selectedCameraId) {
        // Não sobrescrever seleção manual do usuário
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch {
      // Sem permissão ainda — ok
    }
  }, [selectedCameraId]);

  // Listar câmeras ao montar o componente (sem labels ainda, mas mostra quantas há)
  useEffect(() => {
    listCameras();
    // Escutar mudanças de dispositivos (USB conectado/desconectado)
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

    // Estratégia de retry em 4 etapas
    const attempts: (() => Promise<MediaStream>)[] = [
      // 1. deviceId exato + resolução ideal
      ...(selectedCameraId ? [() => navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })] : []),
      // 2. deviceId exato sem restrição de resolução
      ...(selectedCameraId ? [() => navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCameraId } },
      })] : []),
      // 3. qualquer câmera com resolução ideal
      () => navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      }),
      // 4. mínimo absoluto
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
        // Se for NotReadableError não adianta tentar outras configurações do mesmo device
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
    // Fecha WebSocket da câmera IP se estiver aberto
    if (ipWsRef.current) {
      ipWsRef.current.close();
      ipWsRef.current = null;
    }
    // Para polling se estiver ativo
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
  }, []);

  // ── Capturar frame como base64 ──────────────

  const captureFrame = useCallback((): string | null => {
    const canvas = canvasRef.current;
    // Para câmera IP, capturar da tag <img> (frame MJPEG atual)
    const source: HTMLVideoElement | HTMLImageElement | null =
      cameraType === 'ip' ? ipImgRef.current : videoRef.current;
    if (!canvas || !source) return null;
    canvas.width = (source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth) || 640;
    canvas.height = (source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight) || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [cameraType]);

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
    // Para câmera IP (MJPEG), usar a tag <img> como fonte; para USB, usar <video>
    const source: HTMLVideoElement | HTMLImageElement | null =
      cameraType === 'ip' ? ipImgRef.current : videoRef.current;
    if (!source) return;
    // Para <video>, verificar readyState; para <img> verificar se carregou
    if (source instanceof HTMLVideoElement && source.readyState < 2) return;
    if (source instanceof HTMLImageElement && !source.complete) return;

    try {
      const detection = await faceapi
        .detectSingleFace(source as HTMLVideoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.45 }))
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
  }, [processFinalCapture, captureWindowMs, cameraType]);

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

  // ── WebSocket para câmera IP ──────────────
  // Usa WebSocket em vez de MJPEG over HTTP para contornar o buffering do Cloudflare/HTTP2.
  // O servidor envia cada frame como ArrayBuffer (binário JPEG).
  // O frontend exibe via URL.createObjectURL em uma tag <img>.
  const buildIpCameraUrl = useCallback(() => {
    if (!config?.rtspUrl) return null;
    const id = config.unitId ?? unitId;
    if (!id) return null;
    return `/api/vip-cam/stream/${id}`; // mantido para compatibilidade
  }, [config, unitId]);

  const connectIpCameraWs = useCallback(() => {
    const id = config?.unitId ?? unitId;
    if (!id) return;
    // Fecha conexão anterior
    if (ipWsRef.current) {
      ipWsRef.current.close();
      ipWsRef.current = null;
    }
    // Monta URL do WebSocket
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/vip-cam/ws/${id}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ipWsRef.current = ws;

    ws.onopen = () => {
      console.log('[IP Camera] WebSocket conectado');
      setIpConnected(true);
    };

    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      ipFrameCountRef.current += 1;
      // Cria Blob JPEG e atualiza a tag <img>
      const blob = new Blob([event.data], { type: 'image/jpeg' });
      const newUrl = URL.createObjectURL(blob);
      if (ipImgRef.current) {
        ipImgRef.current.src = newUrl;
      }
      // Libera URL anterior para evitar vazamento de memória
      if (ipBlobUrlRef.current) {
        URL.revokeObjectURL(ipBlobUrlRef.current);
      }
      ipBlobUrlRef.current = newUrl;
    };

    ws.onerror = (err) => {
      console.error('[IP Camera] WebSocket erro:', err);
      setIpConnected(false);
    };

    ws.onclose = (event) => {
      console.log('[IP Camera] WebSocket fechado:', event.code, event.reason, 'frames recebidos:', ipFrameCountRef.current);
      setIpConnected(false);
      ipWsRef.current = null;
      // Se fechou sem receber nenhum frame, ativar polling como fallback
      if (ipFrameCountRef.current === 0) {
        console.log('[IP Camera] WebSocket não enviou frames, ativando polling de snapshots...');
        startIpPolling(id);
      } else {
        // Libera URL do último frame
        if (ipBlobUrlRef.current) {
          URL.revokeObjectURL(ipBlobUrlRef.current);
          ipBlobUrlRef.current = null;
        }
      }
    };
  }, [config, unitId]);

  // ── Polling de snapshots (fallback quando WebSocket não funciona) ──────────
  const startIpPolling = useCallback((id: number) => {
    if (ipPollingRef.current) return; // já está rodando
    console.log('[IP Camera] Iniciando polling de snapshots (~2fps)...');
    setIpConnected(true);
    const poll = async () => {
      try {
        const resp = await fetch(`/api/vip-cam/stream/${id}/snapshot`, { cache: 'no-store' });
        if (!resp.ok) {
          console.warn('[IP Camera] Snapshot falhou:', resp.status);
          return;
        }
        const blob = await resp.blob();
        if (blob.size < 100) return; // frame inválido
        const newUrl = URL.createObjectURL(blob);
        if (ipImgRef.current) {
          ipImgRef.current.src = newUrl;
        }
        if (ipBlobUrlRef.current) URL.revokeObjectURL(ipBlobUrlRef.current);
        ipBlobUrlRef.current = newUrl;
      } catch (e) {
        console.warn('[IP Camera] Polling erro:', e);
      }
    };
    poll(); // primeiro frame imediatamente
    ipPollingRef.current = setInterval(poll, 500); // ~2fps
  }, []);

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
            {/* Seletor de câmera — sempre visível */}
            <Select
              value={selectedCameraId || undefined}
              onValueChange={(val) => {
                setSelectedCameraId(val);
                // Se a câmera já está ativa, reiniciar com a nova câmera
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

            {/* Botão atualizar lista (após conectar USB) */}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                // Pedir permissão rápida para obter labels completos
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

          {/* Dica quando há apenas uma câmera (provavelmente a interna) */}
          {!cameraActive && availableCameras.filter(c => !!c.deviceId).length <= 1 && (
            <p className="text-xs text-muted-foreground">
              💡 Se a câmera USB não aparecer, conecte-a e clique em <strong>🔄</strong> para atualizar a lista.
            </p>
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
                if (!config?.rtspUrl) {
                  toast.error('Configure a URL da câmera IP nas configurações');
                  return;
                }
                setCameraActive(true);
                connectIpCameraWs();
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
            if (config?.rtspUrl) {
              setCameraActive(true);
              connectIpCameraWs();
            }
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

        {/* Câmera IP — frames via WebSocket (o src é controlado pelo connectIpCameraWs) */}
        {isIP && cameraActive && (
          <div className="w-full h-full relative flex items-center justify-center">
            {/* A tag img começa sem src; o WebSocket atualiza ipImgRef.current.src a cada frame */}
            <img
              ref={ipImgRef}
              src=""
              className="w-full h-full object-cover"
              alt="Câmera IP"
              style={{ display: ipConnected ? 'block' : 'none' }}
            />
            {!ipConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
                <p className="text-xs">Conectando câmera...</p>
              </div>
            )}
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
