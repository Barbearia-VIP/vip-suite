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
import { DollarSign, TrendingUp, TrendingDown, Minus, Users, Package, Scissors, Zap, CalendarDays } from "lucide-react";
import { AberturasChart } from "./AberturasChart";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { useChartTheme } from "../../hooks/useChartTheme";

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
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

function ProgressBar({ pct, color = "oklch(0.76 0.145 72)" }: { pct: number; color?: string }) {
  const ct = useChartTheme();
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: ct.isDark ? "oklch(0.22 0.014 260 / 0.5)" : "oklch(0.88 0.006 260 / 0.6)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function ResumoCard({ label, value, icon: Icon, highlight = false }: { label: string; value: number; icon: any; highlight?: boolean }) {
  const ct = useChartTheme();
  const ambar = "oklch(0.76 0.145 72)";
  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: highlight
          ? "linear-gradient(135deg, oklch(0.76 0.145 72 / 0.12) 0%, oklch(0.68 0.16 65 / 0.06) 100%)"
          : ct.cardBg,
        border: `1px solid ${highlight ? "oklch(0.76 0.145 72 / 0.3)" : ct.border.replace("1px solid ", "")}`,
        boxShadow: highlight ? `0 4px 20px -4px oklch(0.76 0.145 72 / 0.15)` : "none",
      }}
    >
      {highlight && (
        <div className="absolute top-0 right-0 w-16 h-16 rounded-full pointer-events-none"
          style={{ background: ambar, filter: "blur(24px)", opacity: 0.08, transform: "translate(30%, -30%)" }} />
      )}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: highlight ? ambar : "oklch(0.50 0.01 260)" }} />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color: highlight ? ambar : ct.textForeground }}>{fmt(value)}</p>
    </div>
  );
}

function ResumoCardDias({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  const ct = useChartTheme();
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: ct.cardBg,
        border: ct.border,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value} <span className="text-sm font-normal text-muted-foreground">dias</span></p>
    </div>
  );
}

export default function FaturamentoPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const now = new Date();
  const ct = useChartTheme();
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
    { enabled: !!org?.id }
  );

  const d = q.data;
  const isTimeoutRetrying = q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3;
  const isLoading = q.isLoading || isTimeoutRetrying;
  const isError = q.isError && !isTimeoutRetrying;

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
    "Serviço Base": "oklch(0.76 0.145 72)",
    "Serviço Extra": "oklch(0.65 0.15 200)",
    "Prod. Cabelo": "oklch(0.72 0.16 145)",
    "Prod. Barba": "oklch(0.72 0.14 50)",
    "Prod. Empório": "oklch(0.65 0.15 320)",
    "Prod. Outros": "oklch(0.50 0.01 260)",
    "Outros": ct.textMuted,
  };

  if (isLoading) {
    return <DataVipLoadingState rows={4} message="Carregando dados de faturamento..." attempt={(q.failureCount ?? 0) + 1} />;
  }
   if (isError) {
    return <DataVipErrorState onRetry={() => q.refetch()} />;
  }
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
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
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{
            background: ct.cardBgMuted,
            border: ct.border,
            color: ct.textForeground,
          }}
        >
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      {/* Resumo Executivo */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2 font-display">
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
            <ResumoCardDias label="Dias Trabalhados" value={d?.resumo.diasTrabalhados ?? 0} icon={CalendarDays} />
          </div>
        )}
      </section>

      {/* Tabela Comparativa */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-display">Comparativo de Períodos</h2>
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: ct.cardBg,
            border: ct.border,
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: ct.border, background: ct.cardBgMuted }}>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium min-w-[120px]">Categoria</th>
                  <th className="text-right px-4 py-3 min-w-[110px]">
                    <div className="font-semibold" style={{ color: "oklch(0.76 0.145 72)" }}>Atual</div>
                    <div className="font-normal text-[10px] mt-0.5" style={{ color: "oklch(0.76 0.145 72 / 0.7)" }}>{labelAtual}</div>
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
                      <tr
                        key={row.key}
                        className="transition-colors"
                        style={{
                          borderBottom: ct.borderSubtle,
                          background: row.highlight ? "oklch(0.76 0.145 72 / 0.06)" : "transparent",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = row.highlight ? "oklch(0.76 0.145 72 / 0.1)" : ct.cardBgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = row.highlight ? "oklch(0.76 0.145 72 / 0.06)" : "transparent")}
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: row.highlight ? "oklch(0.76 0.145 72)" : undefined }}>{row.label}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: row.highlight ? "oklch(0.76 0.145 72)" : undefined }}>
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
        </div>
      </section>

      {/* Três colunas: Composição, Top Barbeiros, Top Itens */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Composição por grupo */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: ct.cardBg,
            border: ct.border,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Scissors className="w-4 h-4" style={{ color: "oklch(0.76 0.145 72)" }} />
            <h3 className="text-sm font-semibold text-foreground">Composição (grupo)</h3>
          </div>
          <div className="animate-fade-in space-y-4">
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
          </div>
        </div>

        {/* Top Barbeiros */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: ct.cardBg,
            border: ct.border,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: "oklch(0.76 0.145 72)" }} />
            <h3 className="text-sm font-semibold text-foreground">Ranking Colaboradores</h3>
          </div>
          <div className="space-y-4">
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
                  <ProgressBar pct={b.pct} color="oklch(0.76 0.145 72)" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Itens */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: ct.cardBg,
            border: ct.border,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4" style={{ color: "oklch(0.76 0.145 72)" }} />
            <h3 className="text-sm font-semibold text-foreground">Top Itens</h3>
          </div>
          <div className="space-y-4">
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
                    color={item.grupo === "Serviço Base" ? "oklch(0.76 0.145 72)" : item.grupo === "Serviço Extra" ? "oklch(0.65 0.15 200)" : "oklch(0.65 0.15 280)"}
                  />
                </div>
              ))
            )}
          </div>
        </div>
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
