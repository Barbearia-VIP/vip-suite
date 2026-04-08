/**
 * VIP Cam — Métricas e relatórios detalhados.
 * - Satisfação geral, satisfeitos, neutros e insatisfeitos: base de clientes (camClientes.satisfactionLevel)
 * - Total de detecções: histórico de capturas (camMetricasDiarias)
 */
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import { BarChart2, TrendingUp, Smile, Meh, Frown, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useChartTheme } from '@/hooks/useChartTheme';
import { DatePicker } from '@/components/DatePicker';

const COLORS = { satisfied: '#22c55e', neutral: '#f59e0b', unsatisfied: '#ef4444' };

// Tooltip glass premium
const GlassTooltip = ({ active, payload, label }: any) => {
  const ct = useChartTheme();
  if (!active || !payload?.length) return null;
  return (
    <div style={ct.tooltipStyle}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: ct.textMuted }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' && p.name?.includes('%') ? `${p.value}%` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function CamRelatoriosPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id;

  // Datas em fuso Brasil (UTC-3)
  const todayBRT = useMemo(() => {
    const now = new Date();
    return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }, []);
  const thirtyDaysAgoBRT = useMemo(() => {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    brt.setUTCDate(brt.getUTCDate() - 29);
    return brt.toISOString().slice(0, 10);
  }, []);

  const [startDate, setStartDate] = useState(thirtyDaysAgoBRT);
  const [endDate, setEndDate] = useState(todayBRT);

  const { data: metricas, isLoading } = trpc.vipCam.getMetricas.useQuery({
    unitId, startDate, endDate,
  });

  // Gráfico de barras: detecções por dia (histórico de captura)
  const barData = (metricas?.daily ?? []).map(d => ({
    data: new Date((d.data as unknown as string) + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Satisfeitos: d.satisfeitos ?? 0,
    Neutros: d.neutros ?? 0,
    Insatisfeitos: d.insatisfeitos ?? 0,
  }));

  // Gráfico de tendência: % satisfação por dia (histórico)
  const satisfactionTrend = (metricas?.daily ?? []).map(d => ({
    data: new Date((d.data as unknown as string) + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    'Satisfação %': d.totalDeteccoes ? Math.round(((d.satisfeitos ?? 0) / d.totalDeteccoes) * 100) : 0,
  }));

  // KPIs: base de clientes
  const ct = metricas?.clientesTotals;
  const totalDeteccoes = metricas?.totals?.totalDeteccoes ?? 0;

  const satisfacaoColor = (rate: number) =>
    rate >= 70 ? COLORS.satisfied : rate >= 40 ? COLORS.neutral : COLORS.unsatisfied;

  const kpis = [
    {
      label: 'Total Detecções',
      value: totalDeteccoes.toLocaleString('pt-BR'),
      icon: BarChart2,
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-500',
      valueColor: '',
      sub: 'reconhecimentos no período',
    },
    {
      label: 'Satisfação Geral',
      value: `${ct?.satisfactionRate ?? 0}%`,
      icon: Smile,
      iconBg: 'bg-green-500/15',
      iconColor: 'text-green-500',
      valueColor: satisfacaoColor(ct?.satisfactionRate ?? 0),
      sub: `base: ${ct?.totalClientes ?? 0} clientes`,
    },
    {
      label: 'Satisfeitos',
      value: (ct?.satisfeitos ?? 0).toLocaleString('pt-BR'),
      icon: Smile,
      iconBg: 'bg-green-500/15',
      iconColor: 'text-green-500',
      valueColor: COLORS.satisfied,
      sub: ct?.totalClientes ? `${Math.round(((ct.satisfeitos) / ct.totalClientes) * 100)}% da base` : '—',
    },
    {
      label: 'Neutros',
      value: (ct?.neutros ?? 0).toLocaleString('pt-BR'),
      icon: Meh,
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-500',
      valueColor: COLORS.neutral,
      sub: ct?.totalClientes ? `${Math.round(((ct.neutros) / ct.totalClientes) * 100)}% da base` : '—',
    },
    {
      label: 'Insatisfeitos',
      value: (ct?.insatisfeitos ?? 0).toLocaleString('pt-BR'),
      icon: Frown,
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-500',
      valueColor: COLORS.unsatisfied,
      sub: ct?.totalClientes ? `${Math.round(((ct.insatisfeitos) / ct.totalClientes) * 100)}% da base` : '—',
    },
    {
      label: 'Total na Base',
      value: (ct?.totalClientes ?? 0).toLocaleString('pt-BR'),
      icon: Users,
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
      valueColor: '',
      sub: 'clientes cadastrados',
    },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Métricas VIP Cam" description="Relatórios e análises de satisfação" />

      {/* Filtro de período */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">De:</label>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Data inicial" className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Até:</label>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="Data final" min={startDate} className="w-40" />
        </div>
        <p className="text-xs text-muted-foreground ml-2">
          * Satisfação, satisfeitos, neutros e insatisfeitos refletem o estado atual da base de clientes.
          Total de detecções reflete o período selecionado.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {kpis.map(kpi => (
              <div key={kpi.label} className="glass-card">
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                      <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                    </div>
                    <div>
                      <p
                        className="text-2xl font-display font-bold"
                        style={kpi.valueColor ? { color: kpi.valueColor } : undefined}
                      >
                        {kpi.value}
                      </p>
                      <p className="text-xs font-medium text-foreground">{kpi.label}</p>
                      <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tendência de Satisfação % */}
          <div className="glass-card">
            <div className="p-6 pb-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Tendência de Satisfação — Histórico de Capturas (%)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">% satisfeitos por dia com base nas detecções do período</p>
            </div>
            <div className="p-6 pt-0">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={satisfactionTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip content={<GlassTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="Satisfação %"
                    stroke="oklch(0.76 0.145 72)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'oklch(0.76 0.145 72)' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detecções por Dia */}
          <div className="glass-card">
            <div className="p-6 pb-2">
              <h3 className="font-semibold text-foreground text-sm">
                Detecções por Dia — Histórico de Capturas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">reconhecimentos faciais agrupados por sentimento no momento da captura</p>
            </div>
            <div className="p-6 pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSatBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.satisfied} stopOpacity={0.9} />
                      <stop offset="95%" stopColor={COLORS.satisfied} stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="gradNeuBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.neutral} stopOpacity={0.9} />
                      <stop offset="95%" stopColor={COLORS.neutral} stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="gradUnsBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.unsatisfied} stopOpacity={0.9} />
                      <stop offset="95%" stopColor={COLORS.unsatisfied} stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<GlassTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Satisfeitos" stackId="a" fill="url(#gradSatBar)" />
                  <Bar dataKey="Neutros" stackId="a" fill="url(#gradNeuBar)" />
                  <Bar dataKey="Insatisfeitos" stackId="a" fill="url(#gradUnsBar)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
