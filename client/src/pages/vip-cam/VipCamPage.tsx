/**
 * VIP Cam — Dashboard principal com KPIs do dia e gráficos de tendência.
 */
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { Camera, Users, Smile, TrendingUp, Clock, Settings, Play } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const COLORS = { satisfied: '#22c55e', neutral: '#f59e0b', unsatisfied: '#ef4444' };

export default function VipCamPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.orgId;
  const today = new Date().toISOString().slice(0, 10);

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
    startDate: sevenDaysAgo,
    endDate: today,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="VIP Cam" description="Análise de satisfação por reconhecimento facial" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const today_data = dashboard?.today;
  const satisfactionRate = today_data?.satisfactionRate ?? 0;

  const pieData = [
    { name: 'Satisfeitos', value: today_data?.satisfeitos ?? 0, color: COLORS.satisfied },
    { name: 'Neutros', value: today_data?.neutros ?? 0, color: COLORS.neutral },
    { name: 'Insatisfeitos', value: today_data?.insatisfeitos ?? 0, color: COLORS.unsatisfied },
  ].filter(d => d.value > 0);

  const barData = (metricas?.daily ?? []).map(d => ({
    data: new Date(d.data as unknown as string).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Satisfeitos: d.satisfeitos ?? 0,
    Neutros: d.neutros ?? 0,
    Insatisfeitos: d.insatisfeitos ?? 0,
  }));

  const hourlyData = (dashboard?.hourlyToday ?? []).map(h => ({
    hora: `${h.hora}h`,
    total: h.totalDeteccoes ?? 0,
    satisfeitos: h.satisfeitos ?? 0,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PageHeader
          title="VIP Cam"
          description="Análise de satisfação por reconhecimento facial"
        />
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link href="/vip-cam/ao-vivo">
              <Play className="h-4 w-4 mr-1" />Câmera ao Vivo
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/vip-cam/configuracoes">
              <Settings className="h-4 w-4 mr-1" />Configurações
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs do dia */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Camera className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{today_data?.totalDeteccoes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Detecções hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Smile className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: satisfactionRate >= 70 ? '#22c55e' : satisfactionRate >= 40 ? '#f59e0b' : '#ef4444' }}>
                  {satisfactionRate}%
                </p>
                <p className="text-xs text-muted-foreground">Satisfação hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboard?.totalClientes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Clientes únicos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{today_data?.novosClientes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Novos hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de Satisfação — Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Camera className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm">Sem dados hoje</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link href="/vip-cam/ao-vivo">Iniciar câmera</Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Detecções por Hora — Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sem dados horários hoje
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#6366f1" radius={[3, 3, 0, 0]} name="Total" />
                  <Bar dataKey="satisfeitos" fill="#22c55e" radius={[3, 3, 0, 0]} name="Satisfeitos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tendência 7 dias */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tendência — Últimos 7 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sem dados nos últimos 7 dias
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Satisfeitos" stackId="a" fill={COLORS.satisfied} />
                <Bar dataKey="Neutros" stackId="a" fill={COLORS.neutral} />
                <Bar dataKey="Insatisfeitos" stackId="a" fill={COLORS.unsatisfied} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
