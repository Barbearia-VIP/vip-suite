/**
 * VIP Cam — Dashboard principal com KPIs do dia e gráficos de tendência.
 * Layout moderno no padrão da aba Reputação.
 */
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
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
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
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
  const today = new Date().toISOString().slice(0, 10);
  const [trendPeriod, setTrendPeriod] = useState<PeriodOption>(7);

  const trendStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (trendPeriod - 1));
    return d.toISOString().slice(0, 10);
  }, [trendPeriod]);

  const sevenDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();

  const { data: dashboard, isLoading } = trpc.vipCam.getDashboard.useQuery(
    { unitId, date: today },
    { refetchInterval: 30_000 }
  );

  const { data: metricas } = trpc.vipCam.getMetricas.useQuery({
    unitId,
    startDate: trendStartDate,
    endDate: today,
  });

  const { data: clientesData } = trpc.vipCam.getClientes.useQuery({
    unitId,
    limit: 5,
    page: 1,
  });

  const today_data = dashboard?.today;
  const satisfactionRate = today_data?.satisfactionRate ?? 0;
  const totalDeteccoes = today_data?.totalDeteccoes ?? 0;
  const satisfeitos = today_data?.satisfeitos ?? 0;
  const neutros = today_data?.neutros ?? 0;
  const insatisfeitos = today_data?.insatisfeitos ?? 0;

  const pieData = [
    { name: 'Satisfeitos', value: satisfeitos, color: COLORS.satisfied },
    { name: 'Neutros', value: neutros, color: COLORS.neutral },
    { name: 'Insatisfeitos', value: insatisfeitos, color: COLORS.unsatisfied },
  ].filter(d => d.value > 0);

  const areaDataRaw = (metricas?.daily ?? []).map(d => ({
    data: new Date(d.data as unknown as string).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Satisfeitos: d.satisfeitos ?? 0,
    Neutros: d.neutros ?? 0,
    Insatisfeitos: d.insatisfeitos ?? 0,
  }));

  // Para 30+ dias, agrupa por semana para não sobrecarregar o gráfico
  const areaData = trendPeriod === 7
    ? areaDataRaw
    : groupByWeek(metricas?.daily ?? []);

  const hourlyData = (dashboard?.hourlyToday ?? []).map(h => ({
    hora: `${h.hora}h`,
    Total: h.totalDeteccoes ?? 0,
    Satisfeitos: h.satisfeitos ?? 0,
  }));

  const kpis = [
    {
      label: 'Detecções Hoje',
      value: totalDeteccoes,
      icon: Camera,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      sub: 'reconhecimentos faciais',
    },
    {
      label: 'Taxa de Satisfação',
      value: `${satisfactionRate}%`,
      icon: satisfactionRate >= 70 ? Smile : satisfactionRate >= 40 ? Meh : Frown,
      color: satisfactionRate >= 70 ? 'text-green-500' : satisfactionRate >= 40 ? 'text-amber-500' : 'text-red-500',
      bg: satisfactionRate >= 70 ? 'bg-green-500/10' : satisfactionRate >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10',
      sub: 'clientes satisfeitos hoje',
    },
    {
      label: 'Clientes Únicos',
      value: dashboard?.totalClientes ?? 0,
      icon: Users,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      sub: 'na base de dados',
    },
    {
      label: 'Novos Hoje',
      value: today_data?.novosClientes ?? 0,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      sub: 'primeira visita registrada',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
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
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Distribuição + Tendência 7 dias */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tendência 7 dias — col-span-2 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Tendência — Últimos {trendPeriod} Dias
                {trendPeriod > 7 && <span className="text-xs font-normal text-muted-foreground">(agrupado por semana)</span>}
              </CardTitle>
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
          </CardHeader>
          <CardContent>
            {areaData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <BarChart3 className="w-8 h-8 opacity-30" />
                <p>Sem dados nos últimos 7 dias</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/vip-cam/ao-vivo">Iniciar câmera</Link>
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={areaData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.satisfied} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.satisfied} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.neutral} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.neutral} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.unsatisfied} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.unsatisfied} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Satisfeitos" stroke={COLORS.satisfied} strokeWidth={2} fill="url(#gradSat)" dot={{ r: 3, fill: COLORS.satisfied }} />
                  <Area type="monotone" dataKey="Neutros" stroke={COLORS.neutral} strokeWidth={2} fill="url(#gradNeu)" dot={{ r: 3, fill: COLORS.neutral }} />
                  <Area type="monotone" dataKey="Insatisfeitos" stroke={COLORS.unsatisfied} strokeWidth={2} fill="url(#gradUns)" dot={{ r: 3, fill: COLORS.unsatisfied }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Distribuição de Satisfação — Hoje */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição — Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <Camera className="w-8 h-8 opacity-30" />
                <p>Sem dados hoje</p>
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
                    { label: 'Satisfeitos', value: satisfeitos, color: COLORS.satisfied, icon: ThumbsUp, textColor: 'text-green-600' },
                    { label: 'Neutros', value: neutros, color: COLORS.neutral, icon: Minus, textColor: 'text-amber-600' },
                    { label: 'Insatisfeitos', value: insatisfeitos, color: COLORS.unsatisfied, icon: ThumbsDown, textColor: 'text-red-600' },
                  ].map((s) => {
                    const total = totalDeteccoes || 1;
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
          </CardContent>
        </Card>
      </div>

      {/* Detecções por Hora + Clientes Recentes */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Detecções por hora */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Detecções por Hora — Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <AlertCircle className="w-5 h-5 opacity-40" />
                Sem dados horários hoje
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Satisfeitos" fill={COLORS.satisfied} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Clientes recentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Clientes Recentes
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/vip-cam/clientes">Ver todos →</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
