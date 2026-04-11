/**
 * ArtHistoryPanel.tsx — Painel de histórico de artes geradas
 * Exibe miniaturas das imagens, briefing expandido, favoritos e botão de reutilizar.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Star, Trash2, RefreshCw, ChevronDown, ChevronUp,
  ImageIcon, Palette, Copy, History, Download,
} from "lucide-react";
import type { ArtWizardData, ArtResultado } from "@/components/ArtGeneratorWizard";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: number;
  orgId: number;
  unitId: number | null;
  assunto: string;
  tipoArte: string;
  objetivo: string;
  tema: string;
  descricao: string;
  briefing: string;
  tipoImagem: string;
  imagemUrl: string | null;
  resultado: ArtResultado;
  favoritado: boolean;
  createdAt: Date | string;
};

type Props = {
  orgId: number;
  unitId?: number;
  onReuse: (item: { wizardData: ArtWizardData; resultado: ArtResultado; imagemUrl: string | null }) => void;
};

// ── Labels de exibição ────────────────────────────────────────────────────────

const ASSUNTO_LABELS: Record<string, string> = {
  promocao: "Promoção",
  novo_servico: "Novo Serviço",
  institucional: "Institucional",
  data_comemorativa: "Data Comemorativa",
  depoimento: "Depoimento",
  bastidores: "Bastidores",
  produto: "Produto",
  outro: "Outro",
};

const TIPO_ARTE_LABELS: Record<string, string> = {
  post_instagram: "Post Instagram",
  story: "Story",
  reels_capa: "Capa de Reels",
  banner_whatsapp: "Banner WhatsApp",
  flyer_digital: "Flyer Digital",
  card_servico: "Card de Serviço",
  capa_destaque: "Capa de Destaque",
};

const TEMA_COLORS: Record<string, string> = {
  premium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  moderno: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  classico: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  minimalista: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  ousado: "bg-red-500/20 text-red-400 border-red-500/30",
  suave: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado!"));
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Card expandido com briefing completo ──────────────────────────────────────

function ArtDetailExpanded({ item }: { item: HistoryItem }) {
  const r = item.resultado;
  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3 text-xs">
      {/* Conceito */}
      <div className="space-y-1">
        <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Conceito</p>
        <div className="flex items-start gap-2">
          <p className="text-foreground flex-1">{r.conceito}</p>
          <button onClick={() => copyText(r.conceito)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Direção Visual */}
      <div className="space-y-1">
        <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Direção Visual</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Cores</p>
            <p className="text-foreground">{r.direcaoVisual.cores}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Tipografia</p>
            <p className="text-foreground">{r.direcaoVisual.tipografia}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Estilo de Imagem</p>
            <p className="text-foreground">{r.direcaoVisual.estiloImagem}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Elementos Visuais</p>
            <p className="text-foreground">{r.direcaoVisual.elementosVisuais}</p>
          </div>
        </div>
      </div>

      {/* Textos */}
      <div className="space-y-2">
        <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Textos</p>
        {[
          { label: "Headline", value: r.headline },
          { label: "Texto Secundário", value: r.textoSecundario },
          { label: "CTA", value: r.cta },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <div className="flex items-start gap-2">
              <p className="text-foreground flex-1">{value}</p>
              <button onClick={() => copyText(value)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Layout */}
      <div className="space-y-1">
        <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Estrutura de Layout</p>
        <div className="rounded-md bg-muted/40 p-2 space-y-1">
          {[
            { label: "Topo", value: r.layout.topo },
            { label: "Centro", value: r.layout.centro },
            { label: "Rodapé", value: r.layout.rodape },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">{label}:</span>
              <span className="text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt de imagem */}
      {r.promptImagem && (
        <div className="space-y-1">
          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Prompt de Imagem (IA)</p>
          <div className="flex items-start gap-2">
            <p className="text-foreground flex-1 italic">{r.promptImagem}</p>
            <button onClick={() => copyText(r.promptImagem)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card individual ───────────────────────────────────────────────────────────

function ArtHistoryCard({
  item,
  orgId,
  onReuse,
  onDeleted,
}: {
  item: HistoryItem;
  orgId: number;
  onReuse: Props["onReuse"];
  onDeleted: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const utils = trpc.useUtils();

  const toggleFavM = trpc.gestaoTotal.marketingCampaigns.toggleArtFavorite.useMutation({
    onMutate: async () => {
      await utils.gestaoTotal.marketingCampaigns.listArtHistory.cancel();
      const prev = utils.gestaoTotal.marketingCampaigns.listArtHistory.getData({ orgId, unitId: item.unitId ?? undefined, limit: 30 });
      utils.gestaoTotal.marketingCampaigns.listArtHistory.setData(
        { orgId, unitId: item.unitId ?? undefined, limit: 30 },
        (old) => old?.map(i => i.id === item.id ? { ...i, favoritado: !i.favoritado } : i)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.gestaoTotal.marketingCampaigns.listArtHistory.setData({ orgId, unitId: item.unitId ?? undefined, limit: 30 }, ctx.prev);
    },
    onSettled: () => utils.gestaoTotal.marketingCampaigns.listArtHistory.invalidate(),
  });

  const deleteM = trpc.gestaoTotal.marketingCampaigns.deleteArtHistory.useMutation({
    onSuccess: () => {
      toast.success("Arte removida do histórico");
      onDeleted(item.id);
      utils.gestaoTotal.marketingCampaigns.listArtHistory.invalidate();
    },
    onError: () => toast.error("Erro ao remover arte"),
  });

  return (
    <div className="glass-card border-purple-500/10 bg-purple-500/5 overflow-hidden">
      {/* Miniatura da imagem */}
      <div className="relative w-full aspect-square bg-muted/30 overflow-hidden">
        {item.imagemUrl ? (
          <img
            src={item.imagemUrl}
            alt={item.resultado.headline}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-30" />
            <span className="text-[10px] opacity-50">Sem imagem</span>
          </div>
        )}
        {/* Botões sobre a imagem: download + favorito */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          {item.imagemUrl && (
            <a
              href={item.imagemUrl}
              download={`arte-${item.assunto}-${item.id}.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full bg-black/40 text-white/70 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-colors"
              title="Baixar imagem"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => toggleFavM.mutate({ id: item.id, orgId, favoritado: item.favoritado })}
            className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
              item.favoritado
                ? "bg-yellow-500/90 text-white"
                : "bg-black/40 text-white/70 hover:bg-black/60"
            }`}
            title={item.favoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Star className={`h-3.5 w-3.5 ${item.favoritado ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>

      {/* Conteúdo do card */}
      <div className="p-3 space-y-2">
        {/* Headline */}
        <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
          {item.resultado.headline}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 bg-purple-500/10">
            {ASSUNTO_LABELS[item.assunto] ?? item.assunto}
          </Badge>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${TEMA_COLORS[item.tema] ?? "bg-muted/20 text-muted-foreground border-border"}`}>
            {item.tema}
          </Badge>
        </div>

        {/* Tipo de arte + data */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{TIPO_ARTE_LABELS[item.tipoArte] ?? item.tipoArte}</span>
          <span>{formatDate(item.createdAt)}</span>
        </div>

        {/* CTA preview */}
        <div className="rounded-md bg-muted/30 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">CTA</p>
          <p className="text-xs text-foreground font-medium line-clamp-1">{item.resultado.cta}</p>
        </div>

        {/* Ações */}
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            onClick={() => {
              onReuse({
                wizardData: {
                  assunto: item.assunto,
                  tipoArte: item.tipoArte,
                  objetivo: item.objetivo,
                  tema: item.tema,
                  descricao: item.descricao,
                  briefing: item.briefing,
                  tipoImagem: item.tipoImagem as "upload" | "ia" | "banco",
                  imagemUrl: item.imagemUrl ?? undefined,
                },
                resultado: item.resultado,
                imagemUrl: item.imagemUrl,
              });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <RefreshCw className="h-3 w-3" /> Reutilizar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1 border-border"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          {confirmDelete ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-xs"
              onClick={() => deleteM.mutate({ id: item.id, orgId })}
              disabled={deleteM.isPending}
            >
              Confirmar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Briefing expandido */}
        {expanded && <ArtDetailExpanded item={item} />}
      </div>
    </div>
  );
}

// ── Painel principal ──────────────────────────────────────────────────────────

export default function ArtHistoryPanel({ orgId, unitId, onReuse }: Props) {
  const [somentesFavoritos, setSomentesFavoritos] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const histQ = trpc.gestaoTotal.marketingCampaigns.listArtHistory.useQuery(
    { orgId, unitId, limit: 30, somentesFavoritos },
    { enabled: !!orgId }
  );

  const items = (histQ.data ?? []).filter(i => !deletedIds.has(i.id)) as HistoryItem[];

  if (histQ.isLoading) {
    return (
      <div className="glass-card border-purple-500/20 p-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <History className="h-4 w-4 animate-pulse" />
          Carregando histórico de artes...
        </div>
      </div>
    );
  }

  if (items.length === 0 && !somentesFavoritos) return null;

  return (
    <div className="glass-card border-purple-500/20 bg-purple-500/5 p-4 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Palette className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Histórico de Artes</h3>
            <p className="text-[11px] text-muted-foreground">{items.length} arte{items.length !== 1 ? "s" : ""} gerada{items.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={() => setSomentesFavoritos(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            somentesFavoritos
              ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className={`h-3 w-3 ${somentesFavoritos ? "fill-current" : ""}`} />
          Favoritas
        </button>
      </div>

      {/* Grid de cards */}
      {items.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nenhuma arte favorita ainda. Clique na estrela para favoritar.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map(item => (
            <ArtHistoryCard
              key={item.id}
              item={item}
              orgId={orgId}
              onReuse={onReuse}
              onDeleted={(id) => setDeletedIds(prev => new Set(Array.from(prev).concat(id)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
