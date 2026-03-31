import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { Star, MessageSquare, ThumbsUp, ThumbsDown, Minus, Search, Sparkles, Send, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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

export default function AvaliacoesPage() {
  const { selectedUnit } = useApp();
  const utils = trpc.useUtils();
  const unitId = selectedUnit?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("todas");
  const [nota, setNota] = useState("todas");
  const [respondida, setRespondida] = useState("todas");
  const [pagina, setPagina] = useState(1);
  const [avaliacaoSelecionada, setAvaliacaoSelecionada] = useState<any>(null);
  const [respostaTexto, setRespostaTexto] = useState("");
  const [tomIA, setTomIA] = useState<"profissional" | "amigavel" | "empatico">("profissional");

  const query = trpc.reputacao.getAvaliacoes.useQuery(
    {
      unitId,
      busca: busca || undefined,
      plataforma: plataforma !== "todas" ? plataforma : undefined,
      notaMin: nota !== "todas" ? parseInt(nota) : undefined,
      notaMax: nota !== "todas" ? parseInt(nota) : undefined,
      semResposta: respondida === "nao" ? true : undefined,
      pagina,
      limite: 20,
    },
    { enabled: !!unitId }
  );

  const gerarRespostaMutation = trpc.reputacao.gerarRespostaIA.useMutation({
    onSuccess: (data: { resposta: string }) => { setRespostaTexto(data.resposta); },
    onError: (err) => toast.error(err.message),
  });

  const responderMutation = trpc.reputacao.responderAvaliacao.useMutation({
    onSuccess: () => {
      toast.success("Resposta salva com sucesso!");
      setAvaliacaoSelecionada(null);
      setRespostaTexto("");
      utils.reputacao.getAvaliacoes.invalidate();
      utils.reputacao.getDashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const avaliacoes = query.data?.avaliacoes || [];
  const total = query.data?.total || 0;
  const totalPaginas = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Avaliações" description="Gerencie e responda todas as avaliações" />

      <Card>
        <div className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por autor ou comentário..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className="pl-9" />
            </div>
            <Select value={plataforma} onValueChange={(v) => { setPlataforma(v); setPagina(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="ifood">iFood</SelectItem>
                <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={nota} onValueChange={(v) => { setNota(v); setPagina(1); }}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Nota" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {[5, 4, 3, 2, 1].map(n => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={respondida} onValueChange={(v) => { setRespondida(v); setPagina(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="nao">Sem resposta</SelectItem>
                <SelectItem value="sim">Respondidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {query.isLoading ? (
          [1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)
        ) : avaliacoes.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma avaliação encontrada.</p>
          </CardContent></Card>
        ) : avaliacoes.map((av: any) => (
          <Card key={av.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="font-medium text-sm">{av.autorNome || "Anônimo"}</span>
                    <Badge variant="outline" className="text-xs">{av.plataforma}</Badge>
                    <SentimentBadge sentimento={av.sentimento} />
                    <StarRating rating={parseFloat(av.nota)} />
                    <span className="text-xs text-muted-foreground">{new Date(av.dataAvaliacao).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {av.comentario && <p className="text-sm text-muted-foreground line-clamp-3">{av.comentario}</p>}
                  {av.resposta && (
                    <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/10">
                      <p className="text-xs font-medium text-primary mb-0.5">Resposta:</p>
                      <p className="text-xs text-muted-foreground">{av.resposta}</p>
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {av.resposta ? (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Respondida</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAvaliacaoSelecionada(av); setRespostaTexto(""); }}>
                      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />Responder
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} avaliações no total</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm">{pagina} / {totalPaginas}</span>
            <Button variant="outline" size="sm" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!avaliacaoSelecionada} onOpenChange={(o) => !o && setAvaliacaoSelecionada(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Responder Avaliação</DialogTitle></DialogHeader>
          {avaliacaoSelecionada && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{avaliacaoSelecionada.autorNome || "Anônimo"}</span>
                  <StarRating rating={parseFloat(avaliacaoSelecionada.nota)} />
                </div>
                {avaliacaoSelecionada.comentario && <p className="text-sm text-muted-foreground">{avaliacaoSelecionada.comentario}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Select value={tomIA} onValueChange={(v: any) => setTomIA(v)}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profissional">Tom Profissional</SelectItem>
                    <SelectItem value="amigavel">Tom Amigável</SelectItem>
                    <SelectItem value="empatico">Tom Empático</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => gerarRespostaMutation.mutate({ avaliacaoId: avaliacaoSelecionada.id, unitId })} disabled={gerarRespostaMutation.isPending}>
                  <Sparkles className={`w-4 h-4 mr-2 ${gerarRespostaMutation.isPending ? "animate-spin" : ""}`} />
                  {gerarRespostaMutation.isPending ? "Gerando..." : "Gerar com IA"}
                </Button>
              </div>
              <Textarea placeholder="Escreva sua resposta aqui..." value={respostaTexto} onChange={(e) => setRespostaTexto(e.target.value)} rows={5} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvaliacaoSelecionada(null)}>Cancelar</Button>
            <Button onClick={() => responderMutation.mutate({ avaliacaoId: avaliacaoSelecionada.id, unitId, resposta: respostaTexto })} disabled={!respostaTexto.trim() || responderMutation.isPending}>
              <Send className="w-4 h-4 mr-2" />Salvar Resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
