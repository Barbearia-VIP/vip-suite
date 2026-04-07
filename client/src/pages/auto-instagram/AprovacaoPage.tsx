import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import { CheckSquare, Check, X, Edit2, MessageCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AprovacaoPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const queueQuery = trpc.igApproval.getPending.useQuery({ unitId }, { enabled: unitId > 0, refetchInterval: 10000 });
  const queue = queueQuery.data?.rows ?? [];

  const approveMut = trpc.igApproval.approve.useMutation({
    onSuccess: () => { toast.success("Resposta aprovada e enviada!"); queueQuery.refetch(); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.igApproval.reject.useMutation({
    onSuccess: () => { toast.success("Resposta rejeitada"); queueQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleApprove = (id: number, text?: string) => {
    approveMut.mutate({ id, editedReply: text });
  };

  const handleReject = (id: number) => {
    rejectMut.mutate({ id });
  };

  const startEdit = (id: number, text: string) => {
    setEditingId(id);
    setEditText(text);
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Fila de Aprovação" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fila de Aprovação"
        description={`${queue.length} resposta${queue.length !== 1 ? "s" : ""} aguardando aprovação`}
        actions={
          <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>
            <RefreshCw className={`w-4 h-4 mr-2 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      {queue.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 py-16 text-center">
            <CheckSquare className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-foreground font-medium">Fila vazia!</p>
            <p className="text-sm text-muted-foreground mt-1">Não há respostas aguardando aprovação no momento.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => (
            <div className="glass-card bg-white/5 border-white/10" key={item.id}>
              <div className="p-6 pt-0 p-4 space-y-3">
                {/* Comentário original */}
                <div className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Comentário de {item.authorName ?? "usuário"}</span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground">{item.commentText}</p>
                </div>

                {/* Resposta gerada */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs font-medium text-primary mb-1.5">Resposta gerada pelo bot:</p>
                  {editingId === item.id ? (
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="text-sm resize-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm text-foreground">{item.suggestedReply}</p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-2 justify-end">
                  {editingId === item.id ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(item.id, editText)}
                        disabled={approveMut.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white">
                        {approveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                        Aprovar com edição
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleReject(item.id)}
                        disabled={rejectMut.isPending}
                        className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                        <X className="w-3.5 h-3.5 mr-1.5" /> Rejeitar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(item.id, item.suggestedReply ?? "")}>
                        <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(item.id)}
                        disabled={approveMut.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white">
                        {approveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                        Aprovar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
