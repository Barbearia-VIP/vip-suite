/**
 * AdministracaoPage.tsx — Administração de orgs e unidades com teste de credenciais
 */
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { toast } from "sonner";
import { Settings, CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

export default function AdministracaoPage() {
  const { userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";

  const q = trpc.dataVip.unitsConfig.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org?.id && isAdmin }
  );

  const units = q.data ?? [];
  const comChaves = units.filter(u => u.hasApiKeys).length;
  const semChaves = units.filter(u => !u.hasApiKeys).length;

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-5 h-5" />
          <p>Acesso restrito a administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight"><Settings className="w-6 h-6 text-primary" /> Administração Data VIP</h1>
        <p className="text-sm text-muted-foreground">Gerenciar credenciais e configurações das unidades</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total de Unidades", value: units.length, color: "text-foreground" },
          { label: "Com Chaves API", value: comChaves, color: "text-green-400" },
          { label: "Sem Chaves API", value: semChaves, color: "text-yellow-400" },
        ].map((k, i) => (
          <Card key={i}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Banner de carregamento */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={2} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            Unidades e Credenciais
            <Button asChild variant="outline" size="sm" className="text-xs h-7">
              <Link href="/configuracoes">Gerenciar em Configurações <ExternalLink className="w-3 h-3 ml-1" /></Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading
            ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left px-4 py-2">Unidade</th>
                      <th className="text-center px-4 py-2">API ID</th>
                      <th className="text-center px-4 py-2">API Hash</th>
                      <th className="text-center px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u: any) => (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{u.name}</td>
                        <td className="px-4 py-2 text-center text-xs font-mono text-muted-foreground">
                          {u.dataVipConfig?.apiUnidadeId ? u.dataVipConfig.apiUnidadeId.substring(0, 8) + "..." : "—"}
                        </td>
                        <td className="px-4 py-2 text-center text-xs font-mono text-muted-foreground">
                          {u.dataVipConfig?.apiHash ? "••••••••" : "—"}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {u.hasApiKeys
                            ? <span className="flex items-center justify-center gap-1 text-green-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Configurado</span>
                            : <span className="flex items-center justify-center gap-1 text-yellow-400 text-xs"><AlertCircle className="w-3.5 h-3.5" /> Sem chaves</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </CardContent>
      </Card>
    </div>
  );
}
