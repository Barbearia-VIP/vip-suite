/**
 * RelatoriosPage.tsx — Relatórios semanais de performance
 */
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function RelatoriosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const q = trpc.dataVip.relatoriosSemanais.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, limit: 20 },
    { enabled: !!org?.id }
  );
  const relatorios = q.data ?? [];
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight"><FileText className="w-6 h-6 text-primary" /> Relatórios Semanais</h1>
        <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
      </div>
      {/* Banner de carregamento */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      <div className="glass-card overflow-hidden">
          {q.isLoading
            ? <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            : relatorios.length === 0
              ? <div className="p-8 text-center text-muted-foreground text-sm">Nenhum relatório disponível. Os relatórios são gerados automaticamente após a sincronização.</div>
              : <div className="divide-y divide-border">
                  {relatorios.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 transition-colors">
                      <div className="flex-1">
                        <p className="font-medium">{r.unitName || "Rede"}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(r.semanaInicio)} a {fmtDate(r.semanaFim)}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-green-400">{fmt(Number(r.faturamento || 0))}</p>
                        <p className="text-xs text-muted-foreground">{Number(r.atendimentos || 0).toLocaleString("pt-BR")} atend.</p>
                      </div>
                    </div>
                  ))}
                </div>
          }
      </div>
    </div>
  );
}
