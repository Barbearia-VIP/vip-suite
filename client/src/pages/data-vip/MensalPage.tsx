/**
 * MensalPage.tsx — Análise mensal detalhada do Data VIP
 * Inclui gráfico histórico + painel de 10 KPIs com comparativos SPLY/MOM/M12/M6
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, AlertCircle, DollarSign, Users, TrendingUp,
  UserPlus, Gift, Scissors, CalendarDays, Activity,
} from "lucide-react";

// ── Formatadores ─────────────────────────────────────────────────────────────
function fmtMoeda(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 2,
  }).format(v);
}
function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Componente de badge de variação ─────────────────────────────────────────
function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "↑" : "↓"}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Card de KPI individual ───────────────────────────────────────────────────
interface KpiData {
  key: string;
  label: string;
  tipo: string;
  valor: number;
  sply: { valor: number; pct: number | null };
  mom: { valor: number; pct: number | null };
  m12: { valor: number; pct: number | null };
  m6: { valor: number; pct: number | null };
}

const KPI_ICONS: Record<string, React.ReactNode> = {
  faturamento: <DollarSign className="w-4 h-4 text-emerald-400" />,
  atendimentos: <Users className="w-4 h-4 text-sky-400" />,
  ticketMedio: <TrendingUp className="w-4 h-4 text-violet-400" />,
  clientes: <TrendingUp className="w-4 h-4 text-amber-400" />,
  clientesNovos: <UserPlus className="w-4 h-4 text-pink-400" />,
  extrasQtd: <Gift className="w-4 h-4 text-orange-400" />,
  extrasValor: <Gift className="w-4 h-4 text-orange-300" />,
  servicosTotais: <Scissors className="w-4 h-4 text-cyan-400" />,
  diasTrabalhados: <CalendarDays className="w-4 h-4 text-teal-400" />,
  fatDia: <Activity className="w-4 h-4 text-lime-400" />,
};

function KpiCard({ kpi, loading }: { kpi: KpiData; loading: boolean }) {
  const isMoeda = kpi.tipo === "moeda";
  const fmt = (v: number) => isMoeda ? fmtMoeda(v) : fmtNum(v, kpi.key === "diasTrabalhados" ? 1 : 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          {kpi.label}
        </span>
        {KPI_ICONS[kpi.key]}
      </div>

      {/* Valor principal */}
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <span className="text-2xl font-bold text-foreground leading-tight">
          {fmt(kpi.valor)}
        </span>
      )}

      {/* Comparativos */}
      {loading ? (
        <Skeleton className="h-4 w-full" />
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            SPLY <PctBadge pct={kpi.sply.pct} />
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            MOM <PctBadge pct={kpi.mom.pct} />
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            M12 <PctBadge pct={kpi.m12.pct} />
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            M6 <PctBadge pct={kpi.m6.pct} />
          </span>
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function MensalPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [meses, setMeses] = useState(12);

  // Seletor de mês para os KPIs (padrão = mês atual)
  const now = new Date();
  const [periodoKpi, setPeriodoKpi] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  // Gráfico histórico
  const qHistorico = trpc.dataVip.faturamentoMensal.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, meses },
    { enabled: !!org?.id }
  );

  // KPIs do mês selecionado
  const qKpis = trpc.dataVip.kpisMensais.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, periodo: periodoKpi },
    { enabled: !!org?.id }
  );

  const data = (qHistorico.data ?? []).map(m => ({
    mes: MESES[parseInt(m.periodo.split("-")[1]) - 1] + "/" + m.periodo.split("-")[0].slice(2),
    faturamento: m.faturamento,
    atendimentos: m.atendimentos,
    ticketMedio: m.ticketMedio,
    clientes: m.clientes,
  }));

  const totFat = data.reduce((s, d) => s + d.faturamento, 0);
  const totAtend = data.reduce((s, d) => s + d.atendimentos, 0);
  const avgTicket = totAtend > 0 ? totFat / totAtend : 0;

  // Opções de mês para o seletor de KPIs (últimos 24 meses)
  const periodoOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MESES_FULL[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const [periodoAno, periodoMes] = periodoKpi.split("-").map(Number);
  const periodoLabel = `${MESES_FULL[periodoMes - 1]} ${periodoAno}`;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
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
          {[3,6,12,24].map(n => <option key={n} value={n}>Últimos {n} meses</option>)}
        </select>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Faturamento Total", value: fmtMoeda(totFat) },
          { label: "Total Atendimentos", value: totAtend.toLocaleString("pt-BR") },
          { label: "Ticket Médio Geral", value: fmtMoeda(avgTicket) },
        ].map((k, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              {qHistorico.isLoading ? <Skeleton className="h-7 w-24 mt-1" /> : <p className="text-xl font-bold mt-1">{k.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico de faturamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Faturamento por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {qHistorico.isLoading ? <Skeleton className="h-56 w-full" /> :
           data.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              <AlertCircle className="w-4 h-4 mr-2" /> Sem dados — sincronize para ver o histórico
            </div>
           ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmtMoeda(v), "Faturamento"]} />
                <Bar dataKey="faturamento" fill="oklch(0.75 0.15 200)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
           )
          }
        </CardContent>
      </Card>

      {/* Gráficos de atendimentos e ticket */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Atendimentos por Mês</CardTitle></CardHeader>
          <CardContent>
            {qHistorico.isLoading ? <Skeleton className="h-44 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="atendimentos" stroke="oklch(0.78 0.12 75)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ticket Médio por Mês</CardTitle></CardHeader>
          <CardContent>
            {qHistorico.isLoading ? <Skeleton className="h-44 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `R$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmtMoeda(v), "Ticket Médio"]} />
                  <Line type="monotone" dataKey="ticketMedio" stroke="oklch(0.65 0.15 145)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela mensal */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Detalhamento Mensal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Mês</th>
                  <th className="text-right py-2 pr-4">Faturamento</th>
                  <th className="text-right py-2 pr-4">Atendimentos</th>
                  <th className="text-right py-2 pr-4">Ticket Médio</th>
                  <th className="text-right py-2">Clientes</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{r.mes}</td>
                    <td className="py-2 pr-4 text-right text-green-400">{fmtMoeda(r.faturamento)}</td>
                    <td className="py-2 pr-4 text-right">{r.atendimentos.toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-4 text-right">{fmtMoeda(r.ticketMedio)}</td>
                    <td className="py-2 text-right">{r.clientes.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Painel de KPIs por mês ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">KPIs do Mês</h2>
            <p className="text-xs text-muted-foreground">
              Comparativos: SPLY = mesmo mês ano anterior · MOM = mês anterior · M12 = média 12 meses · M6 = média 6 meses
            </p>
          </div>
          <select
            value={periodoKpi}
            onChange={e => setPeriodoKpi(e.target.value)}
            className="text-sm bg-muted border border-border rounded px-3 py-1.5 font-medium"
          >
            {periodoOptions.map(o => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>

        {qKpis.isError ? (
          <div className="flex items-center gap-2 text-red-400 text-sm p-4 bg-red-400/10 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            Erro ao carregar KPIs. Verifique a conexão com o banco externo.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {qKpis.isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))
              : (qKpis.data?.kpis ?? []).map(kpi => (
                  <KpiCard key={kpi.key} kpi={kpi as KpiData} loading={false} />
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
