/**
 * ComissoesPage.tsx — Cálculo de comissões por barbeiro
 * Suporta filtro por mês ou período personalizado via DateRangePicker
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker, buildPeriodos, type DateFilter } from "@/components/ui/DateRangePicker";
import { toast } from "sonner";
import { DollarSign, Calendar } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ComissoesPage() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();

  const [filter, setFilter] = useState<DateFilter>({
    mode: "month",
    periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  });
  const [editPct, setEditPct] = useState<Record<string, number>>({});

  const periodos = useMemo(() => buildPeriodos(24), []);

  // Parâmetros para a query
  const queryParams = useMemo(() => {
    if (filter.mode === "range") {
      return { orgId: org?.id, unitId: selectedUnit?.id, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    return { orgId: org?.id, unitId: selectedUnit?.id, periodo: filter.periodo };
  }, [filter, org?.id, selectedUnit?.id]);

  const q = trpc.dataVip.comissoes.useQuery(queryParams, { enabled: !!org?.id });
  const utils = trpc.useUtils();
  const saveRegra = trpc.dataVip.saveRegrasComissao.useMutation({
    onSuccess: () => { toast.success("Regra de comissão salva"); utils.dataVip.comissoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const colabs = q.data ?? [];
  const totalComissoes = colabs.reduce((s, c) => s + c.comissao, 0);
  const totalFat = colabs.reduce((s, c) => s + c.faturamento, 0);
  const isRangeMode = filter.mode === "range";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-orange-400" /> Comissões
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"}
          </p>
        </div>
        <DateRangePicker
          filter={filter}
          onFilterChange={setFilter}
          periodos={periodos}
          align="end"
        />
      </div>

      {/* Badge de modo range */}
      {isRangeMode && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Calendar className="w-3 h-3" />
            Período personalizado — dados em tempo real da tabela de vendas
          </Badge>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Faturamento (Barbeiros)</p>
            {q.isLoading
              ? <Skeleton className="h-7 w-32 mt-1" />
              : <p className="text-xl font-bold mt-1">{fmt(totalFat)}</p>
            }
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Comissões</p>
            {q.isLoading
              ? <Skeleton className="h-7 w-32 mt-1" />
              : <p className="text-xl font-bold mt-1 text-orange-400">{fmt(totalComissoes)}</p>
            }
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
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
                  {isAdmin && !isRangeMode && <th className="text-center px-4 py-2">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={isAdmin && !isRangeMode ? 6 : 5} className="px-4 py-2">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : colabs.length === 0
                    ? (
                      <tr>
                        <td colSpan={isAdmin && !isRangeMode ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Nenhum dado encontrado para o período selecionado
                        </td>
                      </tr>
                    )
                    : colabs.map((c: any) => (
                        <tr key={c.colaboradorId} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{c.colaboradorNome}</td>
                          <td className="px-4 py-2 text-right text-green-400">{fmt(c.faturamento)}</td>
                          <td className="px-4 py-2 text-right">{c.atendimentos.toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-2 text-right">
                            {isAdmin && !isRangeMode ? (
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
                          {isAdmin && !isRangeMode && (
                            <td className="px-4 py-2 text-center">
                              {editPct[c.colaboradorId] !== undefined && editPct[c.colaboradorId] !== c.percentual && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => saveRegra.mutate({
                                    orgId: org!.id,
                                    colaboradorId: c.colaboradorId,
                                    percentual: editPct[c.colaboradorId],
                                  })}
                                >
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

      {/* Nota sobre edição de percentuais */}
      {isRangeMode && isAdmin && (
        <p className="text-xs text-muted-foreground text-center">
          A edição de percentuais de comissão está disponível apenas no modo de seleção por mês.
        </p>
      )}
    </div>
  );
}
