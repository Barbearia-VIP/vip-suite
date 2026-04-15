import { useApp } from "@/contexts/AppContext";
import { useSysUser } from "@/contexts/SysUserContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Star, Camera, Instagram, MessageSquare,
  Building2, BarChart3, RefreshCw, ArrowUpRight, AlertCircle,
  CheckSquare, Wifi, WifiOff, Settings, TrendingDown,
  Users, AlertTriangle, CalendarDays, DollarSign, Smile,
  MessageCircle, ThumbsUp, Clock, Zap, Activity, Meh, Frown, ImagePlay,
  DatabaseZap, Loader2, Send, CheckCircle2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOrg } from "@/hooks/useOrg";
import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useChartTheme } from "../../hooks/useChartTheme";
import { DatePicker } from "@/components/DatePicker";

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}
function fmtPct(value: number) {
  return `${value}%`;
}

// ─── Período ────────────────────────────────────────────────────────────────
type PeriodOption = "today" | "week" | "month" | "quarter" | "custom";

function getPeriodDates(option: PeriodOption, customFrom?: string, customTo?: string): { from: string; to: string; label: string } {
  // Usa fuso Brasil (UTC-3) para calcular a data atual corretamente
  // Aplica offset BRT apenas para determinar o dia/mês/ano atual
  const nowUtc = new Date();
  const brtMs = nowUtc.getTime() - 3 * 60 * 60 * 1000; // UTC-3
  const brt = new Date(brtMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  const todayStr = `${y}-${pad(m + 1)}-${pad(d)}`;
  const firstOfMonth = `${y}-${pad(m + 1)}-01`;
  const firstOfQuarter = `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
  if (option === "today") { return { from: todayStr, to: todayStr, label: "Hoje" }; }
  if (option === "week") {
    const dow = brt.getUTCDay(); // 0=Dom
    const daysBack = dow === 0 ? 6 : dow - 1;
    const monMs = brtMs - daysBack * 86400000;
    const mon = new Date(monMs);
    const monStr = `${mon.getUTCFullYear()}-${pad(mon.getUTCMonth() + 1)}-${pad(mon.getUTCDate())}`;
    return { from: monStr, to: todayStr, label: "Esta semana" };
  }
  if (option === "month") {
    return { from: firstOfMonth, to: todayStr, label: "Este mês" };
  }
  if (option === "quarter") {
    return { from: firstOfQuarter, to: todayStr, label: "Este trimestre" };
  }
  return { from: customFrom ?? firstOfMonth, to: customTo ?? todayStr, label: `${customFrom ?? "—"} a ${customTo ?? "—"}` };
}

// ─── KPI Card Premium ────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string; trend?: number | null;
}) {
  const ct = useChartTheme();
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: ct.cardBg,
        border: `1px solid ${color}25`,
        backdropFilter: "blur(12px)",
        boxShadow: `0 4px 24px -4px ${color}20, 0 1px 0 0 oklch(1 0 0 / 0.04) inset`,
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 pointer-events-none"
        style={{ background: color, filter: "blur(24px)", transform: "translate(30%, -30%)" }}
      />
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: `${color}18`,
            border: `1px solid ${color}30`,
            boxShadow: `0 0 12px ${color}20`,
          }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
        {trend !== null && trend !== undefined && (
          <div
            className="flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              background: trend >= 0 ? "oklch(0.55 0.16 145 / 0.15)" : "oklch(0.55 0.16 15 / 0.15)",
              color: trend >= 0 ? "oklch(0.72 0.16 145)" : "oklch(0.72 0.16 15)",
              border: `1px solid ${trend >= 0 ? "oklch(0.55 0.16 145 / 0.3)" : "oklch(0.55 0.16 15 / 0.3)"}`,
            }}
          >
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground leading-none mb-1 font-display">{value}</p>
      <p className="text-xs text-muted-foreground leading-none">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-1 leading-none">{sub}</p>}
    </div>
  );
}

// ─── Mini KPI (dentro dos module cards) ─────────────────────────────────────
function MiniKPI({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}25` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5 leading-none">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Module Card Premium ─────────────────────────────────────────────────────
function ModuleCard({
  title, icon: Icon, color, badge, configured = true, onConfigure, children, onNavigate,
}: {
  title: string; icon: React.ElementType; color: string; badge?: string;
  configured?: boolean; onConfigure?: () => void; children?: React.ReactNode; onNavigate?: () => void;
}) {
  const ct = useChartTheme();
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: ct.cardBg,
        border: ct.border,
        backdropFilter: "blur(12px)",
        boxShadow: ct.isDark ? "0 4px 24px -8px oklch(0 0 0 / 0.4)" : "0 4px 24px -8px oklch(0 0 0 / 0.12)",
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }}
      />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}
          >
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
            {badge && <p className="text-xs text-muted-foreground mt-0.5">{badge}</p>}
          </div>
        </div>
        {onNavigate && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onNavigate}
          >
            Ver mais <ArrowUpRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>
      {configured ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Módulo não configurado</p>
          {onConfigure && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={onConfigure}>
              <Settings className="w-3 h-3" /> Configurar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Barra de satisfação ─────────────────────────────────────────────────────
function SatisfactionBar({ satisfeitos, neutros, insatisfeitos, total }: {
  satisfeitos: number; neutros: number; insatisfeitos: number; total: number;
}) {
  if (total === 0) return <p className="text-xs text-muted-foreground">Sem capturas no período</p>;
  const pS = Math.round((satisfeitos / total) * 100);
  const pN = Math.round((neutros / total) * 100);
  const pI = 100 - pS - pN;
  return (
    <div className="space-y-2">
      <div className="flex rounded-full overflow-hidden h-1.5">
        {pS > 0 && <div style={{ width: `${pS}%`, background: "oklch(0.72 0.16 145)" }} />}
        {pN > 0 && <div style={{ width: `${pN}%`, background: "oklch(0.76 0.145 72)" }} />}
        {pI > 0 && <div style={{ width: `${pI}%`, background: "oklch(0.65 0.16 15)" }} />}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "oklch(0.72 0.16 145)" }} />{pS}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "oklch(0.76 0.145 72)" }} />{pN}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "oklch(0.65 0.16 15)" }} />{pI}%
        </span>
      </div>
    </div>
  );
}

const MODULE_DEFS = [
  { key: "data_vip", label: "Data VIP", icon: BarChart3, color: "oklch(0.65 0.15 200)", path: "/data-vip", desc: "Analytics e faturamento" },
  { key: "gestao_total", label: "Gestão Total", icon: Building2, color: "oklch(0.65 0.15 145)", path: "/gestao-total", desc: "ERP operacional" },
  { key: "vip_cam", label: "VIP Cam", icon: Camera, color: "oklch(0.65 0.15 280)", path: "/vip-cam", desc: "Reconhecimento facial" },
  { key: "reputacao", label: "Reputação", icon: Star, color: "oklch(0.65 0.15 30)", path: "/reputacao", desc: "Avaliações online" },
  { key: "auto_instagram", label: "Auto Instagram", icon: Instagram, color: "oklch(0.65 0.15 320)", path: "/auto-instagram", desc: "Automação Instagram" },
  { key: "we_send", label: "We Send", icon: MessageSquare, color: "oklch(0.65 0.15 100)", path: "/we-send", desc: "WhatsApp em massa" },
] as const;

type ModuleKey = "data_vip" | "gestao_total" | "vip_cam" | "reputacao" | "auto_instagram" | "we_send";
const MODULE_KPI_MAP: Record<ModuleKey, "dataVip" | "gestaoTotal" | "vipCam" | "reputacao" | "autoInstagram" | "weSend"> = {
  data_vip: "dataVip", gestao_total: "gestaoTotal", vip_cam: "vipCam",
  reputacao: "reputacao", auto_instagram: "autoInstagram", we_send: "weSend",
};

// ─── Syncing Placeholder ────────────────────────────────────────────────────
function SyncingPlaceholder({
  ultimaSync,
  syncAtiva,
  compact = false,
  height,
}: {
  ultimaSync: string | null;
  syncAtiva: boolean;
  compact?: boolean;
  height?: number;
}) {
  function fmtUltimaSync(raw: string | null): string {
    if (!raw) return "";
    try {
      const d = new Date(raw);
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffH = Math.floor(diffMin / 60);
      if (diffMin < 2) return "agora mesmo";
      if (diffMin < 60) return `há ${diffMin} min`;
      if (diffH < 24) return `há ${diffH}h`;
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    } catch { return ""; }
  }

  const syncLabel = fmtUltimaSync(ultimaSync);
  const pulseColor = "oklch(0.65 0.15 200)";

  if (compact) {
    return (
      <div className="py-3 flex flex-col items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute w-10 h-10 rounded-full animate-ping opacity-20"
            style={{ background: pulseColor }}
          />
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: `${pulseColor}18`, border: `1px solid ${pulseColor}35` }}
          >
            <DatabaseZap className="w-4 h-4" style={{ color: pulseColor }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium" style={{ color: pulseColor }}>
            {syncAtiva ? "Sincronizando dados…" : "Aguardando dados"}
          </p>
          {syncLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Última sync: {syncLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 text-center"
      style={{ height: height ?? 200 }}
    >
      {/* Anel pulsante animado */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-16 h-16 rounded-full animate-ping opacity-15"
          style={{ background: pulseColor }}
        />
        <div
          className="absolute w-12 h-12 rounded-full animate-pulse opacity-25"
          style={{ background: pulseColor }}
        />
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: `${pulseColor}18`, border: `1px solid ${pulseColor}40` }}
        >
          {syncAtiva
            ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: pulseColor }} />
            : <DatabaseZap className="w-5 h-5" style={{ color: pulseColor }} />}
        </div>
      </div>

      {/* Barra de progresso animada */}
      <div className="w-32 h-1 rounded-full overflow-hidden" style={{ background: `${pulseColor}15` }}>
        <div
          className="h-full rounded-full animate-pulse"
          style={{ background: `linear-gradient(90deg, ${pulseColor}60, ${pulseColor})`, width: "60%" }}
        />
      </div>

      <div>
        <p className="text-sm font-medium" style={{ color: pulseColor }}>
          {syncAtiva ? "Sincronizando dados…" : "Dados sendo carregados"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {syncAtiva
            ? "Importando registros do sistema"
            : syncLabel
              ? `Última atualização: ${syncLabel}`
              : "Os dados aparecerão em instantes"}
        </p>
      </div>
    </div>
  );
}

// ─── Tooltip customizado ─────────────────────────────────────────────────────
function PremiumTooltip({ active, payload, label }: any) {
  const ct = useChartTheme();
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-xs"
      style={{
        background: ct.cardBgSolid,
        border: ct.border,
        backdropFilter: "blur(16px)",
        boxShadow: ct.isDark ? "0 8px 32px -8px oklch(0 0 0 / 0.6)" : "0 4px 20px -4px oklch(0 0 0 / 0.15)",
      }}
    >
      <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-bold" style={{ color: p.color ?? "oklch(0.76 0.145 72)" }}>
          {typeof p.value === "number"
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.value)
            : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units, loading: orgLoading } = useOrg();
  const { sysUser } = useSysUser();
  const [, navigate] = useLocation();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
  // sysUser é usuário de unidade (e-mail/senha) — não tem acesso a configurações nem visão de rede
  const isSysUnitUser = !!sysUser;
  const orgId = org?.id ?? 0;
  const unitId = selectedUnit?.id;

  const ct = useChartTheme();
  const [periodOption, setPeriodOption] = useState<PeriodOption>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const period = useMemo(
    () => getPeriodDates(periodOption, customFrom, customTo),
    [periodOption, customFrom, customTo]
  );

  const kpisQuery = trpc.dashboard.kpis.useQuery(
    { orgId, unitId, dateFrom: period.from, dateTo: period.to },
    { enabled: orgId > 0, refetchOnWindowFocus: true, refetchInterval: 5 * 60 * 1000 }
  );
  const modulesQuery = trpc.dashboard.modulesStatus.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );
  const faturamentoQuery = trpc.dashboard.faturamentoMensal.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );
  const rankingQuery = trpc.dashboard.rankingUnidades.useQuery(
    { orgId },
    { enabled: orgId > 0 && isMasterOrAdmin && !selectedUnit, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );
  const rankingRepQuery = trpc.dashboard.rankingReputacao.useQuery(
    { orgId },
    { enabled: orgId > 0 && isMasterOrAdmin && !selectedUnit, refetchOnWindowFocus: false, refetchInterval: 5 * 60 * 1000 }
  );

  const kpis = kpisQuery.data;
  const modules = modulesQuery.data;
  const faturamentoData = faturamentoQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];
  const rankingRep = rankingRepQuery.data ?? [];
  const isLoading = kpisQuery.isLoading || kpisQuery.isFetching;

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  useEffect(() => {
    if (!kpisQuery.isFetching) setLastUpdated(new Date());
  }, [kpisQuery.isFetching]);

  function handleRefresh() {
    kpisQuery.refetch(); modulesQuery.refetch(); faturamentoQuery.refetch(); rankingQuery.refetch();
  }

  function handlePeriod(opt: PeriodOption) {
    setPeriodOption(opt);
    setShowCustom(opt === "custom");
  }

  if (!orgLoading && !org) {
    // Usuários de unidade não vêem o card de criar organização
    if (isSysUnitUser) {
      return (
        <div className="p-6">
          <div className="rounded-2xl p-12 text-center" style={{ background: ct.cardBg, border: ct.border }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "oklch(0.65 0.15 200 / 0.15)", border: "1px solid oklch(0.65 0.15 200 / 0.3)" }}>
              <Building2 className="w-8 h-8" style={{ color: "oklch(0.65 0.15 200)" }} />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Aguardando configuração</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Sua unidade ainda não foi configurada. Entre em contato com o administrador.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-6">
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            background: ct.cardBg,
            border: ct.border,
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{
              background: "linear-gradient(135deg, oklch(0.76 0.145 72 / 0.2) 0%, oklch(0.68 0.16 65 / 0.1) 100%)",
              border: "1px solid oklch(0.76 0.145 72 / 0.3)",
              boxShadow: "0 0 24px oklch(0.76 0.145 72 / 0.15)",
            }}
          >
            <Building2 className="w-8 h-8" style={{ color: "oklch(0.76 0.145 72)" }} />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Configure sua organização</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Para começar, crie sua organização e adicione as unidades da sua rede.
          </p>
          <Button
            onClick={() => navigate("/unidades")}
            className="gap-2"
            style={{
              background: "linear-gradient(135deg, oklch(0.76 0.145 72) 0%, oklch(0.68 0.16 65) 100%)",
              color: ct.isDark ? "oklch(0.08 0.01 260)" : "oklch(0.98 0 0)",
              border: "none",
            }}
          >
            <Building2 className="w-4 h-4" /> Criar Organização
          </Button>
        </div>
      </div>
    );
  }

  const PERIOD_LABELS: Record<PeriodOption, string> = {
    today: "Hoje", week: "Semana", month: "Mês atual", quarter: "Trimestre", custom: "Personalizado",
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, oklch(0.76 0.145 72 / 0.2) 0%, oklch(0.68 0.16 65 / 0.1) 100%)",
                border: "1px solid oklch(0.76 0.145 72 / 0.3)",
              }}
            >
              <Zap className="w-3.5 h-3.5" style={{ color: "oklch(0.76 0.145 72)" }} />
            </div>
            <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? `Visão consolidada — ${selectedUnit.name}` : isMasterOrAdmin ? "Visão consolidada de toda a rede" : "Visão da sua unidade"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleRefresh}
            style={{
              background: ct.cardBgMuted,
              border: ct.border,
            }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ── Banner Consolidado ── */}
      {!selectedUnit && isMasterOrAdmin && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.76 0.145 72 / 0.08) 0%, oklch(0.68 0.16 65 / 0.04) 100%)",
            border: "1px solid oklch(0.76 0.145 72 / 0.2)",
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.76 0.145 72 / 0.15)", border: "1px solid oklch(0.76 0.145 72 / 0.3)" }}
          >
            <Building2 className="w-4 h-4" style={{ color: "oklch(0.76 0.145 72)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Visão consolidada — {units.length} unidades</p>
            <p className="text-xs text-muted-foreground">Todos os indicadores somam os dados de toda a rede</p>
          </div>
          <div
            className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
            style={{
              background: "oklch(0.76 0.145 72 / 0.15)",
              color: "oklch(0.84 0.14 80)",
              border: "1px solid oklch(0.76 0.145 72 / 0.3)",
            }}
          >
            Toda a rede
          </div>
        </div>
      )}

      {/* ── Seletor de Período ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Período:</span>
        {(["today", "week", "month", "quarter", "custom"] as PeriodOption[]).map((opt) => (
          <button
            key={opt}
            onClick={() => handlePeriod(opt)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={
              periodOption === opt
                ? {
                    background: "linear-gradient(135deg, oklch(0.76 0.145 72) 0%, oklch(0.68 0.16 65) 100%)",
                    color: ct.isDark ? "oklch(0.08 0.01 260)" : "oklch(0.98 0 0)",
                    border: "1px solid transparent",
                    boxShadow: "0 0 12px oklch(0.76 0.145 72 / 0.3)",
                  }
                : {
                    background: ct.cardBgSubtle,
                    color: ct.textMuted,
                    border: ct.borderSubtle,
                  }
            }
          >
            {PERIOD_LABELS[opt]}
          </button>
        ))}
        {showCustom && (
          <div className="flex items-center gap-1.5 ml-1">
            <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="Início" className="h-7 text-xs w-36" />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePicker value={customTo} onChange={setCustomTo} placeholder="Fim" min={customFrom} className="h-7 text-xs w-36" />
          </div>
        )}
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full ml-auto"
          style={{
            background: ct.cardBgSubtle,
            color: ct.textMuted,
            border: ct.borderSubtle,
          }}
        >
          {period.label}
        </span>
      </div>

      {/* ── KPIs Principais (Data VIP) ── */}
      {kpis?.dataVip.hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Faturamento"
            value={fmt(kpis.dataVip.faturamentoMes)}
            sub={period.label}
            icon={DollarSign}
            color="oklch(0.76 0.145 72)"
            trend={kpis.dataVip.trendFaturamento}
          />
          <KpiCard
            label="Atendimentos"
            value={fmtNum(kpis.dataVip.atendimentos)}
            sub={period.label}
            icon={Users}
            color="oklch(0.65 0.15 200)"
            trend={null}
          />
          <KpiCard
            label="Ticket Médio"
            value={fmt(kpis.dataVip.ticketMedio)}
            sub="por atendimento"
            icon={TrendingUp}
            color="oklch(0.65 0.15 145)"
            trend={null}
          />
          {(kpis.dataVip.totalClientes ?? 0) > 0 ? (
            <KpiCard
              label="Clientes"
              value={fmtNum(kpis.dataVip.totalClientes ?? 0)}
              sub="únicos no período"
              icon={Users}
              color="oklch(0.65 0.15 280)"
              trend={null}
            />
          ) : (
            <KpiCard
              label="Reputação"
              value={kpis.reputacao.hasData ? `${(kpis.reputacao.totalGoogle > 0 ? kpis.reputacao.mediaGoogle : kpis.reputacao.mediaAvaliacoes).toFixed(1)} ★` : "—"}
              sub={kpis.reputacao.hasData ? `${fmtNum(kpis.reputacao.totalGoogle > 0 ? kpis.reputacao.totalGoogle : kpis.reputacao.totalAvaliacoes)} avaliações` : "Sem dados"}
              icon={Star}
              color="oklch(0.65 0.15 30)"
              trend={null}
            />
          )}
        </div>
      )}

      {/* ── Grid de Módulos ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* DATA VIP */}
        <ModuleCard title="Data VIP" icon={BarChart3} color="oklch(0.65 0.15 200)"
          badge="Faturamento e atendimentos" configured={modules?.data_vip ?? true}
          onConfigure={isSysUnitUser ? undefined : () => navigate("/configuracoes")} onNavigate={() => navigate("/data-vip")}>
          {kpis?.dataVip.hasData ? (
            <>
              <MiniKPI label="Faturamento" value={fmt(kpis.dataVip.faturamentoMes)}
                sub={kpis.dataVip.trendFaturamento !== null ? `${kpis.dataVip.trendFaturamento >= 0 ? "+" : ""}${kpis.dataVip.trendFaturamento}% vs anterior` : undefined}
                icon={DollarSign} color="oklch(0.65 0.15 200)" />
              <MiniKPI label="Atendimentos" value={fmtNum(kpis.dataVip.atendimentos)} icon={Users} color="oklch(0.65 0.15 200)" />
              <MiniKPI label="Ticket Médio" value={fmt(kpis.dataVip.ticketMedio)} icon={TrendingUp} color="oklch(0.65 0.15 200)" />
              {(kpis.dataVip.totalClientes ?? 0) > 0 && (
                <MiniKPI label="Clientes" value={fmtNum(kpis.dataVip.totalClientes ?? 0)} sub="únicos no período" icon={Users} color="oklch(0.65 0.15 280)" />
              )}
            </>
          ) : (
            <SyncingPlaceholder
              ultimaSync={kpis?.dataVip.ultimaSync ?? null}
              syncAtiva={kpis?.dataVip.syncAtiva ?? false}
              compact
            />
          )}
        </ModuleCard>

        {/* GESTÃO TOTAL */}
        <ModuleCard title="Gestão Total" icon={Building2} color="oklch(0.65 0.15 145)"
          badge="Operacional e financeiro" configured={true} onNavigate={() => navigate("/gestao-total")}>
          {/* Linha 1: Tarefas + Reuniões */}
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div className="rounded-xl p-3" style={{ background: "oklch(0.65 0.15 145 / 0.08)", border: "1px solid oklch(0.65 0.15 145 / 0.18)" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckSquare className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 145)" }} />
                <span className="text-xs text-muted-foreground">Tarefas</span>
              </div>
              <p className="text-xl font-display font-bold text-foreground">{fmtNum(kpis?.gestaoTotal.tarefasAbertas ?? 0)}</p>
              <p className="text-xs text-muted-foreground">
                {kpis?.gestaoTotal.tarefasCriticas ? <span style={{ color: "oklch(0.65 0.15 15)" }}>{kpis.gestaoTotal.tarefasCriticas} críticas</span> : "pendentes"}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "oklch(0.65 0.15 145 / 0.08)", border: "1px solid oklch(0.65 0.15 145 / 0.18)" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarDays className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 145)" }} />
                <span className="text-xs text-muted-foreground">Reuniões</span>
              </div>
              <p className="text-xl font-display font-bold text-foreground">{fmtNum(kpis?.gestaoTotal.reunioesHoje ?? 0)}</p>
              <p className="text-xs text-muted-foreground">hoje</p>
            </div>
          </div>
          {/* Linha 2: Financeiro */}
          <div className="rounded-xl p-3 mt-1" style={{ background: ct.cardBgDeep, border: ct.borderSubtle }}>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Financeiro — {period.label}</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Faturamento</p>
                <p className="text-sm font-display font-bold" style={{ color: "oklch(0.65 0.15 145)" }}>{fmt(kpis?.gestaoTotal.receitasMes ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas</p>
                <p className="text-sm font-display font-bold" style={{ color: "oklch(0.65 0.15 15)" }}>{fmt(kpis?.gestaoTotal.despesasMes ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className="text-sm font-display font-bold" style={{ color: (kpis?.gestaoTotal.lucroMes ?? 0) >= 0 ? "oklch(0.65 0.15 145)" : "oklch(0.65 0.15 15)" }}>
                  {fmt(kpis?.gestaoTotal.lucroMes ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </ModuleCard>

        {/* VIP CAM */}
        <ModuleCard title="VIP Cam" icon={Camera} color="oklch(0.65 0.15 280)"
          badge="Distribuição de satisfação" configured={modules?.vip_cam ?? true}
          onConfigure={isSysUnitUser ? undefined : () => navigate("/configuracoes")} onNavigate={() => navigate("/vip-cam")}>
          {kpis?.vipCam.hasData ? (() => {
            const camTotal = kpis.vipCam.clientesNoPeriodo;
            const camSat = kpis.vipCam.satisfacaoPercent;
            const pieData = [
              { name: "Satisfeitos", value: kpis.vipCam.satisfeitosNoPeriodo, color: "oklch(0.65 0.15 145)" },
              { name: "Neutros", value: kpis.vipCam.neutrosNoPeriodo, color: "oklch(0.76 0.145 72)" },
              { name: "Insatisfeitos", value: kpis.vipCam.insatisfeitosNoPeriodo, color: "oklch(0.65 0.15 15)" },
            ].filter(d => d.value > 0);
            return (
              <>
                {/* Header: total + taxa */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{fmtNum(camTotal)}</p>
                    <p className="text-xs text-muted-foreground">clientes no período</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-display font-bold" style={{ color: camSat >= 70 ? "oklch(0.65 0.15 145)" : camSat >= 40 ? "oklch(0.76 0.145 72)" : "oklch(0.65 0.15 15)" }}>{camSat}%</p>
                    <p className="text-xs text-muted-foreground">satisfação</p>
                  </div>
                </div>
                {/* Mini PieChart de distribuição */}
                {pieData.length > 0 && (
                  <div className="flex items-center gap-3">
                    <PieChart width={80} height={80}>
                      <Pie data={pieData} cx={35} cy={35} innerRadius={22} outerRadius={36}
                        dataKey="value" paddingAngle={2} strokeWidth={0}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                    <div className="flex-1 space-y-1.5">
                      {[
                        { icon: Smile, label: "Satisfeitos", value: kpis.vipCam.satisfeitosNoPeriodo, color: "oklch(0.65 0.15 145)" },
                        { icon: Meh, label: "Neutros", value: kpis.vipCam.neutrosNoPeriodo, color: "oklch(0.76 0.145 72)" },
                        { icon: Frown, label: "Insatisfeitos", value: kpis.vipCam.insatisfeitosNoPeriodo, color: "oklch(0.65 0.15 15)" },
                      ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3 w-3" style={{ color }} />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </div>
                          <span className="text-xs font-semibold" style={{ color }}>{fmtNum(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })() : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem capturas no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/vip-cam")}>Abrir VIP Cam →</Button>
            </div>
          )}
        </ModuleCard>

        {/* REPUTAÇÃO */}
        <ModuleCard title="Reputação" icon={Star} color="oklch(0.65 0.15 30)"
          badge="Google · Avaliações" configured={modules?.reputacao ?? true}
          onConfigure={isSysUnitUser ? undefined : () => navigate("/configuracoes")} onNavigate={() => navigate("/reputacao")}>
          {kpis?.reputacao.hasData ? (
            <>
              {/* Nota Google em destaque */}
              <div className="rounded-xl p-4 mb-2" style={{ background: "oklch(0.65 0.15 30 / 0.08)", border: "1px solid oklch(0.65 0.15 30 / 0.18)" }}>
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Nota Google</p>
                    <p className="text-3xl font-display font-bold" style={{ color: "oklch(0.76 0.145 72)" }}>
                      {kpis.reputacao.totalGoogle > 0 ? kpis.reputacao.mediaGoogle.toFixed(1) : kpis.reputacao.mediaAvaliacoes.toFixed(1)} ★
                    </p>
                  </div>
                  <div className="mb-1">
                    <p className="text-sm text-muted-foreground">
                      {fmtNum(kpis.reputacao.totalGoogle > 0 ? kpis.reputacao.totalGoogle : kpis.reputacao.totalAvaliacoes)} avaliações
                    </p>
                  </div>
                </div>
              </div>
              {/* Aviso de pendentes */}
              {kpis.reputacao.semRespostaGoogle > 0 ? (
                <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "oklch(0.65 0.15 60 / 0.08)", border: "1px solid oklch(0.65 0.15 60 / 0.25)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "oklch(0.65 0.15 60 / 0.15)" }}>
                    <MessageCircle className="h-4 w-4" style={{ color: "oklch(0.76 0.145 72)" }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "oklch(0.76 0.145 72)" }}>{fmtNum(kpis.reputacao.semRespostaGoogle)} sem resposta</p>
                    <p className="text-xs text-muted-foreground">avaliações aguardando no Google</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: "oklch(0.65 0.15 145 / 0.06)", border: "1px solid oklch(0.65 0.15 145 / 0.18)" }}>
                  <Smile className="h-4 w-4 shrink-0" style={{ color: "oklch(0.65 0.15 145)" }} />
                  <p className="text-xs text-muted-foreground">Todas as avaliações respondidas</p>
                </div>
              )}
              {/* Ranking (multi-unidade) */}
              {!selectedUnit && rankingRep.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Ranking por nota Google</p>
                  <div className="space-y-1">
                    {rankingRep.slice(0, 5).map((u, i) => (
                      <div key={u.unitId} className="flex items-center gap-2">
                        <span className="text-xs font-bold w-4 shrink-0" style={{
                          color: i === 0 ? "oklch(0.76 0.145 72)" : i === 1 ? "oklch(0.75 0 0)" : i === 2 ? "oklch(0.65 0.12 60)" : ct.textMuted
                        }}>{i + 1}</span>
                        <span className="text-xs text-foreground truncate flex-1">{u.name.replace('Barbearia VIP - ', '').replace('Barbearia VIP ', '')}</span>
                        <span className="text-xs font-semibold text-foreground shrink-0">
                          {u.totalGoogle > 0 ? `${u.mediaGoogle.toFixed(1)} ★` : `${u.media.toFixed(1)} ★`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem avaliações cadastradas</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/reputacao")}>Configurar Reputação →</Button>
            </div>
          )}
        </ModuleCard>

        {/* AUTO INSTAGRAM */}
        <ModuleCard title="Auto Instagram" icon={Instagram} color="oklch(0.65 0.15 320)"
          badge="Respostas automáticas" configured={modules?.auto_instagram ?? true}
          onConfigure={isSysUnitUser ? undefined : () => navigate("/configuracoes")} onNavigate={() => navigate("/auto-instagram")}>
          {kpis?.autoInstagram.hasData ? (
            <div className="grid grid-cols-2 gap-2">
              {/* Comentários respondidos */}
              <div className="rounded-xl p-3" style={{ background: "oklch(0.65 0.15 320 / 0.08)", border: "1px solid oklch(0.65 0.15 320 / 0.18)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageCircle className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 320)" }} />
                  <span className="text-xs text-muted-foreground">Comentários</span>
                </div>
                <p className="text-xl font-display font-bold text-foreground">{fmtNum(kpis.autoInstagram.comentariosRespondidos)}</p>
                <p className="text-xs text-muted-foreground">respondidos</p>
              </div>
              {/* Stories respondidos */}
              <div className="rounded-xl p-3" style={{ background: "oklch(0.65 0.15 320 / 0.08)", border: "1px solid oklch(0.65 0.15 320 / 0.18)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <ImagePlay className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 320)" }} />
                  <span className="text-xs text-muted-foreground">Stories</span>
                </div>
                <p className="text-xl font-display font-bold text-foreground">{fmtNum((kpis.autoInstagram as { storiesRespondidos?: number }).storiesRespondidos ?? 0)}</p>
                <p className="text-xs text-muted-foreground">respondidos</p>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem respostas no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/auto-instagram")}>Configurar Instagram →</Button>
            </div>
          )}
        </ModuleCard>

        {/* WE SEND */}
        <ModuleCard title="We Send" icon={MessageSquare} color="oklch(0.65 0.15 100)"
          badge="WhatsApp em massa" configured={modules?.we_send ?? true}
          onConfigure={isSysUnitUser ? undefined : () => navigate("/configuracoes")} onNavigate={() => navigate("/we-send")}>
          {kpis?.weSend.hasData ? (
            <>
              <MiniKPI
                label="Campanhas Criadas"
                value={fmtNum(kpis.weSend.campanhas)}
                sub={`${kpis.weSend.campanhasEnviadas ?? 0} enviadas no período`}
                icon={MessageSquare}
                color="oklch(0.65 0.15 100)"
              />
              <MiniKPI
                label="Mensagens Enviadas"
                value={fmtNum(kpis.weSend.enviados)}
                sub={`${fmtNum(kpis.weSend.totalContatos)} contatos alcançados`}
                icon={Send}
                color="oklch(0.65 0.15 100)"
              />
              <MiniKPI
                label="Taxa de Sucesso"
                value={`${kpis.weSend.taxaSucesso ?? 0}%`}
                icon={CheckCircle2}
                color={(
                  (kpis.weSend.taxaSucesso ?? 0) >= 90 ? "oklch(0.72 0.16 145)" :
                  (kpis.weSend.taxaSucesso ?? 0) >= 70 ? "oklch(0.76 0.145 72)" :
                  "oklch(0.65 0.16 15)"
                )}
              />
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">Sem campanhas no período</p>
              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/we-send")}>Criar campanha →</Button>
            </div>
          )}
        </ModuleCard>
      </div>

      {/* ── Gráfico de Faturamento + Status dos Módulos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl p-5 h-full"
            style={{
              background: ct.cardBg,
              border: ct.border,
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Faturamento Mensal</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedUnit ? selectedUnit.name : "Toda a rede"} · Últimos 6 meses
                </p>
              </div>
              <div
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "oklch(0.65 0.15 200 / 0.12)",
                  color: "oklch(0.65 0.15 200)",
                  border: "1px solid oklch(0.65 0.15 200 / 0.25)",
                }}
              >
                Data VIP
              </div>
            </div>
            {faturamentoData.length > 0 && faturamentoData.some(d => d.faturamento > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={faturamentoData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.35} />
                      <stop offset="60%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: ct.axisColor }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: ct.axisColor }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(2)}`} width={56} />
                  <Tooltip content={<PremiumTooltip />} />
                  <Area type="monotone" dataKey="faturamento" stroke="oklch(0.76 0.145 72)"
                    strokeWidth={2.5} fill="url(#gradFat)" dot={false}
                    activeDot={{ r: 4, fill: "oklch(0.76 0.145 72)", stroke: ct.isDark ? "oklch(0.14 0.012 260)" : "oklch(0.97 0.003 80)", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <SyncingPlaceholder
                ultimaSync={kpis?.dataVip.ultimaSync ?? null}
                syncAtiva={kpis?.dataVip.syncAtiva ?? false}
                height={200}
              />
            )}
          </div>
        </div>

        <div>
          <div
            className="rounded-2xl p-5 h-full"
            style={{
              background: ct.cardBg,
              border: ct.border,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Status dos Módulos</h3>
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              {MODULE_DEFS.map((mod) => {
                const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
                const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
                const hasData = kpis?.[kpiKey]?.hasData ?? false;
                const Icon = mod.icon;
                return (
                  <button key={mod.key} onClick={() => navigate(mod.path)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-left"
                    style={{ border: "1px solid transparent" }}
                    onMouseEnter={e => (e.currentTarget.style.background = ct.cardBgHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}25` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: mod.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{mod.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{mod.desc}</p>
                    </div>
                    <div className="shrink-0">
                      {isConfigured && hasData ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.55 0.16 145 / 0.15)", color: "oklch(0.72 0.16 145)", border: "1px solid oklch(0.55 0.16 145 / 0.3)" }}>
                          Ativo
                        </span>
                      ) : isConfigured ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.76 0.145 72 / 0.12)", color: "oklch(0.76 0.145 72)", border: "1px solid oklch(0.76 0.145 72 / 0.25)" }}>
                          Sem dados
                        </span>
                      ) : !isSysUnitUser ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: ct.cardBgMuted, color: ct.textMuted, border: ct.border }}>
                          Configurar
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ranking + Unidades (admin) ── */}
      {isMasterOrAdmin && !selectedUnit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className="rounded-2xl p-5"
            style={{
              background: ct.cardBg,
              border: ct.border,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ranking de Unidades</h3>
                <p className="text-xs text-muted-foreground">Faturamento do mês atual</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground" onClick={() => navigate("/data-vip")}>
                Ver mais <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {ranking.length > 0 && ranking.some(r => r.faturamento > 0) ? (
              <div className="space-y-3">
                {ranking.slice(0, 5).map((unit, idx) => (
                  <div key={unit.unitId} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-5 text-center shrink-0" style={{
                      color: idx === 0 ? "oklch(0.76 0.145 72)" : idx === 1 ? "oklch(0.75 0 0)" : idx === 2 ? "oklch(0.65 0.12 60)" : "oklch(0.40 0.01 260)"
                    }}>{idx + 1}°</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                        <p className="text-xs font-semibold text-foreground shrink-0 ml-2">{fmt(unit.faturamento)}</p>
                      </div>
                      <div className="w-full rounded-full h-1" style={{ background: ct.isDark ? "oklch(0.22 0.014 260 / 0.5)" : "oklch(0.88 0.006 260 / 0.6)" }}>
                        <div className="h-1 rounded-full"
                          style={{
                            width: `${ranking[0].faturamento > 0 ? (unit.faturamento / ranking[0].faturamento) * 100 : 0}%`,
                            background: idx === 0
                              ? "linear-gradient(90deg, oklch(0.76 0.145 72), oklch(0.68 0.16 65))"
                              : "oklch(0.35 0.015 260)",
                          }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Sincronize o Data VIP para ver o ranking</p>
                <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>Ir para Data VIP →</Button>
              </div>
            )}
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              background: ct.cardBg,
              border: ct.border,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Unidades da Rede</h3>
                <p className="text-xs text-muted-foreground">{units.length} unidades cadastradas</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground" onClick={() => navigate("/unidades")}>
                Ver todas <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {orgLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: ct.skeletonBg }} />)}
              </div>
            ) : units.length === 0 ? (
              <div className="py-6 text-center">
                <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
                <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/unidades")}>Adicionar unidade</Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {units.slice(0, 5).map((unit) => (
                  <div key={unit.id} className="flex items-center gap-3 p-2.5 rounded-xl transition-all"
                    style={{ border: ct.borderSubtle }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "oklch(0.76 0.145 72 / 0.12)", border: "1px solid oklch(0.76 0.145 72 / 0.2)" }}>
                      <Building2 className="w-3.5 h-3.5" style={{ color: "oklch(0.76 0.145 72)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                      {unit.city && <p className="text-xs text-muted-foreground">{unit.city}{unit.state ? `, ${unit.state}` : ""}</p>}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "oklch(0.55 0.16 145 / 0.12)", color: "oklch(0.72 0.16 145)", border: "1px solid oklch(0.55 0.16 145 / 0.25)" }}>
                      Ativa
                    </span>
                  </div>
                ))}
                {units.length > 5 && (
                  <button onClick={() => navigate("/unidades")}
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors">
                    + {units.length - 5} unidades
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Acesso Rápido ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 font-display tracking-tight">Acesso Rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MODULE_DEFS.map((mod) => {
            const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
            const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
            const hasData = kpis?.[kpiKey]?.hasData ?? false;
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => navigate(mod.path)}
                className="rounded-2xl p-4 text-left relative overflow-hidden transition-all group"
                style={{
                  background: ct.cardBg,
                  border: ct.border,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.border = `1px solid ${mod.color}40`;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px -4px ${mod.color}20`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.border = ct.border;
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                <div className="absolute top-2.5 right-2.5">
                  {isConfigured && hasData
                    ? <span className="w-1.5 h-1.5 rounded-full block" style={{ background: "oklch(0.72 0.16 145)", boxShadow: "0 0 6px oklch(0.72 0.16 145)" }} />
                    : isConfigured
                      ? <span className="w-1.5 h-1.5 rounded-full block" style={{ background: "oklch(0.76 0.145 72)" }} />
                      : <span className="w-1.5 h-1.5 rounded-full block" style={{ background: "oklch(0.30 0.01 260)" }} />
                  }
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}25` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color: mod.color }} />
                </div>
                <p className="text-xs font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.desc}</p>
                {!isConfigured && (
                  <span className="text-xs text-muted-foreground/40 mt-1 block">Não configurado</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
