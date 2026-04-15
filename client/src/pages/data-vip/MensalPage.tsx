/**
 * MensalPage.tsx — Análise mensal detalhada do Data VIP
 * Painel de filtros avançado: data início/fim (mês+ano), tipo (Todos/Colaborador/Caixa),
 * colaborador individual. Gráfico Evolução Mensal, KPIs do período e tabela detalhada.
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  BarChart3, DollarSign, Users, TrendingUp,
  UserPlus, Gift, Scissors, CalendarDays, Activity,
  BarChart2, TrendingDown, Sigma, Minus, Filter, ChevronDown, ChevronUp,
  User, X, Wifi, WifiOff, AlertCircle,
} from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { useChartTheme } from "@/hooks/useChartTheme";

// ── Formatadores ─────────────────────────────────────────────────────────────
function fmtMoeda(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 2,
  }).format(v);
}

function fmtMoedaCompact(v: number) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(1)} mil`;
  return fmtMoeda(v);
}

function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_NOMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Helpers de data ──────────────────────────────────────────────────────────
function getDefaultFilters() {
  const now = new Date();
  const fimMes = now.getMonth(); // 0-indexed, mês atual
  const fimAno = now.getFullYear();
  // Início: 3 meses atrás
  let inicioMes = fimMes - 2;
  let inicioAno = fimAno;
  if (inicioMes < 0) {
    inicioMes += 12;
    inicioAno -= 1;
  }
  return {
    inicioMes,   // 0-indexed
    inicioAno,
    fimMes,      // 0-indexed
    fimAno,
  };
}

// Converte mês 0-indexed + ano para string 'YYYY-MM-DD' (início do mês)
function toDataInicio(mes: number, ano: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
}

// Converte mês 0-indexed + ano para string 'YYYY-MM-DD' (início do mês seguinte = exclusive)
function toDataFim(mes: number, ano: number): string {
  const nextMes = mes + 1;
  if (nextMes > 11) {
    return `${ano + 1}-01-01`;
  }
  return `${ano}-${String(nextMes + 1).padStart(2, "0")}-01`;
}

// Gera lista de anos disponíveis (últimos 5 anos)
function getAnos(): number[] {
  const ano = new Date().getFullYear();
  return [ano, ano - 1, ano - 2, ano - 3, ano - 4];
}

// ── Configuração de métricas ─────────────────────────────────────────────────
type MetricKey =
  | "faturamento" | "atendimentos" | "ticketMedio" | "clientes" | "clientesNovos"
  | "extrasQtd" | "extrasValor" | "servicosTotal" | "produtosQtd" | "produtosValor";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  fmt: (v: number) => string;
  fmtCompact: (v: number) => string;
  isMoeda: boolean;
}

const METRICAS: MetricConfig[] = [
  { key: "faturamento",   label: "Faturamento",       color: "oklch(0.75 0.15 200)", fmt: fmtMoeda, fmtCompact: fmtMoedaCompact, isMoeda: true },
  { key: "atendimentos",  label: "Atendimentos",       color: "oklch(0.78 0.12 75)",  fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "ticketMedio",   label: "Ticket Médio",       color: "oklch(0.65 0.15 145)", fmt: fmtMoeda, fmtCompact: fmtMoedaCompact, isMoeda: true },
  { key: "clientes",      label: "Clientes",           color: "oklch(0.75 0.13 30)",  fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "clientesNovos", label: "Clientes Novos",     color: "oklch(0.70 0.15 330)", fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "extrasQtd",     label: "Extras (Qtd)",       color: "oklch(0.72 0.14 60)",  fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "extrasValor",   label: "Extras (R$)",        color: "oklch(0.68 0.15 50)",  fmt: fmtMoeda, fmtCompact: fmtMoedaCompact, isMoeda: true },
  { key: "servicosTotal", label: "Serviços Totais",    color: "oklch(0.70 0.14 220)", fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "produtosQtd",   label: "Produtos (Qtd)",     color: "oklch(0.68 0.13 280)", fmt: v => fmtNum(v), fmtCompact: v => fmtNum(v), isMoeda: false },
  { key: "produtosValor", label: "Valor Produtos",     color: "oklch(0.65 0.14 290)", fmt: fmtMoeda, fmtCompact: fmtMoedaCompact, isMoeda: true },
];

// ── Tooltip customizado ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, metricCfg }: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number>; value: number }>;
  metricCfg: MetricConfig;
}) {
  const ct = useChartTheme();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const v = payload[0].value;

  return (
    <div
      className="rounded-xl p-3 min-w-[200px] text-sm"
      style={ct.tooltipStyle}
    >
      <div className="flex items-center gap-1.5 mb-2 text-muted-foreground font-medium text-xs">
        <CalendarDays className="w-3.5 h-3.5" />
        {d.mesLabel}
      </div>
      <div className="text-lg font-bold text-foreground mb-1">
        {metricCfg.fmt(v)}
      </div>
      <div className="text-xs text-muted-foreground mb-2">{metricCfg.label}</div>
      <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ borderTop: ct.borderSubtle }}>
        <span className="text-muted-foreground">Atendimentos:</span>
        <span className="text-right font-medium">{fmtNum(d.atendimentos)}</span>
        <span className="text-muted-foreground">Ticket Médio:</span>
        <span className="text-right font-medium">{fmtMoeda(d.ticketMedio)}</span>
        <span className="text-muted-foreground">Clientes:</span>
        <span className="text-right font-medium">{fmtNum(d.clientes)}</span>
        <span className="text-muted-foreground">Clientes Novos:</span>
        <span className="text-right font-medium">{fmtNum(d.clientesNovos)}</span>
        <span className="text-muted-foreground">Extras (Qtd):</span>
        <span className="text-right font-medium">{fmtNum(d.extrasQtd)}</span>
        <span className="text-muted-foreground">Extras (R$):</span>
        <span className="text-right font-medium">{fmtMoedaCompact(d.extrasValor)}</span>
        <span className="text-muted-foreground">Serviços:</span>
        <span className="text-right font-medium">{fmtNum(d.servicosTotal)}</span>
      </div>
    </div>
  );
}

// ── Badge de variação ────────────────────────────────────────────────────────
function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground/60">—</span>;
  const up = pct >= 0;
  return (
    <span className={`font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "↑" : "↓"}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface KpiData {
  key: string;
  label: string;
  tipo: string;
  valor: number;
  sply: { valor: number; pct: number | null };
  mom:  { valor: number; pct: number | null };
  m12:  { valor: number; pct: number | null };
  m6:   { valor: number; pct: number | null };
}

const KPI_ICONS: Record<string, React.ReactNode> = {
  faturamento:    <DollarSign  className="w-4 h-4 text-emerald-400" />,
  atendimentos:   <Users       className="w-4 h-4 text-sky-400" />,
  ticketMedio:    <TrendingUp  className="w-4 h-4 text-violet-400" />,
  clientes:       <TrendingUp  className="w-4 h-4 text-amber-400" />,
  clientesNovos:  <UserPlus    className="w-4 h-4 text-pink-400" />,
  extrasQtd:      <Gift        className="w-4 h-4 text-orange-400" />,
  extrasValor:    <Gift        className="w-4 h-4 text-orange-300" />,
  servicosTotais: <Scissors    className="w-4 h-4 text-cyan-400" />,
  diasTrabalhados:<CalendarDays className="w-4 h-4 text-teal-400" />,
  fatDia:         <Activity    className="w-4 h-4 text-lime-400" />,
};

// ── Card de KPI ──────────────────────────────────────────────────────────────
function KpiCard({ kpi }: { kpi: KpiData }) {
  const ct = useChartTheme();
  const isMoeda = kpi.tipo === "moeda";
  const fmt = (v: number) =>
    isMoeda
      ? fmtMoeda(v)
      : v.toLocaleString("pt-BR", { maximumFractionDigits: kpi.key === "diasTrabalhados" ? 1 : 0 });

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden"
      style={{
        background: ct.cardBg,
        border: ct.border,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase leading-tight">
          {kpi.label}
        </span>
        {KPI_ICONS[kpi.key]}
      </div>
      <span className="text-xl font-bold text-foreground leading-tight">
        {fmt(kpi.valor)}
      </span>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5" style={{ borderTop: ct.borderSubtle, paddingTop: "0.375rem" }}>
        {[
          { label: "SPLY", data: kpi.sply },
          { label: "MOM",  data: kpi.mom  },
          { label: "M12",  data: kpi.m12  },
          { label: "M6",   data: kpi.m6   },
        ].map(({ label, data }) => (
          <span key={label} className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            {label} <PctBadge pct={data.pct} />
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiSkeleton() {
  const ct = useChartTheme();
  return (
    <div
      className="rounded-2xl p-4 space-y-2"
      style={{
        background: ct.cardBg,
        border: ct.border,
      }}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// ── Painel de Filtros ────────────────────────────────────────────────────────
interface FiltrosState {
  inicioMes: number;  // 0-indexed
  inicioAno: number;
  fimMes: number;     // 0-indexed
  fimAno: number;
  colaboradorId: number | undefined;
}

interface FiltrosAplicados extends FiltrosState {}

interface Colaborador {
  id: number;
  nome: string;
  tipo: string;
}

function FiltrosPanel({
  filtros,
  onFiltrosChange,
  colaboradores,
  loadingColabs,
}: {
  filtros: FiltrosState;
  onFiltrosChange: (f: FiltrosAplicados) => void;
  colaboradores: Colaborador[];
  loadingColabs: boolean;
}) {
  const [local, setLocal] = useState<FiltrosState>(filtros);
  const [open, setOpen] = useState(true);

  // Sincronizar quando filtros externos mudam (ex: mudança de unidade)
  useEffect(() => {
    setLocal(filtros);
  }, [filtros.inicioMes, filtros.inicioAno, filtros.fimMes, filtros.fimAno]);

  const anos = getAnos();

  function handleAplicar() {
    onFiltrosChange(local);
  }

  const colabSelecionado = colaboradores.find(c => c.id === filtros.colaboradorId);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header do painel */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Filtros</span>
          <span className="text-xs text-muted-foreground">
            {MESES_ABREV[filtros.inicioMes]}/{filtros.inicioAno} → {MESES_ABREV[filtros.fimMes]}/{filtros.fimAno}
            {colabSelecionado && ` · ${colabSelecionado.nome}`}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">

            {/* Início */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Início</label>
              <div className="flex gap-2">
                <select
                  value={local.inicioMes}
                  onChange={e => setLocal(prev => ({ ...prev, inicioMes: Number(e.target.value) }))}
                  className="flex-1 text-sm bg-muted border border-border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {MESES_NOMES.map((nome, i) => (
                    <option key={i} value={i}>{nome}</option>
                  ))}
                </select>
                <select
                  value={local.inicioAno}
                  onChange={e => setLocal(prev => ({ ...prev, inicioAno: Number(e.target.value) }))}
                  className="w-20 text-sm bg-muted border border-border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Fim */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fim</label>
              <div className="flex gap-2">
                <select
                  value={local.fimMes}
                  onChange={e => setLocal(prev => ({ ...prev, fimMes: Number(e.target.value) }))}
                  className="flex-1 text-sm bg-muted border border-border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {MESES_NOMES.map((nome, i) => (
                    <option key={i} value={i}>{nome}</option>
                  ))}
                </select>
                <select
                  value={local.fimAno}
                  onChange={e => setLocal(prev => ({ ...prev, fimAno: Number(e.target.value) }))}
                  className="w-20 text-sm bg-muted border border-border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Colaborador */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Colaborador
                {colaboradores.length > 0 && (
                  <span className="ml-1 text-muted-foreground/60 font-normal">({colaboradores.length})</span>
                )}
              </label>
              <select
                value={local.colaboradorId ?? ""}
                onChange={e => setLocal(prev => ({
                  ...prev,
                  colaboradorId: e.target.value ? Number(e.target.value) : undefined,
                }))}
                disabled={loadingColabs}
                className="w-full text-sm bg-muted border border-border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="">Todos os colaboradores</option>
                {colaboradores.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Botão Aplicar */}
          <div className="flex justify-end mt-4">
            <button
              onClick={handleAplicar}
              className="px-6 py-2 rounded-lg text-sm font-bold transition-all
                bg-amber-400 hover:bg-amber-300 text-black shadow-md hover:shadow-amber-400/30"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function MensalPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const ct = useChartTheme();
  const [metricKey, setMetricKey] = useState<MetricKey>("faturamento");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  // Filtros aplicados (controlam as queries)
  const defaultFilters = useMemo(() => getDefaultFilters(), []);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAplicados>({
    ...defaultFilters,
    colaboradorId: undefined,
  });

  const metricCfg = METRICAS.find(m => m.key === metricKey)!;

  // Strings de data para as queries
  const dataInicio = useMemo(
    () => toDataInicio(filtrosAplicados.inicioMes, filtrosAplicados.inicioAno),
    [filtrosAplicados.inicioMes, filtrosAplicados.inicioAno]
  );
  const dataFim = useMemo(
    () => toDataFim(filtrosAplicados.fimMes, filtrosAplicados.fimAno),
    [filtrosAplicados.fimMes, filtrosAplicados.fimAno]
  );

  // Número de meses no período (para KPIs)
  const mesesNoPeriodo = useMemo(() => {
    const diffAnos = filtrosAplicados.fimAno - filtrosAplicados.inicioAno;
    const diffMeses = filtrosAplicados.fimMes - filtrosAplicados.inicioMes;
    return Math.max(1, diffAnos * 12 + diffMeses + 1);
  }, [filtrosAplicados]);

  // Strings de data para a query de colaboradores (usa filtros aplicados para mostrar
  // apenas colaboradores com vendas no período selecionado)
  const colabDataInicio = dataInicio;
  const colabDataFim = dataFim;

  // Lista de colaboradores filtrada pelo período aplicado
  const qColabs = trpc.dataVip.listarColaboradoresMensal.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, dataInicio: colabDataInicio, dataFim: colabDataFim },
    { enabled: !!org?.id }
  );

  // Gráfico detalhado com filtros
  const qDetalhado = trpc.dataVip.faturamentoMensalFiltrado.useQuery(
    {
      orgId: org?.id,
      unitId: selectedUnit?.id,
      dataInicio,
      dataFim,
      colaboradorId: filtrosAplicados.colaboradorId,
    },
    { enabled: !!org?.id }
  );

  // KPIs do período selecionado (usa meses calculados + colaborador filtrado)
  const qKpis = trpc.dataVip.kpisPeriodoMensal.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, meses: mesesNoPeriodo, colaboradorId: filtrosAplicados.colaboradorId },
    { enabled: !!org?.id }
  );

  // Status do banco de dados
  const qDbStatus = trpc.dataVip.dbStatus.useQuery(undefined, {
    refetchInterval: 10000,
    retry: false,
  });
  const dbConnected = qDbStatus.data?.connected ?? true;

  // Dados formatados para o gráfico
  const chartData = useMemo(() => {
    return (qDetalhado.data ?? []).map(m => {
      const [ano, mesNum] = m.periodo.split("-").map(Number);
      return {
        ...m,
        mesLabel: `${MESES_ABREV[mesNum - 1]}/${String(ano).slice(2)}`,
      };
    });
  }, [qDetalhado.data]);

  // Estatísticas da métrica selecionada
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const vals = chartData.map(d => d[metricKey] as number);
    const total = vals.reduce((s, v) => s + v, 0);
    const avg = total / vals.length;
    const maxVal = Math.max(...vals);
    const minVal = Math.min(...vals);
    const maxMes = chartData[vals.indexOf(maxVal)]?.mesLabel ?? "";
    const minMes = chartData[vals.indexOf(minVal)]?.mesLabel ?? "";
    return { total, avg, maxVal, minVal, maxMes, minMes };
  }, [chartData, metricKey]);

  const isKpisTimeoutRetrying = qKpis.isError && isExternalDbTimeoutError(qKpis.error) && (qKpis.failureCount ?? 0) < 3;
  const isDetalhadoTimeoutRetrying = qDetalhado.isError && isExternalDbTimeoutError(qDetalhado.error) && (qDetalhado.failureCount ?? 0) < 3;
  const isLoading = qDetalhado.isLoading || isDetalhadoTimeoutRetrying;

  // Label do período aplicado
  const periodoLabel = useMemo(() => {
    const ini = `${MESES_NOMES[filtrosAplicados.inicioMes]}/${filtrosAplicados.inicioAno}`;
    const fim = `${MESES_NOMES[filtrosAplicados.fimMes]}/${filtrosAplicados.fimAno}`;
    return ini === fim ? ini : `${ini} – ${fim}`;
  }, [filtrosAplicados]);

  // Colaborador selecionado (para badge no cabeçalho)
  const colabSelecionado = useMemo(
    () => (qColabs.data ?? []).find(c => c.id === filtrosAplicados.colaboradorId),
    [qColabs.data, filtrosAplicados.colaboradorId]
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
            <BarChart3 className="w-6 h-6 text-primary" /> Análise Mensal
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
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"}
          </p>
        </div>

        {/* Badge de colaborador ativo */}
        {colabSelecionado && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 self-center">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold tracking-widest text-primary/70 uppercase">Visualizando</span>
              <span className="text-sm font-semibold text-foreground">{colabSelecionado.nome}</span>
            </div>
            <button
              onClick={() => setFiltrosAplicados(prev => ({ ...prev, colaboradorId: undefined }))}
              className="ml-1 p-1 rounded-lg hover:bg-primary/20 transition-colors text-muted-foreground hover:text-foreground"
              title="Remover filtro de colaborador"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Painel de Filtros ───────────────────────────────────────────────── */}
      <FiltrosPanel
        filtros={filtrosAplicados}
        onFiltrosChange={setFiltrosAplicados}
        colaboradores={qColabs.data ?? []}
        loadingColabs={qColabs.isLoading}
      />

      {/* Banner de carregamento */}
      {(isLoading || (qDetalhado.isError && isExternalDbTimeoutError(qDetalhado.error) && (qDetalhado.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(qDetalhado.failureCount ?? 0) + 1} />
      )}
      {qDetalhado.isError && !isExternalDbTimeoutError(qDetalhado.error) && (
        <DataVipErrorState onRetry={() => qDetalhado.refetch()} />
      )}

      {/* ── Gráfico Evolução Mensal ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Título + ícone */}
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              Evolução Mensal
              <span className="text-xs text-muted-foreground font-normal ml-1">({periodoLabel})</span>
            </CardTitle>

            {/* Controles: toggle linha/barras + seletor de métrica */}
            <div className="flex items-center gap-2">
              {/* Toggle tipo de gráfico */}
              <div className="flex border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setChartType("line")}
                  className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                    chartType === "line"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setChartType("bar")}
                  className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                    chartType === "bar"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Seletor de métrica */}
              <select
                value={metricKey}
                onChange={e => setMetricKey(e.target.value as MetricKey)}
                className="text-xs bg-muted border border-border rounded px-2 py-1.5 min-w-[140px]"
              >
                {METRICAS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards de resumo: Acumulado, Média/Mês, Máximo, Mínimo */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Sigma className="w-3 h-3" /> Acumulado
                </div>
                <div className="text-sm font-bold text-foreground">
                  {metricCfg.fmtCompact(stats.total)}
                </div>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Minus className="w-3 h-3" /> Média/Mês
                </div>
                <div className="text-sm font-bold text-foreground">
                  {metricCfg.fmtCompact(stats.avg)}
                </div>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 uppercase tracking-wider mb-1">
                  <TrendingUp className="w-3 h-3" /> Máximo
                </div>
                <div className="text-sm font-bold text-emerald-400">
                  {metricCfg.fmtCompact(stats.maxVal)}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">{stats.maxMes}</span>
                </div>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-red-400 uppercase tracking-wider mb-1">
                  <TrendingDown className="w-3 h-3" /> Mínimo
                </div>
                <div className="text-sm font-bold text-red-400">
                  {metricCfg.fmtCompact(stats.minVal)}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">{stats.minMes}</span>
                </div>
              </div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              <AlertCircle className="w-4 h-4 mr-2" /> Sem dados para o período selecionado
            </div>
          ) : (
<ResponsiveContainer width="100%" height={260}>
              {chartType === "bar" ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metricCfg.color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={metricCfg.color} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => metricCfg.isMoeda ? (v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(2)}`) : fmtNum(v)}
                    tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={false} tickLine={false} width={55}
                  />
                  <Tooltip
                    content={<CustomTooltip metricCfg={metricCfg} />}
                    cursor={{ fill: "oklch(0.76 0.145 72 / 0.06)" }}
                  />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="oklch(0.76 0.145 72 / 0.5)"
                      strokeDasharray="5 3"
                      label={{ value: "Média", position: "right", fontSize: 10, fill: "oklch(0.76 0.145 72 / 0.7)" }}
                    />
                  )}
                  <Bar dataKey={metricKey} fill="url(#barGrad)" radius={[5, 5, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => metricCfg.isMoeda ? (v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(2)}`) : fmtNum(v)}
                    tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={false} tickLine={false} width={55}
                  />
                  <Tooltip
                    content={<CustomTooltip metricCfg={metricCfg} />}
                    cursor={{ stroke: "oklch(0.76 0.145 72 / 0.3)", strokeWidth: 1, strokeDasharray: "4 2" }}
                  />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="oklch(0.76 0.145 72 / 0.5)"
                      strokeDasharray="5 3"
                      label={{ value: "Média", position: "right", fontSize: 10, fill: "oklch(0.76 0.145 72 / 0.7)" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={metricKey}
                    stroke={metricCfg.color}
                    strokeWidth={2.5}
                    dot={{ fill: metricCfg.color, r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: ct.isDark ? "oklch(0.14 0.012 260)" : "oklch(0.97 0.003 80)" }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── KPIs do período (soma dos N meses selecionados) ────────────────── */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-semibold font-display tracking-tight">
            KPIs do Período
            {qKpis.data?.periodoLabel
              ? <span className="text-muted-foreground font-normal text-sm ml-2">({qKpis.data.periodoLabel})</span>
              : null
            }
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            SPLY = mesmo período ano anterior · MOM = período anterior equivalente · M12 = média mensal 12m · M6 = média mensal 6m
          </p>
        </div>

        {(qKpis.isLoading || isKpisTimeoutRetrying) ? (
          <DataVipLoadingState rows={2} message="Carregando KPIs do período..." />
        ) : qKpis.isError ? (
          <DataVipErrorState onRetry={() => qKpis.refetch()} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {qKpis.isLoading
              ? Array.from({ length: 10 }).map((_, i) => <KpiSkeleton key={i} />)
              : (qKpis.data?.kpis ?? []).map(kpi => (
                  <KpiCard key={kpi.key} kpi={kpi as KpiData} />
                ))
            }
          </div>
        )}
      </div>

      {/* Tabela mensal detalhada */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detalhamento Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-3">Mês</th>
                  <th className="text-right py-2 pr-3">Faturamento</th>
                  <th className="text-right py-2 pr-3">Atend.</th>
                  <th className="text-right py-2 pr-3">Ticket Médio</th>
                  <th className="text-right py-2 pr-3">Clientes</th>
                  <th className="text-right py-2 pr-3">Extras Qtd</th>
                  <th className="text-right py-2 pr-3">Extras R$</th>
                  <th className="text-right py-2">Serviços</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="py-2 pr-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : chartData.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{r.mesLabel}</td>
                        <td className="py-2 pr-3 text-right text-green-400">{fmtMoeda(r.faturamento)}</td>
                        <td className="py-2 pr-3 text-right">{fmtNum(r.atendimentos)}</td>
                        <td className="py-2 pr-3 text-right">{fmtMoeda(r.ticketMedio)}</td>
                        <td className="py-2 pr-3 text-right">{fmtNum(r.clientes)}</td>
                        <td className="py-2 pr-3 text-right">{fmtNum(r.extrasQtd)}</td>
                        <td className="py-2 pr-3 text-right">{fmtMoedaCompact(r.extrasValor)}</td>
                        <td className="py-2 text-right">{fmtNum(r.servicosTotal)}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
