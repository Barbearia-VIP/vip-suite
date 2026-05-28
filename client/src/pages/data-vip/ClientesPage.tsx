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

import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { useChartTheme } from "../../hooks/useChartTheme";
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
  const ct = useChartTheme();
  const [showFreqAnalise, setShowFreqAnalise] = useState(false);
  const [showDiasAnalise, setShowDiasAnalise] = useState(false);
  const [showStatusAnalise, setShowStatusAnalise] = useState(false);
  const [janelaDias, setJanelaDias] = useState<30 | 60 | 90>(60);
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
  const qStatus  = trpc.dataVip.clientesDistribuicaoStatus.useQuery({ ...base, colaboradorId, dataInicio, dataFim }, { enabled });
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
  const qChurnSaude = trpc.dataVip.churnSaudeBase.useQuery(
    { ...base, dataInicio, dataFim, janelaDias, colaboradorId },
    { enabled: enabled && aba === "churn_risco" }
  );
  const qChurnBarbeiro = trpc.dataVip.churnPorBarbeiro.useQuery(
    { ...base, dataInicio, dataFim, janelaDias, colaboradorId },
    { enabled: enabled && aba === "churn_risco" }
  );

  // ── Dados derivados ─────────────────────────────────────────────────────────────────────────────────────
  const statusDados = useMemo(() => {
    const s = qStatus.data;
    if (!s) return {} as Record<string, number>;
    return { assiduo: s.assiduo, regular: s.regular, espacando: s.espacando, primeiraVez: s.primeiraVez, emRisco: s.emRisco, perdido: s.perdido };
  }, [qStatus.data]);
  const statusTotal = useMemo(() => Object.values(statusDados).reduce((a, b) => a + b, 0), [statusDados]);
  const statusItens = STATUS_ORDEM.map(k => ({ label: STATUS_CFG[k].label, valor: statusDados[k] ?? 0, cor: STATUS_CFG[k].cor }));

  // Análise automática de composição por status
  const statusAnalise = useMemo(() => {
    const s = qStatus.data;
    if (!s || statusTotal === 0) return [];
    const pctPerdido = Math.round((s.perdido / statusTotal) * 100);
    const pctAssiduo = Math.round((s.assiduo / statusTotal) * 100);
    const pctEmRisco = Math.round((s.emRisco / statusTotal) * 100);
    const pctNovos = s.novos ? Math.round((s.novos / statusTotal) * 100) : 0;
    const pctFieis = s.fieis3mais ? Math.round((s.fieis3mais / statusTotal) * 100) : 0;
    const pctSo1vez = s.so1vez ? Math.round((s.so1vez / statusTotal) * 100) : 0;

    const linhas: { emoji: string; texto: string }[] = [];

    if (pctPerdido > 30) {
      linhas.push({ emoji: "\ud83d\udea8", texto: `${pctPerdido}% da base está perdida (${fmtNum(s.perdido)} clientes) — acima do ideal de 20%. Campanha de reativação urgente recomendada.` });
    } else if (pctPerdido > 20) {
      linhas.push({ emoji: "\u26a0\ufe0f", texto: `${pctPerdido}% da base está perdida (${fmtNum(s.perdido)} clientes) — levemente acima do ideal. Monitore e acione os mais recentes.` });
    } else {
      linhas.push({ emoji: "\u2705", texto: `${pctPerdido}% da base perdida (${fmtNum(s.perdido)}) — dentro do limite saudável de 20%.` });
    }

    if (pctAssiduo >= 35) {
      linhas.push({ emoji: "\u2705", texto: `${pctAssiduo}% dos clientes são assíduos (${fmtNum(s.assiduo)}) — excelente base fiel. Mantenha o engajamento com esses clientes.` });
    } else {
      linhas.push({ emoji: "\ud83d\udca1", texto: `Apenas ${pctAssiduo}% são assíduos (${fmtNum(s.assiduo)}) — foque em converter Regulares e Espaçando em Assíduos com programas de fidelidade.` });
    }

    if (s.emRisco > 0) {
      linhas.push({ emoji: "\ud83d\udfe0", texto: `${fmtNum(s.emRisco)} clientes (${pctEmRisco}%) estão Em Risco — priorize contato imediato para evitar perda.` });
    }

    if (s.novos && s.novos > 0) {
      linhas.push({ emoji: "\ud83c\udf1f", texto: `${fmtNum(s.novos)} novos clientes (${pctNovos}%) fizeram a primeira visita no período — foque na conversão deles em recorrentes.` });
    }

    if (s.so1vez && s.so1vez > 0) {
      linhas.push({ emoji: "\u23f3", texto: `${fmtNum(s.so1vez)} clientes (${pctSo1vez}%) vieram apenas 1 vez no período — alta taxa de não retorno. Considere follow-up pós-visita.` });
    }

    if (s.fieis3mais && s.fieis3mais > 0) {
      linhas.push({ emoji: "\ud83d\udcaa", texto: `${fmtNum(s.fieis3mais)} clientes fiéis (${pctFieis}%) vieram 3+ vezes — base sólida de recorrentes. Esses são os embaixadores da marca.` });
    }

    return linhas;
  }, [qStatus.data, statusTotal]);

  const evolData = useMemo(() => (qEvol.data ?? []).map(r => {
    const [ano, mes] = r.periodo.split("-").map(Number);
    return { label: `${MESES[mes]}/${String(ano).slice(2)}`, clientesUnicos: r.clientesUnicos, novos: r.novos };
  }), [qEvol.data]);

  const freqTotal = useMemo(() => (qFreq.data ?? []).reduce((s, r) => s + r.total, 0), [qFreq.data]);

  // Cores fixas por faixa de frequência
  const FREQ_CORES_MAP: Record<string, string> = {
    "1x (aguardando)": "#9ca3af",
    "1x (>30d)": "#f97316",
    "1x (>60d)": "#ef4444",
    "2 vezes": "#3b82f6",
    "3-4 vezes": "#a855f7",
    "5-9 vezes": "#22c55e",
    "10-12 vezes": "#06b6d4",
    "13-15 vezes": "#14b8a6",
    "16-20 vezes": "#eab308",
    "21-30 vezes": "#ec4899",
    "30+ vezes": "#6366f1",
  };

  const freqItens = useMemo(() => (qFreq.data ?? []).map(r => ({
    label: r.faixa,
    valor: r.total,
    cor: FREQ_CORES_MAP[r.faixa] ?? "#6b7280",
  })), [qFreq.data]);

  // Análise automática de frequência
  const freqAnalise = useMemo(() => {
    const d = qFreq.data;
    if (!d || freqTotal === 0) return [];
    const get = (faixa: string) => d.find(r => r.faixa === faixa)?.total ?? 0;
    const uma1 = get("1x (aguardando)");
    const uma2 = get("1x (>30d)");
    const uma3 = get("1x (>60d)");
    const totalUma = uma1 + uma2 + uma3;
    const duas = get("2 vezes");
    const tresMais = d.filter(r => !r.faixa.startsWith("1x") && r.faixa !== "2 vezes").reduce((s, r) => s + r.total, 0);
    const dez_mais = d.filter(r => ["10-12 vezes","13-15 vezes","16-20 vezes","21-30 vezes","30+ vezes"].includes(r.faixa)).reduce((s, r) => s + r.total, 0);
    const pctUma = Math.round((totalUma / freqTotal) * 100);
    const pctTresMais = Math.round((tresMais / freqTotal) * 100);

    // Calcular meses no período
    const mesesPeriodo = (filtros.fimAno - filtros.iniAno) * 12 + (filtros.fimMes - filtros.iniMes) + 1;
    const visitasIdeal = mesesPeriodo; // 1x/mês = ideal
    const clientesIdeal = d.filter(r => {
      const n = parseInt(r.faixa);
      if (r.faixa.startsWith("1x")) return false;
      if (r.faixa.includes("-")) {
        const [a, b] = r.faixa.split("-").map(s => parseInt(s));
        return a >= visitasIdeal;
      }
      if (r.faixa.endsWith("+")) return parseInt(r.faixa) >= visitasIdeal;
      return n >= visitasIdeal;
    }).reduce((s, r) => s + r.total, 0);
    const pctIdeal = Math.round((clientesIdeal / freqTotal) * 100);

    const linhas: { emoji: string; texto: string }[] = [];

    linhas.push({ emoji: "\u2139\ufe0f", texto: `Para um período de ~${mesesPeriodo} meses, o ideal é que cada cliente venha pelo menos ${visitasIdeal}x (1x/mês = bom). ${pctIdeal}% atingem essa marca.` });
    linhas.push({ emoji: "\u2705", texto: `Apenas ${pctUma}% dos clientes vieram 1 vez (${fmtNum(totalUma)}) — ${pctUma <= 35 ? "boa taxa de retenção!" : "taxa de retenção abaixo do ideal."}` });
    if (uma3 > 0) linhas.push({ emoji: "\ud83d\udd34", texto: `${fmtNum(uma3)} (${Math.round((uma3/freqTotal)*100)}%) vieram 1 vez há mais de 60 dias — provavelmente perdidos. Campanha de resgate recomendada.` });
    if (uma2 > 0) linhas.push({ emoji: "\ud83d\udfe0", texto: `${fmtNum(uma2)} (${Math.round((uma2/freqTotal)*100)}%) vieram 1 vez há 31-60 dias — atenção, risco de perda iminente. Follow-up urgente.` });
    if (uma1 > 0) linhas.push({ emoji: "\u23f3", texto: `${fmtNum(uma1)} (${Math.round((uma1/freqTotal)*100)}%) vieram 1 vez há ≤30 dias — aguardando retorno dentro da janela normal.` });
    if (tresMais > 0) linhas.push({ emoji: "\u2705", texto: `${pctTresMais}% dos clientes vieram 3+ vezes (${fmtNum(tresMais)}) — base fidelizada sólida. Esses são clientes com cadência mensal ou melhor.` });
    if (dez_mais > 0) linhas.push({ emoji: "\u2b50", texto: `${fmtNum(dez_mais)} clientes vieram 10+ vezes no período — seus clientes mais fiéis!` });
    if (duas > 0) linhas.push({ emoji: "\u26a0\ufe0f", texto: `${fmtNum(duas)} clientes com 2 visitas — cadência de ~${Math.round(mesesPeriodo * 30 / 2)}d, abaixo do ideal.` });

    return linhas;
  }, [qFreq.data, freqTotal, filtros]);

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

  // Análise automática de dias sem vir
  const diasAnalise = useMemo(() => {
    const d = qDias.data;
    if (!d || diasTotal === 0) return [];
    const ate30 = d.ate20d + d.d21a30;
    const pctAte30 = Math.round((ate30 / diasTotal) * 100);
    const pctMais75 = Math.round((d.mais75d / diasTotal) * 100);
    const pctRisco = Math.round((d.d46a75 / diasTotal) * 100);

    const linhas: { emoji: string; texto: string }[] = [];

    if (pctAte30 < 50) {
      linhas.push({ emoji: "\ud83d\udea8", texto: `Apenas ${pctAte30}% dos clientes vieram nos últimos 30 dias (${fmtNum(ate30)} de ${fmtNum(diasTotal)}) — base com retenção baixa. A maioria está espaçando demais as visitas.` });
    } else {
      linhas.push({ emoji: "\u2705", texto: `${pctAte30}% dos clientes vieram nos últimos 30 dias (${fmtNum(ate30)} de ${fmtNum(diasTotal)}) — boa taxa de retenção ativa.` });
    }

    if (d.mais75d > 0) {
      linhas.push({ emoji: "\ud83d\udea8", texto: `${fmtNum(d.mais75d)} clientes (${pctMais75}%) estão há mais de 75 dias sem vir — isso equivale a mais de 2 meses sem retorno. Considere campanha de resgate urgente.` });
    }

    if (d.d46a75 > 0) {
      linhas.push({ emoji: "\ud83d\udca1", texto: `${fmtNum(d.d46a75)} clientes (${pctRisco}%) estão na faixa 46-75 dias (≈1.5 a 2.5 meses sem vir) — foque em resgatar estes antes que virem perdidos.` });
    }

    if (d.d31a45 > 0) {
      const pct = Math.round((d.d31a45 / diasTotal) * 100);
      linhas.push({ emoji: "\u26a0\ufe0f", texto: `${fmtNum(d.d31a45)} clientes (${pct}%) estão na faixa 31-45 dias — atenção, estão próximos de entrar em risco.` });
    }

    if (d.ate20d > 0) {
      const pct = Math.round((d.ate20d / diasTotal) * 100);
      linhas.push({ emoji: "\u2705", texto: `${fmtNum(d.ate20d)} clientes (${pct}%) vieram há menos de 20 dias — base mais ativa e fiel da carteira.` });
    }

    return linhas;
  }, [qDias.data, diasTotal]);

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
    <div className="p-6 space-y-6 animate-fade-in">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
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

      {/* Banner de carregamento */}
      {(qKpis.isLoading || (qKpis.isError && isExternalDbTimeoutError(qKpis.error) && (qKpis.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(qKpis.failureCount ?? 0) + 1} />
      )}
      {qKpis.isError && !isExternalDbTimeoutError(qKpis.error) && (
        <DataVipErrorState onRetry={() => qKpis.refetch()} />
      )}

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
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="glass-card p-4"><Skeleton className="h-12 w-full" /></div>)}
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
                <div key={i} className="glass-card glass-card-hover p-4">
                    <div className={`flex items-center gap-1.5 mb-1 ${kpi.cor}`}>{kpi.icon}<span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{kpi.lbl}</span></div>
                    <p className="text-xl font-bold text-foreground leading-tight">{kpi.val}</p>
                    {kpi.sub && <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>}
                </div>
              ))}
            </div>
          ) : null}

          {/* Distribuição por status */}
          <div className="glass-card p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Distribuição por Status · Foto atual da carteira</h3>
              <p className="text-xs text-muted-foreground">Situação calculada com base na última visita de cada cliente</p>
            </div>
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
          </div>

          {/* Evolução mensal */}
          <div className="glass-card p-4">
            <h3 className="text-base font-semibold mb-3">Evolução Mensal · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</h3>
              {qEvol.isLoading ? <Skeleton className="h-64 w-full" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.015 260 / 0.3)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="clientesUnicos" name="Clientes únicos" fill="oklch(0.76 0.145 72)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="novos" name="Novos" stroke="oklch(0.72 0.16 145)" strokeWidth={2} dot={{ r: 4, fill: "oklch(0.72 0.16 145)" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <div className="flex gap-4 justify-center mt-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-[#d4a017] inline-block" /> Clientes únicos</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Novos</span>
              </div>
          </div>

          {/* Distribuição por dias sem vir */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-base font-semibold">Distribuição por dias sem vir · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</h3>
              {qDias.isLoading ? <Skeleton className="h-10 w-full" /> : (
                <>
                  {/* Barra única segmentada */}
                  <BarraSegmentada itens={diasDados} total={diasTotal} altura="h-10" />

                  {/* Legenda compacta em linha */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                    {diasDados.map((item, i) => {
                      const pct = diasTotal > 0 ? Math.round((item.valor / diasTotal) * 100) : 0;
                      return (
                        <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.cor }} />
                          {item.label}: {fmtNum(item.valor)} ({pct}%)
                        </span>
                      );
                    })}
                  </div>

                  {/* Botão Mostrar/Ocultar análise */}
                  <button
                    onClick={() => setShowDiasAnalise(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {showDiasAnalise ? "Ocultar análise" : "Mostrar análise"}
                    {showDiasAnalise ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {/* Painel de análise automática */}
                  {showDiasAnalise && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        Análise automática
                        <span className="text-muted-foreground text-xs font-normal">(gerada com base nos dados do período)</span>
                      </p>
                      {diasAnalise.map((linha, i) => (
                        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                          <span className="mr-1.5">{linha.emoji}</span>{linha.texto}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
          </div>

          {/* Distribuição por frequência */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-base font-semibold">Distribuição por frequência de visitas · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</h3>
              {qFreq.isLoading ? <Skeleton className="h-10 w-full" /> : (
                <>
                  {/* Barra única segmentada */}
                  <BarraSegmentada itens={freqItens} total={freqTotal} altura="h-10" />

                  {/* Legenda compacta em linha */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                    {freqItens.map((item, i) => {
                      const pct = freqTotal > 0 ? Math.round((item.valor / freqTotal) * 100) : 0;
                      return (
                        <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.cor }} />
                          {item.label}: {fmtNum(item.valor)} ({pct}%)
                        </span>
                      );
                    })}
                  </div>

                  {/* Botão Mostrar/Ocultar análise */}
                  <button
                    onClick={() => setShowFreqAnalise(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {showFreqAnalise ? "Ocultar análise" : "Mostrar análise"}
                    {showFreqAnalise ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {/* Painel de análise automática */}
                  {showFreqAnalise && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        Análise automática
                        <span className="text-muted-foreground text-xs font-normal">(gerada com base nos dados do período)</span>
                      </p>
                      {freqAnalise.map((linha, i) => (
                        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                          <span className="mr-1.5">{linha.emoji}</span>{linha.texto}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
          </div>

          {/* Composição por status */}
          <div className="glass-card p-4 space-y-1.5">
            <div>
              <h3 className="text-base font-semibold">Composição por Status · {fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)}</h3>
              <p className="text-xs text-muted-foreground">Barras proporcionais ao total · Período selecionado</p>
            </div>
              {qStatus.isLoading ? <Skeleton className="h-40 w-full" /> : (
                <>
                  {/* 6 status principais */}
                  {STATUS_ORDEM.map(k => {
                    const v = statusDados[k] ?? 0;
                    const pct = statusTotal > 0 ? (v / statusTotal) * 100 : 0;
                    const cfg = STATUS_CFG[k];
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{cfg.label}</span>
                        <div className="flex-1 h-6 bg-muted/20 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: cfg.cor }}
                          >
                            {pct >= 5 && <span className="text-[10px] font-bold text-white">{fmtNum(v)}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{fmtNum(v)} ({pct.toFixed(0)}%)</span>
                      </div>
                    );
                  })}

                  {/* Separador */}
                  <div className="border-t border-border/40 my-2" />

                  {/* 3 métricas extras: Novos, Só 1 vez, Fiéis */}
                  {[
                    { label: "Novos", valor: qStatus.data?.novos ?? 0, cor: "#a855f7" },
                    { label: "Só 1 vez", valor: qStatus.data?.so1vez ?? 0, cor: "#ef4444" },
                    { label: "Fiéis (3+ excl.)", valor: qStatus.data?.fieis3mais ?? 0, cor: "#22c55e" },
                  ].map((item, i) => {
                    const pct = statusTotal > 0 ? (item.valor / statusTotal) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{item.label}</span>
                        <div className="flex-1 h-6 bg-muted/20 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: item.cor }}
                          >
                            {pct >= 5 && <span className="text-[10px] font-bold text-white">{fmtNum(item.valor)}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{fmtNum(item.valor)} ({pct.toFixed(0)}%)</span>
                      </div>
                    );
                  })}

                  {/* Botão Mostrar/Ocultar análise */}
                  <button
                    onClick={() => setShowStatusAnalise(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {showStatusAnalise ? "Ocultar análise" : "Mostrar análise"}
                    {showStatusAnalise ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {/* Painel de análise automática */}
                  {showStatusAnalise && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 mt-1">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        Análise automática
                        <span className="text-muted-foreground text-xs font-normal">(gerada com base nos dados do período)</span>
                      </p>
                      {statusAnalise.map((linha, i) => (
                        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                          <span className="mr-1.5">{linha.emoji}</span>{linha.texto}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
          </div>
        </>
      )}


      {/* ─── Churn & Saúde da Base ──────────────────────────────────────────── */}
      {aba === "churn_risco" && (
        <div className="space-y-4">
          {/* Seletor de janela */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Janela:</span>
            {([30, 60, 90] as const).map(j => (
              <button
                key={j}
                onClick={() => setJanelaDias(j)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  janelaDias === j ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {j}d
              </button>
            ))}
          </div>

          {/* KPIs de Churn & Saúde da Base */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Churn & Saúde da Base</h3>
              <span className="text-xs text-muted-foreground">Janela {janelaDias}d</span>
            </div>
              {qChurnSaude.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : qChurnSaude.data ? (() => {
                const cs = qChurnSaude.data;
                const churnPct = cs.churnPct;
                const churnCor = churnPct >= 20 ? "#ef4444" : churnPct >= 10 ? "#f97316" : "#22c55e";
                const churnLabel = churnPct >= 20 ? "Crítico" : churnPct >= 10 ? "Atenção" : "Saudável";
                const kpis: Array<{ label: string; valor: string; sub: string; cor: string; barra?: boolean; pct?: number; tooltip?: string }> = [
                  { label: "BASE ATIVA", valor: fmtNum(cs.baseAtiva), sub: "Clientes no período", cor: "#3b82f6" },
                  { label: "PERDIDOS", valor: fmtNum(cs.perdidos), sub: `Sem retorno há >${janelaDias}d`, cor: "#ef4444" },
                  { label: "CHURN %", valor: `${churnPct.toFixed(1)}%`, sub: churnLabel, cor: churnCor, barra: true, pct: churnPct, tooltip: "Taxa de clientes que deixaram de vir. Fórmula: (Perdidos / (Base Ativa + Perdidos)) × 100" },
                  { label: "RESGATADOS", valor: fmtNum(cs.resgatados), sub: "Voltaram após ausência", cor: "#22c55e" },
                  { label: "TEMPO MÉD. RESGATE", valor: `${cs.tempoMedioResgate.toFixed(1)}d`, sub: "Dias de ausência", cor: "#a855f7" },
                  { label: "VALOR PERDIDO EST.", valor: fmtMoedaCompact(cs.valorPerdidoEst), sub: "Perdidos × ticket médio", cor: "#f97316" },
                ];
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {kpis.map((k, i) => (
                        <div key={i} className="rounded-xl border border-border bg-card/50 p-4 space-y-1" style={{ borderColor: `${k.cor}30` }}>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{k.label}</p>
                            {k.tooltip && (
                              <div className="group relative">
                                <button className="text-[10px] w-4 h-4 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted flex items-center justify-center cursor-help">?</button>
                                <div className="absolute bottom-full right-0 mb-2 w-48 bg-popover text-popover-foreground text-xs p-2 rounded-lg border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-50">
                                  {k.tooltip}
                                </div>
                              </div>
                            )}
                          </div>
                          <p className="text-2xl font-bold" style={{ color: k.cor }}>{k.valor}</p>
                          {k.barra && (
                            <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden mt-1">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(k.pct!, 100)}%`, backgroundColor: k.cor }} />
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground">{k.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Análise automática */}
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        Análise Automática
                        <span className="text-muted-foreground text-xs font-normal">(janela {janelaDias}d)</span>
                      </p>
                      {(() => {
                        const linhas: { emoji: string; texto: string }[] = [];
                        if (churnPct >= 20) {
                          linhas.push({ emoji: "🚨", texto: `Churn de ${churnPct.toFixed(1)}% — crítico! Prioridade máxima: entender por que ${fmtNum(cs.perdidos)} clientes saíram. Valor perdido estimado: ${fmtMoeda(cs.valorPerdidoEst)}. Ações urgentes: contato com perdidos recentes, revisão de qualidade e precificação.` });
                        } else if (churnPct >= 10) {
                          linhas.push({ emoji: "⚠️", texto: `Churn de ${churnPct.toFixed(1)}% — atenção. ${fmtNum(cs.perdidos)} clientes sem retorno há mais de ${janelaDias} dias. Valor perdido estimado: ${fmtMoeda(cs.valorPerdidoEst)}.` });
                        } else {
                          linhas.push({ emoji: "✅", texto: `Churn de ${churnPct.toFixed(1)}% — saudável. ${fmtNum(cs.perdidos)} clientes sem retorno há mais de ${janelaDias} dias.` });
                        }
                        if (cs.resgatados > 0) {
                          linhas.push({ emoji: "✅", texto: `Ponto positivo: ${fmtNum(cs.resgatados)} clientes foram resgatados (tempo médio de ausência: ${cs.tempoMedioResgate.toFixed(1)} dias).` });
                        }
                        return linhas.map((l, i) => (
                          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                            <span className="mr-1.5">{l.emoji}</span>{l.texto}
                          </p>
                        ));
                      })()}
                    </div>
                  </div>
                );
              })() : null}
          </div>

          {/* Churn por Barbeiro */}
          <div className="glass-card p-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold">Churn por Barbeiro</h3>
              <p className="text-xs text-muted-foreground">{fmtPeriodo(filtros.iniMes, filtros.iniAno)} – {fmtPeriodo(filtros.fimMes, filtros.fimAno)} · Janela {janelaDias}d</p>
            </div>
              {qChurnBarbeiro.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (qChurnBarbeiro.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado disponível para o período.</p>
              ) : (
                <div className="space-y-0">
                  {/* Cabeçalho */}
                  <div className="grid grid-cols-[1fr_100px_80px_130px_100px_100px_100px] gap-2 px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                    <span>Barbeiro</span>
                    <span className="text-right">Base ativa</span>
                    <span className="text-right">Perdidos</span>
                    <span>Churn %</span>
                    <span className="text-right">Exclusivos</span>
                    <span className="text-right">Compartilhados</span>
                    <span className="text-right">Ações</span>
                  </div>
                  {(qChurnBarbeiro.data ?? []).map((row, i) => {
                    const isAlto = row.churnPct >= 15;
                    const churnCor = row.churnPct >= 20 ? "#ef4444" : row.churnPct >= 15 ? "#f97316" : "#22c55e";
                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-[1fr_100px_80px_130px_100px_100px_100px] gap-2 px-3 py-3 items-center border-b border-border/30 hover:bg-muted/20 transition-colors ${isAlto ? "bg-red-500/5" : ""}`}
                      >
                        <span className={`text-sm font-medium ${isAlto ? "text-red-400" : "text-foreground"}`}>{row.colaboradorNome}</span>
                        <span className="text-sm text-right text-muted-foreground underline decoration-dotted">{fmtNum(row.baseAtiva)}</span>
                        <span className={`text-sm text-right font-semibold ${row.perdidos > 0 ? "text-red-400" : "text-muted-foreground"}`}>{fmtNum(row.perdidos)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: churnCor }}>{row.churnPct.toFixed(1)}%</span>
                          <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(row.churnPct * 2, 100)}%`, backgroundColor: churnCor }} />
                          </div>
                        </div>
                        <span className="text-sm text-right text-muted-foreground">{row.exclusivosPct.toFixed(1)}%</span>
                        <span className="text-sm text-right text-muted-foreground">{row.compartilhadosPct.toFixed(1)}%</span>
                        <div className="flex justify-end">
                          <button
                            onClick={() => { setColaboradorId(row.colaboradorId); setAba("visao_geral"); }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Ver carteira
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Legenda */}
                  <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border/40 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">📋 Como interpretar</p>
                    <p><strong>Exclusivos:</strong> % dos clientes ativos que só são atendidos por esse barbeiro. Alto = carteira fiel.</p>
                    <p><strong>Compartilhados:</strong> % dos clientes que também são atendidos por outros barbeiros.</p>
                    <p><strong>Linhas em vermelho:</strong> barbeiros com churn acima de 15% — priorizar conversa e plano de ação.</p>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ABA: TOP CLIENTESS                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {aba === "top_clientes" && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /><h3 className="text-base font-semibold">Top Clientes por Valor</h3></div>
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
        </div>
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
                        <defs>
                          <linearGradient id="gradClienteGasto" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="oklch(0.76 0.145 72)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.014 260 / 0.5)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "oklch(0.45 0.012 260)" }} tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(2)}`} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(v: number) => fmtMoeda(v)}
                          contentStyle={ct.tooltipStyle}
                        />
                        <Area type="monotone" dataKey="valor" stroke="oklch(0.76 0.145 72)" fill="url(#gradClienteGasto)" strokeWidth={2} name="Valor" dot={false} activeDot={{ r: 4, fill: "oklch(0.76 0.145 72)" }} />
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
