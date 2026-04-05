/**
 * RaioXPage.tsx — Raio X Clientes completo
 * Abas: Visão Geral | One-Shot | Cadência | Churn | Cohort | Barbeiros | Ações | Diagnóstico
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingDown, TrendingUp,
  Zap, Activity, Target, Scissors, Search, RefreshCw, Info, ChevronRight, Calendar,
  Wifi, WifiOff
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  // MySQL pode retornar Date objects ou strings
  if (d instanceof Date) return d.toLocaleDateString("pt-BR");
  // Se for string no formato YYYY-MM-DD, adiciona horário para evitar fuso horário
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
  }
  // Outros formatos de string
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}
function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMes(m: string) {
  if (!m) return m;
  const [y, mo] = m.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(mo) - 1]}/${y.slice(2)}`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ElementType;
}) {
  return (
    <Card className="bg-card/60 border-border/50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color || "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-5 h-5 mt-1 ${color || "text-muted-foreground"}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dot Badge ───────────────────────────────────────────────────────────────
function DotBadge({ color, label, count, pct }: { color: string; label: string; count: number; pct?: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm">{count.toLocaleString()}</span>
        {pct !== undefined && <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>}
      </div>
    </div>
  );
}

const CORES = {
  verde: "#22c55e",
  amarelo: "#eab308",
  vermelho: "#ef4444",
  azul: "#3b82f6",
  roxo: "#a855f7",
  laranja: "#f97316",
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RaioXPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [tab, setTab] = useState("visao-geral");
  const [search, setSearch] = useState("");
  const [oneShotFiltro, setOneShotFiltro] = useState<"todos" | "aguardando" | "em_risco" | "perdido">("todos");
  const [acoesTipo, setAcoesTipo] = useState<"todos" | "one_shot_risco" | "perdidos_recentes" | "em_risco">("todos");

  // Seletor de período
  type PeriodoPreset = "30d" | "60d" | "90d" | "6m" | "12m" | "custom";
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("90d");
  const [customInicio, setCustomInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split("T")[0];
  });
  const [customFim, setCustomFim] = useState(() => new Date().toISOString().split("T")[0]);

  const { dataInicio, dataFim } = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    if (periodoPreset === "custom") return { dataInicio: customInicio, dataFim: customFim };
    const dias: Record<PeriodoPreset, number> = { "30d": 30, "60d": 60, "90d": 90, "6m": 180, "12m": 365, custom: 90 };
    const inicio = new Date(now); inicio.setDate(inicio.getDate() - dias[periodoPreset]);
    return { dataInicio: fmt(inicio), dataFim: fmt(now) };
  }, [periodoPreset, customInicio, customFim]);

  const periodoLabel = useMemo(() => {
    const d1 = new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const d2 = new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
    return `${d1} → ${d2}`;
  }, [dataInicio, dataFim]);

  const baseInput = useMemo(() => ({
    orgId: org?.id,
    unitId: selectedUnit?.id,
    dataInicio,
    dataFim,
  }), [org?.id, selectedUnit?.id, dataInicio, dataFim]);

  // Queries
  const qVisao = trpc.raioX.visaoGeral.useQuery(baseInput, { enabled: !!org?.id });
  const qOneShot = trpc.raioX.oneShot.useQuery(
    { ...baseInput, status: oneShotFiltro, search, page: 1, pageSize: 100 },
    { enabled: !!org?.id && tab === "one-shot" }
  );
  const qCadencia = trpc.raioX.cadencia.useQuery(baseInput, { enabled: !!org?.id && tab === "cadencia" });
  const qChurn = trpc.raioX.churn.useQuery(baseInput, { enabled: !!org?.id && tab === "churn" });
  const [churnViewMode, setChurnViewMode] = useState<"geral" | "barbeiros">("geral");
  const qChurnBarbeiros = trpc.raioX.churnPorBarbeiro.useQuery(baseInput, { enabled: !!org?.id && tab === "churn" });
  const qCohort = trpc.raioX.cohort.useQuery(baseInput, { enabled: !!org?.id && tab === "cohort" });
  const qBarbeiros = trpc.raioX.barbeiros.useQuery(baseInput, { enabled: !!org?.id && tab === "barbeiros" });
  const qAcoes = trpc.raioX.acoes.useQuery(
    { ...baseInput, tipo: acoesTipo, page: 1, pageSize: 100 },
    { enabled: !!org?.id && tab === "acoes" }
  );
  const qDiag = trpc.raioX.diagnostico.useQuery(baseInput, { enabled: !!org?.id && tab === "diagnostico" });
  // Status do banco externo
  const qDbStatus = trpc.dataVip.dbStatus.useQuery(undefined, {
    refetchInterval: 10000,
    retry: false,
  });
  const dbConnected = qDbStatus.data?.connected ?? true;

  const v = qVisao.data;
  const isLoading = qVisao.isLoading;

  const scoreBase = v ? Math.round(
    (v.sinais.ativos / Math.max(v.sinais.totalBase, 1)) * 100
  ) : 0;
  const scoreCor = scoreBase >= 60 ? "text-green-400" : scoreBase >= 40 ? "text-yellow-400" : "text-red-400";
  const scoreLabel = scoreBase >= 60 ? "Saudável" : scoreBase >= 40 ? "Em risco" : "Crítico";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Raio X — Clientes
            {!dbConnected && (
              <span className="flex items-center gap-1 text-xs font-normal text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                <WifiOff className="w-3 h-3" /> Reconectando banco...
              </span>
            )}
            {dbConnected && qDbStatus.isFetched && (
              <span className="flex items-center gap-1 text-xs font-normal text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <Wifi className="w-3 h-3" /> Banco conectado
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · Base: {v?.sinais.totalBase.toLocaleString() ?? "—"} clientes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Seletor de período */}
          <div className="flex items-center gap-2">
            <Select value={periodoPreset} onValueChange={(v) => setPeriodoPreset(v as PeriodoPreset)}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <Calendar className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="60d">Últimos 60 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodoPreset === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customInicio}
                  onChange={e => setCustomInicio(e.target.value)}
                  className="h-8 px-2 text-xs rounded border border-border bg-background text-foreground"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={customFim}
                  onChange={e => setCustomFim(e.target.value)}
                  className="h-8 px-2 text-xs rounded border border-border bg-background text-foreground"
                />
              </div>
            )}
            {periodoPreset !== "custom" && (
              <span className="text-xs text-muted-foreground hidden sm:block">{periodoLabel}</span>
            )}
          </div>
          {v && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${scoreCor}`}>{scoreBase}%</p>
              <p className="text-xs text-muted-foreground">{scoreLabel}</p>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => qVisao.refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/40 p-1">
          {[
            { id: "visao-geral", label: "Visão Geral" },
            { id: "one-shot", label: "One-Shot" },
            { id: "cadencia", label: "Cadência" },
            { id: "churn", label: "Churn" },
            { id: "cohort", label: "Cohort" },
            { id: "barbeiros", label: "Barbeiros" },
            { id: "acoes", label: "Ações" },
            { id: "diagnostico", label: "Diagnóstico" },
          ].map(t => (
            <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── VISÃO GERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="visao-geral" className="space-y-5 mt-4">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : v ? (
            <>
              {/* Sinais da base */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="w-4 h-4" /> Sinais da base
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">ATIVOS (60d)</p>
                      <p className="text-2xl font-bold text-green-400">{v.sinais.ativos.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctAtivos}% da base</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> PERDIDOS
                      </p>
                      <p className="text-2xl font-bold text-red-400">{v.sinais.perdidos.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctPerdidos}% da base</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> EM RISCO
                      </p>
                      <p className="text-2xl font-bold text-yellow-400">{v.sinais.emRisco.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctEmRisco}% da base</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> NOVOS
                      </p>
                      <p className="text-2xl font-bold text-blue-400">{v.sinais.novos.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctNovos}% dos atendidos</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ONE-SHOT URGENTE</p>
                      <p className="text-2xl font-bold text-orange-400">{v.sinais.oneShotUrgente.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctOneShotUrgente}% dos one-shots</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">RESGATADOS</p>
                      <p className="text-2xl font-bold text-purple-400">{v.sinais.resgatados.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctResgatados}% da base</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Atividade do período */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Atividade do Período</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Clientes únicos" value={v.atividade.clientesUnicos.toLocaleString()} icon={Users} />
                  <KpiCard label="Novos clientes" value={v.atividade.novosClientes.toLocaleString()} icon={TrendingUp} color="text-blue-400" />
                  <KpiCard label="Ativos na janela" value={v.atividade.ativosNaJanela.toLocaleString()} icon={UserCheck} color="text-green-400" />
                  <KpiCard label="Resgatados" value={v.atividade.resgatados.toLocaleString()} icon={RefreshCw} color="text-purple-400" />
                </div>
              </div>

              {/* Saúde da base */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Saúde da Base</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Em risco" value={v.saude.emRisco.toLocaleString()} icon={AlertTriangle} color="text-yellow-400" />
                  <KpiCard label="Perdidos" value={v.saude.perdidos.toLocaleString()} icon={UserX} color="text-red-400" />
                  <KpiCard label="One-shot risco" value={v.saude.oneShotRisco.toLocaleString()} icon={Target} color="text-orange-400" />
                  <KpiCard label="One-shot perdido" value={v.saude.oneShotPerdido.toLocaleString()} icon={TrendingDown} color="text-red-400" />
                </div>
              </div>

              {/* Distribuições */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Distribuições da Base</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Por Perfil */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Por Perfil</CardTitle>
                      <p className="text-xs text-muted-foreground">universo: {v.sinais.totalBase.toLocaleString()} clientes</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {[
                        { label: "Ocasional", count: v.distribuicoes.porPerfil.ocasional, color: "bg-gray-400", pct: Math.round(v.distribuicoes.porPerfil.ocasional / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Fiel", count: v.distribuicoes.porPerfil.fiel, color: "bg-green-500", pct: Math.round(v.distribuicoes.porPerfil.fiel / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "One-shot", count: v.distribuicoes.porPerfil.one_shot, color: "bg-purple-500", pct: Math.round(v.distribuicoes.porPerfil.one_shot / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Regular", count: v.distribuicoes.porPerfil.regular, color: "bg-cyan-500", pct: Math.round(v.distribuicoes.porPerfil.regular / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Recorrente", count: v.distribuicoes.porPerfil.recorrente, color: "bg-blue-500", pct: Math.round(v.distribuicoes.porPerfil.recorrente / Math.max(v.sinais.totalBase, 1) * 100) },
                      ].map(item => <DotBadge key={item.label} {...item} />)}
                    </CardContent>
                  </Card>

                  {/* Por Cadência */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Por Cadência</CardTitle>
                      <p className="text-xs text-muted-foreground">Dias sem vir · REF: hoje</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {[
                        { label: "Perdido", count: v.saude.perdidos, color: "bg-red-500", pct: Math.round(v.saude.perdidos / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Em risco", count: v.saude.emRisco, color: "bg-yellow-500", pct: Math.round(v.saude.emRisco / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Ativo", count: v.sinais.ativos, color: "bg-green-500", pct: v.sinais.pctAtivos },
                      ].map(item => <DotBadge key={item.label} {...item} />)}
                    </CardContent>
                  </Card>

                  {/* Status 12m */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Status 12m</CardTitle>
                      <p className="text-xs text-muted-foreground">≤45d · 46-90d · 90d+</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {[
                        { label: "Perdido", count: v.distribuicoes.status12m.perdido, color: "bg-red-500", pct: Math.round(v.distribuicoes.status12m.perdido / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Em risco", count: v.distribuicoes.status12m.emRisco, color: "bg-yellow-500", pct: Math.round(v.distribuicoes.status12m.emRisco / Math.max(v.sinais.totalBase, 1) * 100) },
                        { label: "Saudável", count: v.distribuicoes.status12m.saudavel, color: "bg-green-500", pct: Math.round(v.distribuicoes.status12m.saudavel / Math.max(v.sinais.totalBase, 1) * 100) },
                      ].map(item => <DotBadge key={item.label} {...item} />)}
                    </CardContent>
                  </Card>

                  {/* One-Shot */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground">One-Shot</CardTitle>
                      <p className="text-xs text-muted-foreground">universo: {v.distribuicoes.oneShot.total.toLocaleString()} com 1ª visita única</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {[
                        { label: "Aguardando", count: v.distribuicoes.oneShot.aguardando, color: "bg-blue-500", pct: Math.round(v.distribuicoes.oneShot.aguardando / Math.max(v.distribuicoes.oneShot.total, 1) * 100) },
                        { label: "Em risco", count: v.distribuicoes.oneShot.emRisco, color: "bg-yellow-500", pct: Math.round(v.distribuicoes.oneShot.emRisco / Math.max(v.distribuicoes.oneShot.total, 1) * 100) },
                        { label: "Perdido", count: v.distribuicoes.oneShot.perdido, color: "bg-red-500", pct: Math.round(v.distribuicoes.oneShot.perdido / Math.max(v.distribuicoes.oneShot.total, 1) * 100) },
                      ].map(item => <DotBadge key={item.label} {...item} />)}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Novos clientes */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Clientes Novos no Período</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setTab("churn")}>
                      Ver retenção <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">TOTAL NOVOS</p>
                      <p className="text-2xl font-bold text-blue-400">{v.novosClientes.total.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctNovos}% dos atendidos</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">RECORRENTES</p>
                      <p className="text-2xl font-bold">{v.novosClientes.recorrentes.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.novosClientes.total > 0 ? Math.round(v.novosClientes.recorrentes / v.novosClientes.total * 100) : 0}% voltaram
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ONE-SHOT</p>
                      <p className="text-2xl font-bold text-orange-400">{v.novosClientes.oneShotTotal.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.novosClientes.total > 0 ? Math.round(v.novosClientes.oneShotTotal / v.novosClientes.total * 100) : 0}% só 1 visita
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">SAÚDE AQUISIÇÃO</p>
                      <p className={`text-2xl font-bold ${v.novosClientes.saudeAquisicao >= 30 ? "text-green-400" : v.novosClientes.saudeAquisicao >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                        {v.novosClientes.saudeAquisicao}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.novosClientes.saudeAquisicao >= 30 ? "Boa" : v.novosClientes.saudeAquisicao >= 15 ? "Baixa · avaliar marketing" : "Crítica · revisar marketing"}
                      </p>
                    </div>
                  </div>
                  {v.novosClientes.mensal.length > 0 && (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={v.novosClientes.mensal} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                        <Tooltip formatter={(val: number) => [val, "Novos"]} labelFormatter={fmtMes} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                        <Bar dataKey="total" fill={CORES.verde} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Nenhum dado disponível para esta unidade.</div>
          )}
        </TabsContent>

        {/* ── ONE-SHOT ─────────────────────────────────────────────────────────── */}
        <TabsContent value="one-shot" className="space-y-4 mt-4">
          {qOneShot.isLoading ? <Skeleton className="h-40" /> : qOneShot.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total One-Shot" value={qOneShot.data.resumo.total.toLocaleString()} icon={Target} />
                <KpiCard label="Aguardando" value={qOneShot.data.resumo.aguardando.toLocaleString()} icon={Activity} color="text-blue-400" sub="≤30 dias" />
                <KpiCard label="Em risco" value={qOneShot.data.resumo.emRisco.toLocaleString()} icon={AlertTriangle} color="text-yellow-400" sub="31-60 dias" />
                <KpiCard label="Perdido" value={qOneShot.data.resumo.perdido.toLocaleString()} icon={UserX} color="text-red-400" sub=">60 dias" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(["todos", "aguardando", "em_risco", "perdido"] as const).map(s => (
                  <Button key={s} variant={oneShotFiltro === s ? "default" : "outline"} size="sm"
                    onClick={() => setOneShotFiltro(s)} className="text-xs capitalize">
                    {s === "todos" ? "Todos" : s === "aguardando" ? "Aguardando" : s === "em_risco" ? "Em risco" : "Perdido"}
                  </Button>
                ))}
                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar cliente..." className="pl-8 h-8 text-xs w-48"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              <Card className="bg-card/60 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="text-left p-3">Cliente</th>
                        <th className="text-left p-3">Telefone</th>
                        <th className="text-left p-3">1ª Visita</th>
                        <th className="text-left p-3">Última Visita</th>
                        <th className="text-right p-3">Dias</th>
                        <th className="text-right p-3">Gasto</th>
                        <th className="text-left p-3">Status</th>
                      </tr></thead>
                      <tbody>
                        {qOneShot.data.clientes.map(c => (
                          <tr key={c.clienteId} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="p-3 font-medium">{c.clienteNome || "—"}</td>
                            <td className="p-3 text-muted-foreground">{c.telefone || "—"}</td>
                            <td className="p-3 text-muted-foreground">{fmtDate(c.primeiraVenda)}</td>
                            <td className="p-3 text-muted-foreground">{fmtDate(c.ultimaVenda)}</td>
                            <td className="p-3 text-right">{c.dias}d</td>
                            <td className="p-3 text-right">{fmtMoeda(c.totalGasto)}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={
                                c.status === "ativo" ? "border-blue-500/50 text-blue-400" :
                                c.status === "em_risco" ? "border-yellow-500/50 text-yellow-400" :
                                "border-red-500/50 text-red-400"
                              }>{c.status === "ativo" ? "Aguardando" : c.status === "em_risco" ? "Em risco" : "Perdido"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {qOneShot.data.clientes.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── CADÊNCIA ─────────────────────────────────────────────────────────── */}
        <TabsContent value="cadencia" className="space-y-4 mt-4">
          {qCadencia.isLoading ? <Skeleton className="h-40" /> : qCadencia.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard label="Clientes com cadência" value={qCadencia.data.total.toLocaleString()} icon={Activity} sub=">1 visita" />
                <KpiCard label="Intervalo médio" value={`${qCadencia.data.mediaGeral}d`} icon={RefreshCw} sub="entre visitas" />
                <KpiCard label="Frequentes" value={qCadencia.data.distribuicao.mto_frequente.toLocaleString()} icon={TrendingUp} color="text-green-400" sub="≤20 dias" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Cadência</CardTitle></CardHeader>
                  <CardContent>
                    {[
                      { label: "Perdido (>90d)", count: qCadencia.data.distribuicao.perdido, color: "bg-red-500" },
                      { label: "Em risco (61-90d)", count: qCadencia.data.distribuicao.em_risco, color: "bg-yellow-500" },
                      { label: "Espaçado (46-60d)", count: qCadencia.data.distribuicao.espacado, color: "bg-orange-500" },
                      { label: "Regular (21-45d)", count: qCadencia.data.distribuicao.regular, color: "bg-blue-500" },
                      { label: "Mto frequente (≤20d)", count: qCadencia.data.distribuicao.mto_frequente, color: "bg-green-500" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 py-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                        <span className="text-sm flex-1">{item.label}</span>
                        <span className="font-semibold text-sm">{item.count.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {qCadencia.data.total > 0 ? Math.round(item.count / qCadencia.data.total * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top Clientes por Frequência</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left p-2">Cliente</th>
                          <th className="text-right p-2">Visitas</th>
                          <th className="text-right p-2">Intervalo</th>
                        </tr></thead>
                        <tbody>
                          {qCadencia.data.clientes.slice(0, 15).map(c => (
                            <tr key={c.clienteId} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="p-2">{c.clienteNome || "—"}</td>
                              <td className="p-2 text-right">{c.totalVisitas}</td>
                              <td className="p-2 text-right">{c.diasMedios}d</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ── CHURN ────────────────────────────────────────────────────────────── */}
        <TabsContent value="churn" className="space-y-4 mt-4">
          {/* Toggle Geral / Por Barbeiro */}
          <div className="flex items-center gap-2">
            <Button
              variant={churnViewMode === "geral" ? "default" : "outline"}
              size="sm" className="text-xs"
              onClick={() => setChurnViewMode("geral")}
            >Visão Geral</Button>
            <Button
              variant={churnViewMode === "barbeiros" ? "default" : "outline"}
              size="sm" className="text-xs"
              onClick={() => setChurnViewMode("barbeiros")}
            ><Scissors className="w-3 h-3 mr-1" />Por Barbeiro</Button>
          </div>

          {churnViewMode === "geral" && (
            <>{qChurn.isLoading ? <Skeleton className="h-40" /> : qChurn.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Taxa de Churn" value={`${qChurn.data.resumo.taxaChurn}%`} icon={TrendingDown} color="text-red-400" />
                <KpiCard label="Perdidos" value={qChurn.data.resumo.perdidos.toLocaleString()} icon={UserX} color="text-red-400" sub=">90 dias" />
                <KpiCard label="Em risco" value={qChurn.data.resumo.emRisco.toLocaleString()} icon={AlertTriangle} color="text-yellow-400" sub="61-90 dias" />
                <KpiCard label="Receita em risco" value={fmtMoeda(qChurn.data.resumo.receitaPerdida)} icon={TrendingDown} color="text-orange-400" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Última visita por mês</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={qChurn.data.churnMensal} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 10, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                        <Tooltip formatter={(val: number) => [val, "Clientes"]} labelFormatter={fmtMes} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                        <Bar dataKey="total" fill={CORES.vermelho} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Perdidos Recentes</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left p-2">Cliente</th>
                          <th className="text-left p-2">Telefone</th>
                          <th className="text-right p-2">Última Visita</th>
                          <th className="text-right p-2">Dias</th>
                        </tr></thead>
                        <tbody>
                          {qChurn.data.perdidosRecentes.slice(0, 20).map(c => (
                            <tr key={c.clienteId} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="p-2">{c.clienteNome || "—"}</td>
                              <td className="p-2 text-muted-foreground">{c.telefone || "—"}</td>
                              <td className="p-2 text-right">{fmtDate(c.ultimaVenda)}</td>
                              <td className="p-2 text-right text-red-400">{c.dias}d</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}</>
          )}

          {churnViewMode === "barbeiros" && (
            <>{qChurnBarbeiros.isLoading ? <Skeleton className="h-60" /> : qChurnBarbeiros.data ? (
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-yellow-400" />
                  Retenção por Barbeiro
                </CardTitle>
                <p className="text-xs text-muted-foreground">Clientes atendidos no período · status atual baseado na última visita de todos os tempos · use períodos mais antigos (ex: 12 meses) para ver churn real</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="text-left p-3">Barbeiro</th>
                        <th className="text-right p-3">Clientes</th>
                        <th className="text-right p-3">Ativos</th>
                        <th className="text-right p-3">Em Risco</th>
                        <th className="text-right p-3">Perdidos</th>
                        <th className="text-right p-3">One-Shot</th>
                        <th className="text-right p-3">Retenção</th>
                        <th className="text-right p-3">Churn</th>
                        <th className="text-right p-3">Méd. Visitas</th>
                        <th className="text-right p-3">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qChurnBarbeiros.data.barbeiros.map(b => (
                        <tr key={b.colaboradorId} className="border-b border-border/20 hover:bg-muted/20">
                          <td className="p-3 font-medium">{b.colaboradorNome}</td>
                          <td className="p-3 text-right">{b.totalClientes.toLocaleString()}</td>
                          <td className="p-3 text-right text-green-400">{b.ativos.toLocaleString()}</td>
                          <td className="p-3 text-right text-yellow-400">{b.emRisco.toLocaleString()}</td>
                          <td className="p-3 text-right text-red-400">{b.perdidos.toLocaleString()}</td>
                          <td className="p-3 text-right text-purple-400">{b.oneShots.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <span className={`font-semibold ${
                              b.taxaRetencao >= 60 ? "text-green-400" : b.taxaRetencao >= 40 ? "text-yellow-400" : "text-red-400"
                            }`}>{b.taxaRetencao}%</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-semibold ${
                              b.taxaChurn <= 20 ? "text-green-400" : b.taxaChurn <= 40 ? "text-yellow-400" : "text-red-400"
                            }`}>{b.taxaChurn}%</span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{b.mediaVisitas}x</td>
                          <td className="p-3 text-right text-muted-foreground">{fmtMoeda(b.ticketMedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}</>
          )}
        </TabsContent>

        {/* ── COHORT ───────────────────────────────────────────────────────────── */}
        <TabsContent value="cohort" className="space-y-4 mt-4">
          {qCohort.isLoading ? <Skeleton className="h-40" /> : qCohort.data ? (
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cohort por Mês de Entrada (últimos 12 meses)</CardTitle>
                <p className="text-xs text-muted-foreground">Retenção e fidelização por coorte de primeira visita</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left p-3">Coorte</th>
                      <th className="text-right p-3">Entrada</th>
                      <th className="text-right p-3">Voltaram</th>
                      <th className="text-right p-3">Retenção</th>
                      <th className="text-right p-3">Fidelizados</th>
                      <th className="text-right p-3">Fidelização</th>
                      <th className="text-right p-3">Média Visitas</th>
                      <th className="text-right p-3">Ticket Médio</th>
                    </tr></thead>
                    <tbody>
                      {qCohort.data.cohorts.map(c => (
                        <tr key={c.cohort} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium">{fmtMes(c.cohort)}</td>
                          <td className="p-3 text-right">{c.totalEntrada}</td>
                          <td className="p-3 text-right">{c.voltaram}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaRetencao >= 30 ? "text-green-400" : c.taxaRetencao >= 15 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaRetencao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.fidelizados}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaFidelizacao >= 20 ? "text-green-400" : c.taxaFidelizacao >= 10 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaFidelizacao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.mediaVisitas}</td>
                          <td className="p-3 text-right">{fmtMoeda(c.mediaGasto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {qCohort.data.cohorts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Dados insuficientes para análise de cohort.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── BARBEIROS ────────────────────────────────────────────────────────── */}
        <TabsContent value="barbeiros" className="space-y-4 mt-4">
          {qBarbeiros.isLoading ? <Skeleton className="h-40" /> : qBarbeiros.data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Atendimentos por Barbeiro</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={qBarbeiros.data.barbeiros.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#888" }} />
                        <YAxis type="category" dataKey="colaboradorNome" width={100} tick={{ fontSize: 10, fill: "#aaa" }} />
                        <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                        <Bar dataKey="totalAtendimentos" fill={CORES.azul} radius={[0, 3, 3, 0]} name="Atendimentos" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento por Barbeiro</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={qBarbeiros.data.barbeiros.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={val => `R$${(val/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="colaboradorNome" width={100} tick={{ fontSize: 10, fill: "#aaa" }} />
                        <Tooltip formatter={(val: number) => [fmtMoeda(val), "Faturamento"]} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                        <Bar dataKey="faturamento" fill={CORES.verde} radius={[0, 3, 3, 0]} name="Faturamento" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card className="bg-card/60 border-border/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left p-3">Barbeiro</th>
                      <th className="text-right p-3">Atendimentos</th>
                      <th className="text-right p-3">Clientes únicos</th>
                      <th className="text-right p-3">Novos clientes</th>
                      <th className="text-right p-3">Faturamento</th>
                      <th className="text-right p-3">Ticket médio</th>
                    </tr></thead>
                    <tbody>
                      {qBarbeiros.data.barbeiros.map(b => (
                        <tr key={b.colaboradorId} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium flex items-center gap-2">
                            <Scissors className="w-3.5 h-3.5 text-muted-foreground" />{b.colaboradorNome}
                          </td>
                          <td className="p-3 text-right">{b.totalAtendimentos.toLocaleString()}</td>
                          <td className="p-3 text-right">{b.clientesUnicos.toLocaleString()}</td>
                          <td className="p-3 text-right text-blue-400">{b.novosClientes}</td>
                          <td className="p-3 text-right">{fmtMoeda(b.faturamento)}</td>
                          <td className="p-3 text-right">{fmtMoeda(b.ticketMedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── AÇÕES ────────────────────────────────────────────────────────────── */}
        <TabsContent value="acoes" className="space-y-4 mt-4">
          {qAcoes.isLoading ? <Skeleton className="h-40" /> : qAcoes.data ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Prioridade Alta" value={qAcoes.data.resumo.alta.toLocaleString()} icon={AlertTriangle} color="text-red-400" />
                <KpiCard label="Prioridade Média" value={qAcoes.data.resumo.media.toLocaleString()} icon={Activity} color="text-yellow-400" />
                <KpiCard label="Prioridade Baixa" value={qAcoes.data.resumo.baixa.toLocaleString()} icon={Info} color="text-blue-400" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { id: "todos", label: "Todos" },
                  { id: "one_shot_risco", label: "One-Shot em risco" },
                  { id: "perdidos_recentes", label: "Perdidos recentes" },
                  { id: "em_risco", label: "Em risco" },
                ] as const).map(t => (
                  <Button key={t.id} variant={acoesTipo === t.id ? "default" : "outline"} size="sm"
                    onClick={() => setAcoesTipo(t.id)} className="text-xs">
                    {t.label}
                  </Button>
                ))}
              </div>
              <Card className="bg-card/60 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="text-left p-3">Cliente</th>
                        <th className="text-left p-3">Telefone</th>
                        <th className="text-right p-3">Última Visita</th>
                        <th className="text-right p-3">Dias</th>
                        <th className="text-right p-3">Visitas</th>
                        <th className="text-left p-3">Prioridade</th>
                        <th className="text-left p-3">Ação</th>
                      </tr></thead>
                      <tbody>
                        {qAcoes.data.clientes.map(c => (
                          <tr key={c.clienteId} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="p-3 font-medium">{c.clienteNome || "—"}</td>
                            <td className="p-3 text-muted-foreground">{c.telefone || "—"}</td>
                            <td className="p-3 text-right">{fmtDate(c.ultimaVenda)}</td>
                            <td className="p-3 text-right">{c.dias}d</td>
                            <td className="p-3 text-right">{c.totalVisitas}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={
                                c.prioridade === "alta" ? "border-red-500/50 text-red-400" :
                                c.prioridade === "media" ? "border-yellow-500/50 text-yellow-400" :
                                "border-blue-500/50 text-blue-400"
                              }>{c.prioridade}</Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {c.tipoAcao === "one_shot" ? "Convidar para 2ª visita" :
                               c.tipoAcao === "risco" ? "Oferecer promoção" :
                               c.tipoAcao === "perdido_recente" ? "Reativar com desconto" : "Campanha de reativação"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {qAcoes.data.clientes.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">Nenhum cliente na fila de ações.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── DIAGNÓSTICO ──────────────────────────────────────────────────────── */}
        <TabsContent value="diagnostico" className="space-y-4 mt-4">
          {qDiag.isLoading ? <Skeleton className="h-40" /> : qDiag.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Score de qualidade" value={`${qDiag.data.qualidade.score}%`} icon={Activity}
                  color={qDiag.data.qualidade.score >= 80 ? "text-green-400" : qDiag.data.qualidade.score >= 60 ? "text-yellow-400" : "text-red-400"} />
                <KpiCard label="Total de clientes" value={qDiag.data.total.toLocaleString()} icon={Users} />
                <KpiCard label="Sem telefone" value={qDiag.data.qualidade.semTelefone.toLocaleString()} icon={AlertTriangle} color="text-yellow-400"
                  sub={`${qDiag.data.qualidade.pctSemTelefone}% da base`} />
                <KpiCard label="Sem cadastro" value={qDiag.data.qualidade.semCadastro.toLocaleString()} icon={UserX} color="text-orange-400"
                  sub={`${qDiag.data.qualidade.pctSemCadastro}% da base`} />
              </div>
              {qDiag.data.alertas.length > 0 && (
                <Card className="bg-yellow-500/10 border-yellow-500/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Alertas de qualidade
                    </p>
                    {qDiag.data.alertas.map((a, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {a}</p>
                    ))}
                  </CardContent>
                </Card>
              )}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por número de visitas</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={qDiag.data.visitasDistribuicao.slice(0, 15)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="visitas" tick={{ fontSize: 11, fill: "#888" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                      <Tooltip formatter={(val: number) => [val.toLocaleString(), "Clientes"]} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                      <Bar dataKey="clientes" fill={CORES.roxo} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
