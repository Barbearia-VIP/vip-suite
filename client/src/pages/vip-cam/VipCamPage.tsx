/**
 * VIP Cam — Dashboard principal com KPIs do dia e gráficos de tendência.
 * Layout moderno no padrão da aba Reputação.
 */
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar, LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  Camera, Users, Smile, TrendingUp, Settings, Play,
  Frown, Meh, ThumbsUp, ThumbsDown, Minus, Clock,
  BarChart3, AlertCircle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useState, useMemo } from 'react';

const COLORS = {
  satisfied: '#22c55e',
  neutral: '#f59e0b',
  unsatisfied: '#ef4444',
};

function SatisfactionBadge({ level }: { level: string }) {
  if (level === 'satisfied')
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"><ThumbsUp className="w-3 h-3 mr-1" />Satisfeito</Badge>;
  if (level === 'unsatisfied')
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs"><ThumbsDown className="w-3 h-3 mr-1" />Insatisfeito</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs"><Minus className="w-3 h-3 mr-1" />Neutro</Badge>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

type PeriodOption = 7 | 30 | 90;

// Agrupa dados diários em semanas para períodos longos
function groupByWeek(daily: any[]): any[] {
  const weeks: Record<string, any> = {};
  daily.forEach(d => {
    const date = new Date(d.data as unknown as string);
    // Início da semana (segunda-feira)
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks[key]) {
      weeks[key] = { data: key, Satisfeitos: 0, Neutros: 0, Insatisfeitos: 0 };
    }
    weeks[key].Satisfeitos += d.satisfeitos ?? 0;
    weeks[key].Neutros += d.neutros ?? 0;
    weeks[key].Insatisfeitos += d.insatisfeitos ?? 0;
  });
  return Object.values(weeks).map(w => ({
    ...w,
    data: new Date(w.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }));
}

export default function VipCamPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id;

  // Data atual no fuso Brasil (UTC-3) para evitar troca de dia às 21h UTC
  const todayBRT = useMemo(() => {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return brt.toISOString().slice(0, 10);
  }, []);

  const [trendPeriod, setTrendPeriod] = useState<PeriodOption>(7);

  const trendStartDate = useMemo(() => {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    brt.setUTCDate(brt.getUTCDate() - (trendPeriod - 1));
    return brt.toISOString().slice(0, 10);
  }, [trendPeriod]);

  const { data: dashboard, isLoading } = trpc.vipCam.getDashboard.useQuery(
    { unitId, date: todayBRT },
    { refetchInterval: 30_000 }
  );

  const { data: metricas } = trpc.vipCam.getMetricas.useQuery({
    unitId,
    startDate: trendStartDate,
    endDate: todayBRT,
  });

  const { data: clientesData } = trpc.vipCam.getClientes.useQuery({
    unitId,
    limit: 5,
    page: 1,
  });

  // Dados do dia (para gráfico horário)
  const today_data = dashboard?.today;

  // KPIs do mês (baseados em clientes reais + detecções)
  const mes = dashboard?.mes;
  const satisfactionRateMes = mes?.satisfactionRate ?? 0;
  const deteccoesMes = mes?.deteccoes ?? 0;
  const clientesUnicosMes = mes?.clientesUnicos ?? 0;
  const novosMes = mes?.novosClientes ?? 0;
  const yearMonth = mes?.yearMonth ?? '';
  const mesLabel = yearMonth
    ? new Date(yearMonth + '-01T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : 'este mês';

  // Distribuição de satisfação do mês (para pie chart)
  const satisfeitosMes = mes?.satisfeitos ?? 0;
  const neutrosMes = mes?.neutros ?? 0;
  const insatisfeitosMes = mes?.insatisfeitos ?? 0;

  const pieData = [
    { name: 'Satisfeitos', value: satisfeitosMes, color: COLORS.satisfied },
    { name: 'Neutros', value: neutrosMes, color: COLORS.neutral },
    { name: 'Insatisfeitos', value: insatisfeitosMes, color: COLORS.unsatisfied },
  ].filter(d => d.value > 0);

  // Gráfico de tendência: usa clientes únicos por dia (clientesPorDia)
  // Inclui o dia atual mesmo sem dados (garantido pelo backend)
  const areaDataRaw = (metricas?.clientesPorDia ?? []).map(d => ({
    data: new Date(d.data + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Clientes: d.total,
    Satisfeitos: d.satisfeitos,
    Neutros: d.neutros,
    Insatisfeitos: d.insatisfeitos,
  }));

  // Para 30+ dias, agrupa por semana para não sobrecarregar o gráfico
  const areaData = trendPeriod === 7
    ? areaDataRaw
    : (() => {
        // Agrupa clientesPorDia por semana
        const weeks: Record<string, { data: string; Clientes: number; Satisfeitos: number; Neutros: number; Insatisfeitos: number }> = {};
        (metricas?.clientesPorDia ?? []).forEach(d => {
          const date = new Date(d.data + 'T12:00:00Z');
          const day = date.getUTCDay();
          const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(date);
          monday.setUTCDate(diff);
          const key = monday.toISOString().slice(0, 10);
          if (!weeks[key]) weeks[key] = { data: key, Clientes: 0, Satisfeitos: 0, Neutros: 0, Insatisfeitos: 0 };
          weeks[key].Clientes += d.total;
          weeks[key].Satisfeitos += d.satisfeitos;
          weeks[key].Neutros += d.neutros;
          weeks[key].Insatisfeitos += d.insatisfeitos;
        });
        return Object.values(weeks)
          .sort((a, b) => a.data.localeCompare(b.data))
          .map(w => ({ ...w, data: new Date(w.data + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }));
      })();

  // Hora atual BRT para marcar no gráfico
  const horaAtualBRT = useMemo(() => {
    const now = new Date();
    return new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
  }, []);

  // Mapa de clientes únicos por hora (do backend getDashboard)
  const clientesHoraMap = useMemo(() => {
    const m: Record<number, number> = {};
    (dashboard?.clientesUnicosPorHora ?? []).forEach((r: any) => {
      m[Number(r.hora)] = Number(r.total);
    });
    return m;
  }, [dashboard?.clientesUnicosPorHora]);

  // Mapa de detecções por hora (do hourlyToday)
  const deteccoesHoraMap = useMemo(() => {
    const m: Record<number, number> = {};
    (dashboard?.hourlyToday ?? []).forEach((h: any) => {
      m[Number(h.hora)] = Number(h.totalDeteccoes ?? 0);
    });
    return m;
  }, [dashboard?.hourlyToday]);

  // Gera todas as 24h do dia, preenchendo com 0 as horas futuras
  const hourlyData = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, '0')}h`,
      horaNum: h,
      Clientes: h <= horaAtualBRT ? (clientesHoraMap[h] ?? 0) : null,
      Detecções: h <= horaAtualBRT ? (deteccoesHoraMap[h] ?? 0) : null,
    }));
  }, [clientesHoraMap, deteccoesHoraMap, horaAtualBRT]);

  // KPIs do dia (clientes reais) - vem do getDashboard
  const kpisHoje = dashboard?.kpisHoje ?? { totalClientes: 0, totalDeteccoes: 0, satisfeitos: 0, neutros: 0, insatisfeitos: 0 };

  const kpis = [
    {
      label: 'Detecções no Mês',
      value: deteccoesMes,
      icon: Camera,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      sub: `reconhecimentos em ${mesLabel}`,
    },
    {
      label: 'Taxa de Satisfação',
      value: `${satisfactionRateMes}%`,
      icon: satisfactionRateMes >= 70 ? Smile : satisfactionRateMes >= 40 ? Meh : Frown,
      color: satisfactionRateMes >= 70 ? 'text-green-500' : satisfactionRateMes >= 40 ? 'text-amber-500' : 'text-red-500',
      bg: satisfactionRateMes >= 70 ? 'bg-green-500/10' : satisfactionRateMes >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10',
      sub: `clientes satisfeitos em ${mesLabel}`,
    },
    {
      label: 'Novos no Mês',
      value: novosMes,
      icon: Users,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      sub: `1ª visita registrada em ${mesLabel}`,
    },
    {
      label: 'Novos Hoje',
      value: today_data?.novosClientes ?? 0,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      sub: 'primeira visita registrada hoje',
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="VIP Cam" description="Análise de satisfação por reconhecimento facial" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="VIP Cam"
        description="Análise de satisfação por reconhecimento facial"
        actions={
          <div className="flex gap-2">
            <Button size="sm" asChild>
              <Link href="/vip-cam/ao-vivo">
                <Play className="h-4 w-4 mr-1.5" />Câmera ao Vivo
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/vip-cam/configuracoes">
                <Settings className="h-4 w-4 mr-1.5" />Configurações
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div className="glass-card" key={k.label}>
            <div className="p-6 pt-0 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Distribuição + Tendência 7 dias */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tendência 7 dias — col-span-2 */}
        <div className="glass-card lg:col-span-2">
          <div className="p-6 pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Clientes Únicos — Últimos {trendPeriod} Dias
                {trendPeriod > 7 && <span className="text-xs font-normal text-muted-foreground">(agrupado por semana)</span>}
              </h3>
              <div className="flex gap-1">
                {([7, 30, 90] as PeriodOption[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setTrendPeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      trendPeriod === p
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {p}d
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 pt-0">
              {areaData.length === 0 || areaData.every(d => d.Clientes === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <BarChart3 className="w-8 h-8 opacity-30" />
                <p>Sem dados nos últimos {trendPeriod} dias</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/vip-cam/ao-vivo">Iniciar câmera</Link>
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={areaData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradClientes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.satisfied} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.satisfied} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.neutral} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.neutral} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.unsatisfied} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.unsatisfied} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Clientes" stroke="oklch(0.76 0.145 72)" strokeWidth={2.5} fill="url(#gradClientes)" dot={{ r: 3.5, fill: 'oklch(0.76 0.145 72)' }} />
                  <Area type="monotone" dataKey="Satisfeitos" stroke={COLORS.satisfied} strokeWidth={1.5} fill="url(#gradSat)" dot={{ r: 2.5, fill: COLORS.satisfied }} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="Neutros" stroke={COLORS.neutral} strokeWidth={1.5} fill="url(#gradNeu)" dot={{ r: 2.5, fill: COLORS.neutral }} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="Insatisfeitos" stroke={COLORS.unsatisfied} strokeWidth={1.5} fill="url(#gradUns)" dot={{ r: 2.5, fill: COLORS.unsatisfied }} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Distribuição de Satisfação — Mês */}
        <div className="glass-card">
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-foreground text-base">Distribuição — {mesLabel}</h3>
          </div>
          <div className="p-6 pt-0">
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <Camera className="w-8 h-8 opacity-30" />
                <p>Sem dados este mês</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/vip-cam/ao-vivo">Iniciar câmera</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={60}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {[
                    { label: 'Satisfeitos', value: satisfeitosMes, color: COLORS.satisfied, icon: ThumbsUp, textColor: 'text-green-600' },
                    { label: 'Neutros', value: neutrosMes, color: COLORS.neutral, icon: Minus, textColor: 'text-amber-600' },
                    { label: 'Insatisfeitos', value: insatisfeitosMes, color: COLORS.unsatisfied, icon: ThumbsDown, textColor: 'text-red-600' },
                  ].map((s) => {
                    const total = (satisfeitosMes + neutrosMes + insatisfeitosMes) || 1;
                    const pct = Math.round((s.value / total) * 100);
                    return (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <s.icon className={`w-3.5 h-3.5 ${s.textColor}`} />
                            <span className="text-sm">{s.label}</span>
                          </div>
                          <span className="text-sm font-medium">{s.value} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clientes por Hora Hoje — Gráfico de Linha Premium */}
      <div className="glass-card">
        {/* KPIs do dia */}
        <div className="p-6 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-foreground text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Clientes por Hora — Hoje
            </h3>
            <span className="text-xs text-muted-foreground">
              Atualiza a cada 30s • {String(horaAtualBRT).padStart(2, '0')}:xx BRT
            </span>
          </div>
          {/* 5 KPIs do dia */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Total Clientes', value: kpisHoje.totalClientes, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
              { label: 'Total Detecções', value: kpisHoje.totalDeteccoes, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
              { label: 'Satisfeitos', value: kpisHoje.satisfeitos, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              { label: 'Neutros', value: kpisHoje.neutros, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              { label: 'Insatisfeitos', value: kpisHoje.insatisfeitos, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl p-3 border ${kpi.bg} ${kpi.border} text-center`}>
                <p className={`font-display text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Gráfico de linha */}
        <div className="p-6">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hourlyData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradClientes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
              <XAxis
                dataKey="hora"
                tick={{ fontSize: 9, fill: 'oklch(0.65 0.01 80)' }}
                tickLine={false}
                axisLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'oklch(0.65 0.01 80)' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: 'oklch(0.76 0.145 72 / 0.3)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'oklch(0.75 0.01 80)', paddingTop: 8 }}
              />
              {/* Linha vertical na hora atual */}
              <ReferenceLine
                x={`${String(horaAtualBRT).padStart(2, '0')}h`}
                stroke="oklch(0.76 0.145 72 / 0.5)"
                strokeDasharray="4 4"
                label={{ value: 'agora', position: 'top', fontSize: 9, fill: 'oklch(0.76 0.145 72)' }}
              />
              <Line
                type="monotone"
                dataKey="Clientes"
                stroke="oklch(0.76 0.145 72)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'oklch(0.76 0.145 72)', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: 'oklch(0.76 0.145 72)', strokeWidth: 2, stroke: 'oklch(0.2 0.01 80)' }}
                connectNulls={false}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Detecções"
                stroke="oklch(0.65 0.12 240)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clientes Recentes */}
      <div className="glass-card">
          <div className="p-6 pb-2 flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Clientes Recentes
            </h3>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/vip-cam/clientes">Ver todos →</Link>
            </Button>
          </div>
          <div className="p-6 pt-0 space-y-3">
            {!clientesData?.clientes?.length ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <Users className="w-7 h-7 opacity-30" />
                <p>Nenhum cliente registrado</p>
              </div>
            ) : (
              clientesData.clientes.slice(0, 5).map((c: any) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold">
                    {c.nomeCliente ? c.nomeCliente.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.nomeCliente || 'Cliente desconhecido'}</p>
                    <p className="text-xs text-muted-foreground">{c.totalVisitas ?? 0} visita{(c.totalVisitas ?? 0) !== 1 ? 's' : ''}</p>
                  </div>
                  <SatisfactionBadge level={c.satisfactionLevel ?? 'neutral'} />
                </div>
              ))
            )}
            <div className="pt-2 border-t">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/vip-cam/clientes">Ver base completa</Link>
              </Button>
            </div>
          </div>
        </div>
    </div>
  );
}
