/**
 * GestaoTotalDashboard.tsx — Dashboard principal do módulo Gestão Total
 * KPIs reais com filtro de período: Hoje / Semana / Mês atual / Trimestre
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckSquare, Users, Calendar,
  TrendingUp, TrendingDown, GitBranch, UserCheck,
  ClipboardList, Clock, CheckCircle2, ArrowRight, Target,
} from "lucide-react";

// ── Tipos de período ──────────────────────────────────────────────────────────
type Periodo = "hoje" | "semana" | "mes" | "trimestre";

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje",      label: "Hoje" },
  { key: "semana",    label: "Semana" },
  { key: "mes",       label: "Mês atual" },
  { key: "trimestre", label: "Trimestre" },
];

function calcPeriodo(p: Periodo): { dateFrom: string; dateTo: string } {
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (p === "hoje") {
    const s = fmt(hoje);
    return { dateFrom: s, dateTo: s };
  }
  if (p === "semana") {
    const dow = hoje.getDay(); // 0=dom
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((dow + 6) % 7));
    const dom = new Date(seg);  dom.setDate(seg.getDate() + 6);
    return { dateFrom: fmt(seg), dateTo: fmt(dom) };
  }
  if (p === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { dateFrom: fmt(ini), dateTo: fmt(fim) };
  }
  // trimestre
  const q = Math.floor(hoje.getMonth() / 3);
  const ini = new Date(hoje.getFullYear(), q * 3, 1);
  const fim = new Date(hoje.getFullYear(), q * 3 + 3, 0);
  return { dateFrom: fmt(ini), dateTo: fmt(fim) };
}

// Labels dinâmicos por período
const KPI_LABELS: Record<Periodo, {
  receitas: string; despesas: string; resultado: string;
  reunioes: string; tarefas: string; processos: string;
}> = {
  hoje:      { receitas: "Receitas Hoje",      despesas: "Despesas Hoje",      resultado: "Resultado Hoje",      reunioes: "Reuniões Hoje",      tarefas: "Tarefas Hoje",      processos: "Processos Hoje"      },
  semana:    { receitas: "Receitas da Semana",  despesas: "Despesas da Semana",  resultado: "Resultado da Semana",  reunioes: "Reuniões da Semana",  tarefas: "Tarefas da Semana",  processos: "Processos da Semana"  },
  mes:       { receitas: "Receitas do Mês",     despesas: "Despesas do Mês",     resultado: "Resultado do Mês",     reunioes: "Reuniões do Mês",     tarefas: "Tarefas do Mês",     processos: "Processos do Mês"     },
  trimestre: { receitas: "Receitas do Trim.",   despesas: "Despesas do Trim.",   resultado: "Resultado do Trim.",   reunioes: "Reuniões do Trim.",   tarefas: "Tarefas do Trim.",   processos: "Processos do Trim."   },
};

// ── Helpers de formatação ─────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color, href }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; href?: string;
}) {
  const content = (
    <div className="glass-card bg-white/5 border-white/10 hover:border-primary/40 transition-colors cursor-pointer">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
            <Icon className="w-4.5 h-4.5" style={{ color }} />
          </div>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pendente:    { label: "Pendente",    color: "bg-yellow-500/20 text-yellow-400" },
    em_andamento:{ label: "Em Andamento",color: "bg-blue-500/20 text-blue-400" },
    em_revisao:  { label: "Em Revisão",  color: "bg-purple-500/20 text-purple-400" },
    concluida:   { label: "Concluída",   color: "bg-green-500/20 text-green-400" },
  };
  const s = map[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>;
}

function PrioridadeBadge({ prioridade }: { prioridade: string }) {
  const map: Record<string, string> = {
    baixa:   "bg-slate-500/20 text-slate-400",
    media:   "bg-blue-500/20 text-blue-400",
    alta:    "bg-orange-500/20 text-orange-400",
    critica: "bg-red-500/20 text-red-400",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[prioridade] ?? "bg-muted text-muted-foreground"}`}>{prioridade}</span>;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GestaoTotalDashboard() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();

  // Período selecionado — padrão: mês atual
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const { dateFrom, dateTo } = useMemo(() => calcPeriodo(periodo), [periodo]);
  const labels = KPI_LABELS[periodo];

  const kpisQ = trpc.gestaoTotal.dashboard.kpis.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, dateFrom, dateTo },
    { enabled: !!org?.id }
  );
  const tarefasQ = trpc.gestaoTotal.dashboard.tarefasRecentes.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, limit: 6 },
    { enabled: !!org?.id }
  );

  const k = kpisQ.data;
  const tarefas = tarefasQ.data ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Gestão Total</h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} — visão geral operacional
          </p>
        </div>
        <Link href="/gestao-total/ia-conselheiro">
          <button className="flex items-center gap-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors font-medium">
            IA Conselheiro <ArrowRight className="w-3 h-3" />
          </button>
        </Link>
      </div>

      {/* Seletor de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Período:</span>
        {PERIODOS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              periodo === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        {/* Indicador de intervalo */}
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
          {dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
        </span>
      </div>

      {/* KPIs principais */}
      {kpisQ.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard title={labels.tarefas + " Pendentes"} value={k?.tarefasPendentes ?? 0} sub={`${k?.tarefasAndamento ?? 0} em andamento`} icon={CheckSquare} color="oklch(0.65 0.15 145)" href="/gestao-total/tarefas" />
          <KpiCard title="Tarefas Destinadas" value={k?.tarefasDestinadas ?? 0} sub="com responsável ativo" icon={UserCheck} color="oklch(0.65 0.15 200)" href="/gestao-total/tarefas" />
          <KpiCard title={labels.reunioes} value={k?.reunioesHoje ?? 0} sub="agendadas no período" icon={Calendar} color="oklch(0.65 0.15 260)" href="/gestao-total/reunioes" />
          <KpiCard title="Colaboradores Ativos" value={k?.colaboradoresAtivos ?? 0} sub="na equipe" icon={Users} color="oklch(0.65 0.15 200)" href="/gestao-total/colaboradores" />
          <KpiCard title={labels.receitas} value={fmt(k?.receitasMes ?? 0)} sub="entradas registradas" icon={TrendingUp} color="oklch(0.65 0.15 145)" href="/gestao-total/financeiro" />
          <KpiCard title={labels.despesas} value={fmt(k?.despesasMes ?? 0)} sub="saídas registradas" icon={TrendingDown} color="oklch(0.65 0.18 30)" href="/gestao-total/financeiro" />
          <KpiCard title={labels.processos} value={k?.processosCount ?? 0} sub="mapeados no sistema" icon={GitBranch} color="oklch(0.65 0.15 60)" href="/gestao-total/processos" />
          <KpiCard title="Tarefas Concluídas" value={k?.tarefasConcluidas ?? 0} sub="finalizadas no período" icon={CheckCircle2} color="oklch(0.65 0.18 145)" href="/gestao-total/tarefas" />
        </div>
      )}

      {/* Resultado financeiro */}
      {k && (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{labels.resultado}</p>
                <p className={`text-2xl font-bold ${k.lucroMes >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(k.lucroMes)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tarefas concluídas</p>
                <p className="text-lg font-semibold text-foreground">{k.tarefasConcluidas}</p>
              </div>
              <Link href="/gestao-total/financeiro">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  Ver DRE <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tarefas recentes */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="pb-3 p-4 flex flex-row items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" /> Tarefas Recentes
          </h3>
          <Link href="/gestao-total/tarefas">
            <button className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </div>
        <div className="p-0">
          {tarefasQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          ) : tarefas.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa cadastrada</p>
              <Link href="/gestao-total/tarefas">
                <button className="mt-2 text-xs text-primary hover:underline">Criar primeira tarefa</button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tarefas.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{t.titulo}</p>
                      {t.responsavel && <p className="text-xs text-muted-foreground">{t.responsavel}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <PrioridadeBadge prioridade={t.prioridade} />
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Atalhos de módulos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Processos",   href: "/gestao-total/processos",   icon: ClipboardList, color: "oklch(0.65 0.15 145)" },
          { label: "Indicadores", href: "/gestao-total/indicadores", icon: TrendingUp,    color: "oklch(0.65 0.15 260)" },
          { label: "Planejamento",href: "/gestao-total/planejamento",icon: Target,        color: "oklch(0.65 0.15 200)" },
          { label: "Marketing",   href: "/gestao-total/marketing",   icon: TrendingUp,    color: "oklch(0.65 0.15 60)"  },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <div className="glass-card bg-white/5 border-white/10 hover:border-primary/40 transition-colors cursor-pointer">
              <div className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${item.color}20` }}>
                  <item.icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
