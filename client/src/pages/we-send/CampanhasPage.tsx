import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import {
  MessageSquare, Send, Users, CheckCircle, XCircle, Clock,
  RefreshCw, Trash2, Eye, Pause
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  rascunho: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: Clock },
  agendada: { label: "Agendada", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  em_andamento: { label: "Em andamento", color: "bg-yellow-500/10 text-yellow-500", icon: RefreshCw },
  pausada: { label: "Pausada", color: "bg-orange-500/10 text-orange-500", icon: Pause },
  concluida: { label: "Concluída", color: "bg-green-500/10 text-green-500", icon: CheckCircle },
  cancelada: { label: "Cancelada", color: "bg-red-500/10 text-red-500", icon: XCircle },
};

export default function CampanhasPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const campanhasQuery = trpc.weSend.getCampanhas.useQuery({ unitId }, { enabled: !!unitId, refetchInterval: 5000 });
  const campanhaQuery = trpc.weSend.getCampanha.useQuery(
    { id: selectedId!, unitId },
    { enabled: !!selectedId && !!unitId }
  );
  const utils = trpc.useUtils();

  const deleteMutation = trpc.weSend.deleteCampanha.useMutation({
    onSuccess: () => {
      toast.success("Campanha removida");
      utils.weSend.getCampanhas.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const pausarMutation = trpc.weSend.pausarCampanha.useMutation({
    onSuccess: () => {
      toast.success("Campanha pausada");
      utils.weSend.getCampanhas.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const campanhas = campanhasQuery.data || [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Campanhas"
        description="Histórico e acompanhamento de campanhas WhatsApp"
        actions={
          <Link href="/we-send">
            <Button size="sm" className="gap-1.5 text-xs">
              <Send className="w-3.5 h-3.5" />Nova campanha
            </Button>
          </Link>
        }
      />

      {campanhasQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : campanhas.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Nenhuma campanha ainda</p>
            <p className="text-xs text-muted-foreground mb-4">Crie sua primeira campanha de WhatsApp</p>
            <Link href="/we-send">
              <Button size="sm" className="text-xs gap-1.5">
                <Send className="w-3.5 h-3.5" />Criar campanha
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {campanhas.map(campanha => {
            const sc = STATUS_CONFIG[campanha.status] || STATUS_CONFIG.rascunho;
            const StatusIcon = sc.icon;
            const total = campanha.totalContatos || 0;
            const enviados = campanha.totalEnviados || 0;
            const falhas = campanha.totalFalhas || 0;
            const progresso = total > 0 ? Math.round((enviados + falhas) / total * 100) : 0;

            return (
              <div className="glass-card bg-white/5 border-white/10 hover:border-primary/30 transition-colors" key={campanha.id}>
                <div className="p-6 pt-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground truncate">{campanha.nome}</p>
                        <Badge className={`text-xs px-1.5 py-0 ${sc.color} border-0`}>
                          <StatusIcon className="w-2.5 h-2.5 mr-1" />
                          {sc.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{total} contatos</span>
                        <span className="flex items-center gap-1 text-green-500"><CheckCircle className="w-3 h-3" />{enviados} enviados</span>
                        {falhas > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{falhas} falhas</span>}
                        <span>{new Date(campanha.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      {(campanha.status === "em_andamento" || campanha.status === "concluida") && total > 0 && (
                        <div className="mt-2 space-y-1">
                          <Progress value={progresso} className="h-1.5" />
                          <p className="text-xs text-muted-foreground">{progresso}% concluído</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => setSelectedId(campanha.id)}>
                        <Eye className="w-3 h-3" />Ver
                      </Button>
                      {campanha.status === "em_andamento" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-orange-500"
                          onClick={() => pausarMutation.mutate({ campanhaId: campanha.id, unitId })}
                          disabled={pausarMutation.isPending}>
                          <Pause className="w-3 h-3" />Pausar
                        </Button>
                      )}
                      {(campanha.status === "rascunho" || campanha.status === "cancelada" || campanha.status === "concluida") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-500 border-red-500/30"
                          onClick={() => {
                            if (confirm("Remover esta campanha?")) {
                              deleteMutation.mutate({ id: campanha.id, unitId });
                            }
                          }}
                          disabled={deleteMutation.isPending}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {campanhaQuery.data?.nome || "Detalhes da campanha"}
            </DialogTitle>
          </DialogHeader>
          {campanhaQuery.isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : campanhaQuery.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total", value: campanhaQuery.data.totalContatos || 0, color: "text-foreground" },
                  { label: "Enviados", value: campanhaQuery.data.totalEnviados || 0, color: "text-green-500" },
                  { label: "Falhas", value: campanhaQuery.data.totalFalhas || 0, color: "text-red-500" },
                ].map(m => (
                  <div key={m.label} className="text-center p-3 rounded-lg bg-muted/30 border border-white/10">
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Mensagem:</p>
                <div className="rounded-lg bg-muted/30 border border-white/10 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {campanhaQuery.data.mensagem}
                </div>
              </div>
              {campanhaQuery.data.contatos && campanhaQuery.data.contatos.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Contatos ({campanhaQuery.data.contatos.length}):</p>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {campanhaQuery.data.contatos.map((c, i) => {
                        const statusColors: Record<string, string> = {
                          enviado: "text-green-500", falha: "text-red-500", pendente: "text-muted-foreground",
                          entregue: "text-blue-500", lido: "text-purple-500", bloqueado: "text-orange-500",
                        };
                        return (
                          <div key={c.id} className={`flex items-center justify-between px-3 py-1.5 text-xs ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                            <span className="text-foreground">{c.nome || "(sem nome)"} — {c.telefone}</span>
                            <span className={statusColors[c.status] || "text-muted-foreground"}>{c.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
