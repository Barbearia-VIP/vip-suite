/**
 * InstrucoesPage.tsx — Instruções de Trabalho (SOPs)
 * Schema: id, orgId, unitId, titulo, conteudo, categoria, versao
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
import { Plus, Trash2, Edit2, BookOpen, Eye } from "lucide-react";

type Instrucao = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; conteudo: string | null; categoria: string | null;
  versao: string | null; createdAt: Date; updatedAt: Date;
};

function FormInstrucao({ initial, onSave, onClose }: {
  initial?: Partial<Instrucao>;
  onSave: (d: { titulo: string; conteudo?: string; categoria?: string; versao?: string }) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [conteudo, setConteudo] = useState(initial?.conteudo ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "operacional");
  const [versao, setVersao] = useState(initial?.versao ?? "1.0");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Como realizar o atendimento inicial" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["operacional", "atendimento", "rh", "financeiro", "qualidade", "seguranca"].map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Versão</Label>
          <Input value={versao} onChange={e => setVersao(e.target.value)} placeholder="1.0" className="text-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Conteúdo / Passos</Label>
        <Textarea value={conteudo} onChange={e => setConteudo(e.target.value)} placeholder="Descreva os passos detalhados..." className="text-sm min-h-[150px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, conteudo: conteudo || undefined, categoria: categoria || undefined, versao: versao || undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function InstrucoesPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Instrucao | null>(null);
  const [viewing, setViewing] = useState<Instrucao | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");

  const q = trpc.gestaoTotal.instrucoes.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, categoria: filterCat !== "todos" ? filterCat : undefined },
    { enabled: !!org?.id }
  );
  const instrucoes = (q.data ?? []) as unknown as Instrucao[];
  const filtered = instrucoes.filter(i => !search || i.titulo.toLowerCase().includes(search.toLowerCase()));

  const saveM = trpc.gestaoTotal.instrucoes.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.instrucoes.list.invalidate(); toast.success("Instrução salva!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.instrucoes.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.instrucoes.list.invalidate(); toast.success("Removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Instruções de Trabalho</h1>
          <p className="text-sm text-muted-foreground">{instrucoes.length} instruções cadastradas</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nova Instrução
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar instruções..." className="max-w-xs text-sm" />
        {["todos", "operacional", "atendimento", "rh", "financeiro", "qualidade", "seguranca"].map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterCat === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{c}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma instrução cadastrada</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Criar instrução</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(i => (
            <Card key={i.id} className="bg-card border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{i.titulo}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{i.categoria} {i.versao && `• v${i.versao}`}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button onClick={() => setViewing(i)} className="text-muted-foreground hover:text-foreground p-0.5"><Eye className="w-3 h-3" /></button>
                    <button onClick={() => setEditing(i)} className="text-muted-foreground hover:text-foreground p-0.5"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => deleteM.mutate({ id: i.id, orgId: i.orgId })} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground line-clamp-3">{i.conteudo ?? "Sem conteúdo"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visualizar */}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewing?.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground capitalize">{viewing?.categoria} {viewing?.versao && `• v${viewing.versao}`}</p>
            <div className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-3">{viewing?.conteudo ?? "Sem conteúdo"}</div>
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setViewing(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Instrução</DialogTitle></DialogHeader>
          <FormInstrucao onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Instrução</DialogTitle></DialogHeader>
          {editing && <FormInstrucao initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
