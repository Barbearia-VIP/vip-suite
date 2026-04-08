import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { BarChart3, Send, CheckCircle, XCircle, Users, TrendingUp, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export default function RelatoriosWeSendPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const dashboardQuery = trpc.weSend.getDashboard.useQuery({ unitId }, { enabled: !!unitId });
  const campanhasQuery = trpc.weSend.getCampanhas.useQuery({ unitId }, { enabled: !!unitId });

  const dashboard = dashboardQuery.data;
  const campanhas = campanhasQuery.data || [];

  // Calcular métricas por status
  const porStatus = campanhas.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Top 5 campanhas por envios
  const top5 = [...campanhas]
    .sort((a, b) => (b.totalEnviados || 0) - (a.totalEnviados || 0))
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho das campanhas WhatsApp"
        actions={
          <Link href="/we-send">
            <Button size="sm" className="gap-1.5 text-xs">
              <Send className="w-3.5 h-3.5" />Nova campanha
            </Button>
          </Link>
        }
      />

      {dashboardQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : dashboard ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total de campanhas", value: dashboard.totalCampanhas, icon: BarChart3, color: "text-primary" },
              { label: "Total enviados", value: dashboard.totalEnviados.toLocaleString(), icon: Send, color: "text-green-500" },
              { label: "Total falhas", value: dashboard.totalFalhas.toLocaleString(), icon: XCircle, color: "text-red-500" },
              { label: "Taxa de sucesso", value: `${dashboard.taxaSucesso}%`, icon: TrendingUp, color: "text-emerald-500" },
            ].map(kpi => (
              <div className="glass-card bg-white/5 border-white/10" key={kpi.label}>
                <div className="p-6 pt-0 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                    <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Campanhas por status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-3">
                <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground">Campanhas por status</h3>
              </div>
              <div className="p-6 pt-0 space-y-2">
                {Object.entries(porStatus).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma campanha ainda</p>
                ) : (
                  Object.entries(porStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{status.replace("_", " ")}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(count / campanhas.length) * 100}%` }}
                          />
                        </div>
                        <span className="text-foreground font-medium w-6 text-right">{count}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-3">
                <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground">Top campanhas por envios</h3>
              </div>
              <div className="p-6 pt-0 space-y-2">
                {top5.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma campanha ainda</p>
                ) : (
                  top5.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="flex-1 text-foreground truncate">{c.nome}</span>
                      <span className="text-green-500 font-medium">{c.totalEnviados || 0}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Tabela de campanhas */}
          {campanhas.length > 0 && (
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-3">
                <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground">Todas as campanhas</h3>
              </div>
              <div className="p-6 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 text-muted-foreground font-medium">Campanha</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Contatos</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Enviados</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Falhas</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Taxa</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campanhas.map(c => {
                        const total = c.totalEnviados || 0 + (c.totalFalhas || 0);
                        const taxa = total > 0 ? Math.round((c.totalEnviados || 0) / total * 100) : 0;
                        return (
                          <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2 text-foreground">{c.nome}</td>
                            <td className="py-2 text-right text-muted-foreground">{c.totalContatos || 0}</td>
                            <td className="py-2 text-right text-green-500">{c.totalEnviados || 0}</td>
                            <td className="py-2 text-right text-red-500">{c.totalFalhas || 0}</td>
                            <td className="py-2 text-right text-foreground">{taxa}%</td>
                            <td className="py-2 text-right text-muted-foreground">
                              {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Nenhum dado disponível</p>
            <p className="text-xs text-muted-foreground">Crie campanhas para ver relatórios aqui</p>
          </div>
        </div>
      )}
    </div>
  );
}
