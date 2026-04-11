/**
 * ConfiguracoesGtPage.tsx — Configurações do módulo Gestão Total
 * Inclui: Logo da Barbearia VIP, Banco de Imagens, e outras configurações.
 */
import { useState, useRef } from "react";
import { Settings, Image, Upload, Trash2, Edit2, Check, X, Plus, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Logo da Barbearia VIP ─────────────────────────────────────────────────────
function LogoSection({ orgId }: { orgId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: logo, isLoading } = trpc.gestaoTotal.brandAssets.getLogo.useQuery({ orgId });
  const saveLogoM = trpc.gestaoTotal.brandAssets.saveLogo.useMutation({
    onSuccess: () => { utils.gestaoTotal.brandAssets.getLogo.invalidate(); toast.success("Logo salva com sucesso!"); },
    onError: () => toast.error("Erro ao salvar a logo."),
  });
  const deleteLogoM = trpc.gestaoTotal.brandAssets.deleteLogo.useMutation({
    onSuccess: () => { utils.gestaoTotal.brandAssets.getLogo.invalidate(); toast.success("Logo removida."); },
    onError: () => toast.error("Erro ao remover a logo."),
  });

  async function handleUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("A logo deve ter no máximo 5 MB."); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Falha no upload");
      const { url, fileKey } = await res.json() as { url: string; fileKey: string };
      await saveLogoM.mutateAsync({ orgId, url, fileKey, nome: file.name });
    } catch {
      toast.error("Erro ao fazer upload da logo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="glass-card bg-white/5 border-white/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Logo da Barbearia VIP</h3>
          <p className="text-xs text-muted-foreground">Disponível para todas as unidades no Gerador de Arte</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 rounded-lg bg-white/5 animate-pulse" />
      ) : logo ? (
        <div className="flex items-start gap-4">
          <div className="w-40 h-28 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
            <img src={logo.url} alt="Logo VIP" className="max-w-full max-h-full object-contain p-2" />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-foreground font-medium">{logo.nome ?? "Logo"}</p>
            <p className="text-xs text-muted-foreground">Enviada em {new Date(logo.criadoEm).toLocaleDateString("pt-BR")}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="w-3 h-3 mr-1" /> Substituir
              </Button>
              <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300"
                onClick={() => deleteLogoM.mutate({ orgId })}>
                <Trash2 className="w-3 h-3 mr-1" /> Remover
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400/50 hover:bg-amber-400/5 transition-all"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Clique para enviar a logo da Barbearia VIP</p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou WEBP — máx. 5 MB</p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
      />
      {uploading && <p className="text-xs text-amber-400 animate-pulse">Enviando logo...</p>}
    </div>
  );
}

// ── Banco de Imagens ──────────────────────────────────────────────────────────
function ImageBankSection({ orgId }: { orgId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTags, setEditTags] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: images = [], isLoading } = trpc.gestaoTotal.brandAssets.listImageBank.useQuery({ orgId });
  const addM = trpc.gestaoTotal.brandAssets.addImageBank.useMutation({
    onSuccess: () => { utils.gestaoTotal.brandAssets.listImageBank.invalidate(); toast.success("Imagem adicionada ao banco!"); },
    onError: () => toast.error("Erro ao adicionar imagem."),
  });
  const updateM = trpc.gestaoTotal.brandAssets.updateImageBank.useMutation({
    onSuccess: () => { utils.gestaoTotal.brandAssets.listImageBank.invalidate(); setEditingId(null); toast.success("Imagem atualizada."); },
    onError: () => toast.error("Erro ao atualizar imagem."),
  });
  const deleteM = trpc.gestaoTotal.brandAssets.deleteImageBank.useMutation({
    onSuccess: () => { utils.gestaoTotal.brandAssets.listImageBank.invalidate(); setDeleteConfirm(null); toast.success("Imagem removida."); },
    onError: () => toast.error("Erro ao remover imagem."),
  });

  async function handleUploadMultiple(files: FileList) {
    setUploading(true);
    let count = 0;
    for (const file of Array.from(files)) {
      if (file.size > 16 * 1024 * 1024) { toast.error(`${file.name} excede 16 MB, ignorada.`); continue; }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload-image-bank", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Falha no upload");
        const { url, fileKey } = await res.json() as { url: string; fileKey: string };
        await addM.mutateAsync({ orgId, url, fileKey, nome: file.name.replace(/\.[^.]+$/, "") });
        count++;
      } catch { toast.error(`Erro ao enviar ${file.name}`); }
    }
    setUploading(false);
    if (count > 0) toast.success(`${count} imagem(ns) adicionada(s) ao banco!`);
  }

  function startEdit(img: typeof images[0]) {
    setEditingId(img.id);
    setEditNome(img.nome ?? "");
    setEditDesc(img.descricao ?? "");
    setEditTags(img.tags ?? "");
  }

  return (
    <div className="glass-card bg-white/5 border-white/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Image className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Banco de Imagens</h3>
            <p className="text-xs text-muted-foreground">Imagens disponíveis para todas as unidades na Criação de Arte</p>
          </div>
        </div>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Plus className="w-3 h-3 mr-1" /> Adicionar
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleUploadMultiple(e.target.files); e.target.value = ""; }}
      />

      {uploading && (
        <div className="flex items-center gap-2 text-purple-400 text-sm animate-pulse">
          <Upload className="w-4 h-4" /> Enviando imagens...
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div
          className="border-2 border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-purple-400/50 hover:bg-purple-400/5 transition-all"
          onClick={() => fileRef.current?.click()}
        >
          <Image className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma imagem no banco ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Clique para adicionar imagens de referência</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative rounded-lg overflow-hidden bg-white/5 border border-white/10 aspect-square">
              <img src={img.url} alt={img.nome ?? "Imagem"} className="w-full h-full object-cover" />
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                <div className="flex justify-end gap-1">
                  <button
                    className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center"
                    onClick={() => startEdit(img)}
                  >
                    <Edit2 className="w-3 h-3 text-white" />
                  </button>
                  <button
                    className="w-6 h-6 rounded bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center"
                    onClick={() => setDeleteConfirm(img.id)}
                  >
                    <Trash2 className="w-3 h-3 text-red-300" />
                  </button>
                </div>
                <div>
                  <p className="text-white text-xs font-medium truncate">{img.nome ?? "Sem nome"}</p>
                  {img.tags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {img.tags.split(",").slice(0, 2).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0">{t.trim()}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edição */}
      <Dialog open={editingId !== null} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar imagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome da imagem" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descreva a imagem..." className="mt-1" rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tags (separadas por vírgula)</label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="ex: barba, estilo, premium" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
            <Button onClick={() => editingId && updateM.mutate({ id: editingId, orgId, nome: editNome, descricao: editDesc, tags: editTags })}>
              <Check className="w-3 h-3 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover imagem</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover esta imagem do banco? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteM.mutate({ id: deleteConfirm, orgId })}>
              <Trash2 className="w-3 h-3 mr-1" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Outras configurações (placeholders) ──────────────────────────────────────
const OTHER_SECTIONS = [
  { icon: Settings, title: "Notificações", description: "Alertas de tarefas vencidas, problemas críticos e reuniões próximas.", color: "bg-blue-500/10 text-blue-400" },
  { icon: Settings, title: "Idioma e Região", description: "Fuso horário, formato de data e moeda padrão.", color: "bg-green-500/10 text-green-400" },
  { icon: Settings, title: "Exportação de Dados", description: "Exportar relatórios, tarefas e indicadores em Excel ou PDF.", color: "bg-orange-500/10 text-orange-400" },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function ConfiguracoesGtPage() {
  const { organization } = useApp();
  const orgId = organization?.id ?? 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Personalize o comportamento do módulo Gestão Total</p>
      </div>

      {/* Identidade Visual */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identidade Visual</h2>
        <LogoSection orgId={orgId} />
        <ImageBankSection orgId={orgId} />
      </div>

      {/* Outras configurações */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Outras Configurações</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {OTHER_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="glass-card bg-white/5 border-white/10 hover:border-primary/30 transition-colors rounded-xl p-5 cursor-pointer"
                onClick={() => toast.info("Em breve")}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${section.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{section.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
