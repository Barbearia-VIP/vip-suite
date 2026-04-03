import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import {
  Star, MessageSquare, TrendingUp, ThumbsUp, ThumbsDown, Minus,
  RefreshCw, AlertCircle, BarChart3, Clock, CheckCircle2,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
// Recharts removido — usando SVG puro para evitar conflito de layout com ResponsiveContainer

// ---- Gráfico SVG puro (sem Recharts) ----
type EvolucaoItem = { mes: string; mesLabel: string; media: number; total: number };

function EvolucaoChart({ data, notaMediaGeral }: { data: EvolucaoItem[]; notaMediaGeral: number | null }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: EvolucaoItem } | null>(null);
  const W = 600; const H = 200;
  const PAD = { top: 16, right: 16, bottom: 32, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const minY = 0; const maxY = 5;
  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minY) / (maxY - minY)) * chartH;
  if (data.length === 0) return null;
  const pts = data.map((d, i) => `${toX(i)},${toY(d.media)}`).join(" ");
  const areaPath = `M${toX(0)},${toY(data[0].media)} ` +
    data.slice(1).map((d, i) => `L${toX(i + 1)},${toY(d.media)}`).join(" ") +
    ` L${toX(data.length - 1)},${PAD.top + chartH} L${toX(0)},${PAD.top + chartH} Z`;
  const linePath = `M${pts.split(" ").join(" L")}`;
  // x-axis labels: show ~8 evenly spaced
  const step = data.length > 12 ? Math.ceil(data.length / 8) : 1;
  const yTicks = [1, 2, 3, 4, 5];
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 240, display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="svgGradNota" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* grid lines */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={PAD.left} y1={toY(t)} x2={PAD.left + chartW} y2={toY(t)}
              stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="3 3" />
            <text x={PAD.left - 4} y={toY(t) + 4} fontSize={9} fill="hsl(var(--muted-foreground))" textAnchor="end">{t}</text>
          </g>
        ))}
        {/* reference line: media geral */}
        {notaMediaGeral && (
          <>
            <line x1={PAD.left} y1={toY(notaMediaGeral)} x2={PAD.left + chartW} y2={toY(notaMediaGeral)}
              stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.5} />
            <text x={PAD.left + chartW - 2} y={toY(notaMediaGeral) - 4} fontSize={9}
              fill="hsl(var(--muted-foreground))" textAnchor="end">Média: {notaMediaGeral.toFixed(1)}★</text>
          </>
        )}
        {/* area fill */}
        <path d={areaPath} fill="url(#svgGradNota)" />
        {/* line */}
        <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* dots (only when ≤ 24 points) */}
        {data.length <= 24 && data.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.media)} r={4}
            fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => { const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect(); const svgX = toX(i) / W * rect.width + rect.left; const svgY = toY(d.media) / H * rect.height + rect.top; setTooltip({ x: svgX, y: svgY, item: d }); }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {/* x-axis labels */}
        {data.map((d, i) => i % step === 0 && (
          <text key={i} x={toX(i)} y={H - 4} fontSize={9} fill="hsl(var(--muted-foreground))" textAnchor="middle">{d.mesLabel}</text>
        ))}
        {/* hover zones for many points */}
        {data.length > 24 && data.map((d, i) => (
          <rect key={i} x={toX(i) - chartW / data.length / 2} y={PAD.top} width={chartW / data.length} height={chartH}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={(e) => { const rect2 = (e.target as SVGElement).closest("svg")!.getBoundingClientRect(); const svgX = toX(i) / W * rect2.width + rect2.left; const svgY = toY(d.media) / H * rect2.height + rect2.top; setTooltip({ x: svgX, y: svgY, item: d }); }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </svg>
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 40,
          background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
          borderRadius: 8, padding: "6px 10px", fontSize: 12, pointerEvents: "none", zIndex: 50,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div className="font-semibold">{tooltip.item.mesLabel}</div>
          <div>{tooltip.item.media} ★ &nbsp;<span className="text-muted-foreground">({tooltip.item.total} avaliações)</span></div>
        </div>
      )}
    </div>
  );
}
// ---- fim EvolucaoChart ----

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

function SentimentBadge({ sentimento }: { sentimento: string | null }) {
  if (sentimento === "positivo") return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"><ThumbsUp className="w-3 h-3 mr-1" />Positivo</Badge>;
  if (sentimento === "negativo") return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs"><ThumbsDown className="w-3 h-3 mr-1" />Negativo</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs"><Minus className="w-3 h-3 mr-1" />Neutro</Badge>;
}

function PlatformBadge({ plataforma }: { plataforma: string }) {
  const colors: Record<string, string> = {
    google: "bg-blue-500/10 text-blue-600",
    ifood: "bg-red-500/10 text-red-600",
    tripadvisor: "bg-green-500/10 text-green-600",
    facebook: "bg-indigo-500/10 text-indigo-600",
    instagram: "bg-pink-500/10 text-pink-600",
    manual: "bg-gray-500/10 text-gray-600",
  };
  return (
    <Badge className={`text-xs ${colors[plataforma] || "bg-gray-500/10 text-gray-600"}`}>
      {plataforma.charAt(0).toUpperCase() + plataforma.slice(1)}
    </Badge>
  );
}

export default function ReputacaoPage() {
  const { selectedUnit } = useApp();
  
  const utils = trpc.useUtils();
  const unitId = selectedUnit?.id ?? 0;

  const dashQuery = trpc.reputacao.getDashboard.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const sincronizarMutation = trpc.reputacao.sincronizar.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronizado! ${(data as any).totalImportadas ?? 0} novas avaliações importadas.`);
      utils.reputacao.getDashboard.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resumo = dashQuery.data?.resumo;
  const recentes = dashQuery.data?.recentes || [];
  const semResposta = dashQuery.data?.semResposta || 0;
  const evolucao = (dashQuery.data?.evolucao || []).map((e: any) => ({
    mes: e.mes,
    mesLabel: (() => {
      const [ano, m] = (e.mes as string).split("-");
      const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      return `${meses[parseInt(m,10)-1]}/${ano.slice(2)}`;
    })(),
    media: parseFloat(parseFloat(e.media || 0).toFixed(1)),
    total: Number(e.total),
  }));
  const notaMediaGeral = resumo ? parseFloat(String(resumo.notaMedia)) : null;
  const primeiraMes = evolucao.length > 0 ? evolucao[0].mes : null;
  const dadosInsuficientes = evolucao.length > 0 && evolucao.reduce((s, e) => s + e.total, 0) < 10;

  const kpis = [
    { label: "Nota Média", value: resumo ? parseFloat(String(resumo.notaMedia)).toFixed(1) : "—", icon: Star, color: "text-amber-500", bg: "bg-amber-500/10", sub: "de 5 estrelas" },
    { label: "Total de Avaliações", value: resumo?.totalAvaliacoes ?? "—", icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-500/10", sub: "avaliações registradas" },
    { label: "Taxa de Resposta", value: resumo ? `${parseFloat(String(resumo.taxaResposta)).toFixed(0)}%` : "—", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", sub: "das avaliações respondidas" },
    { label: "Sem Resposta", value: semResposta, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10", sub: "aguardando resposta" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reputação"
        description="Monitore e responda avaliações da sua unidade"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/reputacao/analise"><BarChart3 className="w-4 h-4 mr-2" />Análise</Link>
            </Button>
            <Button size="sm" onClick={() => unitId && sincronizarMutation.mutate({ unitId })} disabled={sincronizarMutation.isPending || !unitId}>
              <RefreshCw className={`w-4 h-4 mr-2 ${sincronizarMutation.isPending ? "animate-spin" : ""}`} />Sincronizar
            </Button>
          </div>
        }
      />

      {!unitId && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/20">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">Selecione uma unidade para visualizar as avaliações.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              </div>
              <div className="text-2xl font-bold">{dashQuery.isLoading ? "..." : k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Evolução da Nota Média
              {primeiraMes && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  desde {(() => { const [a,m] = primeiraMes.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m,10)-1]}/${a}`; })()}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evolucao.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <BarChart3 className="w-8 h-8 opacity-30" />
                <p>Nenhum dado disponível. Sincronize para importar avaliações.</p>
                <Button size="sm" variant="outline" asChild><Link href="/reputacao/integracoes">Configurar Integração</Link></Button>
              </div>
            ) : (
              <div className="space-y-3">
                {dadosInsuficientes && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Poucos dados no período — sincronize para importar avaliações recentes do Google e obter uma visão mais precisa da evolução.</span>
                  </div>
                )}
<EvolucaoChart data={evolucao} notaMediaGeral={notaMediaGeral} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição de Sentimentos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Positivas", value: resumo?.totalPositivas ?? 0, color: "bg-green-500", icon: ThumbsUp, textColor: "text-green-600" },
              { label: "Neutras", value: resumo?.totalNeutras ?? 0, color: "bg-amber-500", icon: Minus, textColor: "text-amber-600" },
              { label: "Negativas", value: resumo?.totalNegativas ?? 0, color: "bg-red-500", icon: ThumbsDown, textColor: "text-red-600" },
            ].map((s) => {
              const total = (resumo?.totalAvaliacoes ?? 0) || 1;
              const pct = Math.round((s.value / total) * 100);
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5"><s.icon className={`w-3.5 h-3.5 ${s.textColor}`} /><span className="text-sm">{s.label}</span></div>
                    <span className="text-sm font-medium">{s.value} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/reputacao/avaliacoes">Ver todas as avaliações</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />Avaliações Recentes
          </CardTitle>
          <Button variant="ghost" size="sm" asChild><Link href="/reputacao/avaliacoes">Ver todas →</Link></Button>
        </CardHeader>
        <CardContent>
          {dashQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />)}</div>
          ) : recentes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma avaliação encontrada.</p>
              <Button size="sm" className="mt-3" asChild><Link href="/reputacao/integracoes">Configurar Integração</Link></Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentes.map((av: any) => (
                <div key={av.id} className="p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{av.autorNome || "Anônimo"}</span>
                      <PlatformBadge plataforma={av.plataforma} />
                      <SentimentBadge sentimento={av.sentimento} />
                    </div>
                    <StarRating rating={parseFloat(av.nota)} />
                  </div>
                  {av.comentario && <p className="text-sm text-muted-foreground line-clamp-2">{av.comentario}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{new Date(av.dataAvaliacao).toLocaleDateString("pt-BR")}</span>
                    {av.resposta ? (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Respondida</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-xs" asChild><Link href="/reputacao/avaliacoes">Responder</Link></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
