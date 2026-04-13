/**
 * DocumentosPage.tsx — Repositório de documentos
 * Schema: id, orgId, unitId, titulo, descricao, categoria, urlArquivo, nomeArquivo, versao, createdBy
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
import { toast } from "sonner";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Plus, Trash2, Edit2, FileText, ExternalLink } from "lucide-react";

type Documento = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; descricao: string | null; categoria: string | null;
  urlArquivo: string | null; nomeArquivo: string | null; versao: string | null;
  createdBy: number | null; createdAt: Date; updatedAt: Date;
};

function FormDocumento({ initial, onSave, onClose }: {
  initial?: Partial<Documento>;
  onSave: (d: { titulo: string; descricao?: string; categoria?: string; urlArquivo?: string; nomeArquivo?: string; versao?: string }) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "geral");
  const [urlArquivo, setUrlArquivo] = useState(initial?.urlArquivo ?? "");
  const [nomeArquivo, setNomeArquivo] = useState(initial?.nomeArquivo ?? "");
  const [versao, setVersao] = useState(initial?.versao ?? "1.0");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Manual de Atendimento" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["geral", "rh", "financeiro", "operacional", "juridico", "marketing", "qualidade"].map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Versão</Label>
          <Input value={versao} onChange={e => setVersao(e.target.value)} placeholder="1.0" className="text-sm" />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">URL do Arquivo (Google Drive, Dropbox...)</Label>
        <Input value={urlArquivo} onChange={e => setUrlArquivo(e.target.value)} placeholder="https://drive.google.com/..." className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Nome do Arquivo</Label>
        <Input value={nomeArquivo} onChange={e => setNomeArquivo(e.target.value)} placeholder="manual_atendimento.pdf" className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Sobre este documento..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ titulo, descricao: descricao || undefined, categoria: categoria || undefined, urlArquivo: urlArquivo || undefined, nomeArquivo: nomeArquivo || undefined, versao: versao || undefined })} disabled={!titulo.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function DocumentosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Documento | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");

  const q = trpc.gestaoTotal.documentos.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, categoria: filterCat !== "todos" ? filterCat : undefined },
    { enabled: !!org?.id }
  );
  const documentos = (q.data ?? []) as unknown as Documento[];
  const filtered = documentos.filter(d => !search || d.titulo.toLowerCase().includes(search.toLowerCase()));

  const saveM = trpc.gestaoTotal.documentos.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.documentos.list.invalidate(); toast.success("Documento salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.documentos.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.documentos.list.invalidate(); toast.success("Removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">{documentos.length} documentos</p>
        </div>
        <PermissionGuard moduleKey="gestao_total" sectionKey="documentos">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Documento
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar documentos..." className="max-w-xs text-sm" />
        {["todos", "geral", "rh", "financeiro", "operacional", "juridico", "marketing"].map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterCat === c ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{c}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pt-0 p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum documento cadastrado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Adicionar documento</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(d => (
            <div className="glass-card bg-white/5 border-white/10 hover:border-primary/40 transition-colors" key={d.id}>
              <div className="p-6 pb-2 pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{d.titulo}</h3>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{d.categoria} {d.versao && `• v${d.versao}`}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {d.urlArquivo && <a href={d.urlArquivo} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary p-0.5"><ExternalLink className="w-3 h-3" /></a>}
                    <PermissionGuard moduleKey="gestao_total" sectionKey="documentos">
                      <button onClick={() => setEditing(d)} className="text-muted-foreground hover:text-foreground p-0.5"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => deleteM.mutate({ id: d.id, orgId: d.orgId })} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                    </PermissionGuard>
                  </div>
                </div>
              </div>
              {d.descricao && <div className="p-6 pt-0 pt-0"><p className="text-xs text-muted-foreground line-clamp-2">{d.descricao}</p></div>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo Documento</DialogTitle></DialogHeader>
          <FormDocumento onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Documento</DialogTitle></DialogHeader>
          {editing && <FormDocumento initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
