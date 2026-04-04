/**
 * FaturamentoPage.tsx — Faturamento Detalhado
 * Resumo Executivo + Tabela Comparativa + Composição + Top Barbeiros + Top Itens
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, TrendingDown, Minus, Users, Package, Scissors, Zap, AlertCircle, RefreshCw } from "lucide-react";
import { AberturasChart } from "./AberturasChart";
import { Button } from "@/components/ui/button";

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function fmtFull(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pos = value >= 0;
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 whitespace-nowrap ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function ProgressBar({ pct, color = "bg-yellow-400" }: { pct: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function ResumoCard({ label, value, icon: Icon, highlight = false }: { label: string; value: number; icon: any; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? "bg-yellow-500/10 border-yellow-500/30" : "bg-white/5 border-white/10"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${highlight ? "text-yellow-400" : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${highlight ? "text-yellow-400" : "text-foreground"}`}>{fmt(value)}</p>
    </div>
  );
}

export default function FaturamentoPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const periodos = useMemo(() => {
    const list = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      list.push({ val, label: `${MESES_LABEL[d.getMonth()]} ${d.getFullYear()}` });
    }
    return list;
  }, []);

  const q = trpc.dataVip.faturamentoDetalhado.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, periodo },
    { enabled: !!org?.id, retry: 1 }
  );

  const d = q.data;
  const isLoading = q.isLoading;
  const isError = q.isError;

  const [ano, mes] = periodo.split("-").map(Number);
  const periodoLabel = `${MESES_FULL[mes - 1]} ${ano}`;

  // Formata intervalo de datas para exibir nos cabeçalhos da tabela comparativa
  const MESES_ABREV = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  function fmtIntervalo(inicio: Date, fim: Date): string {
    const d1 = inicio.getDate().toString().padStart(2, "0");
    const m1 = MESES_ABREV[inicio.getMonth()];
    const d2 = fim.getDate().toString().padStart(2, "0");
    const m2 = MESES_ABREV[fim.getMonth()];
    const y2 = fim.getFullYear();
    if (inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === fim.getFullYear()) {
      return `${d1} ${m1} – ${d2} ${m1} ${y2}`;
    }
    return `${d1} ${m1} – ${d2} ${m2} ${y2}`;
  }

  // Datas de cada coluna comparativa
  const dtAtualInicio = new Date(ano, mes - 1, 1);
  const dtAtualFim = new Date(ano, mes, 0);
  const dtPerAntInicio = new Date(ano, mes - 2, 1);
  const dtPerAntFim = new Date(ano, mes - 1, 0);
  const dtAnoAntInicio = new Date(ano - 1, mes - 1, 1);
  const dtAnoAntFim = new Date(ano - 1, mes, 0);
  const dtMed6Inicio = new Date(ano, mes - 7, 1);
  const dtMed6Fim = new Date(ano, mes - 1, 0);
  const dtMed12Inicio = new Date(ano, mes - 13, 1);
  const dtMed12Fim = new Date(ano, mes - 1, 0);

  const labelAtual = fmtIntervalo(dtAtualInicio, dtAtualFim);
  const labelPerAnt = fmtIntervalo(dtPerAntInicio, dtPerAntFim);
  const labelAnoAnt = fmtIntervalo(dtAnoAntInicio, dtAnoAntFim);
  const labelMed6 = `${MESES_ABREV[dtMed6Inicio.getMonth()]} ${dtMed6Inicio.getFullYear()} – ${MESES_ABREV[dtMed6Fim.getMonth()]} ${dtMed6Fim.getFullYear()}`;
  const labelMed12 = `${MESES_ABREV[dtMed12Inicio.getMonth()]} ${dtMed12Inicio.getFullYear()} – ${MESES_ABREV[dtMed12Fim.getMonth()]} ${dtMed12Fim.getFullYear()}`;

  const composicaoExemplos: Record<string, string> = {
    "Serviço Base": "Corte, Barba, Corte Infantil...",
    "Serviço Extra": "Black Mask, Hidratação, Sobrancelha...",
    "Prod. Cabelo": "Cera, Pomada, Shampoo, Finalizador...",
    "Prod. Barba": "Balm, Óleo de Barba, Creme...",
    "Prod. Empório": "Bebidas, Petiscos, Acessórios...",
    "Prod. Outros": "Produtos sem categoria...",
    "Outros": "Acessórios, Outros...",
  };

  const composicaoCores: Record<string, string> = {
    "Serviço Base": "bg-yellow-400",
    "Serviço Extra": "bg-blue-400",
    "Prod. Cabelo": "bg-emerald-400",
    "Prod. Barba": "bg-orange-400",
    "Prod. Empório": "bg-pink-400",
    "Prod. Outros": "bg-gray-400",
    "Outros": "bg-slate-400",
  };

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Banco de dados temporariamente indisponível</p>
            <p className="text-xs mt-1 text-yellow-300/80">O sistema está reconectando automaticamente. Aguarde alguns instantes e tente novamente.</p>
          </div>
          <Button size="sm" variant="outline" className="border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20 shrink-0" onClick={() => q.refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-yellow-400" />
            Faturamento — Detalhamento
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {periodoLabel}
          </p>
        </div>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value)}
          className="text-sm bg-muted border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
        >
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      {/* Resumo Executivo */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5 text-yellow-400" /> Resumo Executivo
          {!isLoading && d && (
            <span className="font-normal normal-case">
              · {d.dataInicio?.slice(8,10)}/{d.dataInicio?.slice(5,7)}/{d.dataInicio?.slice(0,4)} → {d.dataFim?.slice(8,10)}/{d.dataFim?.slice(5,7)}/{d.dataFim?.slice(0,4)}
            </span>
          )}
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ResumoCard label="Total Geral" value={d?.resumo.total ?? 0} icon={DollarSign} highlight />
            <ResumoCard label="Fat. Base" value={d?.resumo.fatBase ?? 0} icon={Scissors} />
            <ResumoCard label="Extras" value={d?.resumo.fatExtra ?? 0} icon={Zap} />
            <ResumoCard label="Produtos" value={d?.resumo.fatProdutos ?? 0} icon={Package} />
            <ResumoCard label="Outros" value={d?.resumo.fatOutros ?? 0} icon={Minus} />
          </div>
        )}
      </section>

      {/* Tabela Comparativa */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Comparativo de Períodos</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium min-w-[120px]">Categoria</th>
                  <th className="text-right px-4 py-3 min-w-[110px]">
                    <div className="text-yellow-400 font-semibold">Atual</div>
                    <div className="text-yellow-400/70 font-normal text-[10px] mt-0.5">{labelAtual}</div>
                  </th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium min-w-[100px]">
                    <div>Per. Anterior</div>
                    <div className="text-muted-foreground/70 font-normal text-[10px] mt-0.5">{labelPerAnt}</div>
                  </th>
                  <th className="px-2 py-3 min-w-[70px]"></th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium min-w-[100px]">
                    <div>Ano Anterior</div>
                    <div className="text-muted-foreground/70 font-normal text-[10px] mt-0.5">{labelAnoAnt}</div>
                  </th>
                  <th className="px-2 py-3 min-w-[70px]"></th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium min-w-[100px]">
                    <div>Méd. 6 meses</div>
                    <div className="text-muted-foreground/70 font-normal text-[10px] mt-0.5">{labelMed6}</div>
                  </th>
                  <th className="px-2 py-3 min-w-[70px]"></th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium min-w-[100px]">
                    <div>Méd. 12 meses</div>
                    <div className="text-muted-foreground/70 font-normal text-[10px] mt-0.5">{labelMed12}</div>
                  </th>
                  <th className="px-2 py-3 min-w-[70px]"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : d ? (() => {
                  const c = d.comparativo;
                  type CmpKey = "fatBase" | "fatExtra" | "fatProdutos" | "fatTotal" | "diasTrabalhados" | "fatPorDia";
                  const rows: { label: string; key: CmpKey; highlight: boolean; isDias?: boolean }[] = [
                    { label: "Fat. Base", key: "fatBase", highlight: false },
                    { label: "Extras", key: "fatExtra", highlight: false },
                    { label: "Produtos", key: "fatProdutos", highlight: false },
                    { label: "Total", key: "fatTotal", highlight: true },
                    { label: "Dias trab.", key: "diasTrabalhados", highlight: false, isDias: true },
                    { label: "Fat/dia trab.", key: "fatPorDia", highlight: false },
                  ];
                  const pctKeys: Record<CmpKey, string> = {
                    fatBase: "pctBase", fatExtra: "pctExtra", fatProdutos: "pctProdutos",
                    fatTotal: "pctTotal", diasTrabalhados: "pctDias", fatPorDia: "pctFatDia",
                  };
                  return rows.map(row => {
                    const pKey = pctKeys[row.key];
                    return (
                      <tr key={row.key} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${row.highlight ? "bg-yellow-500/5" : ""}`}>
                        <td className={`px-4 py-3 font-medium ${row.highlight ? "text-yellow-400" : ""}`}>{row.label}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${row.highlight ? "text-yellow-400" : ""}`}>
                          {row.isDias ? c.atual[row.key] : fmt(c.atual[row.key] as number)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.isDias ? (c.anterior as any)[row.key] : fmt((c.anterior as any)[row.key])}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <PctBadge value={(c.anterior as any)[pKey] ?? null} />
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.isDias ? (c.anoAnterior as any)[row.key] : fmt((c.anoAnterior as any)[row.key])}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <PctBadge value={(c.anoAnterior as any)[pKey] ?? null} />
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.isDias ? ((c.med6 as any)[row.key]?.toFixed?.(1) ?? (c.med6 as any)[row.key]) : fmt((c.med6 as any)[row.key])}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <PctBadge value={(c.med6 as any)[pKey] ?? null} />
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {row.isDias ? ((c.med12 as any)[row.key]?.toFixed?.(1) ?? (c.med12 as any)[row.key]) : fmt((c.med12 as any)[row.key])}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <PctBadge value={(c.med12 as any)[pKey] ?? null} />
                        </td>
                      </tr>
                    );
                  });
                })() : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Três colunas: Composição, Top Barbeiros, Top Itens */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Composição por grupo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scissors className="w-4 h-4 text-yellow-400" /> Composição (grupo)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : !d?.composicao.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : (
              d.composicao.map((c, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-yellow-400 w-5 shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.grupo}</p>
                        <p className="text-xs text-muted-foreground truncate">{composicaoExemplos[c.grupo] ?? ""}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmtFull(c.total)}</p>
                      <p className="text-xs text-muted-foreground">{c.pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  <ProgressBar pct={c.pct} color={composicaoCores[c.grupo] ?? "bg-gray-400"} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Barbeiros */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-yellow-400" /> Ranking Colaboradores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : !d?.topBarbeiros.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : (
              d.topBarbeiros.map((b, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-yellow-400 w-5 shrink-0">#{i + 1}</span>
                      <p className="text-sm font-medium truncate">{b.nome}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmtFull(b.faturamento)}</p>
                      <p className="text-xs text-muted-foreground">{b.pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  <ProgressBar pct={b.pct} color="bg-yellow-400" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Itens */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-yellow-400" /> Top Itens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : !d?.topItens.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : (
              d.topItens.slice(0, 12).map((item, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-yellow-400 w-5 shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">{item.grupo}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmtFull(item.total)}</p>
                      <p className="text-xs text-muted-foreground">{item.pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  <ProgressBar
                    pct={item.pct}
                    color={item.grupo === "Serviço Base" ? "bg-yellow-400" : item.grupo === "Serviço Extra" ? "bg-blue-400" : "bg-purple-400"}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bloco Aberturas */}
      {d && d.dataInicio && d.dataFim &&
        typeof d.dataInicio === "string" && d.dataInicio.length >= 7 &&
        typeof d.dataFim === "string" && d.dataFim.length >= 7 && (
        <AberturasChart
          orgId={org?.id}
          unitId={selectedUnit?.id}
          dataInicio={d.dataInicio}
          dataFim={d.dataFim}
        />
      )}
    </div>
  );
}
