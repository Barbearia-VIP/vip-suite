/**
 * VIP Cam — Métricas e relatórios detalhados.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import { BarChart2, TrendingUp, Smile } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const COLORS = { satisfied: '#22c55e', neutral: '#f59e0b', unsatisfied: '#ef4444' };

export default function CamRelatoriosPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id;
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: metricas, isLoading } = trpc.vipCam.getMetricas.useQuery({
    unitId, startDate, endDate,
  });

  const barData = (metricas?.daily ?? []).map(d => ({
    data: new Date(d.data as unknown as string).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Satisfeitos: d.satisfeitos ?? 0,
    Neutros: d.neutros ?? 0,
    Insatisfeitos: d.insatisfeitos ?? 0,
  }));

  const satisfactionTrend = (metricas?.daily ?? []).map(d => ({
    data: new Date(d.data as unknown as string).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    satisfacao: d.totalDeteccoes ? Math.round(((d.satisfeitos ?? 0) / d.totalDeteccoes) * 100) : 0,
  }));

  const totals = metricas?.totals;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Métricas VIP Cam" description="Relatórios e análises de satisfação" />
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">De:</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Até:</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card"><div className="p-6 pt-0 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><BarChart2 className="h-5 w-5 text-blue-600" /></div>
                <div><p className="text-2xl font-bold">{totals?.totalDeteccoes ?? 0}</p><p className="text-xs text-muted-foreground">Total detecções</p></div>
              </div>
            </div></div>
            <div className="glass-card"><div className="p-6 pt-0 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><Smile className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: (totals?.satisfactionRate ?? 0) >= 70 ? '#22c55e' : (totals?.satisfactionRate ?? 0) >= 40 ? '#f59e0b' : '#ef4444' }}>
                    {totals?.satisfactionRate ?? 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Satisfação geral</p>
                </div>
              </div>
            </div></div>
            <div className="glass-card"><div className="p-6 pt-0 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><Smile className="h-5 w-5 text-green-600" /></div>
                <div><p className="text-2xl font-bold text-green-600">{totals?.satisfeitos ?? 0}</p><p className="text-xs text-muted-foreground">Satisfeitos</p></div>
              </div>
            </div></div>
            <div className="glass-card"><div className="p-6 pt-0 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><TrendingUp className="h-5 w-5 text-red-600" /></div>
                <div><p className="text-2xl font-bold text-red-600">{totals?.insatisfeitos ?? 0}</p><p className="text-xs text-muted-foreground">Insatisfeitos</p></div>
              </div>
            </div></div>
          </div>
          <div className="glass-card">
            <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Tendência de Satisfação (%)</h3></div>
            <div className="p-6 pt-0">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={satisfactionTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v) => [`${v}%`, 'Satisfação']} />
                  <Line type="monotone" dataKey="satisfacao" stroke="#22c55e" strokeWidth={2} dot={false} name="Satisfação" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-card">
            <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm">Detecções por Dia</h3></div>
            <div className="p-6 pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Satisfeitos" stackId="a" fill={COLORS.satisfied} />
                  <Bar dataKey="Neutros" stackId="a" fill={COLORS.neutral} />
                  <Bar dataKey="Insatisfeitos" stackId="a" fill={COLORS.unsatisfied} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
