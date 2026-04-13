/**
 * ArtGeneratorWizard.tsx — Wizard de 7 telas para Criação de Arte
 * Gera briefing criativo + imagem via IA com padrão premium Barbearia VIP
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, ChevronLeft, Sparkles, Upload, Image as ImageIcon,
  Search, Copy, Check, Palette, Layout, Type, Zap, Target,
  FileImage, Download, RotateCcw, Star, Edit2, X, Wand2, ZoomIn,
  AlertCircle, CheckCircle2, PenLine, LayoutGrid, ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ArtWizardData = {
  assunto: string;
  tipoArte: string;
  objetivo: string;
  tema: string;
  descricao: string;
  briefing: string;
  tipoImagem: "upload" | "ia" | "banco" | "banco-vip";
  imagemUrl?: string;
};

export type ArtResultado = {
  conceito: string;
  direcaoVisual: {
    cores: string;
    tipografia: string;
    estiloImagem: string;
    elementosVisuais: string;
  };
  headline: string;
  textoSecundario: string;
  cta: string;
  layout: { topo: string; centro: string; rodape: string };
  sugestaoImagem: string;
  promptImagem: string;
};

type Props = {
  onGenerate: (data: ArtWizardData) => void;
  isGenerating: boolean;
  result: { resultado: ArtResultado; imagemUrl: string | null } | null;
  onReset: () => void;
  onUploadImage?: (file: File) => Promise<string>; // retorna URL do S3
  isUploading?: boolean;
  onGenerateFlyer?: (layout: { topo: string; centro: string; rodape: string }, logoId?: number, textos?: { headline: string; textoSecundario: string; cta: string }, tipoArte?: string) => void;
  onRegenerateFlyer?: () => void;
  isGeneratingFlyer?: boolean;
  flyerResult?: { flyerUrl: string | null; prompt: string; logoUrl?: string | null; allLogos?: { url: string; nome: string | null }[]; logoWarning?: string | null } | null;
  orgId?: number; // para buscar imagens do Banco VIP
};

// ── Opções das telas ──────────────────────────────────────────────────────────

const ASSUNTOS = [
  { value: "promocao", label: "🏷️ Promoção", desc: "Desconto, oferta especial" },
  { value: "novo_servico", label: "✨ Novo serviço", desc: "Lançamento de serviço" },
  { value: "produto", label: "🧴 Produto", desc: "Produto à venda" },
  { value: "institucional", label: "🏆 Institucional", desc: "Marca, valores, história" },
  { value: "data_comemorativa", label: "🎉 Data comemorativa", desc: "Datas especiais" },
  { value: "outro", label: "✏️ Outro", desc: "Campo aberto" },
];

const TIPOS_ARTE = [
  { value: "post_instagram", label: "📸 Post Instagram", desc: "Formato 1:1 (quadrado)" },
  { value: "banner", label: "🖼️ Banner", desc: "Formato horizontal" },
  { value: "flyer_digital", label: "📄 Flyer digital", desc: "Distribuição online" },
];

const OBJETIVOS = [
  { value: "atrair_clientes", label: "🎯 Atrair novos clientes", desc: "Aumentar base de clientes" },
  { value: "gerar_agendamento", label: "📅 Gerar agendamento", desc: "Converter em marcação" },
  { value: "divulgar_promocao", label: "💰 Divulgar promoção", desc: "Comunicar oferta" },
  { value: "fortalecer_marca", label: "👑 Fortalecer marca", desc: "Posicionamento premium" },
  { value: "lancar_algo", label: "🚀 Lançar algo novo", desc: "Novidade para clientes" },
];

const TEMAS = [
  { value: "premium", label: "💎 Premium / Sofisticado", desc: "Padrão VIP — elegante e exclusivo" },
  { value: "moderno", label: "🌆 Moderno / Urbano", desc: "Contemporâneo e dinâmico" },
  { value: "minimalista", label: "⬜ Minimalista", desc: "Clean, espaço em branco, foco" },
  { value: "impactante", label: "🔥 Impactante / Promocional", desc: "Chamativo, cores fortes" },
];

// ── Componente de seleção de opção ────────────────────────────────────────────

function OptionCard({
  value, label, desc, selected, onClick,
}: { value: string; label: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
        selected
          ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
          : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <p className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </button>
  );
}

// ── Botão de cópia ────────────────────────────────────────────────────────────

function CopyBtn({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      })}
      className={`text-muted-foreground hover:text-foreground transition-colors p-1 rounded ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Resultado da arte ─────────────────────────────────────────────────────────

// Tipos para o spell-check
type SpellCheckResult = {
  original: { headline: string; textoSecundario: string; cta: string };
  corrected: { headline: string; textoSecundario: string; cta: string };
  changes: { headlineChanged: boolean; textoSecundarioChanged: boolean; ctaChanged: boolean };
  totalCorrections: number;
};

// Mapa de formatos com dimensões para exibição
const FORMATO_INFO: Record<string, { label: string; dims: string; ratio: string; emoji: string }> = {
  post_instagram: { label: "Post Instagram", dims: "1080×1080px", ratio: "1:1", emoji: "📸" },
  story:          { label: "Story / Reels",  dims: "1080×1920px", ratio: "9:16", emoji: "📱" },
  banner:         { label: "Banner",         dims: "1280×720px",  ratio: "16:9", emoji: "🖼️" },
  banner_whatsapp:{ label: "Banner WhatsApp",dims: "1600×900px",  ratio: "16:9", emoji: "💬" },
  flyer_digital:  { label: "Flyer Digital",  dims: "1080×1350px", ratio: "4:5",  emoji: "📄" },
  card_servico:   { label: "Card Serviço",   dims: "1080×1080px", ratio: "1:1",  emoji: "🎴" },
  carrossel:      { label: "Carrossel",      dims: "1080×1080px", ratio: "1:1",  emoji: "🎠" },
};

function ArtResult({
  resultado, imagemUrl, tipoImagem, tipoArte, onReset, onGenerateFlyer, isGeneratingFlyer, orgId,
}: {
  resultado: ArtResultado;
  imagemUrl: string | null;
  tipoImagem: "upload" | "ia" | "banco" | "banco-vip";
  tipoArte?: string;
  onReset: () => void;
  onGenerateFlyer?: (layout: { topo: string; centro: string; rodape: string }, logoId?: number, textos?: { headline: string; textoSecundario: string; cta: string }, tipoArte?: string) => void;
  isGeneratingFlyer?: boolean;
  orgId?: number;
}) {
  // Estado editável do layout
  const [layout, setLayout] = useState(resultado.layout);
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState(resultado.layout);
  // Seleção de logo para o flyer
  const [showLogoSelector, setShowLogoSelector] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<number | undefined>(undefined);
  // Spell-check e prévia editável
  const [showSpellPreview, setShowSpellPreview] = useState(false);
  const [spellResult, setSpellResult] = useState<SpellCheckResult | null>(null);
  const [editedTextos, setEditedTextos] = useState<{ headline: string; textoSecundario: string; cta: string } | null>(null);
  const [pendingLogoId, setPendingLogoId] = useState<number | undefined>(undefined);
  // Formato/dimensão do flyer
  const [selectedTipoArte, setSelectedTipoArte] = useState<string>(tipoArte ?? "post_instagram");
  const [showFormatSelector, setShowFormatSelector] = useState(false);

  // Buscar logos cadastradas
  const logosQ = trpc.gestaoTotal.brandAssets.listLogos.useQuery(
    { orgId: orgId ?? 0 },
    { enabled: !!orgId }
  );
  // Pré-selecionar a primeira logo assim que os dados chegarem
  useEffect(() => {
    if (logosQ.data && logosQ.data.length > 0 && selectedLogoId === undefined) {
      setSelectedLogoId(logosQ.data[0].id);
    }
  }, [logosQ.data]);
  // Mutation de spell-check
  const spellCheckMutation = trpc.gestaoTotal.marketingCampaigns.spellCheckFlyer.useMutation({
    onSuccess: (data: SpellCheckResult) => {
      setSpellResult(data);
      setEditedTextos({ ...data.corrected });
      setShowSpellPreview(true);
      setShowLogoSelector(false);
    },
    onError: () => {
      toast.error("Erro ao verificar ortografia. Gerando flyer com textos originais.");
      // Gera direto sem spell-check
      if (onGenerateFlyer) onGenerateFlyer(layout, pendingLogoId);
    },
  });

  const startEditLayout = () => { setLayoutDraft(layout); setEditingLayout(true); };
  const saveLayout = () => { setLayout(layoutDraft); setEditingLayout(false); toast.success("Layout atualizado!"); };
  const cancelLayout = () => { setEditingLayout(false); };

  // Inicia o fluxo: spell-check → prévia → gerar (logo já selecionada no painel acima)
  const handleGenerateFlyerClick = () => {
    if (!onGenerateFlyer) return;
    setPendingLogoId(selectedLogoId);
    runSpellCheck(selectedLogoId);
  };
  const confirmLogoAndRunSpellCheck = () => {
    setShowLogoSelector(false);
    setPendingLogoId(selectedLogoId);
    runSpellCheck(selectedLogoId);
  };
  const runSpellCheck = (logoId?: number) => {
    setPendingLogoId(logoId);
    spellCheckMutation.mutate({
      headline: resultado.headline,
      textoSecundario: resultado.textoSecundario,
      cta: resultado.cta,
    });
  };
  const confirmAndGenerate = () => {
    if (!onGenerateFlyer || !editedTextos) return;
    setShowSpellPreview(false);
    onGenerateFlyer(layout, pendingLogoId, editedTextos, selectedTipoArte);
  };
  const cancelSpellPreview = () => {
    setShowSpellPreview(false);
    setSpellResult(null);
    setEditedTextos(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Palette className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Arte criada com sucesso!</h3>
            <p className="text-xs text-muted-foreground">Briefing criativo + direção visual completa</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5 h-7 text-xs">
          <RotateCcw className="h-3 w-3" /> Nova arte
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna esquerda: Textos */}
        <div className="space-y-3">
          {/* Headline */}
          <div className="rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Headline</span>
              </div>
              <CopyBtn text={resultado.headline} />
            </div>
            <p className="text-lg font-bold text-foreground leading-tight">{resultado.headline}</p>
          </div>

          {/* Texto secundário */}
          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Texto secundário</span>
              <CopyBtn text={resultado.textoSecundario} />
            </div>
            <p className="text-sm text-foreground">{resultado.textoSecundario}</p>
          </div>

          {/* CTA */}
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-bold text-green-400">CTA</span>
              </div>
              <CopyBtn text={resultado.cta} />
            </div>
            <p className="text-sm font-semibold text-foreground">{resultado.cta}</p>
          </div>

          {/* Conceito */}
          <div className="rounded-xl bg-muted/20 border border-border p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400">Conceito criativo</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{resultado.conceito}</p>
          </div>
        </div>

        {/* Coluna direita: Visual + Layout */}
        <div className="space-y-3">
          {/* Imagem gerada */}
          {imagemUrl && (
            <div className="rounded-xl overflow-hidden border border-border group relative">
              <img src={imagemUrl} alt="Arte gerada" className="w-full object-cover max-h-64" />
              {/* Overlay de download ao hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                <a
                  href={imagemUrl}
                  download={`arte-vip-${resultado.headline.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2 bg-white/90 text-gray-900 font-semibold text-sm px-4 py-2 rounded-full shadow-lg hover:bg-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="h-4 w-4" /> Baixar Imagem
                </a>
              </div>
              <div className="p-2 flex items-center justify-between bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {tipoImagem === "ia" ? "Imagem gerada por IA" : tipoImagem === "upload" ? "Imagem enviada" : "Imagem de referência"}
                </span>
                <a
                  href={imagemUrl}
                  download={`arte-vip-${resultado.headline.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2">
                    <Download className="h-3 w-3" /> Baixar
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* Sugestão de imagem (quando não gerou) */}
          {!imagemUrl && (
            <div className="rounded-xl bg-muted/20 border border-border p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-blue-400">Sugestão de imagem</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{resultado.sugestaoImagem}</p>
            </div>
          )}

          {/* Direção visual */}
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Palette className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-bold text-purple-400">Direção Visual</span>
            </div>
            {[
              { label: "Cores", value: resultado.direcaoVisual.cores },
              { label: "Tipografia", value: resultado.direcaoVisual.tipografia },
              { label: "Estilo de imagem", value: resultado.direcaoVisual.estiloImagem },
              { label: "Elementos visuais", value: resultado.direcaoVisual.elementosVisuais },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-xs font-semibold text-muted-foreground w-24 shrink-0">{label}:</span>
                <span className="text-xs text-foreground flex-1">{value}</span>
              </div>
            ))}
          </div>

          {/* Layout — editável */}
          <div className="rounded-xl bg-muted/20 border border-border p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Layout className="h-3.5 w-3.5 text-foreground" />
                <span className="text-xs font-bold text-foreground">Estrutura do Layout</span>
              </div>
              {!editingLayout ? (
                <button onClick={startEditLayout} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div className="flex gap-1">
                  <button onClick={saveLayout} className="text-green-400 hover:text-green-300 transition-colors p-1 rounded">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={cancelLayout} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {editingLayout ? (
              <div className="space-y-2">
                {([
                  { key: "topo" as const, label: "Topo", color: "text-blue-400" },
                  { key: "centro" as const, label: "Centro", color: "text-primary" },
                  { key: "rodape" as const, label: "Rodapé", color: "text-muted-foreground" },
                ] as const).map(({ key, label, color }) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className={`text-xs font-bold w-12 shrink-0 pt-2 ${color}`}>{label}</span>
                    <Textarea
                      value={layoutDraft[key]}
                      onChange={(e) => setLayoutDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      rows={2}
                      className="text-xs flex-1 resize-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              [
                { label: "Topo", value: layout.topo, color: "text-blue-400" },
                { label: "Centro", value: layout.centro, color: "text-primary" },
                { label: "Rodapé", value: layout.rodape, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className={`text-xs font-bold w-12 shrink-0 ${color}`}>{label}</span>
                  <span className="text-xs text-foreground flex-1">{value}</span>
                </div>
              ))
            )}
          </div>

          {/* Seletor de logo — sempre visível quando há logos cadastradas */}
          {imagemUrl && onGenerateFlyer && (
            <div className="space-y-3">
              {/* Painel de seleção de logo */}
              <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <FileImage className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Logo do Flyer</span>
                </div>
                {logosQ.isLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Carregando logos...</span>
                  </div>
                ) : !logosQ.data || logosQ.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma logo cadastrada. Acesse Configurações → Logos para adicionar.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {/* Opção: sem logo */}
                    <button
                      onClick={() => setSelectedLogoId(undefined)}
                      className={`relative rounded-lg border-2 p-2 transition-all flex flex-col items-center gap-1.5 ${
                        selectedLogoId === undefined
                          ? "border-amber-400 bg-amber-500/10"
                          : "border-border bg-muted/20 hover:border-amber-500/40"
                      }`}
                    >
                      <div className="h-10 w-full flex items-center justify-center">
                        <X className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">Sem logo</span>
                      {selectedLogoId === undefined && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-black" />
                        </div>
                      )}
                    </button>
                    {/* Logos cadastradas */}
                    {logosQ.data.map((logo) => (
                      <button
                        key={logo.id}
                        onClick={() => setSelectedLogoId(logo.id)}
                        className={`relative rounded-lg border-2 p-2 transition-all flex flex-col items-center gap-1.5 ${
                          selectedLogoId === logo.id
                            ? "border-amber-400 bg-amber-500/10"
                            : "border-border bg-muted/20 hover:border-amber-500/40"
                        }`}
                      >
                        <div className="h-10 w-full flex items-center justify-center overflow-hidden">
                          <img src={logo.url} alt={logo.nome ?? "Logo"} className="max-h-10 max-w-full object-contain" />
                        </div>
                        <span className="text-[10px] text-foreground font-medium leading-tight text-center line-clamp-1">{logo.nome ?? "Logo"}</span>
                        {selectedLogoId === logo.id && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-black" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Botão Gerar Flyer */}
              <Button
                className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                onClick={handleGenerateFlyerClick}
                disabled={isGeneratingFlyer}
              >
                {isGeneratingFlyer ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando flyer...</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Gerar Flyer com esta Arte</>
                )}
              </Button>
            </div>
          )}

          {/* Painel de prévia ortográfica editável */}
          {showSpellPreview && spellResult && editedTextos && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <PenLine className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-400">Revisão ortográfica</p>
                    <p className="text-xs text-muted-foreground">
                      {spellResult.totalCorrections > 0
                        ? `${spellResult.totalCorrections} correção${spellResult.totalCorrections > 1 ? "ões" : ""} encontrada${spellResult.totalCorrections > 1 ? "s" : ""} — edite se necessário`
                        : "Nenhuma correção necessária — textos estão corretos"}
                    </p>
                  </div>
                </div>
                <button onClick={cancelSpellPreview} className="text-muted-foreground hover:text-foreground p-1 rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Seletor de formato/dimensão */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Formato do Flyer</span>
                  </div>
                  <button
                    onClick={() => setShowFormatSelector(!showFormatSelector)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Alterar</span>
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showFormatSelector ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {/* Formato atual selecionado */}
                {(() => {
                  const fmt = FORMATO_INFO[selectedTipoArte] ?? FORMATO_INFO["post_instagram"];
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{fmt.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{fmt.label}</p>
                        <p className="text-xs text-muted-foreground">{fmt.ratio} · {fmt.dims}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold">{fmt.ratio}</span>
                        <span className="text-xs text-muted-foreground">{fmt.dims}</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Lista de formatos para alterar */}
                {showFormatSelector && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {Object.entries(FORMATO_INFO).map(([key, fmt]) => (
                      <button
                        key={key}
                        onClick={() => { setSelectedTipoArte(key); setShowFormatSelector(false); }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                          selectedTipoArte === key
                            ? "border-amber-400 bg-amber-950/40 text-amber-400"
                            : "border-border hover:border-amber-400/40 hover:bg-muted/30 text-foreground"
                        }`}
                      >
                        <span className="text-base">{fmt.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{fmt.label}</p>
                          <p className="text-[10px] text-muted-foreground">{fmt.ratio} · {fmt.dims}</p>
                        </div>
                        {selectedTipoArte === key && <Check className="h-3 w-3 ml-auto shrink-0 text-amber-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campos editáveis */}
              <div className="space-y-3">
                {/* Headline */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">Headline</span>
                    {spellResult.changes.headlineChanged ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3" /> corrigido
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> ok
                      </span>
                    )}
                  </div>
                  {spellResult.changes.headlineChanged && (
                    <p className="text-xs text-muted-foreground line-through opacity-60">{spellResult.original.headline}</p>
                  )}
                  <Input
                    value={editedTextos.headline}
                    onChange={(e) => setEditedTextos(prev => prev ? { ...prev, headline: e.target.value } : prev)}
                    className="text-sm font-semibold h-9"
                  />
                </div>

                {/* Texto Secundário */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">Texto secundário</span>
                    {spellResult.changes.textoSecundarioChanged ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3" /> corrigido
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> ok
                      </span>
                    )}
                  </div>
                  {spellResult.changes.textoSecundarioChanged && (
                    <p className="text-xs text-muted-foreground line-through opacity-60">{spellResult.original.textoSecundario}</p>
                  )}
                  <Textarea
                    value={editedTextos.textoSecundario}
                    onChange={(e) => setEditedTextos(prev => prev ? { ...prev, textoSecundario: e.target.value } : prev)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>

                {/* CTA */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">CTA</span>
                    {spellResult.changes.ctaChanged ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3" /> corrigido
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> ok
                      </span>
                    )}
                  </div>
                  {spellResult.changes.ctaChanged && (
                    <p className="text-xs text-muted-foreground line-through opacity-60">{spellResult.original.cta}</p>
                  )}
                  <Input
                    value={editedTextos.cta}
                    onChange={(e) => setEditedTextos(prev => prev ? { ...prev, cta: e.target.value } : prev)}
                    className="text-sm h-9"
                  />
                </div>
              </div>

              {/* Botões de confirmação */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm" variant="outline"
                  className="flex-1 h-9 text-xs"
                  onClick={cancelSpellPreview}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold gap-1.5"
                  onClick={confirmAndGenerate}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Confirmar e Gerar Flyer
                </Button>
              </div>
            </div>
          )}

          {/* Estado de carregamento do spell-check */}
          {spellCheckMutation.isPending && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-400">Verificando ortografia...</p>
                <p className="text-xs text-muted-foreground">Revisando textos em português do Brasil</p>
              </div>
            </div>
          )}

          {/* Prompt de imagem (para referência) */}
          {resultado.promptImagem && (
            <div className="rounded-xl bg-muted/10 border border-border p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400">Prompt de imagem (IA)</span>
                </div>
                <CopyBtn text={resultado.promptImagem} />
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed">{resultado.promptImagem}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

// ── Resultado do Flyer ───────────────────────────────────────────────────────

function FlyerResult({ flyerUrl, allLogos, logoWarning, onRegenerate, isRegenerating }: {
  flyerUrl: string | null;
  prompt?: string;
  logoUrl?: string | null;
  allLogos?: { url: string; nome: string | null }[];
  logoWarning?: string | null;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Aviso se não houver logo cadastrada */}
      {logoWarning && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3 flex items-start gap-2">
          <span className="text-orange-400 text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-orange-400">Nenhuma logo cadastrada</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acesse Configurações → Logos para adicionar a logo oficial da Barbearia VIP. O flyer foi gerado sem logo.</p>
          </div>
        </div>
      )}
      {/* Logos usadas como referência */}
      {allLogos && allLogos.length > 0 && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3">
          <p className="text-xs font-semibold text-green-400 mb-2">✓ Logo(s) oficial(is) usada(s) como referência:</p>
          <div className="flex flex-wrap gap-2">
            {allLogos.map((logo, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-green-500/10 rounded px-2 py-1">
                <img src={logo.url} alt={logo.nome ?? `Logo ${i + 1}`} className="h-6 w-auto object-contain" />
                <span className="text-xs text-green-300">{logo.nome ?? `Logo ${i + 1}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Flyer gerado */}
      {!flyerUrl ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-center">
          <p className="text-sm text-amber-400 font-semibold">Flyer gerado sem imagem</p>
          <p className="text-xs text-muted-foreground mt-1">A IA não conseguiu gerar a imagem desta vez. Tente novamente.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="p-3 flex items-center justify-between border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">Flyer Gerado!</span>
            </div>
            <div className="flex items-center gap-2">
              {onRegenerate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-amber-500/40 hover:bg-amber-500/10 text-amber-400"
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <><div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> Gerando...</>
                  ) : (
                    <><RotateCcw className="h-3 w-3" /> Regenerar</>
                  )}
                </Button>
              )}
              <a
                href={flyerUrl}
                download={`flyer-vip-${Date.now()}.png`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-amber-500/40 hover:bg-amber-500/10">
                  <Download className="h-3 w-3" /> Baixar
                </Button>
              </a>
            </div>
          </div>
          <img src={flyerUrl} alt="Flyer gerado" className="w-full object-contain" />
        </div>
      )}
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

export default function ArtGeneratorWizard({
  onGenerate, isGenerating, result, onReset, onUploadImage, isUploading,
  onGenerateFlyer, onRegenerateFlyer, isGeneratingFlyer, flyerResult, orgId,
}: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<ArtWizardData>>({});
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [selectedBancoVipUrl, setSelectedBancoVipUrl] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null); // lightbox para visualizar imagem ampliada
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Buscar imagens do Banco VIP
  const imageBankQ = trpc.gestaoTotal.brandAssets.listImageBank.useQuery(
    { orgId: orgId ?? 0 },
    { enabled: !!orgId && step === 7 }
  );
  const TOTAL_STEPS = 7;

  const set = (field: keyof ArtWizardData, value: string) =>
    setData(prev => ({ ...prev, [field]: value }));

  const canNext = () => {
    if (step === 1) return !!data.assunto;
    if (step === 2) return !!data.tipoArte;
    if (step === 3) return !!data.objetivo;
    if (step === 4) return !!data.tema;
    if (step === 5) return !!(data.descricao?.trim());
    if (step === 6) return !!(data.briefing?.trim());
    if (step === 7) {
      if (data.tipoImagem === "banco-vip") return !!selectedBancoVipUrl;
      return !!data.tipoImagem;
    }
    return false;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage) return;
    try {
      const url = await onUploadImage(file);
      setUploadedImageUrl(url);
      set("imagemUrl", url);
      toast.success("Imagem enviada com sucesso!");
    } catch {
      toast.error("Erro ao enviar imagem");
    }
  };

  const handleGenerate = () => {
    if (!canNext()) return;
    onGenerate({
      assunto: data.assunto!,
      tipoArte: data.tipoArte!,
      objetivo: data.objetivo!,
      tema: data.tema!,
      descricao: data.descricao!,
      briefing: data.briefing!,
      tipoImagem: data.tipoImagem!,
      imagemUrl: data.tipoImagem === "banco-vip" ? (selectedBancoVipUrl ?? undefined) : (uploadedImageUrl ?? undefined),
    });
  };

  // Se já tem resultado, exibe
  if (result) {
    return (
      <div className="space-y-4">
        <div className="glass-card border-purple-500/20 bg-purple-500/5 p-5">
          <ArtResult
            resultado={result.resultado}
            imagemUrl={result.imagemUrl}
            tipoImagem={data.tipoImagem ?? "ia"}
            tipoArte={data.tipoArte}
            onReset={() => { onReset(); setStep(1); setData({}); setUploadedImageUrl(null); setSelectedBancoVipUrl(null); }}
            onGenerateFlyer={onGenerateFlyer ? (layout, logoId, textos, tipoArteOverride) => onGenerateFlyer(layout, logoId, textos, tipoArteOverride) : undefined}
            isGeneratingFlyer={isGeneratingFlyer}
            orgId={orgId}
          />
        </div>
        {/* Flyer gerado */}
        {isGeneratingFlyer && (
          <div className="glass-card border-amber-500/20 bg-amber-500/5 p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center animate-pulse">
                <Wand2 className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Gerando seu flyer...</p>
                <p className="text-sm text-muted-foreground mt-1">A IA está montando o flyer com base no briefing e na imagem</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Pode levar até 20 segundos</p>
            </div>
          </div>
        )}
        {flyerResult && !isGeneratingFlyer && (
          <div className="glass-card border-amber-500/20 bg-amber-500/5 p-5">
            <FlyerResult
              flyerUrl={flyerResult.flyerUrl}
              prompt={flyerResult.prompt}
              logoUrl={flyerResult.logoUrl}
              allLogos={flyerResult.allLogos}
              logoWarning={flyerResult.logoWarning}
              onRegenerate={onRegenerateFlyer}
              isRegenerating={isGeneratingFlyer}
            />
          </div>
        )}
      </div>
    );
  }

  // Tela de loading
  if (isGenerating) {
    return (
      <div className="glass-card border-purple-500/20 bg-purple-500/5 p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center animate-pulse">
            <Palette className="h-7 w-7 text-purple-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Criando sua arte...</p>
            <p className="text-sm text-muted-foreground mt-1">
              O diretor de arte VIP está trabalhando no seu briefing
              {data.tipoImagem === "ia" ? " e gerando a imagem" : ""}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          {data.tipoImagem === "ia" && (
            <p className="text-xs text-muted-foreground">A geração de imagem pode levar até 20 segundos</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="glass-card border-purple-500/20 bg-purple-500/5 p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Palette className="h-4.5 w-4.5 text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Criação de Arte</h3>
          <p className="text-xs text-muted-foreground">Briefing criativo + imagem com padrão VIP</p>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i + 1 < step ? "w-4 bg-purple-400" :
              i + 1 === step ? "w-6 bg-purple-400" :
              "w-1.5 bg-muted"
            }`} />
          ))}
        </div>
      </div>

      {/* Tela 1: Assunto */}
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Sobre o que é o material?</p>
            <p className="text-xs text-muted-foreground">Escolha o assunto principal da arte</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ASSUNTOS.map(opt => (
              <OptionCard key={opt.value} {...opt} selected={data.assunto === opt.value}
                onClick={() => set("assunto", opt.value)} />
            ))}
          </div>
          {data.assunto === "outro" && (
            <Textarea
              placeholder="Descreva o assunto do material..."
              value={data.descricao ?? ""}
              onChange={e => set("descricao", e.target.value)}
              className="text-sm h-20"
            />
          )}
        </div>
      )}

      {/* Tela 2: Tipo de arte */}
      {step === 2 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Qual formato da arte?</p>
            <p className="text-xs text-muted-foreground">Escolha o tipo de material a criar</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TIPOS_ARTE.map(opt => (
              <OptionCard key={opt.value} {...opt} selected={data.tipoArte === opt.value}
                onClick={() => set("tipoArte", opt.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Tela 3: Objetivo */}
      {step === 3 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">O que você quer com esse material?</p>
            <p className="text-xs text-muted-foreground">Defina o objetivo principal da arte</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OBJETIVOS.map(opt => (
              <OptionCard key={opt.value} {...opt} selected={data.objetivo === opt.value}
                onClick={() => set("objetivo", opt.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Tela 4: Tema visual */}
      {step === 4 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Qual estilo visual você quer?</p>
            <p className="text-xs text-muted-foreground">O tema define a identidade visual da arte</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TEMAS.map(opt => (
              <OptionCard key={opt.value} {...opt} selected={data.tema === opt.value}
                onClick={() => set("tema", opt.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Tela 5: Descrição */}
      {step === 5 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">O que precisa aparecer na arte?</p>
            <p className="text-xs text-muted-foreground">Informe os elementos essenciais do material</p>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Exemplos do que incluir:</p>
            {["Nome do serviço ou promoção", "Preço (se houver)", "Nome da unidade", "CTA (ex: Agende agora)", "Benefícios ou diferenciais"].map(ex => (
              <p key={ex} className="text-xs text-muted-foreground">• {ex}</p>
            ))}
          </div>
          <Textarea
            placeholder="Ex: Promoção de corte + barba por R$69,90. Unidade Centro. Válido até domingo. Agende pelo WhatsApp."
            value={data.descricao ?? ""}
            onChange={e => set("descricao", e.target.value)}
            className="text-sm h-28"
          />
        </div>
      )}

      {/* Tela 6: Briefing */}
      {step === 6 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Explique melhor o que você imaginou</p>
            <p className="text-xs text-muted-foreground">Quanto mais detalhes, melhor a arte gerada</p>
          </div>
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Star className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400">Dica VIP</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Descreva a sensação que quer transmitir, referências visuais que admira, 
              o que diferencia essa promoção das outras.
            </p>
          </div>
          <Textarea
            placeholder="Ex: Quero algo que transmita exclusividade e sofisticação. Inspirado em marcas de luxo. Fundo escuro com detalhes dourados. Homem confiante, bem vestido. Texto minimalista e impactante."
            value={data.briefing ?? ""}
            onChange={e => set("briefing", e.target.value)}
            className="text-sm h-32"
          />
        </div>
      )}

      {/* Tela 7: Imagem */}
      {step === 7 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Como deseja a imagem?</p>
            <p className="text-xs text-muted-foreground">Escolha a fonte da imagem principal da arte</p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {/* Opção: IA gera */}
            <button
              onClick={() => { set("tipoImagem", "ia"); setUploadedImageUrl(null); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                data.tipoImagem === "ia"
                  ? "border-purple-500/60 bg-purple-500/10"
                  : "border-border bg-muted/20 hover:border-purple-500/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4.5 w-4.5 text-purple-400" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${data.tipoImagem === "ia" ? "text-purple-300" : "text-foreground"}`}>
                    Quero que a IA gere uma imagem
                  </p>
                  <p className="text-xs text-muted-foreground">A IA cria uma imagem premium baseada no seu briefing</p>
                </div>
                {data.tipoImagem === "ia" && (
                  <Badge className="ml-auto bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">Selecionado</Badge>
                )}
              </div>
            </button>

            {/* Opção: Upload */}
            <button
              onClick={() => { set("tipoImagem", "upload"); if (fileInputRef.current) fileInputRef.current.click(); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                data.tipoImagem === "upload"
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-border bg-muted/20 hover:border-blue-500/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Upload className="h-4.5 w-4.5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${data.tipoImagem === "upload" ? "text-blue-300" : "text-foreground"}`}>
                    Quero enviar uma imagem
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uploadedImageUrl ? "✅ Imagem enviada com sucesso" : "Envie uma foto do ambiente, produto ou serviço"}
                  </p>
                </div>
                {isUploading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
              </div>
              {uploadedImageUrl && (
                <img src={uploadedImageUrl} alt="Preview" className="mt-3 w-full max-h-32 object-cover rounded-lg" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

            {/* Opção: Banco VIP */}
            <button
              onClick={() => { set("tipoImagem", "banco-vip"); setUploadedImageUrl(null); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                data.tipoImagem === "banco-vip"
                  ? "border-amber-500/60 bg-amber-500/10"
                  : "border-border bg-muted/20 hover:border-amber-500/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <ImageIcon className="h-4.5 w-4.5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${data.tipoImagem === "banco-vip" ? "text-amber-300" : "text-foreground"}`}>
                    Banco VIP — Imagens da empresa
                  </p>
                  <p className="text-xs text-muted-foreground">Use uma imagem do seu banco de imagens cadastrado nas Configurações</p>
                </div>
                {data.tipoImagem === "banco-vip" && (
                  <Badge className="ml-auto bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">Selecionado</Badge>
                )}
              </div>
            </button>
            {/* Grid de imagens do Banco VIP */}
            {data.tipoImagem === "banco-vip" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                {imageBankQ.isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground ml-2">Carregando imagens...</span>
                  </div>
                ) : !imageBankQ.data || imageBankQ.data.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs font-semibold text-amber-400">Nenhuma imagem no Banco VIP</p>
                    <p className="text-xs text-muted-foreground mt-1">Acesse Configurações → Banco de Imagens para adicionar fotos da empresa</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-amber-400 mb-2">Selecione uma imagem de referência:</p>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                      {imageBankQ.data.map((img) => (
                        <div key={img.id} className="relative group">
                          {/* Botão de seleção (cobre toda a área quadrada) */}
                          <button
                            onClick={() => {
                              setSelectedBancoVipUrl(img.url);
                              set("imagemUrl", img.url);
                            }}
                            className={`relative w-full aspect-square rounded-lg overflow-hidden border-2 transition-all block ${
                              selectedBancoVipUrl === img.url
                                ? "border-amber-400 ring-2 ring-amber-400/30"
                                : "border-border hover:border-amber-500/40"
                            }`}
                          >
                            <img src={img.url} alt={img.nome ?? "Imagem"} className="w-full h-full object-cover" />
                            {/* Overlay de selecionado */}
                            {selectedBancoVipUrl === img.url && (
                              <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                                <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                                  <Check className="h-3.5 w-3.5 text-black" />
                                </div>
                              </div>
                            )}
                            {/* Nome da imagem */}
                            {img.nome && (
                              <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5">
                                <p className="text-[10px] text-white truncate">{img.nome}</p>
                              </div>
                            )}
                          </button>
                          {/* Botão de lupa (canto superior direito, aparece no hover) */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setLightboxUrl(img.url); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            title="Ver imagem ampliada"
                          >
                            <ZoomIn className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {selectedBancoVipUrl && (
                      <p className="text-xs text-amber-400 mt-2">✓ Imagem selecionada — será refinada com identidade visual VIP</p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
        <Button
          variant="outline" size="sm"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 1}
          className="gap-1.5 h-8 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar
        </Button>

        <span className="text-xs text-muted-foreground">{step} / {TOTAL_STEPS}</span>

        {step < TOTAL_STEPS ? (
          <Button
            size="sm"
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext()}
            className="gap-1.5 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            Próximo <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={!canNext() || isGenerating}
            className="gap-1.5 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {data.tipoImagem === "ia" ? "Gerar arte + imagem" : "Gerar arte"}
          </Button>
        )}
      </div>
    </div>
    {/* Lightbox para visualizar imagem do Banco VIP ampliada */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        onClick={() => setLightboxUrl(null)}
      >
        <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1.5 text-sm"
          >
            <X className="h-4 w-4" /> Fechar
          </button>
          <img
            src={lightboxUrl}
            alt="Visualização ampliada"
            className="w-full h-auto max-h-[80vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      </div>
    )}
    </>
  );
}
