/**
 * ColaboradoresPage.tsx — Gestão de colaboradores com tipo e performance
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Scissors } from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ColaboradoresPage() {
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
      list.push({ val, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    return list;
  }, []);

  const q = trpc.dataVip.colaboradores.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, periodo },
    { enabled: !!org?.id }
  );

  const utils = trpc.useUtils();
  const updateTipo = trpc.dataVip.updateColaboradorTipo.useMutation({
    onSuccess: () => { toast.success("Tipo atualizado"); utils.dataVip.colaboradores.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const colabs = q.data ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scissors className="w-6 h-6 text-pink-400" /> Colaboradores
          </h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"} · {colabs.length} colaboradores</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="text-sm bg-muted border border-border rounded px-2 py-1.5">
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-right px-4 py-2">Faturamento</th>
                  <th className="text-right px-4 py-2">Atendimentos</th>
                  <th className="text-right px-4 py-2">Clientes</th>
                  <th className="text-right px-4 py-2">Ticket Médio</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  : colabs.map((c: any, i: number) => (
                      <tr key={c.colaboradorId} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{c.colaboradorNome}</td>
                        <td className="px-4 py-2">
                          {isAdmin ? (
                            <Select
                              value={c.tipoColaborador || "nenhum"}
                              onValueChange={v => updateTipo.mutate({ colaboradorId: c.colaboradorId, orgId: org!.id, tipoColaborador: v as any })}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="barbeiro">Barbeiro</SelectItem>
                                <SelectItem value="recepcao">Recepção</SelectItem>
                                <SelectItem value="nenhum">Nenhum</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-xs">{c.tipoColaborador || "—"}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-green-400 font-semibold">{fmt(c.faturamento)}</td>
                        <td className="px-4 py-2 text-right">{c.atendimentos.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right">{c.clientes.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right">{fmt(c.ticketMedio)}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
