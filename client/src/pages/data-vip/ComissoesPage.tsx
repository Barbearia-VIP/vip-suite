/**
 * ComissoesPage.tsx — Cálculo de comissões por barbeiro
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ComissoesPage() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [editPct, setEditPct] = useState<Record<string, number>>({});

  const periodos = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      list.push({ val, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    return list;
  }, []);

  const q = trpc.dataVip.comissoes.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, periodo },
    { enabled: !!org?.id }
  );
  const utils = trpc.useUtils();
  const saveRegra = trpc.dataVip.saveRegrasComissao.useMutation({
    onSuccess: () => { toast.success("Regra de comissão salva"); utils.dataVip.comissoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const colabs = q.data ?? [];
  const totalComissoes = colabs.reduce((s, c) => s + c.comissao, 0);
  const totalFat = colabs.reduce((s, c) => s + c.faturamento, 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-orange-400" /> Comissões
          </h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="text-sm bg-muted border border-border rounded px-2 py-1.5">
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Faturamento (Barbeiros)</p>
          <p className="text-xl font-bold mt-1">{fmt(totalFat)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Comissões</p>
          <p className="text-xl font-bold mt-1 text-orange-400">{fmt(totalComissoes)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">Barbeiro</th>
                  <th className="text-right px-4 py-2">Faturamento</th>
                  <th className="text-right px-4 py-2">Atendimentos</th>
                  <th className="text-right px-4 py-2">% Comissão</th>
                  <th className="text-right px-4 py-2">Comissão</th>
                  {isAdmin && <th className="text-center px-4 py-2">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  : colabs.map((c: any) => (
                      <tr key={c.colaboradorId} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{c.colaboradorNome}</td>
                        <td className="px-4 py-2 text-right text-green-400">{fmt(c.faturamento)}</td>
                        <td className="px-4 py-2 text-right">{c.atendimentos.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right">
                          {isAdmin ? (
                            <Input
                              type="number" min={0} max={100} step={1}
                              value={editPct[c.colaboradorId] ?? c.percentual}
                              onChange={e => setEditPct(prev => ({ ...prev, [c.colaboradorId]: Number(e.target.value) }))}
                              className="h-7 text-xs w-20 text-right"
                            />
                          ) : (
                            <span>{c.percentual}%</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-orange-400">{fmt(c.comissao)}</td>
                        {isAdmin && (
                          <td className="px-4 py-2 text-center">
                            {editPct[c.colaboradorId] !== undefined && editPct[c.colaboradorId] !== c.percentual && (
                              <Button size="sm" className="h-7 text-xs" onClick={() => saveRegra.mutate({ orgId: org!.id, colaboradorId: c.colaboradorId, percentual: editPct[c.colaboradorId] })}>
                                Salvar
                              </Button>
                            )}
                          </td>
                        )}
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
