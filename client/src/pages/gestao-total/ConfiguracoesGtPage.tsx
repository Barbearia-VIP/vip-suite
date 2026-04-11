/**
 * ConfiguracoesGtPage.tsx — Configurações do módulo Gestão Total
 * Inclui: Logo da Barbearia VIP (múltiplas versões), Banco de Imagens, e outras configurações.
 */
import { useState, useRef } from "react";
import { Settings, Image, Upload, Trash2, Edit2, Check, X, Plus, ImageIcon, Star } from "lucide-react";
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

// ── Logo da Barbearia VIP (múltiplas versões) ─────────────────────────────────
function LogoSection({ orgId }: { orgId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [addNome, setAddNome] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [pendingFile, setPendingFile] = useState<{ url: string; fileKey: string; fileName: string } | null>(null);

  const { data: logos = [], isLoading } = trpc.gestaoTotal.brandAssets.listLogos.useQuery({ orgId });

  const addLogoM = trpc.gestaoTotal.brandAssets.addLogo.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.brandAssets.listLogos.invalidate();
      utils.gestaoTotal.brandAssets.getLogo.invalidate();
      setPendingFile(null);
      setAddNome("");
      setAddDesc("");
      toast.success("Logo adicionada com sucesso!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar a logo."),
  });

  const updateLogoM = trpc.gestaoTotal.brandAssets.updateLogo.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.brandAssets.listLogos.invalidate();
      setEditingId(null);
      toast.success("Logo atualizada.");
    },
    onError: () => toast.error("Erro ao atualizar a logo."),
  });

  const deleteLogoM = trpc.gestaoTotal.brandAssets.deleteLogoById.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.brandAssets.listLogos.invalidate();
      utils.gestaoTotal.brandAssets.getLogo.invalidate();
      setDeleteConfirm(null);
      toast.success("Logo removida.");
    },
    onError: () => toast.error("Erro ao remover a logo."),
  });

  async function handleFileSelect(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("A logo deve ter no máximo 5 MB."); return; }
    if (logos.length >= 4) { toast.error("Limite de 4 logos atingido. Remova uma antes de adicionar."); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Falha no upload");
      const { url, fileKey } = await res.json() as { url: string; fileKey: string };
      setPendingFile({ url, fileKey, fileName: file.name.replace(/\.[^.]+$/, "") });
      setAddNome(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      toast.error("Erro ao fazer upload da logo.");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(logo: typeof logos[0]) {
    setEditingId(logo.id);
    setEditNome(logo.nome ?? "");
    setEditDesc(logo.descricao ?? "");
  }

  const canAdd = logos.length < 4;

  return (
    <div className="glass-card bg-white/5 border-white/10 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Logos da Barbearia VIP</h3>
            <p className="text-xs text-muted-foreground">
              Até 4 versões — disponíveis para todas as unidades no Gerador de Arte
            </p>
          </div>
        </div>
        {canAdd && (
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Plus className="w-3 h-3 mr-1" /> Adicionar Logo
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
      />

      {uploading && <p className="text-xs text-amber-400 animate-pulse flex items-center gap-1"><Upload className="w-3 h-3" /> Enviando logo...</p>}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : logos.length === 0 ? (
        <div
          className="border-2 border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-amber-400/50 hover:bg-amber-400/5 transition-all"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Clique para enviar a primeira versão da logo</p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP ou SVG — máx. 5 MB por arquivo</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {logos.map((logo, idx) => (
            <div key={logo.id} className="group relative rounded-xl overflow-hidden bg-white/5 border border-white/10">
              {/* Miniatura */}
              <div className="aspect-video flex items-center justify-center bg-white/5 p-3">
                <img src={logo.url} alt={logo.nome ?? "Logo"} className="max-w-full max-h-full object-contain" />
              </div>
              {/* Overlay de ações */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  title="Editar nome/descrição"
                  onClick={() => startEdit(logo)}
                >
                  <Edit2 className="w-3.5 h-3.5 text-white" />
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center"
                  title="Remover logo"
                  onClick={() => setDeleteConfirm(logo.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-300" />
                </button>
              </div>
              {/* Badge de versão */}
              <div className="p-2 space-y-0.5">
                <p className="text-xs font-medium text-foreground truncate">{logo.nome ?? `Logo ${idx + 1}`}</p>
                {logo.descricao && <p className="text-[10px] text-muted-foreground truncate">{logo.descricao}</p>}
              </div>
            </div>
          ))}
          {/* Slot vazio para adicionar */}
          {canAdd && (
            <div
              className="aspect-video rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center cursor-pointer hover:border-amber-400/50 hover:bg-amber-400/5 transition-all col-span-1"
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="w-6 h-6 text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground">Adicionar versão</p>
              <p className="text-[9px] text-muted-foreground">{4 - logos.length} restante(s)</p>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmação de nome ao adicionar */}
      <Dialog open={pendingFile !== null} onOpenChange={(o) => !o && setPendingFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Identificar esta versão da logo</DialogTitle>
          </DialogHeader>
          {pendingFile && (
            <div className="space-y-4">
              <div className="rounded-lg bg-white/5 p-4 flex items-center justify-center">
                <img src={pendingFile.url} alt="Preview" className="max-h-32 object-contain" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome da versão *</label>
                <Input
                  placeholder="Ex: Logo Horizontal Branca, Logo Ícone Dourado..."
                  value={addNome}
                  onChange={(e) => setAddNome(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                <Input
                  placeholder="Ex: Para fundo escuro, tamanho mínimo 200px..."
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingFile(null)}>Cancelar</Button>
            <Button
              disabled={!addNome.trim() || addLogoM.isPending}
              onClick={() => {
                if (!pendingFile) return;
                addLogoM.mutate({
                  orgId,
                  url: pendingFile.url,
                  fileKey: pendingFile.fileKey,
                  nome: addNome.trim(),
                  descricao: addDesc.trim() || undefined,
                });
              }}
            >
              {addLogoM.isPending ? "Salvando..." : "Salvar Logo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição */}
      <Dialog open={editingId !== null} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar versão da logo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Nome da versão</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome da versão" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrição opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button
              disabled={updateLogoM.isPending}
              onClick={() => {
                if (!editingId) return;
                updateLogoM.mutate({ id: editingId, orgId, nome: editNome.trim() || undefined, descricao: editDesc.trim() || undefined });
              }}
            >
              {updateLogoM.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de remoção */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover esta versão da logo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteLogoM.isPending}
              onClick={() => { if (deleteConfirm) deleteLogoM.mutate({ id: deleteConfirm, orgId }); }}
            >
              {deleteLogoM.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome da imagem" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrição opcional" rows={2} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Tags (separadas por vírgula)</label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Ex: ambiente, barbearia, masculino" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button
              disabled={updateM.isPending}
              onClick={() => {
                if (!editingId) return;
                updateM.mutate({ id: editingId, orgId, nome: editNome.trim() || undefined, descricao: editDesc.trim() || undefined, tags: editTags.trim() || undefined });
              }}
            >
              {updateM.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de remoção */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover imagem do banco?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteM.isPending}
              onClick={() => { if (deleteConfirm) deleteM.mutate({ id: deleteConfirm, orgId }); }}
            >
              {deleteM.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ConfiguracoesGtPage() {
  const { organization } = useApp();
  const orgId = organization?.id;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Configurações do Gestão Total</h1>
          <p className="text-sm text-muted-foreground">Gerencie ativos visuais e configurações globais da organização</p>
        </div>
      </div>

      <LogoSection orgId={orgId} />
      <ImageBankSection orgId={orgId} />
    </div>
  );
}
