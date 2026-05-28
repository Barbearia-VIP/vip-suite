/**
 * RaioXPage.tsx — Raio X Clientes completo
 * Abas: Visão Geral | One-Shot | Cadência | Churn | Cohort | Barbeiros | Ações | Diagnóstico
 */
import { useState, useMemo, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, ReferenceLine,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataVipErrorState, DataVipLoadingState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { DatePicker } from "@/components/DatePicker";
import { useChartTheme } from "../../hooks/useChartTheme";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingDown, TrendingUp,
  Zap, Activity, Target, Scissors, Search, RefreshCw, Info, ChevronRight, Calendar,
  Wifi, WifiOff, Download, RotateCcw, ChevronDown, ChevronUp, DatabaseZap, Send, MessageSquare
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
    <div className="glass-card bg-card/60 border-border/50">
      <div className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color || "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-5 h-5 mt-1 ${color || "text-muted-foreground"}`} />}
        </div>
      </div>
    </div>
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
  verde:    "oklch(0.65 0.16 145)",   // esmeralda
  amarelo:  "oklch(0.76 0.145 72)",   // âmbar VIP
  vermelho: "oklch(0.58 0.20 25)",    // vermelho
  azul:     "oklch(0.65 0.16 240)",   // azul
  roxo:     "oklch(0.65 0.16 290)",   // roxo
  laranja:  "oklch(0.70 0.18 45)",    // laranja
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RaioXPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [tab, setTab] = useState("visao-geral");
  const [search, setSearch] = useState("");
  const [oneShotFiltro, setOneShotFiltro] = useState<"aguardando" | "em_risco" | "perdido" | "todos">("aguardando");

  const [acoesTipo, setAcoesTipo] = useState<"todos" | "one_shot_risco" | "perdidos_recentes" | "em_risco">("todos");

  // ─── Modal Enviar para Campanha (We Send) ─────────────────────────────────
  const [, navigate] = useLocation();
  type SegmentoCampanha = "perdidos" | "em_risco" | "one_shot_urgente";
  const [campanhaModal, setCampanhaModal] = useState<{
    open: boolean;
    segmento: SegmentoCampanha;
    label: string;
    count: number;
    nomeCampanha: string;
    mensagem: string;
  } | null>(null);

  const createCampaignMutation = trpc.raioX.createCampaignFromSegment.useMutation({
    onSuccess: (data) => {
      setCampanhaModal(null);
      navigate("/we-send/campanhas");
    },
    onError: (err) => {
      alert(`Erro ao criar campanha: ${err.message}`);
    },
  });

  const abrirModalCampanha = (segmento: SegmentoCampanha, label: string, count: number) => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    setCampanhaModal({
      open: true,
      segmento,
      label,
      count,
      nomeCampanha: `${label} — ${hoje}`,
      mensagem: `Olá {nome}, sentimos sua falta! Que tal agendar um horário na Barbearia VIP? 💈`,
    });
  };

  // Seletor de período
  type PeriodoPreset = "30d" | "60d" | "90d" | "6m" | "12m" | "custom";
  const ct = useChartTheme();
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
  const [cohortColaboradorId, setCohortColaboradorId] = useState<number | undefined>(undefined);
  const [showAllBarbeiros, setShowAllBarbeiros] = useState(false);
  const [cohortComparacaoId, setCohortComparacaoId] = useState<number | undefined>(undefined);
  const [cohortModoComparacao, setCohortModoComparacao] = useState(false);
  const cohortInput = useMemo(() => ({
    ...baseInput,
    colaboradorId: cohortColaboradorId,
  }), [baseInput, cohortColaboradorId]);
  const qCohort = trpc.raioX.cohort.useQuery(cohortInput, { enabled: !!org?.id && tab === "cohort" });
  // Query sem filtro de colaborador para popular o seletor (usa dados já carregados)
  const qCohortBase = trpc.raioX.cohort.useQuery(baseInput, { enabled: !!org?.id && tab === "cohort" });
  const cohortComparacaoInput = useMemo(() => ({
    ...baseInput,
    colaboradorId: cohortComparacaoId,
  }), [baseInput, cohortComparacaoId]);
  const qCohortComparacao = trpc.raioX.cohort.useQuery(cohortComparacaoInput, {
    enabled: !!org?.id && tab === "cohort" && cohortModoComparacao && cohortComparacaoId !== undefined,
  });
  const qBarbeiros = trpc.raioX.barbeiros.useQuery(baseInput, { enabled: !!org?.id && tab === "barbeiros" });
  const qRouting = trpc.raioX.routing.useQuery(baseInput, { enabled: !!org?.id && tab === "barbeiros" });
  const qAcoes = trpc.raioX.acoes.useQuery(
    { ...baseInput, tipo: acoesTipo, page: 1, pageSize: 100 },
    { enabled: !!org?.id && tab === "acoes" }
  );
  const qDiag = trpc.raioX.diagnostico.useQuery(baseInput, { enabled: !!org?.id && tab === "diagnostico" });
  const qCacheStatus = trpc.raioX.getCacheStatus.useQuery(
    { unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const triggerSync = trpc.raioX.triggerCacheSync.useMutation({
    onSuccess: (data) => {
      console.log("[RaioX] Sync iniciada:", data.unitName);
    },
  });
  // Status do banco de dados
  const qDbStatus = trpc.dataVip.dbStatus.useQuery(undefined, {
    refetchInterval: 10000,
    retry: false,
  });
  const dbConnected = qDbStatus.data?.connected ?? true;

  const v = qVisao.data;
  // Tratar timeout como loading (retry automático em andamento)
  const isVisaoTimeoutRetrying = qVisao.isError && isExternalDbTimeoutError(qVisao.error) && (qVisao.failureCount ?? 0) < 3;
  const isLoading = qVisao.isLoading || isVisaoTimeoutRetrying;
  const isVisaoError = qVisao.isError && !isVisaoTimeoutRetrying;

  // Exportar CSV dos one-shots de um grupo específico
  const exportOneShotCSV = (grupo: "aguardando" | "em_risco" | "perdido", e: MouseEvent) => {
    e.stopPropagation();
    const todos = qOneShot.data?.clientes ?? [];
    // Buscar todos os clientes do grupo independente do filtro atual
    const filtrados = todos.filter(c => c.status === grupo);
    if (filtrados.length === 0) return;
    const labels: Record<string, string> = { aguardando: "Aguardando_Retorno", em_risco: "Em_Risco", perdido: "Provavelmente_Perdido" };
    const header = ["Nome", "Telefone", "1ª Visita", "Última Visita", "Dias", "Total Gasto (R$)", "Status"].join(";");
    const rows = filtrados.map(c => [
      `"${(c.clienteNome || "").replace(/"/g, "'")}"`,
      c.telefone || "",
      c.primeiraVenda ? new Date(c.primeiraVenda + "T12:00:00").toLocaleDateString("pt-BR") : "",
      c.ultimaVenda ? new Date(c.ultimaVenda + "T12:00:00").toLocaleDateString("pt-BR") : "",
      c.dias,
      Number(c.totalGasto).toFixed(2).replace(".", ","),
      grupo === "aguardando" ? "Aguardando" : grupo === "em_risco" ? "Em Risco" : "Perdido",
    ].join(";")).join("\n");
    const csv = "\uFEFF" + header + "\n" + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OneShot_${labels[grupo]}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportChurnCSV = (tipo: "perdidos" | "emRisco" | "resgatados", e: MouseEvent) => {
    e.stopPropagation();
    const data = qChurn.data;
    if (!data) return;
    const lista = tipo === "perdidos" ? data.perdidos : tipo === "emRisco" ? data.emRisco : data.resgatados;
    if (!lista || lista.length === 0) return;
    const labels: Record<string, string> = { perdidos: "Perdidos", emRisco: "Em_Risco_45_90d", resgatados: "Resgatados" };
    const header = ["Nome", "Telefone", "Última Visita", "Dias", "Total Visitas"].join(";");
    const rows = lista.map((c: (typeof lista)[0]) => [
      `"${(c.clienteNome || "").replace(/"/g, "'")}"`,
      c.telefone || "",
      c.ultimaVenda ? new Date(c.ultimaVenda instanceof Date ? c.ultimaVenda : c.ultimaVenda + "T12:00:00").toLocaleDateString("pt-BR") : "",
      c.dias,
      c.totalVisitas,
    ].join(";")).join("\n");
    const csv = "\uFEFF" + header + "\n" + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Churn_${labels[tipo]}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [churnListaAberta, setChurnListaAberta] = useState(false);
  const [churnListaTipo, setChurnListaTipo] = useState<"perdidos" | "emRisco" | "resgatados">("perdidos");

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
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
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
              <div className="flex items-center gap-1.5">
                <DatePicker value={customInicio} onChange={setCustomInicio} placeholder="Início" className="h-8 text-xs w-34" />
                <span className="text-xs text-muted-foreground">→</span>
                <DatePicker value={customFim} onChange={setCustomFim} placeholder="Fim" min={customInicio} className="h-8 text-xs w-34" />
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
          {/* Botão de sync de cache persistente */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <DatabaseZap className="w-3.5 h-3.5 text-amber-400" />
                Cache
                {qCacheStatus.data && (
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                    qCacheStatus.data.totalCached > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                  }`}>{qCacheStatus.data.totalCached}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Cache Persistente do Raio-X</p>
                <p className="text-xs text-muted-foreground">
                  Dados históricos carregados do banco local. Apenas o período atual é sincronizado em tempo real.
                </p>
                {qCacheStatus.data && (
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{qCacheStatus.data.totalCached}</span> meses em cache
                    </p>
                    {qCacheStatus.data.lastSync && (
                      <p className="text-muted-foreground">
                        Última sync: <span className="font-medium text-foreground">
                          {new Date(qCacheStatus.data.lastSync.at).toLocaleString("pt-BR")}
                        </span>
                      </p>
                    )}
                    {qCacheStatus.data.meses.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                        {qCacheStatus.data.meses.slice(0, 6).map(m => (
                          <div key={m.mesRef} className="flex justify-between text-[10px]">
                            <span className="text-emerald-400">{m.mesRef}</span>
                            <span className="text-muted-foreground">{new Date(m.syncedAt).toLocaleDateString("pt-BR")}</span>
                          </div>
                        ))}
                        {qCacheStatus.data.meses.length > 6 && (
                          <p className="text-[10px] text-muted-foreground">+ {qCacheStatus.data.meses.length - 6} meses anteriores</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => triggerSync.mutate({ unitId: selectedUnit?.id })}
                    disabled={triggerSync.isPending}
                  >
                    {triggerSync.isPending ? (
                      <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Sincronizando...</>
                    ) : (
                      <><DatabaseZap className="w-3 h-3 mr-1" /> Sincronizar Agora</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => triggerSync.mutate({ unitId: selectedUnit?.id, forceAll: true })}
                    disabled={triggerSync.isPending}
                    title="Forçar re-sync de todos os meses"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
                {triggerSync.isSuccess && (
                  <p className="text-xs text-emerald-400">✓ Sincronização iniciada em background. Pode levar alguns minutos.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
            { id: "cohort", label: cohortColaboradorId !== undefined ? (
              <span className="flex items-center gap-1.5">
                Cohort
                <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Filtro de colaborador ativo" />
              </span>
            ) : "Cohort" },
            { id: "barbeiros", label: "Routing" },
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
            <DataVipLoadingState rows={3} attempt={(qVisao.failureCount ?? 0) + 1} />
          ) : isVisaoError ? (
            <DataVipErrorState onRetry={() => qVisao.refetch()} />
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
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Perdidos</p>
                    <p className="text-2xl font-bold text-red-400">{v.sinais.perdidos.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctPerdidos}% da base</p>
                    <button
                      onClick={() => abrirModalCampanha("perdidos", "Clientes Perdidos", v.sinais.perdidos)}
                      className="mt-1 flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" /> Enviar para campanha
                    </button>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />Em Risco</p>
                    <p className="text-2xl font-bold text-orange-400">{v.sinais.emRisco.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctEmRisco}% da base</p>
                    <button
                      onClick={() => abrirModalCampanha("em_risco", "Clientes em Risco", v.sinais.emRisco)}
                      className="mt-1 flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" /> Enviar para campanha
                    </button>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Novos</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">{v.sinais.novos.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctNovos}% dos atendidos</p>
                  </div>
                  <div className="bg-card/60 border border-border/50 rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />One-Shot Urgente</p>
                    <p className="text-2xl font-bold text-yellow-400">{v.sinais.oneShotUrgente.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{v.sinais.pctOneShotUrgente}% dos one-shots</p>
                    <button
                      onClick={() => abrirModalCampanha("one_shot_urgente", "One-Shot Urgente", v.sinais.oneShotUrgente)}
                      className="mt-1 flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" /> Enviar para campanha
                    </button>
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
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pt-4 pb-4">
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
                    </div>
                  </div>
                  {/* Em Risco Total (totalizador: Em Risco + One-shot urgente) */}
                  <div className="glass-card bg-orange-500/10 border-orange-500/30">
                    <div className="pt-4 pb-4">
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
                    </div>
                  </div>
                  {/* Perdidos */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pt-4 pb-4">
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
                    </div>
                  </div>
                  {/* One-shot risco */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pt-4 pb-4">
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
                    </div>
                  </div>
                  {/* One-shot perdido */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pt-4 pb-4">
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
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Distribuições ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Distribuições da Base</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Por Perfil */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-1">
                      <h3 className="text-xs text-muted-foreground flex items-center gap-1">
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
                      </h3>
                    </div>
                    <div className="space-y-1 pt-1">
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
                    </div>
                  </div>
                  {/* Por Cadência */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-1">
                      <h3 className="text-xs text-muted-foreground flex items-center gap-1">
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
                      </h3>
                    </div>
                    <div className="space-y-1 pt-1">
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
                    </div>
                  </div>
                  {/* Status 12m */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-1">
                      <h3 className="text-xs text-muted-foreground flex items-center gap-1">
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
                      </h3>
                    </div>
                    <div className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {v.sinais.totalBase.toLocaleString()} clientes</p>
                      {[
                        { label: "Perdido", val: v.distribuicoes.status12m.perdido, color: "bg-red-500" },
                        { label: "Saudável", val: v.distribuicoes.status12m.saudavel, color: "bg-green-500" },
                        { label: "Em risco", val: v.distribuicoes.status12m.emRisco, color: "bg-orange-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={v.sinais.totalBase > 0 ? Math.round(item.val / v.sinais.totalBase * 100) : 0} />
                      ))}
                    </div>
                  </div>
                  {/* One-Shot */}
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-1">
                      <h3 className="text-xs text-muted-foreground flex items-center gap-1">
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
                      </h3>
                    </div>
                    <div className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">universo: {v.distribuicoes.oneShot.total.toLocaleString()} com 1ª visita única</p>
                      {[
                        { label: "Aguardando", val: v.distribuicoes.oneShot.aguardando, color: "bg-blue-500" },
                        { label: "Em risco", val: v.distribuicoes.oneShot.emRisco, color: "bg-orange-500" },
                        { label: "Perdido", val: v.distribuicoes.oneShot.perdido, color: "bg-red-500" },
                      ].map(item => (
                        <DotBadge key={item.label} color={item.color} label={item.label} count={item.val}
                          pct={v.distribuicoes.oneShot.total > 0 ? Math.round(item.val / v.distribuicoes.oneShot.total * 100) : 0} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Cadência Individual ── */}
              {v.cadenciaIndividual && (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        Cadência Individual
                        <InfoPopover
                          title="Cadência Individual"
                          descricao="O ratio mede se o cliente está atrasado em relação ao próprio histórico: dias sem vir ÷ cadência habitual (média dos intervalos entre visitas)."
                          periodoFiltrado={`${v.periodo.dataInicio} – ${v.periodo.dataFim}`}
                          ref={v.periodo.dataFim}
                          baseUsada={`12m · ${v.cadenciaIndividual.total.toLocaleString()} clientes`}
                          baseTotal={v.cadenciaIndividual.total}
                          regra="ratio = DATEDIFF(REF, ultima_venda) / cadencia_habitual"
                          usadaEm="Cadência Individual (6 status) · Score de saúde (dim. cadência)"
                          nota="Universo: todos os clientes que visitaram nos últimos 12m. 1ª Vez = clientes com exatamente 1 visita histórica (sem cadência calculável). Cadência habitual = média de todos os intervalos históricos."
                        />
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {v.cadenciaIndividual.total.toLocaleString()} clientes · 12m de histórico · inclui 1ª visita
                      </span>
                    </div>
                  </div>
                  <div>
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
                  </div>
                </div>
              )}

              {/* ── Clientes Novos no período ── */}
              <div className="glass-card bg-card/60 border-border/50">
                <div className="pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-muted-foreground" />
                      Clientes Novos no período
                    </h3>
                    <span className="text-xs text-muted-foreground">1ª visita histórica em {v.periodo.dataInicio} → {v.periodo.dataFim}</span>
                  </div>
                </div>
                <div>
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
                </div>
              </div>

              {/* ── Movimento da Base ── */}
              {v.movimentoMensal && v.movimentoMensal.length > 0 && (() => {
                const totalAtend = v.movimentoMensal.reduce((s: number, r: (typeof v.movimentoMensal)[0]) => s + r.atendidos, 0);
                const mediaAtend = v.movimentoMensal.length > 0 ? Math.round(totalAtend / v.movimentoMensal.length) : 0;
                const anoAtual = new Date().getFullYear();
                const anoAtendidos = v.movimentoMensal
                  .filter((r: (typeof v.movimentoMensal)[0]) => r.mes.startsWith(String(anoAtual)))
                  .reduce((s: number, r: (typeof v.movimentoMensal)[0]) => s + r.atendidos, 0);
                const ultimos6m = v.movimentoMensal.slice(-6).reduce((s: number, r: (typeof v.movimentoMensal)[0]) => s + r.atendidos, 0);
                return (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm">Movimento da base</h3>
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
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={v.movimentoMensal} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            val.toLocaleString(),
                            name === "atendidos" ? "Atendidos" : name === "emRisco" ? "Em risco" : "Resgatados"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={ct.tooltipStyle}
                        />
                        <ReferenceLine y={mediaAtend} stroke="oklch(0.76 0.145 72)" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: `Méd: ${mediaAtend}`, fill: "oklch(0.76 0.145 72)", fontSize: 10, position: "insideTopLeft" }} />
                        <Bar dataKey="atendidos" fill="oklch(0.76 0.145 72)" radius={[3, 3, 0, 0]} name="atendidos" />
                        <Line type="monotone" dataKey="emRisco" stroke="oklch(0.70 0.18 45)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.70 0.18 45)" }} name="emRisco" />
                        <Line type="monotone" dataKey="resgatados" stroke="oklch(0.65 0.16 145)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.65 0.16 145)" }} name="resgatados" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-600 inline-block" />Atendidos</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-500" />Em risco</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-green-500" />Resgatados</span>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ── Entradas na base ── */}
              {v.entradasMensais && v.entradasMensais.length > 0 && (() => {
                const totalNovos = v.entradasMensais.reduce((s: number, r: (typeof v.entradasMensais)[0]) => s + r.novos, 0);
                const totalResgatados = v.entradasMensais.reduce((s: number, r: (typeof v.entradasMensais)[0]) => s + r.resgatados, 0);
                const anoAtual = new Date().getFullYear();
                const anoNovos = v.entradasMensais.filter((r: (typeof v.entradasMensais)[0]) => r.mes.startsWith(String(anoAtual))).reduce((s: number, r: (typeof v.entradasMensais)[0]) => s + r.novos, 0);
                const ultimos6mNovos = v.entradasMensais.slice(-6).reduce((s: number, r: (typeof v.entradasMensais)[0]) => s + r.novos, 0);
                return (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm">Entradas na base</h3>
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
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={v.entradasMensais} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            val.toLocaleString(),
                            name === "novos" ? "Novos" : "Resgatados"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={ct.tooltipStyle}
                        />
                        <Bar dataKey="novos" fill="oklch(0.65 0.16 145)" radius={[3, 3, 0, 0]} name="novos" />
                        <Bar dataKey="resgatados" fill="oklch(0.65 0.16 240)" radius={[3, 3, 0, 0]} name="resgatados" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-500 inline-block" />Novos (1ª visita)</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500 inline-block" />Resgatados (voltaram após +90d)</span>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ── Risco & Retenção ── */}
              {v.riscoMensal && v.riscoMensal.length > 0 && (() => {
                const totalEmRisco = v.riscoMensal.reduce((s: number, r: (typeof v.riscoMensal)[0]) => s + r.emRisco, 0);
                const totalChurn = v.riscoMensal.reduce((s: number, r: (typeof v.riscoMensal)[0]) => s + r.churnNovos, 0);
                const mediaChurnPct = v.riscoMensal.length > 0
                  ? Math.round(v.riscoMensal.reduce((s: number, r: (typeof v.riscoMensal)[0]) => s + r.churnPct, 0) / v.riscoMensal.length)
                  : 0;
                const mediaEmRiscoPct = v.riscoMensal.length > 0
                  ? Math.round(v.riscoMensal.reduce((s: number, r: (typeof v.riscoMensal)[0]) => s + r.emRiscoPct, 0) / v.riscoMensal.length)
                  : 0;
                return (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm">Risco & Retenção</h3>
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
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={v.riscoMensal} margin={{ top: 5, right: 40, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                        <Tooltip
                          formatter={(val: number, name: string) => [
                            name === "churnPct" || name === "emRiscoPct" ? `${val}%` : val.toLocaleString(),
                            name === "emRisco" ? "Em risco" :
                            name === "churnNovos" ? "Churn (novos perdidos)" :
                            name === "emRiscoPct" ? "Em risco %" : "Churn %"
                          ]}
                          labelFormatter={fmtMes}
                          contentStyle={ct.tooltipStyle}
                        />
                        <Bar yAxisId="left" dataKey="emRisco" fill="oklch(0.70 0.18 45)" radius={[3, 3, 0, 0]} name="emRisco" opacity={0.85} />
                        <Bar yAxisId="left" dataKey="churnNovos" fill="oklch(0.58 0.20 25)" radius={[3, 3, 0, 0]} name="churnNovos" opacity={0.85} />
                        <Line yAxisId="right" type="monotone" dataKey="emRiscoPct" stroke="oklch(0.72 0.16 55)" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: "oklch(0.72 0.16 55)" }} name="emRiscoPct" />
                        <Line yAxisId="right" type="monotone" dataKey="churnPct" stroke="oklch(0.62 0.18 25)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.62 0.18 25)" }} name="churnPct" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-500 inline-block" />Em risco (61-90d)</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500 inline-block" />Churn novos</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-400" style={{borderTop:'2px dashed #fb923c', background:'transparent'}} />Em risco %</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-red-400" />Churn %</span>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ── Saúde por Barbeiro ── */}
              {v.saudeBarbeiros && v.saudeBarbeiros.length > 0 && (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm flex items-center gap-2">
                          <Scissors className="w-4 h-4 text-muted-foreground" />
                          Saúde por Barbeiro
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.sinais.totalBase.toLocaleString()} clientes · Ordenado por % risco+perdido
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const media = v.saudeBarbeiros.length > 0
                        ? Math.round(v.saudeBarbeiros.reduce((acc: number, b: {pctEmRisco: number; pctPerdido: number}) => acc + b.pctEmRisco + b.pctPerdido, 0) / v.saudeBarbeiros.length)
                        : 0;
                      return v.saudeBarbeiros.map((b: (typeof v.saudeBarbeiros)[0]) => (
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
                  </div>
                </div>
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
          {(qOneShot.isLoading || (qOneShot.isError && isExternalDbTimeoutError(qOneShot.error) && (qOneShot.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={3} />
          ) : qOneShot.isError ? (
            <DataVipErrorState onRetry={() => qOneShot.refetch()} />
          ) : qOneShot.data ? (
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
                  <div className="glass-card bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total one-shots</p>
                    <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                  </div>
                  <div className="glass-card bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">% da base</p>
                    <p className="text-2xl font-bold">{os.pctDaBase}%</p>
                  </div>
                  <div className="glass-card bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Em risco + perdido</p>
                    <p className="text-2xl font-bold text-orange-400">{os.emRiscoPerdido.toLocaleString()}</p>
                  </div>
                  <div className="glass-card bg-card/60 border-border/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Aguardando</p>
                    <p className="text-2xl font-bold text-blue-400">{os.aguardando.toLocaleString()}</p>
                  </div>
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
                    {(() => {
                      const pct = total > 0 ? Math.round(os.aguardando / total * 100) : 0;
                      const active = oneShotFiltro === "aguardando";
                      return (
                        <div
                          className={`glass-card cursor-pointer transition-all ${active ? "border-blue-400 ring-1 ring-blue-400/40" : "border-blue-500/20 hover:border-blue-400/50"}`}
                          onClick={() => setOneShotFiltro(active ? "todos" : "aguardando")}
                        >
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">AGUARDANDO RETORNO</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">≤45 dias</p>
                            <p className="text-4xl font-bold mb-1">{os.aguardando.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground mb-3">
                              {pct}% dos one-shots · Dentro do prazo normal · contato preventivo recomendado
                            </p>
                            {/* Barra de progresso azul */}
                            <div className="w-full h-1 rounded-full bg-muted/30 mb-3">
                              <div className="h-1 rounded-full bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between">
                              <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                onClick={() => setOneShotFiltro("aguardando")}>
                                <Users className="w-3 h-3" /> Ver lista →
                              </button>
                              <button
                                className="text-xs text-blue-400/70 hover:text-blue-300 flex items-center gap-1 border border-blue-500/30 rounded px-2 py-0.5 hover:bg-blue-500/10 transition-colors"
                                onClick={(e) => exportOneShotCSV("aguardando", e)}
                                title="Exportar CSV">
                                <Download className="w-3 h-3" /> CSV
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Em Risco */}
                    {(() => {
                      const pct = total > 0 ? Math.round(os.emRisco / total * 100) : 0;
                      const active = oneShotFiltro === "em_risco";
                      return (
                        <div
                          className={`glass-card cursor-pointer transition-all ${active ? "border-orange-400 ring-1 ring-orange-400/40" : "border-orange-500/20 hover:border-orange-400/50"}`}
                          onClick={() => setOneShotFiltro(active ? "todos" : "em_risco")}
                        >
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">EM RISCO DE PERDA</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">46–90 dias</p>
                            <p className="text-4xl font-bold mb-1">{os.emRisco.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground mb-3">
                              {pct}% dos one-shots · Passaram do prazo ideal · ação urgente necessária
                            </p>
                            {/* Barra de progresso laranja */}
                            <div className="w-full h-1 rounded-full bg-muted/30 mb-3">
                              <div className="h-1 rounded-full bg-orange-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between">
                              <button className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                                onClick={() => setOneShotFiltro("em_risco")}>
                                <Users className="w-3 h-3" /> Ver lista →
                              </button>
                              <button
                                className="text-xs text-orange-400/70 hover:text-orange-300 flex items-center gap-1 border border-orange-500/30 rounded px-2 py-0.5 hover:bg-orange-500/10 transition-colors"
                                onClick={(e) => exportOneShotCSV("em_risco", e)}
                                title="Exportar CSV">
                                <Download className="w-3 h-3" /> CSV
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Provavelmente Perdido */}
                    {(() => {
                      const pct = total > 0 ? Math.round(os.perdido / total * 100) : 0;
                      const active = oneShotFiltro === "perdido";
                      return (
                        <div
                          className={`glass-card cursor-pointer transition-all ${active ? "border-pink-500 ring-1 ring-pink-500/40" : "border-pink-500/20 hover:border-pink-400/50"}`}
                          onClick={() => setOneShotFiltro(active ? "todos" : "perdido")}
                        >
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full bg-pink-500 inline-block" />
                              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wide">PROVAVELMENTE PERDIDO</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">+91 dias</p>
                            <p className="text-4xl font-bold mb-1">{os.perdido.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground mb-3">
                              {pct}% dos one-shots · Muito difícil recuperação · avaliar custo-benefício
                            </p>
                            {/* Barra de progresso rosa */}
                            <div className="w-full h-1 rounded-full bg-muted/30 mb-3">
                              <div className="h-1 rounded-full bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between">
                              <button className="text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1"
                                onClick={() => setOneShotFiltro("perdido")}>
                                <Users className="w-3 h-3" /> Ver lista →
                              </button>
                              <button
                                className="text-xs text-pink-400/70 hover:text-pink-300 flex items-center gap-1 border border-pink-500/30 rounded px-2 py-0.5 hover:bg-pink-500/10 transition-colors"
                                onClick={(e) => exportOneShotCSV("perdido", e)}
                                title="Exportar CSV">
                                <Download className="w-3 h-3" /> CSV
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Tabela de clientes filtrada */}
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-sm font-semibold">
                      {oneShotFiltro === "aguardando" ? "Aguardando Retorno" :
                       oneShotFiltro === "em_risco" ? "Em Risco de Perda" :
                       oneShotFiltro === "perdido" ? "Provavelmente Perdidos" : "One-Shots"}
                    </span>
                    <div className="flex gap-1 ml-2">
                      {(["aguardando", "em_risco", "perdido"] as const).map(s => (
                        <Button key={s} variant={oneShotFiltro === s ? "default" : "outline"} size="sm"
                          onClick={() => setOneShotFiltro(s)} className="text-xs h-7">
                          {s === "aguardando" ? "Aguardando" : s === "em_risco" ? "Em Risco" : "Perdidos"}
                        </Button>
                      ))}
                    </div>
                    {(oneShotFiltro === "aguardando" || oneShotFiltro === "em_risco" || oneShotFiltro === "perdido") && (
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                        onClick={(e) => exportOneShotCSV(oneShotFiltro as "aguardando" | "em_risco" | "perdido", e)}>
                        <Download className="w-3 h-3" /> Exportar CSV
                      </Button>
                    )}
                    <div className="relative ml-auto">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Buscar cliente..." className="pl-8 h-8 text-xs w-48"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="p-0">
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
                    </div>
                  </div>
                </div>
              </>
              );
            })()
          ) : null}
        </TabsContent>

        {/* ── CADÊNCIA ─────────────────────────────────────────────────────────── */}
        <TabsContent value="cadencia" className="space-y-4 mt-4">
          {(qCadencia.isLoading || (qCadencia.isError && isExternalDbTimeoutError(qCadencia.error) && (qCadencia.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={3} />
          ) : qCadencia.isError ? (
            <DataVipErrorState onRetry={() => qCadencia.refetch()} />
          ) : qCadencia.data ? (
            (() => {
              const cd = qCadencia.data;
              const totalBase = (cd.totalComCadencia ?? 0) + (cd.primeiraVez ?? 0);
              const grupos = cd.grupos ?? { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0 };
              const totalCad = cd.totalComCadencia ?? 0;
              const pct = (n: number) => totalCad > 0 ? Math.round(n / totalCad * 100) : 0;
              return (
              <>
                {/* Linha de referência */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground/80">REF: {dataFim}</span>
                  <span>• Base 12m: {totalBase.toLocaleString()} clientes</span>
                  <span>• Com cadência: {totalCad.toLocaleString()}</span>
                  <span>• 1ª Vez: {(cd.primeiraVez ?? 0).toLocaleString()}</span>
                  <span>• Média: {cd.mediaCadencia ?? cd.mediaGeral ?? 0}d</span>
                  <span className="ml-auto text-xs">Thresholds: Assíduo ≤0.8 · Regular ≤1.2 · Espaçando ≤1.8 · Em Risco ≤2.5 · Perdido &gt;2.5</span>
                </div>

                {/* 6 KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Assíduo", val: grupos.assiduo, sub: `${pct(grupos.assiduo)}% de ${totalCad.toLocaleString()}`, color: "text-emerald-400", icon: TrendingUp },
                    { label: "Regular", val: grupos.regular, sub: `${pct(grupos.regular)}% de ${totalCad.toLocaleString()}`, color: "text-blue-400", icon: Activity },
                    { label: "Espaçando", val: grupos.espacando, sub: `${pct(grupos.espacando)}% de ${totalCad.toLocaleString()}`, color: "text-yellow-400", icon: RefreshCw },
                    { label: "1ª Vez", val: cd.primeiraVez ?? 0, sub: `${totalBase > 0 ? Math.round((cd.primeiraVez ?? 0) / totalBase * 100) : 0}% de ${totalBase.toLocaleString()}`, color: "text-purple-400", icon: UserCheck },
                    { label: "Em Risco", val: grupos.em_risco, sub: `${pct(grupos.em_risco)}% de ${totalCad.toLocaleString()}`, color: "text-orange-400", icon: AlertTriangle },
                    { label: "Perdido", val: grupos.perdido, sub: `${pct(grupos.perdido)}% de ${totalCad.toLocaleString()}`, color: "text-red-400", icon: UserX },
                  ].map(k => (
                    <div key={k.label} className="glass-card">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{k.label}</span>
                          <k.icon className={`w-3.5 h-3.5 ${k.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${k.color}`}>{k.val.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gráfico de evolução por status */}
                {cd.evolucao && cd.evolucao.length > 0 && (
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-2">
                      <h3 className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" />
                        Evolução por status
                        <span className="text-xs font-normal text-muted-foreground">{cd.evolucao.length} períodos · composição %</span>
                      </h3>
                    </div>
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={cd.evolucao.map(e => ({
                          ...e,
                          assiduoPct: e.total > 0 ? Math.round(e.assiduo / e.total * 100) : 0,
                          regularPct: e.total > 0 ? Math.round(e.regular / e.total * 100) : 0,
                          espacandoPct: e.total > 0 ? Math.round(e.espacando / e.total * 100) : 0,
                          emRiscoPct: e.total > 0 ? Math.round(e.em_risco / e.total * 100) : 0,
                          perdidoPct: e.total > 0 ? Math.round(e.perdido / e.total * 100) : 0,
                        }))} stackOffset="expand" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradPerdido" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.58 0.20 25)" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="oklch(0.58 0.20 25)" stopOpacity={0.7} />
                            </linearGradient>
                            <linearGradient id="gradEmRisco" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.70 0.18 45)" stopOpacity={0.85} />
                              <stop offset="100%" stopColor="oklch(0.70 0.18 45)" stopOpacity={0.65} />
                            </linearGradient>
                            <linearGradient id="gradEspacando" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.8} />
                              <stop offset="100%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="gradRegular" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.65 0.16 240)" stopOpacity={0.75} />
                              <stop offset="100%" stopColor="oklch(0.65 0.16 240)" stopOpacity={0.55} />
                            </linearGradient>
                            <linearGradient id="gradAssiduo" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.65 0.16 160)" stopOpacity={0.85} />
                              <stop offset="100%" stopColor="oklch(0.65 0.16 160)" stopOpacity={0.65} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                          <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(val: number, name: string) => [`${Math.round(val * 100)}%`, name]}
                            contentStyle={ct.tooltipStyle}
                          />
                          <Area type="monotone" dataKey="perdidoPct" name="Perdido" stackId="1" stroke="oklch(0.58 0.20 25)" fill="url(#gradPerdido)" />
                          <Area type="monotone" dataKey="emRiscoPct" name="Em Risco" stackId="1" stroke="oklch(0.70 0.18 45)" fill="url(#gradEmRisco)" />
                          <Area type="monotone" dataKey="espacandoPct" name="Espaçando" stackId="1" stroke="oklch(0.76 0.145 72)" fill="url(#gradEspacando)" />
                          <Area type="monotone" dataKey="regularPct" name="Regular" stackId="1" stroke="oklch(0.65 0.16 240)" fill="url(#gradRegular)" />
                          <Area type="monotone" dataKey="assiduoPct" name="Assíduo" stackId="1" stroke="oklch(0.65 0.16 160)" fill="url(#gradAssiduo)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Análises automáticas */}
                {cd.analises && cd.analises.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold">Análises automáticas</span>
                      <span className="text-xs text-muted-foreground">{cd.analises.length} insights</span>
                    </div>
                    <div className="space-y-2">
                      {cd.analises.map((a, i) => (
                        <div key={i} className={`flex items-start gap-2 text-xs p-3 rounded-lg border ${
                          a.tipo === "positivo" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                          a.tipo === "negativo" ? "bg-red-500/10 border-red-500/30 text-red-300" :
                          a.tipo === "alerta" ? "bg-orange-500/10 border-orange-500/30 text-orange-300" :
                          "bg-muted/30 border-border/50 text-muted-foreground"
                        }`}>
                          <span className="mt-0.5">
                            {a.tipo === "positivo" ? "↓" : a.tipo === "negativo" ? "↑" : a.tipo === "alerta" ? "⚠" : "•"}
                          </span>
                          <span>{a.texto}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
              );
            })()
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
            <>{(qChurn.isLoading || (qChurn.isError && isExternalDbTimeoutError(qChurn.error) && (qChurn.failureCount ?? 0) < 3)) ? (
              <DataVipLoadingState rows={3} />
            ) : qChurn.isError ? (
              <DataVipErrorState onRetry={() => qChurn.refetch()} />
            ) : qChurn.data ? (
            <>
              {/* 4 KPIs principais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Churn Geral */}
                <div className="rounded-lg border border-border/50 bg-card/60 p-4 group relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Churn geral</p>
                    <button className="text-[10px] w-3.5 h-3.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted flex items-center justify-center cursor-help opacity-0 group-hover:opacity-100 transition-opacity">?</button>
                    <div className="absolute bottom-full left-0 mb-2 w-44 bg-popover text-popover-foreground text-xs p-2 rounded-lg border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-50">
                      Taxa de clientes que deixaram de vir. Fórmula: (Perdidos / Total) × 100
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-red-400">{qChurn.data.kpis.churnGeralPct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{qChurn.data.kpis.churnGeral.toLocaleString()} perdidos de {qChurn.data.resumo.total.toLocaleString()}</p>
                </div>
                {/* Churn Fidelizados */}
                <div className="rounded-lg border border-border/50 bg-card/60 p-4 group relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Churn fidelizados</p>
                    <button className="text-[10px] w-3.5 h-3.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted flex items-center justify-center cursor-help opacity-0 group-hover:opacity-100 transition-opacity">?</button>
                    <div className="absolute bottom-full left-0 mb-2 w-44 bg-popover text-popover-foreground text-xs p-2 rounded-lg border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-50">
                      Taxa de churn apenas entre clientes fidelizados (3+ visitas)
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-orange-400">{qChurn.data.kpis.churnFidelizadosPct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{qChurn.data.kpis.churnFidelizados.toLocaleString()} de {qChurn.data.kpis.baseFidelizados.toLocaleString()} (≥3 vis.)</p>
                </div>
                {/* Churn One-Shot */}
                <div className="rounded-lg border border-border/50 bg-card/60 p-4 group relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Churn one-shot</p>
                    <button className="text-[10px] w-3.5 h-3.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted flex items-center justify-center cursor-help opacity-0 group-hover:opacity-100 transition-opacity">?</button>
                    <div className="absolute bottom-full left-0 mb-2 w-44 bg-popover text-popover-foreground text-xs p-2 rounded-lg border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-50">
                      Taxa de churn entre clientes que vieram apenas 1 vez
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-yellow-400">{qChurn.data.kpis.churnOneShotPct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{qChurn.data.kpis.churnOneShot.toLocaleString()} de {qChurn.data.kpis.baseOneShot.toLocaleString()} (1 vis.)</p>
                </div>
                {/* Resgatados */}
                <div className="rounded-lg border border-border/50 bg-card/60 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Resgatados</p>
                  <p className="text-3xl font-bold text-green-400">{qChurn.data.kpis.resgatados.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">voltaram após ≥90d sem vir</p>
                </div>
              </div>

              {/* Gráfico de Evolução Mensal */}
              {qChurn.data.churnMensal && qChurn.data.churnMensal.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-card/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">Evolução mensal</p>
                      <p className="text-xs text-muted-foreground">{qChurn.data.churnMensal.length} meses · taxa de churn e fidelizados</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-red-400 rounded"></span>Churn geral</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-orange-400 rounded"></span>Fidelizados</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={(qChurn.data.churnMensal as Array<{mes: string; churnPct: number; fidPct: number}>).map(m => ({
                        mesLabel: new Date(m.mes + "-15T12:00:00Z").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
                        churnPct: m.churnPct,
                        fidPct: m.fidPct,
                      }))}
                      margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gradChurnG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.62 0.18 25)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="oklch(0.62 0.18 25)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradFidG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.72 0.16 55)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="oklch(0.72 0.16 55)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                      <XAxis dataKey="mesLabel" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={ct.tooltipStyle}
                        formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "churnPct" ? "Churn geral" : "Churn fidelizados"]}
                        labelFormatter={(label) => `Mês: ${label}`}
                      />
                      <Area type="monotone" dataKey="churnPct" stroke="oklch(0.62 0.18 25)" strokeWidth={2} fill="url(#gradChurnG)" dot={{ r: 3, fill: "oklch(0.62 0.18 25)" }} activeDot={{ r: 5 }} />
                      <Area type="monotone" dataKey="fidPct" stroke="oklch(0.72 0.16 55)" strokeWidth={2} fill="url(#gradFidG)" dot={{ r: 3, fill: "oklch(0.72 0.16 55)" }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {/* Análises automáticas */}
                  {(() => {
                    const series = qChurn.data.churnMensal as Array<{mes: string; churnPct: number; fidPct: number}>;
                    if (series.length < 2) return null;
                    const first = series[0]; const last = series[series.length - 1];
                    const diffChurn = last.churnPct - first.churnPct;
                    const diffFid = last.fidPct - first.fidPct;
                    const insights: { type: "good" | "bad" | "info"; text: string }[] = [];
                    if (diffChurn < -2) insights.push({ type: "good", text: `Churn geral caiu ${Math.abs(diffChurn).toFixed(1)}pp no período. Melhora na retenção.` });
                    else if (diffChurn > 2) insights.push({ type: "bad", text: `Churn geral subiu ${diffChurn.toFixed(1)}pp no período. Atenção na retenção.` });
                    if (diffFid < -2) insights.push({ type: "good", text: `Churn de fidelizados caiu ${Math.abs(diffFid).toFixed(1)}pp. Boa recuperação.` });
                    else if (diffFid > 2) insights.push({ type: "bad", text: `Churn de fidelizados subiu ${diffFid.toFixed(1)}pp. Crítico — fidelizados em risco.` });
                    const melhorMes = series.reduce((a, b) => a.churnPct < b.churnPct ? a : b);
                    const piorMes = series.reduce((a, b) => a.churnPct > b.churnPct ? a : b);
                    insights.push({ type: "info", text: `Melhor mês: ${melhorMes.mes} (${melhorMes.churnPct}% churn). Pior: ${piorMes.mes} (${piorMes.churnPct}% churn).` });
                    if (last.churnPct > last.fidPct + 10) insights.push({ type: "bad", text: `Churn geral (${last.churnPct}%) muito acima do de fidelizados (${last.fidPct}%). Muitos one-shots sendo perdidos.` });
                    return insights.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {insights.map((ins, i) => (
                          <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded ${
                            ins.type === "good" ? "bg-green-500/10 text-green-300" : ins.type === "bad" ? "bg-red-500/10 text-red-300" : "bg-muted/20 text-muted-foreground"
                          }`}>
                            <span>{ins.type === "good" ? "↘" : ins.type === "bad" ? "↗" : "·"}</span>
                            <span>{ins.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Alerta: clientes em risco 45-90d */}
              {qChurn.data.kpis.emRisco45_90 > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span className="text-yellow-300 font-medium">{qChurn.data.kpis.emRisco45_90.toLocaleString()} clientes em risco (45–90d sem vir)</span>
                  <button
                    className="ml-auto text-xs text-yellow-400 underline hover:no-underline"
                    onClick={() => { setChurnListaTipo("emRisco"); setChurnListaAberta(true); }}
                  >Ver lista</button>
                </div>
              )}

              {/* Lista de clientes expansível */}
              <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => setChurnListaAberta(v => !v)}
                  onKeyDown={(e) => e.key === 'Enter' && setChurnListaAberta(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Lista de clientes</span>
                    <span className="text-xs text-muted-foreground">
                      Perdidos ({qChurn.data.kpis.churnGeral.toLocaleString()}) · Em risco ({qChurn.data.kpis.emRisco45_90.toLocaleString()}) · Resgatados ({qChurn.data.kpis.resgatados.toLocaleString()})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1"
                      onClick={(e) => exportChurnCSV(churnListaTipo, e)}
                    >
                      <Download className="w-3 h-3" /> CSV
                    </button>
                    {churnListaAberta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
                {churnListaAberta && (
                  <div className="border-t border-border/50">
                    {/* Tabs de tipo */}
                    <div className="flex gap-1 p-3 pb-0">
                      {(["perdidos", "emRisco", "resgatados"] as const).map(tipo => (
                        <button
                          key={tipo}
                          onClick={() => setChurnListaTipo(tipo)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            churnListaTipo === tipo
                              ? tipo === "perdidos" ? "bg-red-500/20 border-red-500/50 text-red-300"
                              : tipo === "emRisco" ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300"
                              : "bg-green-500/20 border-green-500/50 text-green-300"
                              : "border-border/50 text-muted-foreground hover:bg-muted/20"
                          }`}
                        >
                          {tipo === "perdidos" ? `Perdidos (${qChurn.data.kpis.churnGeral.toLocaleString()})` : tipo === "emRisco" ? `Em risco (${qChurn.data.kpis.emRisco45_90.toLocaleString()})` : `Resgatados (${qChurn.data.kpis.resgatados.toLocaleString()})`}
                        </button>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left p-2 pl-4">Cliente</th>
                          <th className="text-left p-2">Telefone</th>
                          <th className="text-right p-2">Última Visita</th>
                          <th className="text-right p-2">Dias</th>
                          <th className="text-right p-2 pr-4">Visitas</th>
                        </tr></thead>
                        <tbody>
                          {(churnListaTipo === "perdidos" ? qChurn.data.perdidos : churnListaTipo === "emRisco" ? qChurn.data.emRisco : qChurn.data.resgatados)
                            .slice(0, 100).map((c: {clienteId: number; clienteNome?: string; telefone?: string; ultimaVenda?: string | Date; diasSemVisita?: number; totalVisitas?: number; ticketMedio?: number}) => (
                            <tr key={c.clienteId} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="p-2 pl-4 font-medium">{c.clienteNome || "—"}</td>
                              <td className="p-2 text-muted-foreground">{c.telefone || "—"}</td>
                              <td className="p-2 text-right">{fmtDate(c.ultimaVenda)}</td>
                              <td className={`p-2 text-right font-medium ${
                                churnListaTipo === "perdidos" ? "text-red-400" : churnListaTipo === "emRisco" ? "text-yellow-400" : "text-green-400"
                              }`}>{(c as {dias?: number; diasSemVisita?: number}).dias ?? c.diasSemVisita ?? 0}d</td>
                              <td className="p-2 text-right pr-4 text-muted-foreground">{c.totalVisitas}x</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Como interpretar */}
              <div className="rounded-lg border border-border/50 bg-card/40 p-4 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p><strong>Como interpretar:</strong> Churn acima de <strong>20%</strong> indica necessidade urgente de ações de retenção. Churn de fidelizados acima de <strong>15%</strong> é crítico.</p>
                    <p><strong>Base de cálculo:</strong> Clientes que visitaram no período selecionado. Perdidos = sem retorno em mais de 90 dias a partir de <strong>{dataFim}</strong>.</p>
                    <p><strong>Resgatados:</strong> Clientes que voltaram no período após ≥90 dias sem visita — sinal positivo de recuperação.</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}</>
          )}

          {churnViewMode === "barbeiros" && (
            <>{(qChurnBarbeiros.isLoading || (qChurnBarbeiros.isError && isExternalDbTimeoutError(qChurnBarbeiros.error) && (qChurnBarbeiros.failureCount ?? 0) < 3)) ? (
              <DataVipLoadingState rows={3} />
            ) : qChurnBarbeiros.isError ? (
              <DataVipErrorState onRetry={() => qChurnBarbeiros.refetch()} />
            ) : qChurnBarbeiros.data ? (
            <div className="space-y-3">
              {/* Cabeçalho da seção */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-yellow-400" />
                    Churn por Barbeiro
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {qChurnBarbeiros.data.barbeiros.length} barbeiros · base 620d · perdido = sem visita em +45d · fidelizados = ≥3 visitas
                  </p>
                </div>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1"
                  onClick={() => {
                    const bbs = qChurnBarbeiros.data?.barbeiros ?? [];
                    if (!bbs.length) return;
                    const header = "Barbeiro,Base,Perdidos,Churn %,Fidelizados,Perd.Fid,Churn Fid %,Em Risco,Resgatados";
                    const rows2 = bbs.map(b =>
                      `"${b.colaboradorNome}",${b.total},${b.perdidos},${b.churnPct},${b.fidelizados},${b.perdidosFid},${b.churnFidPct},${b.emRisco},${b.resgatados}`
                    );
                    const blob = new Blob([header + "\n" + rows2.join("\n")], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url;
                    a.download = `ChurnPorBarbeiro_${dataFim}.csv`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              </div>
              {/* Tabela */}
              <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs text-muted-foreground bg-muted/10">
                        <th className="text-left p-3 pl-4">Barbeiro</th>
                        <th className="text-right p-3">Base</th>
                        <th className="text-right p-3">Perdidos</th>
                        <th className="text-right p-3">Churn %</th>
                        <th className="text-right p-3">Fidelizados</th>
                        <th className="text-right p-3">Perd. Fid.</th>
                        <th className="text-right p-3">Churn Fid %</th>
                        <th className="text-right p-3">Em Risco</th>
                        <th className="text-right p-3 pr-4">Resgatados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qChurnBarbeiros.data.barbeiros.map((b, idx) => {
                        const maxChurn = Math.max(...qChurnBarbeiros.data!.barbeiros.map(x => x.churnPct));
                        const barW = maxChurn > 0 ? Math.round((b.churnPct / maxChurn) * 100) : 0;
                        return (
                          <tr key={b.colaboradorId} className={`border-b border-border/20 hover:bg-muted/20 ${idx === 0 ? "bg-red-500/5" : ""}`}>
                            <td className="p-3 pl-4">
                              <div className="font-medium text-sm">{b.colaboradorNome}</div>
                              {/* Barra de churn */}
                              <div className="mt-1 h-1 bg-muted/30 rounded-full w-24">
                                <div
                                  className={`h-1 rounded-full ${
                                    b.churnPct <= 30 ? "bg-green-500" : b.churnPct <= 50 ? "bg-yellow-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${barW}%` }}
                                />
                              </div>
                            </td>
                            <td className="p-3 text-right text-muted-foreground">{b.total.toLocaleString()}</td>
                            <td className="p-3 text-right text-red-400 font-medium">{b.perdidos.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <span className={`font-bold ${
                                b.churnPct <= 30 ? "text-green-400" : b.churnPct <= 50 ? "text-yellow-400" : "text-red-400"
                              }`}>{b.churnPct}%</span>
                            </td>
                            <td className="p-3 text-right text-muted-foreground">{b.fidelizados.toLocaleString()}</td>
                            <td className="p-3 text-right text-orange-400">{b.perdidosFid.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <span className={`font-semibold ${
                                b.churnFidPct <= 30 ? "text-green-400" : b.churnFidPct <= 50 ? "text-yellow-400" : "text-red-400"
                              }`}>{b.churnFidPct}%</span>
                            </td>
                            <td className="p-3 text-right text-yellow-400">{b.emRisco.toLocaleString()}</td>
                            <td className="p-3 text-right pr-4 text-green-400">{b.resgatados.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/50 bg-muted/10 text-xs text-muted-foreground">
                        <td className="p-3 pl-4 font-medium">Total</td>
                        <td className="p-3 text-right font-medium">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.total, 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-red-400 font-medium">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.perdidos, 0).toLocaleString()}</td>
                        <td className="p-3 text-right"></td>
                        <td className="p-3 text-right">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.fidelizados, 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-orange-400">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.perdidosFid, 0).toLocaleString()}</td>
                        <td className="p-3 text-right"></td>
                        <td className="p-3 text-right text-yellow-400">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.emRisco, 0).toLocaleString()}</td>
                        <td className="p-3 text-right pr-4 text-green-400">{qChurnBarbeiros.data.barbeiros.reduce((s, b) => s + b.resgatados, 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : null}</>
          )}
        </TabsContent>

        {/* ── COHORT ───────────────────────────────────────────────────────────── */}
        <TabsContent value="cohort" className="space-y-4 mt-4">
          {/* Cabeçalho informativo + Filtro de colaborador */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-yellow-400">📅</span>
              <span>Período: {fmtDate(dataInicio)} – {fmtDate(dataFim)} · Cohort = clientes agrupados pelo mês da 1ª visita</span>
            </div>
            {/* Controles de filtro + comparação */}
            {qCohortBase.data?.cohortPorBarbeiro && qCohortBase.data.cohortPorBarbeiro.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Seletor A */}
                <span className="text-xs text-muted-foreground">{cohortModoComparacao ? "A:" : "Filtrar por:"}</span>
                <Select
                  value={cohortColaboradorId !== undefined ? String(cohortColaboradorId) : "all"}
                  onValueChange={(v) => setCohortColaboradorId(v === "all" ? undefined : Number(v))}
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue placeholder="Todos os barbeiros" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os barbeiros</SelectItem>
                    {(qCohortBase.data.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string; novos: number}>)
                      .map(b => (
                        <SelectItem key={b.barbeiroId} value={String(b.barbeiroId)}>
                          {b.barbeiroNome} ({b.novos})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {/* Seletor B — só aparece no modo comparação */}
                {cohortModoComparacao && (
                  <>
                    <span className="text-xs text-muted-foreground">vs B:</span>
                    <Select
                      value={cohortComparacaoId !== undefined ? String(cohortComparacaoId) : "none"}
                      onValueChange={(v) => setCohortComparacaoId(v === "none" ? undefined : Number(v))}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Selecionar barbeiro" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar barbeiro</SelectItem>
                        {(qCohortBase.data.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string; novos: number}>)
                          .filter(b => b.barbeiroId !== cohortColaboradorId)
                          .map(b => (
                            <SelectItem key={b.barbeiroId} value={String(b.barbeiroId)}>
                              {b.barbeiroNome} ({b.novos})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {/* Toggle modo comparação */}
                <button
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    cohortModoComparacao
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                  onClick={() => {
                    setCohortModoComparacao(v => !v);
                    if (cohortModoComparacao) setCohortComparacaoId(undefined);
                  }}
                >
                  ⚖ Comparar
                </button>
                {(cohortColaboradorId !== undefined || cohortComparacaoId !== undefined) && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setCohortColaboradorId(undefined); setCohortComparacaoId(undefined); }}
                  >
                    ✕ Limpar
                  </button>
                )}
              </div>
            )}
          </div>

          {(qCohort.isLoading || (qCohort.isError && isExternalDbTimeoutError(qCohort.error) && (qCohort.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={4} message="Carregando dados de cohort..." />
          ) : qCohort.isError ? (
            <DataVipErrorState onRetry={() => qCohort.refetch()} />
          ) : (qCohort.isLoading) ? (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-48" />
              <Skeleton className="h-40" />
            </div>
          ) : !qCohort.data || (!qCohort.data.analiseNovos && qCohort.data.cohortMensal.length === 0) ? (
            <div className="glass-card bg-card/60 border-border/50">
              <div className="py-12 text-center text-muted-foreground text-sm">
                Sem dados de cohort para o período selecionado.
              </div>
            </div>
          ) : (
            <>
              {/* ── MODO COMPARAÇÃO LADO A LADO ── */}
              {cohortModoComparacao && cohortColaboradorId !== undefined && cohortComparacaoId !== undefined && (
                <div className="space-y-3">
                  {/* Título */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-300">⚖ Comparação de Colaboradores</span>
                    <span className="text-xs text-muted-foreground">KPIs lado a lado</span>
                  </div>
                  {/* Nomes dos colaboradores */}
                  {(() => {
                    const nomeA = (qCohortBase.data?.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string}> | undefined)
                      ?.find(b => b.barbeiroId === cohortColaboradorId)?.barbeiroNome ?? "Colaborador A";
                    const nomeB = (qCohortBase.data?.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string}> | undefined)
                      ?.find(b => b.barbeiroId === cohortComparacaoId)?.barbeiroNome ?? "Colaborador B";
                    const dA = qCohort.data?.analiseNovos;
                    const dB = qCohortComparacao.data?.analiseNovos;
                    const metricas = [
                      { label: "Novos", icon: "👤", vA: dA?.novos, vB: dB?.novos, fmt: (v: number) => String(v), higherIsBetter: true },
                      { label: "% Novos", icon: "%", vA: dA?.pctNovos, vB: dB?.pctNovos, fmt: (v: number) => `${v}%`, higherIsBetter: true },
                      { label: "Ret. 30d", icon: "🔄", vA: dA?.pctRetencao30, vB: dB?.pctRetencao30, fmt: (v: number) => `${v}%`, higherIsBetter: true },
                      { label: "Recorrentes 60d", icon: "⏱", vA: dA?.pctRecorrentes60, vB: dB?.pctRecorrentes60, fmt: (v: number) => `${v}%`, higherIsBetter: true },
                      { label: "Mediana 2ª visita", icon: "📆", vA: dA?.mediana2aVisita, vB: dB?.mediana2aVisita, fmt: (v: number) => `${v}d`, higherIsBetter: false },
                      { label: "Ticket 1ª visita", icon: "$", vA: dA?.ticketMedio1aVisita, vB: dB?.ticketMedio1aVisita, fmt: (v: number) => fmtMoeda(v), higherIsBetter: true },
                    ];
                    return (
                      <div className="glass-card bg-card/60 border-amber-500/20">
                        <div className="p-0">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/50">
                                  <th className="text-left p-3 pl-4 text-xs text-muted-foreground w-36">Métrica</th>
                                  <th className="text-center p-3 text-xs font-semibold text-blue-300">🔵 {nomeA}</th>
                                  <th className="text-center p-3 text-xs font-semibold text-orange-300">🟠 {nomeB}</th>
                                  <th className="text-center p-3 text-xs text-muted-foreground">Diferença</th>
                                </tr>
                              </thead>
                              <tbody>
                                {metricas.map((m) => {
                                  const vA = m.vA ?? null;
                                  const vB = m.vB ?? null;
                                  const diff = vA !== null && vB !== null ? vA - vB : null;
                                  const aWins = diff !== null && (m.higherIsBetter ? diff > 0 : diff < 0);
                                  const bWins = diff !== null && (m.higherIsBetter ? diff < 0 : diff > 0);
                                  return (
                                    <tr key={m.label} className="border-b border-border/20 hover:bg-muted/10">
                                      <td className="p-3 pl-4 text-xs text-muted-foreground">
                                        <span className="mr-1">{m.icon}</span>{m.label}
                                      </td>
                                      <td className={`p-3 text-center font-bold ${
                                        aWins ? "text-blue-300" : bWins ? "text-muted-foreground" : "text-foreground"
                                      }`}>
                                        {vA !== null ? m.fmt(vA) : "—"}
                                        {aWins && <span className="ml-1 text-xs">▲</span>}
                                      </td>
                                      <td className={`p-3 text-center font-bold ${
                                        bWins ? "text-orange-300" : aWins ? "text-muted-foreground" : "text-foreground"
                                      }`}>
                                        {vB !== null ? m.fmt(vB) : "—"}
                                        {bWins && <span className="ml-1 text-xs">▲</span>}
                                      </td>
                                      <td className="p-3 text-center text-xs text-muted-foreground">
                                        {diff !== null ? (
                                          <span className={diff === 0 ? "" : (m.higherIsBetter ? diff > 0 : diff < 0) ? "text-green-400" : "text-red-400"}>
                                            {diff > 0 ? "+" : ""}{m.label.includes("Ticket") || m.label.includes("Mediana") ? m.fmt(Math.abs(diff)) : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                                          </span>
                                        ) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Análise de Clientes Novos ── */}
              {qCohort.data.analiseNovos && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Análise de Clientes Novos</h3>
                    <span className="text-xs text-muted-foreground">retenção e fidelização</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Novos */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>👤</span> Novos
                        </p>
                        <p className="text-2xl font-bold text-foreground">{qCohort.data.analiseNovos.novos}</p>
                        <p className="text-xs text-muted-foreground mt-1">Primeira visita no período</p>
                      </div>
                    </div>
                    {/* % Novos */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>%</span> % Novos
                        </p>
                        <p className="text-2xl font-bold text-foreground">{qCohort.data.analiseNovos.pctNovos}%</p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.novos} novos em base do período</p>
                      </div>
                    </div>
                    {/* Retenção 30d */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>🔄</span> Retenção 30d
                        </p>
                        <p className={`text-2xl font-bold ${qCohort.data.analiseNovos.pctRetencao30 >= 25 ? "text-green-400" : qCohort.data.analiseNovos.pctRetencao30 >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                          {qCohort.data.analiseNovos.pctRetencao30}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.retencao30} de {qCohort.data.analiseNovos.novos} voltaram em 30d</p>
                      </div>
                    </div>
                    {/* % Recorrentes 60d */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>⏱</span> % Recorrentes 60d
                        </p>
                        <p className={`text-2xl font-bold ${qCohort.data.analiseNovos.pctRecorrentes60 >= 35 ? "text-green-400" : qCohort.data.analiseNovos.pctRecorrentes60 >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                          {qCohort.data.analiseNovos.pctRecorrentes60}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{qCohort.data.analiseNovos.recorrentes60} vieram 2+ vezes em 60d</p>
                      </div>
                    </div>
                    {/* Tempo mediano 2ª visita */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>⏱</span> Tempo mediano 2ª visita
                        </p>
                        <p className="text-2xl font-bold text-foreground">
                          {qCohort.data.analiseNovos.mediana2aVisita !== null ? `${qCohort.data.analiseNovos.mediana2aVisita}d` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Metade voltou em até {qCohort.data.analiseNovos.mediana2aVisita ?? "?"}d</p>
                      </div>
                    </div>
                    {/* Ticket 1ª visita */}
                    <div className="glass-card bg-card/60 border-border/50">
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <span>$</span> Ticket 1ª visita
                        </p>
                        <p className="text-2xl font-bold text-foreground">{fmtMoeda(qCohort.data.analiseNovos.ticketMedio1aVisita)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Gasto médio na 1ª visita</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Distribuição de Retenção de Novos ── */}
              {qCohort.data.distribuicao && (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-3">
                    <h3 className="text-sm flex items-center gap-2">
                      Distribuição de Retenção de Novos
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {/* Barra proporcional colorida */}
                    {(() => {
                      const d = qCohort.data!.distribuicao!;
                      const total = d.total || 1;
                      const segments = [
                        { pct: d.pctRetornou30, color: "bg-green-500", label: "≤30d" },
                        { pct: d.pctRetornou31_45, color: "bg-cyan-400", label: "31-45d" },
                        { pct: d.pctRetornou46_60, color: "bg-yellow-400", label: "46-60d" },
                        { pct: d.pctAguardando, color: "bg-blue-400", label: "Aguardando" },
                        { pct: d.pctNaoRetornou30, color: "bg-orange-400", label: "Não ret >30d" },
                        { pct: d.pctNaoRetornou60, color: "bg-red-500", label: "Não ret >60d" },
                      ];
                      return (
                        <>
                          <div className="flex h-8 rounded-lg overflow-hidden w-full">
                            {segments.map((s, i) => s.pct > 0 && (
                              <div key={i} className={`${s.color} flex items-center justify-center text-xs font-bold text-white`}
                                style={{ width: `${s.pct}%` }}>
                                {s.pct >= 8 ? `${s.pct}%` : ""}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou ≤30d</p>
                                <p className="text-xs text-muted-foreground">{d.retornou30} ({d.pctRetornou30}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-cyan-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou 31-45d</p>
                                <p className="text-xs text-muted-foreground">{d.retornou31_45} ({d.pctRetornou31_45}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-yellow-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Retornou 46-60d+</p>
                                <p className="text-xs text-muted-foreground">{d.retornou46_60} ({d.pctRetornou46_60}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Aguardando retorno</p>
                                <p className="text-xs text-muted-foreground">{d.aguardando} ({d.pctAguardando}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Não retornou &gt;30d</p>
                                <p className="text-xs text-muted-foreground">{d.naoRetornou30} ({d.pctNaoRetornou30}%)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Não retornou &gt;60d</p>
                                <p className="text-xs text-muted-foreground">{d.naoRetornou60} ({d.pctNaoRetornou60}%)</p>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── Cohort Mensal — Retenção por Dias Corridos ── */}
              {qCohort.data.cohortMensal.length > 0 && (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-3">
                    <div>
                      <h3 className="text-sm">Cohort Mensal — Retenção de Clientes Novos (dias corridos)</h3>
                      <p className="text-xs text-muted-foreground mt-1">% de novos que retornaram em 30/60/90 dias · {fmtDate(dataInicio)} – {fmtDate(dataFim)}</p>
                    </div>
                  </div>
                  <div className="p-0">
                    {/* Nota metodológica */}
                    <div className="mx-4 mb-3 p-3 rounded-lg bg-blue-950/40 border border-blue-800/30 text-xs text-blue-300 space-y-1">
                      <p><strong>Metodologia:</strong> Mesmos clientes novos do período. Retenção medida por <strong>dias corridos</strong> (30d = voltou em até 30 dias da 1ª visita, independente do mês).</p>
                      <p className="text-blue-400/70">O que observar: Ret. 30d alta = boa primeira impressão. Se 60d &gt;&gt; 30d, quem volta cedo fica. Se 90d &gt;&gt; 60d, clientes demoram mas eventualmente voltam.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left p-3 pl-4">Mês</th>
                            <th className="text-right p-3">Novos</th>
                            <th className="text-right p-3">Ret. 30d</th>
                            <th className="text-right p-3">Ret. 60d</th>
                            <th className="text-right p-3">Ret. 90d</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qCohort.data.cohortMensal.map((row: (typeof qCohort.data.cohortMensal)[0]) => (
                            <tr key={row.mes} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="p-3 pl-4 font-medium">{fmtMes(row.mes)}</td>
                              <td className="p-3 text-right text-foreground">{row.novos}</td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet30 >= 25 ? "bg-green-900/50 text-green-300" : row.pctRet30 >= 15 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet30}%
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet60 >= 40 ? "bg-green-900/50 text-green-300" : row.pctRet60 >= 25 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet60}%
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.pctRet90 >= 45 ? "bg-green-900/50 text-green-300" : row.pctRet90 >= 30 ? "bg-yellow-900/50 text-yellow-300" : "bg-red-900/50 text-red-300"}`}>
                                  {row.pctRet90}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-3 pl-4 border-t border-border/30">
                      <details className="text-xs text-muted-foreground cursor-pointer">
                        <summary className="hover:text-foreground transition-colors">💬 Como ler esta tabela</summary>
                        <p className="mt-2 text-xs leading-relaxed">
                          Cada linha = clientes cuja 1ª visita histórica foi naquele mês. Ret. 30d = % que voltou em até 30 dias da 1ª visita. 
                          Ret. 60d inclui os de 30d. Ret. 90d inclui os de 60d. Valores mais altos = melhor retenção.
                        </p>
                      </details>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Cohort Histórico (grade M+1..M+6) ── */}
              {qCohort.data?.cohortHistorico && qCohort.data.cohortHistorico.length > 0 && (() => {
                const nomeA = cohortModoComparacao && cohortColaboradorId !== undefined
                  ? ((qCohortBase.data?.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string}> | undefined)
                      ?.find(b => b.barbeiroId === cohortColaboradorId)?.barbeiroNome ?? "Colaborador A")
                  : null;
                const nomeB = cohortModoComparacao && cohortComparacaoId !== undefined
                  ? ((qCohortBase.data?.cohortPorBarbeiro as Array<{barbeiroId: number; barbeiroNome: string}> | undefined)
                      ?.find(b => b.barbeiroId === cohortComparacaoId)?.barbeiroNome ?? "Colaborador B")
                  : null;
                const historicoB = cohortModoComparacao && cohortComparacaoId !== undefined
                  ? (qCohortComparacao.data?.cohortHistorico as Array<Record<string, unknown>> | undefined)
                  : undefined;
                const mesesUnion = (() => {
                  const setMeses = new Set<string>();
                  (qCohort.data!.cohortHistorico as Array<Record<string, unknown>>).forEach(r => setMeses.add(String(r.mes)));
                  if (historicoB) historicoB.forEach(r => setMeses.add(String(r.mes)));
                  return Array.from(setMeses).sort();
                })();
                return (
                  <div className={`glass-card ${cohortModoComparacao && nomeA && nomeB ? "border-amber-500/20" : ""}`}>
                    <div className="pb-3">
                      <h3 className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        Retenção por Mês de 1ª Visita (Cohort Histórico)
                        {cohortModoComparacao && nomeA && nomeB && (
                          <span className="ml-2 text-xs font-normal text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">⚖ Comparando A vs B</span>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">% que voltou em M+1, M+2… M+6 (mês-calendário após a 1ª visita)</p>
                    </div>
                    <div className="p-0">
                      <div className="p-3 mx-4 mb-3 rounded-lg bg-blue-950/40 border border-blue-800/30 text-xs text-blue-300 space-y-1">
                        <p><strong>Metodologia:</strong> Clientes novos agrupados pelo mês da 1ª visita. Retenção medida por <strong>meses-calendário</strong> (M+1 = visitou no mês seguinte, M+2 = dois meses depois, etc.).</p>
                        {cohortModoComparacao && nomeA && nomeB ? (
                          <p className="text-blue-400/70">Linhas <span className="text-blue-300 font-semibold">🔵 A</span> e <span className="text-orange-300 font-semibold">🟠 B</span> sobrepostas por mês — compare a evolução de retenção de cada colaborador ao longo do tempo.</p>
                        ) : (
                          <p className="text-blue-400/70">O que observar: Tendência entre cohorts — se M+1 cai mês a mês, a primeira impressão está piorando. Se M+6 é muito menor que M+1, clientes experimentam mas não ficam.</p>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 text-xs text-muted-foreground">
                              <th className="text-left p-3 pl-4">Mês</th>
                              {cohortModoComparacao && nomeA && nomeB && (
                                <th className="text-center p-3 text-xs text-muted-foreground">Colaborador</th>
                              )}
                              <th className="text-right p-3">Novos</th>
                              {[1,2,3,4,5,6].map(m => (
                                <th key={m} className="text-right p-3">M+{m}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cohortModoComparacao && nomeA && nomeB ? (
                              // Modo comparação: para cada mês, exibir linha A e linha B
                              mesesUnion.map(mes => {
                                const rowA = (qCohort.data!.cohortHistorico as Array<Record<string, unknown>>).find(r => String(r.mes) === mes);
                                const rowB = historicoB?.find(r => String(r.mes) === mes);
                                return (
                                  <>
                                    {/* Linha A */}
                                    <tr key={`${mes}-A`} className="border-b border-border/20 hover:bg-blue-950/10 bg-blue-950/5">
                                      <td className="p-2 pl-4 font-medium text-xs" rowSpan={rowB ? 1 : 2}>{fmtMes(mes)}</td>
                                      <td className="p-2 text-center">
                                        <span className="text-xs font-semibold text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">
                                          🔵 {nomeA.split(" ")[0]}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right text-foreground text-xs">{rowA ? Number(rowA.novos) : "—"}</td>
                                      {[1,2,3,4,5,6].map(m => {
                                        const val = rowA?.[`m${m}`];
                                        if (val === null || val === undefined) return <td key={m} className="p-2 text-right text-muted-foreground/40 text-xs">—</td>;
                                        const pct = Number(val);
                                        const valB = rowB?.[`m${m}`];
                                        const pctB = valB !== null && valB !== undefined ? Number(valB) : null;
                                        const aWins = pctB !== null && pct > pctB;
                                        return (
                                          <td key={m} className="p-2 text-right">
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                              aWins ? "bg-blue-900/60 text-blue-200 ring-1 ring-blue-500/40" :
                                              pct >= 30 ? "bg-green-900/50 text-green-300" :
                                              pct >= 15 ? "bg-yellow-900/50 text-yellow-300" :
                                              "bg-red-900/50 text-red-300"
                                            }`}>{pct}%{aWins && " ▲"}</span>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    {/* Linha B */}
                                    {rowB && (
                                      <tr key={`${mes}-B`} className="border-b border-border/30 hover:bg-orange-950/10 bg-orange-950/5">
                                        <td className="p-2 text-center">
                                          <span className="text-xs font-semibold text-orange-300 bg-orange-900/30 px-1.5 py-0.5 rounded">
                                            🟠 {nomeB.split(" ")[0]}
                                          </span>
                                        </td>
                                        <td className="p-2 text-right text-foreground text-xs">{Number(rowB.novos)}</td>
                                        {[1,2,3,4,5,6].map(m => {
                                          const val = rowB[`m${m}`];
                                          if (val === null || val === undefined) return <td key={m} className="p-2 text-right text-muted-foreground/40 text-xs">—</td>;
                                          const pct = Number(val);
                                          const valA = rowA?.[`m${m}`];
                                          const pctA = valA !== null && valA !== undefined ? Number(valA) : null;
                                          const bWins = pctA !== null && pct > pctA;
                                          return (
                                            <td key={m} className="p-2 text-right">
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                bWins ? "bg-orange-900/60 text-orange-200 ring-1 ring-orange-500/40" :
                                                pct >= 30 ? "bg-green-900/50 text-green-300" :
                                                pct >= 15 ? "bg-yellow-900/50 text-yellow-300" :
                                                "bg-red-900/50 text-red-300"
                                              }`}>{pct}%{bWins && " ▲"}</span>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    )}
                                  </>
                                );
                              })
                            ) : (
                              // Modo normal: uma linha por mês
                              (qCohort.data!.cohortHistorico as Array<Record<string, unknown>>).map((row) => (
                                <tr key={String(row.mes)} className="border-b border-border/30 hover:bg-muted/20">
                                  <td className="p-3 pl-4 font-medium">{fmtMes(String(row.mes))}</td>
                                  <td className="p-3 text-right text-foreground">{Number(row.novos)}</td>
                                  {[1,2,3,4,5,6].map(m => {
                                    const val = row[`m${m}`];
                                    if (val === null || val === undefined) return <td key={m} className="p-3 text-right text-muted-foreground/40 text-xs">—</td>;
                                    const pct = Number(val);
                                    return (
                                      <td key={m} className="p-3 text-right">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          pct >= 30 ? "bg-green-900/50 text-green-300" :
                                          pct >= 15 ? "bg-yellow-900/50 text-yellow-300" :
                                          "bg-red-900/50 text-red-300"
                                        }`}>{pct}%</span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Por Barbeiro ── */}
              {qCohort.data?.cohortPorBarbeiro && qCohort.data.cohortPorBarbeiro.length > 0 && (
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-3">
                    <h3 className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Por Barbeiro
                    </h3>
                    <p className="text-xs text-muted-foreground">Retenção de clientes novos por colaborador — identifica quem converte melhor a 1ª visita</p>
                  </div>
                  <div className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left p-3 pl-4">Colaborador</th>
                            <th className="text-right p-3">Novos</th>
                            <th className="text-right p-3">Ret. 30d</th>
                            <th className="text-right p-3">Ret. 60d</th>
                            <th className="text-right p-3">Ret. 90d</th>
                            <th className="text-right p-3">Mediana 2ª</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(qCohort.data.cohortPorBarbeiro as Array<{
                            barbeiroId: number; barbeiroNome: string; novos: number;
                            ret30: number; pctRet30: number; ret60: number; pctRet60: number;
                            ret90: number; pctRet90: number; mediana2aVisita: number | null;
                          }>).map((b, i) => (
                            <tr key={b.barbeiroId} className={`border-b border-border/30 hover:bg-muted/20 ${i === 0 ? "" : ""}`}>
                              <td className="p-3 pl-4 font-medium">{b.barbeiroNome}</td>
                              <td className="p-3 text-right text-foreground">{b.novos}</td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  b.pctRet30 >= 25 ? "bg-green-900/50 text-green-300" :
                                  b.pctRet30 >= 15 ? "bg-yellow-900/50 text-yellow-300" :
                                  "bg-red-900/50 text-red-300"
                                }`}>{b.pctRet30}%</span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  b.pctRet60 >= 40 ? "bg-green-900/50 text-green-300" :
                                  b.pctRet60 >= 25 ? "bg-yellow-900/50 text-yellow-300" :
                                  "bg-red-900/50 text-red-300"
                                }`}>{b.pctRet60}%</span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  b.pctRet90 >= 45 ? "bg-green-900/50 text-green-300" :
                                  b.pctRet90 >= 30 ? "bg-yellow-900/50 text-yellow-300" :
                                  "bg-red-900/50 text-red-300"
                                }`}>{b.pctRet90}%</span>
                              </td>
                              <td className="p-3 text-right text-muted-foreground">
                                {b.mediana2aVisita !== null ? `${b.mediana2aVisita}d` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border/50 bg-muted/10 text-xs text-muted-foreground">
                            <td className="p-3 pl-4 font-medium">Total</td>
                            <td className="p-3 text-right font-medium text-foreground">
                              {(qCohort.data.cohortPorBarbeiro as Array<{novos: number}>).reduce((s, b) => s + b.novos, 0)}
                            </td>
                            <td colSpan={4} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
        {/* ── BARBEIROSS ────────────────────────────────────────────────────────── */}
        <TabsContent value="barbeiros" className="space-y-4 mt-4">
          {(qRouting.isLoading || (qRouting.isError && isExternalDbTimeoutError(qRouting.error) && (qRouting.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={4} message="Carregando dados de routing..." />
          ) : qRouting.isError ? (
            <DataVipErrorState onRetry={() => qRouting.refetch()} />
          ) : qRouting.data ? (() => {
            const rd = qRouting.data;
            const kpis = rd.kpis;
            const barbeiros = showAllBarbeiros ? rd.barbeiros : rd.barbeiros.filter((b: any) => b.total >= 5);
            const seg = rd.segmentosGeral;
            const evolucao = rd.evolucao;
            const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
            const evolucaoChart = evolucao.map((e: any) => ({
              ...e,
              mesLabel: `${MESES_ABREV[Number(e.mes.split("-")[1]) - 1]}/${e.mes.split("-")[0].slice(2)}`,
            }));

            return (
              <>
                {/* ── Guia de leitura ── */}
                <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border/30 space-y-1">
                  <p className="font-medium text-foreground/80 mb-1">Como ler esta aba</p>
                  <p>• <span className="text-emerald-400 font-medium">Fiel</span>: 3+ visitas exclusivamente com o mesmo barbeiro (nunca foi a outro no período).</p>
                  <p>• <span className="text-blue-400 font-medium">Exclusivo</span>: Só com ele, 2x (ainda não fiel).</p>
                  <p>• <span className="text-yellow-400 font-medium">Rotativo</span>: cliente que frequenta a barbearia mas divide entre 2+ barbeiros (inclui Convertendo, Saindo, 1-shot com outro).</p>
                  <p>• <span className="text-orange-400 font-medium">Perdido</span>: sem visita nos últimos {kpis?.janelaAtividade ?? 60} dias. Janela de atividade: {kpis?.janelaAtividade ?? 60}d.</p>
                </div>

                {/* ── KPIs globais ── */}
                {kpis && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="glass-card bg-card/60 border-border/50 p-3">
                      <p className="text-xs text-muted-foreground">Total clientes</p>
                      <p className="text-2xl font-bold mt-1">{kpis.totalClientes.toLocaleString()}</p>
                    </div>
                    <div className="glass-card bg-card/60 border-border/50 p-3" title="Clientes que visitaram apenas 1 barbeiro no período. Só 1 + Multi = Total.">
                      <p className="text-xs text-muted-foreground">Só 1 barbeiro</p>
                      <p className="text-2xl font-bold mt-1 text-emerald-400">{kpis.so1Barbeiro.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{kpis.pctSo1Barbeiro}% do total</p>
                    </div>
                    <div className="glass-card bg-card/60 border-border/50 p-3" title="Clientes que visitaram 2+ barbeiros distintos no período. Só 1 + Multi = Total.">
                      <p className="text-xs text-muted-foreground">Multi-barbeiro</p>
                      <p className="text-2xl font-bold mt-1 text-blue-400">{kpis.multiBarbeiro.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{kpis.pctMultiBarbeiro}% do total</p>
                    </div>
                    <div className="glass-card bg-card/60 border-border/50 p-3">
                      <p className="text-xs text-muted-foreground">Voltaram 2x+</p>
                      <p className="text-2xl font-bold mt-1 text-yellow-400">{kpis.voltaram2x.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{kpis.pctVoltaram2x}% do total</p>
                    </div>
                    <div className="glass-card bg-card/60 border-border/50 p-3" title="Média de barbeiros distintos por cliente no período. Cálculo: Σ(barb. distintos por cliente) ÷ total clientes. Ideal: 1.0 (todos fidelizados).">
                      <p className="text-xs text-muted-foreground">Média barb./cliente</p>
                      <p className="text-2xl font-bold mt-1">{kpis.mediaBarb.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">ideal: 1.0 (fidelizado)</p>
                    </div>
                    <div className="glass-card bg-card/60 border-border/50 p-3">
                      <p className="text-xs text-muted-foreground">Perdidos</p>
                      <p className="text-2xl font-bold mt-1 text-red-400">{kpis.perdidos.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{kpis.pctPerdidos}% · fora janela {kpis.janelaAtividade}d</p>
                    </div>
                  </div>
                )}

                {/* ── Gráfico de evolução ── */}
                {evolucaoChart.length > 0 && (
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-2">
                      <h3 className="text-sm">Evolução de clientes</h3>
                      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground mt-1">
                        <span><span className="inline-block w-3 h-2 rounded-sm bg-blue-500 mr-1" />Novos</span>
                        <span><span className="inline-block w-3 h-2 rounded-sm bg-emerald-500 mr-1" />Rec. Fiéis</span>
                        <span><span className="inline-block w-3 h-2 rounded-sm bg-teal-400 mr-1" />Rec. Exclusivos</span>
                        <span><span className="inline-block w-3 h-2 rounded-sm bg-purple-400 mr-1" />Rec. Rotativos</span>
                        <span><span className="inline-block w-3 h-2 rounded-sm bg-white/20 mr-1" />Total único</span>
                      </div>
                    </div>
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={evolucaoChart} barSize={18} barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                          <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={ct.tooltipStyle}
                            formatter={(v: number, name: string) => [
                              v.toLocaleString(),
                              name === "novos" ? "Novos" : name === "recFieis" ? "Rec. Fiéis" : name === "recExclusivos" ? "Rec. Exclusivos" : name === "recRotativos" ? "Rec. Rotativos" : name
                            ]}
                          />
                          <Bar dataKey="novos" stackId="a" fill="oklch(0.65 0.16 240)" />
                          <Bar dataKey="recFieis" stackId="a" fill="oklch(0.65 0.16 145)" />
                          <Bar dataKey="recExclusivos" stackId="a" fill="oklch(0.65 0.16 185)" />
                          <Bar dataKey="recRotativos" stackId="a" fill="oklch(0.65 0.16 290)" />
                          <Line type="monotone" dataKey="totalClientes" stroke="oklch(0.55 0.012 260 / 0.6)" strokeWidth={1.5} dot={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* ── Cards por barbeiro ── */}
                {barbeiros.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-muted-foreground">POR BARBEIRO</h3>
                      <button
                        onClick={() => setShowAllBarbeiros(v => !v)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border/40 rounded px-2 py-1"
                      >
                        {showAllBarbeiros ? (
                          <><span>⊖</span> Exibir principais<span className="text-muted-foreground/60">({rd.barbeiros.filter((b: any) => b.total >= 5).length})</span></>
                        ) : (
                          <><span>⊕</span> Exibir todos<span className="text-muted-foreground/60">({rd.barbeiros.length})</span></>
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {barbeiros.map((b: any) => {
                        const total = b.total || 1;
                        const so1Total = b.so1Barb || 1;
                        const multiTotal = b.multiBarb || 1;
                        return (
                          <div key={b.id} className="glass-card p-4 space-y-3">
                            {/* Cabeçalho do card */}
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-sm leading-tight">{b.nome}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {b.ativos} ativos · <span className="text-red-400">{b.perdidos} perdidos ({b.pctPerdidos}%)</span>
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bold">{total}</p>
                                <p className="text-[10px] text-muted-foreground">clientes</p>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground">janela {kpis?.janelaAtividade ?? 60}d</p>

                            {/* SÓ COM ELE */}
                            {b.so1Barb > 0 && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="font-medium uppercase tracking-wide">Só com ele</span>
                                  <span>{b.so1Barb} · {b.pctSo1Barb}%</span>
                                </div>
                                {/* Fiel */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-emerald-400 font-medium">Fiel</span>
                                      <span>{b.fiel} <span className="text-muted-foreground">{Math.round((b.fiel/so1Total)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">3+ visitas, exclusivamente com ele</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-emerald-400" style={{ width: `${Math.round((b.fiel/so1Total)*100)}%` }} /></div>
                                  </div>
                                </div>
                                {/* Exclusivo */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-blue-400 font-medium">Exclusivo</span>
                                      <span>{b.exclusivo} <span className="text-muted-foreground">{Math.round((b.exclusivo/so1Total)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Só com ele, 2x (ainda não fiel)</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-blue-400" style={{ width: `${Math.round((b.exclusivo/so1Total)*100)}%` }} /></div>
                                  </div>
                                </div>
                                {/* 1-shot Aguardando */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-yellow-400 font-medium">1-shot · Aguardando</span>
                                      <span>{b.aguardando} <span className="text-muted-foreground">{Math.round((b.aguardando/so1Total)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">1ª visita na barbearia, ≤45d — pode voltar</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-yellow-400" style={{ width: `${Math.round((b.aguardando/so1Total)*100)}%` }} /></div>
                                  </div>
                                </div>
                                {/* 1-shot Não voltou */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-red-400 font-medium">1-shot · Não voltou</span>
                                      <span>{b.naoVoltou} <span className="text-muted-foreground">{Math.round((b.naoVoltou/so1Total)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">1ª visita na barbearia, +45d sem retorno</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-red-400" style={{ width: `${Math.round((b.naoVoltou/so1Total)*100)}%` }} /></div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* MULTI-BARB */}
                            {b.multiBarb > 0 && (
                              <div className="space-y-1.5 pt-1 border-t border-border/30">
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="font-medium uppercase tracking-wide">Multi-barb.</span>
                                  <span>{b.multiBarb} · {b.pctMultiBarb}%</span>
                                </div>
                                {/* Convertendo */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-cyan-400 font-medium">Convertendo</span>
                                      <span>{b.convertendo} <span className="text-muted-foreground">{Math.round((b.convertendo/multiTotal)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Multi-barb.: última visita foi com ele</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-cyan-400" style={{ width: `${Math.round((b.convertendo/multiTotal)*100)}%` }} /></div>
                                  </div>
                                </div>
                                {/* Saindo */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-orange-400 font-medium">Saindo</span>
                                      <span>{b.saindo} <span className="text-muted-foreground">{Math.round((b.saindo/multiTotal)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Multi-barb.: veio 2+ com ele, última foi com outro</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-orange-400" style={{ width: `${Math.round((b.saindo/multiTotal)*100)}%` }} /></div>
                                  </div>
                                </div>
                                {/* 1-shot Com outro */}
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-pink-400 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-pink-400 font-medium">1-shot · Com outro</span>
                                      <span>{b.comOutro} <span className="text-muted-foreground">{Math.round((b.comOutro/multiTotal)*100)}%</span></span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Multi-barb.: 1x com ele, voltou com outro barbeiro</p>
                                    <div className="h-1 rounded-full bg-muted/30 mt-0.5"><div className="h-1 rounded-full bg-pink-400" style={{ width: `${Math.round((b.comOutro/multiTotal)*100)}%` }} /></div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Segmentos — Visão Geral ── */}
                {seg && (
                  <div className="glass-card bg-card/60 border-border/50">
                    <div className="pb-2">
                      <h3 className="text-sm">Segmentos — Visão Geral</h3>
                      <p className="text-xs text-muted-foreground">Cada cliente classificado pelo seu barbeiro principal. Total: {(qRouting.data?.kpis?.totalClientes ?? 0).toLocaleString()} clientes.</p>
                    </div>
                    <div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[
                          { label: "Fiel", desc: "3x+ consecutivamente com este barbeiro", value: seg.fiel, pct: seg.pctFiel, color: "text-emerald-400", bg: "bg-emerald-400" },
                          { label: "Exclusivo", desc: "Só com este barbeiro, voltou 2x", value: seg.exclusivo, pct: seg.pctExclusivo, color: "text-blue-400", bg: "bg-blue-400" },
                          { label: "Convertendo", desc: "Multi-barb.: última visita foi com ele", value: seg.convertendo, pct: seg.pctConvertendo, color: "text-cyan-400", bg: "bg-cyan-400" },
                          { label: "Saindo", desc: "Multi-barb.: veio 2+ com ele, última foi com outro", value: seg.saindo, pct: seg.pctSaindo, color: "text-orange-400", bg: "bg-orange-400" },
                          { label: "1-shot Aguardando", desc: "1ª visita na barbearia, ≤45d — pode voltar", value: seg.aguardando, pct: seg.pctAguardando, color: "text-yellow-400", bg: "bg-yellow-400" },
                          { label: "1-shot Não voltou", desc: "1ª visita na barbearia, +45d sem retorno", value: seg.naoVoltou, pct: seg.pctNaoVoltou, color: "text-red-400", bg: "bg-red-400" },
                          { label: "1-shot Com outro", desc: "Multi-barb.: 1x com ele, voltou com outro barbeiro", value: seg.comOutro, pct: seg.pctComOutro, color: "text-pink-400", bg: "bg-pink-400" },
                        ].map(s => (
                          <div key={s.label} className="bg-muted/10 rounded-lg p-3 border border-border/20">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-block w-2 h-2 rounded-full ${s.bg}`} />
                              <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                            </div>
                            <p className="text-2xl font-bold">{s.value.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">{s.pct}% do total</p>
                            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })() : null}
        </TabsContent>
        <TabsContent value="acoes" className="space-y-4 mt-4">
          {(qAcoes.isLoading || (qAcoes.isError && isExternalDbTimeoutError(qAcoes.error) && (qAcoes.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={3} />
          ) : qAcoes.isError ? (
            <DataVipErrorState onRetry={() => qAcoes.refetch()} />
          ) : qAcoes.data ? (
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
              <div className="glass-card bg-card/60 border-border/50">
                <div className="p-0">
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
                </div>
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ── DIAGNÓSTICO ──────────────────────────────────────────────────────── */}
        <TabsContent value="diagnostico" className="space-y-5 mt-4">
          {(qDiag.isLoading || (qDiag.isError && isExternalDbTimeoutError(qDiag.error) && (qDiag.failureCount ?? 0) < 3)) ? (
            <DataVipLoadingState rows={4} />
          ) : qDiag.isError ? (
            <DataVipErrorState onRetry={() => qDiag.refetch()} />
          ) : qDiag.data ? (
            <>
              {/* ── Alertas automáticos ── */}
              {qDiag.data.alertas.length > 0 && (
                <div className="space-y-2">
                  {qDiag.data.alertas.map((a, i) => (
                    <div key={i} className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm ${
                      a.tipo === "danger" ? "bg-red-500/10 border border-red-500/30 text-red-300"
                      : a.tipo === "warning" ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-300"
                      : "bg-blue-500/10 border border-blue-500/30 text-blue-300"
                    }`}>
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{a.mensagem}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Bloco 1: KPIs gerais ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visão Geral</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Total de clientes" value={qDiag.data.total.toLocaleString()} icon={Users} sub="no período" />
                  <KpiCard label="Total de atendimentos" value={qDiag.data.totalAtendimentos.toLocaleString()} icon={Scissors} sub="com cadastro" />
                  <KpiCard label="Ticket médio" value={fmtMoeda(qDiag.data.ticketMedio)} icon={TrendingUp} />
                  <KpiCard label="Freq. média" value={`${qDiag.data.freqMedia.toFixed(1)}x`} icon={Activity} sub="visitas/cliente" />
                </div>
              </div>

              {/* ── Bloco 2: Qualidade de dados ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Qualidade de Dados</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={`rounded-xl p-4 border flex flex-col gap-1 ${
                    qDiag.data.qualidade.score >= 80 ? "bg-green-500/10 border-green-500/30"
                    : qDiag.data.qualidade.score >= 60 ? "bg-yellow-500/10 border-yellow-500/30"
                    : "bg-red-500/10 border-red-500/30"
                  }`}>
                    <p className="text-xs text-muted-foreground">Score de qualidade</p>
                    <p className={`text-2xl font-bold ${
                      qDiag.data.qualidade.score >= 80 ? "text-green-400"
                      : qDiag.data.qualidade.score >= 60 ? "text-yellow-400"
                      : "text-red-400"
                    }`}>{qDiag.data.qualidade.score}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Baseado na cobertura de telefone</p>
                    <div className="w-full bg-white/10 rounded-full h-1.5 mt-1">
                      <div className={`h-1.5 rounded-full ${
                        qDiag.data.qualidade.score >= 80 ? "bg-green-400"
                        : qDiag.data.qualidade.score >= 60 ? "bg-yellow-400"
                        : "bg-red-400"
                      }`} style={{ width: `${qDiag.data.qualidade.score}%` }} />
                    </div>
                  </div>
                  <KpiCard label="Com telefone" value={qDiag.data.qualidade.comTelefone.toLocaleString()} icon={UserCheck} color="text-green-400"
                    sub={`${qDiag.data.qualidade.pctComTelefone}% da base`} />
                  <KpiCard label="Sem telefone" value={qDiag.data.qualidade.semTelefone.toLocaleString()} icon={AlertTriangle} color="text-yellow-400"
                    sub={`${qDiag.data.qualidade.pctSemTelefone}% da base`} />
                </div>
              </div>

              {/* ── Bloco 3: Atendimentos com/sem cadastro ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Registro de Atendimentos</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Tabela comparativa */}
                  <div className="rounded-xl border bg-card/60 border-border/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/20">
                          <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Tipo</th>
                          <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Atendimentos</th>
                          <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Faturamento</th>
                          <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/30 hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                              <span className="text-green-400 font-medium">Com cadastro</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 pl-4">Cliente identificado no sistema</p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-green-400">{qDiag.data.totalAtendimentos.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtMoeda(qDiag.data.faturamentoTotal)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-semibold text-green-400">{100 - qDiag.data.semCadastro.pct}%</span>
                          </td>
                        </tr>
                        <tr className="hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                              <span className="text-orange-400 font-medium">Sem cadastro</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 pl-4">Usou "cliente sem cadastro" do sistema</p>
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            qDiag.data.semCadastro.pct > 15 ? "text-red-400" : "text-orange-400"
                          }`}>{qDiag.data.semCadastro.atendimentos.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtMoeda(qDiag.data.semCadastro.faturamento)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-semibold ${
                              qDiag.data.semCadastro.pct > 15 ? "text-red-400" : "text-orange-400"
                            }`}>{qDiag.data.semCadastro.pct}%</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Barra visual */}
                  <div className="rounded-xl p-4 border bg-card/60 border-border/50 flex flex-col justify-center gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-green-400 font-medium">Com cadastro</span>
                        <span className="text-green-400">{qDiag.data.totalAtendimentos.toLocaleString()} ({100 - qDiag.data.semCadastro.pct}%)</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-3">
                        <div className="h-3 rounded-full bg-green-500" style={{ width: `${100 - qDiag.data.semCadastro.pct}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className={qDiag.data.semCadastro.pct > 15 ? "text-red-400 font-medium" : "text-orange-400 font-medium"}>
                          Sem cadastro
                        </span>
                        <span className={qDiag.data.semCadastro.pct > 15 ? "text-red-400" : "text-orange-400"}>
                          {qDiag.data.semCadastro.atendimentos.toLocaleString()} ({qDiag.data.semCadastro.pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-3">
                        <div className={`h-3 rounded-full ${qDiag.data.semCadastro.pct > 15 ? "bg-red-500" : "bg-orange-500"}`} style={{ width: `${qDiag.data.semCadastro.pct}%` }} />
                      </div>
                    </div>
                    {qDiag.data.semCadastro.pct > 15 && (
                      <p className="text-xs text-red-400 mt-1">⚠ Acima de 15% — recomenda-se cadastro obrigatório no PDV</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Bloco 4: Saúde da base ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Saúde da Base</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Retornaram 2x+" value={qDiag.data.saude.voltaram2x.toLocaleString()} icon={TrendingUp} color="text-green-400"
                    sub={`${qDiag.data.saude.pctVoltaram2x}% da base`} />
                  <KpiCard label="One-shot" value={qDiag.data.saude.oneShot.toLocaleString()} icon={Zap} color="text-yellow-400"
                    sub={`${qDiag.data.saude.pctOneShot}% — visitaram 1x`} />
                  <KpiCard label="Em risco" value={qDiag.data.saude.emRisco.toLocaleString()} icon={AlertTriangle} color="text-orange-400"
                    sub={`${qDiag.data.saude.pctEmRisco}% — 45-90d sem visita`} />
                  <KpiCard label="Perdidos" value={qDiag.data.saude.perdidos.toLocaleString()} icon={TrendingDown} color="text-red-400"
                    sub={`${qDiag.data.saude.pctPerdidos}% — +90d sem visita`} />
                </div>
              </div>

              {/* ── Bloco 5: Gráficos lado a lado ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Distribuição por número de visitas */}
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <h3 className="text-sm">Distribuição por número de visitas</h3>
                    <p className="text-xs text-muted-foreground">Quantos clientes visitaram X vezes no período</p>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={(qDiag.data?.visitasDistribuicao ?? []).slice(0, 12)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="visitas" tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} label={{ value: "visitas", position: "insideBottom", offset: -2, fontSize: 10, fill: "#666" }} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <Tooltip formatter={(val: number) => [val.toLocaleString(), "Clientes"]} contentStyle={ct.tooltipStyle} />
                        <Bar dataKey="clientes" fill="oklch(0.65 0.16 290)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distribuição por dias de ausência */}
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <h3 className="text-sm">Ausência desde última visita</h3>
                    <p className="text-xs text-muted-foreground">Distribuição dos clientes por tempo sem visitar</p>
                  </div>
                  <div>
                    <div className="space-y-2 mt-1">
                      {(qDiag.data?.faixasDias ?? []).map((f: { faixa: string; total: number; percentual: number }, i: number) => {
                        const color = i === 0 ? "bg-green-500" : i === 1 ? "bg-blue-500" : i === 2 ? "bg-yellow-500" : i === 3 ? "bg-orange-500" : "bg-red-500";
                        const textColor = i === 0 ? "text-green-400" : i === 1 ? "text-blue-400" : i === 2 ? "text-yellow-400" : i === 3 ? "text-orange-400" : "text-red-400";
                        return (
                          <div key={f.faixa}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className={textColor}>{f.faixa}</span>
                              <span className="text-muted-foreground">{f.total.toLocaleString()} ({f.percentual}%)</span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${f.percentual}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Bloco 6: Horários e dias da semana ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Horários de pico */}
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <h3 className="text-sm">Horários de pico</h3>
                    <p className="text-xs text-muted-foreground">Atendimentos por hora do dia</p>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={qDiag.data?.horarios ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} />
                        <Tooltip formatter={(val: number) => [val.toLocaleString(), "Atendimentos"]} contentStyle={ct.tooltipStyle} />
                        <Bar dataKey="atendimentos" fill="oklch(0.65 0.16 240)" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Dias da semana */}
                <div className="glass-card bg-card/60 border-border/50">
                  <div className="pb-2">
                    <h3 className="text-sm">Movimento por dia da semana</h3>
                    <p className="text-xs text-muted-foreground">Atendimentos e clientes únicos por dia</p>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={qDiag.data?.diasSemana ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.45 0.012 260)" }} />
                        <Tooltip contentStyle={ct.tooltipStyle}
                          formatter={(val: number, name: string) => [val.toLocaleString(), name === "atendimentos" ? "Atendimentos" : "Clientes únicos"]} />
                        <Bar dataKey="atendimentos" fill="oklch(0.65 0.16 145)" radius={[2, 2, 0, 0]} name="atendimentos" />
                        <Bar dataKey="clientes" fill="oklch(0.65 0.16 290)" radius={[2, 2, 0, 0]} name="clientes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* ─── Modal: Enviar para Campanha We Send ─────────────────────────────── */}
      {campanhaModal && (
        <Dialog open={campanhaModal.open} onOpenChange={(o) => { if (!o) setCampanhaModal(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-400" />
                Criar Campanha We Send
              </DialogTitle>
              <DialogDescription>
                Serão carregados <strong>{campanhaModal.count.toLocaleString()} contatos</strong> do segmento <strong>{campanhaModal.label}</strong> na unidade selecionada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="camp-nome">Nome da campanha</Label>
                <Input
                  id="camp-nome"
                  value={campanhaModal.nomeCampanha}
                  onChange={(e) => setCampanhaModal(prev => prev ? { ...prev, nomeCampanha: e.target.value } : null)}
                  placeholder="Ex: Clientes Perdidos — Abril/2026"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-msg">Mensagem</Label>
                <Textarea
                  id="camp-msg"
                  value={campanhaModal.mensagem}
                  onChange={(e) => setCampanhaModal(prev => prev ? { ...prev, mensagem: e.target.value } : null)}
                  placeholder="Use {nome} para personalizar. Ex: Olá {nome}, sentimos sua falta!"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{'{nome}'}</code> para personalizar com o nome do cliente.</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">O que acontece ao confirmar:</p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Campanha criada como <strong>rascunho</strong> no We Send</li>
                  <li>Contatos carregados automaticamente com nome e telefone</li>
                  <li>Você será redirecionado para Campanhas para disparar quando desejar</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCampanhaModal(null)} disabled={createCampaignMutation.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!campanhaModal.nomeCampanha.trim()) { alert("Informe o nome da campanha."); return; }
                  if (!campanhaModal.mensagem.trim()) { alert("Informe a mensagem da campanha."); return; }
                  if (!selectedUnit?.id) { alert("Selecione uma unidade."); return; }
                  createCampaignMutation.mutate({
                    unitId: selectedUnit.id,
                    segmento: campanhaModal.segmento,
                    nomeCampanha: campanhaModal.nomeCampanha,
                    mensagem: campanhaModal.mensagem,
                    intervaloSegundos: 3,
                  });
                }}
                disabled={createCampaignMutation.isPending}
                className="gap-2"
              >
                {createCampaignMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Criando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Criar Campanha</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
