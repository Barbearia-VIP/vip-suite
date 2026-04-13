/**
 * TarefasPage.tsx — Gestão de tarefas com visão Kanban e Lista
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, LayoutGrid, List, Trash2, Edit2, Clock, AlertCircle, BookOpen, ExternalLink } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { DatePicker } from "@/components/DatePicker";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

type Tarefa = {
  id: number; titulo: string; descricao: string | null;
  status: "pendente" | "em_andamento" | "em_revisao" | "concluida";
  prioridade: "baixa" | "media" | "alta" | "critica";
  responsavel: string | null; prazo: Date | null;
  orgId: number; unitId: number | null;
  ordem: number; createdAt: Date; updatedAt: Date;
  concluidaEm: Date | null; createdBy: number | null;
  instrucaoId: number | null;
};

const COLUNAS: { id: Tarefa["status"]; label: string; color: string }[] = [
  { id: "pendente", label: "Pendente", color: "oklch(0.65 0.18 60)" },
  { id: "em_andamento", label: "Em Andamento", color: "oklch(0.65 0.15 260)" },
  { id: "em_revisao", label: "Em Revisão", color: "oklch(0.65 0.15 300)" },
  { id: "concluida", label: "Concluída", color: "oklch(0.65 0.15 145)" },
];

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "text-slate-400", media: "text-blue-400", alta: "text-orange-400", critica: "text-red-400",
};

function TarefaCard({ tarefa, onEdit, onDelete, onStatusChange }: {
  tarefa: Tarefa;
  onEdit: (t: Tarefa) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Tarefa["status"]) => void;
}) {
  const prazoVencido = tarefa.prazo && new Date(tarefa.prazo) < new Date() && tarefa.status !== "concluida";
  const [, navigate] = useLocation();
  const isIT = !!tarefa.instrucaoId;
  return (
    <div className={`bg-white/5 border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors ${isIT ? "border-violet-500/30" : "border-white/10"}`}>
      {isIT && (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-400 border-violet-400/30 gap-1 h-4">
            <BookOpen className="w-2.5 h-2.5" /> Instrução de Trabalho
          </Badge>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-tight">{tarefa.titulo}</p>
        <div className="flex gap-1 shrink-0">
          <PermissionGuard moduleKey="gestao_total" sectionKey="tarefas">
            <button onClick={() => onEdit(tarefa)} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
              <Edit2 className="w-3 h-3" />
            </button>
            <button onClick={() => onDelete(tarefa.id)} className="text-muted-foreground hover:text-red-400 p-0.5 rounded">
              <Trash2 className="w-3 h-3" />
            </button>
          </PermissionGuard>
        </div>
      </div>
      {tarefa.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{tarefa.descricao}</p>}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${PRIORIDADE_COLORS[tarefa.prioridade]}`}>{tarefa.prioridade}</span>
        {tarefa.responsavel && <span className="text-xs text-muted-foreground truncate max-w-[100px]">{tarefa.responsavel}</span>}
      </div>
      {tarefa.prazo && (
        <div className={`flex items-center gap-1 text-xs ${prazoVencido ? "text-red-400" : "text-muted-foreground"}`}>
          {prazoVencido ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {new Date(tarefa.prazo).toLocaleDateString("pt-BR")}
        </div>
      )}
      {isIT && (
        <button
          onClick={() => navigate("/gestao-total/instrucoes")}
          className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Ver instrução de trabalho
        </button>
      )}
      {tarefa.status !== "concluida" && (
        <Select value={tarefa.status} onValueChange={v => onStatusChange(tarefa.id, v as Tarefa["status"])}>
          <SelectTrigger className="h-6 text-xs border-white/10 bg-muted/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUNAS.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function FormTarefa({ initial, onSave, onClose }: {
  initial?: Partial<Tarefa>;
  onSave: (data: Partial<Tarefa>) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [prioridade, setPrioridade] = useState<Tarefa["prioridade"]>(initial?.prioridade ?? "media");
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");
  const [prazo, setPrazo] = useState(initial?.prazo ? new Date(initial.prazo).toISOString().split("T")[0] : "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Descreva a tarefa..." className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes opcionais..." className="text-sm min-h-[80px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Prioridade</Label>
          <Select value={prioridade} onValueChange={v => setPrioridade(v as Tarefa["prioridade"])}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="critica">Crítica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prazo</Label>
          <DatePicker value={prazo} onChange={setPrazo} placeholder="Prazo" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Responsável</Label>
        <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável..." className="text-sm" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, descricao: descricao || undefined, prioridade, responsavel: responsavel || undefined, prazo: (prazo || undefined) as unknown as Date | undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function TarefasPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);

  const q = trpc.gestaoTotal.tarefas.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const tarefas = (q.data ?? []) as Tarefa[];
  const filtered = tarefas.filter(t => !search || t.titulo.toLowerCase().includes(search.toLowerCase()));

  const createM = trpc.gestaoTotal.tarefas.create.useMutation({
    onSuccess: () => { utils.gestaoTotal.tarefas.list.invalidate(); toast.success("Tarefa criada!"); setShowForm(false); },
    onError: () => toast.error("Erro ao criar tarefa"),
  });
  const updateM = trpc.gestaoTotal.tarefas.update.useMutation({
    onSuccess: () => { utils.gestaoTotal.tarefas.list.invalidate(); toast.success("Tarefa atualizada!"); setEditingTarefa(null); },
    onError: () => toast.error("Erro ao atualizar"),
  });
  const deleteM = trpc.gestaoTotal.tarefas.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.tarefas.list.invalidate(); toast.success("Tarefa removida"); },
    onError: () => toast.error("Erro ao remover"),
  });
  const statusM = trpc.gestaoTotal.tarefas.updateStatus.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.tarefas.list.invalidate();
      utils.gestaoTotal.instrucoes.list.invalidate();
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  function handleSave(data: Partial<Tarefa>) {
    if (!org?.id) return;
    createM.mutate({ orgId: org.id, unitId: selectedUnit?.id, titulo: data.titulo!, descricao: data.descricao ?? undefined, prioridade: data.prioridade, responsavel: data.responsavel ?? undefined, prazo: data.prazo as string | undefined });
  }
  function handleUpdate(data: Partial<Tarefa>) {
    if (!editingTarefa || !org?.id) return;
    updateM.mutate({ id: editingTarefa.id, orgId: org.id, titulo: data.titulo, descricao: data.descricao ?? undefined, prioridade: data.prioridade, responsavel: data.responsavel ?? undefined, prazo: data.prazo as string | undefined });
  }
  function handleDelete(id: number) {
    if (!org?.id) return;
    deleteM.mutate({ id, orgId: org.id });
  }
  function handleStatusChange(id: number, status: Tarefa["status"]) {
    if (!org?.id) return;
    statusM.mutate({ id, orgId: org.id, status });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Tarefas</h1>
          <p className="text-sm text-muted-foreground">{tarefas.length} tarefas • {tarefas.filter(t => t.status === "pendente").length} pendentes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setView("kanban")} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button onClick={() => setView("lista")} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
          <PermissionGuard moduleKey="gestao_total" sectionKey="tarefas">
            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nova Tarefa
            </Button>
          </PermissionGuard>
        </div>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarefas..." className="max-w-sm text-sm" />
      {q.isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUNAS.map(col => {
            const colTarefas = filtered.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span className="text-xs font-semibold text-foreground">{col.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{colTarefas.length}</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {colTarefas.map(t => (
                    <TarefaCard key={t.id} tarefa={t} onEdit={setEditingTarefa} onDelete={handleDelete} onStatusChange={handleStatusChange} />
                  ))}
                  {colTarefas.length === 0 && (
                    <div className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Sem tarefas</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma tarefa encontrada</div>
            ) : filtered.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="text-sm text-foreground">{t.titulo}</p>
                    <p className="text-xs text-muted-foreground">{t.responsavel ?? "Sem responsável"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium ${PRIORIDADE_COLORS[t.prioridade]}`}>{t.prioridade}</span>
                  <span className="text-xs text-muted-foreground">{COLUNAS.find(c => c.id === t.status)?.label}</span>
                  <button onClick={() => setEditingTarefa(t)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-red-400 p-1 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <FormTarefa onSave={handleSave} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingTarefa} onOpenChange={v => !v && setEditingTarefa(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          {editingTarefa && <FormTarefa initial={editingTarefa} onSave={handleUpdate} onClose={() => setEditingTarefa(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
