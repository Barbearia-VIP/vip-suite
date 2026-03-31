/**
 * GestaoTotalDashboard.tsx — Dashboard principal do módulo Gestão Total
 * KPIs reais: tarefas, problemas, reuniões, colaboradores, financeiro
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckSquare, AlertTriangle, Users, Calendar,
  TrendingUp, TrendingDown, ShoppingCart, Shield,
  ClipboardList, Clock, CheckCircle2, ArrowRight,
} from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function KpiCard({ title, value, sub, icon: Icon, color, href }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; href?: string;
}) {
  const content = (
    <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <Icon className="w-4.5 h-4.5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pendente: { label: "Pendente", color: "bg-yellow-500/20 text-yellow-400" },
    em_andamento: { label: "Em Andamento", color: "bg-blue-500/20 text-blue-400" },
    em_revisao: { label: "Em Revisão", color: "bg-purple-500/20 text-purple-400" },
    concluida: { label: "Concluída", color: "bg-green-500/20 text-green-400" },
  };
  const s = map[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>;
}

function PrioridadeBadge({ prioridade }: { prioridade: string }) {
  const map: Record<string, string> = {
    baixa: "bg-slate-500/20 text-slate-400",
    media: "bg-blue-500/20 text-blue-400",
    alta: "bg-orange-500/20 text-orange-400",
    critica: "bg-red-500/20 text-red-400",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[prioridade] ?? "bg-muted text-muted-foreground"}`}>{prioridade}</span>;
}

export default function GestaoTotalDashboard() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();

  const kpisQ = trpc.gestaoTotal.dashboard.kpis.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const tarefasQ = trpc.gestaoTotal.dashboard.tarefasRecentes.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, limit: 6 },
    { enabled: !!org?.id }
  );

  const k = kpisQ.data;
  const tarefas = tarefasQ.data ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestão Total</h1>
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

      {/* KPIs principais */}
      {kpisQ.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard title="Tarefas Pendentes" value={k?.tarefasPendentes ?? 0} sub={`${k?.tarefasAndamento ?? 0} em andamento`} icon={CheckSquare} color="oklch(0.65 0.15 145)" href="/gestao-total/tarefas" />
          <KpiCard title="Problemas Abertos" value={k?.problemasAbertos ?? 0} sub={`${k?.totalProblemas ?? 0} total`} icon={AlertTriangle} color="oklch(0.65 0.18 30)" href="/gestao-total/problemas" />
          <KpiCard title="Reuniões Hoje" value={k?.reunioesHoje ?? 0} sub="agendadas" icon={Calendar} color="oklch(0.65 0.15 260)" href="/gestao-total/reunioes" />
          <KpiCard title="Colaboradores Ativos" value={k?.colaboradoresAtivos ?? 0} sub="na equipe" icon={Users} color="oklch(0.65 0.15 200)" href="/gestao-total/colaboradores" />
          <KpiCard title="Receitas do Mês" value={fmt(k?.receitasMes ?? 0)} sub="entradas registradas" icon={TrendingUp} color="oklch(0.65 0.15 145)" href="/gestao-total/financeiro" />
          <KpiCard title="Despesas do Mês" value={fmt(k?.despesasMes ?? 0)} sub="saídas registradas" icon={TrendingDown} color="oklch(0.65 0.18 30)" href="/gestao-total/financeiro" />
          <KpiCard title="Compras Pendentes" value={k?.comprasPendentes ?? 0} sub="aguardando aprovação" icon={ShoppingCart} color="oklch(0.65 0.15 60)" href="/gestao-total/compras" />
          <KpiCard title="Riscos Críticos" value={k?.riscosAltos ?? 0} sub="alta prob. + alto impacto" icon={Shield} color="oklch(0.65 0.18 10)" href="/gestao-total/riscos" />
        </div>
      )}

      {/* Resultado financeiro */}
      {k && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Resultado do Mês</p>
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
          </CardContent>
        </Card>
      )}

      {/* Tarefas recentes */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" /> Tarefas Recentes
          </CardTitle>
          <Link href="/gestao-total/tarefas">
            <button className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>

      {/* Atalhos de módulos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Processos", href: "/gestao-total/processos", icon: ClipboardList, color: "oklch(0.65 0.15 145)" },
          { label: "Indicadores", href: "/gestao-total/indicadores", icon: TrendingUp, color: "oklch(0.65 0.15 260)" },
          { label: "Planejamento", href: "/gestao-total/planejamento", icon: Shield, color: "oklch(0.65 0.15 200)" },
          { label: "Marketing", href: "/gestao-total/marketing", icon: TrendingUp, color: "oklch(0.65 0.15 60)" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${item.color}20` }}>
                  <item.icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
