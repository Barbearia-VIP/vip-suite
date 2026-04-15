/**
 * OportunidadesPage.tsx — Gestão de oportunidades de melhoria e crescimento
 * Schema: id, orgId, unitId, titulo, descricao, prioridade, status, valorEstimado, responsavel, prazo
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
import { Plus, Trash2, Edit2, TrendingUp } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

type Oportunidade = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; descricao: string | null;
  prioridade: "baixa" | "media" | "alta";
  status: "identificada" | "em_avaliacao" | "aprovada" | "implementando" | "concluida" | "descartada";
  valorEstimado: string | null; responsavel: string | null; prazo: Date | null;
  createdAt: Date; updatedAt: Date;
};
const PRIO_COLORS: Record<string, string> = {
  baixa: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  media: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  alta: "bg-green-500/20 text-green-400 border-green-500/30",
};
const STATUS_LABELS: Record<string, string> = {
  identificada: "Identificada", em_avaliacao: "Em Avaliação", aprovada: "Aprovada",
  implementando: "Implementando", concluida: "Concluída", descartada: "Descartada",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function FormOportunidade({ initial, onSave, onClose }: {
  initial?: Partial<Oportunidade>;
  onSave: (d: { titulo: string; descricao?: string; prioridade: "baixa"|"media"|"alta"; status: "identificada"|"em_avaliacao"|"aprovada"|"implementando"|"concluida"|"descartada"; valorEstimado?: number; responsavel?: string; prazo?: string }) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [prioridade, setPrioridade] = useState<"baixa"|"media"|"alta">(initial?.prioridade ?? "media");
  const [status, setStatus] = useState<"identificada"|"em_avaliacao"|"aprovada"|"implementando"|"concluida"|"descartada">(initial?.status ?? "identificada");
  const [valorEstimado, setValorEstimado] = useState(initial?.valorEstimado ?? "");
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");
  const [prazo, setPrazo] = useState(initial?.prazo ? new Date(initial.prazo).toISOString().split("T")[0] : "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Expandir serviço de coloração" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Prioridade</Label>
          <Select value={prioridade} onValueChange={v => setPrioridade(v as typeof prioridade)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Valor Estimado (R$)</Label>
          <Input type="number" value={valorEstimado} onChange={e => setValorEstimado(e.target.value)} placeholder="0" className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Prazo</Label>
          <DatePicker value={prazo} onChange={setPrazo} placeholder="Prazo" />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Responsável</Label>
        <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável" className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes da oportunidade..." className="text-sm min-h-[80px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, descricao: descricao || undefined, prioridade, status, valorEstimado: valorEstimado ? parseFloat(valorEstimado) : undefined, responsavel: responsavel || undefined, prazo: prazo || undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function OportunidadesPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Oportunidade | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");

  const q = trpc.gestaoTotal.oportunidades.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, status: filterStatus !== "todos" ? filterStatus : undefined },
    { enabled: !!org?.id }
  );
  const oportunidades = (q.data ?? []) as unknown as Oportunidade[];

  const saveM = trpc.gestaoTotal.oportunidades.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.oportunidades.list.invalidate(); toast.success("Oportunidade salva!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.oportunidades.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.oportunidades.list.invalidate(); toast.success("Removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const totalEstimado = oportunidades.filter(o => o.status !== "descartada").reduce((s, o) => s + Number(o.valorEstimado ?? 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">{oportunidades.length} oportunidades • {fmt(totalEstimado)} estimado</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nova Oportunidade
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["todos", "identificada", "em_avaliacao", "aprovada", "implementando", "concluida"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{STATUS_LABELS[s] ?? "Todos"}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : oportunidades.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma oportunidade registrada</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Registrar oportunidade</Button>
          </div>
        </div>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="divide-y divide-border">
            {oportunidades.map(o => (
              <div key={o.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start gap-3 min-w-0">
                  <TrendingUp className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{o.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-xs ${PRIO_COLORS[o.prioridade] ?? ""}`}>{o.prioridade}</Badge>
                      {o.valorEstimado && <span className="text-xs text-green-400">{fmt(Number(o.valorEstimado))}</span>}
                      {o.responsavel && <span className="text-xs text-muted-foreground">{o.responsavel}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">{STATUS_LABELS[o.status]}</span>
                  <button onClick={() => setEditing(o)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteM.mutate({ id: o.id, orgId: o.orgId })} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Oportunidade</DialogTitle></DialogHeader>
          <FormOportunidade onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Oportunidade</DialogTitle></DialogHeader>
          {editing && <FormOportunidade initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
