import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import {
  Settings, Wifi, WifiOff, RefreshCw, QrCode, CheckCircle,
  AlertCircle, ExternalLink, Save, Smartphone, Power
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";

export default function ConfiguracaoWeSendPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [form, setForm] = useState({
    wahaUrl: "http://localhost:3001",
    wahaApiKey: "",
    sessionName: "default",
    intervaloSegundos: 3,
    horarioInicio: "09:00",
    horarioFim: "18:00",
    maxEnviosDia: 500,
  });

  const configQuery = trpc.weSend.getConfig.useQuery({ unitId }, { enabled: !!unitId });
  const sessionQuery = trpc.weSend.getSessionStatus.useQuery({ unitId }, { enabled: !!unitId, refetchInterval: 5000 });
  const utils = trpc.useUtils();

  useEffect(() => {
    if (configQuery.data) {
      setForm({
        wahaUrl: configQuery.data.wahaUrl || "http://localhost:3001",
        wahaApiKey: configQuery.data.wahaApiKey || "",
        sessionName: configQuery.data.sessionName || "default",
        intervaloSegundos: configQuery.data.intervaloSegundos || 3,
        horarioInicio: configQuery.data.horarioInicio || "09:00",
        horarioFim: configQuery.data.horarioFim || "18:00",
        maxEnviosDia: configQuery.data.maxEnviosDia || 500,
      });
    }
  }, [configQuery.data]);

  const saveConfigMutation = trpc.weSend.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas!");
      utils.weSend.getConfig.invalidate({ unitId });
      utils.weSend.getSessionStatus.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const startSessionMutation = trpc.weSend.startSession.useMutation({
    onSuccess: () => {
      toast.success("Sessão iniciada! Aguarde o QR Code aparecer.");
      utils.weSend.getSessionStatus.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const stopSessionMutation = trpc.weSend.stopSession.useMutation({
    onSuccess: () => {
      toast.success("Sessão encerrada.");
      utils.weSend.getSessionStatus.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const sessionData = sessionQuery.data;
  const sessionStatus = sessionData?.status || "UNKNOWN";
  const isWorking = sessionStatus === "WORKING";
  const isWaitingQr = sessionStatus === "SCAN_QR_CODE";

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    WORKING: { label: "Conectado", color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
    SCAN_QR_CODE: { label: "Aguardando QR Code", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
    STARTING: { label: "Iniciando...", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
    STOPPED: { label: "Parado", color: "text-muted-foreground", bg: "bg-muted/30 border-white/10" },
    FAILED: { label: "Falhou", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
    UNREACHABLE: { label: "Servidor inacessível", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
    NOT_CONFIGURED: { label: "Não configurado", color: "text-muted-foreground", bg: "bg-muted/30 border-white/10" },
    UNKNOWN: { label: "Desconhecido", color: "text-muted-foreground", bg: "bg-muted/30 border-white/10" },
  };

  const sc = statusConfig[sessionStatus] || statusConfig.UNKNOWN;

  const handleSave = () => {
    saveConfigMutation.mutate({ unitId, ...form });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Configurações WAHA"
        description="Configure o servidor WhatsApp HTTP API"
      />

      {/* Status da sessão */}
      <div className={`glass-card border ${sc.bg}`}>
        <div className="p-6 pt-0 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isWorking ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium text-foreground">Status da Sessão WhatsApp</p>
                <p className={`text-xs ${sc.color} font-medium`}>{sc.label}</p>
                {sessionData?.me && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Conectado como: {sessionData.me.pushName || sessionData.me.id}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1 h-7"
                onClick={() => utils.weSend.getSessionStatus.invalidate({ unitId })}
                disabled={sessionQuery.isFetching}>
                <RefreshCw className={`w-3 h-3 ${sessionQuery.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {!isWorking && (
                <Button size="sm" className="text-xs gap-1 h-7"
                  onClick={() => startSessionMutation.mutate({ unitId })}
                  disabled={startSessionMutation.isPending || !configQuery.data}>
                  <Power className="w-3 h-3" />Iniciar
                </Button>
              )}
              {isWorking && (
                <Button variant="outline" size="sm" className="text-xs gap-1 h-7 text-red-500 border-red-500/30"
                  onClick={() => stopSessionMutation.mutate({ unitId })}
                  disabled={stopSessionMutation.isPending}>
                  <Power className="w-3 h-3" />Encerrar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code */}
      {isWaitingQr && (
        <div className="glass-card border-yellow-500/20 bg-yellow-500/5">
          <div className="p-6 pb-2 pb-2">
            <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground flex items-center gap-2">
              <QrCode className="w-4 h-4 text-yellow-500" />
              Escanear QR Code
            </h3>
          </div>
          <div className="p-6 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Abra o WhatsApp no seu celular, vá em <strong>Dispositivos Conectados</strong> e escaneie o QR Code abaixo.
            </p>
            <div className="flex flex-col items-center gap-3">
              <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center border border-white/10">
                {sessionData?.qrCode ? (
                  <img src={sessionData.qrCode} alt="QR Code WhatsApp" className="w-44 h-44 object-contain" />
                ) : (
                  <div className="text-center">
                    <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Carregando QR Code...</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                O QR Code é atualizado automaticamente a cada 5 segundos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configurações do servidor */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Configurações do Servidor WAHA
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <Alert>
            <AlertCircle className="w-3.5 h-3.5" />
            <AlertDescription className="text-xs">
              O WAHA é um servidor auto-hospedado. Você precisa instalar e rodar o WAHA em um servidor próprio.{" "}
              <a href="https://waha.devlike.pro/docs/how-to/install/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                Ver documentação <ExternalLink className="w-3 h-3" />
              </a>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">URL do servidor WAHA *</Label>
              <Input
                placeholder="http://localhost:3001"
                value={form.wahaUrl}
                onChange={e => setForm(p => ({ ...p, wahaUrl: e.target.value }))}
                className="text-xs h-8"
              />
              <p className="text-xs text-muted-foreground">Ex: http://192.168.1.100:3000 ou https://waha.suaempresa.com</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chave da API (X-Api-Key)</Label>
              <Input
                type="password"
                placeholder="Deixe em branco se não configurou"
                value={form.wahaApiKey}
                onChange={e => setForm(p => ({ ...p, wahaApiKey: e.target.value }))}
                className="text-xs h-8"
              />
              <p className="text-xs text-muted-foreground">Configurado via variável WAHA_API_KEY no servidor</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da sessão</Label>
              <Input
                placeholder="default"
                value={form.sessionName}
                onChange={e => setForm(p => ({ ...p, sessionName: e.target.value }))}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo padrão entre envios (seg)</Label>
              <Input
                type="number" min={1} max={60}
                value={form.intervaloSegundos}
                onChange={e => setForm(p => ({ ...p, intervaloSegundos: Number(e.target.value) }))}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário de início</Label>
              <Input
                type="time"
                value={form.horarioInicio}
                onChange={e => setForm(p => ({ ...p, horarioInicio: e.target.value }))}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário de fim</Label>
              <Input
                type="time"
                value={form.horarioFim}
                onChange={e => setForm(p => ({ ...p, horarioFim: e.target.value }))}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Máximo de envios por dia</Label>
              <Input
                type="number" min={1} max={10000}
                value={form.maxEnviosDia}
                onChange={e => setForm(p => ({ ...p, maxEnviosDia: Number(e.target.value) }))}
                className="text-xs h-8"
              />
            </div>
          </div>

          <Button className="gap-1.5 text-xs" onClick={handleSave} disabled={saveConfigMutation.isPending}>
            {saveConfigMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar configurações
          </Button>
        </div>
      </div>

      {/* Guia de instalação */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            Como instalar o WAHA
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            O WAHA (WhatsApp HTTP API) é uma solução auto-hospedada que permite enviar mensagens via WhatsApp.
            Instale com Docker em qualquer servidor:
          </p>
          <div className="rounded-lg bg-muted/50 border border-white/10 p-3 font-mono text-xs text-foreground space-y-1">
            <p className="text-muted-foreground"># Instalar e iniciar o WAHA com Docker</p>
            <p>docker pull devlikeapro/waha</p>
            <p>docker run -d --name waha \</p>
            <p className="pl-4">-p 3000:3000 \</p>
            <p className="pl-4">-e WAHA_API_KEY=suachavesecreta \</p>
            <p className="pl-4">devlikeapro/waha</p>
          </div>
          <div className="flex gap-2">
            <a href="https://waha.devlike.pro/docs/how-to/install/" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                <ExternalLink className="w-3 h-3" />Documentação completa
              </Button>
            </a>
            <a href="https://github.com/devlikeapro/waha" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                <ExternalLink className="w-3 h-3" />GitHub WAHA
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
