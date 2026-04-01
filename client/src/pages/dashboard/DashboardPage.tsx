import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import {
  TrendingUp, Star, Camera, Instagram, MessageSquare,
  Building2, BarChart3, RefreshCw, ArrowUpRight, AlertCircle,
  CheckSquare, Wifi, WifiOff, Settings, TrendingDown,
  Users, AlertTriangle, CalendarDays, DollarSign, Smile, Frown, Meh,
  MessageCircle, ThumbsUp, Clock,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOrg } from "@/hooks/useOrg";
import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}
function fmtPct(value: number) {
  return `${value}%`;
}

// ─── Seletor de Período ──────────────────────────────────────────────────────
type PeriodOption = "today" | "week" | "month" | "quarter" | "custom";

function getPeriodDates(option: PeriodOption, customFrom?: string, customTo?: string): { from: string; to: string; label: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (option === "today") {
    const today = fmt(now);
    return { from: today, to: today, label: "Hoje" };
  }
  if (option === "week") {
    const day = now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    return { from: fmt(monday), to: fmt(now), label: "Esta semana" };
  }
  if (option === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: fmt(now), label: "Este mês" };
  }
  if (option === "quarter") {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: fmt(qStart), to: fmt(now), label: "Este trimestre" };
  }
  // custom
  return {
    from: customFrom ?? fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: customTo ?? fmt(now),
    label: `${customFrom ?? "—"} a ${customTo ?? "—"}`,
  };
}

// ─── Mini KPI ────────────────────────────────────────────────────────────────
function MiniKPI({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 leading-none">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Module Card ─────────────────────────────────────────────────────────────
function ModuleCard({
  title, icon: Icon, color, badge, configured = true, onConfigure, children, onNavigate,
}: {
  title: string; icon: React.ElementType; color: string; badge?: string;
  configured?: boolean; onConfigure?: () => void; children?: React.ReactNode; onNavigate?: () => void;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
              {badge && <p className="text-xs text-muted-foreground mt-0.5">{badge}</p>}
            </div>
          </div>
          {onNavigate && (
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 shrink-0" onClick={onNavigate}>
              Ver mais <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
        {configured ? (
          <div className="space-y-3">{children}</div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">Módulo não configurado</p>
            {onConfigure && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={onConfigure}>
                <Settings className="w-3 h-3" /> Configurar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Barra de satisfação ─────────────────────────────────────────────────────
function SatisfactionBar({ satisfeitos, neutros, insatisfeitos, total }: {
  satisfeitos: number; neutros: number; insatisfeitos: number; total: number;
}) {
  if (total === 0) return <p className="text-xs text-muted-foreground">Sem capturas no período</p>;
  const pS = Math.round((satisfeitos / total) * 100);
  const pN = Math.round((neutros / total) * 100);
  const pI = 100 - pS - pN;
  return (
    <div className="space-y-2">
      <div className="flex rounded-full overflow-hidden h-2">
        {pS > 0 && <div className="bg-emerald-500" style={{ width: `${pS}%` }} />}
        {pN > 0 && <div className="bg-yellow-500" style={{ width: `${pN}%` }} />}
        {pI > 0 && <div className="bg-red-500" style={{ width: `${pI}%` }} />}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{pS}% satisfeitos</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />{pN}% neutros</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{pI}% insatisfeitos</span>
      </div>
    </div>
  );
}

const MODULE_DEFS = [
  { key: "data_vip", label: "Data VIP", icon: BarChart3, color: "oklch(0.65 0.15 200)", path: "/data-vip", desc: "Analytics e faturamento" },
  { key: "gestao_total", label: "Gestão Total", icon: Building2, color: "oklch(0.65 0.15 145)", path: "/gestao-total", desc: "ERP operacional" },
  { key: "vip_cam", label: "VIP Cam", icon: Camera, color: "oklch(0.65 0.15 280)", path: "/vip-cam", desc: "Reconhecimento facial" },
  { key: "reputacao", label: "Reputação", icon: Star, color: "oklch(0.65 0.15 30)", path: "/reputacao", desc: "Avaliações online" },
  { key: "auto_instagram", label: "Auto Instagram", icon: Instagram, color: "oklch(0.65 0.15 320)", path: "/auto-instagram", desc: "Automação Instagram" },
  { key: "we_send", label: "We Send", icon: MessageSquare, color: "oklch(0.65 0.15 100)", path: "/we-send", desc: "WhatsApp em massa" },
] as const;

type ModuleKey = "data_vip" | "gestao_total" | "vip_cam" | "reputacao" | "auto_instagram" | "we_send";
const MODULE_KPI_MAP: Record<ModuleKey, "dataVip" | "gestaoTotal" | "vipCam" | "reputacao" | "autoInstagram" | "weSend"> = {
  data_vip: "dataVip", gestao_total: "gestaoTotal", vip_cam: "vipCam",
  reputacao: "reputacao", auto_instagram: "autoInstagram", we_send: "weSend",
};

// ─── Componente Principal ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units, loading: orgLoading } = useOrg();
  const [, navigate] = useLocation();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
  const orgId = org?.id ?? 0;
  const unitId = selectedUnit?.id;

  // ── Filtro de período ──
  const [periodOption, setPeriodOption] = useState<PeriodOption>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const period = useMemo(
    () => getPeriodDates(periodOption, customFrom, customTo),
    [periodOption, customFrom, customTo]
  );

  // ── Queries com refetch automático a cada 2 minutos ──
  const kpisQuery = trpc.dashboard.kpis.useQuery(
    { orgId, unitId, dateFrom: period.from, dateTo: period.to },
    { enabled: orgId > 0, refetchOnWindowFocus: false, refetchInterval: 2 * 60 * 1000 }
  );
  const modulesQuery = trpc.dashboard.modulesStatus.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );
  const faturamentoQuery = trpc.dashboard.faturamentoMensal.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );
  const rankingQuery = trpc.dashboard.rankingUnidades.useQuery(
    { orgId },
    { enabled: orgId > 0 && isMasterOrAdmin && !selectedUnit, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  const kpis = kpisQuery.data;
  const modules = modulesQuery.data;
  const faturamentoData = faturamentoQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];
  const isLoading = kpisQuery.isLoading || kpisQuery.isFetching;


  // Timestamp da última atualização
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  useEffect(() => {
    if (!kpisQuery.isFetching) setLastUpdated(new Date());
  }, [kpisQuery.isFetching]);

  function handleRefresh() {
    kpisQuery.refetch();
    modulesQuery.refetch();
    faturamentoQuery.refetch();
    rankingQuery.refetch();
  }

  function handlePeriod(opt: PeriodOption) {
    setPeriodOption(opt);
    setShowCustom(opt === "custom");
  }

  if (!orgLoading && !org) {
    return (
      <div className="p-6">
        <PageHeader title="Dashboard" description="Bem-vindo ao VIP Suite" />
        <Card className="bg-card border-border">
          <CardContent className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">Configure sua organização</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Para começar, crie sua organização e adicione as unidades da sua rede.
            </p>
            <Button onClick={() => navigate("/unidades")} className="gap-2">
              <Building2 className="w-4 h-4" /> Criar Organização
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Dashboard"
        description={
          selectedUnit
            ? `Visão consolidada — ${selectedUnit.name}`
            : isMasterOrAdmin ? "Visão consolidada de toda a rede" : "Visão da sua unidade"
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">
              Atualizado: {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleRefresh}>
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        }
      />

      {/* ── Seletor de Período ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Período:</span>
        {(["today", "week", "month", "quarter", "custom"] as PeriodOption[]).map((opt) => {
          const labels: Record<PeriodOption, string> = {
            today: "Hoje", week: "Semana", month: "Mês atual", quarter: "Trimestre", custom: "Personalizado",
          };
          return (
            <button
              key={opt}
              onClick={() => handlePeriod(opt)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                periodOption === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {labels[opt]}
            </button>
          );
        })}
        {showCustom && (
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-7 px-2 text-xs rounded border border-border bg-card text-foreground"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-7 px-2 text-xs rounded border border-border bg-card text-foreground"
            />
          </div>
        )}
        <Badge variant="secondary" className="text-xs ml-auto">{period.label}</Badge>
      </div>

      {/* ── Grid de Módulos ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* DATA VIP */}
        <ModuleCard
          title="Data VIP"
          icon={BarChart3}
          color="oklch(0.65 0.15 200)"
          badge="Faturamento e atendimentos"
          configured={modules?.data_vip ?? true}
          onConfigure={() => navigate("/configuracoes")}
          onNavigate={() => navigate("/data-vip")}
        >
          {kpis?.dataVip.hasData ? (
            <>
              <MiniKPI
                label="Faturamento"
                value={fmt(kpis.dataVip.faturamentoMes)}
                sub={kpis.dataVip.trendFaturamento !== null
                  ? `${kpis.dataVip.trendFaturamento >= 0 ? "+" : ""}${kpis.dataVip.trendFaturamento}% vs período anterior`
                  : undefined}
                icon={DollarSign}
                color="oklch(0.65 0.15 200)"
              />
              <MiniKPI
                label="Atendimentos"
                value={fmtNum(kpis.dataVip.atendimentos)}
                icon={Users}
                color="oklch(0.65 0.15 200)"
              />
              <MiniKPI
                label="Ticket Médio"
                value={fmt(kpis.dataVip.ticketMedio)}
                icon={TrendingUp}
                color="oklch(0.65 0.15 200)"
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem dados no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>
                Sincronizar Data VIP →
              </Button>
            </div>
          )}
        </ModuleCard>

        {/* GESTÃO TOTAL */}
        <ModuleCard
          title="Gestão Total"
          icon={Building2}
          color="oklch(0.65 0.15 145)"
          badge="Tarefas, problemas e reuniões"
          configured={true}
          onNavigate={() => navigate("/gestao-total")}
        >
          <MiniKPI
            label="Tarefas Pendentes"
            value={fmtNum(kpis?.gestaoTotal.tarefasAbertas ?? 0)}
            sub={kpis?.gestaoTotal.tarefasCriticas ? `${kpis.gestaoTotal.tarefasCriticas} críticas` : undefined}
            icon={CheckSquare}
            color="oklch(0.65 0.15 145)"
          />
          <MiniKPI
            label="Problemas Ativos"
            value={fmtNum(kpis?.gestaoTotal.problemasAbertos ?? 0)}
            icon={AlertTriangle}
            color={kpis?.gestaoTotal.problemasAbertos ? "oklch(0.65 0.15 60)" : "oklch(0.65 0.15 145)"}
          />
          <MiniKPI
            label="Reuniões Hoje"
            value={fmtNum(kpis?.gestaoTotal.reunioesHoje ?? 0)}
            icon={CalendarDays}
            color="oklch(0.65 0.15 145)"
          />
          {kpis && (kpis.gestaoTotal.receitasMes > 0 || kpis.gestaoTotal.despesasMes > 0) && (
            <MiniKPI
              label="Resultado Financeiro"
              value={fmt(kpis.gestaoTotal.lucroMes)}
              sub={`Receitas: ${fmt(kpis.gestaoTotal.receitasMes)} · Despesas: ${fmt(kpis.gestaoTotal.despesasMes)}`}
              icon={DollarSign}
              color={kpis.gestaoTotal.lucroMes >= 0 ? "oklch(0.65 0.15 145)" : "oklch(0.65 0.15 15)"}
            />
          )}
        </ModuleCard>

        {/* VIP CAM */}
        <ModuleCard
          title="VIP Cam"
          icon={Camera}
          color="oklch(0.65 0.15 280)"
          badge="Satisfação de clientes"
          configured={modules?.vip_cam ?? true}
          onConfigure={() => navigate("/configuracoes")}
          onNavigate={() => navigate("/vip-cam")}
        >
          {kpis?.vipCam.hasData ? (
            <>
              <MiniKPI
                label="Clientes Reconhecidos"
                value={fmtNum(kpis.vipCam.clientesNoPeriodo)}
                sub="Clientes únicos no período"
                icon={Users}
                color="oklch(0.65 0.15 280)"
              />
              <MiniKPI
                label="Taxa de Satisfação"
                value={fmtPct(kpis.vipCam.satisfacaoPercent)}
                sub={`${kpis.vipCam.satisfeitosNoPeriodo} satisfeitos · ${kpis.vipCam.neutrosNoPeriodo} neutros · ${kpis.vipCam.insatisfeitosNoPeriodo} insatisfeitos`}
                icon={Smile}
                color={kpis.vipCam.satisfacaoPercent >= 70 ? "oklch(0.65 0.15 145)" : kpis.vipCam.satisfacaoPercent >= 40 ? "oklch(0.65 0.15 60)" : "oklch(0.65 0.15 15)"}
              />
              <SatisfactionBar
                satisfeitos={kpis.vipCam.satisfeitosNoPeriodo}
                neutros={kpis.vipCam.neutrosNoPeriodo}
                insatisfeitos={kpis.vipCam.insatisfeitosNoPeriodo}
                total={kpis.vipCam.clientesNoPeriodo}
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem capturas no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/vip-cam")}>
                Abrir VIP Cam →
              </Button>
            </div>
          )}
        </ModuleCard>

        {/* REPUTAÇÃO / GOOGLE */}
        <ModuleCard
          title="Reputação"
          icon={Star}
          color="oklch(0.65 0.15 30)"
          badge="Google e plataformas"
          configured={modules?.reputacao ?? true}
          onConfigure={() => navigate("/configuracoes")}
          onNavigate={() => navigate("/reputacao")}
        >
          {kpis?.reputacao.hasData ? (
            <>
              {kpis.reputacao.totalGoogle > 0 ? (
                <MiniKPI
                  label="Nota Média Google"
                  value={`${kpis.reputacao.mediaGoogle.toFixed(1)} ★`}
                  sub={`${fmtNum(kpis.reputacao.totalGoogle)} avaliações Google`}
                  icon={Star}
                  color="oklch(0.65 0.15 30)"
                />
              ) : (
                <MiniKPI
                  label="Nota Média Geral"
                  value={`${kpis.reputacao.mediaAvaliacoes.toFixed(1)} ★`}
                  sub={`${fmtNum(kpis.reputacao.totalAvaliacoes)} avaliações`}
                  icon={Star}
                  color="oklch(0.65 0.15 30)"
                />
              )}
              {kpis.reputacao.semRespostaGoogle > 0 && (
                <MiniKPI
                  label="Sem Resposta (Google)"
                  value={fmtNum(kpis.reputacao.semRespostaGoogle)}
                  sub="Avaliações aguardando resposta"
                  icon={MessageCircle}
                  color="oklch(0.65 0.15 60)"
                />
              )}
              <MiniKPI
                label="Avaliações Positivas"
                value={fmtPct(kpis.reputacao.positivasPercent)}
                sub={`${fmtNum(kpis.reputacao.totalAvaliacoes)} avaliações no período`}
                icon={ThumbsUp}
                color="oklch(0.65 0.15 145)"
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem avaliações no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/reputacao")}>
                Configurar Reputação →
              </Button>
            </div>
          )}
        </ModuleCard>

        {/* AUTO INSTAGRAM */}
        <ModuleCard
          title="Auto Instagram"
          icon={Instagram}
          color="oklch(0.65 0.15 320)"
          badge="Seguidores e engajamento"
          configured={modules?.auto_instagram ?? true}
          onConfigure={() => navigate("/configuracoes")}
          onNavigate={() => navigate("/auto-instagram")}
        >
          {kpis?.autoInstagram.hasData ? (
            <>
              <MiniKPI
                label="Seguidores"
                value={fmtNum(kpis.autoInstagram.seguidores)}
                sub={kpis.autoInstagram.novosSeguidores > 0 ? `+${kpis.autoInstagram.novosSeguidores} novos` : undefined}
                icon={Users}
                color="oklch(0.65 0.15 320)"
              />
              <MiniKPI
                label="Comentários Respondidos"
                value={fmtNum(kpis.autoInstagram.comentariosRespondidos)}
                icon={MessageCircle}
                color="oklch(0.65 0.15 320)"
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem dados no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/auto-instagram")}>
                Configurar Instagram →
              </Button>
            </div>
          )}
        </ModuleCard>

        {/* WE SEND */}
        <ModuleCard
          title="We Send"
          icon={MessageSquare}
          color="oklch(0.65 0.15 100)"
          badge="WhatsApp em massa"
          configured={modules?.we_send ?? true}
          onConfigure={() => navigate("/configuracoes")}
          onNavigate={() => navigate("/we-send")}
        >
          {kpis?.weSend.hasData ? (
            <>
              <MiniKPI
                label="Mensagens Enviadas"
                value={fmtNum(kpis.weSend.enviados)}
                sub={`${kpis.weSend.campanhas} campanhas no período`}
                icon={MessageSquare}
                color="oklch(0.65 0.15 100)"
              />
              <MiniKPI
                label="Contatos Alcançados"
                value={fmtNum(kpis.weSend.totalContatos)}
                icon={Users}
                color="oklch(0.65 0.15 100)"
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem campanhas no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/we-send")}>
                Criar campanha →
              </Button>
            </div>
          )}
        </ModuleCard>
      </div>

      {/* ── Gráfico de Faturamento + Status dos Módulos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Faturamento Mensal</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedUnit ? selectedUnit.name : "Toda a rede"} · Últimos 6 meses
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">Data VIP</Badge>
              </div>
              {faturamentoData.length > 0 && faturamentoData.some(d => d.faturamento > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={faturamentoData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.3)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "oklch(0.18 0 0)", border: "1px solid oklch(0.3 0 0)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [fmt(value), "Faturamento"]}
                    />
                    <Area type="monotone" dataKey="faturamento" stroke="oklch(0.65 0.15 200)"
                      strokeWidth={2} fill="url(#gradFat)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex flex-col items-center justify-center text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Sem dados de faturamento</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>
                    Sincronizar Data VIP →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="bg-card border-border h-full">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Status dos Módulos</h3>
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="space-y-2.5">
                {MODULE_DEFS.map((mod) => {
                  const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
                  const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
                  const hasData = kpis?.[kpiKey]?.hasData ?? false;
                  const Icon = mod.icon;
                  return (
                    <button key={mod.key} onClick={() => navigate(mod.path)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors text-left">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `${mod.color}20` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: mod.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{mod.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{mod.desc}</p>
                      </div>
                      <div className="shrink-0">
                        {isConfigured && hasData
                          ? <Badge className="text-xs h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>
                          : isConfigured
                            ? <Badge className="text-xs h-5 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Sem dados</Badge>
                            : <Badge variant="outline" className="text-xs h-5 text-muted-foreground">Configurar</Badge>
                        }
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Ranking + Unidades (admin) ── */}
      {isMasterOrAdmin && !selectedUnit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ranking de Unidades</h3>
                  <p className="text-xs text-muted-foreground">Faturamento do mês atual</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/data-vip")}>
                  Ver mais <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              {ranking.length > 0 && ranking.some(r => r.faturamento > 0) ? (
                <div className="space-y-2.5">
                  {ranking.slice(0, 5).map((unit, idx) => (
                    <div key={unit.unitId} className="flex items-center gap-3">
                      <span className={`text-xs font-bold w-5 text-center shrink-0 ${
                        idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"
                      }`}>{idx + 1}°</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                          <p className="text-xs font-semibold text-foreground shrink-0 ml-2">{fmt(unit.faturamento)}</p>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1">
                          <div className="h-1 rounded-full bg-primary"
                            style={{ width: `${ranking[0].faturamento > 0 ? (unit.faturamento / ranking[0].faturamento) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">Sincronize o Data VIP para ver o ranking</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>
                    Ir para Data VIP →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Unidades da Rede</h3>
                  <p className="text-xs text-muted-foreground">{units.length} unidades cadastradas</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/unidades")}>
                  Ver todas <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              {orgLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : units.length === 0 ? (
                <div className="py-6 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/unidades")}>
                    Adicionar unidade
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {units.slice(0, 5).map((unit) => (
                    <div key={unit.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                        {unit.city && <p className="text-xs text-muted-foreground">{unit.city}{unit.state ? `, ${unit.state}` : ""}</p>}
                      </div>
                      <Badge variant="secondary" className="text-xs h-5 shrink-0">Ativa</Badge>
                    </div>
                  ))}
                  {units.length > 5 && (
                    <button onClick={() => navigate("/unidades")}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors">
                      + {units.length - 5} unidades
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Acesso Rápido ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Acesso Rápido aos Módulos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MODULE_DEFS.map((mod) => {
            const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
            const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
            const hasData = kpis?.[kpiKey]?.hasData ?? false;
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => navigate(mod.path)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-border/60 hover:bg-card/80 transition-all relative">
                <div className="absolute top-2.5 right-2.5">
                  {isConfigured && hasData
                    ? <Wifi className="w-3 h-3 text-emerald-500" />
                    : isConfigured
                      ? <Wifi className="w-3 h-3 text-yellow-500" />
                      : <WifiOff className="w-3 h-3 text-muted-foreground/40" />}
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${mod.color}20` }}>
                  <Icon className="w-4 h-4" style={{ color: mod.color }} />
                </div>
                <p className="text-xs font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.desc}</p>
                {!isConfigured && (
                  <span className="text-xs text-muted-foreground/50 mt-1 block">Não configurado</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
