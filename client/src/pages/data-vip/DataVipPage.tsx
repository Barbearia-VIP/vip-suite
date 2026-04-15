import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useOrg } from "@/hooks/useOrg";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  RefreshCw, TrendingUp, Users, DollarSign, Calendar,
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2, BarChart3,
  Trophy, Scissors, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import { DatePicker } from "@/components/DatePicker";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const COLORS = ["oklch(0.65 0.15 200)", "oklch(0.78 0.12 75)", "oklch(0.65 0.15 145)", "oklch(0.65 0.15 280)"];

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function formatDateTime(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const MOCK_MONTHLY = [
  { month: "Out", faturamento: 42000, atendimentos: 380 },
  { month: "Nov", faturamento: 48000, atendimentos: 420 },
  { month: "Dez", faturamento: 55000, atendimentos: 490 },
  { month: "Jan", faturamento: 38000, atendimentos: 340 },
  { month: "Fev", faturamento: 51000, atendimentos: 460 },
  { month: "Mar", faturamento: 62000, atendimentos: 540 },
];
const MOCK_SERVICES = [{ name: "Corte", value: 45 }, { name: "Barba", value: 28 }, { name: "Combo", value: 18 }, { name: "Outros", value: 9 }];

// ─── MODAL DE SINCRONIZAÇÃO ───────────────────────────────────────────────────

interface SyncUnit { id: number; nome: string; hasApiKeys: boolean; }

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  units: SyncUnit[];
  onSync: (unitId: number, inicio: string, fim: string) => void;
  isSyncing: boolean;
}

function SyncModal({ open, onClose, units, onSync, isSyncing }: SyncModalProps) {
  const today = toISODate(new Date());
  const firstOfMonth = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [inicio, setInicio] = useState(firstOfMonth);
  const [fim, setFim] = useState(today);

  const presets = [
    { label: "Hoje", inicio: today, fim: today },
    { label: "Últimos 7 dias", inicio: toISODate(new Date(Date.now() - 7 * 86400000)), fim: today },
    { label: "Últimos 30 dias", inicio: toISODate(new Date(Date.now() - 30 * 86400000)), fim: today },
    { label: "Este mês", inicio: firstOfMonth, fim: today },
    {
      label: "Mês passado",
      inicio: toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
      fim: toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 0))
    },
    { label: "Últimos 3 meses", inicio: toISODate(new Date(Date.now() - 90 * 86400000)), fim: today },
  ];

  const selectedUnitObj = units.find(u => u.id === Number(selectedUnit));

  function handleSync() {
    if (!selectedUnit) { toast.error("Selecione uma unidade"); return; }
    if (!inicio || !fim) { toast.error("Selecione o período"); return; }
    if (inicio > fim) { toast.error("Data de início deve ser anterior à data fim"); return; }
    onSync(Number(selectedUnit), inicio, fim);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Sincronizar Data VIP
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seleção de unidade */}
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a unidade..." />
              </SelectTrigger>
              <SelectContent>
                {units.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    <span className="flex items-center gap-2">
                      {u.nome}
                      {!u.hasApiKeys && (
                        <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">Sem chaves</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUnitObj && !selectedUnitObj.hasApiKeys && (
              <p className="text-xs text-yellow-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Esta unidade não tem chaves de API configuradas. Acesse Configurações.
              </p>
            )}
          </div>

          {/* Atalhos de período */}
          <div className="space-y-1.5">
            <Label>Período rápido</Label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setInicio(p.inicio); setFim(p.fim); }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Datas personalizadas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data início</Label>
              <DatePicker value={inicio} onChange={setInicio} max={today} placeholder="Data início" />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim</Label>
              <DatePicker value={fim} onChange={setFim} min={inicio} max={today} placeholder="Data fim" />
            </div>
          </div>

          {inicio && fim && inicio <= fim && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
              Serão importados os dados de{" "}
              <strong>{new Date(inicio + "T12:00:00").toLocaleDateString("pt-BR")}</strong>
              {" "}até{" "}
              <strong>{new Date(fim + "T12:00:00").toLocaleDateString("pt-BR")}</strong>.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSyncing}>Cancelar</Button>
          <Button
            onClick={handleSync}
            disabled={isSyncing || !selectedUnit || !selectedUnitObj?.hasApiKeys}
          >
            {isSyncing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sincronizando...</>
              : <><RefreshCw className="w-4 h-4 mr-2" />Sincronizar</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function DataVipPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const ct = useChartTheme();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [historyUnitId, setHistoryUnitId] = useState<number | null>(null);

  const today = toISODate(new Date());
  const firstOfMonth = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // KPIs do mês atual
  const kpisQuery = trpc.dataVip.kpis.useQuery({
    unitId: selectedUnit?.id,
    inicio: firstOfMonth,
    fim: today,
  });

  // Configurações das unidades (para o modal de sync)
  const unitsConfigQuery = trpc.dataVip.unitsConfig.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org?.id }
  );

  // Histórico de sincronizações
  const effectiveHistoryUnitId = historyUnitId ?? selectedUnit?.id;
  const syncHistoryQuery = trpc.dataVip.syncHistory.useQuery(
    { unitId: effectiveHistoryUnitId ?? 0 },
    { enabled: !!effectiveHistoryUnitId }
  );

  const utils = trpc.useUtils();

  const syncMutation = trpc.dataVip.sync.useMutation({
    onSuccess: (data) => {
      toast.success(data.message, {
  
      });
      setSyncModalOpen(false);
      utils.dataVip.kpis.invalidate();
      utils.dataVip.syncHistory.invalidate();
    },
    onError: (err) => {
      toast.error("Erro na sincronização", { description: err.message });
    },
  });

  const unitsForModal: SyncUnit[] = useMemo(() =>
    (unitsConfigQuery.data ?? []).map(u => ({
      id: u.id,
      nome: u.name,
      hasApiKeys: u.hasApiKeys,
    })),
    [unitsConfigQuery.data]
  );

  const kpis = kpisQuery.data;
  const isLoadingKpis = kpisQuery.isLoading;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
            <BarChart3 className="w-6 h-6 text-primary" />
            Data VIP
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analytics e faturamento — {selectedUnit ? selectedUnit.name : "Todas as unidades"}
          </p>
        </div>
        <Button onClick={() => setSyncModalOpen(true)} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Sincronizar
        </Button>
      </div>

      {/* KPIs do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: "Faturamento (mês)", icon: DollarSign, color: "oklch(0.65 0.15 200)",
            value: isLoadingKpis ? "..." : formatCurrency(kpis?.totalFaturamento ?? 0),
            subtitle: "Valor líquido"
          },
          {
            title: "Atendimentos", icon: Scissors, color: "oklch(0.78 0.12 75)",
            value: isLoadingKpis ? "..." : (kpis?.totalAtendimentos ?? 0).toLocaleString("pt-BR"),
            subtitle: "Total do mês"
          },
          {
            title: "Ticket Médio", icon: TrendingUp, color: "oklch(0.65 0.15 145)",
            value: isLoadingKpis ? "..." : formatCurrency(kpis?.ticketMedio ?? 0),
            subtitle: "Por atendimento"
          },
          {
            title: "Clientes Únicos", icon: Users, color: "oklch(0.65 0.15 280)",
            value: "—", subtitle: "Sincronize para ver"
          },
        ].map(k => (
          <Card key={k.title} className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{k.title}</p>
                  <p className="text-xl font-bold text-foreground">{k.value}</p>
                  {k.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{k.subtitle}</p>}
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${k.color}20` }}>
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs de análise */}
      <Tabs defaultValue="faturamento">
        <TabsList className="h-8">
          <TabsTrigger value="faturamento" className="text-xs h-6 px-3">Faturamento</TabsTrigger>
          <TabsTrigger value="servicos" className="text-xs h-6 px-3">Serviços</TabsTrigger>
          {isMasterOrAdmin && <TabsTrigger value="ranking" className="text-xs h-6 px-3">Ranking</TabsTrigger>}
          <TabsTrigger value="historico" className="text-xs h-6 px-3">Sincronizações</TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução do Faturamento</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={MOCK_MONTHLY}>
                  <defs>
                    <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(2)}`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Faturamento"]} contentStyle={ct.tooltipStyle} />
                  <Area type="monotone" dataKey="faturamento" stroke="oklch(0.65 0.15 200)" fill="url(#colorFat)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Atendimentos por Mês</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={MOCK_MONTHLY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} />
                  <Tooltip contentStyle={ct.tooltipStyle} />
                  <Bar dataKey="atendimentos" fill="oklch(0.78 0.12 75)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servicos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Mix de Serviços</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={MOCK_SERVICES} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {MOCK_SERVICES.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={ct.tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {MOCK_SERVICES.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-muted-foreground">{s.name} ({s.value}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {MOCK_SERVICES.map((s, i) => (
                <Card key={s.name} className="bg-card border-border">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.value}% dos atendimentos</p>
                    </div>
                    <span className="text-sm font-bold text-foreground">{Math.round(540 * s.value / 100)}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {isMasterOrAdmin && (
          <TabsContent value="ranking" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />Ranking da Rede
                </CardTitle>
              </CardHeader>
              <CardContent>
                {units.length === 0 ? (
                  <div className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p></div>
                ) : (
                  <div className="space-y-2">
                    {units.map((unit, idx) => (
                      <div key={unit.id} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? "bg-amber-500/20 text-amber-500" : idx === 1 ? "bg-gray-400/20 text-gray-400" : idx === 2 ? "bg-orange-600/20 text-orange-600" : "bg-muted text-muted-foreground"}`}>{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{unit.name}</p>
                          {unit.city && <p className="text-xs text-muted-foreground">{unit.city}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{formatCurrency(62000 - idx * 5000)}</p>
                          <p className="text-xs text-muted-foreground">{540 - idx * 40} atend.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Aba de histórico de sincronizações */}
        <TabsContent value="historico" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Histórico de Sincronizações
                </CardTitle>
                {(unitsConfigQuery.data?.length ?? 0) > 1 && (
                  <Select
                    value={historyUnitId ? String(historyUnitId) : ""}
                    onValueChange={v => setHistoryUnitId(Number(v))}
                  >
                    <SelectTrigger className="w-48 h-8 text-xs">
                      <SelectValue placeholder="Selecionar unidade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unitsConfigQuery.data?.map(u => (
                        <SelectItem key={u.id} value={String(u.id)} className="text-xs">{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!effectiveHistoryUnitId ? (
                <p className="text-sm text-muted-foreground text-center py-4">Selecione uma unidade para ver o histórico</p>
              ) : syncHistoryQuery.isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (syncHistoryQuery.data?.length ?? 0) === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma sincronização realizada ainda.</p>
                  <p className="text-xs mt-1">Clique em "Sincronizar" para importar os dados.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {syncHistoryQuery.data?.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 text-sm">
                      <div className="flex items-center gap-2">
                        {entry.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                        {entry.status === "error" && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        {entry.status === "running" && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                        <div>
                          <p className="font-medium">
                            {entry.status === "success" && `${entry.registrosImportados} registros importados`}
                            {entry.status === "error" && "Erro na sincronização"}
                            {entry.status === "running" && "Sincronizando..."}
                          </p>
                          {entry.erro && <p className="text-xs text-red-400">{entry.erro}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(entry.iniciadoEm)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de sincronização */}
      <SyncModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        units={unitsForModal}
        onSync={(unitId, inicio, fim) => syncMutation.mutate({ unitId, inicio, fim })}
        isSyncing={syncMutation.isPending}
      />
    </div>
  );
}
