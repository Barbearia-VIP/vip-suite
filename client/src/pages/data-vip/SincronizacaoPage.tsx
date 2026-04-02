/**
 * SincronizacaoPage.tsx — Painel de sincronização com 3 modos
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, KeyRound, ExternalLink } from "lucide-react";
import { Link } from "wouter";

function fmtDt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default function SincronizacaoPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const [unitId, setUnitId] = useState<string>(selectedUnit ? String(selectedUnit.id) : "");
  const [modo, setModo] = useState<"auto" | "manual_13m" | "historico">("auto");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState(today);

  // Busca configurações das unidades para verificar credenciais
  const unitsConfigQuery = trpc.dataVip.unitsConfig.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org?.id }
  );

  const logsQ = trpc.dataVip.syncLogs.useQuery(
    { orgId: org?.id, unitId: unitId ? Number(unitId) : undefined, limit: 30 },
    { enabled: !!org?.id, refetchInterval: 5000 }
  );

  const utils = trpc.useUtils();
  const startSync = trpc.dataVip.startSync.useMutation({
    onSuccess: (d) => { toast.success(d.message); utils.dataVip.syncLogs.invalidate(); },
    onError: (e) => toast.error("Erro ao iniciar sync", { description: e.message }),
  });

  const logs = logsQ.data ?? [];
  const unitsConfig = unitsConfigQuery.data ?? [];

  // Verifica se a unidade selecionada tem credenciais
  const selectedUnitConfig = unitsConfig.find(u => String(u.id) === unitId);
  const hasCredentials = selectedUnitConfig?.hasApiKeys ?? false;
  const canSync = !!unitId && hasCredentials;

  const statusIcon = (s: string) => {
    if (s === "sucesso") return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (s === "erro") return <XCircle className="w-4 h-4 text-red-400" />;
    if (s === "em_progresso") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-cyan-400" /> Sincronização
        </h1>
        <p className="text-sm text-muted-foreground">Importar dados da API externa para o VIP Suite</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Nova Sincronização</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(units ?? []).map((u: any) => {
                      const cfg = unitsConfig.find(c => c.id === u.id);
                      const hasCreds = cfg?.hasApiKeys ?? false;
                      return (
                        <SelectItem key={u.id} value={String(u.id)}>
                          <span className="flex items-center gap-2">
                            {u.name}
                            {!hasCreds && <span className="text-xs text-amber-400">(sem credenciais)</span>}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modo</Label>
                <Select value={modo} onValueChange={v => setModo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (últimos 2 dias)</SelectItem>
                    <SelectItem value="manual_13m">Manual (13 meses)</SelectItem>
                    <SelectItem value="historico">Histórico completo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {modo === "historico" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Data Início</Label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} max={today} />
                </div>
                <div>
                  <Label>Data Fim</Label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} max={today} />
                </div>
              </div>
            )}

            {/* Alerta quando unidade selecionada não tem credenciais */}
            {unitId && !hasCredentials && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <AlertDescription className="text-amber-300 flex items-center gap-2">
                  Esta unidade não tem credenciais da API configuradas.
                  <Link href="/configuracoes" className="underline text-amber-200 flex items-center gap-1 hover:text-white">
                    Configurar agora <ExternalLink className="w-3 h-3" />
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => startSync.mutate({ orgId: org!.id, unitId: Number(unitId), modo, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined })}
              disabled={startSync.isPending || !canSync}
              className="gap-2"
            >
              {startSync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Iniciar Sincronização
            </Button>
            {!unitId && <p className="text-xs text-muted-foreground">Selecione uma unidade para continuar.</p>}
          </CardContent>
        </Card>
      )}

      {/* Resumo de credenciais das unidades */}
      {isAdmin && unitsConfig.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" /> Status de Credenciais
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-48 overflow-y-auto">
              {unitsConfig.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm">{u.name}</span>
                  {u.hasApiKeys
                    ? <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">Configurada</Badge>
                    : <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">Sem credenciais</Badge>
                  }
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Histórico de Sincronizações</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => utils.dataVip.syncLogs.invalidate()} className="h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {logsQ.isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <AlertCircle className="w-5 h-5 mx-auto mb-2" />
              Nenhuma sincronização realizada ainda
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  {statusIcon(l.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{l.unitName || `Unidade ${l.unitId}`}</p>
                    <p className="text-xs text-muted-foreground">{fmtDt(l.iniciadoEm)} · {l.modo}{l.periodoInicio ? ` · ${l.periodoInicio} a ${l.periodoFim}` : ""}</p>
                    {l.erro && <p className="text-xs text-red-400 mt-0.5">{l.erro}</p>}
                  </div>
                  <div className="text-right text-xs">
                    {l.registrosInseridos != null && !isNaN(Number(l.registrosInseridos)) && <p className="font-medium">{Number(l.registrosInseridos).toLocaleString("pt-BR")} registros</p>}
                    <Badge variant="outline" className={`text-xs ${l.status === "sucesso" ? "border-green-500/30 text-green-400" : l.status === "erro" ? "border-red-500/30 text-red-400" : "border-blue-500/30 text-blue-400"}`}>
                      {l.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
