/**
 * ArtGeneratorWizard.tsx — Wizard de 7 telas para Criação de Arte
 * Gera briefing criativo + imagem via IA com padrão premium Barbearia VIP
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, ChevronLeft, Sparkles, Upload, Image as ImageIcon,
  Search, Copy, Check, Palette, Layout, Type, Zap, Target,
  FileImage, Download, RotateCcw, Star,
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
  tipoImagem: "upload" | "ia" | "banco";
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
  { value: "story", label: "📱 Story", desc: "Formato 9:16 (vertical)" },
  { value: "banner", label: "🖼️ Banner", desc: "Formato horizontal" },
  { value: "flyer_digital", label: "📄 Flyer digital", desc: "Distribuição online" },
  { value: "carrossel", label: "🎠 Carrossel", desc: "Múltiplos slides" },
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
  { value: "livre", label: "🎨 Livre", desc: "Sem restrição de estilo" },
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

function ArtResult({
  resultado, imagemUrl, tipoImagem, onReset,
}: {
  resultado: ArtResultado;
  imagemUrl: string | null;
  tipoImagem: "upload" | "ia" | "banco";
  onReset: () => void;
}) {
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
            <div className="rounded-xl overflow-hidden border border-border">
              <img src={imagemUrl} alt="Arte gerada" className="w-full object-cover max-h-64" />
              <div className="p-2 flex items-center justify-between bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {tipoImagem === "ia" ? "Imagem gerada por IA" : tipoImagem === "upload" ? "Imagem enviada" : "Imagem de referência"}
                </span>
                <a href={imagemUrl} target="_blank" rel="noopener noreferrer" download>
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

          {/* Layout */}
          <div className="rounded-xl bg-muted/20 border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Layout className="h-3.5 w-3.5 text-foreground" />
              <span className="text-xs font-bold text-foreground">Estrutura do Layout</span>
            </div>
            {[
              { label: "Topo", value: resultado.layout.topo, color: "text-blue-400" },
              { label: "Centro", value: resultado.layout.centro, color: "text-primary" },
              { label: "Rodapé", value: resultado.layout.rodape, color: "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-start gap-2">
                <span className={`text-xs font-bold w-12 shrink-0 ${color}`}>{label}</span>
                <span className="text-xs text-foreground flex-1">{value}</span>
              </div>
            ))}
          </div>

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

export default function ArtGeneratorWizard({
  onGenerate, isGenerating, result, onReset, onUploadImage, isUploading,
}: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<ArtWizardData>>({});
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (step === 7) return !!data.tipoImagem;
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
      imagemUrl: uploadedImageUrl ?? undefined,
    });
  };

  // Se já tem resultado, exibe
  if (result) {
    return (
      <div className="glass-card border-purple-500/20 bg-purple-500/5 p-5">
        <ArtResult
          resultado={result.resultado}
          imagemUrl={result.imagemUrl}
          tipoImagem={data.tipoImagem ?? "ia"}
          onReset={() => { onReset(); setStep(1); setData({}); setUploadedImageUrl(null); }}
        />
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

            {/* Opção: Banco */}
            <button
              onClick={() => { set("tipoImagem", "banco"); setUploadedImageUrl(null); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                data.tipoImagem === "banco"
                  ? "border-green-500/60 bg-green-500/10"
                  : "border-border bg-muted/20 hover:border-green-500/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                  <Search className="h-4.5 w-4.5 text-green-400" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${data.tipoImagem === "banco" ? "text-green-300" : "text-foreground"}`}>
                    Quero sugestões de banco de imagens
                  </p>
                  <p className="text-xs text-muted-foreground">A IA sugere palavras-chave para buscar no Unsplash, Pexels, etc.</p>
                </div>
                {data.tipoImagem === "banco" && (
                  <Badge className="ml-auto bg-green-500/20 text-green-300 border-green-500/30 text-xs">Selecionado</Badge>
                )}
              </div>
            </button>
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
  );
}
