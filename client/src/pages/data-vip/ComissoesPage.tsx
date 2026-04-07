/**
 * ComissoesPage.tsx — Cálculo de comissões por colaborador
 * Layout: cards por colaborador com breakdown S.Base / S.Extra / Produtos / Bônus Meta / Bônus Dinâmico
 * Percentuais gerenciados na aba Colaboradores
 * Faixas progressivas gerenciadas na aba Metas → Comissão Progressiva
 * Metas dinâmicas gerenciadas na aba Metas → Meta Dinâmica
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
import { DollarSign, Calendar, TrendingUp, Users, Scissors, Package, Star, Trophy, Zap } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return `${Number(v).toFixed(1)}%`;
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

  // Calcular mês/ano para metaDinamicaCalc (só funciona em modo "month")
  const mesDinamicoParams = useMemo(() => {
    if (!selectedUnit?.id || !org?.id) return null;
    if (filter.mode === "range") return null; // metas dinâmicas só para mês completo
    const [ano, mes] = (filter.periodo ?? "").split("-").map(Number);
    if (!ano || !mes) return null;
    return { unitId: selectedUnit.id, orgId: org.id, mes, ano };
  }, [filter, selectedUnit?.id, org?.id]);

  const q = trpc.dataVip.comissoes.useQuery(queryParams, { enabled: !!org?.id });

  // Query de bônus dinâmicos (por colaborador, para o mês selecionado)
  const qDinamico = trpc.dataVip.metaDinamicaCalc.useQuery(
    mesDinamicoParams!,
    { enabled: !!mesDinamicoParams }
  );

  const colabs = q.data ?? [];
  const bonusDinamicoMap = useMemo(() => {
    const map: Record<string, { bonusTotal: number; metasBatidas: { nome: string; bonus: number }[] }> = {};
    for (const item of (qDinamico.data ?? [])) {
      map[String(item.colaboradorId)] = {
        bonusTotal: Number(item.bonusTotal ?? 0),
        metasBatidas: item.metasBatidas ?? [],
      };
    }
    return map;
  }, [qDinamico.data]);

  const totalFat = colabs.reduce((s, c) => s + c.faturamento, 0);
  const totalComissoes = colabs.reduce((s, c) => {
    const bonusDin = Number(bonusDinamicoMap[String(c.colaboradorId)]?.bonusTotal ?? 0);
    return s + c.comissao + bonusDin;
  }, 0);
  const totalBonus = colabs.reduce((s, c) => s + (c.bonusMeta ?? 0), 0);
  const totalBonusDinamico = Object.values(bonusDinamicoMap).reduce((s, b) => s + b.bonusTotal, 0);
  const pctMedio = totalFat > 0 ? (totalComissoes / totalFat) * 100 : 0;
  const isRangeMode = filter.mode === "range";
  const temBonus = totalBonus > 0;
  const temBonusDinamico = totalBonusDinamico > 0;

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
                — Percentuais na aba <strong>Colaboradores</strong> · Faixas e Metas na aba <strong>Metas</strong>
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

      {/* Badges de contexto */}
      <div className="flex flex-wrap items-center gap-2">
        {isRangeMode && (
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Calendar className="w-3 h-3" />
            Período personalizado — dados em tempo real
          </Badge>
        )}
        {temBonus && (
          <Badge className="text-xs gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Trophy className="w-3 h-3" />
            Bônus progressivo — {fmt(totalBonus)} no período
          </Badge>
        )}
        {temBonusDinamico && (
          <Badge className="text-xs gap-1.5 bg-green-500/20 text-green-400 border border-green-500/30">
            <Zap className="w-3 h-3" />
            Bônus dinâmico — {fmt(totalBonusDinamico)} no período
          </Badge>
        )}
        {!selectedUnit && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Star className="w-3 h-3 mr-1" />
            Selecione uma unidade para ver bônus de meta
          </Badge>
        )}
      </div>

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
              <>
                <p className="text-xl font-bold mt-1 text-orange-400">{fmt(totalComissoes)}</p>
                {(temBonus || temBonusDinamico) && (
                  <p className="text-[10px] text-amber-400 mt-0.5">
                    incl. {fmt(totalBonus + totalBonusDinamico)} de bônus
                  </p>
                )}
              </>
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
            const bonusMeta = Number(c.bonusMeta ?? 0);
            const pctBonus = Number(c.pctBonus ?? 0);
            const pctFaixaMeta = Number(c.pctFaixaMeta ?? 0);
            const temFaixaAtingida = pctFaixaMeta > 0 && pctBonus > 0;

            // Bônus dinâmico para este colaborador
            const dinInfo = bonusDinamicoMap[String(c.colaboradorId)];
            const bonusDinamico = dinInfo ? dinInfo.bonusTotal : 0;
            const metasBatidas = dinInfo ? dinInfo.metasBatidas : [];
            const temBonusDin = bonusDinamico > 0;

            // Total final incluindo bônus dinâmico
            const comissaoFinal = c.comissao + bonusDinamico;

            return (
              <Card key={c.colaboradorId} className={`border-border/60 ${temFaixaAtingida || temBonusDin ? "ring-1 ring-amber-500/30" : ""}`}>
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

                  {/* Badge de faixa atingida (meta progressiva) */}
                  {temFaixaAtingida && (
                    <div className="rounded-md px-2.5 py-1.5 text-xs flex items-center justify-between bg-amber-500/10 border border-amber-500/30">
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        Meta progressiva — {pctFaixaMeta}% sobre serviços
                      </span>
                      <span className="text-amber-300 font-semibold">{fmt(bonusMeta)}</span>
                    </div>
                  )}

                  {/* Badge de metas dinâmicas batidas */}
                  {temBonusDin && metasBatidas.map((mb, idx) => (
                    <div key={idx} className="rounded-md px-2.5 py-1.5 text-xs flex items-center justify-between bg-green-500/10 border border-green-500/30">
                      <span className="text-green-400 font-medium flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {mb.nome}
                      </span>
                      <span className="text-green-300 font-semibold">{fmt(mb.bonus)}</span>
                    </div>
                  ))}

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
                          {fmt(c.comissaoServicosBase)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {c.percentual}%
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
                          {fmt(c.comissaoServicosExtra)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {c.percentual}%
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

                    {/* Bônus de Meta Progressiva (só mostra se houver bônus) */}
                    {bonusMeta > 0 && (
                      <div className="flex items-center justify-between text-xs bg-amber-500/5 rounded px-1.5 py-1 border border-amber-500/20">
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <Trophy className="w-3 h-3" /> Bônus Progressivo
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{fmt(c.totalServicos)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-amber-400 font-semibold">{fmt(bonusMeta)}</span>
                          <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                            +{pctBonus.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Bônus Dinâmico (linha por meta batida) */}
                    {temBonusDin && (
                      <div className="flex items-center justify-between text-xs bg-green-500/5 rounded px-1.5 py-1 border border-green-500/20">
                        <span className="flex items-center gap-1.5 text-green-400">
                          <Zap className="w-3 h-3" /> Bônus Dinâmico
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-semibold">{fmt(bonusDinamico)}</span>
                          <Badge className="text-[10px] px-1 py-0 h-4 bg-green-500/20 text-green-400 border-green-500/30">
                            {metasBatidas.length} meta{metasBatidas.length > 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Total comissão */}
                  <div className="flex justify-between items-center pt-1 border-t border-border/40">
                    <span className="text-sm text-muted-foreground">
                      Total Comissão{" "}
                      <span className="text-xs">
                        ({c.faturamento > 0 ? fmtPct((comissaoFinal / c.faturamento) * 100) : "0.0%"})
                      </span>
                    </span>
                    <span className={`text-base font-bold ${comissaoFinal > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                      {fmt(comissaoFinal)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Aviso quando não há unidade selecionada */}
      {!selectedUnit && !q.isLoading && colabs.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-400 flex items-center gap-2">
            <Star className="w-4 h-4 flex-shrink-0" />
            Selecione uma unidade específica para ativar o cálculo de bônus de meta progressiva e dinâmica.
          </CardContent>
        </Card>
      )}

      {/* Aviso quando em modo range (metas dinâmicas não disponíveis) */}
      {isRangeMode && selectedUnit && !q.isLoading && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4 text-sm text-blue-400 flex items-center gap-2">
            <Zap className="w-4 h-4 flex-shrink-0" />
            Bônus de metas dinâmicas disponível apenas para períodos mensais completos.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
