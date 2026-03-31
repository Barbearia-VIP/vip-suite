/**
 * ProcessosPage.tsx — Processos operacionais com etapas e CRUD
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Circle, ClipboardList } from "lucide-react";

type Etapa = { titulo: string; descricao?: string; responsavel?: string; concluida: boolean };
type Processo = {
  id: number; orgId: number; unitId: number | null;
  nome: string; descricao: string | null; categoria: string | null;
  responsavel: string | null; etapas: unknown; ativo: number;
  createdAt: Date; updatedAt: Date;
};

function FormProcesso({ initial, onSave, onClose }: {
  initial?: Partial<Processo>;
  onSave: (d: { nome: string; descricao?: string; categoria?: string; responsavel?: string; etapas?: { titulo: string; concluida: boolean }[] }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "operacional");
  const [etapasText, setEtapasText] = useState(() => {
    if (!initial?.etapas) return "";
    const arr = initial.etapas as Etapa[];
    return Array.isArray(arr) ? arr.map(e => e.titulo).join("\n") : "";
  });
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Nome *</Label>
        <Input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Abertura da unidade" className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Objetivo do processo..." className="text-sm min-h-[60px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["operacional","atendimento","rh","financeiro","qualidade","marketing"].map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Responsável</Label>
          <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome ou cargo" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Etapas (uma por linha)</Label>
        <Textarea value={etapasText} onChange={e => setEtapasText(e.target.value)} placeholder={"Etapa 1\nEtapa 2\nEtapa 3"} className="text-sm min-h-[100px] font-mono" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({
          nome,
          descricao: descricao || undefined,
          categoria: categoria || undefined,
          responsavel: responsavel || undefined,
          etapas: etapasText ? etapasText.split("\n").filter(Boolean).map(t => ({ titulo: t.trim(), concluida: false })) : undefined,
        })} disabled={!nome.trim()}>Salvar</Button>
      </DialogFooter>
    </div>
  );
}

export default function ProcessosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Processo|null>(null);
  const [search, setSearch] = useState("");
  const q = trpc.gestaoTotal.processos.list.useQuery({ orgId:org?.id??0, unitId:selectedUnit?.id }, { enabled:!!org?.id });
  const processos = (q.data ?? []) as unknown as Processo[];
  const filtered = processos.filter(p=>!search||p.nome.toLowerCase().includes(search.toLowerCase()));
  const saveM = trpc.gestaoTotal.processos.save.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.processos.list.invalidate(); toast.success("Processo salvo!"); setShowForm(false); setEditing(null); },
    onError:()=>toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.processos.delete.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.processos.list.invalidate(); toast.success("Removido"); },
    onError:()=>toast.error("Erro ao remover"),
  });
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground">Processos Operacionais</h1><p className="text-sm text-muted-foreground">{processos.length} processos cadastrados</p></div>
        <Button size="sm" onClick={()=>setShowForm(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Processo</Button>
      </div>
      <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar processos..." className="max-w-sm text-sm" />
      {q.isLoading?<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-40 rounded-lg" />)}</div>
      :filtered.length===0?<Card className="bg-card border-border"><CardContent className="p-8 text-center"><ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum processo cadastrado</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>setShowForm(true)}>Criar processo</Button></CardContent></Card>
      :<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{filtered.map(p=>{
        const etapas: Etapa[] = Array.isArray(p.etapas) ? (p.etapas as Etapa[]) : [];
        return (
          <Card key={p.id} className="bg-card border-border hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0"><CardTitle className="text-sm truncate">{p.nome}</CardTitle><p className="text-xs text-muted-foreground capitalize mt-0.5">{p.categoria ?? "operacional"}</p></div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button onClick={()=>setEditing(p)} className="text-muted-foreground hover:text-foreground p-0.5"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={()=>deleteM.mutate({id:p.id,orgId:p.orgId})} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {etapas.slice(0, 4).map((e, i) => (
                <div key={i} className="flex items-center gap-2"><Circle className="w-3 h-3 text-muted-foreground shrink-0" /><span className="text-xs text-muted-foreground truncate">{e.titulo}</span></div>
              ))}
              {etapas.length>4&&<p className="text-xs text-muted-foreground pl-5">+{etapas.length-4} etapas</p>}
              {p.responsavel&&<p className="text-xs text-muted-foreground mt-1">Responsável: {p.responsavel}</p>}
            </CardContent>
          </Card>
        );
      })}</div>}
      <Dialog open={showForm} onOpenChange={setShowForm}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo Processo</DialogTitle></DialogHeader>
        <FormProcesso onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
      </DialogContent></Dialog>
      <Dialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Processo</DialogTitle></DialogHeader>
        {editing && <FormProcesso initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
      </DialogContent></Dialog>
    </div>
  );
}
