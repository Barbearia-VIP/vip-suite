/**
 * ComissoesPage.tsx — Cálculo de comissões por colaborador
 * Layout: cards por colaborador com breakdown S.Base / S.Extra / Produtos
 * Percentuais gerenciados na aba Colaboradores
 * Faixas progressivas gerenciadas na aba Metas → Comissão Progressiva
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker, buildPeriodos, type DateFilter } from "@/components/ui/DateRangePicker";
import { DollarSign, Calendar, TrendingUp, Users, Scissors, Package, Star } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

// Dado um valor de serviços e lista de faixas, retorna a faixa atingida
function getFaixaAtingida(faixas: any[], valorServicos: number) {
  if (!faixas || faixas.length === 0) return null;
  const sorted = [...faixas].sort((a, b) => b.valorMinServicos - a.valorMinServicos);
  return sorted.find(f => valorServicos >= f.valorMinServicos) ?? null;
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
  const periodos = useMemo(() => buildPeriodos(24), []);

  const queryParams = useMemo(() => {
    if (filter.mode === "range") {
      return { orgId: org?.id, unitId: selectedUnit?.id, dataInicio: filter.dataInicio, dataFim: filter.dataFim };
    }
    return { orgId: org?.id, unitId: selectedUnit?.id, periodo: filter.periodo };
  }, [filter, org?.id, selectedUnit?.id]);

  const q = trpc.dataVip.comissoes.useQuery(queryParams, { enabled: !!org?.id });

  // Busca faixas de meta da unidade selecionada
  const faixasQ = trpc.dataVip.metaFaixasList.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id },
    { enabled: !!org?.id && !!selectedUnit?.id }
  );
  const faixas = faixasQ.data ?? [];

  const colabs = q.data ?? [];

  const totalFat = colabs.reduce((s, c) => s + c.faturamento, 0);
  const totalComissoes = colabs.reduce((s, c) => s + c.comissao, 0);
  // Se há faixas, recalcula o total de comissões considerando o bônus de meta
  const totalComissoesComMeta = useMemo(() => {
    if (faixas.length === 0) return totalComissoes;
    return colabs.reduce((s, c) => {
      const faixaAtingida = getFaixaAtingida(faixas, c.servicosBaseValor + c.extraValor);
      if (!faixaAtingida) return s + c.comissao;
      // Recalcula comissão de serviços com o percentual da faixa
      const comissaoServFaixa = (c.servicosBaseValor + c.extraValor) * (faixaAtingida.pctComissao / 100);
      return s + comissaoServFaixa + c.comissaoProdutos;
    }, 0);
  }, [colabs, faixas, totalComissoes]);

  const pctMedio = totalFat > 0 ? (totalComissoesComMeta / totalFat) * 100 : 0;
  const isRangeMode = filter.mode === "range";
  const temFaixas = faixas.length > 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-orange-400" /> Comissões
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {colabs.length} colaboradores
            {isAdmin && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                — Percentuais na aba <strong>Colaboradores</strong> · Faixas na aba <strong>Metas</strong>
              </span>
            )}
          </p>
        </div>
        <DateRangePicker
          filter={filter}
          onFilterChange={setFilter}
          periodos={periodos}
          align="end"
        />
      </div>

      {/* Badge modo range */}
      {isRangeMode && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Calendar className="w-3 h-3" />
            Período personalizado — dados em tempo real
          </Badge>
        </div>
      )}

      {/* Badge faixas ativas */}
      {temFaixas && (
        <div className="flex items-center gap-2">
          <Badge className="text-xs gap-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Star className="w-3 h-3" />
            {faixas.length} faixas de comissão progressiva ativas
          </Badge>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" /> Faturamento
            </p>
            {q.isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : (
              <p className="text-xl font-bold mt-1 text-green-400">{fmt(totalFat)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" /> Comissões
            </p>
            {q.isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : (
              <p className="text-xl font-bold mt-1 text-orange-400">{fmt(totalComissoesComMeta)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" /> % Médio
            </p>
            {q.isLoading ? <Skeleton className="h-7 w-20 mt-1" /> : (
              <p className="text-xl font-bold mt-1">{fmtPct(pctMedio)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Colaboradores
            </p>
            {q.isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : (
              <>
                <p className="text-xl font-bold mt-1">{colabs.length}</p>
                {totalFat > 0 && colabs.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Média: {fmt(totalFat / colabs.length)}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cards por colaborador */}
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : colabs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhum dado encontrado para o período selecionado
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {colabs.map((c: any, i: number) => {
            const rank = i + 1;
            const rankColor = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-muted-foreground";
            const fatDia = c.diasTrabalhados > 0 ? c.faturamentoDia : 0;

            // Calcula faixa atingida para este colaborador
            const valorServicos = c.servicosBaseValor + c.extraValor;
            const faixaAtingida = temFaixas ? getFaixaAtingida(faixas, valorServicos) : null;
            const pctFaixa = faixaAtingida ? faixaAtingida.pctComissao : null;

            // Recalcula comissão de serviços com a faixa (se houver)
            const pctServicosEfetivo = pctFaixa ?? c.percentual;
            const comissaoServFaixa = temFaixas && faixaAtingida
              ? valorServicos * (faixaAtingida.pctComissao / 100)
              : c.comissaoServicosBase + c.comissaoServicosExtra;
            const comissaoTotalEfetiva = comissaoServFaixa + c.comissaoProdutos;

            // Próxima faixa
            const proxFaixa = temFaixas
              ? [...faixas].sort((a, b) => a.valorMinServicos - b.valorMinServicos).find(f => f.valorMinServicos > valorServicos)
              : null;

            return (
              <Card key={c.colaboradorId} className={`border-border/60 ${faixaAtingida ? "ring-1 ring-amber-500/20" : ""}`}>
                <CardContent className="p-4 space-y-3">
                  {/* Header do card */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${rankColor}`}>{rank}°</span>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{c.colaboradorNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.diasTrabalhados > 0 ? `${c.diasTrabalhados} dias` : "—"}
                        </p>
                      </div>
                    </div>
                    {fatDia > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Fat/dia</p>
                        <p className="text-sm font-semibold text-green-400">{fmt(fatDia)}</p>
                      </div>
                    )}
                  </div>

                  {/* Faixa de meta atingida */}
                  {temFaixas && (
                    <div className={`rounded-md px-2.5 py-1.5 text-xs flex items-center justify-between ${faixaAtingida ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted/40 border border-border/40"}`}>
                      <span className={faixaAtingida ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                        {faixaAtingida
                          ? `🏆 ${faixaAtingida.descricao || `Faixa ${faixaAtingida.pctComissao}%`}`
                          : "Sem faixa atingida"}
                      </span>
                      {proxFaixa && (
                        <span className="text-muted-foreground text-[10px]">
                          Próx: {fmt(proxFaixa.valorMinServicos - valorServicos)} p/ {proxFaixa.pctComissao}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Faturamento total */}
                  <div className="flex justify-between text-sm border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Faturamento</span>
                    <span className="font-semibold text-green-400">{fmt(c.faturamento)}</span>
                  </div>

                  {/* Breakdown comissões */}
                  <div className="space-y-1.5">
                    {/* S. Base */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Scissors className="w-3 h-3 text-blue-400" /> S. Base
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{fmt(c.servicosBaseValor)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={c.comissaoServicosBase > 0 ? "text-orange-400 font-semibold" : "text-muted-foreground"}>
                          {fmt(temFaixas && faixaAtingida
                            ? c.servicosBaseValor * (faixaAtingida.pctComissao / 100)
                            : c.comissaoServicosBase)}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${temFaixas && faixaAtingida ? "border-amber-500/50 text-amber-400" : ""}`}>
                          {pctServicosEfetivo}%
                        </Badge>
                      </div>
                    </div>

                    {/* S. Extra */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Scissors className="w-3 h-3 text-purple-400" /> S. Extra
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{fmt(c.extraValor)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={c.comissaoServicosExtra > 0 ? "text-orange-400 font-semibold" : "text-muted-foreground"}>
                          {fmt(temFaixas && faixaAtingida
                            ? c.extraValor * (faixaAtingida.pctComissao / 100)
                            : c.comissaoServicosExtra)}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${temFaixas && faixaAtingida ? "border-amber-500/50 text-amber-400" : ""}`}>
                          {pctServicosEfetivo}%
                        </Badge>
                      </div>
                    </div>

                    {/* Produtos */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Package className="w-3 h-3 text-amber-400" /> Produtos
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{fmt(c.produtosValor)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={c.comissaoProdutos > 0 ? "text-orange-400 font-semibold" : "text-muted-foreground"}>
                          {fmt(c.comissaoProdutos)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {c.pctComissaoProdutos}%
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Total comissão */}
                  <div className="flex justify-between items-center pt-1 border-t border-border/40">
                    <span className="text-sm text-muted-foreground">
                      Total Comissão{" "}
                      <span className="text-xs">
                        ({c.faturamento > 0 ? fmtPct((comissaoTotalEfetiva / c.faturamento) * 100) : "0.0%"})
                      </span>
                    </span>
                    <span className={`text-base font-bold ${comissaoTotalEfetiva > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                      {fmt(comissaoTotalEfetiva)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Nota sobre edição */}
      {isAdmin && (
        <p className="text-xs text-muted-foreground text-center">
          Para editar os percentuais base, acesse <strong>Colaboradores</strong>. Para configurar faixas progressivas, acesse <strong>Metas → Comissão Progressiva</strong>.
        </p>
      )}
    </div>
  );
}
