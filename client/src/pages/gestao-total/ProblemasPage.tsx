/**
 * ProblemasPage.tsx — Registro e acompanhamento de problemas
 * Schema: id, orgId, unitId, titulo, descricao, severidade, status, responsavel, resolucao, resolvidoEm
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, AlertTriangle } from "lucide-react";

type Problema = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; descricao: string | null;
  severidade: "baixa" | "media" | "alta" | "critica";
  status: "aberto" | "em_analise" | "resolvido" | "fechado";
  responsavel: string | null; resolucao: string | null;
  resolvidoEm: Date | null; createdAt: Date; updatedAt: Date;
};
const SEV_COLORS: Record<string, string> = {
  baixa: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  media: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  alta: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critica: "bg-red-500/20 text-red-400 border-red-500/30",
};
const STATUS_COLORS: Record<string, string> = {
  aberto: "text-red-400", em_analise: "text-yellow-400", resolvido: "text-green-400", fechado: "text-muted-foreground",
};

function FormProblema({ initial, onSave, onClose }: {
  initial?: Partial<Problema>;
  onSave: (d: { titulo: string; descricao?: string; severidade: "baixa"|"media"|"alta"|"critica"; status: "aberto"|"em_analise"|"resolvido"|"fechado"; responsavel?: string; resolucao?: string }) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [severidade, setSeveridade] = useState<"baixa"|"media"|"alta"|"critica">(initial?.severidade ?? "media");
  const [status, setStatus] = useState<"aberto"|"em_analise"|"resolvido"|"fechado">(initial?.status ?? "aberto");
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");
  const [resolucao, setResolucao] = useState(initial?.resolucao ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Descreva o problema..." className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Severidade</Label>
          <Select value={severidade} onValueChange={v => setSeveridade(v as typeof severidade)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="critica">Crítica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="resolvido">Resolvido</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Responsável</Label>
        <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável" className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do problema..." className="text-sm min-h-[80px]" />
      </div>
      {(status === "resolvido" || status === "fechado") && (
        <div className="space-y-1.5"><Label className="text-xs">Resolução</Label>
          <Textarea value={resolucao} onChange={e => setResolucao(e.target.value)} placeholder="Como foi resolvido..." className="text-sm min-h-[60px]" />
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, descricao: descricao || undefined, severidade, status, responsavel: responsavel || undefined, resolucao: resolucao || undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function ProblemasPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Problema | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");

  const q = trpc.gestaoTotal.problemas.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, status: filterStatus !== "todos" ? filterStatus : undefined },
    { enabled: !!org?.id }
  );
  const problemas = (q.data ?? []) as unknown as Problema[];

  const saveM = trpc.gestaoTotal.problemas.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.problemas.list.invalidate(); toast.success("Problema salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.problemas.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.problemas.list.invalidate(); toast.success("Removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const abertos = problemas.filter(p => p.status === "aberto" || p.status === "em_analise").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Problemas</h1>
          <p className="text-sm text-muted-foreground">{abertos} em aberto de {problemas.length} total</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Registrar Problema
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["todos", "aberto", "em_analise", "resolvido", "fechado"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{s.replace("_", " ")}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : problemas.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum problema registrado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Registrar problema</Button>
          </div>
        </div>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="divide-y divide-border">
            {problemas.map(p => (
              <div key={p.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-xs ${SEV_COLORS[p.severidade] ?? ""}`}>{p.severidade}</Badge>
                      {p.responsavel && <span className="text-xs text-muted-foreground">{p.responsavel}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={`text-xs font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}>{p.status.replace("_", " ")}</span>
                  <button onClick={() => setEditing(p)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteM.mutate({ id: p.id, orgId: p.orgId })} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar Problema</DialogTitle></DialogHeader>
          <FormProblema onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Problema</DialogTitle></DialogHeader>
          {editing && <FormProblema initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
