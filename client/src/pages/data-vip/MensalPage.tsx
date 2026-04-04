/**
 * MensalPage.tsx — Análise mensal detalhada do Data VIP
 * Gráfico Evolução Mensal com toggle linha/barras, seletor de métrica,
 * cards de resumo (acumulado/média/máximo/mínimo) e tooltip rico.
 * KPIs mostram a SOMA do período selecionado (3/6/12/24 meses) com comparativos SPLY/MOM/M12/M6.
 */
import { useState, useMemo } from "react";
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
  BarChart3, AlertCircle, DollarSign, Users, TrendingUp,
  UserPlus, Gift, Scissors, CalendarDays, Activity,
  BarChart2, TrendingDown, Sigma, Minus,
} from "lucide-react";

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
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const v = payload[0].value;

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl min-w-[200px] text-sm">
      <div className="flex items-center gap-1.5 mb-2 text-muted-foreground font-medium text-xs">
        <CalendarDays className="w-3.5 h-3.5" />
        {d.mesLabel}
      </div>
      <div className="text-lg font-bold text-foreground mb-1">
        {metricCfg.fmt(v)}
      </div>
      <div className="text-xs text-muted-foreground mb-2">{metricCfg.label}</div>
      <div className="border-t border-border pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
  const isMoeda = kpi.tipo === "moeda";
  const fmt = (v: number) =>
    isMoeda
      ? fmtMoeda(v)
      : v.toLocaleString("pt-BR", { maximumFractionDigits: kpi.key === "diasTrabalhados" ? 1 : 0 });

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase leading-tight">
          {kpi.label}
        </span>
        {KPI_ICONS[kpi.key]}
      </div>
      <span className="text-xl font-bold text-foreground leading-tight">
        {fmt(kpi.valor)}
      </span>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
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
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function MensalPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [meses, setMeses] = useState(12);
  const [metricKey, setMetricKey] = useState<MetricKey>("faturamento");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const metricCfg = METRICAS.find(m => m.key === metricKey)!;

  // Gráfico detalhado (usa faturamentoMensalDetalhado para ter todos os campos)
  const qDetalhado = trpc.dataVip.faturamentoMensalDetalhado.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, meses },
    { enabled: !!org?.id }
  );

  // KPIs do período selecionado (SOMA de N meses completos)
  const qKpis = trpc.dataVip.kpisPeriodoMensal.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, meses },
    { enabled: !!org?.id }
  );

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

  const isLoading = qDetalhado.isLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho com seletor único de período */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Análise Mensal
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"}
          </p>
        </div>
        <select
          value={meses}
          onChange={e => setMeses(Number(e.target.value))}
          className="text-sm bg-muted border border-border rounded px-2 py-1.5"
        >
          {[3, 6, 12, 24].map(n => (
            <option key={n} value={n}>Últimos {n} meses</option>
          ))}
        </select>
      </div>

      {/* ── Gráfico Evolução Mensal ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Título + ícone */}
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              Evolução Mensal
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
              <AlertCircle className="w-4 h-4 mr-2" /> Sem dados — sincronize para ver o histórico
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              {chartType === "bar" ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" vertical={false} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => metricCfg.isMoeda ? `R$${(v/1000).toFixed(0)}k` : fmtNum(v)}
                    tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                  />
                  <Tooltip
                    content={<CustomTooltip metricCfg={metricCfg} />}
                    cursor={{ fill: "oklch(0.3 0 0 / 0.4)" }}
                  />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="oklch(0.6 0 0)"
                      strokeDasharray="5 3"
                      label={{ value: "Média", position: "right", fontSize: 10, fill: "oklch(0.6 0 0)" }}
                    />
                  )}
                  <Bar dataKey={metricKey} fill={metricCfg.color} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" vertical={false} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => metricCfg.isMoeda ? `R$${(v/1000).toFixed(0)}k` : fmtNum(v)}
                    tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={55}
                  />
                  <Tooltip
                    content={<CustomTooltip metricCfg={metricCfg} />}
                    cursor={{ stroke: "oklch(0.6 0 0)", strokeWidth: 1 }}
                  />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="oklch(0.6 0 0)"
                      strokeDasharray="5 3"
                      label={{ value: "Média", position: "right", fontSize: 10, fill: "oklch(0.6 0 0)" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={metricKey}
                    stroke={metricCfg.color}
                    strokeWidth={2.5}
                    dot={{ fill: metricCfg.color, r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "white" }}
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
          <h2 className="text-base font-semibold">
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

        {qKpis.isError ? (
          <div className="flex items-center gap-2 text-red-400 text-sm p-4 bg-red-400/10 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            Erro ao carregar KPIs. Verifique a conexão com o banco externo.
          </div>
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
