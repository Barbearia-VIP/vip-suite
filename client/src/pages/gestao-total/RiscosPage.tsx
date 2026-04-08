/**
 * RiscosPage.tsx — Matriz de riscos
 * Schema: id, orgId, unitId, titulo, descricao, probabilidade, impacto, status, mitigacao, responsavel
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Shield } from "lucide-react";

type Risco = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; descricao: string | null;
  probabilidade: "baixa" | "media" | "alta";
  impacto: "baixo" | "medio" | "alto";
  status: "identificado" | "monitorando" | "mitigado" | "aceito";
  mitigacao: string | null; responsavel: string | null;
  createdAt: Date; updatedAt: Date;
};

const NIVEL_RISCO: Record<string, Record<string, string>> = {
  baixa: { baixo: "Baixo", medio: "Baixo", alto: "Médio" },
  media: { baixo: "Baixo", medio: "Médio", alto: "Alto" },
  alta: { baixo: "Médio", medio: "Alto", alto: "Crítico" },
};
const RISCO_COLORS: Record<string, string> = {
  Baixo: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Médio: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Alto: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Crítico: "bg-red-500/20 text-red-400 border-red-500/30",
};

function FormRisco({ initial, onSave, onClose }: {
  initial?: Partial<Risco>;
  onSave: (d: { titulo: string; descricao?: string; probabilidade: "baixa"|"media"|"alta"; impacto: "baixo"|"medio"|"alto"; status: "identificado"|"monitorando"|"mitigado"|"aceito"; mitigacao?: string; responsavel?: string }) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [probabilidade, setProbabilidade] = useState<"baixa"|"media"|"alta">(initial?.probabilidade ?? "media");
  const [impacto, setImpacto] = useState<"baixo"|"medio"|"alto">(initial?.impacto ?? "medio");
  const [status, setStatus] = useState<"identificado"|"monitorando"|"mitigado"|"aceito">(initial?.status ?? "identificado");
  const [mitigacao, setMitigacao] = useState(initial?.mitigacao ?? "");
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");
  const nivel = NIVEL_RISCO[probabilidade]?.[impacto] ?? "Médio";
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Falta de produtos no estoque" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Probabilidade</Label>
          <Select value={probabilidade} onValueChange={v => setProbabilidade(v as typeof probabilidade)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Impacto</Label>
          <Select value={impacto} onValueChange={v => setImpacto(v as typeof impacto)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixo">Baixo</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="alto">Alto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Nível calculado:</span>
        <Badge variant="outline" className={`text-xs ${RISCO_COLORS[nivel] ?? ""}`}>{nivel}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="identificado">Identificado</SelectItem>
              <SelectItem value="monitorando">Monitorando</SelectItem>
              <SelectItem value="mitigado">Mitigado</SelectItem>
              <SelectItem value="aceito">Aceito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Responsável</Label>
          <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome" className="text-sm" />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Plano de Mitigação</Label>
        <Textarea value={mitigacao} onChange={e => setMitigacao(e.target.value)} placeholder="Como mitigar este risco..." className="text-sm min-h-[80px]" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do risco..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, descricao: descricao || undefined, probabilidade, impacto, status, mitigacao: mitigacao || undefined, responsavel: responsavel || undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function RiscosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Risco | null>(null);

  const q = trpc.gestaoTotal.riscos.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const riscos = (q.data ?? []) as unknown as Risco[];

  const saveM = trpc.gestaoTotal.riscos.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.riscos.list.invalidate(); toast.success("Risco salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.riscos.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.riscos.list.invalidate(); toast.success("Removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const criticos = riscos.filter(r => NIVEL_RISCO[r.probabilidade]?.[r.impacto] === "Crítico").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Riscos</h1>
          <p className="text-sm text-muted-foreground">{riscos.length} riscos mapeados {criticos > 0 && `• ${criticos} críticos`}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Mapear Risco
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : riscos.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum risco mapeado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Mapear risco</Button>
          </div>
        </div>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="divide-y divide-border">
            {riscos.map(r => {
              const nivel = NIVEL_RISCO[r.probabilidade]?.[r.impacto] ?? "Médio";
              return (
                <div key={r.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/30">
                  <div className="flex items-start gap-3 min-w-0">
                    <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={`text-xs ${RISCO_COLORS[nivel] ?? ""}`}>{nivel}</Badge>
                        <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                        {r.responsavel && <span className="text-xs text-muted-foreground">{r.responsavel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => setEditing(r)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteM.mutate({ id: r.id, orgId: r.orgId })} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Mapear Risco</DialogTitle></DialogHeader>
          <FormRisco onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Risco</DialogTitle></DialogHeader>
          {editing && <FormRisco initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
