/**
 * VIP Cam — Configurações de câmera (USB ou IP com RTSP/RTSPS).
 */
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, Wifi, Save, Info } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { toast } from 'sonner';

export default function CamConfigPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.orgId ?? 0;

  const [cameraType, setCameraType] = useState<'usb' | 'ip'>('usb');
  const [rtspUrl, setRtspUrl] = useState('');
  const [rtspLogin, setRtspLogin] = useState('');
  const [rtspPassword, setRtspPassword] = useState('');
  const [rtspProtocol, setRtspProtocol] = useState<'rtsp' | 'rtsps'>('rtsp');
  const [active, setActive] = useState(true);
  const [detectionThreshold, setDetectionThreshold] = useState('0.55');
  const [cooldownSeconds, setCooldownSeconds] = useState(4);
  const [captureWindowMs, setCaptureWindowMs] = useState(1500);

  const { data: config } = trpc.vipCam.getCameraConfig.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  useEffect(() => {
    if (config) {
      setCameraType(config.cameraType as 'usb' | 'ip');
      setRtspUrl(config.rtspUrl ?? '');
      setRtspLogin(config.rtspLogin ?? '');
      setRtspPassword(config.rtspPassword ?? '');
      setRtspProtocol((config.rtspProtocol ?? 'rtsp') as 'rtsp' | 'rtsps');
      setActive(config.active ?? true);
      setDetectionThreshold(config.detectionThreshold ?? '0.55');
      setCooldownSeconds(config.cooldownSeconds ?? 4);
      setCaptureWindowMs(config.captureWindowMs ?? 1500);
    }
  }, [config]);

  const saveConfig = trpc.vipCam.saveCameraConfig.useMutation({
    onSuccess: () => toast.success('Configurações salvas com sucesso!'),
    onError: (e) => toast.error('Erro ao salvar: ' + e.message),
  });

  const handleSave = () => {
    saveConfig.mutate({
      unitId,
      cameraType,
      rtspUrl: rtspUrl || undefined,
      rtspLogin: rtspLogin || undefined,
      rtspPassword: rtspPassword || undefined,
      rtspProtocol,
      active,
      detectionThreshold,
      cooldownSeconds,
      captureWindowMs,
    });
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Configurações VIP Cam" />
        <Alert><AlertDescription>Selecione uma unidade para configurar a câmera.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Configurações VIP Cam" description="Configure a câmera de reconhecimento facial" />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" />Tipo de Câmera
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCameraType('usb')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${cameraType === 'usb' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
            >
              <Camera className="h-6 w-6 mb-2 text-primary" />
              <p className="font-medium text-sm">Webcam USB</p>
              <p className="text-xs text-muted-foreground mt-1">Câmera conectada diretamente ao computador via USB</p>
              {cameraType === 'usb' && <Badge className="mt-2 text-xs">Selecionado</Badge>}
            </button>
            <button
              onClick={() => setCameraType('ip')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${cameraType === 'ip' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
            >
              <Wifi className="h-6 w-6 mb-2 text-primary" />
              <p className="font-medium text-sm">Câmera IP</p>
              <p className="text-xs text-muted-foreground mt-1">Câmera de segurança via rede (RTSP/RTSPS)</p>
              {cameraType === 'ip' && <Badge className="mt-2 text-xs">Selecionado</Badge>}
            </button>
          </div>
        </CardContent>
      </Card>

      {cameraType === 'ip' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4" />Câmera IP — Conexão RTSP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Insira o endereço da câmera. O login e senha serão injetados automaticamente na URL de conexão.
                Formato: <code className="bg-muted px-1 rounded">192.168.1.100:554/stream</code>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Protocolo</Label>
              <Select value={rtspProtocol} onValueChange={v => setRtspProtocol(v as 'rtsp' | 'rtsps')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtsp">RTSP (padrão)</SelectItem>
                  <SelectItem value="rtsps">RTSPS (criptografado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL da Câmera</Label>
              <Input placeholder="ex: rtsp://192.168.1.100:554/stream1" value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Login (opcional)</Label>
                <Input placeholder="usuário" value={rtspLogin} onChange={e => setRtspLogin(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Senha (opcional)</Label>
                <Input type="password" placeholder="senha" value={rtspPassword} onChange={e => setRtspPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Parâmetros de Detecção</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Câmera ativa</Label>
              <p className="text-xs text-muted-foreground">Habilitar reconhecimento facial nesta unidade</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Threshold de matching</Label>
              <Input type="number" min="0.3" max="0.9" step="0.05" value={detectionThreshold} onChange={e => setDetectionThreshold(e.target.value)} />
              <p className="text-xs text-muted-foreground">0.55 = padrão (menor = mais rigoroso)</p>
            </div>
            <div className="space-y-2">
              <Label>Cooldown (segundos)</Label>
              <Input type="number" min="1" max="60" value={cooldownSeconds} onChange={e => setCooldownSeconds(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Tempo mínimo entre capturas do mesmo rosto</p>
            </div>
            <div className="space-y-2">
              <Label>Janela de captura (ms)</Label>
              <Input type="number" min="500" max="5000" step="100" value={captureWindowMs} onChange={e => setCaptureWindowMs(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Tempo para acumular frames antes de classificar</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveConfig.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveConfig.isPending ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}
