import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, CheckCircle2, Clock, Star, ThumbsUp, ThumbsDown, Minus, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

function StarRating({ nota }: { nota: string | number }) {
  const n = Math.round(Number(nota));
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

function SentimentoBadge({ sentimento }: { sentimento: string }) {
  if (sentimento === "positivo") return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><ThumbsUp className="w-3 h-3" />Positivo</Badge>;
  if (sentimento === "negativo") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1"><ThumbsDown className="w-3 h-3" />Negativo</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 gap-1"><Minus className="w-3 h-3" />Neutro</Badge>;
}

function StatusBadge({ publicada }: { publicada: boolean }) {
  if (publicada) return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="w-3 h-3" />Publicada</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1"><Clock className="w-3 h-3" />Pendente</Badge>;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoricoIAPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const orgId = org?.id;

  const [page, setPage] = useState(1);
  const [filtroPlataforma, setFiltroPlataforma] = useState<string>("todas");
  const [filtroPublicada, setFiltroPublicada] = useState<string>("todas");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const unitId = selectedUnit?.id ?? 0;

  const statsQuery = trpc.reputacao.getEstatisticasAutoResposta.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const historicoQuery = trpc.reputacao.getHistoricoAutoResposta.useQuery(
    {
      unitId,
      page,
      pageSize: 15,
      plataforma: filtroPlataforma !== "todas" ? filtroPlataforma : undefined,
      publicada: filtroPublicada === "todas" ? undefined : filtroPublicada === "publicada",
    },
    { enabled: !!unitId }
  );

  const stats = statsQuery.data;
  const historico = historicoQuery.data;

  const handleFiltroChange = () => setPage(1);

  if (!unitId) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
        <Bot className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">Selecione uma unidade para ver o histórico de auto-respostas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <Bot className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold font-display tracking-tight">Histórico Auto-Resposta IA</h1>
          <p className="text-sm text-muted-foreground">Auditoria de avaliações respondidas automaticamente pela IA</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2"
          onClick={() => { statsQuery.refetch(); historicoQuery.refetch(); }}
        >
          <RefreshCw className={`w-4 h-4 ${historicoQuery.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div className="glass-card animate-pulse" key={i}><div className="p-4 h-20" /></div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card border-violet-500/20 bg-violet-500/5">
            <div className="p-6 pt-0 p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Respondidas</p>
              <p className="text-2xl font-bold text-violet-400">{stats.total}</p>
              {stats.ultimaResposta && (
                <p className="text-xs text-muted-foreground mt-1">Última: {fmtDate(stats.ultimaResposta)}</p>
              )}
            </div>
          </div>
          <div className="glass-card border-emerald-500/20 bg-emerald-500/5">
            <div className="p-6 pt-0 p-4">
              <p className="text-xs text-muted-foreground mb-1">Publicadas no Google</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.publicadas}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total > 0 ? Math.round((stats.publicadas / stats.total) * 100) : 0}% do total
              </p>
            </div>
          </div>
          <div className="glass-card border-amber-500/20 bg-amber-500/5">
            <div className="p-6 pt-0 p-4">
              <p className="text-xs text-muted-foreground mb-1">Pendentes</p>
              <p className="text-2xl font-bold text-amber-400">{stats.pendentes}</p>
              <p className="text-xs text-muted-foreground mt-1">Aguardando publicação</p>
            </div>
          </div>
          <div className="glass-card border-slate-500/20 bg-slate-500/5">
            <div className="p-6 pt-0 p-4">
              <p className="text-xs text-muted-foreground mb-1">Por Sentimento</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-emerald-400 font-semibold">+{stats.positivas}</span>
                <span className="text-xs text-slate-400 font-semibold">~{stats.neutras}</span>
                <span className="text-xs text-red-400 font-semibold">-{stats.negativas}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Pos / Neu / Neg</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filtros */}
      <div className="glass-card">
        <div className="p-6 pb-2 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <h3 className="font-semibold text-foreground text-sm font-medium text-muted-foreground">Filtros</h3>
            <Select
              value={filtroPlataforma}
              onValueChange={(v) => { setFiltroPlataforma(v); handleFiltroChange(); }}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as plataformas</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filtroPublicada}
              onValueChange={(v) => { setFiltroPublicada(v); handleFiltroChange(); }}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os status</SelectItem>
                <SelectItem value="publicada">Publicadas</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
            {historico && (
              <span className="text-xs text-muted-foreground ml-auto">
                {historico.total} registro{historico.total !== 1 ? "s" : ""} encontrado{historico.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 p-0">
          {historicoQuery.isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando histórico...</div>
          ) : !historico?.items?.length ? (
            <div className="p-12 flex flex-col items-center text-center">
              <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Nenhuma resposta automática encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ative o auto-responder em Integrações para que a IA comece a responder avaliações automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {historico.items.map((item) => (
                <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-wrap items-start gap-3">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{item.autorNome || "Anônimo"}</span>
                        <StarRating nota={item.nota} />
                        <SentimentoBadge sentimento={item.sentimento || "neutro"} />
                        <StatusBadge publicada={!!item.respostaPublicada} />
                        <Badge variant="outline" className="text-xs capitalize">{item.plataforma}</Badge>
                      </div>
                      {item.comentario && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                          <span className="font-medium text-foreground/70">Avaliação: </span>{item.comentario}
                        </p>
                      )}
                      {/* Resposta expandível */}
                      {item.resposta && (
                        <div>
                          <button
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          >
                            {expandedId === item.id ? "▲ Ocultar resposta" : "▼ Ver resposta gerada"}
                          </button>
                          {expandedId === item.id && (
                            <div className="mt-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-foreground/80 leading-relaxed">
                              {item.resposta}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Data */}
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Respondida em</p>
                      <p className="text-xs font-medium">{fmtDate(item.respondidoEm)}</p>
                      {item.dataAvaliacao && (
                        <>
                          <p className="text-xs text-muted-foreground mt-1">Avaliação em</p>
                          <p className="text-xs">{fmtDate(item.dataAvaliacao)}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paginação */}
          {historico && historico.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {historico.page} de {historico.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(historico.totalPages, p + 1))}
                disabled={page === historico.totalPages}
                className="gap-1"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
