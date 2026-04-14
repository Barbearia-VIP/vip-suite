import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import {
  Instagram, Play, Pause, RefreshCw, MessageCircle, BookOpen,
  CheckSquare, FileText, Zap, AlertTriangle, TrendingUp, Activity, ChevronRight, Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChartTheme } from "../../hooks/useChartTheme";

export default function AutoInstagramPage() {
  const ct = useChartTheme();
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const statusQuery = trpc.ig.getStatus.useQuery({ unitId }, { enabled: unitId > 0, refetchInterval: 15000 });
  const statsQuery = trpc.igDashboard.getStats.useQuery({ unitId, days: 7 }, { enabled: unitId > 0 });
  const activityQuery = trpc.igDashboard.getRecentActivity.useQuery({ unitId, limit: 10 }, { enabled: unitId > 0, refetchInterval: 15000 });

  const startBotMut = trpc.ig.startBot.useMutation({
    onSuccess: (r) => { toast.success(r.message); statusQuery.refetch(); statsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const stopBotMut = trpc.ig.stopBot.useMutation({
    onSuccess: (r) => { toast.success(r.message); statusQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const runCycleMut = trpc.ig.runCycleNow.useMutation({
    onSuccess: (r) => { toast.success(r.message); activityQuery.refetch(); statsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const status = statusQuery.data;
  const stats = statsQuery.data;
  const activity = activityQuery.data ?? [];

  const isRunning = status?.isRunning ?? false;
  const isConfigured = status?.isConfigured ?? false;

  const logTypeColor: Record<string, string> = {
    comment_reply: "text-green-400",
    story_reply: "text-blue-400",
    welcome: "text-yellow-400",
    error: "text-red-400",
    info: "text-muted-foreground",
    warning: "text-orange-400",
  };

  const logTypeIcon: Record<string, React.ReactNode> = {
    comment_reply: <MessageCircle className="w-3.5 h-3.5" />,
    story_reply: <Activity className="w-3.5 h-3.5" />,
    error: <AlertTriangle className="w-3.5 h-3.5" />,
    info: <Zap className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Auto Instagram" description="Selecione uma unidade para gerenciar o bot" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">
            Selecione uma unidade no seletor do topo para gerenciar o bot do Instagram.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Auto Instagram"
        description="Automação de respostas a comentários e stories"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => runCycleMut.mutate({ unitId })} disabled={!isConfigured || runCycleMut.isPending}>
              <RefreshCw className={`w-4 h-4 mr-2 ${runCycleMut.isPending ? "animate-spin" : ""}`} />
              Forçar Ciclo
            </Button>
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={() => stopBotMut.mutate({ unitId })} disabled={stopBotMut.isPending}>
                <Pause className="w-4 h-4 mr-2" /> Pausar Bot
              </Button>
            ) : (
              <Button size="sm" onClick={() => startBotMut.mutate({ unitId })} disabled={!isConfigured || startBotMut.isPending}
                className="bg-green-600 hover:bg-green-700 text-white">
                <Play className="w-4 h-4 mr-2" /> Iniciar Bot
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`glass-card border-2 ${isRunning ? "border-green-500/50 bg-green-500/5" : isConfigured ? "border-yellow-500/50 bg-yellow-500/5" : "border-red-500/50 bg-red-500/5"}`}>
          <div className="p-6 pt-0 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : isConfigured ? "bg-yellow-500" : "bg-red-500"}`} />
              <div>
                <p className="text-xs text-muted-foreground">Status do Bot</p>
                <p className={`font-semibold text-sm ${isRunning ? "text-green-400" : isConfigured ? "text-yellow-400" : "text-red-400"}`}>
                  {isRunning ? "Ativo" : isConfigured ? "Pausado" : "Não Configurado"}
                </p>
              </div>
            </div>
            {status?.lastRun && (
              <p className="text-xs text-muted-foreground mt-2">
                Último ciclo: {formatDistanceToNow(new Date(status.lastRun), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </div>
        </div>

        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-green-400" />
              <p className="text-xs text-muted-foreground">Comentários (7 dias)</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.replies ?? 0}</p>
            <p className="text-xs text-muted-foreground">respostas enviadas</p>
          </div>
        </div>

        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-400" />
              <p className="text-xs text-muted-foreground">Stories (7 dias)</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.stories ?? 0}</p>
            <p className="text-xs text-muted-foreground">respostas enviadas</p>
          </div>
        </div>

            <div className="glass-card bg-white/5">
          <div className="p-6 pt-0 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Respostas Enviadas</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.replies ?? 0}
            </p>
            <Link href="/auto-instagram/aprovacao">
              <p className="text-xs text-primary hover:underline cursor-pointer mt-1">Ver histórico →</p>
            </Link>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {!isRunning && isConfigured && (
        <div className="glass-card border-yellow-500/50 bg-yellow-500/5">
          <div className="p-6 pt-0 p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Bot pausado</p>
              <p className="text-xs text-muted-foreground">O bot está configurado mas não está em execução. Clique em "Iniciar Bot" para ativar as respostas automáticas.</p>
            </div>
            <Button size="sm" onClick={() => startBotMut.mutate({ unitId })} className="ml-auto bg-green-600 hover:bg-green-700 text-white">
              <Play className="w-3.5 h-3.5 mr-1.5" /> Iniciar
            </Button>
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="glass-card border-red-500/50 bg-red-500/5">
          <div className="p-6 pt-0 p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Credenciais não configuradas</p>
              <p className="text-xs text-muted-foreground">Configure o Access Token e o ID da conta do Instagram em Configurações para ativar o bot.</p>
            </div>
            <Link href="/configuracoes">
              <Button size="sm" variant="outline" className="ml-auto">
                <Settings className="w-3.5 h-3.5 mr-1.5" /> Configurar
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="glass-card lg:col-span-2 bg-white/5 border-white/10">
          <div className="p-6 pb-2 pb-2">
            <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Atividade dos Últimos 7 Dias
            </h3>
          </div>
          <div className="p-6 pt-0">
            {(stats?.chartData?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.chartData ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }}
                    tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                  <Tooltip contentStyle={ct.tooltipStyle}
                    labelFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")} />
                  <Bar dataKey="replies" name="Comentários" fill="oklch(0.65 0.15 145)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="stories" name="Stories" fill="oklch(0.65 0.15 200)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma atividade registrada nos últimos 7 dias
              </div>
            )}
          </div>
        </div>

        {/* Acesso rápido */}
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pb-2 pb-2">
            <h3 className="font-semibold text-foreground text-sm font-medium">Acesso Rápido</h3>
          </div>
          <div className="p-6 pt-0 space-y-1 p-4 pt-0">
            {[
              { href: "/auto-instagram/prompts", icon: BookOpen, label: "Editor de Prompts", desc: "Personalidade do bot" },
              { href: "/auto-instagram/aprovacao", icon: CheckSquare, label: "Histórico de Respostas", desc: "Ver todas as respostas enviadas" },
              { href: "/auto-instagram/stories", icon: Activity, label: "Respostas a Stories", desc: "Configurar e ver logs" },
              { href: "/auto-instagram/logs", icon: FileText, label: "Histórico de Logs", desc: "Todas as atividades" },
              { href: "/auto-instagram/diagnostico", icon: Zap, label: "Diagnóstico", desc: "Testar conexão" },
            ].map(item => (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                  <item.icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Log recente */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-2 flex flex-row items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Atividade Recente
          </h3>
          <Link href="/auto-instagram/logs">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">Ver todos →</Button>
          </Link>
        </div>
        <div className="p-6 pt-0 p-0">
          {activity.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma atividade registrada ainda</div>
          ) : (
            <div className="divide-y divide-border">
              {activity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 flex-shrink-0 ${logTypeColor[log.type] ?? "text-muted-foreground"}`}>
                    {logTypeIcon[log.type] ?? <Zap className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{log.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${logTypeColor[log.type]}`}>
                    {log.type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
