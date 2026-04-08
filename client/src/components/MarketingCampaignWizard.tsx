import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

export interface WizardData {
  objective: string;
  audience: {
    age_range: string;
    gender: string;
    interests: string;
    locations: string[];
  };
  offer: string;
  budget: {
    total: number;
    daily: number;
    start_date: string;
    end_date: string;
  };
  channels: string[];
  assets: {
    photos_videos: boolean;
    testimonials: boolean;
    awards: boolean;
    certifications: boolean;
  };
  tone: string;
  restrictions: string;
  kpis: string[];
  differentiators: string[];
  observations: string;
}

const CHANNELS = ["Instagram", "Facebook", "Google Ads", "TikTok", "YouTube", "WhatsApp", "E-mail/SMS", "Influenciadores"];
const KPI_OPTIONS = ["Agendamentos", "Leads qualificados", "CAC (Custo de Aquisição)", "CPL (Custo por Lead)", "ROAS (Retorno sobre Investimento)", "CTR (Taxa de Cliques)", "Conversões", "Retenção de clientes"];

const INITIAL_DATA: WizardData = {
  objective: "",
  audience: { age_range: "", gender: "Todos", interests: "", locations: [] },
  offer: "",
  budget: { total: 0, daily: 0, start_date: "", end_date: "" },
  channels: [],
  assets: { photos_videos: false, testimonials: false, awards: false, certifications: false },
  tone: "amigavel",
  restrictions: "",
  kpis: [],
  differentiators: [],
  observations: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: WizardData) => void;
  isGenerating?: boolean;
}

export default function MarketingCampaignWizard({ open, onClose, onGenerate, isGenerating }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [error, setError] = useState("");

  const totalSteps = 10;
  const progress = (step / totalSteps) * 100;

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData(prev => ({ ...prev, [key]: value }));
    setError("");
  }

  function validate(): boolean {
    if (step === 1 && !data.objective.trim()) { setError("O objetivo da campanha é obrigatório."); return false; }
    if (step === 3 && !data.offer.trim()) { setError("A oferta/proposta de valor é obrigatória."); return false; }
    if (step === 5 && data.channels.length === 0) { setError("Selecione pelo menos um canal."); return false; }
    if (step === 8 && data.kpis.length === 0) { setError("Selecione pelo menos um KPI."); return false; }
    if (step === 9 && data.differentiators.length === 0) { setError("Informe pelo menos um diferencial."); return false; }
    return true;
  }

  function next() {
    if (!validate()) return;
    if (step < totalSteps) setStep(s => s + 1);
  }

  function prev() {
    if (step > 1) setStep(s => s - 1);
    setError("");
  }

  function handleGenerate() {
    if (!validate()) return;
    onGenerate(data);
  }

  function handleClose() {
    setStep(1);
    setData(INITIAL_DATA);
    setError("");
    onClose();
  }

  function toggleChannel(ch: string) {
    setData(prev => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter(c => c !== ch)
        : [...prev.channels, ch],
    }));
    setError("");
  }

  function toggleKpi(kpi: string) {
    setData(prev => {
      if (prev.kpis.includes(kpi)) return { ...prev, kpis: prev.kpis.filter(k => k !== kpi) };
      if (prev.kpis.length >= 3) return prev;
      return { ...prev, kpis: [...prev.kpis, kpi] };
    });
    setError("");
  }

  const stepTitles = [
    "Objetivo da Campanha",
    "Público-alvo e Regiões",
    "Oferta e Proposta de Valor",
    "Verba e Prazo",
    "Canais Desejados",
    "Ativos Disponíveis",
    "Tom de Voz & Restrições",
    "KPIs Prioritários",
    "Diferenciais",
    "Revisão Final",
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header fixo com progresso */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Gerar Campanha com IA — Etapa {step}/{totalSteps}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{stepTitles[step - 1]}</p>
          <Progress value={progress} className="h-2 mt-3" />
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          {/* Etapa 1 — Objetivo */}
          {step === 1 && (
            <div className="space-y-2">
              <Label>Objetivo da Campanha <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ex.: Aumentar agendamentos em 30 dias"
                value={data.objective}
                onChange={e => update("objective", e.target.value)}
              />
            </div>
          )}

          {/* Etapa 2 — Público-alvo */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Faixa Etária</Label>
                <Input placeholder="Ex.: 25-45 anos" value={data.audience.age_range}
                  onChange={e => update("audience", { ...data.audience, age_range: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <RadioGroup value={data.audience.gender}
                  onValueChange={v => update("audience", { ...data.audience, gender: v })}
                  className="flex gap-4">
                  {["Todos", "Masculino", "Feminino"].map(g => (
                    <div key={g} className="flex items-center gap-2">
                      <RadioGroupItem value={g} id={`gender-${g}`} />
                      <Label htmlFor={`gender-${g}`}>{g}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Interesses</Label>
                <Input placeholder="Ex.: Beleza, cuidados pessoais, estilo" value={data.audience.interests}
                  onChange={e => update("audience", { ...data.audience, interests: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Regiões/Bairros Prioritários</Label>
                <Input placeholder="Ex.: Centro, Zona Sul, São Paulo (separados por vírgula)"
                  value={data.audience.locations.join(", ")}
                  onChange={e => update("audience", { ...data.audience, locations: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
              </div>
            </div>
          )}

          {/* Etapa 3 — Oferta */}
          {step === 3 && (
            <div className="space-y-2">
              <Label>Oferta e Proposta de Valor <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Ex.: 20% OFF na primeira visita ou brinde exclusivo"
                value={data.offer} onChange={e => update("offer", e.target.value)} rows={4} />
            </div>
          )}

          {/* Etapa 4 — Verba */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Orçamento Total (R$)</Label>
                  <Input type="number" placeholder="3000" value={data.budget.total || ""}
                    onChange={e => update("budget", { ...data.budget, total: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Orçamento Diário (R$)</Label>
                  <Input type="number" placeholder="100" value={data.budget.daily || ""}
                    onChange={e => update("budget", { ...data.budget, daily: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Início</Label>
                  <DatePicker
                    value={data.budget.start_date}
                    onChange={v => update("budget", { ...data.budget, start_date: v })}
                    placeholder="Data de início"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Fim</Label>
                  <DatePicker
                    value={data.budget.end_date}
                    onChange={v => update("budget", { ...data.budget, end_date: v })}
                    min={data.budget.start_date}
                    placeholder="Data de fim"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Etapa 5 — Canais */}
          {step === 5 && (
            <div className="space-y-3">
              <Label>Canais Desejados <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map(ch => (
                  <div key={ch} className="flex items-center gap-2">
                    <Checkbox id={`ch-${ch}`} checked={data.channels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} />
                    <Label htmlFor={`ch-${ch}`} className="cursor-pointer">{ch}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Etapa 6 — Ativos */}
          {step === 6 && (
            <div className="space-y-3">
              <Label>Ativos Disponíveis</Label>
              {([
                ["photos_videos", "Fotos e vídeos de qualidade"],
                ["testimonials", "Depoimentos de clientes"],
                ["awards", "Prêmios e reconhecimentos"],
                ["certifications", "Selos e certificações"],
              ] as [keyof typeof data.assets, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox id={`asset-${key}`} checked={data.assets[key]}
                    onCheckedChange={v => update("assets", { ...data.assets, [key]: !!v })} />
                  <Label htmlFor={`asset-${key}`} className="cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
          )}

          {/* Etapa 7 — Tom de Voz */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tom de Voz</Label>
                <RadioGroup value={data.tone} onValueChange={v => update("tone", v)} className="space-y-2">
                  {[
                    ["amigavel", "Amigável e próximo"],
                    ["premium", "Premium e sofisticado"],
                    ["tecnico", "Técnico e profissional"],
                    ["descontraido", "Descontraído e jovem"],
                  ].map(([val, label]) => (
                    <div key={val} className="flex items-center gap-2">
                      <RadioGroupItem value={val} id={`tone-${val}`} />
                      <Label htmlFor={`tone-${val}`}>{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Restrições ou Palavras Proibidas</Label>
                <Textarea placeholder='Ex.: Evitar termos médicos, não usar "garantia"'
                  value={data.restrictions} onChange={e => update("restrictions", e.target.value)} rows={3} />
              </div>
            </div>
          )}

          {/* Etapa 8 — KPIs */}
          {step === 8 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>KPIs Prioritários <span className="text-destructive">*</span></Label>
                <span className="text-sm text-muted-foreground">Selecionados: {data.kpis.length}/3</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {KPI_OPTIONS.map(kpi => {
                  const checked = data.kpis.includes(kpi);
                  const disabled = !checked && data.kpis.length >= 3;
                  return (
                    <div key={kpi} className="flex items-center gap-2">
                      <Checkbox id={`kpi-${kpi}`} checked={checked} disabled={disabled}
                        onCheckedChange={() => !disabled && toggleKpi(kpi)} />
                      <Label htmlFor={`kpi-${kpi}`} className={`cursor-pointer text-sm ${disabled ? "text-muted-foreground" : ""}`}>{kpi}</Label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Etapa 9 — Diferenciais */}
          {step === 9 && (
            <div className="space-y-2">
              <Label>Diferenciais <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">Digite um diferencial por linha</p>
              <Textarea
                placeholder={"Ex.:\nAtendimento personalizado\nProfissionais experientes\nLocalização privilegiada"}
                value={data.differentiators.join("\n")}
                onChange={e => update("differentiators", e.target.value.split("\n").filter(Boolean))}
                rows={5}
              />
            </div>
          )}

          {/* Etapa 10 — Revisão */}
          {step === 10 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Observações Finais</Label>
                <Textarea placeholder="Alguma informação adicional ou requisito específico?"
                  value={data.observations} onChange={e => update("observations", e.target.value)} rows={3} />
              </div>
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <p className="font-semibold text-base mb-3">Resumo da Campanha</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Objetivo:</span><p className="font-medium">{data.objective}</p></div>
                  <div><span className="text-muted-foreground">Orçamento:</span><p className="font-medium">R$ {data.budget.total?.toLocaleString("pt-BR") || "—"}</p></div>
                  <div><span className="text-muted-foreground">Oferta:</span><p className="font-medium">{data.offer}</p></div>
                  <div><span className="text-muted-foreground">Tom:</span><p className="font-medium capitalize">{data.tone}</p></div>
                </div>
                <div className="mt-2">
                  <span className="text-muted-foreground">Canais: </span>
                  <span className="font-medium">{data.channels.join(", ") || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">KPIs: </span>
                  <span className="font-medium">{data.kpis.join(", ") || "—"}</span>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>{/* fim space-y-4 */}
        </div>{/* fim scrollável */}

        {/* Footer fixo com botões de navegação */}
        <div className="flex-shrink-0 flex justify-between px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={prev} disabled={step === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          {step < totalSteps ? (
            <Button onClick={next}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              <Wand2 className="h-4 w-4" />
              {isGenerating ? "Gerando campanha..." : "Gerar Campanha com IA"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
