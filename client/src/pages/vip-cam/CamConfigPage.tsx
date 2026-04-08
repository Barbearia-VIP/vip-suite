/**
 * VIP Cam — Configurações de câmera (USB ou IP com RTSP/RTSPS).
 */
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, Wifi, Save, Info, RefreshCw, History, Clock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { toast } from 'sonner';

export default function CamConfigPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

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
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Configurações VIP Cam" description="Configure a câmera de reconhecimento facial" />

      <div className="glass-card">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" />Tipo de Câmera
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCameraType('usb')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${cameraType === 'usb' ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-muted-foreground/30'}`}
            >
              <Camera className="h-6 w-6 mb-2 text-primary" />
              <p className="font-medium text-sm">Webcam USB</p>
              <p className="text-xs text-muted-foreground mt-1">Câmera conectada diretamente ao computador via USB</p>
              {cameraType === 'usb' && <Badge className="mt-2 text-xs">Selecionado</Badge>}
            </button>
            <button
              onClick={() => setCameraType('ip')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${cameraType === 'ip' ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-muted-foreground/30'}`}
            >
              <Wifi className="h-6 w-6 mb-2 text-primary" />
              <p className="font-medium text-sm">Câmera IP</p>
              <p className="text-xs text-muted-foreground mt-1">Câmera de segurança via rede (RTSP/RTSPS)</p>
              {cameraType === 'ip' && <Badge className="mt-2 text-xs">Selecionado</Badge>}
            </button>
          </div>
        </div>
      </div>

      {cameraType === 'ip' && (
        <div className="glass-card">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4" />Câmera IP — Conexão RTSP
            </h3>
          </div>
          <div className="p-6 pt-0 space-y-4">
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
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="p-6 pb-2 pb-3"><h3 className="font-semibold text-foreground text-sm">Parâmetros de Detecção</h3></div>
        <div className="p-6 pt-0 space-y-4">
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
        </div>
      </div>

      {/* Card de Manutenção — Recálculo em lote da satisfação */}
      <div className="glass-card border-amber-500/30 bg-amber-500/5">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-500" />
            Recalcular Satisfação dos Clientes
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Reaplica a regra de prioridade positiva (SenseVIP) em todos os clientes desta unidade,
            usando o histórico completo de capturas. Use após importar dados históricos ou
            quando suspeitar que o status de algum cliente está incorreto.
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>Regra:</strong> Se teve ao menos 1 captura satisfeita → Satisfeito permanente.
            Se neutros ≥ insatisfeitos → Neutro. Caso contrário → Insatisfeito.
          </p>
          <RecalcButton unitId={unitId} />

          {/* Histórico de recálculos */}
          <div className="pt-3 border-t border-amber-500/20">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5 mb-2">
              <History className="h-3.5 w-3.5" />
              Histórico de Recálculos
            </p>
            <RecalcHistory unitId={unitId} />
          </div>
        </div>
      </div>

      {/* Card de Reclassificação Histórica com Novos Thresholds */}
      <div className="glass-card border-blue-500/30 bg-blue-500/5">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-blue-400" />
            Reclassificar Histórico com Nova Lógica
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Reavalia <strong>cada captura histórica</strong> da timeline usando a expressão dominante
            e os novos thresholds calibrados para o modelo face-api: angry ≥ 0.55, disgusted ≥ 0.50,
            sad ≥ 0.60 (com happy &lt; 0.15), happy ≥ 0.35. Após reclassificar a timeline, recalcula
            o status final de todos os clientes com a regra de prioridade positiva (SenseVIP).
          </p>
          <Alert className="border-blue-500/30 bg-blue-500/10 py-2">
            <AlertDescription className="text-xs text-blue-300">
              Execute após a atualização dos thresholds para corrigir registros históricos classificados
              incorretamente como insatisfeitos.
            </AlertDescription>
          </Alert>
          <ReclassifyHistoryButton unitId={unitId} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveConfig.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveConfig.isPending ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}

function RecalcButton({ unitId }: { unitId: number }) {
  const utils = trpc.useUtils();
  const recalc = trpc.vipCam.recalcAllClients.useMutation({
    onSuccess: (data) => {
      toast.success(`Recálculo concluído: ${data.updated} de ${data.total} clientes atualizados.`);
      utils.vipCam.getRecalcHistory.invalidate({ unitId });
    },
    onError: (err) => {
      toast.error(`Erro no recálculo: ${err.message}`);
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
      onClick={() => recalc.mutate({ unitId, orgId: unitId })}
      disabled={recalc.isPending || unitId === 0}
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${recalc.isPending ? 'animate-spin' : ''}`} />
      {recalc.isPending ? 'Recalculando...' : 'Recalcular Agora'}
    </Button>
  );
}

function ReclassifyHistoryButton({ unitId }: { unitId: number }) {
  const utils = trpc.useUtils();
  const [result, setResult] = useState<{ timelineUpdated: number; clientesUpdated: number; timelineTotal: number; clientesTotal: number } | null>(null);
  const reclassify = trpc.vipCam.reclassifyAllHistory.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(
        `Reclassificação concluída: ${data.timelineUpdated} de ${data.timelineTotal} capturas atualizadas, ` +
        `${data.clientesUpdated} clientes recalculados.`
      );
      utils.vipCam.getClientes.invalidate({ unitId });
      utils.vipCam.getRecalcHistory.invalidate({ unitId });
    },
    onError: (err) => toast.error(`Erro na reclassificação: ${err.message}`),
  });

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
        onClick={() => reclassify.mutate({ unitId, orgId: unitId })}
        disabled={reclassify.isPending || unitId === 0}
      >
        <History className={`h-4 w-4 mr-2 ${reclassify.isPending ? 'animate-spin' : ''}`} />
        {reclassify.isPending ? 'Reclassificando...' : 'Reclassificar Histórico Agora'}
      </Button>
      {result && (
        <div className="text-xs text-blue-300 bg-blue-500/10 rounded p-2 space-y-0.5">
          <p>✓ Timeline: {result.timelineUpdated} de {result.timelineTotal} capturas atualizadas</p>
          <p>✓ Clientes: {result.clientesUpdated} de {result.clientesTotal} recalculados</p>
        </div>
      )}
    </div>
  );
}

function RecalcHistory({ unitId }: { unitId: number }) {
  const { data: history, isLoading } = trpc.vipCam.getRecalcHistory.useQuery(
    { unitId, limit: 10 },
    { enabled: unitId > 0 }
  );

  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando histórico...</p>;
  if (!history || history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Nenhum recálculo registrado ainda. Clique em "Recalcular Agora" para iniciar.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {history.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30">
          <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground/80 leading-snug">{entry.descricao}</p>
            <p className="text-muted-foreground mt-0.5">
              {entry.userName ?? 'Usuário'} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString('pt-BR') : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
