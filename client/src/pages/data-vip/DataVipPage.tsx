import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Users, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, Trophy, Scissors, AlertCircle } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";

const COLORS = ["oklch(0.65 0.15 200)", "oklch(0.78 0.12 75)", "oklch(0.65 0.15 145)", "oklch(0.65 0.15 280)"];
const MOCK_MONTHLY = [
  { month: "Out", faturamento: 42000, atendimentos: 380 },
  { month: "Nov", faturamento: 48000, atendimentos: 420 },
  { month: "Dez", faturamento: 55000, atendimentos: 490 },
  { month: "Jan", faturamento: 38000, atendimentos: 340 },
  { month: "Fev", faturamento: 51000, atendimentos: 460 },
  { month: "Mar", faturamento: 62000, atendimentos: 540 },
];
const MOCK_SERVICES = [{ name: "Corte", value: 45 }, { name: "Barba", value: 28 }, { name: "Combo", value: 18 }, { name: "Outros", value: 9 }];
const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

function KPICard({ title, value, subtitle, icon: Icon, color, trend }: { title: string; value: string; subtitle?: string; icon: React.ElementType; color: string; trend?: number }) {
  return (
    <Card className="bg-card border-border"><CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-3">
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3 text-green-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
          <span className={`text-xs font-medium ${trend >= 0 ? "text-green-500" : "text-red-500"}`}>{trend >= 0 ? "+" : ""}{trend}% vs mês anterior</span>
        </div>
      )}
    </CardContent></Card>
  );
}

export default function DataVipPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
  const configQuery = trpc.orgs.moduleConfigs.useQuery({ unitId: selectedUnit?.id ?? 0, orgId: org?.id ?? 0 }, { enabled: !!selectedUnit?.id && !!org?.id });
  const hasConfig = configQuery.data?.some(c => c.module === "data_vip" && c.active);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Data VIP" description={selectedUnit ? `Analytics — ${selectedUnit.name}` : "Analytics e faturamento da rede"}
        actions={<Button variant="outline" size="sm" className="gap-1.5 text-xs"><RefreshCw className="w-3.5 h-3.5" />Sincronizar</Button>}
      />
      {!hasConfig && !configQuery.isLoading && (
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div><p className="text-xs font-medium text-foreground">API não configurada</p><p className="text-xs text-muted-foreground">Configure a URL e chave da API em Configurações para sincronizar dados reais.</p></div>
        </CardContent></Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Faturamento (mês)" value={formatCurrency(62000)} subtitle="valorLiquido" icon={DollarSign} color="oklch(0.65 0.15 200)" trend={21.6} />
        <KPICard title="Atendimentos" value="540" subtitle="Total do mês" icon={Scissors} color="oklch(0.78 0.12 75)" trend={17.4} />
        <KPICard title="Ticket Médio" value={formatCurrency(114.8)} subtitle="Por atendimento" icon={TrendingUp} color="oklch(0.65 0.15 145)" trend={3.5} />
        <KPICard title="Clientes Únicos" value="312" subtitle="Ativos no mês" icon={Users} color="oklch(0.65 0.15 280)" trend={8.3} />
      </div>
      <Tabs defaultValue="faturamento">
        <TabsList className="h-8">
          <TabsTrigger value="faturamento" className="text-xs h-6 px-3">Faturamento</TabsTrigger>
          <TabsTrigger value="servicos" className="text-xs h-6 px-3">Serviços</TabsTrigger>
          {isMasterOrAdmin && <TabsTrigger value="ranking" className="text-xs h-6 px-3">Ranking</TabsTrigger>}
          <TabsTrigger value="metas" className="text-xs h-6 px-3">Metas</TabsTrigger>
        </TabsList>
        <TabsContent value="faturamento" className="mt-4 space-y-4">
          <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Evolução do Faturamento</CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={MOCK_MONTHLY}>
                <defs><linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Faturamento"]} contentStyle={{ background: "oklch(0.15 0 0)", border: "1px solid oklch(0.25 0 0)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="faturamento" stroke="oklch(0.65 0.15 200)" fill="url(#colorFat)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Atendimentos por Mês</CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={MOCK_MONTHLY}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                <Tooltip contentStyle={{ background: "oklch(0.15 0 0)", border: "1px solid oklch(0.25 0 0)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="atendimentos" fill="oklch(0.78 0.12 75)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="servicos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Mix de Serviços</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={MOCK_SERVICES} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {MOCK_SERVICES.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip contentStyle={{ background: "oklch(0.15 0 0)", border: "1px solid oklch(0.25 0 0)", borderRadius: 8, fontSize: 12 }} /></PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {MOCK_SERVICES.map((s, i) => <div key={s.name} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-xs text-muted-foreground">{s.name} ({s.value}%)</span></div>)}
              </div>
            </CardContent></Card>
            <div className="space-y-3">
              {MOCK_SERVICES.map((s, i) => (
                <Card key={s.name} className="bg-card border-border"><CardContent className="p-4 flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1"><p className="text-sm font-medium text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.value}% dos atendimentos</p></div>
                  <span className="text-sm font-bold text-foreground">{Math.round(540 * s.value / 100)}</span>
                </CardContent></Card>
              ))}
            </div>
          </div>
        </TabsContent>
        {isMasterOrAdmin && (
          <TabsContent value="ranking" className="mt-4">
            <Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Ranking da Rede</CardTitle></CardHeader><CardContent>
              {units.length === 0 ? <div className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p></div> : (
                <div className="space-y-2">
                  {units.map((unit, idx) => (
                    <div key={unit.id} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ idx === 0 ? "bg-amber-500/20 text-amber-500" : idx === 1 ? "bg-gray-400/20 text-gray-400" : idx === 2 ? "bg-orange-600/20 text-orange-600" : "bg-muted text-muted-foreground" }`}>{idx + 1}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{unit.name}</p>{unit.city && <p className="text-xs text-muted-foreground">{unit.city}</p>}</div>
                      <div className="text-right"><p className="text-sm font-bold text-foreground">{formatCurrency(62000 - idx * 5000)}</p><p className="text-xs text-muted-foreground">{540 - idx * 40} atend.</p></div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </TabsContent>
        )}
        <TabsContent value="metas" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Meta de Faturamento", current: 62000, target: 70000, color: "oklch(0.65 0.15 200)" },
              { label: "Meta de Atendimentos", current: 540, target: 600, color: "oklch(0.78 0.12 75)" },
              { label: "Meta de Novos Clientes", current: 45, target: 60, color: "oklch(0.65 0.15 145)" },
              { label: "Meta de Ticket Médio", current: 114.8, target: 120, color: "oklch(0.65 0.15 280)" },
            ].map(meta => {
              const pct = Math.min(100, Math.round((meta.current / meta.target) * 100));
              return (
                <Card key={meta.label} className="bg-card border-border"><CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3"><p className="text-xs font-medium text-foreground">{meta.label}</p><Badge variant="secondary" className="text-xs">{pct}%</Badge></div>
                  <div className="w-full bg-muted rounded-full h-2 mb-2"><div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} /></div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{meta.current > 1000 ? formatCurrency(meta.current) : meta.current}</span>
                    <span>Meta: {meta.target > 1000 ? formatCurrency(meta.target) : meta.target}</span>
                  </div>
                </CardContent></Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
