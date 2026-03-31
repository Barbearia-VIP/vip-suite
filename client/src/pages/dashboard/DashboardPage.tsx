import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import {
  TrendingUp, Star, Camera, Instagram, MessageSquare,
  Building2, BarChart3, RefreshCw, ArrowUpRight, AlertCircle,
  CheckSquare, Wifi, WifiOff, Settings, TrendingDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOrg } from "@/hooks/useOrg";
import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({
  title, value, subtitle, icon: Icon, color, trend, configured = true, onConfigure,
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; color: string; trend?: number | null;
  configured?: boolean; onConfigure?: () => void;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            {configured ? (
              <p className="text-2xl font-bold text-foreground truncate">{value}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aguardando dados</p>
            )}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-3" style={{ background: `${color}20` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        </div>
        {trend !== null && trend !== undefined && configured && (
          <div className="flex items-center gap-1 mt-3">
            {trend >= 0
              ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              : <TrendingDown className="w-3 h-3 text-red-500" />}
            <span className={`text-xs font-medium ${trend >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {trend >= 0 ? "+" : ""}{trend}% vs mês anterior
            </span>
          </div>
        )}
        {!configured && onConfigure && (
          <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs px-2 gap-1 text-muted-foreground"
            onClick={onConfigure}>
            <Settings className="w-3 h-3" /> Configurar
          </Button>
        )}
      </CardContent>
    </Card>
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
  data_vip: "dataVip",
  gestao_total: "gestaoTotal",
  vip_cam: "vipCam",
  reputacao: "reputacao",
  auto_instagram: "autoInstagram",
  we_send: "weSend",
};

export default function DashboardPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units, loading: orgLoading } = useOrg();
  const [, navigate] = useLocation();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
  const orgId = org?.id ?? 0;
  const unitId = selectedUnit?.id;

  const kpisQuery = trpc.dashboard.kpis.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false }
  );
  const modulesQuery = trpc.dashboard.modulesStatus.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false }
  );
  const faturamentoQuery = trpc.dashboard.faturamentoMensal.useQuery(
    { orgId, unitId },
    { enabled: orgId > 0, refetchOnWindowFocus: false }
  );
  const rankingQuery = trpc.dashboard.rankingUnidades.useQuery(
    { orgId },
    { enabled: orgId > 0 && isMasterOrAdmin, refetchOnWindowFocus: false }
  );

  const kpis = kpisQuery.data;
  const modules = modulesQuery.data;
  const faturamentoData = faturamentoQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];
  const isLoading = kpisQuery.isLoading;

  function handleRefresh() {
    kpisQuery.refetch();
    modulesQuery.refetch();
    faturamentoQuery.refetch();
    rankingQuery.refetch();
  }

  if (!orgLoading && !org) {
    return (
      <div className="p-6">
        <PageHeader title="Dashboard" description="Bem-vindo ao VIP Suite" />
        <Card className="bg-card border-border">
          <CardContent className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">Configure sua organização</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Para começar, crie sua organização e adicione as unidades da sua rede.
            </p>
            <Button onClick={() => navigate("/unidades")} className="gap-2">
              <Building2 className="w-4 h-4" /> Criar Organização
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          selectedUnit
            ? `Visão consolidada — ${selectedUnit.name}`
            : isMasterOrAdmin ? "Visão consolidada de toda a rede" : "Visão da sua unidade"
        }
        actions={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleRefresh}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      {/* ── KPIs Principais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard
          title="Faturamento (mês)"
          value={kpis?.dataVip.hasData ? fmt(kpis.dataVip.faturamentoMes) : "R$ 0"}
          subtitle={kpis?.dataVip.hasData
            ? `${fmtNum(kpis.dataVip.atendimentos)} atendimentos`
            : "Sincronize o Data VIP"}
          icon={TrendingUp}
          color="oklch(0.65 0.15 200)"
          trend={kpis?.dataVip.trendFaturamento ?? null}
          configured={modules?.data_vip ?? true}
          onConfigure={() => navigate("/configuracoes")}
        />
        <KPICard
          title="Tarefas Abertas"
          value={kpis ? fmtNum(kpis.gestaoTotal.tarefasAbertas) : "—"}
          subtitle={kpis?.gestaoTotal.tarefasCriticas ? `${kpis.gestaoTotal.tarefasCriticas} críticas` : "Gestão Total"}
          icon={CheckSquare}
          color="oklch(0.65 0.15 145)"
          configured={true}
        />
        <KPICard
          title="Clientes Reconhecidos"
          value={kpis?.vipCam.hasData ? fmtNum(kpis.vipCam.reconhecidosHoje) : "0"}
          subtitle={kpis?.vipCam.hasData
            ? `${kpis.vipCam.satisfeitos} satisfeitos · ${kpis.vipCam.insatisfeitos} insatisfeitos`
            : "VIP Cam (hoje)"}
          icon={Camera}
          color="oklch(0.65 0.15 280)"
          configured={modules?.vip_cam ?? true}
          onConfigure={() => navigate("/configuracoes")}
        />
        <KPICard
          title="Avaliação Média"
          value={kpis?.reputacao.hasData ? kpis.reputacao.mediaAvaliacoes.toFixed(1) + " ★" : "—"}
          subtitle={kpis?.reputacao.hasData
            ? `${fmtNum(kpis.reputacao.totalAvaliacoes)} avaliações · ${kpis.reputacao.positivasPercent}% positivas`
            : "Google e plataformas"}
          icon={Star}
          color="oklch(0.65 0.15 30)"
          configured={modules?.reputacao ?? true}
          onConfigure={() => navigate("/configuracoes")}
        />
        <KPICard
          title="Instagram"
          value={kpis?.autoInstagram.hasData ? fmtNum(kpis.autoInstagram.seguidores) : "—"}
          subtitle={kpis?.autoInstagram.hasData
            ? `+${kpis.autoInstagram.novosSeguidores} novos · ${kpis.autoInstagram.comentariosRespondidos} resp.`
            : "Seguidores / engajamento"}
          icon={Instagram}
          color="oklch(0.65 0.15 320)"
          configured={modules?.auto_instagram ?? true}
          onConfigure={() => navigate("/configuracoes")}
        />
        <KPICard
          title="WhatsApp Enviados"
          value={kpis?.weSend.hasData ? fmtNum(kpis.weSend.enviados) : "0"}
          subtitle={kpis?.weSend.hasData
            ? `${kpis.weSend.campanhas} campanhas este mês`
            : "We Send (este mês)"}
          icon={MessageSquare}
          color="oklch(0.65 0.15 100)"
          configured={modules?.we_send ?? true}
          onConfigure={() => navigate("/configuracoes")}
        />
      </div>

      {/* ── Gráfico + Status dos Módulos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Faturamento Mensal</h3>
                  <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
                </div>
                <Badge variant="secondary" className="text-xs">Data VIP</Badge>
              </div>
              {faturamentoData.length > 0 && faturamentoData.some(d => d.faturamento > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={faturamentoData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.15 200)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.3)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "oklch(0.18 0 0)", border: "1px solid oklch(0.3 0 0)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [fmt(value), "Faturamento"]}
                    />
                    <Area type="monotone" dataKey="faturamento" stroke="oklch(0.65 0.15 200)"
                      strokeWidth={2} fill="url(#gradFat)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex flex-col items-center justify-center text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Sem dados de faturamento</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>
                    Sincronizar Data VIP →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="bg-card border-border h-full">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Status dos Módulos</h3>
              <div className="space-y-2.5">
                {MODULE_DEFS.map((mod) => {
                  const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
                  const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
                  const hasData = kpis?.[kpiKey]?.hasData ?? false;
                  const Icon = mod.icon;
                  return (
                    <button key={mod.key} onClick={() => navigate(mod.path)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors text-left">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `${mod.color}20` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: mod.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{mod.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{mod.desc}</p>
                      </div>
                      <div className="shrink-0">
                        {isConfigured && hasData
                          ? <Badge className="text-xs h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>
                          : isConfigured
                            ? <Badge className="text-xs h-5 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Sem dados</Badge>
                            : <Badge variant="outline" className="text-xs h-5 text-muted-foreground">Configurar</Badge>
                        }
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Ranking + Unidades ── */}
      {isMasterOrAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ranking de Unidades</h3>
                  <p className="text-xs text-muted-foreground">Faturamento do mês atual</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/data-vip")}>
                  Ver mais <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              {ranking.length > 0 && ranking.some(r => r.faturamento > 0) ? (
                <div className="space-y-2.5">
                  {ranking.slice(0, 5).map((unit, idx) => (
                    <div key={unit.unitId} className="flex items-center gap-3">
                      <span className={`text-xs font-bold w-5 text-center shrink-0 ${
                        idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"
                      }`}>{idx + 1}°</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                          <p className="text-xs font-semibold text-foreground shrink-0 ml-2">{fmt(unit.faturamento)}</p>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1">
                          <div className="h-1 rounded-full bg-primary"
                            style={{ width: `${ranking[0].faturamento > 0 ? (unit.faturamento / ranking[0].faturamento) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">Sincronize o Data VIP para ver o ranking</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/data-vip")}>
                    Ir para Data VIP →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Unidades da Rede</h3>
                  <p className="text-xs text-muted-foreground">{units.length} unidades cadastradas</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/unidades")}>
                  Ver todas <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              {orgLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : units.length === 0 ? (
                <div className="py-6 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/unidades")}>
                    Adicionar unidade
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {units.slice(0, 5).map((unit) => (
                    <div key={unit.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{unit.name}</p>
                        {unit.city && <p className="text-xs text-muted-foreground">{unit.city}{unit.state ? `, ${unit.state}` : ""}</p>}
                      </div>
                      <Badge variant="secondary" className="text-xs h-5 shrink-0">Ativa</Badge>
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Acesso Rápido aos Módulos ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Acesso Rápido aos Módulos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MODULE_DEFS.map((mod) => {
            const isConfigured = modules?.[mod.key as ModuleKey] ?? false;
            const kpiKey = MODULE_KPI_MAP[mod.key as ModuleKey];
            const hasData = kpis?.[kpiKey]?.hasData ?? false;
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => navigate(mod.path)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-border/60 hover:bg-card/80 transition-all relative">
                <div className="absolute top-2.5 right-2.5">
                  {isConfigured && hasData
                    ? <Wifi className="w-3 h-3 text-emerald-500" />
                    : isConfigured
                      ? <Wifi className="w-3 h-3 text-yellow-500" />
                      : <WifiOff className="w-3 h-3 text-muted-foreground/40" />}
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${mod.color}20` }}>
                  <Icon className="w-4 h-4" style={{ color: mod.color }} />
                </div>
                <p className="text-xs font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.desc}</p>
                {!isConfigured && (
                  <span className="text-xs text-muted-foreground/50 mt-1 block">Não configurado</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
