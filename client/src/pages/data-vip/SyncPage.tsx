import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Zap,
  Server,
  CalendarClock,
  Activity,
  Timer,
} from "lucide-react";

function toUTC(d: string | Date): Date {
  // Superjson pode retornar Date diretamente
  if (d instanceof Date) return d;
  // O banco salva sem 'Z' (ex: "2026-04-09 14:48:00") — forçar parse como UTC
  if (!d.endsWith("Z") && !d.includes("+")) {
    return new Date(d.replace(" ", "T") + "Z");
  }
  return new Date(d);
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Nunca";
  return toUTC(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatNumber(n: number) {
  return n.toLocaleString("pt-BR");
}

function useCountdown(targetIso: string | null | undefined) {
  const [remaining, setRemaining] = useState<string>("");

  useEffect(() => {
    if (!targetIso) {
      setRemaining("—");
      return;
    }
    const update = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Em breve...");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(
        h > 0
          ? `${h}h ${String(m).padStart(2, "0")}min`
          : `${m}min ${String(s).padStart(2, "0")}s`
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [targetIso]);

  return remaining;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "idle")
    return (
      <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Sincronizado
      </Badge>
    );
  if (status === "syncing")
    return (
      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-400/10">
        <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Sincronizando...
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="outline" className="text-red-400 border-red-400/30 bg-red-400/10">
        <AlertCircle className="w-3 h-3 mr-1" /> Erro
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Clock className="w-3 h-3 mr-1" /> Aguardando
    </Badge>
  );
}

export default function SyncPage() {
  const { userRole } = useApp();
  const isAdmin = userRole === "master" || userRole === "org_admin";
  const [importandoUnidade, setImportandoUnidade] = useState<number | null>(null);
  const [importandoTodas, setImportandoTodas] = useState(false);
  const [syncandoUnidade, setSyncandoUnidade] = useState<number | null>(null);
  const [syncandoAgora, setSyncandoAgora] = useState(false);

  const { data: status, refetch: refetchStatus, isLoading } = trpc.sync.status.useQuery(undefined, {
    refetchInterval: 8000,
  });

  const { data: scheduler, refetch: refetchScheduler } = trpc.sync.schedulerInfo.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const { data: unidades } = trpc.sync.getUnidades.useQuery();

  // Polling do estado da sync manual em background
  const { data: syncNowStatusData } = trpc.sync.syncNowStatus.useQuery(undefined, {
    refetchInterval: syncandoAgora ? 2000 : false,
  });

  // Detectar conclusão da sync em background
  useEffect(() => {
    if (!syncandoAgora) return;
    if (syncNowStatusData && !syncNowStatusData.running && syncNowStatusData.finishedAt) {
      setSyncandoAgora(false);
      refetchStatus();
      refetchScheduler();
      if (syncNowStatusData.erros.length === 0) {
        toast.success("Sincronização concluída", {
          description: `${syncNowStatusData.totalUnidades} unidades — ${formatNumber(syncNowStatusData.totalNovas)} registros atualizados`,
        });
      } else {
        toast.warning("Sincronização com erros", {
          description: `${syncNowStatusData.erros.length} unidade(s) falharam`,
        });
      }
    }
  }, [syncNowStatusData, syncandoAgora]);

  const countdown = useCountdown(scheduler?.proximoCiclo);

  const syncNow = trpc.sync.syncNow.useMutation({
    onSuccess: (data) => {
      if (data.started) {
        setSyncandoAgora(true);
        toast.info("Sincronização iniciada", {
          description: "Processando em background. Acompanhe o progresso abaixo.",
        });
      } else {
        toast.info(data.message);
      }
    },
    onError: (err) => {
      setSyncandoAgora(false);
      toast.error(err.message);
    },
  });

  const importHistorico = trpc.sync.importHistorico.useMutation({
    onSuccess: (data, vars) => {
      setImportandoUnidade(null);
      refetchStatus();
      if (data.ok) {
        toast.success(`Unidade ${vars.unidadeId} importada`, {
          description: `${formatNumber(data.totalVendas)} vendas, ${formatNumber(data.totalVp)} itens, ${formatNumber(data.totalClientes)} clientes`,
        });
      } else {
        toast.error("Erro na importação");
      }
    },
    onError: (err) => {
      setImportandoUnidade(null);
      toast.error(err.message);
    },
  });

  const importTodas = trpc.sync.importTodas.useMutation({
    onSuccess: (data) => {
      setImportandoTodas(false);
      refetchStatus();
      toast.success("Importação concluída", {
        description: `${data.sucesso}/${data.total} unidades importadas com sucesso`,
      });
    },
    onError: (err) => {
      setImportandoTodas(false);
      toast.error(err.message);
    },
  });

  const syncIncremental = trpc.sync.incremental.useMutation({
    onSuccess: (data, vars) => {
      setSyncandoUnidade(null);
      refetchStatus();
      toast.success(`Sync incremental — Unidade ${vars.unidadeId}`, {
        description: `${data.novas} registros atualizados`,
      });
    },
    onError: (err) => {
      setSyncandoUnidade(null);
      toast.error(err.message);
    },
  });

  const totalVendas = status?.reduce((s, r) => s + (r.total_vendas || 0), 0) ?? 0;
  const totalVp = status?.reduce((s, r) => s + (r.total_vp || 0), 0) ?? 0;
  const totalClientes = status?.reduce((s, r) => s + (r.total_clientes || 0), 0) ?? 0;
  const unidadesSincronizadas = status?.filter((r) => r.total_vendas > 0).length ?? 0;
  const totalUnidades = unidades?.length ?? 0;
  const progresso = totalUnidades > 0 ? Math.round((unidadesSincronizadas / totalUnidades) * 100) : 0;

  // Última sync bem-sucedida: a mais recente entre todas as unidades
  const ultimaSyncGlobal = status
    ?.filter((r) => r.ultima_sync)
    .map((r) => r.ultima_sync!)
    .sort()
    .at(-1) ?? null;

  const isBusy = !isAdmin || syncandoAgora || importandoTodas || importandoUnidade !== null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Replicação Local"
        description="Cópia local do banco externo para consultas instantâneas"
      />

      {/* Painel de Status do Agendador */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-green-400/20 bg-green-400/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Última sincronização</span>
            </div>
            <div className="text-lg font-semibold text-foreground">
              {formatDate(ultimaSyncGlobal)}
            </div>
            {ultimaSyncGlobal && (
              <div className="text-xs text-muted-foreground mt-1">
                {(() => {
                  const diff = Date.now() - toUTC(ultimaSyncGlobal).getTime();
                  const h = Math.floor(diff / 3600000);
                  const m = Math.floor((diff % 3600000) / 60000);
                  return h > 0 ? `Há ${h}h ${m}min` : `Há ${m} minutos`;
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-400/20 bg-blue-400/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Próxima sincronização</span>
            </div>
            <div className="text-lg font-semibold text-foreground">
              {formatDate(scheduler?.proximoCiclo)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {scheduler?.proximoCiclo ? countdown : "Agendador ativo"}
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-400/20 bg-orange-400/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Agendador automático</span>
            </div>
            <div className="flex items-center gap-2">
              {scheduler?.ativo ? (
                <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <Clock className="w-3 h-3 mr-1" /> Inativo
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Intervalo: a cada {scheduler?.intervaloHoras ?? 4} horas
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Unidades sincronizadas</div>
            <div className="text-2xl font-bold text-foreground">
              {unidadesSincronizadas}/{totalUnidades}
            </div>
            <Progress value={progresso} className="mt-2 h-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Vendas replicadas</div>
            <div className="text-2xl font-bold text-foreground">{formatNumber(totalVendas)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Itens de venda</div>
            <div className="text-2xl font-bold text-foreground">{formatNumber(totalVp)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Clientes replicados</div>
            <div className="text-2xl font-bold text-foreground">{formatNumber(totalClientes)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ações globais — apenas para admin */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4" /> Ações
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button
            onClick={() => {
              syncNow.mutate();
            }}
            disabled={isBusy}
            className="gap-2"
          >
            {syncandoAgora ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {syncandoAgora && syncNowStatusData?.running
              ? `Sincronizando... ${syncNowStatusData.completedUnidades}/${syncNowStatusData.totalUnidades}`
              : syncandoAgora
              ? "Iniciando..."
              : "Sincronizar agora"}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setImportandoTodas(true);
              importTodas.mutate();
            }}
            disabled={isBusy}
            className="gap-2"
          >
            {importandoTodas ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {importandoTodas ? "Importando histórico..." : "Reimportar histórico completo"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { refetchStatus(); refetchScheduler(); }}
            className="gap-2 ml-auto"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Tabela por unidade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4" /> Status por Unidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
          ) : !status || status.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Database className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma unidade sincronizada ainda.
              </p>
              <p className="text-xs text-muted-foreground">
                Clique em "Reimportar histórico completo" para iniciar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Unidade</th>
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Status</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Vendas</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Itens</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Clientes</th>
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Última sync</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {status.map((row) => (
                    <tr key={row.unidade_id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-3 px-3 font-mono text-xs text-foreground">
                        Unidade {row.unidade_id}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={row.status} />
                        {row.erro_msg && (
                          <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={row.erro_msg}>
                            {row.erro_msg}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-foreground">
                        {formatNumber(row.total_vendas)}
                      </td>
                      <td className="py-3 px-3 text-right text-foreground">
                        {formatNumber(row.total_vp)}
                      </td>
                      <td className="py-3 px-3 text-right text-foreground">
                        {formatNumber(row.total_clientes)}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">
                        {formatDate(row.ultima_sync)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isAdmin ? (
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={
                              importandoUnidade === row.unidade_id ||
                              syncandoUnidade === row.unidade_id ||
                              syncandoAgora || importandoTodas
                            }
                            onClick={() => {
                              setSyncandoUnidade(row.unidade_id);
                              syncIncremental.mutate({ unidadeId: row.unidade_id });
                            }}
                          >
                            {syncandoUnidade === row.unidade_id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            Sync
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={
                              importandoUnidade === row.unidade_id ||
                              syncandoUnidade === row.unidade_id ||
                              syncandoAgora || importandoTodas
                            }
                            onClick={() => {
                              setImportandoUnidade(row.unidade_id);
                              importHistorico.mutate({ unidadeId: row.unidade_id });
                            }}
                          >
                            {importandoUnidade === row.unidade_id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            Reimportar
                          </Button>
                        </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className="bg-muted/20">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Como funciona:</strong> O sistema mantém uma cópia local das tabelas do banco externo (vendas, itens, clientes, colaboradores). A importação histórica copia os últimos 24 meses por blocos mensais, unidade por unidade. Após a importação inicial, o sync incremental automático (a cada 4 horas) busca apenas os registros novos ou alterados nas últimas 48h — incluindo cancelamentos e edições — garantindo que a cópia local esteja sempre atualizada sem sobrecarregar o banco externo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
