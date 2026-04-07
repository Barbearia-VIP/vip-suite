import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import {
  BarChart3, TrendingUp, ThumbsUp, ThumbsDown, Star,
  Clock, AlertTriangle, CheckCircle, Info, Zap, Timer,
  AlertCircle, ShieldCheck,
} from "lucide-react";
import { EvolucaoNotaChart, type EvolucaoItem } from "@/components/reputacao/EvolucaoNotaChart";
import { NPSGauge } from "@/components/reputacao/NPSGauge";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { SentimentoChart } from "@/components/reputacao/SentimentoChart";



// ── Nuvem de Palavras ────────────────────────────────────────────────────────
function WordCloud({ words }: { words: Array<{ word: string; count: number; sentimento: string }> }) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!words.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Sem comentários suficientes no período
      </div>
    );
  }

  const maxCount = Math.max(...words.map(w => w.count));
  const minCount = Math.min(...words.map(w => w.count));

  const color = (s: string) =>
    s === "positivo" ? "#22c55e" : s === "negativo" ? "#ef4444" : "#94a3b8";

  const size = (count: number) => {
    if (maxCount === minCount) return 18;
    return Math.round(11 + ((count - minCount) / (maxCount - minCount)) * 24);
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 min-h-[180px] items-center justify-center">
      {words.slice(0, 60).map((w) => (
        <span
          key={w.word}
          onMouseEnter={() => setHovered(w.word)}
          onMouseLeave={() => setHovered(null)}
          className="cursor-default transition-all duration-150 select-none"
          style={{
            fontSize: `${size(w.count)}px`,
            color: color(w.sentimento),
            fontWeight: w.count > maxCount * 0.6 ? 700 : w.count > maxCount * 0.3 ? 600 : 400,
            opacity: hovered && hovered !== w.word ? 0.35 : 1,
            textShadow: hovered === w.word ? `0 0 10px ${color(w.sentimento)}80` : "none",
            lineHeight: 1.3,
          }}
          title={`"${w.word}" — ${w.count}x (${w.sentimento})`}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

// ── Barra de progresso ───────────────────────────────────────────────────────
function ProgressBar({ value, color, label, pct }: { value: number; color: string; label: string; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium" style={{ color }}>{value} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Ícone de alerta ──────────────────────────────────────────────────────────
function AlertIcon({ tipo }: { tipo: string }) {
  if (tipo === "critico") return <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />;
  if (tipo === "atencao") return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />;
  return <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />;
}

function alertBadgeClass(tipo: string) {
  if (tipo === "critico") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (tipo === "atencao") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-green-500/10 text-green-400 border-green-500/20";
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function AnaliseReputacaoPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d" | "12m" | "all">("all");
  const [periodoNuvem, setPeriodoNuvem] = useState<"7d" | "30d" | "90d" | "12m" | "all">("all");
  const [sentimentoNuvem, setSentimentoNuvem] = useState<"todos" | "positivo" | "neutro" | "negativo">("todos");

  const analiseQuery = trpc.reputacao.getAnalise.useQuery({ unitId, periodo: periodo as any }, { enabled: !!unitId });
  const dashQuery    = trpc.reputacao.getDashboard.useQuery({ unitId, periodo: periodo as any }, { enabled: !!unitId });
  const resumoQuery  = trpc.reputacao.getResumo.useQuery({ unitId, periodo: periodo as any }, { enabled: !!unitId });
  const palavrasQuery = trpc.reputacao.getPalavrasChave.useQuery(
    { unitId, periodo: periodo as any, sentimento: sentimentoNuvem }, { enabled: !!unitId }
  );
  const tempoRespostaQuery = trpc.reputacao.getTempoResposta.useQuery({ unitId }, { enabled: !!unitId });
  const alertasQuery = trpc.reputacao.getAlertas.useQuery({ unitId, periodo: periodo as any }, { enabled: !!unitId });

  const resumo  = resumoQuery.data;
  const tempo   = tempoRespostaQuery.data;
  const alertas = alertasQuery.data || [];
  const palavras = palavrasQuery.data || [];

  const alertasCriticos = alertas.filter(a => a.tipo === "critico").length;
  const alertasAtencao  = alertas.filter(a => a.tipo === "atencao").length;

  // Dados para o gráfico histórico SVG
  const evolucaoHistorica: EvolucaoItem[] = ((dashQuery.data?.evolucao || []) as any[]).map((e: any) => {
    const [a, m] = String(e.mes || "").split("-");
    const ms = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return {
      mes: String(e.mes),
      mesLabel: `${ms[parseInt(m, 10) - 1] ?? ""}/${a?.slice(2) ?? ""}`,
      media: parseFloat(parseFloat(e.media || 0).toFixed(1)),
      total: Number(e.total),
    };
  });
  const notaMediaGeral = resumo ? parseFloat(String(resumo.notaMedia)) : null;
  const primeiraMes = evolucaoHistorica.length > 0 ? evolucaoHistorica[0].mes : null;

  // porNota para o NPSGauge — usa período selecionado; fallback = histórico completo
  const porNotaFromAnalise = (analiseQuery.data?.porNota || []).map((n: any) => ({
    nota: Math.round(Number(n.nota)),
    total: Number(n.total),
  }));
  const porNotaFromResumo = resumo?.distribuicaoNotas
    ? Object.entries(resumo.distribuicaoNotas as Record<string, number>).map(([nota, total]) => ({
        nota: Math.round(Number(nota)),
        total: Number(total),
      }))
    : [];
  const porNotaRaw = porNotaFromAnalise.length > 0 ? porNotaFromAnalise : porNotaFromResumo;
  const npsUsandoHistorico = porNotaFromAnalise.length === 0 && porNotaFromResumo.length > 0;

  // Distribuição de sentimentos (usa resumo — sempre tem dados)
  const sentimentoData = {
    positivas: resumo ? Number(resumo.totalPositivas) : 0,
    neutras:   resumo ? Number(resumo.totalNeutras)   : 0,
    negativas: resumo ? Number(resumo.totalNegativas) : 0,
  };
  const hasSentimento = sentimentoData.positivas + sentimentoData.neutras + sentimentoData.negativas > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Análise de Reputação"
        description="Métricas detalhadas de sentimento e tendências"
        actions={
          <div className="flex items-center gap-2">
            {alertasCriticos > 0 && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                <AlertCircle className="w-3 h-3" />
                {alertasCriticos} crítico{alertasCriticos > 1 ? "s" : ""}
              </Badge>
            )}
            {alertasAtencao > 0 && alertasCriticos === 0 && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                <AlertTriangle className="w-3 h-3" />
                {alertasAtencao} alerta{alertasAtencao > 1 ? "s" : ""}
              </Badge>
            )}
            <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Histórico Completo</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="12m">Último ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Nota Média",      value: resumo ? `${parseFloat(String(resumo.notaMedia)).toFixed(1)} ★` : "—", icon: Star,       color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Total Avaliações",value: resumo?.totalAvaliacoes ?? "—",                                        icon: BarChart3,   color: "text-blue-500",  bg: "bg-blue-500/10"  },
          { label: "% Positivas",     value: resumo ? `${Math.round((Number(resumo.totalPositivas) / (Number(resumo.totalAvaliacoes) || 1)) * 100)}%` : "—", icon: ThumbsUp,  color: "text-green-500", bg: "bg-green-500/10" },
          { label: "% Negativas",     value: resumo ? `${Math.round((Number(resumo.totalNegativas) / (Number(resumo.totalAvaliacoes) || 1)) * 100)}%` : "—", icon: ThumbsDown, color: "text-red-500",   bg: "bg-red-500/10"   },
        ].map((k) => (
          <div className="glass-card" key={k.label}>
            <div className="p-6 pt-0 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              </div>
              <div className="text-2xl font-bold">{resumoQuery.isLoading ? "..." : k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── NPS + Alertas (50/50) ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* NPS Gauge */}
        <div className="glass-card">
          <div className="p-6 pb-2 pb-2">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              NPS Estimado
            </h3>
            <p className="text-xs text-muted-foreground">
              {npsUsandoHistorico ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Usando todo o histórico (sem dados no período)
                </span>
              ) : "Net Promoter Score baseado nas notas do período selecionado"}
            </p>
          </div>
          <div className="p-6 pt-0">
            {analiseQuery.isLoading || resumoQuery.isLoading ? (
              <div className="h-56 rounded-lg bg-muted animate-pulse" />
            ) : (
              <NPSGauge porNota={porNotaRaw} />
            )}
          </div>
        </div>

        {/* Alertas de Reputação */}
        <div className="glass-card">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Alertas de Reputação
              {alertasCriticos > 0 && (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs ml-1">
                  {alertasCriticos} crítico{alertasCriticos > 1 ? "s" : ""}
                </Badge>
              )}
            </h3>
          </div>
          <div className="p-6 pt-0">
            {alertasQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : alertas.length === 0 ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-green-400">Reputação estável</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sem alertas no momento. Continue monitorando.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {alertas.map((alerta, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      alerta.tipo === "critico"
                        ? "bg-red-500/5 border-red-500/20"
                        : alerta.tipo === "atencao"
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-green-500/5 border-green-500/20"
                    }`}
                  >
                    <AlertIcon tipo={alerta.tipo} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{alerta.titulo}</span>
                        {alerta.valor && (
                          <Badge className={`text-xs ${alertBadgeClass(alerta.tipo)}`}>{alerta.valor}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tempo de Resposta da IA ── */}
      <div className="glass-card">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            Tempo de Resposta da IA
          </h3>
        </div>
        <div className="p-6 pt-0">
          {tempoRespostaQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}
            </div>
          ) : !tempo || tempo.total === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
              <Info className="w-4 h-4" />
              Sem respostas automáticas registradas ainda.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">{tempo.mediaFormatada}</div>
                  <div className="text-xs text-muted-foreground">Tempo médio de resposta · {tempo.total} respostas automáticas</div>
                </div>
              </div>
              <div className="space-y-2">
                <ProgressBar value={tempo.menosDeUmaHora} pct={tempo.pctMenosDeUmaHora} color="#22c55e" label="Respondidas em menos de 1h" />
                <ProgressBar value={tempo.entre1e24h}     pct={tempo.pctEntre1e24h}     color="#f59e0b" label="Respondidas entre 1h e 24h" />
                <ProgressBar value={tempo.maisDe24h}      pct={tempo.pctMaisDe24h}      color="#ef4444" label="Respondidas após 24h" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Evolução da Nota Média (histórico completo) ── */}
      <div className="glass-card">
        <div className="p-6 pb-2">
          <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Evolução da Nota Média
            {primeiraMes && (() => {
              const [a, m] = primeiraMes.split("-");
              const ms = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
              return (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  desde {ms[parseInt(m, 10) - 1]}/{a}
                </span>
              );
            })()}
          </h3>
        </div>
        <div className="p-6 pt-0">
          {dashQuery.isLoading ? (
            <div className="h-64 rounded-lg bg-muted animate-pulse" />
          ) : evolucaoHistorica.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Sem dados históricos disponíveis
            </div>
          ) : (
            <EvolucaoNotaChart data={evolucaoHistorica} notaMediaGeral={notaMediaGeral} />
          )}
        </div>
      </div>

      {/* ── Distribuição de Sentimentos ── */}
      {hasSentimento && (
        <div className="glass-card">
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-primary" />
              Distribuição de Sentimentos
            </h3>
          </div>
          <div className="p-6 pt-0">
            <SentimentoChart data={sentimentoData} />
          </div>
        </div>
      )}

      {/* ── Nuvem de Palavras ── */}
      <div className="glass-card">
        <div className="p-6 pb-2 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Nuvem de Palavras dos Comentários
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> positivo
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-2" /> negativo
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block ml-2" /> neutro
              </div>
              <Select value={sentimentoNuvem} onValueChange={(v: any) => setSentimentoNuvem(v)}>
                <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="positivo">Positivos</SelectItem>
                  <SelectItem value="neutro">Neutros</SelectItem>
                  <SelectItem value="negativo">Negativos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={periodoNuvem} onValueChange={(v: any) => setPeriodoNuvem(v)}>
                <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="12m">Último ano</SelectItem>
                  <SelectItem value="all">Todo o histórico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="p-6 pt-0">
          {palavrasQuery.isLoading ? (
            <div className="flex flex-wrap gap-2 p-2 min-h-[180px] items-center justify-center">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="h-5 rounded bg-muted animate-pulse" style={{ width: `${40 + (i * 7) % 60}px` }} />
              ))}
            </div>
          ) : (
            <WordCloud words={palavras} />
          )}
          {!palavrasQuery.isLoading && palavras.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {palavras.length} palavras · tamanho proporcional à frequência · passe o mouse para detalhes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
