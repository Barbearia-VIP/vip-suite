/**
 * DataVipDashboard.tsx — Dashboard principal do módulo Data VIP
 * Mostra KPIs do mês, gráfico mensal, top colaboradores e acesso rápido às sub-páginas
 * Regra: dados por unidade; visão geral apenas para admin com "Todas as Unidades"
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  ReferenceLine, Dot
} from "recharts";
import {
  DollarSign, Users, Scissors, TrendingUp,
  ArrowUpRight, ArrowDownRight, RefreshCw, Trophy, Calendar,
  Target, BarChart3, UserCheck, ChevronRight, AlertCircle, ChevronDown, X,
  TrendingDown, Sigma
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["oklch(0.75 0.15 200)", "oklch(0.78 0.12 75)", "oklch(0.65 0.15 145)", "oklch(0.65 0.15 280)", "oklch(0.65 0.12 30)"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

// ─── Tipos de filtro ──────────────────────────────────────────────────────────
type FilterMode = "month" | "range";

interface MonthFilter { mode: "month"; periodo: string; }
interface RangeFilter { mode: "range"; dataInicio: string; dataFim: string; label: string; }
type Filter = MonthFilter | RangeFilter;

// ─── Atalhos rápidos de data ──────────────────────────────────────────────────
function getQuickRanges() {
  const today = new Date();
  return [
    {
      label: "Hoje",
      dataInicio: toISO(today),
      dataFim: toISO(today),
    },
    {
      label: "Ontem",
      dataInicio: toISO(subDays(today, 1)),
      dataFim: toISO(subDays(today, 1)),
    },
    {
      label: "Esta semana",
      dataInicio: toISO(startOfWeek(today, { weekStartsOn: 1 })),
      dataFim: toISO(endOfWeek(today, { weekStartsOn: 1 })),
    },
    {
      label: "Últimos 7 dias",
      dataInicio: toISO(subDays(today, 6)),
      dataFim: toISO(today),
    },
    {
      label: "Últimos 30 dias",
      dataInicio: toISO(subDays(today, 29)),
      dataFim: toISO(today),
    },
  ];
}

// ─── Componente DateRangePicker ───────────────────────────────────────────────
function DateRangePicker({
  filter,
  onFilterChange,
  periodos,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  periodos: { val: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);
  const quickRanges = useMemo(() => getQuickRanges(), []);

  // Label do botão principal
  const buttonLabel = useMemo(() => {
    if (filter.mode === "month") {
      return periodos.find(p => p.val === filter.periodo)?.label ?? filter.periodo;
    }
    // range
    if (filter.dataInicio === filter.dataFim) {
      return format(new Date(filter.dataInicio + "T12:00:00"), "dd/MM/yyyy");
    }
    return `${format(new Date(filter.dataInicio + "T12:00:00"), "dd/MM")} – ${format(new Date(filter.dataFim + "T12:00:00"), "dd/MM/yyyy")}`;
  }, [filter, periodos]);

  function applyCalRange() {
    if (!calRange?.from) return;
    const from = toISO(calRange.from);
    const to = toISO(calRange.to ?? calRange.from);
    const label = from === to
      ? format(calRange.from, "dd/MM/yyyy")
      : `${format(calRange.from, "dd/MM")} – ${format(calRange.to ?? calRange.from, "dd/MM/yyyy")}`;
    onFilterChange({ mode: "range", dataInicio: from, dataFim: to, label });
    setOpen(false);
  }

  function clearToCurrentMonth() {
    const now = new Date();
    onFilterChange({
      mode: "month",
      periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
    setCalRange(undefined);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 min-w-[140px] justify-between bg-muted/50"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{buttonLabel}</span>
          {filter.mode === "range" ? (
            <X
              className="w-3.5 h-3.5 text-muted-foreground shrink-0 hover:text-foreground"
              onClick={e => { e.stopPropagation(); clearToCurrentMonth(); }}
            />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={6}>
        <div className="flex flex-col sm:flex-row">
          {/* Painel esquerdo: atalhos + meses */}
          <div className="border-b sm:border-b-0 sm:border-r border-border p-3 space-y-1 min-w-[160px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Atalhos</p>
            {quickRanges.map(r => (
              <button
                key={r.label}
                onClick={() => {
                  onFilterChange({ mode: "range", dataInicio: r.dataInicio, dataFim: r.dataFim, label: r.label });
                  setOpen(false);
                }}
                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                  filter.mode === "range" && filter.label === r.label ? "bg-primary/10 text-primary font-medium" : ""
                }`}
              >
                {r.label}
              </button>
            ))}

            <div className="border-t border-border my-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mês</p>
            <div className="max-h-[200px] overflow-y-auto space-y-0.5 pr-1">
              {periodos.map(p => (
                <button
                  key={p.val}
                  onClick={() => {
                    onFilterChange({ mode: "month", periodo: p.val });
                    setCalRange(undefined);
                    setOpen(false);
                  }}
                  className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${
                    filter.mode === "month" && filter.periodo === p.val ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Painel direito: calendário */}
          <div className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Período personalizado</p>
            <CalendarUI
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              locale={ptBR}
              numberOfMonths={1}
              disabled={{ after: new Date() }}
              className="rounded-md"
            />
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1"
                disabled={!calRange?.from}
                onClick={applyCalRange}
              >
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCalRange(undefined)}
              >
                Limpar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function DataVipDashboard() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();

  const [filter, setFilter] = useState<Filter>({
    mode: "month",
    periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  });

  const orgId = org?.id;
  const unitId = selectedUnit?.id;

  // Parâmetros para a query
  const dashParams = useMemo(() => {
    if (filter.mode === "range") {
      return { orgId, unitId, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    return { orgId, unitId, periodo: filter.periodo };
  }, [filter, orgId, unitId]);

  const prodParams = useMemo(() => {
    if (filter.mode === "range") {
      // faturamentoPorProduto ainda usa periodo — usar o mês do dataInicio como fallback
      const [ano, mes] = filter.dataInicio.slice(0, 7).split("-");
      return { orgId, unitId, periodo: `${ano}-${mes}` };
    }
    return { orgId, unitId, periodo: filter.periodo };
  }, [filter, orgId, unitId]);

  const colaborParams = useMemo(() => {
    if (filter.mode === "range") {
      // Modo range: passar dataInicio e dataFim diretamente
      return { orgId, unitId, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    // Modo mensal: calcular início e fim do mês e passar como range
    const [ano, mes] = filter.periodo.split("-").map(Number);
    const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { orgId, unitId, dataInicio, dataFim };
  }, [filter, orgId, unitId]);

  // Verifica se é o mês atual (dados incompletos)
  const currentPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isMesAtual = filter.mode === "month" && filter.periodo === currentPeriodo;
  const isRangeMode = filter.mode === "range";

  // Seletor de métrica para o gráfico de evolução diária
  type MetricKey = "faturamento" | "atendimentos" | "ticketMedio" | "clientes" | "clientesNovos" | "extraQtd" | "extraValor" | "servicos" | "produtos";
  const [metrica, setMetrica] = useState<MetricKey>("faturamento");
  const [chartType, setChartType] = useState<"area" | "line">("area");

  const METRICAS: { key: MetricKey; label: string; format: (v: number) => string; color: string }[] = [
    { key: "faturamento",   label: "Faturamento",    format: fmt,                                         color: "oklch(0.78 0.18 85)"  },
    { key: "atendimentos",  label: "Atendimentos",   format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.72 0.14 220)" },
    { key: "ticketMedio",   label: "Ticket Médio",   format: v => fmt(v),                                  color: "oklch(0.75 0.15 145)" },
    { key: "clientes",      label: "Clientes",       format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.72 0.12 280)" },
    { key: "clientesNovos", label: "Novos Clientes", format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.75 0.15 340)" },
    { key: "extraQtd",      label: "Extra (Qtd)",    format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.72 0.14 30)"  },
    { key: "extraValor",    label: "Extra (R$)",     format: fmt,                                         color: "oklch(0.72 0.15 50)"  },
    { key: "servicos",      label: "Serviços",       format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.72 0.12 200)" },
    { key: "produtos",      label: "Produtos",       format: v => v.toLocaleString("pt-BR"),               color: "oklch(0.72 0.14 160)" },
  ];
  const metricaCfg = METRICAS.find(m => m.key === metrica) ?? METRICAS[0];

  // Parâmetros para evolução diária (sempre range)
  const evolParams = useMemo(() => {
    if (filter.mode === "range") {
      return { orgId, unitId, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    // Modo mensal: calcular início e fim do mês
    const [ano, mes] = filter.periodo.split("-").map(Number);
    const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { orgId, unitId, dataInicio, dataFim };
  }, [filter, orgId, unitId]);

  const dashQ = trpc.dataVip.dashboard.useQuery(dashParams, { enabled: !!orgId });
  const evolQ = trpc.dataVip.evolucaoDiaria.useQuery(evolParams, { enabled: !!orgId });
  const colaborQ = trpc.dataVip.colaboradores.useQuery(colaborParams, { enabled: !!orgId });
  const prodQ = trpc.dataVip.faturamentoPorProduto.useQuery(prodParams, { enabled: !!orgId });

  const d = dashQ.data;
  const evolData = evolQ.data ?? [];
  const colabs = colaborQ.data ?? [];
  const produtos = (prodQ.data?.porProduto ?? []).slice(0, 5);
  const pagamentos = prodQ.data?.porPagamento ?? [];

  const mesesLabels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const evolChartData = useMemo(() => {
    return evolData.map(r => ({
      ...r,
      label: r.dia.slice(5), // MM-DD
    }));
  }, [evolData]);

  // Estatísticas do gráfico
  const evolStats = useMemo(() => {
    if (evolChartData.length === 0) return null;
    const vals = evolChartData.map(r => (r as any)[metrica] as number);
    const total = vals.reduce((a, b) => a + b, 0);
    const media = total / vals.length;
    const maxVal = Math.max(...vals);
    const minVal = Math.min(...vals);
    const maxDia = evolChartData[vals.indexOf(maxVal)]?.label ?? "";
    const minDia = evolChartData[vals.indexOf(minVal)]?.label ?? "";
    return { total, media, maxVal, minVal, maxDia, minDia };
  }, [evolChartData, metrica]);

  const periodos = useMemo(() => {
    const list = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${mesesLabels[d.getMonth()]} ${d.getFullYear()}`;
      list.push({ val, label });
    }
    return list;
  }, []);

  const quickLinks = [
    { href: "/data-vip/mensal", icon: BarChart3, label: "Análise Mensal", color: "text-blue-400" },
    { href: "/data-vip/ranking", icon: Trophy, label: "Ranking da Rede", color: "text-yellow-400" },
    { href: "/data-vip/clientes", icon: Users, label: "Clientes", color: "text-green-400" },
    { href: "/data-vip/raio-x", icon: UserCheck, label: "Raio-X Retenção", color: "text-purple-400" },
    { href: "/data-vip/colaboradores", icon: Scissors, label: "Colaboradores", color: "text-pink-400" },
    { href: "/data-vip/comissoes", icon: DollarSign, label: "Comissões", color: "text-orange-400" },
    { href: "/data-vip/metas", icon: Target, label: "Metas", color: "text-red-400" },
    { href: "/data-vip/sincronizacao", icon: RefreshCw, label: "Sincronização", color: "text-cyan-400" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Data VIP
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedUnit ? selectedUnit.name : isAdmin ? "Todas as unidades" : "Sua unidade"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            filter={filter}
            onFilterChange={setFilter}
            periodos={periodos}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/data-vip/sincronizacao">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Sincronizar
            </Link>
          </Button>
        </div>
      </div>

      {/* Badge de modo range */}
      {isRangeMode && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Calendar className="w-3 h-3" />
            Período personalizado — dados em tempo real da tabela de vendas
          </Badge>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Faturamento",
            value: d ? fmt(d.faturamento) : "—",
            var: isRangeMode ? undefined : d?.varFaturamento,
            icon: DollarSign,
            color: "text-green-400",
          },
          {
            label: "Atendimentos",
            value: d ? d.atendimentos.toLocaleString("pt-BR") : "—",
            var: isRangeMode ? undefined : d?.varAtendimentos,
            icon: Scissors,
            color: "text-blue-400",
          },
          {
            label: "Ticket Médio",
            value: d ? fmt(d.ticketMedio) : "—",
            icon: TrendingUp,
            color: "text-yellow-400",
          },
          {
            label: "Clientes Atendidos",
            value: d ? d.clientesAtendidos.toLocaleString("pt-BR") : "—",
            icon: Users,
            color: "text-purple-400",
          },
        ].map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  {dashQ.isLoading
                    ? <Skeleton className="h-7 w-24" />
                    : <p className="text-xl font-bold">{kpi.value}</p>
                  }
                  {kpi.var !== undefined && (
                    <p className={`text-xs flex items-center gap-0.5 ${isMesAtual ? "text-muted-foreground" : kpi.var >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {isMesAtual
                        ? <Calendar className="w-3 h-3" />
                        : kpi.var >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />
                      }
                      {isMesAtual ? "Mês em andamento" : `${fmtPct(kpi.var)} vs mês ant.`}
                    </p>
                  )}
                  {isRangeMode && i < 2 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" /> Período selecionado
                    </p>
                  )}
                </div>
                <kpi.icon className={`w-5 h-5 ${kpi.color} opacity-70`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPIs secundários: Taxa de Retorno, Clientes Novos, Serviços e Produtos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Taxa de Retorno</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">
                      {d && d.clientesAtendidos > 0
                        ? `${Math.round((d.clientesAntigos ?? 0) / d.clientesAtendidos * 100)}%`
                        : "—"}
                    </p>
                }
                <p className="text-xs text-muted-foreground">clientes que retornaram</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-emerald-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Clientes Novos</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? (d.clientesNovos ?? 0).toLocaleString("pt-BR") : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">primeira visita no período</p>
              </div>
              <UserCheck className="w-5 h-5 text-pink-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Serviços Realizados</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? (d.servicosTotal ?? 0).toLocaleString("pt-BR") : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">cortes e serviços no período</p>
              </div>
              <Scissors className="w-5 h-5 text-cyan-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Produtos Vendidos</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? (d.produtosVendidos ?? 0).toLocaleString("pt-BR") : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">itens de produto no período</p>
              </div>
              <BarChart3 className="w-5 h-5 text-orange-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs terciários: Dias Trabalhados, Fat/Dia, Serviços Extra */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Dias Trabalhados</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? (d.diasTrabalhados ?? 0).toLocaleString("pt-BR") : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">dias com faturamento</p>
              </div>
              <Calendar className="w-5 h-5 text-violet-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Fat. / Dia Trabalhado</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? fmt(d.fatPorDia ?? 0) : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">média por dia ativo</p>
              </div>
              <TrendingUp className="w-5 h-5 text-emerald-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Serviços Extra (Qtd)</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? (d.servicosExtraQtd ?? 0).toLocaleString("pt-BR") : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">acabamentos e adicionais</p>
              </div>
              <Scissors className="w-5 h-5 text-amber-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Serviços Extra</p>
                {dashQ.isLoading
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-bold">{d ? fmt(d.servicosExtraTotal ?? 0) : "—"}</p>
                }
                <p className="text-xs text-muted-foreground">valor dos adicionais</p>
              </div>
              <DollarSign className="w-5 h-5 text-amber-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolução Diária — linha inteira */}
      <div>
        <Card className="bg-[oklch(0.12_0.01_240)] border-[oklch(0.22_0.02_240)]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Evolução Diária
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Toggle área/linha */}
                <div className="flex border border-border rounded-md overflow-hidden">
                  <button
                    onClick={() => setChartType("area")}
                    className={`px-2 py-1 text-xs transition-colors ${
                      chartType === "area" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setChartType("line")}
                    className={`px-2 py-1 text-xs transition-colors ${
                      chartType === "line" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                  </button>
                </div>
                <Select value={metrica} onValueChange={v => setMetrica(v as typeof metrica)}>
                  <SelectTrigger className="h-7 text-xs w-[140px] border-primary/50 text-primary font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRICAS.map(m => (
                      <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Mini KPIs */}
            {evolStats && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
                    <Sigma className="w-3 h-3" /> Acumulado
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {metrica === "clientesNovos" ? "—" : metricaCfg.format(evolStats.total)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Média/Dia</p>
                  <p className="text-sm font-bold text-foreground">{metricaCfg.format(evolStats.media)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-green-400 uppercase tracking-wide flex items-center justify-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Máximo
                  </p>
                  <p className="text-sm font-bold text-green-400">
                    {metricaCfg.format(evolStats.maxVal)}
                    <span className="text-[10px] text-muted-foreground ml-1">{evolStats.maxDia}</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-red-400 uppercase tracking-wide flex items-center justify-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Mínimo
                  </p>
                  <p className="text-sm font-bold text-red-400">
                    {metricaCfg.format(evolStats.minVal)}
                    <span className="text-[10px] text-muted-foreground ml-1">{evolStats.minDia}</span>
                  </p>
                </div>
              </div>
            )}
            {evolQ.isLoading
              ? <Skeleton className="h-[180px] w-full" />
              : evolChartData.length === 0
                ? <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" /> Sem dados para este período
                  </div>
                : <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={evolChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`gradEvol-${metrica}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={metricaCfg.color} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={metricaCfg.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 240)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={v => {
                          if (metrica === "faturamento" || metrica === "ticketMedio" || metrica === "extraValor") {
                            return v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v.toFixed(0)}`;
                          }
                          return v.toLocaleString("pt-BR");
                        }}
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{ background: "oklch(0.15 0.01 240)", border: "1px solid oklch(0.25 0.02 240)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [metricaCfg.format(v), metricaCfg.label]}
                        labelFormatter={l => `Dia ${l}`}
                      />
                      {evolStats && (
                        <ReferenceLine
                          y={evolStats.media}
                          stroke="oklch(0.55 0.01 240)"
                          strokeDasharray="4 4"
                          label={{ value: "Méd", position: "insideTopRight", fontSize: 9, fill: "oklch(0.55 0.01 240)" }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey={metrica}
                        stroke={metricaCfg.color}
                        strokeWidth={2}
                        fill={chartType === "area" ? `url(#gradEvol-${metrica})` : "none"}
                        dot={false}
                        activeDot={{ r: 4, fill: metricaCfg.color, stroke: "oklch(0.12 0.01 240)", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
            }
          </CardContent>
        </Card>
      </div>

      {/* Top Serviços + Formas de Pagamento */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Top Serviços</CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs h-7">
              <Link href="/data-vip/faturamento">Ver detalhes <ChevronRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {prodQ.isLoading
              ? <Skeleton className="h-32 w-full" />
              : produtos.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-4">Sem dados para este período</p>
                : <div className="space-y-2">
                    {produtos.map((p, i) => {
                      const totalGeral = produtos.reduce((s, x) => s + x.total, 0);
                      const pct = totalGeral > 0 ? Math.round((p.total / totalGeral) * 100) : 0;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="truncate">{p.produto}</span>
                            <span className="font-medium">{fmt(p.total)} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Formas de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {prodQ.isLoading
              ? <Skeleton className="h-48 w-full" />
              : pagamentos.length === 0
                ? <div className="h-48 flex items-center justify-center text-muted-foreground text-sm text-center">
                    Sem dados
                  </div>
                : <>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={pagamentos} dataKey="total" cx="50%" cy="50%" outerRadius={50} innerRadius={25}>
                          {pagamentos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-2">
                      {pagamentos.slice(0, 6).map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            {p.forma || "Outros"}
                          </span>
                          <span className="font-medium">{fmt(p.total)}</span>
                        </div>
                      ))}
                    </div>
                  </>
            }
          </CardContent>
        </Card>
      </div>

      {/* Colaboradores — lista completa detalhada */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Colaboradores
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs h-7">
            <Link href="/data-vip/colaboradores">Ver detalhes <ChevronRight className="w-3 h-3 ml-1" /></Link>
          </Button>
        </div>
        {colaborQ.isLoading
          ? <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
          : colabs.length === 0
            ? <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Sem dados para este período</CardContent></Card>
            : <div className="space-y-3">
                {colabs.map((c, i) => {
                  const initials = c.colaboradorNome.split("_").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();
                  const avatarColors = ["oklch(0.55 0.15 200)","oklch(0.55 0.12 75)","oklch(0.50 0.15 145)","oklch(0.50 0.15 280)","oklch(0.50 0.12 30)"];
                  const ac = avatarColors[i % avatarColors.length];
                  return (
                    <Card key={c.colaboradorId} className="bg-[oklch(0.12_0.01_240)] border-[oklch(0.22_0.02_240)]">
                      <CardContent className="pt-4 pb-4">
                        {/* Cabeçalho do colaborador */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: ac }}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground">{c.colaboradorNome}</p>
                            <p className="text-xs text-muted-foreground">{c.diasTrabalhados} dias trabalhados</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Fat./dia</p>
                            <p className="text-sm font-bold" style={{ color: ac }}>{fmt(c.faturamentoDia)}/dia</p>
                          </div>
                        </div>
                        {/* Grid de KPIs */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                          {[
                            { label: "Faturamento",    value: fmt(c.faturamento) },
                            { label: "Atendimentos",   value: String(c.atendimentos) },
                            { label: "Ticket Médio",   value: fmt(c.ticketMedio) },
                            { label: "Fat. / Dia",     value: fmt(c.faturamentoDia) },
                            { label: "Serviços",       value: String(c.servicos) },
                            { label: "Extras (qtd)",   value: String(c.extraQtd) },
                            { label: "Extras (R$)",    value: fmt(c.extraValor) },
                            { label: "Clientes",       value: String(c.clientes) },
                            { label: "Novos Clientes", value: String(c.clientesNovos) },
                            { label: "Produtos (Qtd)", value: String(c.produtosQtd) },
                            { label: "Produtos (R$)",  value: fmt(c.produtosValor) },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between py-1 border-b border-border/40">
                              <span className="text-xs text-muted-foreground">{label}</span>
                              <span className="text-xs font-semibold text-foreground">{value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
        }
      </div>

      {/* Acesso rápido */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Acesso Rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {quickLinks.map(l => (
            <Link key={l.href} href={l.href}>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors text-center">
                <l.icon className={`w-5 h-5 ${l.color}`} />
                <span className="text-xs font-medium leading-tight">{l.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
