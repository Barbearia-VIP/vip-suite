import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MessageCircle, ExternalLink, Sparkles, Send, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UnrepliedComment {
  commentId: string;
  postId: string;
  postCaption: string;
  postPermalink: string;
  postTimestamp: string;
  authorName: string;
  commentText: string;
  commentTimestamp: string;
  alreadyRepliedOnIG: boolean;
}

// ─── Componente de card de comentário individual ──────────────────────────────

function CommentCard({
  comment,
  unitId,
  onReplied,
}: {
  comment: UnrepliedComment;
  unitId: number;
  onReplied: (commentId: string) => void;
}) {
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [replied, setReplied] = useState(false);

  const generatePreview = trpc.igUnreplied.generatePreview.useMutation({
    onSuccess: (data) => {
      if (data.success && data.reply) {
        setGeneratedReply(data.reply);
        setEditedReply(data.reply);
        setIsExpanded(true);
      } else {
        toast.error("Erro ao gerar resposta: " + (data.error ?? "desconhecido"));
      }
    },
    onError: (err) => toast.error("Erro ao gerar resposta: " + err.message),
  });

  const replyWithAI = trpc.igUnreplied.replyWithAI.useMutation({
    onSuccess: () => {
      setReplied(true);
      setIsExpanded(false);
      onReplied(comment.commentId);
      toast.success(`Resposta enviada para @${comment.authorName}!`);
    },
    onError: (err) => toast.error("Erro ao enviar resposta: " + err.message),
  });

  const handleGenerate = () => {
    generatePreview.mutate({ unitId, commentText: comment.commentText });
  };

  const handleSend = () => {
    replyWithAI.mutate({
      unitId,
      commentId: comment.commentId,
      postId: comment.postId,
      commentText: comment.commentText,
      authorName: comment.authorName,
      customReply: editedReply,
    });
  };

  const commentDate = new Date(comment.commentTimestamp);
  const relativeDate = format(commentDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  if (replied) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Respondido — @{comment.authorName}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={comment.alreadyRepliedOnIG ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20" : ""}>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Cabeçalho: autor + data + badges */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">@{comment.authorName}</span>
            {comment.alreadyRepliedOnIG && (
              <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50 dark:text-yellow-400 dark:border-yellow-700 dark:bg-yellow-950/50 text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Já tem resposta no IG
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Clock className="h-3 w-3" />
            {relativeDate}
            <a
              href={comment.postPermalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-700 ml-1"
            >
              <ExternalLink className="h-3 w-3" />
              Ver post
            </a>
          </div>
        </div>

        {/* Texto do comentário */}
        <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-foreground leading-relaxed">{comment.commentText}</p>
          </div>
        </div>

        {/* Caption do post */}
        {comment.postCaption && (
          <p className="text-xs text-muted-foreground truncate">
            <span className="font-medium">Post:</span> {comment.postCaption}
          </p>
        )}

        {/* Área de resposta gerada */}
        {isExpanded && generatedReply !== null && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-400">
              <Sparkles className="h-4 w-4" />
              Resposta gerada pela IA
            </div>
            <Textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              placeholder="Edite a resposta antes de enviar..."
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(false)}
              >
                <ChevronUp className="h-4 w-4 mr-1" />
                Fechar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generatePreview.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${generatePreview.isPending ? "animate-spin" : ""}`} />
                Regerar
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={replyWithAI.isPending || !editedReply.trim()}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Send className="h-4 w-4 mr-1" />
                {replyWithAI.isPending ? "Enviando..." : "Enviar Resposta"}
              </Button>
            </div>
          </div>
        )}

        {/* Botões de ação (quando não expandido) */}
        {!isExpanded && (
          <div className="flex gap-2 justify-end pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generatePreview.isPending}
              className="text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-700 dark:hover:bg-purple-950/50"
            >
              <Sparkles className={`h-4 w-4 mr-1 ${generatePreview.isPending ? "animate-spin" : ""}`} />
              {generatePreview.isPending ? "Gerando..." : "Responder com IA"}
            </Button>
            {generatedReply !== null && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExpanded(true)}
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Ver resposta
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ComentariosSemRespostaPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  // Período padrão: últimos 30 dias
  const [since, setSince] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [until, setUntil] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [repliedIds, setRepliedIds] = useState<Set<string>>(new Set());
  const [shouldFetch, setShouldFetch] = useState(false);

  const { data, isLoading, error, refetch } = trpc.igUnreplied.getUnreplied.useQuery(
    { unitId, since, until },
    {
      enabled: shouldFetch && unitId > 0,
      retry: false,
      staleTime: 2 * 60 * 1000, // 2 minutos
    }
  );

  const handleSearch = () => {
    setRepliedIds(new Set());
    setShouldFetch(true);
    if (shouldFetch) refetch();
  };

  const handleReplied = (commentId: string) => {
    setRepliedIds(prev => { const next = new Set(prev); next.add(commentId); return next; });
  };

  // Filtrar comentários pelo texto de busca e pelos já respondidos nesta sessão
  const filteredComments = useMemo(() => {
    if (!data?.comments) return [];
    return data.comments.filter(c => {
      if (repliedIds.has(c.commentId)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.authorName.toLowerCase().includes(q) || c.commentText.toLowerCase().includes(q);
    });
  }, [data?.comments, repliedIds, search]);

  const withoutReplyOnIG = filteredComments.filter(c => !c.alreadyRepliedOnIG);
  const withReplyOnIG = filteredComments.filter(c => c.alreadyRepliedOnIG);

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Comentários Sem Resposta</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Busque comentários do período que ainda não foram respondidos e responda com IA usando o prompt configurado.
        </p>
      </div>

      {/* Filtros de período */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Selecionar Período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">De</label>
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                max={until}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Até</label>
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                min={since}
                max={format(new Date(), "yyyy-MM-dd")}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={isLoading}
                className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {isLoading ? "Buscando..." : "Buscar Comentários"}
              </Button>
            </div>
          </div>

          {/* Atalhos de período */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Últimos 7 dias", days: 7 },
              { label: "Últimos 30 dias", days: 30 },
              { label: "Últimos 90 dias", days: 90 },
            ].map(({ label, days }) => (
              <Button
                key={days}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSince(format(subDays(new Date(), days), "yyyy-MM-dd"));
                  setUntil(format(new Date(), "yyyy-MM-dd"));
                }}
                className="text-xs"
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="py-4 flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-sm">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Resultados */}
      {data && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{data.totalPosts}</strong> posts analisados</span>
            <span>·</span>
            <span><strong className="text-foreground">{data.totalComments}</strong> comentários encontrados</span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{filteredComments.length}</strong> sem resposta do sistema
            </span>
          </div>

          {/* Busca por texto */}
          {filteredComments.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrar por usuário ou texto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Lista de comentários sem resposta no IG */}
          {withoutReplyOnIG.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-purple-500" />
                Sem resposta ({withoutReplyOnIG.length})
              </h2>
              {withoutReplyOnIG.map(comment => (
                <CommentCard
                  key={comment.commentId}
                  comment={comment}
                  unitId={unitId}
                  onReplied={handleReplied}
                />
              ))}
            </div>
          )}

          {/* Lista de comentários que já têm resposta no IG (mas não no sistema) */}
          {withReplyOnIG.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Já respondidos no Instagram, mas não pelo sistema ({withReplyOnIG.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Estes comentários já possuem respostas no Instagram (feitas manualmente ou por outra ferramenta).
                Você ainda pode enviar uma resposta adicional pelo sistema se desejar.
              </p>
              {withReplyOnIG.map(comment => (
                <CommentCard
                  key={comment.commentId}
                  comment={comment}
                  unitId={unitId}
                  onReplied={handleReplied}
                />
              ))}
            </div>
          )}

          {/* Estado vazio */}
          {filteredComments.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="font-medium">Nenhum comentário sem resposta!</p>
                <p className="text-sm text-muted-foreground">
                  Todos os comentários do período selecionado já foram respondidos.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Estado inicial (antes de buscar) */}
      {!data && !isLoading && !error && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Selecione o período e clique em "Buscar Comentários"</p>
            <p className="text-sm text-muted-foreground">
              O sistema irá buscar todos os comentários do período e verificar quais ainda não foram respondidos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
