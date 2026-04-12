/**
 * AberturasChart.tsx
 * Bloco "Aberturas" da página de Faturamento
 * 7 abas: Por período | Por barbeiro | Por grupo | Por item | Dia da semana | Pagamento | Faixa horária
 * Cada aba: KPIs (Acumulado, Média, Máximo, Mínimo) + gráfico (Barra/Linha/Pizza) + tabela ranking
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Area, AreaChart,
} from "recharts";
import { TrendingUp, BarChart2, PieChartIcon, Zap, Target, TrendingDown, Minus } from "lucide-react";
import { useChartTheme } from "../../hooks/useChartTheme";

const GOLD = "oklch(0.76 0.145 72)";
const GOLD_DIM = "oklch(0.76 0.145 72 / 0.18)";
const PIE_COLORS = ["oklch(0.76 0.145 72)", "oklch(0.72 0.14 65)", "oklch(0.68 0.16 55)", "oklch(0.65 0.15 200)", "oklch(0.72 0.16 145)", "oklch(0.65 0.15 280)", "oklch(0.65 0.15 320)", "oklch(0.82 0.12 80)", "oklch(0.88 0.10 90)"];

type ViewType = "periodo" | "barbeiro" | "grupo" | "item" | "diaSemana" | "pagamento" | "faixaHoraria";
type ChartType = "barra" | "linha" | "pizza";
type Granularidade = "dia" | "semana" | "mes";
type TopLimit = 10 | 20 | 50 | 0;

interface AberturasChartProps {
  orgId?: number;
  unitId?: number;
  dataInicio: string;
  dataFim: string;
}

const VIEWS: { id: ViewType; label: string; desc: string }[] = [
  { id: "periodo",      label: "Por período",    desc: "Detalha por dia, semana ou mês." },
  { id: "barbeiro",     label: "Por barbeiro",   desc: "Ranking e participação por colaborador." },
  { id: "grupo",        label: "Por grupo",      desc: "Composição por grupo de produto." },
  { id: "item",         label: "Por item",       desc: "Ranking por produto/serviço (Top N)." },
  { id: "diaSemana",    label: "Dia da semana",  desc: "Distribuição Dom…Sáb." },
  { id: "pagamento",    label: "Pagamento",      desc: "Distribuição por forma de pagamento." },
  { id: "faixaHoraria", label: "Faixa horária",  desc: "Picos e ociosidade ao longo do dia." },
];

function fmt(v: number) {
  if (!isFinite(v) || isNaN(v)) return "R$ 0,00";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)} mil`;
  return `R$ ${v.toFixed(2)}`;
}

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v.toFixed(0)}`;
}

interface KpiBarProps {
  acumulado: number;
  media: number;
  maximo: { valor: number; label: string };
  minimo: { valor: number; label: string };
}

function KpiBar({ acumulado, media, maximo, minimo }: KpiBarProps) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-4">
      <div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
          <Zap className="w-3 h-3 text-yellow-500" /> Acumulado
        </div>
        <div className="text-lg font-bold" style={{ color: GOLD }}>{fmt(acumulado)}</div>
      </div>
      <div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
          <Minus className="w-3 h-3" /> Média
        </div>
        <div className="text-lg font-bold">{fmt(media)}</div>
      </div>
      <div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
          <TrendingUp className="w-3 h-3 text-green-500" /> Máximo
        </div>
        <div className="text-lg font-bold text-green-600 dark:text-green-400">{fmt(maximo.valor)}</div>
        {maximo.label && <div className="text-[10px] text-muted-foreground truncate">{maximo.label}</div>}
      </div>
      <div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
          <TrendingDown className="w-3 h-3 text-red-500" /> Mínimo
        </div>
        <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmt(minimo.valor)}</div>
        {minimo.label && <div className="text-[10px] text-muted-foreground truncate">{minimo.label}</div>}
      </div>
    </div>
  );
}

interface ChartToggleProps {
  chartType: ChartType;
  onChange: (t: ChartType) => void;
}

function ChartToggle({ chartType, onChange }: ChartToggleProps) {
  return (
    <div className="flex gap-1">
      {(["barra", "linha", "pizza"] as ChartType[]).map(t => (
        <Button key={t} size="sm" variant={chartType === t ? "default" : "outline"}
          className={`h-7 px-2 text-xs ${chartType === t ? "bg-yellow-500 text-black" : ""}`}
          onClick={() => onChange(t)}>
          {t === "barra" ? <><BarChart2 className="w-3 h-3 mr-1" />Barra</> :
           t === "linha" ? <><TrendingUp className="w-3 h-3 mr-1" />Linha</> :
           <><PieChartIcon className="w-3 h-3 mr-1" />Pizza</>}
        </Button>
      ))}
    </div>
  );
}

interface ChartAreaProps {
  data: { label: string; valor: number }[];
  chartType: ChartType;
  media: number;
  mediaSply?: number;
  media6m?: number;
  height?: number;
}

function ChartArea({ data, chartType, media, mediaSply, media6m, height = 280 }: ChartAreaProps) {
  const ct = useChartTheme();
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl p-2 text-xs"
        style={{
          background: ct.cardBgSolid,
          border: ct.border,
          backdropFilter: "blur(16px)",
          boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.6)",
        }}
      >
        <div className="font-semibold mb-1">{label}</div>
        <div style={{ color: GOLD }}>{fmt(payload[0]?.value ?? 0)}</div>
      </div>
    );
  };

  if (chartType === "pizza") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="valor" nameKey="label" cx="50%" cy="50%"
            outerRadius={110} label={({ label: l, percent }) => `${l} ${(percent * 100).toFixed(1)}%`}
            labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => fmt(v)} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "linha") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={GOLD} stopOpacity={0.35} />
              <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: ct.axisColor }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: ct.axisColor }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "oklch(0.76 0.145 72 / 0.3)", strokeWidth: 1, strokeDasharray: "4 2" }} />
          <ReferenceLine y={media} stroke={ct.axisColor} strokeDasharray="4 3" label={{ value: "Média", position: "right", fontSize: 10, fill: ct.axisColor }} />
          {mediaSply !== undefined && mediaSply > 0 && <ReferenceLine y={mediaSply} stroke="oklch(0.76 0.145 72 / 0.7)" strokeDasharray="4 3" label={{ value: "Méd. SPLY", position: "right", fontSize: 9, fill: "oklch(0.76 0.145 72 / 0.7)" }} />}
          {media6m !== undefined && media6m > 0 && <ReferenceLine y={media6m} stroke="oklch(0.65 0.15 200 / 0.7)" strokeDasharray="4 3" label={{ value: "Méd. 6m", position: "right", fontSize: 9, fill: "oklch(0.65 0.15 200 / 0.7)" }} />}
          <Area type="monotone" dataKey="valor" stroke={GOLD} strokeWidth={2} fill="url(#areaGold)" dot={false} activeDot={{ r: 4, fill: GOLD }} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="barGoldAbert" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.95} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: ct.axisColor }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: ct.axisColor }} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: ct.cursorFill }} />
        <ReferenceLine y={media} stroke={ct.axisColor} strokeDasharray="4 3" label={{ value: "Média", position: "right", fontSize: 10, fill: ct.axisColor }} />
        {mediaSply !== undefined && mediaSply > 0 && <ReferenceLine y={mediaSply} stroke="oklch(0.76 0.145 72 / 0.7)" strokeDasharray="4 3" label={{ value: "Méd. SPLY", position: "right", fontSize: 9, fill: "oklch(0.76 0.145 72 / 0.7)" }} />}
        {media6m !== undefined && media6m > 0 && <ReferenceLine y={media6m} stroke="oklch(0.65 0.15 200 / 0.7)" strokeDasharray="4 3" label={{ value: "Méd. 6m", position: "right", fontSize: 9, fill: "oklch(0.65 0.15 200 / 0.7)" }} />}
        <Bar dataKey="valor" fill="url(#barGoldAbert)" radius={[5, 5, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface RankingTableProps {
  items: { label: string; valor: number; pct?: number; extra?: string }[];
  title: string;
}

function RankingTable({ items, title }: RankingTableProps) {
  const maxVal = Math.max(...items.map(i => i.valor), 1);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Target className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-semibold text-muted-foreground">Ranking ({items.length} {items.length === 1 ? "item" : "itens"})</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs truncate">{item.label}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {item.extra && <span className="text-[10px] text-muted-foreground">{item.extra}</span>}
                  <span className="text-xs font-semibold" style={{ color: GOLD }}>{fmt(item.valor)}</span>
                  {item.pct !== undefined && (
                    <span className="text-[10px] text-muted-foreground w-10 text-right">{item.pct.toFixed(1)}%</span>
                  )}
                </div>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${(item.valor / maxVal) * 100}%`, background: GOLD }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Aba: Por período ─────────────────────────────────────────────────────────

function TabPeriodo({ orgId, unitId, dataInicio, dataFim }: AberturasChartProps) {
  const [chartType, setChartType] = useState<ChartType>("linha");
  const [gran, setGran] = useState<Granularidade>("dia");

  const q = trpc.dataVip.evolucaoDiaria.useQuery(
    { orgId, unitId, dataInicio, dataFim },
    { retry: false }
  );

  // Calcula SPLY (mesmo período ano anterior) e Méd. 6m a partir dos dados disponíveis
  const { mediaSply, media6m } = useMemo(() => {
    if (!q.data || q.data.length === 0) return { mediaSply: 0, media6m: 0 };
    if (!dataInicio || typeof dataInicio !== "string" || dataInicio.length < 4) return { mediaSply: 0, media6m: 0 };
    const parsedDate = new Date(dataInicio + "T12:00:00Z");
    if (isNaN(parsedDate.getTime())) return { mediaSply: 0, media6m: 0 };
    const anoAtual = parsedDate.getUTCFullYear();
    // SPLY: dados do ano anterior ao período atual
    const splyData = q.data.filter(d => {
      const ano = parseInt(d.dia.slice(0, 4));
      return ano < anoAtual;
    });
    const mediaSply = splyData.length > 0
      ? splyData.reduce((s, d) => s + d.faturamento, 0) / splyData.length
      : 0;
    // Méd. 6m: média dos últimos 6 meses de dados disponíveis
    const sorted = [...q.data].sort((a, b) => a.dia.localeCompare(b.dia));
    const last6m = sorted.slice(-180); // ~6 meses em dias
    const media6m = last6m.length > 0
      ? last6m.reduce((s, d) => s + d.faturamento, 0) / last6m.length
      : 0;
    return { mediaSply, media6m };
  }, [q.data, dataInicio]);

  const data = useMemo(() => {
    if (!q.data) return [];
    if (gran === "dia") {
      return q.data
        .filter(d => d.dia && typeof d.dia === "string" && d.dia.length >= 7)
        .map(d => ({ label: d.dia.slice(5), valor: d.faturamento || 0 }));
    }
    if (gran === "semana") {
      const weeks: Record<string, number> = {};
      q.data.forEach(d => {
        if (!d.dia || typeof d.dia !== "string" || d.dia.length < 8) return;
        const dt = new Date(d.dia + "T12:00:00Z");
        if (isNaN(dt.getTime())) return;
        // 0=Dom, 1=Seg ... 6=Sáb. Recua até a segunda-feira anterior.
        const dayOfWeek = dt.getUTCDay();
        const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const mon = new Date(dt);
        mon.setUTCDate(dt.getUTCDate() - daysFromMon);
        const key = mon.toISOString().slice(0, 10);
        weeks[key] = (weeks[key] ?? 0) + (d.faturamento || 0);
      });
      return Object.entries(weeks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ label: k.slice(5), valor: v }));
    }
    // mes
    const months: Record<string, number> = {};
    q.data.forEach(d => {
      if (!d.dia || typeof d.dia !== "string" || d.dia.length < 7) return;
      const key = d.dia.slice(0, 7);
      months[key] = (months[key] ?? 0) + (d.faturamento || 0);
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ label: k, valor: v }));
  }, [q.data, gran]);

  const acumulado = data.reduce((s, d) => s + (isFinite(d.valor) ? d.valor : 0), 0);
  const media = data.length > 0 ? acumulado / data.length : 0;
  const maxItem = data.length > 0 ? data.reduce((m, d) => d.valor > m.valor ? d : m, { label: "", valor: 0 }) : { label: "", valor: 0 };
  const minItem = data.length > 0 ? data.reduce((m, d) => d.valor < m.valor ? d : m, data[0] ?? { label: "", valor: 0 }) : { label: "", valor: 0 };

  if (q.isLoading) return <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>;
  if (q.error) return <div className="h-32 flex items-center justify-center text-red-400 text-sm">Dados indisponíveis</div>;

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Granularidade:</span>
        {(["dia", "semana", "mes"] as Granularidade[]).map(g => (
          <Button key={g} size="sm" variant={gran === g ? "default" : "outline"}
            className={`h-6 px-2 text-xs ${gran === g ? "bg-yellow-500 text-black" : ""}`}
            onClick={() => setGran(g)}>
            {g === "dia" ? "Dia" : g === "semana" ? "Semana" : "Mês"}
          </Button>
        ))}
      </div>
      <KpiBar acumulado={acumulado} media={media} maximo={{ valor: maxItem.valor, label: maxItem.label }} minimo={{ valor: minItem.valor, label: minItem.label }} />
      <ChartArea data={data} chartType={chartType} media={media} mediaSply={mediaSply} media6m={media6m} />
      {/* Legenda das linhas de referência */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-6 h-px border-t-2 border-dashed border-border"></span>Média Atual: {fmt(media)}</span>
          {mediaSply > 0 && <span className="flex items-center gap-1"><span className="inline-block w-6 h-px border-t-2 border-dashed border-yellow-500"></span>Méd. SPLY: {fmt(mediaSply)}</span>}
          {media6m > 0 && <span className="flex items-center gap-1"><span className="inline-block w-6 h-px border-t-2 border-dashed border-blue-400"></span>Méd. 6m: {fmt(media6m)}</span>}
        </div>
        <ChartToggle chartType={chartType} onChange={setChartType} />
      </div>
      <RankingTable items={data.slice(0, 20).map(d => ({ label: d.label, valor: d.valor }))} title="Período" />
    </>
  );
}

// ─── Aba genérica (barbeiro, grupo, item, diaSemana, pagamento, faixaHoraria) ─

type GenericData = {
  acumulado: number;
  media: number;
  maximo: { valor: number; label: string };
  minimo: { valor: number; label: string };
  items: { label: string; valor: number; pct?: number; extra?: string; grupo?: string; tipo?: string }[];
};

interface GenericTabProps {
  data: GenericData | undefined;
  isLoading: boolean;
  error: any;
  extraControls?: React.ReactNode;
  extraCol?: (item: any) => string | undefined;
}

function GenericTab({ data, isLoading, error, extraControls, extraCol }: GenericTabProps) {
  const [chartType, setChartType] = useState<ChartType>("barra");

  if (isLoading) return <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>;
  if (error || !data) return <div className="h-32 flex items-center justify-center text-red-400 text-sm">Dados indisponíveis</div>;

  const chartData = data.items.map(i => ({ label: i.label, valor: i.valor }));
  const rankItems = data.items.map(i => ({
    label: i.label,
    valor: i.valor,
    pct: i.pct,
    extra: extraCol ? extraCol(i) : i.grupo ?? i.tipo,
  }));

  return (
    <>
      {extraControls}
      <KpiBar acumulado={data.acumulado} media={data.media} maximo={data.maximo} minimo={data.minimo} />
      <ChartArea data={chartData} chartType={chartType} media={data.media} />
      <div className="mt-2 flex justify-end">
        <ChartToggle chartType={chartType} onChange={setChartType} />
      </div>
      <RankingTable items={rankItems} title="Ranking" />
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AberturasChart({ orgId, unitId, dataInicio, dataFim }: AberturasChartProps) {
  const ct = useChartTheme();
  const [view, setView] = useState<ViewType>("periodo");
  const [topLimit, setTopLimit] = useState<TopLimit>(20);

  const commonInput = { orgId, unitId, dataInicio, dataFim };

  const qBarbeiro    = trpc.dataVip.aberturasBarbeiro.useQuery(commonInput, { enabled: view === "barbeiro", retry: false });
  const qGrupo       = trpc.dataVip.aberturasGrupo.useQuery(commonInput, { enabled: view === "grupo", retry: false });
  const qItem        = trpc.dataVip.aberturasItem.useQuery({ ...commonInput, limit: topLimit }, { enabled: view === "item", retry: false });
  const qDiaSemana   = trpc.dataVip.aberturasDiaSemana.useQuery(commonInput, { enabled: view === "diaSemana", retry: false });
  const qPagamento   = trpc.dataVip.aberturasPagamento.useQuery(commonInput, { enabled: view === "pagamento", retry: false });
  const qFaixaHoraria = trpc.dataVip.aberturasFaixaHoraria.useQuery(commonInput, { enabled: view === "faixaHoraria", retry: false });

  const activeView = VIEWS.find(v => v.id === view)!;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-yellow-500" />
          <CardTitle className="text-sm font-semibold">Aberturas</CardTitle>
        </div>

        {/* Seletor de visualização */}
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map(v => (
            <Button key={v.id} size="sm" variant={view === v.id ? "default" : "outline"}
              className={`h-7 px-3 text-xs ${view === v.id ? "bg-yellow-500 text-black font-semibold" : "text-muted-foreground"}`}
              onClick={() => setView(v.id)}>
              {v.label}
            </Button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-1.5">{activeView.desc}</p>
      </CardHeader>

      <CardContent>
        {/* Título da aba ativa */}
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-semibold">{activeView.label}</span>
        </div>

        {view === "periodo" && (
          <TabPeriodo orgId={orgId} unitId={unitId} dataInicio={dataInicio} dataFim={dataFim} />
        )}

        {view === "barbeiro" && (
          <GenericTab
            data={qBarbeiro.data}
            isLoading={qBarbeiro.isLoading}
            error={qBarbeiro.error}
            extraCol={(i) => i.atendimentos ? `${i.atendimentos} atend.` : undefined}
          />
        )}

        {view === "grupo" && (
          <GenericTab
            data={qGrupo.data}
            isLoading={qGrupo.isLoading}
            error={qGrupo.error}
            extraCol={(i) => i.quantidade ? `${i.quantidade} itens` : undefined}
          />
        )}

        {view === "item" && (
          <GenericTab
            data={qItem.data}
            isLoading={qItem.isLoading}
            error={qItem.error}
            extraControls={
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Top:</span>
                {([10, 20, 50, 0] as TopLimit[]).map(l => (
                  <Button key={l} size="sm" variant={topLimit === l ? "default" : "outline"}
                    className={`h-6 px-2 text-xs ${topLimit === l ? "bg-yellow-500 text-black" : ""}`}
                    onClick={() => setTopLimit(l)}>
                    {l === 0 ? "Todos" : l}
                  </Button>
                ))}
              </div>
            }
            extraCol={(i) => i.grupo}
          />
        )}

        {view === "diaSemana" && (
          <GenericTab
            data={qDiaSemana.data}
            isLoading={qDiaSemana.isLoading}
            error={qDiaSemana.error}
            extraCol={(i) => i.atendimentos ? `${i.atendimentos} atend.` : undefined}
          />
        )}

        {view === "pagamento" && (
          <GenericTab
            data={qPagamento.data}
            isLoading={qPagamento.isLoading}
            error={qPagamento.error}
            extraCol={(i) => i.atendimentos ? `${i.atendimentos} vendas` : undefined}
          />
        )}

        {view === "faixaHoraria" && (
          <GenericTab
            data={qFaixaHoraria.data}
            isLoading={qFaixaHoraria.isLoading}
            error={qFaixaHoraria.error}
            extraCol={(i) => i.atendimentos ? `${i.atendimentos} atend.` : undefined}
          />
        )}
      </CardContent>
    </Card>
  );
}
