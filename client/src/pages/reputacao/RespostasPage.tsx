import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/PageHeader";
import { MessageSquare, Sparkles, Search, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

export default function RespostasPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  // Busca avaliações respondidas com IA
  const query = trpc.reputacao.getAvaliacoes.useQuery(
    { unitId, busca: busca || undefined, pagina, limite: 20 },
    { enabled: !!unitId }
  );

  const avaliacoes = (query.data?.avaliacoes || []).filter((av: any) => av.resposta);
  const total = query.data?.total || 0;
  const totalPaginas = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Respostas com IA"
        description="Histórico de avaliações respondidas com inteligência artificial"
      />

      <div className="glass-card">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar nas respostas..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className="pl-9" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {query.isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />)
        ) : avaliacoes.length === 0 ? (
          <div className="glass-card">
            <div className="p-6 pt-0 py-12 text-center text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma resposta registrada ainda.</p>
              <p className="text-xs mt-1">Use o botão "Responder" na página de Avaliações para gerar respostas com IA.</p>
            </div>
          </div>
        ) : avaliacoes.map((av: any) => (
          <div className="glass-card" key={av.id}>
            <div className="p-6 pt-0 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{av.plataforma || "—"}</Badge>
                  <StarRating rating={parseFloat(av.nota || 0)} />
                  <span className="text-xs text-muted-foreground">{av.autorNome || "Anônimo"}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(av.dataAvaliacao).toLocaleDateString("pt-BR")}</span>
              </div>
              {av.comentario && (
                <div className="p-2 rounded bg-muted/50 mb-2">
                  <p className="text-xs text-muted-foreground italic">"{av.comentario}"</p>
                </div>
              )}
              {av.resposta && (
                <div className="p-2 rounded bg-primary/5 border border-primary/10">
                  <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" />Resposta:</p>
                  <p className="text-sm">{av.resposta}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} respostas no total</span>
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
    </div>
  );
}
