/**
 * ContentHistoryPanel.tsx — Painel de histórico de conteúdos gerados
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  History, Star, Trash2, ChevronDown, ChevronUp,
  RefreshCw, Copy, Check, Target, Zap, MessageSquare, PlayCircle, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ContentIdeia = {
  titulo: string;
  conceito: string;
  execucao: string;
  gancho: string;
  roteiro: string;
  legendas: { emocional: string; vendedora: string; engajamento: string };
  cta: string;
};

type HistoryItem = {
  id: number;
  objetivo: string;
  formato: string;
  tipoEntrega: string;
  publico: string;
  tom: string;
  titulo: string | null;
  favoritado: boolean;
  ideias: unknown;
  createdAt: Date;
};

type Props = {
  orgId: number;
  unitId?: number;
  onReuse: (ideias: ContentIdeia[]) => void;
};

// ── Botão de cópia ────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      })}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Card expandido de uma ideia ───────────────────────────────────────────────

function IdeiaExpandida({ ideia, index }: { ideia: ContentIdeia; index: number }) {
  const [tabLegenda, setTabLegenda] = useState<"emocional" | "vendedora" | "engajamento">("emocional");
  const LEGENDA_LABELS = {
    emocional: { label: "Emocional", color: "text-pink-400 border-pink-400/30 bg-pink-400/10" },
    vendedora: { label: "Vendedora", color: "text-green-400 border-green-400/30 bg-green-400/10" },
    engajamento: { label: "Engajamento", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  };

  return (
    <div className="border border-border rounded-xl bg-muted/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="w-6 h-6 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <div>
          <p className="font-semibold text-sm text-foreground">{ideia.titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{ideia.conceito}</p>
        </div>
      </div>

      {/* Gancho */}
      <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="h-3 w-3 text-yellow-400" />
          <span className="text-xs font-semibold text-yellow-400">Gancho</span>
        </div>
        <p className="text-xs text-foreground">{ideia.gancho}</p>
      </div>

      {/* Execução */}
      <div className="rounded-lg bg-muted/40 border border-border p-2.5">
        <div className="flex items-center gap-1 mb-1">
          <PlayCircle className="h-3 w-3 text-primary" />
          <span className="text-xs font-semibold text-primary">Como executar</span>
        </div>
        <p className="text-xs text-muted-foreground whitespace-pre-line">{ideia.execucao}</p>
      </div>

      {/* Roteiro */}
      {ideia.roteiro && (
        <div className="rounded-lg bg-muted/40 border border-border p-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400">Roteiro</span>
            </div>
            <CopyBtn text={ideia.roteiro} />
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{ideia.roteiro}</p>
        </div>
      )}

      {/* Legendas */}
      <div className="rounded-lg bg-muted/40 border border-border p-2.5">
        <div className="flex items-center gap-1 mb-2">
          <MessageSquare className="h-3 w-3 text-foreground" />
          <span className="text-xs font-semibold text-foreground">Legendas</span>
        </div>
        <div className="flex gap-1 mb-2 flex-wrap">
          {(["emocional", "vendedora", "engajamento"] as const).map(t => (
            <button key={t} onClick={() => setTabLegenda(t)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors font-medium
                ${tabLegenda === t ? LEGENDA_LABELS[t].color : "border-border text-muted-foreground hover:text-foreground"}`}>
              {LEGENDA_LABELS[t].label}
            </button>
          ))}
        </div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-foreground flex-1">{ideia.legendas[tabLegenda]}</p>
          <CopyBtn text={ideia.legendas[tabLegenda]} />
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-2">
        <div className="flex items-center gap-1">
          <Target className="h-3 w-3 text-primary" />
          <span className="text-xs font-semibold text-primary">CTA</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-foreground">{ideia.cta}</span>
          <CopyBtn text={ideia.cta} />
        </div>
      </div>
    </div>
  );
}

// ── Card de item do histórico ─────────────────────────────────────────────────

function HistoryCard({
  item, onReuse, onToggleFav, onDelete,
}: {
  item: HistoryItem;
  onReuse: (ideias: ContentIdeia[]) => void;
  onToggleFav: (id: number, fav: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ideias = (item.ideias as ContentIdeia[]) ?? [];

  return (
    <div className={`glass-card border-white/10 transition-all ${item.favoritado ? "border-yellow-500/30 bg-yellow-500/5" : "bg-white/5"}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-foreground truncate">
                {item.titulo ?? ideias[0]?.titulo ?? "Conteúdo gerado"}
              </p>
              {item.favoritado && <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400 shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-xs py-0">{item.objetivo}</Badge>
              <Badge variant="secondary" className="text-xs py-0">{item.formato}</Badge>
              <Badge variant="secondary" className="text-xs py-0">{item.tom}</Badge>
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {format(new Date(item.createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>
        </div>

        {/* Preview das 3 ideias (títulos) */}
        {!expanded && (
          <div className="mt-3 space-y-1">
            {ideias.slice(0, 3).map((ideia, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-4 h-4 rounded bg-muted/60 text-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="truncate">{ideia.titulo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ideias expandidas */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {ideias.map((ideia, i) => (
              <IdeiaExpandida key={i} ideia={ideia} index={i} />
            ))}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Button
            size="sm" variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => { onReuse(ideias); window.scrollTo({ top: 0, behavior: "smooth" }); toast.success("Ideias carregadas!"); }}
          >
            <RefreshCw className="h-3 w-3" /> Reutilizar
          </Button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> Recolher</> : <><ChevronDown className="h-3.5 w-3.5" /> Ver detalhes</>}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onToggleFav(item.id, !item.favoritado)}
            className={`p-1.5 rounded transition-colors ${item.favoritado ? "text-yellow-400 hover:text-yellow-300" : "text-muted-foreground hover:text-yellow-400"}`}
            title={item.favoritado ? "Remover dos favoritos" : "Favoritar"}
          >
            <Star className={`h-3.5 w-3.5 ${item.favoritado ? "fill-yellow-400" : ""}`} />
          </button>
          <button
            onClick={() => { if (confirm("Remover este conteúdo do histórico?")) onDelete(item.id); }}
            className="p-1.5 rounded text-muted-foreground hover:text-red-400 transition-colors"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Painel principal ──────────────────────────────────────────────────────────

export default function ContentHistoryPanel({ orgId, unitId, onReuse }: Props) {
  const [somentesFavoritos, setSomentesFavoritos] = useState(false);
  const utils = trpc.useUtils();

  const historyQ = trpc.gestaoTotal.marketingCampaigns.listContentHistory.useQuery(
    { orgId, unitId, limit: 30, somentesFavoritos },
    { enabled: !!orgId }
  );

  const toggleFavM = trpc.gestaoTotal.marketingCampaigns.toggleContentFavorite.useMutation({
    onMutate: async ({ id, favoritado }) => {
      await utils.gestaoTotal.marketingCampaigns.listContentHistory.cancel();
      const prev = utils.gestaoTotal.marketingCampaigns.listContentHistory.getData({ orgId, unitId, limit: 30, somentesFavoritos });
      utils.gestaoTotal.marketingCampaigns.listContentHistory.setData(
        { orgId, unitId, limit: 30, somentesFavoritos },
        (old) => old?.map(item => item.id === id ? { ...item, favoritado } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.gestaoTotal.marketingCampaigns.listContentHistory.setData({ orgId, unitId, limit: 30, somentesFavoritos }, ctx.prev);
    },
    onSettled: () => utils.gestaoTotal.marketingCampaigns.listContentHistory.invalidate(),
  });

  const deleteM = trpc.gestaoTotal.marketingCampaigns.deleteContentHistory.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.marketingCampaigns.listContentHistory.invalidate();
      toast.success("Removido do histórico");
    },
  });

  const items = (historyQ.data ?? []) as HistoryItem[];

  if (items.length === 0 && !historyQ.isLoading) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Histórico de Conteúdos</h3>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">{items.length}</Badge>
          )}
        </div>
        <button
          onClick={() => setSomentesFavoritos(f => !f)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors
            ${somentesFavoritos
              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
              : "border-border text-muted-foreground hover:text-foreground"
            }`}
        >
          <Star className={`h-3 w-3 ${somentesFavoritos ? "fill-yellow-400" : ""}`} />
          {somentesFavoritos ? "Todos" : "Favoritos"}
        </button>
      </div>

      {/* Lista */}
      {historyQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {somentesFavoritos ? "Nenhum conteúdo favoritado ainda." : "Nenhum conteúdo no histórico."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <HistoryCard
              key={item.id}
              item={item}
              onReuse={onReuse}
              onToggleFav={(id, fav) => toggleFavM.mutate({ id, orgId, favoritado: fav })}
              onDelete={(id) => deleteM.mutate({ id, orgId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
