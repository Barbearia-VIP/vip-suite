/**
 * IndicadoresPage.tsx — Indicadores integrados do Gestão Total
 * Layout: cards com valor real vs meta, barra de progresso colorida,
 * badge de categoria, 3 abas (Visão Geral, Por Categoria, Gráficos)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend,
} from "recharts";
import { useChartTheme } from "../../hooks/useChartTheme";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, LayoutGrid,
  Tag, BarChart2, AlertCircle, DollarSign,
  ShoppingCart, Users, Lightbulb, Target, ExternalLink,
  CheckCircle,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Indicador = {
  id: string; nome: string; valor: number; meta: number;
  tipo: "numero" | "percentual" | "moeda"; unidade?: string;
  categoria: string; tendencia: "subindo" | "estavel" | "caindo";
  inverso?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatValor(ind: Indicador): string {
  if (ind.tipo === "moeda") return `R$ ${ind.valor.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
  if (ind.tipo === "percentual") return `${ind.valor}%`;
  return `${ind.valor}${ind.unidade ? ` ${ind.unidade}` : ""}`;
}
function formatMeta(ind: Indicador): string {
  if (ind.tipo === "moeda") return `Meta: R$ ${ind.meta.toLocaleString("pt-BR")}`;
  if (ind.tipo === "percentual") return `Meta: ${ind.meta}%`;
  return `Meta: ${ind.meta}${ind.unidade ? ` ${ind.unidade}` : ""}`;
}
function getPercent(ind: Indicador): number {
  if (ind.meta === 0) return 0;
  const raw = Math.round((ind.valor / ind.meta) * 100);
  if (ind.inverso) {
    return Math.max(0, Math.min(100, 100 - raw));
  }
  return Math.min(100, Math.max(0, raw));
}
function getBarColor(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
}
function getValueColor(pct: number): string {
  if (pct >= 80) return "text-green-400";
  if (pct >= 40) return "text-yellow-400";
  return "text-red-400";
}

// ── Ícones por categoria ──────────────────────────────────────────────────────
const CATEGORIA_ICON: Record<string, React.ReactNode> = {
  "Produtividade": <CheckCircle className="w-4 h-4 text-green-400" />,
  "Financeiro": <DollarSign className="w-4 h-4 text-yellow-400" />,
  "Compras": <ShoppingCart className="w-4 h-4 text-blue-400" />,
  "RH": <Users className="w-4 h-4 text-purple-400" />,
  "Oportunidades": <Lightbulb className="w-4 h-4 text-orange-400" />,
};
const CATEGORIA_LINK: Record<string, string> = {
  "Produtividade": "/gestao-total/tarefas",
  "Financeiro": "/gestao-total/financeiro",
  "Compras": "/gestao-total/compras",
  "RH": "/gestao-total/colaboradores",
  "Oportunidades": "/gestao-total/oportunidades",
};

// ── Card de Indicador ─────────────────────────────────────────────────────────
function IndicadorCard({ ind, onNavigate }: { ind: Indicador; onNavigate: (path: string) => void }) {
  const pct = getPercent(ind);
  const barColor = getBarColor(pct);
  const valueColor = getValueColor(pct);
  const link = CATEGORIA_LINK[ind.categoria];

  return (
    <div className="glass-card hover:shadow-md transition-shadow border-border/60 bg-white/5">
      <div className="p-6 pt-0 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {CATEGORIA_ICON[ind.categoria] ?? <Target className="w-4 h-4 text-muted-foreground" />}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate">
              {ind.nome}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {ind.tendencia === "subindo" && <TrendingUp className="w-3.5 h-3.5 text-green-400" />}
            {ind.tendencia === "caindo" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            {ind.tendencia === "estavel" && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>

        <div>
          <p className={`text-2xl font-bold ${valueColor}`}>{formatValor(ind)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatMeta(ind)}</p>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{pct}% da meta</span>
            {link && (
              <button
                onClick={() => onNavigate(link)}
                className="flex items-center gap-0.5 text-xs text-primary hover:underline font-medium"
              >
                {ind.categoria} <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aba Gráficos ──────────────────────────────────────────────────────────────
function GraficosView({ indicadores }: { indicadores: Indicador[] }) {
  const ct = useChartTheme();
  const barData = indicadores.map(ind => ({
    nome: ind.nome.length > 22 ? ind.nome.substring(0, 20) + "…" : ind.nome,
    pct: getPercent(ind),
  }));

  const radarData = indicadores.map(ind => ({
    subject: ind.nome.length > 16 ? ind.nome.substring(0, 14) + "…" : ind.nome,
    pct: getPercent(ind),
    fullMark: 100,
  }));

  return (
    <div className="space-y-6">
      <div className="glass-card">
        <div className="p-6 pt-0 p-4">
          <h3 className="text-sm font-semibold mb-4 text-foreground">% de Atingimento por Indicador</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 70 }}>
              <defs>
                <linearGradient id="gradBarAmbar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.82 0.16 72)" stopOpacity={1} />
                  <stop offset="100%" stopColor="oklch(0.68 0.14 55)" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
              <XAxis
                dataKey="nome"
                tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }}
                angle={-35}
                textAnchor="end"
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} unit="%" domain={[0, 100]} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Atingimento"]}
                contentStyle={ct.tooltipStyle}
                labelStyle={{ color: "oklch(0.55 0.012 260)"  }}
                cursor={{ fill: "oklch(0.76 0.145 72 / 0.08)" }}
              />
              <Bar dataKey="pct" name="% da Meta" fill="url(#gradBarAmbar)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card">
        <div className="p-6 pt-0 p-4">
          <h3 className="text-sm font-semibold mb-4 text-foreground">Radar de Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <defs>
                <radialGradient id="gradRadarAmbar" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="oklch(0.82 0.16 72)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="oklch(0.68 0.14 55)" stopOpacity={0.08} />
                </radialGradient>
              </defs>
              <PolarGrid stroke="oklch(0.22 0.014 260 / 0.5)" strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} />
              <Radar
                name="% da Meta"
                dataKey="pct"
                stroke="oklch(0.76 0.145 72)"
                strokeWidth={2}
                fill="url(#gradRadarAmbar)"
                dot={{ r: 3, fill: "oklch(0.76 0.145 72)", strokeWidth: 0 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "oklch(0.55 0.012 260)" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function IndicadoresPage() {
  const ct = useChartTheme();
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [, navigate] = useLocation();
  const [aba, setAba] = useState<"geral" | "categoria" | "graficos">("geral");

  const { data: rawIndicadores = [], isLoading, refetch } = trpc.gestaoTotal.indicadores.consolidado.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id, refetchInterval: 60_000 }
  );

  const indicadores = rawIndicadores as Indicador[];
  const categorias = Array.from(new Set(indicadores.map(i => i.categoria)));

  const totalOk = indicadores.filter(i => getPercent(i) >= 80).length;
  const totalAtencao = indicadores.filter(i => { const p = getPercent(i); return p >= 40 && p < 80; }).length;
  const totalCritico = indicadores.filter(i => getPercent(i) < 40).length;

  if (!org) return (
    <div className="p-6 text-center text-muted-foreground">
      Selecione uma organização para ver os indicadores.
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão integrada em tempo real — {selectedUnit?.name ?? "Organização"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {!isLoading && indicadores.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card border-green-500/30 bg-green-500/5">
            <div className="p-6 pt-0 p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{totalOk}</p>
              <p className="text-xs text-muted-foreground mt-0.5">No alvo (≥80%)</p>
            </div>
          </div>
          <div className="glass-card border-yellow-500/30 bg-yellow-500/5">
            <div className="p-6 pt-0 p-3 text-center">
              <p className="text-2xl font-bold text-yellow-400">{totalAtencao}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Atenção (40–79%)</p>
            </div>
          </div>
          <div className="glass-card border-red-500/30 bg-red-500/5">
            <div className="p-6 pt-0 p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{totalCritico}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Crítico (&lt;40%)</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-white/10">
        {[
          { key: "geral", label: "Visão Geral", icon: <LayoutGrid className="w-4 h-4" /> },
          { key: "categoria", label: "Por Categoria", icon: <Tag className="w-4 h-4" /> },
          { key: "graficos", label: "Gráficos", icon: <BarChart2 className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setAba(tab.key as typeof aba)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              aba === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : indicadores.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum indicador disponível.</p>
          <p className="text-xs mt-1">Adicione dados ao sistema para ver os indicadores em tempo real.</p>
        </div>
      ) : aba === "geral" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {indicadores.map(ind => (
            <IndicadorCard key={ind.id} ind={ind} onNavigate={navigate} />
          ))}
        </div>
      ) : aba === "categoria" ? (
        <div className="space-y-8">
          {categorias.map(cat => {
            const catIndicadores = indicadores.filter(i => i.categoria === cat);
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-4">
                  {CATEGORIA_ICON[cat] ?? <Target className="w-4 h-4 text-muted-foreground" />}
                  <h2 className="text-base font-semibold text-foreground font-display tracking-tight">{cat}</h2>
                  <Badge variant="outline" className="text-xs">
                    {catIndicadores.length} indicador{catIndicadores.length !== 1 ? "es" : ""}
                  </Badge>
                  {CATEGORIA_LINK[cat] && (
                    <button
                      onClick={() => navigate(CATEGORIA_LINK[cat])}
                      className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Ver módulo <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {catIndicadores.map(ind => (
                    <IndicadorCard key={ind.id} ind={ind} onNavigate={navigate} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <GraficosView indicadores={indicadores} />
      )}
    </div>
  );
}
