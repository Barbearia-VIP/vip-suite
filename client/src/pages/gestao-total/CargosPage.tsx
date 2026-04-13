/**
 * CargosPage.tsx — Cargos e estrutura organizacional
 * Schema: id, orgId, nome, descricao, nivel (operacional|tatico|estrategico), salarioBase
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Plus, Trash2, Edit2, Briefcase } from "lucide-react";

type Cargo = {
  id: number; orgId: number; nome: string; descricao: string | null;
  nivel: "operacional" | "tatico" | "estrategico"; salarioBase: string | null;
  createdAt: Date; updatedAt: Date;
};
const NIVEL_COLORS = { operacional: "text-blue-400", tatico: "text-yellow-400", estrategico: "text-purple-400" };

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function FormCargo({ initial, onSave, onClose }: {
  initial?: Partial<Cargo>;
  onSave: (d: { nome: string; descricao?: string; nivel: "operacional"|"tatico"|"estrategico"; salarioBase?: number }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [nivel, setNivel] = useState<"operacional"|"tatico"|"estrategico">(initial?.nivel ?? "operacional");
  const [salario, setSalario] = useState(initial?.salarioBase ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Nome do Cargo *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Barbeiro Sênior" className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Nível Hierárquico</Label>
        <Select value={nivel} onValueChange={v => setNivel(v as typeof nivel)}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="operacional">Operacional</SelectItem>
            <SelectItem value="tatico">Tático</SelectItem>
            <SelectItem value="estrategico">Estratégico</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Salário Base (R$)</Label>
        <Input type="number" value={salario} onChange={e => setSalario(e.target.value)} placeholder="0,00" className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição / Responsabilidades</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Responsabilidades do cargo..." className="text-sm min-h-[80px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ nome, descricao: descricao || undefined, nivel, salarioBase: salario ? parseFloat(salario) : undefined })} disabled={!nome.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function CargosPage() {
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cargo | null>(null);

  const q = trpc.gestaoTotal.cargos.list.useQuery({ orgId: org?.id ?? 0 }, { enabled: !!org?.id });
  const cargos = (q.data ?? []) as unknown as Cargo[];

  const saveM = trpc.gestaoTotal.cargos.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.cargos.list.invalidate(); toast.success("Cargo salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.cargos.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.cargos.list.invalidate(); toast.success("Cargo removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const byNivel = { estrategico: cargos.filter(c => c.nivel === "estrategico"), tatico: cargos.filter(c => c.nivel === "tatico"), operacional: cargos.filter(c => c.nivel === "operacional") };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Cargos</h1>
          <p className="text-sm text-muted-foreground">{cargos.length} cargos cadastrados</p>
        </div>
        <PermissionGuard moduleKey="gestao_total" sectionKey="cargos">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Cargo
          </Button>
        </PermissionGuard>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : cargos.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum cargo cadastrado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Criar cargo</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {(["estrategico", "tatico", "operacional"] as const).map(nivel => byNivel[nivel].length > 0 && (
            <div key={nivel}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 capitalize ${NIVEL_COLORS[nivel]}`}>{nivel}</h3>
              <div className="glass-card bg-white/5 border-white/10">
                <div className="divide-y divide-border">
                  {byNivel[nivel].map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.nome}</p>
                        {c.descricao && <p className="text-xs text-muted-foreground truncate max-w-xs">{c.descricao}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        {c.salarioBase && <span className="text-sm text-muted-foreground">{fmt(Number(c.salarioBase))}</span>}
                        <PermissionGuard moduleKey="gestao_total" sectionKey="cargos">
                          <button onClick={() => setEditing(c)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteM.mutate({ id: c.id, orgId: c.orgId })} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </PermissionGuard>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Novo Cargo</DialogTitle></DialogHeader>
          <FormCargo onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Editar Cargo</DialogTitle></DialogHeader>
          {editing && <FormCargo initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
