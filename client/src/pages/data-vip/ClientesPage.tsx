/**
 * ClientesPage.tsx — Painel de Clientes completo (Data VIP)
 * KPIs, distribuição por status, evolução mensal, frequência, dias sem vir, Top 10.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart,
} from "recharts";
import {
  Users, UserPlus, UserCheck, CalendarDays, DollarSign,
  TrendingUp, RefreshCw, ChevronDown, ChevronUp, Star,
} from "lucide-react";

// ── Formatadores ──────────────────────────────────────────────────────────────
function fmtMoeda(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);
}
function fmtMoedaCompact(v: number) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(1)} mil`;
  return fmtMoeda(v);
}
function fmtNum(v: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string; desc: string }> = {
  assiduo:    { label: "Assíduo",   cor: "#22c55e", bg: "bg-green-500/10 border-green-500/30",   desc: "Frequência ≤ 30d" },
  regular:    { label: "Regular",   cor: "#3b82f6", bg: "bg-blue-500/10 border-blue-500/30",     desc: "31-45 dias sem vir" },
  espacando:  { label: "Espaçando", cor: "#eab308", bg: "bg-yellow-500/10 border-yellow-500/30", desc: "46-60 dias sem vir" },
  primeiraVez:{ label: "1ª Vez",    cor: "#a855f7", bg: "bg-purple-500/10 border-purple-500/30", desc: "1 visita, ≤ 30d" },
  emRisco:    { label: "Em Risco",  cor: "#f97316", bg: "bg-orange-500/10 border-orange-500/30", desc: "61-75 dias sem vir" },
  perdido:    { label: "Perdido",   cor: "#ef4444", bg: "bg-red-500/10 border-red-500/30",       desc: "> 75 dias sem vir" },
};
const STATUS_ORDEM = ["assiduo", "regular", "espacando", "primeiraVez", "emRisco", "perdido"] as const;
const FREQ_CORES   = ["#22c55e","#3b82f6","#a855f7","#f97316","#ef4444","#06b6d4","#eab308","#ec4899","#6366f1","#14b8a6","#f59e0b"];

// ── Helpers de data ───────────────────────────────────────────────────────────
interface Periodo { iniMes: number; iniAno: number; fimMes: number; fimAno: number; }

function calcPeriodo(meses: number): Periodo {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ini = new Date(fim.getFullYear(), fim.getMonth() - (meses - 1), 1);
  return { iniMes: ini.getMonth() + 1, iniAno: ini.getFullYear(), fimMes: fim.getMonth() + 1, fimAno: fim.getFullYear() };
}
function toDateStr(mes: number, ano: number, ultimo = false) {
  if (ultimo) { const d = new Date(ano, mes, 0); return `${ano}-${String(mes).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  return `${ano}-${String(mes).padStart(2,"0")}-01`;
}
function fmtPeriodo(mes: number, ano: number) { return `${MESES[mes]}/${ano}`; }

// ── Seletor de período ────────────────────────────────────────────────────────
function PeriodoSelector({ filtros, onChange }: { filtros: Periodo; onChange: (f: Periodo) => void }) {
  const [local, setLocal] = useState(filtros);
  const [open, setOpen]   = useState(false);
  const anos = useMemo(() => { const c = new Date().getFullYear(); return Array.from({ length: 5 }, (_, i) => c - i); }, []);
  const label = `${fmtPeriodo(filtros.iniMes, filtros.iniAno)} → ${fmtPeriodo(filtros.fimMes, filtros.fimAno)}`;

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm font-medium">
        <CalendarDays className="w-4 h-4 text-primary" />
        <span>{label}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl shadow-xl p-4 w-80">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Selecionar Período</p>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[3, 6, 12].map(m => (
              <button key={m} onClick={() => setLocal(calcPeriodo(m))} className="px-2 py-1 text-xs rounded-md border border-border hover:bg-accent transition-colors">{m} meses</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([
              { lbl: "Início — Mês", val: local.iniMes, set: (v: number) => setLocal(p => ({ ...p, iniMes: v })), opts: MESES.slice(1).map((n, i) => ({ v: i+1, l: n })) },
              { lbl: "Início — Ano", val: local.iniAno, set: (v: number) => setLocal(p => ({ ...p, iniAno: v })), opts: anos.map(a => ({ v: a, l: String(a) })) },
              { lbl: "Fim — Mês",    val: local.fimMes, set: (v: number) => setLocal(p => ({ ...p, fimMes: v })), opts: MESES.slice(1).map((n, i) => ({ v: i+1, l: n })) },
              { lbl: "Fim — Ano",    val: local.fimAno, set: (v: number) => setLocal(p => ({ ...p, fimAno: v })), opts: anos.map(a => ({ v: a, l: String(a) })) },
            ] as const).map((f, i) => (
              <div key={i}>
                <label className="text-xs text-muted-foreground mb-1 block">{f.lbl}</label>
                <select value={f.val} onChange={e => f.set(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                  {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={() => { onChange(local); setOpen(false); }} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">Aplicar</button>
        </div>
      )}
    </div>
  );
}

// ── Barra colorida segmentada ─────────────────────────────────────────────────
function BarraSegmentada({ itens, total, altura = "h-7" }: { itens: { label: string; valor: number; cor: string }[]; total: number; altura?: string }) {
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <div className={`flex rounded-full overflow-hidden ${altura}`}>
        {itens.map((it, i) => {
          const pct = (it.valor / total) * 100;
          if (pct < 0.3) return null;
          return (
            <div key={i} style={{ width: `${pct}%`, backgroundColor: it.cor }} className="flex items-center justify-center text-[11px] font-bold text-white" title={`${it.label}: ${fmtNum(it.valor)} (${pct.toFixed(1)}%)`}>
              {pct >= 8 ? fmtNum(it.valor) : ""}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {itens.map((it, i) => {
          const pct = (it.valor / total) * 100;
          return (
            <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: it.cor }} />
              {it.label}: {fmtNum(it.valor)} ({pct.toFixed(0)}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Badge de status ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cor: "#888" };
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: cfg.cor }}>{cfg.label}</span>;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{fmtNum(p.value)}</span></p>)}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClientesPage() {
  const { selectedUnit } = useApp();
  const { org }          = useOrg();
  const [filtros, setFiltros] = useState<Periodo>(() => calcPeriodo(12));

  const dataInicio = toDateStr(filtros.iniMes, filtros.iniAno, false);
  const dataFim    = toDateStr(filtros.fimMes, filtros.fimAno, true);
  const base       = { orgId: org?.id, unitId: selectedUnit?.id };
  const enabled    = !!(org?.id || selectedUnit?.id);

  const qKpis   = trpc.dataVip.clientesKpis.useQuery({ ...base, dataInicio, dataFim }, { enabled });
  const qStatus = trpc.dataVip.clientesDistribuicaoStatus.useQuery(base, { enabled });
  const qEvol   = trpc.dataVip.clientesEvolucaoMensal.useQuery({ ...base, dataInicio, dataFim }, { enabled });
  const qFreq   = trpc.dataVip.clientesDistribuicaoFrequencia.useQuery({ ...base, dataInicio, dataFim }, { enabled });
  const qDias   = trpc.dataVip.clientesDistribuicaoDiasSemVir.useQuery({ ...base, dataInicio, dataFim }, { enabled });
  const qTop    = trpc.dataVip.clientesTop.useQuery({ ...base, dataInicio, dataFim, limit: 10 }, { enabled });

  // Status
  const statusDados = useMemo(() => {
    const s = qStatus.data;
    if (!s) return {} as Record<string, number>;
    return { assiduo: s.assiduo, regular: s.regular, espacando: s.espacando, primeiraVez: s.primeiraVez, emRisco: s.emRisco, perdido: s.perdido };
  }, [qStatus.data]);
  const statusTotal = useMemo(() => Object.values(statusDados).reduce((a, b) => a + b, 0), [statusDados]);
  const statusItens = STATUS_ORDEM.map(k => ({ label: STATUS_CFG[k].label, valor: statusDados[k] ?? 0, cor: STATUS_CFG[k].cor }));

  // Evolução
  const evolData = useMemo(() => (qEvol.data ?? []).map(r => {
    const [ano, mes] = r.periodo.split("-").map(Number);
    return { label: `${MESES[mes]}/${String(ano).slice(2)}`, clientesUnicos: r.clientesUnicos, novos: r.novos };
  }), [qEvol.data]);

  // Frequência
  const freqTotal = useMemo(() => (qFreq.data ?? []).reduce((s, r) => s + r.total, 0), [qFreq.data]);

  // Dias sem vir
  const diasDados = useMemo(() => {
    const d = qDias.data; if (!d) return [];
    return [
      { label: "≤ 20d",  valor: d.ate20d,  cor: "#22c55e" },
      { label: "21-30d", valor: d.d21a30,  cor: "#3b82f6" },
      { label: "31-45d", valor: d.d31a45,  cor: "#eab308" },
      { label: "46-75d", valor: d.d46a75,  cor: "#f97316" },
      { label: "> 75d",  valor: d.mais75d, cor: "#ef4444" },
    ];
  }, [qDias.data]);
  const diasTotal = diasDados.reduce((s, r) => s + r.valor, 0);

  const k = qKpis.data;

  return (
    <div className="p-6 space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Painel de Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}
          </p>
        </div>
        <PeriodoSelector filtros={filtros} onChange={setFiltros} />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      {qKpis.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>)}
        </div>
      ) : k ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { lbl: "TOTAL CLIENTES",       val: fmtNum(k.totalClientes),      sub: null,                                          icon: <Users className="w-4 h-4" />,       cor: "text-blue-400" },
            { lbl: "NOVOS",                val: fmtNum(k.novos),               sub: `${k.novosPctTotal}% do total`,               icon: <UserPlus className="w-4 h-4" />,     cor: "text-green-400" },
            { lbl: "NOVOS QUE RETORNARAM", val: fmtNum(k.novosRetornaram),     sub: `${k.novosRetornaramPct}% dos novos`,         icon: <UserCheck className="w-4 h-4" />,    cor: "text-purple-400" },
            { lbl: "ATENDIMENTOS",         val: fmtNum(k.atendimentos),        sub: null,                                          icon: <CalendarDays className="w-4 h-4" />, cor: "text-yellow-400" },
            { lbl: "TICKET MÉDIO",         val: fmtMoeda(k.ticketMedio),       sub: null,                                          icon: <TrendingUp className="w-4 h-4" />,   cor: "text-orange-400" },
            { lbl: "VALOR TOTAL",          val: fmtMoedaCompact(k.valorTotal), sub: null,                                          icon: <DollarSign className="w-4 h-4" />,   cor: "text-primary" },
            { lbl: "RET. 30D NOVOS",       val: `${k.retencao30dNovos}%`,      sub: null,                                          icon: <RefreshCw className="w-4 h-4" />,    cor: "text-cyan-400" },
          ].map((kpi, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4">
                <div className={`flex items-center gap-1.5 mb-1 ${kpi.cor}`}>{kpi.icon}<span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{kpi.lbl}</span></div>
                <p className="text-xl font-bold text-foreground leading-tight">{kpi.val}</p>
                {kpi.sub && <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* ── Distribuição por status ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuição por Status · Foto atual da carteira</CardTitle>
          <p className="text-xs text-muted-foreground">Situação calculada com base na última visita de cada cliente</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {qStatus.isLoading ? <Skeleton className="h-16 w-full" /> : (
            <>
              <BarraSegmentada itens={statusItens} total={statusTotal} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-2">
                {STATUS_ORDEM.map(k => {
                  const v = statusDados[k] ?? 0;
                  const pct = statusTotal > 0 ? ((v / statusTotal) * 100).toFixed(1) : "0";
                  const cfg = STATUS_CFG[k];
                  return (
                    <div key={k} className={`rounded-xl border p-3 ${cfg.bg}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: cfg.cor }}>{cfg.label}</p>
                      <p className="text-xs text-muted-foreground mb-2">{cfg.desc}</p>
                      <p className="text-2xl font-bold text-foreground">{fmtNum(v)}</p>
                      <p className="text-xs text-muted-foreground">{pct}% do total</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Evolução mensal ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução Mensal · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</CardTitle>
        </CardHeader>
        <CardContent>
          {qEvol.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="clientesUnicos" name="Clientes únicos" fill="#d4a017" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="novos" name="Novos" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 justify-center mt-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-[#d4a017] inline-block" /> Clientes únicos</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Novos</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Distribuição por dias sem vir ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuição por Dias Sem Vir · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</CardTitle>
          <p className="text-xs text-muted-foreground">Baseado na última visita de cada cliente no período</p>
        </CardHeader>
        <CardContent>
          {qDias.isLoading ? <Skeleton className="h-12 w-full" /> : <BarraSegmentada itens={diasDados} total={diasTotal} altura="h-8" />}
        </CardContent>
      </Card>

      {/* ── Distribuição por frequência ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuição por Frequência de Visitas · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {qFreq.isLoading ? <Skeleton className="h-12 w-full" /> : (
            <>
              <BarraSegmentada itens={(qFreq.data ?? []).map((r, i) => ({ label: r.faixa, valor: r.total, cor: FREQ_CORES[i % FREQ_CORES.length] }))} total={freqTotal} altura="h-8" />
              <div className="mt-4 space-y-1.5">
                {(qFreq.data ?? []).map((r, i) => {
                  const pct = freqTotal > 0 ? (r.total / freqTotal) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">{r.faixa}</span>
                      <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: FREQ_CORES[i % FREQ_CORES.length] }}>
                          {pct >= 6 && <span className="text-[10px] font-bold text-white">{fmtNum(r.total)}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-16 shrink-0">{fmtNum(r.total)} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Composição por status (barras horizontais) ──────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição por Status · Foto atual</CardTitle>
          <p className="text-xs text-muted-foreground">Barras proporcionais ao total da carteira</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {qStatus.isLoading ? <Skeleton className="h-40 w-full" /> : (
            STATUS_ORDEM.map(k => {
              const v = statusDados[k] ?? 0;
              const pct = statusTotal > 0 ? (v / statusTotal) * 100 : 0;
              const cfg = STATUS_CFG[k];
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{cfg.label}</span>
                  <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: cfg.cor }}>
                      {pct >= 5 && <span className="text-[10px] font-bold text-white">{fmtNum(v)}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{fmtNum(v)} ({pct.toFixed(0)}%)</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Top 10 clientes por valor ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /><CardTitle className="text-base">Top 10 Clientes por Valor</CardTitle></div>
          <p className="text-xs text-muted-foreground">Período: {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)} · Ordenado por valor total</p>
        </CardHeader>
        <CardContent>
          {qTop.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["#", "Cliente", "Status", "Visitas", "Valor", "Dias s/ vir"].map((h, i) => (
                      <th key={i} className={`py-2 px-3 text-xs font-semibold text-muted-foreground ${i > 2 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(qTop.data ?? []).map((c, i) => (
                    <tr key={c.clienteId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground font-mono">#{i + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{c.nome}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={c.status} /></td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{fmtNum(c.visitas)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground">{fmtMoeda(c.valorTotal)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-medium ${c.diasSemVir > 75 ? "text-red-400" : c.diasSemVir > 45 ? "text-orange-400" : "text-green-400"}`}>{c.diasSemVir}d</span>
                      </td>
                    </tr>
                  ))}
                  {(qTop.data ?? []).length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Nenhum dado encontrado para o período selecionado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
