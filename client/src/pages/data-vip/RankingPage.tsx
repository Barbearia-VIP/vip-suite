/**
 * RankingPage.tsx — Ranking da rede com controle de visibilidade por perfil
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Lock } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export default function RankingPage() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const periodos = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      list.push({ val, label });
    }
    return list;
  }, []);

  const q = trpc.dataVip.ranking.useQuery(
    { orgId: org?.id, periodo },
    { enabled: !!org?.id }
  );

  const ranking = q.data?.ranking ?? [];

  const medalColors = ["text-yellow-400", "text-gray-300", "text-orange-400"];
  const medalIcons = [Trophy, Medal, Medal];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
            <Trophy className="w-6 h-6 text-yellow-400" /> Ranking da Rede
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Visão completa de todas as unidades" : "Sua posição na rede"}
          </p>
        </div>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value)}
          className="text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-foreground backdrop-blur-sm"
        >
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      {/* Banner de carregamento */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      {!isAdmin && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Lock className="w-3.5 h-3.5" />
          Os valores das demais unidades são visíveis apenas para administradores. Você pode ver sua posição e os nomes das outras unidades.
        </div>
      )}

      <div className="glass-card overflow-hidden">
          {q.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {ranking.map((r, i) => {
                const MedalIcon = i < 3 ? medalIcons[i] : null;
                const isMe = r.isMyUnit;
                return (
                  <div key={r.unitId} className={`flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/5 ${isMe ? "bg-amber-500/10 border-l-2 border-amber-500" : ""}`}>
                    <div className="w-8 flex items-center justify-center">
                      {MedalIcon
                        ? <MedalIcon className={`w-5 h-5 ${medalColors[i]}`} />
                        : <span className="text-sm text-muted-foreground font-medium">#{r.posicao}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.unitName}</span>
                        {isMe && <Badge variant="outline" className="text-xs border-primary/50 text-primary">Sua unidade</Badge>}
                      </div>
                      {r.atendimentos !== null && (
                        <p className="text-xs text-muted-foreground">{r.atendimentos.toLocaleString("pt-BR")} atend. · {r.clientes?.toLocaleString("pt-BR")} clientes</p>
                      )}
                    </div>
                    <div className="text-right">
                      {r.faturamento !== null
                        ? <span className="font-semibold text-green-400">{fmt(r.faturamento)}</span>
                        : <span className="text-muted-foreground flex items-center gap-1 text-sm"><Lock className="w-3 h-3" /> Oculto</span>
                      }
                      {r.ticketMedio !== null && (
                        <p className="text-xs text-muted-foreground">Ticket: {fmt(r.ticketMedio)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
