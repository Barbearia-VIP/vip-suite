/**
 * ColaboradoresPage.tsx — Gestão de colaboradores com tipo, performance e comissões
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker, buildPeriodos, type DateFilter } from "@/components/ui/DateRangePicker";
import { toast } from "sonner";
import { Scissors, Calendar, Save } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ColaboradoresPage() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();

  const [filter, setFilter] = useState<DateFilter>({
    mode: "month",
    periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  });

  // Estado de edição de comissões por colaborador
  const [editComissao, setEditComissao] = useState<Record<string, { pctServicos?: number; pctProdutos?: number }>>({});

  const periodos = useMemo(() => buildPeriodos(24), []);

  const queryParams = useMemo(() => {
    if (filter.mode === "range") {
      return { orgId: org?.id, unitId: selectedUnit?.id, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    return { orgId: org?.id, unitId: selectedUnit?.id, periodo: filter.periodo };
  }, [filter, org?.id, selectedUnit?.id]);

  const q = trpc.dataVip.colaboradores.useQuery(queryParams, { enabled: !!org?.id });
  // Query de comissões para buscar percentuais cadastrados
  const qComissoes = trpc.dataVip.comissoes.useQuery(queryParams, { enabled: !!org?.id });

  const utils = trpc.useUtils();
  const updateTipo = trpc.dataVip.updateColaboradorTipo.useMutation({
    onSuccess: () => { toast.success("Tipo atualizado"); utils.dataVip.colaboradores.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const saveRegra = trpc.dataVip.saveRegrasComissao.useMutation({
    onSuccess: () => {
      toast.success("Comissão salva");
      utils.dataVip.comissoes.invalidate();
      utils.dataVip.colaboradores.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const colabs = q.data ?? [];
  const comissoesMap = useMemo(() => {
    const map: Record<string, { percentual: number; pctComissaoProdutos: number }> = {};
    for (const c of (qComissoes.data ?? [])) {
      map[c.colaboradorId] = { percentual: c.percentual, pctComissaoProdutos: c.pctComissaoProdutos };
    }
    return map;
  }, [qComissoes.data]);

  const isRangeMode = filter.mode === "range";
  const colSpanBase = isRangeMode ? 6 : 7;
  const colSpanTotal = isAdmin ? colSpanBase + 3 : colSpanBase; // +3 para % Serv, % Prod, Ação

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scissors className="w-6 h-6 text-pink-400" /> Colaboradores
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {colabs.length} colaboradores
          </p>
        </div>
        <DateRangePicker
          filter={filter}
          onFilterChange={setFilter}
          periodos={periodos}
          align="end"
        />
      </div>

      {/* Banner de carregando banco externo */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      {/* Badge de modo range */}
      {isRangeMode && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Calendar className="w-3 h-3" />
            Período personalizado — dados em tempo real da tabela de vendas
          </Badge>
        </div>
      )}

      {/* Tabela */}
      <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ borderBottom: "1px solid oklch(0.28 0.015 260 / 0.5)", background: "oklch(0.12 0.010 260 / 0.6)" }}>
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Nome</th>
                  {!isRangeMode && <th className="text-left px-4 py-2">Tipo</th>}
                  <th className="text-right px-4 py-2">Faturamento</th>
                  <th className="text-right px-4 py-2">Atendimentos</th>
                  <th className="text-right px-4 py-2">Clientes</th>
                  <th className="text-right px-4 py-2">Ticket Médio</th>
                  {isAdmin && (
                    <>
                      <th className="text-right px-4 py-2 text-orange-400/80">% Serviços</th>
                      <th className="text-right px-4 py-2 text-amber-400/80">% Produtos</th>
                      <th className="text-center px-4 py-2"></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={colSpanTotal} className="px-4 py-2">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : colabs.length === 0
                    ? (
                      <tr>
                        <td colSpan={colSpanTotal} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Nenhum dado encontrado para o período selecionado
                        </td>
                      </tr>
                    )
                    : colabs.map((c: any, i: number) => {
                        const regra = comissoesMap[c.colaboradorId];
                        const pctServicos = editComissao[c.colaboradorId]?.pctServicos ?? regra?.percentual ?? 0;
                        const pctProdutos = editComissao[c.colaboradorId]?.pctProdutos ?? regra?.pctComissaoProdutos ?? 0;
                        const hasChanges =
                          editComissao[c.colaboradorId]?.pctServicos !== undefined ||
                          editComissao[c.colaboradorId]?.pctProdutos !== undefined;

                        return (
                          <tr key={c.colaboradorId} className="transition-colors" style={{ borderBottom: "1px solid oklch(0.28 0.015 260 / 0.3)" }} onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.18 0.010 260 / 0.4)")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-2 font-medium">{c.colaboradorNome}</td>
                            {!isRangeMode && (
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
                            )}
                            <td className="px-4 py-2 text-right text-green-400 font-semibold">{fmt(c.faturamento)}</td>
                            <td className="px-4 py-2 text-right">{c.atendimentos.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2 text-right">{c.clientes.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2 text-right">{fmt(c.ticketMedio)}</td>
                            {isAdmin && (
                              <>
                                <td className="px-4 py-2 text-right">
                                  <Input
                                    type="number" min={0} max={100} step={1}
                                    value={pctServicos}
                                    onChange={e => setEditComissao(prev => ({
                                      ...prev,
                                      [c.colaboradorId]: { ...prev[c.colaboradorId], pctServicos: Number(e.target.value) }
                                    }))}
                                    className="h-7 text-xs w-20 text-right"
                                  />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Input
                                    type="number" min={0} max={100} step={1}
                                    value={pctProdutos}
                                    onChange={e => setEditComissao(prev => ({
                                      ...prev,
                                      [c.colaboradorId]: { ...prev[c.colaboradorId], pctProdutos: Number(e.target.value) }
                                    }))}
                                    className="h-7 text-xs w-20 text-right"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {hasChanges && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1"
                                      disabled={saveRegra.isPending}
                                      onClick={() => {
                                        saveRegra.mutate({
                                          orgId: org!.id,
                                          colaboradorId: c.colaboradorId,
                                          percentual: pctServicos,
                                          pctComissaoProdutos: pctProdutos,
                                        }, {
                                          onSuccess: () => {
                                            setEditComissao(prev => {
                                              const next = { ...prev };
                                              delete next[c.colaboradorId];
                                              return next;
                                            });
                                          }
                                        });
                                      }}
                                    >
                                      <Save className="w-3 h-3" /> Salvar
                                    </Button>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })
                }
              </tbody>
            </table>
          </div>
      </div>

      {isAdmin && (
        <p className="text-xs text-muted-foreground text-center">
          Os percentuais de comissão definidos aqui são usados automaticamente na aba <strong>Comissões</strong>.
        </p>
      )}
    </div>
  );
}
