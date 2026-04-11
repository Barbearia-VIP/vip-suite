/**
 * ContentGeneratorWizard.tsx — Wizard de 6 telas para Gerador de Conteúdo da Barbearia VIP
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Target, Video, FileText, Users, Star, Mic,
  ChevronRight, ChevronLeft, Sparkles, Copy, Check,
  Lightbulb, Zap, MessageSquare, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ContentWizardData = {
  objetivo: string;
  formato: string;
  tipoEntrega: string;
  publico: string;
  diferenciais: string;
  tom: string;
};

type ContentIdeia = {
  titulo: string;
  conceito: string;
  execucao: string;
  gancho: string;
  roteiro: string;
  legendas: { emocional: string; vendedora: string; engajamento: string };
  cta: string;
};

type Props = {
  onGenerate: (data: ContentWizardData) => void;
  isGenerating: boolean;
  result: ContentIdeia[] | null;
  onReset: () => void;
};

// ── Opções de cada tela ───────────────────────────────────────────────────────

const OBJETIVOS = [
  { value: "Captar novos clientes", icon: "🎯" },
  { value: "Reativar clientes antigos", icon: "🔄" },
  { value: "Fortalecer a marca", icon: "💎" },
  { value: "Prova social (mostrar clientes/resultados)", icon: "⭐" },
  { value: "Vender produto", icon: "🛍️" },
  { value: "Engajamento / viral", icon: "🔥" },
];

const FORMATOS = [
  { value: "Vídeo (Reels/TikTok)", icon: "🎬" },
  { value: "Foto (post feed)", icon: "📸" },
  { value: "Carrossel", icon: "🖼️" },
  { value: "Story", icon: "📱" },
  { value: "Ainda não sei", icon: "🤔" },
];

const TIPOS_ENTREGA = [
  { value: "Roteiro completo", icon: "📝" },
  { value: "Ideia + legenda", icon: "💡" },
  { value: "Ideia + roteiro + legenda", icon: "✨" },
  { value: "Só ideias", icon: "🧠" },
];

const PUBLICOS = [
  { value: "Clientes novos", icon: "👋" },
  { value: "Clientes recorrentes", icon: "🤝" },
  { value: "Público premium", icon: "👑" },
  { value: "Público jovem", icon: "⚡" },
  { value: "Público geral", icon: "🌍" },
];

const DIFERENCIAIS_SUGESTOES = [
  "Ambiente premium", "Open bar", "Atendimento diferenciado",
  "Profissionais experientes", "Localização", "Experiência VIP",
];

const TONS = [
  { value: "Engraçado / leve", icon: "😄" },
  { value: "Autoridade", icon: "🏆" },
  { value: "Emocional", icon: "❤️" },
  { value: "Direto e vendedor", icon: "💰" },
  { value: "Inspiracional", icon: "🌟" },
  { value: "Padrão VIP", icon: "💎" },
];

// ── Componente de seleção de opção ────────────────────────────────────────────

function OptionCard({
  value, icon, selected, onClick,
}: { value: string; icon: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium flex items-center gap-3
        ${selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-muted/30 text-foreground hover:border-primary/40 hover:bg-primary/5"
        }`}
    >
      <span className="text-base shrink-0">{icon}</span>
      <span>{value}</span>
      {selected && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
    </button>
  );
}

// ── Componente de cópia ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
      title="Copiar"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Card de resultado ─────────────────────────────────────────────────────────

function IdeiaCard({ ideia, index }: { ideia: ContentIdeia; index: number }) {
  const [tabLegenda, setTabLegenda] = useState<"emocional" | "vendedora" | "engajamento">("emocional");

  const LEGENDA_LABELS = {
    emocional: { label: "Emocional", color: "text-pink-400 border-pink-400/30 bg-pink-400/10" },
    vendedora: { label: "Vendedora", color: "text-green-400 border-green-400/30 bg-green-400/10" },
    engajamento: { label: "Engajamento", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  };

  return (
    <div className="glass-card border-white/10 bg-white/5 space-y-4">
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {index + 1}
          </div>
          <div>
            <h3 className="font-bold text-foreground leading-tight">{ideia.titulo}</h3>
            <p className="text-xs text-muted-foreground mt-1">{ideia.conceito}</p>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-3">
        {/* Gancho */}
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">Gancho (primeiros 3 segundos)</span>
          </div>
          <p className="text-sm text-foreground">{ideia.gancho}</p>
        </div>

        {/* Execução */}
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <PlayCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Como executar</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{ideia.execucao}</p>
        </div>

        {/* Roteiro (se existir) */}
        {ideia.roteiro && (
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-purple-400">Roteiro</span>
              </div>
              <CopyButton text={ideia.roteiro} />
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{ideia.roteiro}</p>
          </div>
        )}

        {/* Legendas */}
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageSquare className="h-3.5 w-3.5 text-foreground" />
            <span className="text-xs font-semibold text-foreground">Legendas</span>
          </div>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {(["emocional", "vendedora", "engajamento"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTabLegenda(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium
                  ${tabLegenda === t ? LEGENDA_LABELS[t].color : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {LEGENDA_LABELS[t].label}
              </button>
            ))}
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-foreground flex-1">{ideia.legendas[tabLegenda]}</p>
            <CopyButton text={ideia.legendas[tabLegenda]} />
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">CTA sugerido</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">{ideia.cta}</span>
            <CopyButton text={ideia.cta} />
          </div>
        </div>
      </div>

      <div className="h-1" />
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

export default function ContentGeneratorWizard({ onGenerate, isGenerating, result, onReset }: Props) {
  const [step, setStep] = useState(0);
  const [objetivo, setObjetivo] = useState("");
  const [objetivoCustom, setObjetivoCustom] = useState("");
  const [formato, setFormato] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState("");
  const [publico, setPublico] = useState("");
  const [publicoCustom, setPublicoCustom] = useState("");
  const [diferenciais, setDiferenciais] = useState<string[]>([]);
  const [diferenciaisCustom, setDiferenciaisCustom] = useState("");
  const [tom, setTom] = useState("");

  const totalSteps = 6;

  function toggleDiferencial(d: string) {
    setDiferenciais(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function canAdvance() {
    if (step === 0) return !!objetivo || !!objetivoCustom.trim();
    if (step === 1) return !!formato;
    if (step === 2) return !!tipoEntrega;
    if (step === 3) return !!publico || !!publicoCustom.trim();
    if (step === 4) return diferenciais.length > 0 || !!diferenciaisCustom.trim();
    if (step === 5) return !!tom;
    return false;
  }

  function handleGenerate() {
    const finalObjetivo = objetivo === "Outro" ? objetivoCustom.trim() : objetivo;
    const finalPublico = publico === "Outro" ? publicoCustom.trim() : publico;
    const finalDiferenciais = [
      ...diferenciais,
      ...(diferenciaisCustom.trim() ? [diferenciaisCustom.trim()] : []),
    ].join(", ");

    onGenerate({
      objetivo: finalObjetivo,
      formato,
      tipoEntrega,
      publico: finalPublico,
      diferenciais: finalDiferenciais,
      tom,
    });
  }

  // ── Exibição dos resultados ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              3 Ideias de Conteúdo Geradas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em qualquer texto para copiar. Escolha a legenda que mais combina com o momento.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Gerar novos conteúdos
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {result.map((ideia, i) => (
            <IdeiaCard key={i} ideia={ideia} index={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Telas do wizard ──────────────────────────────────────────────────────────
  const STEPS = [
    {
      icon: <Target className="h-5 w-5 text-primary" />,
      title: "Objetivo do conteúdo",
      subtitle: "O que você quer com esse conteúdo?",
      content: (
        <div className="space-y-2">
          {OBJETIVOS.map(o => (
            <OptionCard key={o.value} value={o.value} icon={o.icon}
              selected={objetivo === o.value} onClick={() => { setObjetivo(o.value); setObjetivoCustom(""); }} />
          ))}
          <OptionCard value="Outro" icon="✏️" selected={objetivo === "Outro"} onClick={() => setObjetivo("Outro")} />
          {objetivo === "Outro" && (
            <Textarea
              value={objetivoCustom}
              onChange={e => setObjetivoCustom(e.target.value)}
              placeholder="Descreva o objetivo..."
              className="text-sm min-h-[60px] mt-1"
              autoFocus
            />
          )}
        </div>
      ),
    },
    {
      icon: <Video className="h-5 w-5 text-primary" />,
      title: "Formato do conteúdo",
      subtitle: "Qual tipo de conteúdo você quer criar?",
      content: (
        <div className="space-y-2">
          {FORMATOS.map(f => (
            <OptionCard key={f.value} value={f.value} icon={f.icon}
              selected={formato === f.value} onClick={() => setFormato(f.value)} />
          ))}
        </div>
      ),
    },
    {
      icon: <FileText className="h-5 w-5 text-primary" />,
      title: "Tipo de entrega",
      subtitle: "O que você precisa que o sistema crie?",
      content: (
        <div className="space-y-2">
          {TIPOS_ENTREGA.map(t => (
            <OptionCard key={t.value} value={t.value} icon={t.icon}
              selected={tipoEntrega === t.value} onClick={() => setTipoEntrega(t.value)} />
          ))}
        </div>
      ),
    },
    {
      icon: <Users className="h-5 w-5 text-primary" />,
      title: "Público / contexto",
      subtitle: "Esse conteúdo é para quem?",
      content: (
        <div className="space-y-2">
          {PUBLICOS.map(p => (
            <OptionCard key={p.value} value={p.value} icon={p.icon}
              selected={publico === p.value} onClick={() => { setPublico(p.value); setPublicoCustom(""); }} />
          ))}
          <OptionCard value="Outro" icon="✏️" selected={publico === "Outro"} onClick={() => setPublico("Outro")} />
          {publico === "Outro" && (
            <Textarea
              value={publicoCustom}
              onChange={e => setPublicoCustom(e.target.value)}
              placeholder="Descreva o público..."
              className="text-sm min-h-[60px] mt-1"
              autoFocus
            />
          )}
        </div>
      ),
    },
    {
      icon: <Star className="h-5 w-5 text-primary" />,
      title: "Diferencial da unidade",
      subtitle: "O que torna sua barbearia diferente? (pode selecionar vários)",
      content: (
        <div className="space-y-2">
          {DIFERENCIAIS_SUGESTOES.map(d => (
            <button
              key={d}
              onClick={() => toggleDiferencial(d)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium flex items-center gap-3
                ${diferenciais.includes(d)
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-foreground hover:border-primary/40 hover:bg-primary/5"
                }`}
            >
              <span className="text-base">✨</span>
              <span className="flex-1">{d}</span>
              {diferenciais.includes(d) && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Adicionar diferencial personalizado:</p>
            <Textarea
              value={diferenciaisCustom}
              onChange={e => setDiferenciaisCustom(e.target.value)}
              placeholder="Ex: Único open bar da cidade, ambiente com lounge..."
              className="text-sm min-h-[60px]"
            />
          </div>
        </div>
      ),
    },
    {
      icon: <Mic className="h-5 w-5 text-primary" />,
      title: "Tom do conteúdo",
      subtitle: "Como você quer esse conteúdo?",
      content: (
        <div className="space-y-2">
          {TONS.map(t => (
            <OptionCard key={t.value} value={t.value} icon={t.icon}
              selected={tom === t.value} onClick={() => setTom(t.value)} />
          ))}
        </div>
      ),
    },
  ];

  const currentStep = STEPS[step];

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Passo {step + 1} de {totalSteps}</span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}% concluído</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          {currentStep.icon}
        </div>
        <div>
          <h3 className="font-bold text-foreground text-sm">{currentStep.title}</h3>
          <p className="text-xs text-muted-foreground">{currentStep.subtitle}</p>
        </div>
      </div>

      {/* Step content */}
      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-1">
        {currentStep.content}
      </div>

      {/* Navigation */}
      <div className="flex gap-2 pt-2 border-t border-border">
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        )}
        <div className="flex-1" />
        {step < totalSteps - 1 ? (
          <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()} className="gap-1.5">
            Próximo <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={!canAdvance() || isGenerating}
            className="gap-1.5 min-w-[140px]"
          >
            {isGenerating ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Gerar Conteúdo
              </>
            )}
          </Button>
        )}
      </div>

      {/* Resumo das escolhas */}
      {step > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {objetivo && <Badge variant="secondary" className="text-xs">{objetivo === "Outro" ? objetivoCustom || "Outro" : objetivo}</Badge>}
          {formato && <Badge variant="secondary" className="text-xs">{formato}</Badge>}
          {tipoEntrega && <Badge variant="secondary" className="text-xs">{tipoEntrega}</Badge>}
          {publico && <Badge variant="secondary" className="text-xs">{publico === "Outro" ? publicoCustom || "Outro" : publico}</Badge>}
          {diferenciais.length > 0 && <Badge variant="secondary" className="text-xs">{diferenciais.length} diferenciais</Badge>}
          {tom && <Badge variant="secondary" className="text-xs">{tom}</Badge>}
        </div>
      )}
    </div>
  );
}
