/**
 * ColaboradoresGtPage.tsx — Colaboradores do Gestão Total (diferente dos barbeiros do Data VIP)
 * Schema: id, orgId, unitId, nome, email, telefone, cargoId, salario, dataAdmissao, status, observacoes
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
import { PermissionGuard } from "@/components/PermissionGuard";
import { Plus, Trash2, Edit2, Users } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

type Colaborador = {
  id: number; orgId: number; unitId: number | null;
  nome: string; email: string | null; telefone: string | null;
  cargoId: number | null; salario: string | null;
  dataAdmissao: Date | null; status: "ativo" | "ferias" | "afastado" | "desligado";
  observacoes: string | null; createdAt: Date; updatedAt: Date;
};
const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-500/20 text-green-400 border-green-500/30",
  ferias: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  afastado: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  desligado: "bg-red-500/20 text-red-400 border-red-500/30",
};

function FormColaborador({ initial, onSave, onClose }: {
  initial?: Partial<Colaborador>;
  onSave: (d: { nome: string; email?: string; telefone?: string; salario?: number; dataAdmissao?: string; status: "ativo"|"ferias"|"afastado"|"desligado"; observacoes?: string }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [telefone, setTelefone] = useState(initial?.telefone ?? "");
  const [salario, setSalario] = useState(initial?.salario ?? "");
  const [dataAdmissao, setDataAdmissao] = useState(initial?.dataAdmissao ? new Date(initial.dataAdmissao).toISOString().split("T")[0] : "");
  const [status, setStatus] = useState<"ativo"|"ferias"|"afastado"|"desligado">(initial?.status ?? "ativo");
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Nome *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Telefone</Label>
          <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Salário (R$)</Label>
          <Input type="number" value={salario} onChange={e => setSalario(e.target.value)} placeholder="0,00" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Data de Admissão</Label>
          <DatePicker value={dataAdmissao} onChange={setDataAdmissao} placeholder="Data de admissão" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="ferias">Férias</SelectItem>
            <SelectItem value="afastado">Afastado</SelectItem>
            <SelectItem value="desligado">Desligado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Observações</Label>
        <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações adicionais..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ nome, email: email || undefined, telefone: telefone || undefined, salario: salario ? parseFloat(salario) : undefined, dataAdmissao: dataAdmissao || undefined, status, observacoes: observacoes || undefined })} disabled={!nome.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function ColaboradoresGtPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [search, setSearch] = useState("");

  const q = trpc.gestaoTotal.colaboradores.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const colaboradores = (q.data ?? []) as unknown as Colaborador[];
  const filtered = colaboradores.filter(c => {
    if (filterStatus !== "todos" && c.status !== filterStatus) return false;
    if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const saveM = trpc.gestaoTotal.colaboradores.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.colaboradores.list.invalidate(); toast.success("Colaborador salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.colaboradores.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.colaboradores.list.invalidate(); toast.success("Removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const ativos = colaboradores.filter(c => c.status === "ativo").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">{ativos} ativos de {colaboradores.length} total</p>
        </div>
        <PermissionGuard moduleKey="gestao_total" sectionKey="colaboradores">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Colaborador
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="max-w-xs text-sm" />
        {["todos", "ativo", "ferias", "afastado", "desligado"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{s}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Adicionar colaborador</Button>
          </div>
        </div>
      ) : (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="divide-y divide-border">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.email ?? c.telefone ?? ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                  <PermissionGuard moduleKey="gestao_total" sectionKey="colaboradores">
                    <button onClick={() => setEditing(c)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteM.mutate({ id: c.id, orgId: c.orgId })} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo Colaborador</DialogTitle></DialogHeader>
          <FormColaborador onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Colaborador</DialogTitle></DialogHeader>
          {editing && <FormColaborador initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
