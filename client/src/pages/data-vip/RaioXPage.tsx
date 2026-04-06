/**
 * RaioXPage.tsx — Raio X Clientes completo
 * Abas: Visão Geral | One-Shot | Cadência | Churn | Cohort | Barbeiros | Ações | Diagnóstico
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, ReferenceLine,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingDown, TrendingUp,
  Zap, Activity, Target, Scissors, Search, RefreshCw, Info, ChevronRight, Calendar,
  Wifi, WifiOff
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  // MySQL pode retornar Date objects ou strings
  if (d instanceof Date) return d.toLocaleDateString("pt-BR");
  // Se for string no formato YYYY-MM-DD, adiciona horário para evitar fuso horário
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
  }
  // Outros formatos de string
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}
function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMes(m: string) {
  if (!m) return m;
  const [y, mo] = m.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(mo) - 1]}/${y.slice(2)}`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ElementType;
}) {
  return (
    <Card className="bg-card/60 border-border/50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color || "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-5 h-5 mt-1 ${color || "text-muted-foreground"}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Info Popover ───────────────────────────────────────────────────────────
function InfoPopover({ title, descricao, periodoFiltrado, ref, baseUsada, baseTotal, regra, usadaEm, nota }: {
  title: string;
  descricao: string;
  periodoFiltrado?: string;
  ref?: string;
  baseUsada?: string;
  baseTotal?: number;
  regra?: string;
  usadaEm?: string;
  nota?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors" aria-label="Entender cálculo">
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 text-sm" side="bottom" align="start">
        <div className="p-4 space-y-3">
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{descricao}</p>
          </div>
          {(periodoFiltrado || ref || baseUsada || regra) && (
            <div className="bg-muted/40 rounded-md p-3 space-y-1.5 text-xs">
              <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] mb-2">CONTEXTO</p>
              {periodoFiltrado && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Período filtrado:</span>
                  <span className="font-medium">{periodoFiltrado}</span>
                </div>
              )}
              {ref && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">REF:</span>
                  <span className="font-medium">{ref}</span>
                </div>
              )}
              {baseUsada && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Base usada:</span>
                  <span className="font-medium text-right">
                    {baseTotal !== undefined && <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold mr-1">{baseTotal > 999 ? (baseTotal/1000).toFixed(1)+'k' : baseTotal}</span>}
                    {baseUsada}
                  </span>
                </div>
              )}
              {regra && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Regra:</span>
                  <span className="font-mono text-[11px] font-medium text-right">{regra}</span>
                </div>
              )}
              {usadaEm && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Usada em:</span>
                  <span className="font-medium text-right">{usadaEm}</span>
                </div>
              )}
            </div>
          )}
          {nota && (
            <p className="text-xs text-amber-400 leading-relaxed">{nota}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Dot Badge ───────────────────────────────────────────────────────────────
function DotBadge({ color, label, count, pct }: { color: string; label: string; count: number; pct?: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm">{count.toLocaleString()}</span>
        {pct !== undefined && <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>}
      </div>
    </div>
  );
}

const CORES = {
  verde: "#22c55e",
  amarelo: "#eab308",
  vermelho: "#ef4444",
  azul: "#3b82f6",
  roxo: "#a855f7",
  laranja: "#f97316",
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RaioXPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [tab, setTab] = useState("visao-geral");
  const [search, setSearch] = useState("");
  const [oneShotFiltro, setOneShotFiltro] = useState<"todos" | "aguardando" | "em_risco" | "perdido">("todos");
  const [acoesTipo, setAcoesTipo] = useState<"todos" | "one_shot_risco" | "perdidos_recentes" | "em_risco">("todos");

  // Seletor de período
  type PeriodoPreset = "30d" | "60d" | "90d" | "6m" | "12m" | "custom";
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("90d");
  const [customInicio, setCustomInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split("T")[0];
  });
  const [customFim, setCustomFim] = useState(() => new Date().toISOString().split("T")[0]);

  const { dataInicio, dataFim } = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    if (periodoPreset === "custom") return { dataInicio: customInicio, dataFim: customFim };
    const dias: Record<PeriodoPreset, number> = { "30d": 30, "60d": 60, "90d": 90, "6m": 180, "12m": 365, custom: 90 };
    const inicio = new Date(now); inicio.setDate(inicio.getDate() - dias[periodoPreset]);
    return { dataInicio: fmt(inicio), dataFim: fmt(now) };
  }, [periodoPreset, customInicio, customFim]);

  const periodoLabel = useMemo(() => {
    const d1 = new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const d2 = new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
    return `${d1} → ${d2}`;
  }, [dataInicio, dataFim]);

  const baseInput = useMemo(() => ({
    orgId: org?.id,
    unitId: selectedUnit?.id,
    dataInicio,
    dataFim,
  }), [org?.id, selectedUnit?.id, dataInicio, dataFim]);

  // Queries
  const qVisao = trpc.raioX.visaoGeral.useQuery(baseInput, { enabled: !!org?.id });
  const qOneShot = trpc.raioX.oneShot.useQuery(
    { ...baseInput, status: oneShotFiltro, search, page: 1, pageSize: 100 },
    { enabled: !!org?.id && tab === "one-shot" }
  );
  const qCadencia = trpc.raioX.cadencia.useQuery(baseInput, { enabled: !!org?.id && tab === "cadencia" });
  const qChurn = trpc.raioX.churn.useQuery(baseInput, { enabled: !!org?.id && tab === "churn" });
  const [churnViewMode, setChurnViewMode] = useState<"geral" | "barbeiros">("geral");
  const qChurnBarbeiros = trpc.raioX.churnPorBarbeiro.useQuery(baseInput, { enabled: !!org?.id && tab === "churn" });
  const qCohort = trpc.raioX.cohort.useQuery(baseInput, { enabled: !!org?.id && tab === "cohort" });
  const qBarbeiros = trpc.raioX.barbeiros.useQuery(baseInput, { enabled: !!org?.id && tab === "barbeiros" });
  const qAcoes = trpc.raioX.acoes.useQuery(
    { ...baseInput, tipo: acoesTipo, page: 1, pageSize: 100 },
    { enabled: !!org?.id && tab === "acoes" }
  );
  const qDiag = trpc.raioX.diagnostico.useQuery(baseInput, { enabled: !!org?.id && tab === "diagnostico" });
  // Status do banco externo
  const qDbStatus = trpc.dataVip.dbStatus.useQuery(undefined, {
    refetchInterval: 10000,
    retry: false,
  });
  const dbConnected = qDbStatus.data?.connected ?? true;

  const v = qVisao.data;
  const isLoading = qVisao.isLoading;

  const scoreBase = v ? Math.round(
    (v.sinais.ativos / Math.max(v.sinais.totalBase, 1)) * 100
  ) : 0;
  const scoreCor = scoreBase >= 60 ? "text-green-400" : scoreBase >= 40 ? "text-yellow-400" : "text-red-400";
  const scoreLabel = scoreBase >= 60 ? "Saudável" : scoreBase >= 40 ? "Em risco" : "Crítico";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Raio X — Clientes
            {!dbConnected && (
              <span className="flex items-center gap-1 text-xs font-normal text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                <WifiOff className="w-3 h-3" /> Reconectando banco...
              </span>
            )}
            {dbConnected && qDbStatus.isFetched && (
              <span className="flex items-center gap-1 text-xs font-normal text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <Wifi className="w-3 h-3" /> Banco conectado
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · Base: {v?.sinais.totalBase.toLocaleString() ?? "—"} clientes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Seletor de período */}
          <div className="flex items-center gap-2">
            <Select value={periodoPreset} onValueChange={(v) => setPeriodoPreset(v as PeriodoPreset)}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <Calendar className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="60d">Últimos 60 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodoPreset === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customInicio}
                  onChange={e => setCustomInicio(e.target.value)}
                  className="h-8 px-2 text-xs rounded border border-border bg-background text-foreground"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={customFim}
                  onChange={e => setCustomFim(e.target.value)}
                  className="h-8 px-2 text-xs rounded border border-border bg-background text-foreground"
                />
              </div>
            )}
            {periodoPreset !== "custom" && (
              <span className="text-xs text-muted-foreground hidden sm:block">{periodoLabel}</span>
            )}
          </div>
          {v && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${scoreCor}`}>{scoreBase}%</p>
              <p className="text-xs text-muted-foreground">{scoreLabel}</p>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => qVisao.refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/40 p-1">
          {[
            { id: "visao-geral", label: "Visão Geral" },
            { id: "one-shot", label: "One-Shot" },
            { id: "cadencia", label: "Cadência" },
            { id: "churn", label: "Churn" },
            { id: "cohort", label: "Cohort" },
            { id: "barbeiros", label: "Barbeiros" },
            { id: "acoes", label: "Ações" },
            { id: "diagnostico", label: "Diagnóstico" },
          ].map(t => (
            <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── VISÃO GERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="visao-geral" className="space-y-5 mt-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-40" />
            </div>
          ) : v ? (
            <>
              {/* ── Sinais da base ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sinais da base</h3>
                  <span className="text-xs text-muted-foreground">{v.periodo.dataInicio} → {v.periodo.dataFim}</span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Ativos (≤60d)</p>
                    <p className="text-2xl font-bold text-green-400 mt-1">{v.sinais.ativos.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctAtivos}% da base</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Perdidos</p>
                    <p className="text-2xl font-bold text-red-400 mt-1">{v.sinais.perdidos.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctPerdidos}% da base</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />Em Risco</p>
                    <p className="text-2xl font-bold text-orange-400 mt-1">{v.sinais.emRisco.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctEmRisco}% da base</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Novos</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">{v.sinais.novos.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctNovos}% dos atendidos</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />One-Shot Urgente</p>
                    <p className="text-2xl font-bold text-yellow-400 mt-1">{v.sinais.oneShotUrgente.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctOneShotUrgente}% dos one-shots</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Resgatados</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{v.sinais.resgatados.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctResgatados}% da base</p>
                  </div>
                </div>
              </div>

              {/* ── Atividade do período ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Atividade do Período</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Clientes únicos" value={v.atividade.clientesUnicos.toLocaleString()} icon={Users} color="text-foreground" />
                  <KpiCard label="Novos clientes" value={v.atividade.novosClientes.toLocaleString()} icon={UserCheck} color="text-blue-400" />
                  <KpiCard label="Ativos na janela" value={v.atividade.ativosNaJanela.toLocaleString()} icon={Activity} color="text-green-400" />
                  <KpiCard label="Resgatados" value={v.atividade.resgatados.toLocaleString()} icon={TrendingUp} color="text-emerald-400" />
                </div>
              </div>

              {/* ── Saúde da base ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Saúde da Base · 12m</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Em Risco */}
                  <Card className="bg-card/60 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center">
                            Em risco
                            <InfoPopover
                              title="Em risco"
                              descricao="Última visita entre 61 e 90 dias antes da REF. Zona de alerta — ainda recuperáveis."
                              periodoFiltrado={v.contexto?.periodoFiltrado}
                              ref={v.contexto?.ref}
                              baseUsada={v.contexto?.baseUsada}
                              baseTotal={v.sinais.totalBase}
                              regra={v.contexto?.emRisco?.regra}
                              usadaEm={v.contexto?.emRisco?.usadaEm}
                              nota="Acione via CRM → aba Ações."
                            />
                          </p>
                          <p className="text-2xl font-bold mt-1 text-orange-400">{v.saude.emRisco.toLocaleString()}</p>
                        </div>
                        <AlertTriangle className="w-5 h-5 mt-1 text-orange-400" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* Em Risco Total (totalizador: Em Risco + One-shot urgente) */}
                  <Card className="bg-orange-500/10 border-orange-500/30">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-orange-400/80 uppercase tracking-wide flex items-center font-medium">
                            Em risco total
                            <InfoPopover
                              title="Em Risco Total"
                              descricao="Soma de Em Risco (recorrentes 61-90d) + One-shot urgente (1 visita, ≥46d sem retornar). Representa todos os clientes em zona de alerta, independente do perfil."
                              periodoFiltrado={v.contexto?.periodoFiltrado}
                              ref={v.contexto?.ref}
                              baseUsada={v.contexto?.baseUsada}
                              baseTotal={v.sinais.totalBase}
                              regra={`Em Risco: ${v.saude.emRisco} + One-shot urgente: ${v.sinais.oneShotUrgente}`}
                              usadaEm="Totalizador para comparação com sistemas que não separam one-shots"
                              nota="Use este número ao comparar com o VIP Data, que não separa one-shots do Em Risco geral."
                            />
                          </p>
                          <p className="text-2xl font-bold mt-1 text-orange-300">
                            {(v.saude.emRisco + v.sinais.oneShotUrgente).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-orange-400/60 mt-0.5">
                            {v.saude.emRisco} recorr. + {v.sinais.oneShotUrgente} one-shot urg.
                          </p>
                        </div>
                        <AlertTriangle className="w-5 h-5 mt-1 text-orange-300" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* Perdidos */}
                  <Card className="bg-card/60 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center">
                            Perdidos
                            <InfoPopover
                              title="Perdidos"
                              descricao="Última visita há mais de 90 dias. Excluem one-shots (1 visita) — tratados separadamente."
                              periodoFiltrado={v.contexto?.periodoFiltrado}
                              ref={v.contexto?.ref}
                              baseUsada={v.contexto?.baseUsada}
                              baseTotal={v.sinais.totalBase}
                              regra={v.contexto?.perdidos?.regra}
                              usadaEm={v.contexto?.perdidos?.usadaEm}
                              nota={"Perdido por recência — resgate possível mas custoso. One-shots perdidos aparecem no card abaixo."}
                            />
                          </p>
                          <p className="text-2xl font-bold mt-1 text-red-400">{v.saude.perdidos.toLocaleString()}</p>
                        </div>
                        <UserX className="w-5 h-5 mt-1 text-red-400" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* One-shot risco */}
                  <Card className="bg-card/60 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center">
                            One-shot risco
                            <InfoPopover
                              title="One-shot risco"
                              descricao="Exatamente 1 visita, sem retorno entre 46 e 90 dias. Já passaram do prazo ideal."
                              periodoFiltrado={v.contexto?.periodoFiltrado}
                              ref={v.contexto?.ref}
                              baseUsada={v.contexto?.baseUsada}
                              baseTotal={v.sinais.totalBase}
                              regra={v.contexto?.oneShotRisco?.regra}
                              usadaEm={v.contexto?.oneShotRisco?.usadaEm}
                              nota="Contato proativo pode converter em recorrente."
                            />
                          </p>
                          <p className="text-2xl font-bold mt-1 text-yellow-400">{v.saude.oneShotRisco.toLocaleString()}</p>
                        </div>
                        <Zap className="w-5 h-5 mt-1 text-yellow-400" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* One-shot perdido */}
                  <Card className="bg-card/60 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center">
                            One-shot perdido
                            <InfoPopover
                              title="One-shot perdido"
                              descricao="Exatamente 1 visita, sem retorno há mais de 90 dias. Alta probabilidade de perda definitiva."
                              periodoFiltrado={v.contexto?.periodoFiltrado}
                              ref={v.contexto?.ref}
                              baseUsada={v.contexto?.baseUsada}
                              baseTotal={v.sinais.totalBase}
                              regra={v.contexto?.oneShotPerdido?.regra}
                              usadaEm={v.contexto?.oneShotPerdido?.usadaEm}
                              nota="Alta probabilidade de não retornar. Ver análise completa em One-Shot."
                            />
                          </p>
                          <p className="text-2xl font-bold mt-1 text-red-400">{v.saude.oneShotPerdido.toLocaleString()}</p>
                        </div>
                        <TrendingDown className="w-5 h-5 mt-1 text-red-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ── Distribuições ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Distribuições da Base</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Por Perfil */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                        Por Perfil
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">12</span>
                        <InfoPopover
                          title="Por Perfil"
                          descricao={v.contexto?.distribuicoes?.porPerfil?.descricao ?? "Volume historico + recencia na REF"}
                          periodoFiltrado={v.contexto?.periodoFiltrado}
                          ref={v.contexto?.ref}
                          baseUsada={v.contexto?.distribuicoes?.porPerfil?.universo}
                          baseTotal={v.contexto?.distribuicoes?.porPerfil?.total}
                          regra={v.contexto?.distribuicoes?.porPerfil?.regras}
                          nota={v.contexto?.distribuicoes?.porPerfil?.nota}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {(v.sinais.totalBase).toLocaleString()} clientes</p>
                      {[
                        { label: "Ocasional", val: v.distribuicoes.porPerfil.ocasional, color: "bg-gray-400" },
                        { label: "Fiel", val: v.distribuicoes.porPerfil.fiel, color: "bg-green-500" },
                        { label: "One-shot", val: v.distribuicoes.porPerfil.one_shot, color: "bg-purple-500" },
                        { label: "Regular", val: v.distribuicoes.porPerfil.regular, color: "bg-blue-500" },
                        { label: "Recorrente", val: v.distribuicoes.porPerfil.recorrente, color: "bg-emerald-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={v.sinais.totalBase > 0 ? Math.round(item.val / v.sinais.totalBase * 100) : 0} />
                      ))}
                    </CardContent>
                  </Card>
                  {/* Por Cadência */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                        Por Cadência
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">12</span>
                        <InfoPopover
                          title="Cadencia Fixa"
                          descricao={v.contexto?.distribuicoes?.porCadencia?.descricao ?? "Dias sem vir - recorrentes"}
                          periodoFiltrado={v.contexto?.periodoFiltrado}
                          ref={v.contexto?.ref}
                          baseUsada={v.contexto?.distribuicoes?.porCadencia?.universo}
                          baseTotal={v.contexto?.distribuicoes?.porCadencia?.total}
                          regra={v.contexto?.distribuicoes?.porCadencia?.regras}
                          nota={v.contexto?.distribuicoes?.porCadencia?.nota}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {(v.distribuicoes.porCadencia?.total ?? 0).toLocaleString()} clientes (≥3 visitas)</p>
                      {[
                        { label: "Perdido", val: v.distribuicoes.porCadencia?.perdido ?? 0, color: "bg-red-500" },
                        { label: "Regular", val: v.distribuicoes.porCadencia?.regular ?? 0, color: "bg-blue-500" },
                        { label: "Em risco", val: v.distribuicoes.porCadencia?.emRisco ?? 0, color: "bg-orange-500" },
                        { label: "Espaçando", val: v.distribuicoes.porCadencia?.espacando ?? 0, color: "bg-yellow-500" },
                        { label: "Mto frequente", val: v.distribuicoes.porCadencia?.mtoFrequente ?? 0, color: "bg-green-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={(v.distribuicoes.porCadencia?.total ?? 0) > 0 ? Math.round(item.val / (v.distribuicoes.porCadencia?.total ?? 1) * 100) : 0} />
                      ))}
                    </CardContent>
                  </Card>
                  {/* Status 12m */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                        Status 12m
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">12</span>
                        <InfoPopover
                          title="Status 12m - Saude por Recencia"
                          descricao={v.contexto?.distribuicoes?.status12m?.descricao ?? "Classificacao baseada apenas em recencia"}
                          periodoFiltrado={v.contexto?.periodoFiltrado}
                          ref={v.contexto?.ref}
                          baseUsada={v.contexto?.distribuicoes?.status12m?.universo}
                          baseTotal={v.contexto?.distribuicoes?.status12m?.total}
                          regra={v.contexto?.distribuicoes?.status12m?.regras}
                          nota={v.contexto?.distribuicoes?.status12m?.nota}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {v.sinais.totalBase.toLocaleString()} clientes</p>
                      {[
                        { label: "Perdido", val: v.distribuicoes.status12m.perdido, color: "bg-red-500" },
                        { label: "Saudável", val: v.distribuicoes.status12m.saudavel, color: "bg-green-500" },
                        { label: "Em risco", val: v.distribuicoes.status12m.emRisco, color: "bg-orange-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={v.sinais.totalBase > 0 ? Math.round(item.val / v.sinais.totalBase * 100) : 0} />
                      ))}
                    </CardContent>
                  </Card>
                  {/* One-Shot */}
                  <Card className="bg-card/60 border-border/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                        One-Shot
                        <InfoPopover
                          title="One-Shot - 1a visita unica"
                          descricao={v.contexto?.distribuicoes?.oneShot?.descricao ?? "One-shot = cliente com exatamente 1 visita historica"}
                          periodoFiltrado={v.contexto?.periodoFiltrado}
                          ref={v.contexto?.ref}
                          baseUsada={v.contexto?.distribuicoes?.oneShot?.universo}
                          baseTotal={v.contexto?.distribuicoes?.oneShot?.total}
                          regra={v.contexto?.distribuicoes?.oneShot?.regras}
                          nota={v.contexto?.distribuicoes?.oneShot?.nota}
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {v.distribuicoes.oneShot.total.toLocaleString()} com 1ª visita única</p>
                      {[
                        { label: "Aguardando", val: v.distribuicoes.oneShot.aguardando, color: "bg-blue-500" },
                        { label: "Em risco", val: v.distribuicoes.oneShot.emRisco, color: "bg-orange-500" },
                        { label: "Perdido", val: v.distribuicoes.oneShot.perdido, color: "bg-red-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={v.distribuicoes.oneShot.total > 0 ? Math.round(item.val / v.distribuicoes.oneShot.total * 100) : 0} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ── Cadência Individual ── */}
              {v.cadenciaIndividual && (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        Cadência Individual
                        <InfoPopover
                          title="Cadência Individual"
                          descricao="O ratio mede se o cliente está atrasado em relação ao próprio histórico: dias sem vir ÷ cadência habitual (média dos intervalos entre visitas)."
                          periodoFiltrado={`${v.periodo.dataInicio} – ${v.periodo.dataFim}`}
                          ref={v.periodo.dataFim}
                          baseUsada={`24m · ${v.cadenciaIndividual.total.toLocaleString()} clientes`}
                          baseTotal={v.cadenciaIndividual.total}
                          regra="visitas_hist ≥2 E ratio = DATEDIFF(REF, ultima_venda) / cadencia_habitual"
                          usadaEm="Cadência Individual (6 status) · Score de saúde (dim. cadência)"
                          nota="Universo: clientes com ≥2 visitas históricas que visitaram nos últimos 24m. Cadência habitual = média de todos os intervalos históricos. 1ª Vez = clientes com exatamente 1 visita histórica (one-shots)."
                        />
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {v.cadenciaIndividual.total.toLocaleString()} clientes · 24m de histórico · ≥2 visitas hist.
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {[
                        { label: "ASSÍDUO", val: v.cadenciaIndividual.assiduo, sub: "ratio ≤80%", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
                        { label: "REGULAR", val: v.cadenciaIndividual.regular, sub: "80–120%", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
                        { label: "ESPAÇANDO", val: v.cadenciaIndividual.espacando, sub: "120–180%", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
                        { label: "1ª VEZ", val: v.cadenciaIndividual.primeiraVez, sub: "1 visita hist.", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
                        { label: "EM RISCO", val: v.cadenciaIndividual.emRisco, sub: "180–250%", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
                        { label: "PERDIDO", val: v.cadenciaIndividual.perdido, sub: "ratio >250%", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
                      ].map(item => (
                        <div key={item.label} className={`rounded-lg border p-3 ${item.bg}`}>
                          <p className={`text-xs font-semibold tracking-wide ${item.color}`}>{item.label}</p>
                          <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.val.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Clientes Novos no período ── */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-muted-foreground" />
                      Clientes Novos no período
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">1ª visita histórica em {v.periodo.dataInicio} → {v.periodo.dataFim}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">TOTAL NOVOS</p>
                      <p className="text-2xl font-bold text-blue-400">{v.novosClientes.total.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.sinais.pctNovos}% dos atendidos</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">RECORRENTES</p>
                      <p className="text-2xl font-bold">{v.novosClientes.recorrentes.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.novosClientes.total > 0 ? Math.round(v.novosClientes.recorrentes / v.novosClientes.total * 100) : 0}% voltaram</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ONE-SHOT</p>
                      <p className="text-2xl font-bold text-yellow-400">{v.novosClientes.oneShotTotal.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{v.novosClientes.total > 0 ? Math.round(v.novosClientes.oneShotTotal / v.novosClientes.total * 100) : 0}% só 1 visita</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">SAÚDE AQUISIÇÃO</p>
                      <p className={`text-2xl font-bold ${v.novosClientes.saudeAquisicao >= 30 ? "text-green-400" : v.novosClientes.saudeAquisicao >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                        {v.novosClientes.saudeAquisicao}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.novosClientes.saudeAquisicao >= 30 ? "Boa" : v.novosClientes.saudeAquisicao >= 15 ? "Baixa · avaliar marketing" : "Crítica · revisar marketing"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Movimento da Base ── */}
              {v.movimentoMensal && v.movimentoMensal.length > 0 && (() => {
                const totalAtend = v.movimentoMensal.reduce((s, r) => s + r.atendidos, 0);
                const mediaAtend = v.movimentoMensal.length > 0 ? Math.round(totalAtend / v.movimentoMensal.length) : 0;
                const anoAtual = new Date().getFullYear();
                const anoAtendidos = v.movimentoMensal
                  .filter(r => r.mes.startsWith(String(anoAtual)))
                  .reduce((s, r) => s + r.atendidos, 0);
                const ultimos6m = v.movimentoMensal.slice(-6).reduce((s, r) => s + r.atendidos, 0);
                return (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">Movimento da base</CardTitle>
                          <span className="text-xs text-muted-foreground">· <span className="text-foreground font-medium">{totalAtend.toLocaleString()}</span> atendidos</span>
                          <InfoPopover
                            title="Movimento da Base — Mensal"
                            descricao="Barras: Clientes atendidos naquele mês (clique para ver a lista). Linha laranja: Clientes em risco ao fim do mês. Linha verde: Clientes resgatados no mês."
                            periodoFiltrado={v.contexto?.periodoFiltrado}
                            ref={v.contexto?.ref}
                            baseUsada={v.contexto?.baseUsada}
                            baseTotal={v.sinais.totalBase}
                            regra="Atendidos: clientes únicos com visita no mês | Em risco: última visita 61-90d após fim do mês | Resgatados: voltaram após >90d ausentes"
                            nota="Clique em qualquer barra para ver os clientes daquele mês. Configure os thresholds em Config → Seção 5."
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          12m: <span className="text-foreground">{totalAtend.toLocaleString()}</span>
                          {" · "}
                          6m: <span className="text-foreground">{ultimos6m.toLocaleString()}</span>
                          {" · "}
                          Ano: <span className="text-foreground">{anoAtendidos.toLocaleString()}</span>
                          {" · "}
                          Méd: <span className="text-foreground">{mediaAtend.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={v.movimentoMensal} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            val.toLocaleString(),
                            name === "atendidos" ? "Atendidos" : name === "emRisco" ? "Em risco" : "Resgatados"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                        />
                        <ReferenceLine y={mediaAtend} stroke="#ca8a04" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: `Méd: ${mediaAtend}`, fill: "#ca8a04", fontSize: 10, position: "insideTopLeft" }} />
                        <Bar dataKey="atendidos" fill="#ca8a04" radius={[3, 3, 0, 0]} name="atendidos" />
                        <Line type="monotone" dataKey="emRisco" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} name="emRisco" />
                        <Line type="monotone" dataKey="resgatados" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e" }} name="resgatados" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-600 inline-block" />Atendidos</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-500" />Em risco</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-green-500" />Resgatados</span>
                    </div>
                  </CardContent>
                </Card>
                );
              })()}

              {/* ── Entradas na base ── */}
              {v.entradasMensais && v.entradasMensais.length > 0 && (() => {
                const totalNovos = v.entradasMensais.reduce((s, r) => s + r.novos, 0);
                const totalResgatados = v.entradasMensais.reduce((s, r) => s + r.resgatados, 0);
                const anoAtual = new Date().getFullYear();
                const anoNovos = v.entradasMensais.filter(r => r.mes.startsWith(String(anoAtual))).reduce((s, r) => s + r.novos, 0);
                const ultimos6mNovos = v.entradasMensais.slice(-6).reduce((s, r) => s + r.novos, 0);
                return (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">Entradas na base</CardTitle>
                          <span className="text-xs text-muted-foreground">· <span className="text-foreground font-medium">{totalNovos.toLocaleString()}</span> novos + <span className="text-blue-400 font-medium">{totalResgatados.toLocaleString()}</span> resgatados</span>
                          <InfoPopover
                            title="Entradas na Base — Mensal"
                            descricao="Verde: Clientes novos (1ª visita histórica no período). Azul: Clientes resgatados (estavam perdidos >90d e voltaram no período)."
                            periodoFiltrado={v.contexto?.periodoFiltrado}
                            ref={v.contexto?.ref}
                            baseUsada={v.contexto?.baseUsada}
                            baseTotal={v.sinais.totalBase}
                            regra="Novos: data_criacao do cliente dentro do período | Resgatados: cliente existia antes do período + última visita anterior estava >90d antes do início do período"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          12m: <span className="text-foreground">{totalNovos.toLocaleString()}</span> novos
                          {" · "}
                          6m: <span className="text-foreground">{ultimos6mNovos.toLocaleString()}</span>
                          {" · "}
                          Ano: <span className="text-foreground">{anoNovos.toLocaleString()}</span>
                          {" · "}
                          Resgatados: <span className="text-blue-400">{totalResgatados.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={v.entradasMensais} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            val.toLocaleString(),
                            name === "novos" ? "Novos" : "Resgatados"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                        />
                        <Bar dataKey="novos" fill={CORES.verde} radius={[3, 3, 0, 0]} name="novos" />
                        <Bar dataKey="resgatados" fill={CORES.azul} radius={[3, 3, 0, 0]} name="resgatados" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-500 inline-block" />Novos (1ª visita)</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500 inline-block" />Resgatados (voltaram após +90d)</span>
                    </div>
                  </CardContent>
                </Card>
                );
              })()}

              {/* ── Risco & Retenção ── */}
              {v.riscoMensal && v.riscoMensal.length > 0 && (() => {
                const totalEmRisco = v.riscoMensal.reduce((s, r) => s + r.emRisco, 0);
                const totalChurn = v.riscoMensal.reduce((s, r) => s + r.churnNovos, 0);
                const mediaChurnPct = v.riscoMensal.length > 0
                  ? Math.round(v.riscoMensal.reduce((s, r) => s + r.churnPct, 0) / v.riscoMensal.length)
                  : 0;
                const mediaEmRiscoPct = v.riscoMensal.length > 0
                  ? Math.round(v.riscoMensal.reduce((s, r) => s + r.emRiscoPct, 0) / v.riscoMensal.length)
                  : 0;
                return (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">Risco & Retenção</CardTitle>
                          <span className="text-xs text-muted-foreground">· <span className="text-orange-400 font-medium">{totalEmRisco.toLocaleString()}</span> em risco + <span className="text-red-400 font-medium">{totalChurn.toLocaleString()}</span> churn</span>
                          <InfoPopover
                            title="Risco & Retenção — Mensal"
                            descricao="Laranja: Clientes recorrentes com última visita 61-90d antes do fim do mês (em zona de alerta). Vermelho: Clientes que passaram para perdido naquele mês (churn). Linha laranja: % em risco da base. Linha vermelha: Churn % do mês."
                            periodoFiltrado={v.contexto?.periodoFiltrado}
                            ref={v.contexto?.ref}
                            baseUsada={v.contexto?.baseUsada}
                            baseTotal={v.sinais.totalBase}
                            regra="Em Risco: DATEDIFF(LAST_DAY(mês), ultima_venda) BETWEEN 61 AND 90, excl. one-shots | Churn: DATEDIFF(LAST_DAY(mês), ultima_venda) > 90, excl. one-shots | Churn %: churn / (ativos + em_risco + churn) do mês"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Em risco méd: <span className="text-orange-400">{mediaEmRiscoPct}%</span>
                          {" · "}
                          Churn méd: <span className="text-red-400">{mediaChurnPct}%</span>
                          {" · "}
                          Total em risco: <span className="text-foreground">{totalEmRisco.toLocaleString()}</span>
                          {" · "}
                          Total churn: <span className="text-foreground">{totalChurn.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={v.riscoMensal} margin={{ top: 5, right: 40, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "#888" }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#888" }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#888" }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            name === "churnPct" || name === "emRiscoPct" ? `${val}%` : val.toLocaleString(),
                            name === "emRisco" ? "Em risco" :
                            name === "churnNovos" ? "Churn (novos perdidos)" :
                            name === "emRiscoPct" ? "Em risco %" : "Churn %"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                        />
                        <Bar yAxisId="left" dataKey="emRisco" fill="#f97316" radius={[3, 3, 0, 0]} name="emRisco" opacity={0.85} />
                        <Bar yAxisId="left" dataKey="churnNovos" fill="#ef4444" radius={[3, 3, 0, 0]} name="churnNovos" opacity={0.85} />
                        <Line yAxisId="right" type="monotone" dataKey="emRiscoPct" stroke="#fb923c" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: "#fb923c" }} name="emRiscoPct" />
                        <Line yAxisId="right" type="monotone" dataKey="churnPct" stroke="#f87171" strokeWidth={2} dot={{ r: 3, fill: "#f87171" }} name="churnPct" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-500 inline-block" />Em risco (61-90d)</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500 inline-block" />Churn novos</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-400" style={{borderTop:'2px dashed #fb923c', background:'transparent'}} />Em risco %</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-red-400" />Churn %</span>
                    </div>
                  </CardContent>
                </Card>
                );
              })()}

              {/* ── Saúde por Barbeiro ── */}
              {v.saudeBarbeiros && v.saudeBarbeiros.length > 0 && (
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Scissors className="w-4 h-4 text-muted-foreground" />
                          Saúde por Barbeiro
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.sinais.totalBase.toLocaleString()} clientes · Ordenado por % risco+perdido
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(() => {
                      const media = v.saudeBarbeiros.length > 0
                        ? Math.round(v.saudeBarbeiros.reduce((acc, b) => acc + b.pctEmRisco + b.pctPerdido, 0) / v.saudeBarbeiros.length)
                        : 0;
                      return v.saudeBarbeiros.map(b => (
                        <div key={b.nome} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{b.nome}</span>
                            <div className="flex items-center gap-2">
                              {(b.pctEmRisco + b.pctPerdido) > media && (
                                <span className="text-xs text-red-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> acima da média
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">{b.total} clientes</span>
                            </div>
                          </div>
                          <div className="flex h-5 rounded overflow-hidden w-full text-[10px] font-semibold">
                            {b.pctSaudavel > 0 && (
                              <div className="flex items-center justify-center bg-emerald-500 text-white overflow-hidden" style={{ width: `${b.pctSaudavel}%` }} title={`Saudável: ${b.saudavel} (${b.pctSaudavel}%)`}>
                                {b.pctSaudavel >= 8 ? `${b.pctSaudavel}%` : ""}
                              </div>
                            )}
                            {b.pctEmRisco > 0 && (
                              <div className="flex items-center justify-center bg-orange-500 text-white overflow-hidden" style={{ width: `${b.pctEmRisco}%` }} title={`Em risco: ${b.emRisco} (${b.pctEmRisco}%)`}>
                                {b.pctEmRisco >= 8 ? `${b.pctEmRisco}%` : ""}
                              </div>
                            )}
                            {b.pctPerdido > 0 && (
                              <div className="flex items-center justify-center bg-red-500 text-white overflow-hidden" style={{ width: `${b.pctPerdido}%` }} title={`Perdido: ${b.perdido} (${b.pctPerdido}%)`}>
                                {b.pctPerdido >= 8 ? `${b.pctPerdido}%` : ""}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {b.pctSaudavel > 0 && <span>{b.pctSaudavel}% saudável ({b.saudavel}) · </span>}
                            {b.pctEmRisco > 0 && <span>{b.pctEmRisco}% espaçando ({b.emRisco}) · </span>}
                            {b.pctPerdido > 0 && <span>{b.pctPerdido}% risco ({b.perdido})</span>}
                          </p>
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum dado encontrado para o período selecionado.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="one-shot" className="space-y-4 mt-4">
          {qOneShot.isLoading ? <Skeleton className="h-40" /> : qOneShot.data ? (
            (() => {
              const os = qOneShot.data.resumo;
              const total = os.total;
              const pctPerdidos = total > 0 ? Math.round((os.emRiscoPerdido / total) * 100) : 0;
              return (
              <>
                {/* Linha de referência */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">REF: {os.dataRef}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-semibold">
                    {total} universo one-shots
                  </span>
                  <span>Aguardando ≤45d · Risco 46–90d · Perdido +91d</span>
                  <span className="ml-auto">{os.totalBase.toLocaleString()} na base principal</span>
                </div>

                {/* KPIs principais */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total one-shots</p>
                    <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  </Card>
                  <Card className="bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">% da base</p>
                    <p className="text-2xl font-bold">{os.pctDaBase}%</p>
                  </Card>
                  <Card className="bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Em risco + perdido</p>
                    <p className="text-2xl font-bold text-orange-400">{os.emRiscoPerdido.toLocaleString()}</p>
                  </Card>
                  <Card className="bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Aguardando</p>
                    <p className="text-2xl font-bold text-blue-400">{os.aguardando.toLocaleString()}</p>
                  </Card>
                </div>

                {/* Alertas automáticos */}
                {os.aguardando > 0 && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
                    <span className="mt-0.5 text-blue-400">⏰</span>
                    <span>{os.aguardando} clientes aguardando — contato proativo agora converte com baixo esforço.</span>
                  </div>
                )}
                {os.emRisco > 0 && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-300">
                    <span className="mt-0.5">⚠️</span>
                    <span>{os.emRisco} em risco — ofereça incentivo (desconto, cortesia) para garantir 2ª visita.</span>
                  </div>
                )}
                {pctPerdidos > 60 && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                    <span className="mt-0.5">↘️</span>
                    <span>{pctPerdidos}% já passaram do prazo. Verifique se a experiência da 1ª visita está boa.</span>
                  </div>
                )}

                {/* Funil de conversão */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold">Funil de conversão</span>
                    <span className="text-xs text-muted-foreground">Clique em qualquer card para ver os clientes</span>
                  </div>
                  {/* Barra proporcional */}
                  {total > 0 && (
                    <div className="flex h-1.5 rounded-full overflow-hidden mb-4 gap-px">
                      <div className="bg-blue-500 transition-all" style={{ width: `${Math.round(os.aguardando/total*100)}%` }} />
                      <div className="bg-orange-400 transition-all" style={{ width: `${Math.round(os.emRisco/total*100)}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${Math.round(os.perdido/total*100)}%` }} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Aguardando */}
                    <Card
                      className="bg-card/60 border-blue-500/30 cursor-pointer hover:border-blue-400/60 transition-colors"
                      onClick={() => setOneShotFiltro(oneShotFiltro === "aguardando" ? "todos" : "aguardando")}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">● AGUARDANDO RETORNO</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">≤45 dias</p>
                        <p className="text-3xl font-bold mb-1">{os.aguardando.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {total > 0 ? Math.round(os.aguardando/total*100) : 0}% dos one-shots · Dentro do prazo normal · contato preventivo recomendado
                        </p>
                        <button className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                          <span>👤</span> Ver lista de clientes →
                        </button>
                      </CardContent>
                    </Card>
                    {/* Em Risco */}
                    <Card
                      className="bg-card/60 border-orange-500/30 cursor-pointer hover:border-orange-400/60 transition-colors"
                      onClick={() => setOneShotFiltro(oneShotFiltro === "em_risco" ? "todos" : "em_risco")}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">● EM RISCO DE PERDA</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">46–90 dias</p>
                        <p className="text-3xl font-bold mb-1">{os.emRisco.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {total > 0 ? Math.round(os.emRisco/total*100) : 0}% dos one-shots · Passaram do prazo ideal · ação urgente necessária
                        </p>
                        <button className="mt-3 text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                          <span>👤</span> Ver lista de clientes →
                        </button>
                      </CardContent>
                    </Card>
                    {/* Provavelmente Perdido */}
                    <Card
                      className="bg-card/60 border-red-500/30 cursor-pointer hover:border-red-400/60 transition-colors"
                      onClick={() => setOneShotFiltro(oneShotFiltro === "perdido" ? "todos" : "perdido")}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">● PROVAVELMENTE PERDIDO</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">+91 dias</p>
                        <p className="text-3xl font-bold mb-1">{os.perdido.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {total > 0 ? Math.round(os.perdido/total*100) : 0}% dos one-shots · Muito difícil recuperação · avaliar custo-benefício
                        </p>
                        <button className="mt-3 text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                          <span>👤</span> Ver lista de clientes →
                        </button>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Tabela de clientes filtrada */}
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-sm font-semibold">
                      {oneShotFiltro === "aguardando" ? "Aguardando Retorno" :
                       oneShotFiltro === "em_risco" ? "Em Risco de Perda" :
                       oneShotFiltro === "perdido" ? "Provavelmente Perdidos" : "Todos os One-Shots"}
                    </span>
                    <div className="flex gap-1 ml-2">
                      {(["todos", "aguardando", "em_risco", "perdido"] as const).map(s => (
                        <Button key={s} variant={oneShotFiltro === s ? "default" : "outline"} size="sm"
                          onClick={() => setOneShotFiltro(s)} className="text-xs h-7">
                          {s === "todos" ? "Todos" : s === "aguardando" ? "Aguardando" : s === "em_risco" ? "Em Risco" : "Perdidos"}
                        </Button>
                      ))}
                    </div>
                    <div className="relative ml-auto">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Buscar cliente..." className="pl-8 h-8 text-xs w-48"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                  </div>
                  <Card className="bg-card/60 border-border/50">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left p-3">Cliente</th>
                            <th className="text-left p-3">Telefone</th>
                            <th className="text-left p-3">1ª Visita</th>
                            <th className="text-left p-3">Última Visita</th>
                            <th className="text-right p-3">Dias</th>
                            <th className="text-right p-3">Gasto</th>
                            <th className="text-left p-3">Status</th>
                          </tr></thead>
                          <tbody>
                            {qOneShot.data.clientes.map(c => (
                              <tr key={c.clienteId} className="border-b border-border/30 hover:bg-muted/20">
                                <td className="p-3 font-medium">{c.clienteNome || "—"}</td>
                                <td className="p-3 text-muted-foreground">{c.telefone || "—"}</td>
                                <td className="p-3 text-muted-foreground">{fmtDate(c.primeiraVenda)}</td>
                                <td className="p-3 text-muted-foreground">{fmtDate(c.ultimaVenda)}</td>
                                <td className="p-3 text-right">{c.dias}d</td>
                                <td className="p-3 text-right">{fmtMoeda(c.totalGasto)}</td>
                                <td className="p-3">
                                  <Badge variant="outline" className={
                                    c.status === "aguardando" ? "border-blue-500/50 text-blue-400" :
                                    c.status === "em_risco" ? "border-orange-500/50 text-orange-400" :
                                    "border-red-500/50 text-red-400"
                                  }>
                                    {c.status === "aguardando" ? "Aguardando" : c.status === "em_risco" ? "Em Risco" : "Perdido"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {qOneShot.data.clientes.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
              );
            })()
          ) : null}
        </TabsContent>

        {/* ── CADÊNCIA ─────────────────────────────────────────────────────────── */}
        <TabsContent value="cadencia" className="space-y-4 mt-4">
          {qCadencia.isLoading ? <Skeleton className="h-40" /> : qCadencia.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard label="Clientes com cadência" value={qCadencia.data.total.toLocaleString()} icon={Activity} sub=">1 visita" />
                <KpiCard label="Intervalo médio" value={`${qCadencia.data.mediaGeral}d`} icon={RefreshCw} sub="entre visitas" />
                <KpiCard label="Frequentes" value={qCadencia.data.distribuicao.mto_frequente.toLocaleString()} icon={TrendingUp} color="text-green-400" sub="≤20 dias" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Cadência</CardTitle></CardHeader>
                  <CardContent>
                    {[
                      { label: "Perdido (>90d)", count: qCadencia.data.distribuicao.perdido, color: "bg-red-500" },
                      { label: "Em risco (61-90d)", count: qCadencia.data.distribuicao.em_risco, color: "bg-yellow-500" },
                      { label: "Espaçado (46-60d)", count: qCadencia.data.distribuicao.espacado, color: "bg-orange-500" },
                      { label: "Regular (21-45d)", count: qCadencia.data.distribuicao.regular, color: "bg-blue-500" },
                      { label: "Mto frequente (≤20d)", count: qCadencia.data.distribuicao.mto_frequente, color: "bg-green-500" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 py-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                        <span className="text-sm flex-1">{item.label}</span>
                        <span className="font-semibold text-sm">{item.count.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {qCadencia.data.total > 0 ? Math.round(item.count / qCadencia.data.total * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top Clientes por Frequência</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left p-2">Cliente</th>
                          <th className="text-right p-2">Visitas</th>
                          <th className="text-right p-2">Intervalo</th>
                        </tr></thead>
                        <tbody>
                          {qCadencia.data.clientes.slice(0, 15).map(c => (
                            <tr key={c.clienteId} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="p-2">{c.clienteNome || "—"}</td>
                              <td className="p-2 text-right">{c.totalVisitas}</td>
                              <td className="p-2 text-right">{c.diasMedios}d</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ── CHURN ────────────────────────────────────────────────────────────── */}
        <TabsContent value="churn" className="space-y-4 mt-4">
          {/* Toggle Geral / Por Barbeiro */}
          <div className="flex items-center gap-2">
            <Button
              variant={churnViewMode === "geral" ? "default" : "outline"}
              size="sm" className="text-xs"
              onClick={() => setChurnViewMode("geral")}
            >Visão Geral</Button>
            <Button
              variant={churnViewMode === "barbeiros" ? "default" : "outline"}
              size="sm" className="text-xs"
              onClick={() => setChurnViewMode("barbeiros")}
            ><Scissors className="w-3 h-3 mr-1" />Por Barbeiro</Button>
          </div>

          {churnViewMode === "geral" && (
            <>{qChurn.isLoading ? <Skeleton className="h-40" /> : qChurn.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Taxa de Churn" value={`${qChurn.data.resumo.taxaChurn}%`} icon={TrendingDown} color="text-red-400" />
                <KpiCard label="Perdidos" value={qChurn.data.resumo.perdidos.toLocaleString()} icon={UserX} color="text-red-400" sub=">90 dias" />
                <KpiCard label="Em risco" value={qChurn.data.resumo.emRisco.toLocaleString()} icon={AlertTriangle} color="text-yellow-400" sub="61-90 dias" />
                <KpiCard label="Receita em risco" value={fmtMoeda(qChurn.data.resumo.receitaPerdida)} icon={TrendingDown} color="text-orange-400" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Última visita por mês</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={qChurn.data.churnMensal} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 10, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                        <Tooltip formatter={(val: number) => [val, "Clientes"]} labelFormatter={fmtMes} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                        <Bar dataKey="total" fill={CORES.vermelho} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Perdidos Recentes</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left p-2">Cliente</th>
                          <th className="text-left p-2">Telefone</th>
                          <th className="text-right p-2">Última Visita</th>
                          <th className="text-right p-2">Dias</th>
                        </tr></thead>
                        <tbody>
                          {qChurn.data.perdidosRecentes.slice(0, 20).map(c => (
                            <tr key={c.clienteId} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="p-2">{c.clienteNome || "—"}</td>
                              <td className="p-2 text-muted-foreground">{c.telefone || "—"}</td>
                              <td className="p-2 text-right">{fmtDate(c.ultimaVenda)}</td>
                              <td className="p-2 text-right text-red-400">{c.dias}d</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}</>
          )}

          {churnViewMode === "barbeiros" && (
            <>{qChurnBarbeiros.isLoading ? <Skeleton className="h-60" /> : qChurnBarbeiros.data ? (
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-yellow-400" />
                  Retenção por Barbeiro
                </CardTitle>
                <p className="text-xs text-muted-foreground">Clientes atendidos no período · status atual baseado na última visita de todos os tempos · use períodos mais antigos (ex: 12 meses) para ver churn real</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="text-left p-3">Barbeiro</th>
                        <th className="text-right p-3">Clientes</th>
                        <th className="text-right p-3">Ativos</th>
                        <th className="text-right p-3">Em Risco</th>
                        <th className="text-right p-3">Perdidos</th>
                        <th className="text-right p-3">One-Shot</th>
                        <th className="text-right p-3">Retenção</th>
                        <th className="text-right p-3">Churn</th>
                        <th className="text-right p-3">Méd. Visitas</th>
                        <th className="text-right p-3">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qChurnBarbeiros.data.barbeiros.map(b => (
                        <tr key={b.colaboradorId} className="border-b border-border/20 hover:bg-muted/20">
                          <td className="p-3 font-medium">{b.colaboradorNome}</td>
                          <td className="p-3 text-right">{b.totalClientes.toLocaleString()}</td>
                          <td className="p-3 text-right text-green-400">{b.ativos.toLocaleString()}</td>
                          <td className="p-3 text-right text-yellow-400">{b.emRisco.toLocaleString()}</td>
                          <td className="p-3 text-right text-red-400">{b.perdidos.toLocaleString()}</td>
                          <td className="p-3 text-right text-purple-400">{b.oneShots.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <span className={`font-semibold ${
                              b.taxaRetencao >= 60 ? "text-green-400" : b.taxaRetencao >= 40 ? "text-yellow-400" : "text-red-400"
                            }`}>{b.taxaRetencao}%</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-semibold ${
                              b.taxaChurn <= 20 ? "text-green-400" : b.taxaChurn <= 40 ? "text-yellow-400" : "text-red-400"
                            }`}>{b.taxaChurn}%</span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{b.mediaVisitas}x</td>
                          <td className="p-3 text-right text-muted-foreground">{fmtMoeda(b.ticketMedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}</>
          )}
        </TabsContent>

        {/* ── COHORT ───────────────────────────────────────────────────────────── */}
        <TabsContent value="cohort" className="space-y-4 mt-4">
          {qCohort.isLoading ? <Skeleton className="h-40" /> : qCohort.data ? (
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cohort por Mês de Entrada (últimos 12 meses)</CardTitle>
                <p className="text-xs text-muted-foreground">Retenção e fidelização por coorte de primeira visita</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left p-3">Coorte</th>
                      <th className="text-right p-3">Entrada</th>
                      <th className="text-right p-3">Voltaram</th>
                      <th className="text-right p-3">Retenção</th>
                      <th className="text-right p-3">Fidelizados</th>
                      <th className="text-right p-3">Fidelização</th>
                      <th className="text-right p-3">Média Visitas</th>
                      <th className="text-right p-3">Ticket Médio</th>
                    </tr></thead>
                    <tbody>
                      {qCohort.data.cohorts.map(c => (
                        <tr key={c.cohort} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-3 font-medium">{fmtMes(c.cohort)}</td>
                          <td className="p-3 text-right">{c.totalEntrada}</td>
                          <td className="p-3 text-right">{c.voltaram}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaRetencao >= 30 ? "text-green-400" : c.taxaRetencao >= 15 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaRetencao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.fidelizados}</td>
                          <td className="p-3 text-right">
                            <span className={c.taxaFidelizacao >= 20 ? "text-green-400" : c.taxaFidelizacao >= 10 ? "text-yellow-400" : "text-red-400"}>
                              {c.taxaFidelizacao}%
                            </span>
                          </td>
                          <td className="p-3 text-right">{c.mediaVisitas}</td>
                          <td className="p-3 text-right">{fmtMoeda(c.mediaGasto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {qCohort.data.cohorts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Dados insuficientes para análise de cohort.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── BARBEIROS ────────────────────────────────────────────────────────── */}
        <TabsContent value="barbeiros" className="space-y-4 mt-4">
          {qBarbeiros.isLoading ? <Skeleton className="h-60" /> : qBarbeiros.data && qBarbeiros.data.barbeiros.length > 0 ? (
            <>
              {/* ── Saúde da Base por Barbeiro ── */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        Saúde da Base por Barbeiro
                      </CardTitle>
                      {(() => {
                        const melhor = [...qBarbeiros.data.barbeiros].sort((a, b) => b.saudePct - a.saudePct)[0];
                        return melhor ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            🏆 Mais saudável: <span className="text-yellow-400 font-medium">{melhor.colaboradorNome}</span>
                            {" "}({melhor.saudePct}% Assíduo+Regular)
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Período: {qBarbeiros.data.periodo.dataInicio} → {qBarbeiros.data.periodo.dataFim}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {qBarbeiros.data.barbeiros.map(b => (
                    <div key={b.colaboradorId} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-muted-foreground" />
                          {b.colaboradorNome}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {b.saudePct}% Assíduo+Regular · {b.totalClientes} cl.
                        </span>
                      </div>
                      {/* Barra segmentada */}
                      <div className="flex h-6 rounded overflow-hidden w-full text-[10px] font-semibold">
                        {b.pctAssiduo > 0 && (
                          <div
                            className="flex items-center justify-center bg-emerald-500 text-white overflow-hidden"
                            style={{ width: `${b.pctAssiduo}%` }}
                            title={`Assíduo (≤30d): ${b.assiduo} (${b.pctAssiduo}%)`}
                          >
                            {b.pctAssiduo >= 5 ? `${b.pctAssiduo}%` : ""}
                          </div>
                        )}
                        {b.pctRegular > 0 && (
                          <div
                            className="flex items-center justify-center bg-blue-500 text-white overflow-hidden"
                            style={{ width: `${b.pctRegular}%` }}
                            title={`Regular (31-60d): ${b.regular} (${b.pctRegular}%)`}
                          >
                            {b.pctRegular >= 5 ? `${b.pctRegular}%` : ""}
                          </div>
                        )}
                        {b.pctEspacando > 0 && (
                          <div
                            className="flex items-center justify-center bg-yellow-500 text-black overflow-hidden"
                            style={{ width: `${b.pctEspacando}%` }}
                            title={`Espaçando (61-90d): ${b.espacando} (${b.pctEspacando}%)`}
                          >
                            {b.pctEspacando >= 5 ? `${b.pctEspacando}%` : ""}
                          </div>
                        )}
                        {b.pctPrimeiraVez > 0 && (
                          <div
                            className="flex items-center justify-center bg-purple-500 text-white overflow-hidden"
                            style={{ width: `${b.pctPrimeiraVez}%` }}
                            title={`1ª Vez: ${b.primeiraVez} (${b.pctPrimeiraVez}%)`}
                          >
                            {b.pctPrimeiraVez >= 5 ? `${b.pctPrimeiraVez}%` : ""}
                          </div>
                        )}
                        {b.pctEmRisco > 0 && (
                          <div
                            className="flex items-center justify-center bg-orange-500 text-white overflow-hidden"
                            style={{ width: `${b.pctEmRisco}%` }}
                            title={`Em Risco (91-120d): ${b.emRisco} (${b.pctEmRisco}%)`}
                          >
                            {b.pctEmRisco >= 5 ? `${b.pctEmRisco}%` : ""}
                          </div>
                        )}
                        {b.pctPerdido > 0 && (
                          <div
                            className="flex items-center justify-center bg-red-500 text-white overflow-hidden"
                            style={{ width: `${b.pctPerdido}%` }}
                            title={`Perdido (>120d): ${b.perdido} (${b.pctPerdido}%)`}
                          >
                            {b.pctPerdido >= 5 ? `${b.pctPerdido}%` : ""}
                          </div>
                        )}
                      </div>
                      {/* Legenda */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        {b.pctAssiduo > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />Assíduo {b.pctAssiduo}%</span>}
                        {b.pctRegular > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-500 mr-1" />Regular {b.pctRegular}%</span>}
                        {b.pctEspacando > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-yellow-500 mr-1" />Espaçando {b.pctEspacando}%</span>}
                        {b.pctPrimeiraVez > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-purple-500 mr-1" />1ª Vez {b.pctPrimeiraVez}%</span>}
                        {b.pctEmRisco > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-orange-500 mr-1" />Em Risco {b.pctEmRisco}%</span>}
                        {b.pctPerdido > 0 && <span><span className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1" />Perdido {b.pctPerdido}%</span>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* ── Ranking Comparativo ── */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    Ranking Comparativo
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-xs text-muted-foreground">
                          <th className="text-left p-3">Barbeiro</th>
                          <th className="text-right p-3">Clientes</th>
                          <th className="text-right p-3">Novos</th>
                          <th className="text-right p-3">Excl.</th>
                          <th className="text-right p-3">%Excl.</th>
                          <th className="text-right p-3">Ticket</th>
                          <th className="text-right p-3">Valor</th>
                          <th className="text-right p-3">Ret. 30d</th>
                          <th className="text-right p-3">%Fiéis</th>
                          <th className="text-right p-3">%Saúde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...qBarbeiros.data.barbeiros]
                          .sort((a, b) => b.totalClientes - a.totalClientes)
                          .map((b, idx) => {
                            const melhorSaude = Math.max(...qBarbeiros.data!.barbeiros.map(x => x.saudePct));
                            const melhorTicket = Math.max(...qBarbeiros.data!.barbeiros.map(x => x.ticketMedio));
                            const melhorFat = Math.max(...qBarbeiros.data!.barbeiros.map(x => x.faturamento));
                            const melhorRet = Math.max(...qBarbeiros.data!.barbeiros.map(x => x.retencao30d));
                            const melhorFieis = Math.max(...qBarbeiros.data!.barbeiros.map(x => x.pctFieis));
                            return (
                              <tr key={b.colaboradorId} className="border-b border-border/30 hover:bg-muted/20">
                                <td className="p-3 font-medium">
                                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                                  {b.colaboradorNome}
                                </td>
                                <td className="p-3 text-right">{b.totalClientes.toLocaleString()}</td>
                                <td className="p-3 text-right text-blue-400">{b.novos}</td>
                                <td className="p-3 text-right">{b.exclusivos}</td>
                                <td className="p-3 text-right text-muted-foreground">{b.pctExclusivos}%</td>
                                <td className={`p-3 text-right ${b.ticketMedio === melhorTicket ? "text-yellow-400 font-semibold" : ""}`}>
                                  {fmtMoeda(b.ticketMedio)}
                                  {b.ticketMedio === melhorTicket && <span className="ml-1 text-[10px]">🏆</span>}
                                </td>
                                <td className={`p-3 text-right ${b.faturamento === melhorFat ? "text-yellow-400 font-semibold" : ""}`}>
                                  {fmtMoeda(b.faturamento)}
                                  {b.faturamento === melhorFat && <span className="ml-1 text-[10px]">🏆</span>}
                                </td>
                                <td className={`p-3 text-right ${b.retencao30d === melhorRet ? "text-yellow-400 font-semibold" : ""}`}>
                                  {b.retencao30d}%
                                  {b.retencao30d === melhorRet && <span className="ml-1 text-[10px]">🏆</span>}
                                </td>
                                <td className={`p-3 text-right ${b.pctFieis === melhorFieis ? "text-yellow-400 font-semibold" : ""}`}>
                                  {b.pctFieis}%
                                  {b.pctFieis === melhorFieis && <span className="ml-1 text-[10px]">🏆</span>}
                                </td>
                                <td className={`p-3 text-right font-semibold ${b.saudePct === melhorSaude ? "text-emerald-400" : b.saudePct >= 30 ? "text-blue-400" : b.saudePct >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                                  {b.saudePct}%
                                  {b.saudePct === melhorSaude && <span className="ml-1 text-[10px]">🏆</span>}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : qBarbeiros.data ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scissors className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum barbeiro encontrado para o período selecionado.</p>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="acoes" className="space-y-4 mt-4">
          {qAcoes.isLoading ? <Skeleton className="h-40" /> : qAcoes.data ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Prioridade Alta" value={qAcoes.data.resumo.alta.toLocaleString()} icon={AlertTriangle} color="text-red-400" />
                <KpiCard label="Prioridade Média" value={qAcoes.data.resumo.media.toLocaleString()} icon={Activity} color="text-yellow-400" />
                <KpiCard label="Prioridade Baixa" value={qAcoes.data.resumo.baixa.toLocaleString()} icon={Info} color="text-blue-400" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { id: "todos", label: "Todos" },
                  { id: "one_shot_risco", label: "One-Shot em risco" },
                  { id: "perdidos_recentes", label: "Perdidos recentes" },
                  { id: "em_risco", label: "Em risco" },
                ] as const).map(t => (
                  <Button key={t.id} variant={acoesTipo === t.id ? "default" : "outline"} size="sm"
                    onClick={() => setAcoesTipo(t.id)} className="text-xs">
                    {t.label}
                  </Button>
                ))}
              </div>
              <Card className="bg-card/60 border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="text-left p-3">Cliente</th>
                        <th className="text-left p-3">Telefone</th>
                        <th className="text-right p-3">Última Visita</th>
                        <th className="text-right p-3">Dias</th>
                        <th className="text-right p-3">Visitas</th>
                        <th className="text-left p-3">Prioridade</th>
                        <th className="text-left p-3">Ação</th>
                      </tr></thead>
                      <tbody>
                        {qAcoes.data.clientes.map(c => (
                          <tr key={c.clienteId} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="p-3 font-medium">{c.clienteNome || "—"}</td>
                            <td className="p-3 text-muted-foreground">{c.telefone || "—"}</td>
                            <td className="p-3 text-right">{fmtDate(c.ultimaVenda)}</td>
                            <td className="p-3 text-right">{c.dias}d</td>
                            <td className="p-3 text-right">{c.totalVisitas}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={
                                c.prioridade === "alta" ? "border-red-500/50 text-red-400" :
                                c.prioridade === "media" ? "border-yellow-500/50 text-yellow-400" :
                                "border-blue-500/50 text-blue-400"
                              }>{c.prioridade}</Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {c.tipoAcao === "one_shot" ? "Convidar para 2ª visita" :
                               c.tipoAcao === "risco" ? "Oferecer promoção" :
                               c.tipoAcao === "perdido_recente" ? "Reativar com desconto" : "Campanha de reativação"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {qAcoes.data.clientes.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">Nenhum cliente na fila de ações.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── DIAGNÓSTICO ──────────────────────────────────────────────────────── */}
        <TabsContent value="diagnostico" className="space-y-4 mt-4">
          {qDiag.isLoading ? <Skeleton className="h-40" /> : qDiag.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Score de qualidade" value={`${qDiag.data.qualidade.score}%`} icon={Activity}
                  color={qDiag.data.qualidade.score >= 80 ? "text-green-400" : qDiag.data.qualidade.score >= 60 ? "text-yellow-400" : "text-red-400"} />
                <KpiCard label="Total de clientes" value={qDiag.data.total.toLocaleString()} icon={Users} />
                <KpiCard label="Sem telefone" value={qDiag.data.qualidade.semTelefone.toLocaleString()} icon={AlertTriangle} color="text-yellow-400"
                  sub={`${qDiag.data.qualidade.pctSemTelefone}% da base`} />
                <KpiCard label="Sem cadastro" value={qDiag.data.qualidade.semCadastro.toLocaleString()} icon={UserX} color="text-orange-400"
                  sub={`${qDiag.data.qualidade.pctSemCadastro}% da base`} />
              </div>
              {qDiag.data.alertas.length > 0 && (
                <Card className="bg-yellow-500/10 border-yellow-500/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Alertas de qualidade
                    </p>
                    {qDiag.data.alertas.map((a, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {a}</p>
                    ))}
                  </CardContent>
                </Card>
              )}
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por número de visitas</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={qDiag.data.visitasDistribuicao.slice(0, 15)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="visitas" tick={{ fontSize: 11, fill: "#888" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                      <Tooltip formatter={(val: number) => [val.toLocaleString(), "Clientes"]} contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
                      <Bar dataKey="clientes" fill={CORES.roxo} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
