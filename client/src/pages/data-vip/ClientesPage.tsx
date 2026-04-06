/**
 * ClientesPage.tsx — Painel de Clientes completo (Data VIP)
 * KPIs, distribuição por status, evolução mensal, frequência, dias sem vir,
 * Churn & Risco, Top Clientes expandido, filtro por colaborador.
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart, AreaChart, Area,
} from "recharts";
import {
  Users, UserPlus, UserCheck, CalendarDays, DollarSign,
  TrendingUp, RefreshCw, ChevronDown, ChevronUp, Star,
  AlertTriangle, Search, Download, User, X, Scissors, Clock,
  MessageSquare, Phone,
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

// ── Exportar CSV ──────────────────────────────────────────────────────────────
function exportarCSV(dados: any[], nomeArquivo: string) {
  if (!dados.length) return;
  const cols = Object.keys(dados[0]);
  const linhas = [cols.join(";"), ...dados.map(r => cols.map(c => String(r[c] ?? "")).join(";"))];
  const blob = new Blob([linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo; a.click();
  URL.revokeObjectURL(url);
}

// ── Abas ──────────────────────────────────────────────────────────────────────
type Aba = "visao_geral" | "churn_risco" | "top_clientes";

// ── Templates de mensagem WhatsApp ─────────────────────────────────────────
const WA_TEMPLATES = [
  { label: "Sentimos sua falta",     texto: (nome: string) => `Olá ${nome}! Sentimos sua falta por aqui. Que tal marcar um horário? Estamos com agenda disponível para você! 😊` },
  { label: "Promoção especial",      texto: (nome: string) => `Olá ${nome}! Temos uma promoção especial para clientes VIP como você. Entre em contato e saiba mais! 🎉` },
  { label: "Agendamento disponível", texto: (nome: string) => `Olá ${nome}! Temos horários disponíveis esta semana. Gostaria de agendar? Responda esta mensagem! ✂️` },
  { label: "Retorno cadência",        texto: (nome: string) => `Olá ${nome}! Está na hora de cuidar do visual! Já faz um tempo desde sua última visita. Que tal agendar hoje? 💈` },
];

// ── Componente principal ─────────────────────────────────────────────────────────────────────────────────
export default function ClientesPage() {
  const { selectedUnit } = useApp();
  const { org }          = useOrg();
  const [filtros, setFiltros]           = useState<Periodo>(() => calcPeriodo(12));
  const [aba, setAba]                   = useState<Aba>("visao_geral");
  const [colaboradorId, setColaboradorId] = useState<number | null>(null);

  // Top Clientes
  const [topSearch, setTopSearch]       = useState("");
  const [topSearchInput, setTopSearchInput] = useState("");
  const [topOffset, setTopOffset]       = useState(0);
  const TOP_LIMIT = 50;

  // Churn & Risco
  const [churnStatus, setChurnStatus]   = useState<"em_risco" | "perdido" | null>(null);
  const [churnSelecionados, setChurnSelecionados] = useState<Set<number>>(new Set());
  const [massaModal, setMassaModal]     = useState(false);
  const [massaMsg, setMassaMsg]         = useState("");
  const [contatadosLocal, setContatadosLocal] = useState<Set<number>>(new Set());

  const [clienteDetalhesId, setClienteDetalhesId] = useState<number | null>(null);
  const [whatsappModal, setWhatsappModal] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");

  const mutRegistrarContato = trpc.dataVip.registrarContatoCliente.useMutation();

  const handleAbrirWhatsApp = useCallback((clienteId: number, telefone: string, msg: string) => {
    const num = telefone.replace(/\D/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
    mutRegistrarContato.mutate({ orgId: org?.id, unitId: selectedUnit?.id, clienteExtId: clienteId, mensagem: msg });
    setContatadosLocal(prev => { const next = new Set(prev); next.add(clienteId); return next; });
  }, [mutRegistrarContato, org?.id, selectedUnit?.id]);

  const dataInicio = toDateStr(filtros.iniMes, filtros.iniAno, false);
  const dataFim    = toDateStr(filtros.fimMes, filtros.fimAno, true);
  const base       = { orgId: org?.id, unitId: selectedUnit?.id };
  const enabled    = !!(org?.id || selectedUnit?.id);
  // ── Queries base ───────────────────────────────────────────────────────────────────────────
  const qColabs  = trpc.dataVip.listarColaboradoresClientes.useQuery({ ...base, dataInicio, dataFim }, { enabled });
  // Todas as queries base respeitam o colaboradorId selecionado
  const qKpis    = trpc.dataVip.clientesKpis.useQuery({ ...base, dataInicio, dataFim, colaboradorId }, { enabled });
  const qStatus  = trpc.dataVip.clientesDistribuicaoStatus.useQuery({ ...base, colaboradorId }, { enabled });
  const qEvol    = trpc.dataVip.clientesEvolucaoMensal.useQuery({ ...base, dataInicio, dataFim, colaboradorId }, { enabled });
  const qFreq    = trpc.dataVip.clientesDistribuicaoFrequencia.useQuery({ ...base, dataInicio, dataFim, colaboradorId }, { enabled });
  const qDias    = trpc.dataVip.clientesDistribuicaoDiasSemVir.useQuery({ ...base, dataInicio, dataFim, colaboradorId }, { enabled });
  // ── Queries por aba ──────────────────────────────────────────────────────
  const qChurn   = trpc.dataVip.clientesChurnRisco.useQuery(
    { ...base, dataInicio, dataFim, colaboradorId, statusFiltro: churnStatus, limit: 200 },
    { enabled: enabled && aba === "churn_risco" }
  );
  const qTopExp  = trpc.dataVip.clientesTopExpandido.useQuery(
    { ...base, dataInicio, dataFim, limit: TOP_LIMIT, offset: topOffset, search: topSearch, colaboradorId },
    { enabled: enabled && aba === "top_clientes" }
  );
  const qDetalhe = trpc.dataVip.clienteDetalhes.useQuery(
    { ...base, clienteId: clienteDetalhesId ?? 0 },
    { enabled: enabled && clienteDetalhesId !== null }
  );

  // ── Dados derivados ───────────────────────────────────────────────────────
  const statusDados = useMemo(() => {
    const s = qStatus.data;
    if (!s) return {} as Record<string, number>;
    return { assiduo: s.assiduo, regular: s.regular, espacando: s.espacando, primeiraVez: s.primeiraVez, emRisco: s.emRisco, perdido: s.perdido };
  }, [qStatus.data]);
  const statusTotal = useMemo(() => Object.values(statusDados).reduce((a, b) => a + b, 0), [statusDados]);
  const statusItens = STATUS_ORDEM.map(k => ({ label: STATUS_CFG[k].label, valor: statusDados[k] ?? 0, cor: STATUS_CFG[k].cor }));

  const evolData = useMemo(() => (qEvol.data ?? []).map(r => {
    const [ano, mes] = r.periodo.split("-").map(Number);
    return { label: `${MESES[mes]}/${String(ano).slice(2)}`, clientesUnicos: r.clientesUnicos, novos: r.novos };
  }), [qEvol.data]);

  const freqTotal = useMemo(() => (qFreq.data ?? []).reduce((s, r) => s + r.total, 0), [qFreq.data]);

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

  // Nome do colaborador selecionado
  const colabNome = useMemo(() => {
    if (!colaboradorId) return null;
    return qColabs.data?.find(c => c.id === colaboradorId)?.nome ?? null;
  }, [colaboradorId, qColabs.data]);

  const handleBuscarTop = useCallback(() => {
    setTopSearch(topSearchInput);
    setTopOffset(0);
  }, [topSearchInput]);

  const ABA_BTNS: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: "visao_geral",  label: "Visão Geral",  icon: <Users className="w-3.5 h-3.5" /> },
    { id: "churn_risco",  label: "Churn & Risco", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { id: "top_clientes", label: "Top Clientes",  icon: <Star className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-6 space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Painel de Clientes
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <p className="text-sm text-muted-foreground">
              {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}
            </p>
            {colabNome && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-xs font-semibold text-primary">
                <User className="w-3 h-3" /> Visualizando: {colabNome}
                <button onClick={() => setColaboradorId(null)} className="ml-1 hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de colaborador */}
          <select
            value={colaboradorId ?? ""}
            onChange={e => setColaboradorId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">Todos os colaboradores</option>
            {(qColabs.data ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.nome} ({c.total})</option>
            ))}
          </select>
          <PeriodoSelector filtros={filtros} onChange={setFiltros} />
        </div>
      </div>

      {/* ── Abas ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border pb-0">
        {ABA_BTNS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              aba === a.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {a.icon}{a.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA: VISÃO GERAL                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {aba === "visao_geral" && (
        <>
          {/* KPIs */}
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

          {/* Distribuição por status */}
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

          {/* Evolução mensal */}
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

          {/* Distribuição por dias sem vir */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Distribuição por Dias Sem Vir · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</CardTitle>
              <p className="text-xs text-muted-foreground">Baseado na última visita de cada cliente no período</p>
            </CardHeader>
            <CardContent>
              {qDias.isLoading ? <Skeleton className="h-12 w-full" /> : <BarraSegmentada itens={diasDados} total={diasTotal} altura="h-8" />}
            </CardContent>
          </Card>

          {/* Distribuição por frequência */}
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

          {/* Composição por status */}
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
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA: CHURN & RISCO                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {aba === "churn_risco" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /><CardTitle className="text-base">Clientes em Risco e Perdidos</CardTitle></div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)} · Clientes com mais de 60 dias sem visitar
                  {colabNome && ` · ${colabNome}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filtro de status */}
                <div className="flex gap-1">
                  {([null, "em_risco", "perdido"] as const).map(s => (
                    <button
                      key={String(s)}
                      onClick={() => setChurnStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        churnStatus === s
                          ? s === null ? "bg-muted text-foreground" : s === "em_risco" ? "bg-orange-500 text-white" : "bg-red-500 text-white"
                          : "border border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {s === null ? "Todos" : s === "em_risco" ? "Em Risco" : "Perdidos"}
                    </button>
                  ))}
                </div>
                {churnSelecionados.size > 0 && (
                  <button
                    onClick={() => setMassaModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Contatar {churnSelecionados.size} selecionados
                  </button>
                )}
                <button
                  onClick={() => exportarCSV(qChurn.data ?? [], `churn-risco-${dataInicio}-${dataFim}.csv`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {qChurn.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
              {/* Selecionar todos */}
              {(qChurn.data ?? []).length > 0 && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                  <input
                    type="checkbox"
                    id="sel-todos"
                    checked={churnSelecionados.size === (qChurn.data ?? []).length && (qChurn.data ?? []).length > 0}
                    onChange={e => {
                      if (e.target.checked) setChurnSelecionados(new Set((qChurn.data ?? []).map(c => c.clienteId)));
                      else setChurnSelecionados(new Set());
                    }}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                  <label htmlFor="sel-todos" className="text-xs text-muted-foreground cursor-pointer">
                    {churnSelecionados.size === 0 ? "Selecionar todos" : `${churnSelecionados.size} selecionado(s)`}
                  </label>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 px-3 text-left w-8"></th>
                      {["#", "Cliente", "Status", "Visitas", "Valor Total", "Dias s/ vir"].map((h, i) => (
                        <th key={i} className={`py-2 px-3 text-xs font-semibold text-muted-foreground ${i > 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(qChurn.data ?? []).map((c, i) => {
                      const isSelected = churnSelecionados.has(c.clienteId);
                      const foiContatado = contatadosLocal.has(c.clienteId);
                      return (
                        <tr key={c.clienteId} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                setChurnSelecionados(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(c.clienteId);
                                  else next.delete(c.clienteId);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded accent-primary cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">#{i + 1}</td>
                          <td className="py-2.5 px-3 font-medium">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setClienteDetalhesId(c.clienteId)} className="text-primary hover:underline text-left">{c.nome}</button>
                              {foiContatado && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30">Contatado</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3"><StatusBadge status={c.status} /></td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{fmtNum(c.visitas)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">{fmtMoeda(c.valorTotal)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-medium ${c.diasSemVir > 75 ? "text-red-400" : "text-orange-400"}`}>{c.diasSemVir}d</span>
                          </td>
                        </tr>
                      );
                    })}
                    {(qChurn.data ?? []).length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">Nenhum cliente em risco ou perdido no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA: TOP CLIENTESS                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {aba === "top_clientes" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /><CardTitle className="text-base">Top Clientes por Valor</CardTitle></div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)} · Ordenado por valor total
                  {colabNome && ` · ${colabNome}`}
                </p>
              </div>
              <button
                onClick={() => exportarCSV(qTopExp.data ?? [], `top-clientes-${dataInicio}-${dataFim}.csv`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
            </div>
            {/* Busca */}
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={topSearchInput}
                  onChange={e => setTopSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleBuscarTop()}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              <button onClick={handleBuscarTop} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">Buscar</button>
              {topSearch && (
                <button onClick={() => { setTopSearch(""); setTopSearchInput(""); setTopOffset(0); }} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {qTopExp.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["#", "Cliente", "Status", "Visitas", "Valor Total", "Dias s/ vir"].map((h, i) => (
                          <th key={i} className={`py-2 px-3 text-xs font-semibold text-muted-foreground ${i > 2 ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(qTopExp.data ?? []).map((c, i) => (
                        <tr key={c.clienteId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">#{topOffset + i + 1}</td>
                          <td className="py-2.5 px-3 font-medium">
                            <button onClick={() => setClienteDetalhesId(c.clienteId)} className="text-primary hover:underline text-left">{c.nome}</button>
                          </td>
                          <td className="py-2.5 px-3"><StatusBadge status={c.status} /></td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{fmtNum(c.visitas)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">{fmtMoeda(c.valorTotal)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-medium ${c.diasSemVir > 75 ? "text-red-400" : c.diasSemVir > 45 ? "text-orange-400" : "text-green-400"}`}>{c.diasSemVir}d</span>
                          </td>
                        </tr>
                      ))}
                      {(qTopExp.data ?? []).length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Nenhum cliente encontrado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Paginação */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">
                    Exibindo {topOffset + 1}–{topOffset + (qTopExp.data?.length ?? 0)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTopOffset(Math.max(0, topOffset - TOP_LIMIT))}
                      disabled={topOffset === 0}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => setTopOffset(topOffset + TOP_LIMIT)}
                      disabled={(qTopExp.data?.length ?? 0) < TOP_LIMIT}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
                    >
                      Próxima →
                    </button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Modal de Envio em Massa WhatsApp ──────────────────────────────────── */}
      {massaModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setMassaModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-500" />
                Contatar {churnSelecionados.size} clientes
              </h3>
              <button onClick={() => setMassaModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Os links do WhatsApp serão abertos um a um. Cada cliente receberá a mesma mensagem personalizada com seu nome.
            </p>
            <p className="text-xs text-muted-foreground mb-1.5">Templates rápidos:</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {WA_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setMassaMsg(t.texto("[nome]"))}
                  className="px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted-foreground block mb-1.5">Mensagem (use [nome] para personalizar)</label>
            <textarea
              value={massaMsg}
              onChange={e => setMassaMsg(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              placeholder="Olá [nome]! ..."
            />
            <div className="flex gap-2">
              <button onClick={() => setMassaModal(false)} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  const selecionados = (qChurn.data ?? []).filter(c => churnSelecionados.has(c.clienteId));
                  selecionados.forEach((c, idx) => {
                    const telefone = (c as any).telefone;
                    if (!telefone) return;
                    const msg = massaMsg.replace(/\[nome\]/gi, c.nome);
                    setTimeout(() => {
                      handleAbrirWhatsApp(c.clienteId, telefone, msg);
                    }, idx * 800);
                  });
                  setMassaModal(false);
                  setChurnSelecionados(new Set());
                }}
                className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Enviar para {churnSelecionados.size} clientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Espaço entre abas e sheet */}

      {/* ── Sheet de Detalhes do Cliente ────────────────────────────────── */}
      <Sheet open={clienteDetalhesId !== null} onOpenChange={open => { if (!open) setClienteDetalhesId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {qDetalhe.isLoading ? "Carregando..." : (qDetalhe.data?.nome ?? "Cliente")}
              </SheetTitle>
              {qDetalhe.data?.telefone && (
                <button
                  onClick={() => { setWhatsappMsg(`Olá ${qDetalhe.data!.nome}! `); setWhatsappModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              )}
            </div>
            {qDetalhe.data?.telefone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Phone className="w-3 h-3" />
                <span>{qDetalhe.data.telefone}</span>
              </div>
            )}
          </SheetHeader>

          {qDetalhe.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : qDetalhe.data ? (
            <div className="space-y-6">
              {/* KPIs do cliente */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <CalendarDays className="w-4 h-4" />, label: "Total Visitas", val: fmtNum(qDetalhe.data.totalVisitas) },
                  { icon: <DollarSign className="w-4 h-4" />, label: "Valor Total", val: fmtMoeda(qDetalhe.data.valorTotal) },
                  { icon: <TrendingUp className="w-4 h-4" />, label: "Ticket Médio", val: fmtMoeda(qDetalhe.data.ticketMedio) },
                  { icon: <Clock className="w-4 h-4" />, label: "Dias s/ Vir", val: `${qDetalhe.data.diasSemVir}d` },
                ].map((item, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{item.icon}<span className="text-xs">{item.label}</span></div>
                    <p className="text-base font-bold text-foreground">{item.val}</p>
                  </div>
                ))}
              </div>

              {/* Status e datas */}
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={qDetalhe.data.status} />
                {qDetalhe.data.primeiraVisita && <span className="text-xs text-muted-foreground">1ª visita: {qDetalhe.data.primeiraVisita}</span>}
                {qDetalhe.data.ultimaVisita && <span className="text-xs text-muted-foreground">Última: {qDetalhe.data.ultimaVisita}</span>}
              </div>

              {/* Evolução mensal de gasto */}
              {qDetalhe.data.evolucaoMensal.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-primary" /> Evolução de Gasto (12m)</p>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={qDetalhe.data.evolucaoMensal.map(r => ({ label: r.periodo.slice(0, 7), valor: r.valor, visitas: r.visitas }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => fmtMoeda(v)} />
                        <Area type="monotone" dataKey="valor" stroke="#d4a017" fill="#d4a01733" strokeWidth={2} name="Valor" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top serviços */}
              {qDetalhe.data.topServicos.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Scissors className="w-4 h-4 text-primary" /> Serviços Mais Consumidos</p>
                  <div className="space-y-2">
                    {qDetalhe.data.topServicos.map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50">
                        <span className="text-sm text-foreground">{s.servico}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{s.quantidade}x</span>
                          <span className="text-sm font-semibold text-foreground">{fmtMoeda(s.valorTotal)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Últimas visitas */}
              {qDetalhe.data.visitas.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-primary" /> Últimas Visitas</p>
                  <div className="space-y-2">
                    {qDetalhe.data.visitas.map((v, i) => (
                      <div key={i} className="bg-muted/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-foreground">{v.data}</span>
                          <span className="text-sm font-bold text-primary">{fmtMoeda(v.valor)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{v.colaborador}</p>
                        {v.servicos && <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.servicos}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <User className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Dados não disponíveis</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Modal de Envio WhatsApp ─────────────────────────────────────────── */}
      {whatsappModal && qDetalhe.data?.telefone && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setWhatsappModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-500" />
                Enviar via WhatsApp
              </h3>
              <button onClick={() => setWhatsappModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1">Para: <span className="text-foreground font-medium">{qDetalhe.data.nome}</span></p>
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {qDetalhe.data.telefone}
              </p>
              <p className="text-xs text-muted-foreground mb-1.5">Templates rápidos:</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {WA_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setWhatsappMsg(t.texto(qDetalhe.data!.nome))}
                    className="px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label className="text-xs text-muted-foreground block mb-1.5">Mensagem</label>
              <textarea
                value={whatsappMsg}
                onChange={e => setWhatsappMsg(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Digite sua mensagem..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setWhatsappModal(false)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <a
                href={`https://wa.me/${qDetalhe.data.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWhatsappModal(false)}
                className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold text-center transition-colors flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Abrir WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
