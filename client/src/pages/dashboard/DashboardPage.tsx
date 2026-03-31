import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import {
  TrendingUp,
  Users,
  Star,
  Camera,
  Instagram,
  MessageSquare,
  Building2,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOrg } from "@/hooks/useOrg";

const MODULE_CARDS = [
  { key: "data_vip", label: "Data VIP", icon: BarChart3, color: "oklch(0.65 0.15 200)", path: "/data-vip", desc: "Analytics e faturamento" },
  { key: "gestao_total", label: "Gestão Total", icon: Building2, color: "oklch(0.65 0.15 145)", path: "/gestao-total", desc: "ERP operacional" },
  { key: "vip_cam", label: "VIP Cam", icon: Camera, color: "oklch(0.65 0.15 280)", path: "/vip-cam", desc: "Reconhecimento facial" },
  { key: "reputacao", label: "Reputação", icon: Star, color: "oklch(0.65 0.15 30)", path: "/reputacao", desc: "Avaliações online" },
  { key: "auto_instagram", label: "Auto Instagram", icon: Instagram, color: "oklch(0.65 0.15 320)", path: "/auto-instagram", desc: "Automação Instagram" },
  { key: "we_send", label: "We Send", icon: MessageSquare, color: "oklch(0.65 0.15 145)", path: "/we-send", desc: "WhatsApp em massa" },
];

function KPICard({ title, value, subtitle, icon: Icon, color, trend }: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; color: string; trend?: number;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
            <Icon className="w-4.5 h-4.5" style={{ color }} />
          </div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-3">
            <ArrowUpRight className="w-3 h-3" style={{ color: trend >= 0 ? "oklch(0.65 0.15 145)" : "oklch(0.65 0.15 30)" }} />
            <span className="text-xs font-medium" style={{ color: trend >= 0 ? "oklch(0.65 0.15 145)" : "oklch(0.65 0.15 30)" }}>
              {trend >= 0 ? "+" : ""}{trend}% vs mês anterior
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units, loading: orgLoading } = useOrg();
  const [, navigate] = useLocation();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";

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
              <Building2 className="w-4 h-4" />
              Criar Organização
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
        description={selectedUnit ? `Visão consolidada — ${selectedUnit.name}` : isMasterOrAdmin ? "Visão consolidada de toda a rede" : "Visão da sua unidade"}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </Button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Faturamento (mês)" value="R$ —" subtitle="Sincronize o Data VIP" icon={TrendingUp} color="oklch(0.65 0.15 200)" />
        <KPICard title="Atendimentos" value="—" subtitle="Total do mês" icon={Users} color="oklch(0.78 0.12 75)" />
        <KPICard title="Avaliação Média" value="—" subtitle="Google e plataformas" icon={Star} color="oklch(0.65 0.15 30)" />
        <KPICard title="Clientes Reconhecidos" value="—" subtitle="VIP Cam (hoje)" icon={Camera} color="oklch(0.65 0.15 280)" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Módulos Disponíveis</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MODULE_CARDS.map((mod) => {
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => navigate(mod.path)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-border/60 hover:bg-card/80 transition-all">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${mod.color}20` }}>
                  <Icon className="w-4 h-4" style={{ color: mod.color }} />
                </div>
                <p className="text-xs font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
      {isMasterOrAdmin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Unidades da Rede</h2>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/unidades")}>
              Ver todas <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {orgLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />)}
            </div>
          ) : units.length === 0 ? (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="p-6 text-center">
                <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
                <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => navigate("/unidades")}>Adicionar unidade</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.slice(0, 6).map((unit) => (
                <Card key={unit.id} className="bg-card border-border hover:border-border/60 transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{unit.name}</p>
                        {unit.city && <p className="text-xs text-muted-foreground">{unit.city}{unit.state ? `, ${unit.state}` : ""}</p>}
                      </div>
                      <Badge variant="secondary" className="ml-auto text-xs shrink-0">Ativa</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
