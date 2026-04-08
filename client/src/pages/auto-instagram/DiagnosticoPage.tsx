import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import { Zap, CheckCircle, XCircle, AlertTriangle, RefreshCw, Play, Instagram, Clock, Hash, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DiagnosticoPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [testResult, setTestResult] = useState<{ success: boolean; accountInfo?: { username: string; name: string; followers: number; posts: number }; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const statusQuery = trpc.ig.getStatus.useQuery({ unitId }, { enabled: unitId > 0, refetchInterval: 10000 });
  const configQuery = trpc.ig.getConfig.useQuery({ unitId }, { enabled: unitId > 0 });

  const testConnectionMut = trpc.ig.testConnection.useMutation({
    onSuccess: (r) => { setTestResult(r); setTesting(false); },
    onError: (e) => { setTestResult({ success: false, error: e.message }); setTesting(false); },
  });

  const runCycleMut = trpc.ig.runCycleNow.useMutation({
    onSuccess: (r) => { toast.success(r.message); statusQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    testConnectionMut.mutate({ unitId });
  };

  const status = statusQuery.data;
  const config = configQuery.data;

  const isConfigured = !!(config?.accessToken && config?.instagramUserId);

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Diagnóstico" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Diagnóstico"
        description="Teste a conexão com a API do Instagram e monitore o estado do bot"
      />

      {/* Status geral */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`glass-card border-2 ${isConfigured ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          <div className="p-6 pt-0 p-4 flex items-center gap-3">
            {isConfigured
              ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
            <div>
              <p className="text-xs text-muted-foreground">Credenciais</p>
              <p className={`text-sm font-semibold ${isConfigured ? "text-green-400" : "text-red-400"}`}>
                {isConfigured ? "Configuradas" : "Não configuradas"}
              </p>
            </div>
          </div>
        </div>

        <div className={`glass-card border-2 ${status?.isRunning ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
          <div className="p-6 pt-0 p-4 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${status?.isRunning ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`} />
            <div>
              <p className="text-xs text-muted-foreground">Bot</p>
              <p className={`text-sm font-semibold ${status?.isRunning ? "text-green-400" : "text-yellow-400"}`}>
                {status?.isRunning ? "Em execução" : "Parado"}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Último ciclo</p>
              <p className="text-sm font-semibold text-foreground">
                {status?.lastRun
                  ? formatDistanceToNow(new Date(status.lastRun), { addSuffix: true, locale: ptBR })
                  : "Nunca executado"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Teste de conexão */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Teste de Conexão com a API
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            Verifica se o Access Token está válido e se consegue acessar as informações da conta do Instagram.
          </p>

          <Button onClick={handleTest} disabled={testing || !isConfigured}>
            {testing
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Testando...</>
              : <><Zap className="w-4 h-4 mr-2" /> Testar Conexão</>}
          </Button>

          {!isConfigured && (
            <p className="text-xs text-yellow-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Configure as credenciais em Configurações antes de testar
            </p>
          )}

          {testResult && (
            <div className={`rounded-lg p-4 border ${testResult.success ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-center gap-2 mb-3">
                {testResult.success
                  ? <CheckCircle className="w-4 h-4 text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />}
                <p className={`text-sm font-medium ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                  {testResult.success ? "Conexão bem-sucedida!" : "Falha na conexão"}
                </p>
              </div>

              {testResult.success && testResult.accountInfo && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Conta</p>
                      <p className="text-sm font-medium">@{testResult.accountInfo.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Seguidores</p>
                      <p className="text-sm font-medium">{testResult.accountInfo.followers.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Posts</p>
                      <p className="text-sm font-medium">{testResult.accountInfo.posts.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="text-sm font-medium">{testResult.accountInfo.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {!testResult.success && testResult.error && (
                <p className="text-sm text-red-400 font-mono">{testResult.error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forçar ciclo */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Forçar Ciclo Agora
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            Executa imediatamente um ciclo de verificação de comentários, sem aguardar o intervalo configurado.
          </p>
          <Button
            variant="outline"
            onClick={() => runCycleMut.mutate({ unitId })}
            disabled={!isConfigured || runCycleMut.isPending}
          >
            {runCycleMut.isPending
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Executando...</>
              : <><Play className="w-4 h-4 mr-2" /> Executar Ciclo Agora</>}
          </Button>
        </div>
      </div>

      {/* Configuração atual */}
      {config && (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-sm font-medium">Configuração Atual</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Intervalo", value: `${config.checkIntervalMinutes} min` },
                { label: "Máx. respostas/ciclo", value: config.maxRepliesPerCycle },
                { label: "Ignorar próprios", value: config.skipOwnComments === 1 ? "Sim" : "Não" },
                { label: "Aprovação manual", value: config.requireApproval === 1 ? "Sim" : "Não" },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
