/**
 * PlanejamentoPage.tsx — Planejamento Estratégico com geração por IA
 * Fluxo: Unidade já cadastrada → Botão "Gerar com IA" → Modal de contexto →
 *        IA gera Missão/Visão/Valores + SWOT + Objetivos → Revisão → Salvar
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Save, Plus, Trash2, Target, Sparkles, Loader2, RefreshCw, ChevronRight, Building2, MapPin, Lightbulb,
} from "lucide-react";

type Objetivo = { titulo: string; prazo?: string; responsavel?: string; status?: string };
type Planejamento = {
  id?: number; orgId: number; unitId: number | null; ano: number;
  missao: string | null; visao: string | null; valores: string | null;
  swotForcas: unknown; swotFraquezas: unknown; swotOportunidades: unknown; swotAmeacas: unknown;
  objetivos: unknown;
};
type AIResult = {
  missao: string; visao: string; valores: string;
  swotForcas: string[]; swotFraquezas: string[];
  swotOportunidades: string[]; swotAmeacas: string[];
  objetivos: Objetivo[];
};

function SwotQuadrant({ title, color, items, onChange, readOnly }: {
  title: string; color: string;
  items: string[]; onChange: (items: string[]) => void;
  readOnly?: boolean;
}) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <h4 className="text-xs font-semibold mb-2">{title}</h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-xs flex-1">{item}</span>
            {!readOnly && <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>}
          </div>
        ))}
        {!readOnly && (
          <div className="flex gap-1">
            <Input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }} placeholder="Adicionar..." className="text-xs h-7" />
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }}><Plus className="w-3 h-3" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlanejamentoPage() {
  const { selectedUnit } = useApp();
  const { org, units } = useOrg();
  const utils = trpc.useUtils();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [missao, setMissao] = useState("");
  const [visao, setVisao] = useState("");
  const [valores, setValores] = useState("");
  const [forcas, setForcas] = useState<string[]>([]);
  const [fraquezas, setFraquezas] = useState<string[]>([]);
  const [oportunidades, setOportunidades] = useState<string[]>([]);
  const [ameacas, setAmeacas] = useState<string[]>([]);
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [novoObjetivo, setNovoObjetivo] = useState("");
  const [saved, setSaved] = useState(false);

  // Modal IA
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiDescricao, setAiDescricao] = useState("");
  const [aiDiferenciais, setAiDiferenciais] = useState("");
  const [aiDesafios, setAiDesafios] = useState("");
  const [aiPorte, setAiPorte] = useState("Pequena empresa");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const currentUnit = units.find(u => u.id === selectedUnit?.id) ?? units[0];

  const q = trpc.gestaoTotal.planejamento.get.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, ano },
    { enabled: !!org?.id }
  );
  const data = q.data as unknown as Planejamento | null;

  useEffect(() => {
    if (data) {
      setMissao(data.missao ?? "");
      setVisao(data.visao ?? "");
      setValores(data.valores ?? "");
      setForcas(Array.isArray(data.swotForcas) ? (data.swotForcas as string[]) : []);
      setFraquezas(Array.isArray(data.swotFraquezas) ? (data.swotFraquezas as string[]) : []);
      setOportunidades(Array.isArray(data.swotOportunidades) ? (data.swotOportunidades as string[]) : []);
      setAmeacas(Array.isArray(data.swotAmeacas) ? (data.swotAmeacas as string[]) : []);
      setObjetivos(Array.isArray(data.objetivos) ? (data.objetivos as Objetivo[]) : []);
      setSaved(true);
    } else {
      setMissao(""); setVisao(""); setValores("");
      setForcas([]); setFraquezas([]); setOportunidades([]); setAmeacas([]);
      setObjetivos([]); setSaved(false);
    }
  }, [data]);

  const saveM = trpc.gestaoTotal.planejamento.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.planejamento.get.invalidate(); toast.success("Planejamento salvo!"); setSaved(true); },
    onError: () => toast.error("Erro ao salvar"),
  });

  const generateM = trpc.gestaoTotal.planejamento.generateAI.useMutation({
    onSuccess: (res) => {
      if (res.success && res.data) {
        setAiResult(res.data as AIResult);
        setShowAIModal(false);
        setShowReviewModal(true);
      } else {
        toast.error("Erro ao gerar planejamento. Tente novamente.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!org?.id) return;
    saveM.mutate({
      id: data?.id, orgId: org.id, unitId: selectedUnit?.id, ano,
      missao: missao || undefined, visao: visao || undefined, valores: valores || undefined,
      swotForcas: forcas, swotFraquezas: fraquezas, swotOportunidades: oportunidades, swotAmeacas: ameacas,
      objetivos,
    });
  };

  const handleGenerateAI = () => {
    if (!org || !currentUnit) return;
    generateM.mutate({
      orgId: org.id, unitId: selectedUnit?.id,
      nomeUnidade: currentUnit.name,
      segmento: (org as any).segment ?? "Barbearia",
      cidade: currentUnit.city ?? undefined,
      porte: aiPorte,
      descricaoNegocio: aiDescricao,
      diferenciais: aiDiferenciais,
      desafios: aiDesafios,
      ano,
    });
  };

  const handleApplyAI = () => {
    if (!aiResult) return;
    setMissao(aiResult.missao ?? "");
    setVisao(aiResult.visao ?? "");
    setValores(aiResult.valores ?? "");
    setForcas(aiResult.swotForcas ?? []);
    setFraquezas(aiResult.swotFraquezas ?? []);
    setOportunidades(aiResult.swotOportunidades ?? []);
    setAmeacas(aiResult.swotAmeacas ?? []);
    setObjetivos(aiResult.objetivos ?? []);
    setShowReviewModal(false);
    setSaved(false);
    toast.success("Planejamento aplicado! Revise e salve quando estiver pronto.");
  };

  const hasContent = missao || visao || valores || forcas.length > 0 || objetivos.length > 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Planejamento Estratégico</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            {currentUnit && <><Building2 className="w-3.5 h-3.5" />{currentUnit.name}</>}
            {currentUnit?.city && <><MapPin className="w-3 h-3" />{currentUnit.city}</>}
            <span>• Ano {ano}</span>
            {saved && <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">Salvo</Badge>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value))} className="w-24 text-sm" min={2020} max={2035} />
          <Button size="sm" variant="outline" onClick={() => setShowAIModal(true)}
            className="gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10">
            <Sparkles className="w-3.5 h-3.5" /> Gerar com IA
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveM.isPending} className="gap-1.5">
            {saveM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!q.isLoading && !hasContent && (
        <div className="glass-card bg-white/5 border-white/10 border-dashed">
          <div className="p-6 pt-0 p-8 text-center">
            <Sparkles className="w-10 h-10 text-violet-400 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Nenhum planejamento ainda</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Clique em "Gerar com IA" para criar o planejamento estratégico automaticamente,
              ou preencha os campos manualmente abaixo.
            </p>
            <Button onClick={() => setShowAIModal(true)} className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Sparkles className="w-4 h-4" /> Gerar Planejamento com IA
            </Button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-6">
          {/* Missão, Visão, Valores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm text-primary">Missão</h3></div>
              <div className="p-6 pt-0 pt-0">
                <Textarea value={missao} onChange={e => setMissao(e.target.value)} placeholder="Por que a empresa existe..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </div>
            </div>
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm text-primary">Visão</h3></div>
              <div className="p-6 pt-0 pt-0">
                <Textarea value={visao} onChange={e => setVisao(e.target.value)} placeholder="Onde quer chegar em 5 anos..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </div>
            </div>
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm text-primary">Valores</h3></div>
              <div className="p-6 pt-0 pt-0">
                <Textarea value={valores} onChange={e => setValores(e.target.value)} placeholder="Princípios que guiam as decisões..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </div>
            </div>
          </div>

          {/* SWOT */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 font-display tracking-tight">Análise SWOT</h2>
            <div className="grid grid-cols-2 gap-3">
              <SwotQuadrant title="Forças (Strengths)" color="border-green-500/30 bg-green-500/5" items={forcas} onChange={setForcas} />
              <SwotQuadrant title="Fraquezas (Weaknesses)" color="border-red-500/30 bg-red-500/5" items={fraquezas} onChange={setFraquezas} />
              <SwotQuadrant title="Oportunidades (Opportunities)" color="border-blue-500/30 bg-blue-500/5" items={oportunidades} onChange={setOportunidades} />
              <SwotQuadrant title="Ameaças (Threats)" color="border-yellow-500/30 bg-yellow-500/5" items={ameacas} onChange={setAmeacas} />
            </div>
          </div>

          {/* Objetivos */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 font-display tracking-tight">Objetivos Estratégicos</h2>
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pt-0 p-3 space-y-2">
                {objetivos.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm flex-1">{o.titulo}</span>
                    {o.prazo && <span className="text-xs text-muted-foreground">{o.prazo}</span>}
                    <button onClick={() => setObjetivos(objetivos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Input value={novoObjetivo} onChange={e => setNovoObjetivo(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novoObjetivo.trim()) { setObjetivos([...objetivos, { titulo: novoObjetivo.trim() }]); setNovoObjetivo(""); } }} placeholder="Novo objetivo estratégico..." className="text-sm" />
                  <Button size="sm" variant="outline" onClick={() => { if (novoObjetivo.trim()) { setObjetivos([...objetivos, { titulo: novoObjetivo.trim() }]); setNovoObjetivo(""); } }}><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Contexto para IA */}
      <Dialog open={showAIModal} onOpenChange={setShowAIModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              Gerar Planejamento com IA
            </DialogTitle>
            <DialogDescription>
              Forneça informações sobre a unidade para que a IA gere um planejamento personalizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/30 border border-white/10 p-3 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Unidade selecionada</p>
              <p className="text-sm font-semibold text-foreground">{currentUnit?.name ?? "—"}</p>
              {currentUnit?.city && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{currentUnit.city}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porte da empresa</Label>
              <select value={aiPorte} onChange={e => setAiPorte(e.target.value)}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="Microempresa">Microempresa (até 9 funcionários)</option>
                <option value="Pequena empresa">Pequena empresa (10-49 funcionários)</option>
                <option value="Média empresa">Média empresa (50-249 funcionários)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição do negócio <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea value={aiDescricao} onChange={e => setAiDescricao(e.target.value)}
                placeholder="Ex: Barbearia premium focada em cortes modernos..."
                className="text-sm min-h-[60px] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Lightbulb className="w-3 h-3 text-yellow-400" />Diferenciais competitivos <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea value={aiDiferenciais} onChange={e => setAiDiferenciais(e.target.value)}
                placeholder="Ex: Atendimento por hora marcada, ambiente premium..."
                className="text-sm min-h-[50px] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Principais desafios atuais <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea value={aiDesafios} onChange={e => setAiDesafios(e.target.value)}
                placeholder="Ex: Alta rotatividade de clientes, concorrência de preço..."
                className="text-sm min-h-[50px] resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIModal(false)}>Cancelar</Button>
            <Button onClick={handleGenerateAI} disabled={generateM.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {generateM.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Sparkles className="w-4 h-4" />Gerar Planejamento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Revisão do resultado da IA */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              Planejamento Gerado pela IA
            </DialogTitle>
            <DialogDescription>Revise o planejamento. Você poderá editar todos os campos após aplicar.</DialogDescription>
          </DialogHeader>
          {aiResult && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[{ label: "Missão", value: aiResult.missao, color: "border-primary/30 bg-primary/5" },
                  { label: "Visão", value: aiResult.visao, color: "border-blue-500/30 bg-blue-500/5" },
                  { label: "Valores", value: aiResult.valores, color: "border-green-500/30 bg-green-500/5" }]
                  .map(({ label, value, color }) => (
                  <div key={label} className={`rounded-lg border p-3 ${color}`}>
                    <p className="text-xs font-semibold mb-1">{label}</p>
                    <p className="text-xs text-muted-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Análise SWOT</p>
                <div className="grid grid-cols-2 gap-2">
                  <SwotQuadrant title="Forças" color="border-green-500/30 bg-green-500/5" items={aiResult.swotForcas ?? []} onChange={() => {}} readOnly />
                  <SwotQuadrant title="Fraquezas" color="border-red-500/30 bg-red-500/5" items={aiResult.swotFraquezas ?? []} onChange={() => {}} readOnly />
                  <SwotQuadrant title="Oportunidades" color="border-blue-500/30 bg-blue-500/5" items={aiResult.swotOportunidades ?? []} onChange={() => {}} readOnly />
                  <SwotQuadrant title="Ameaças" color="border-yellow-500/30 bg-yellow-500/5" items={aiResult.swotAmeacas ?? []} onChange={() => {}} readOnly />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Objetivos Estratégicos</p>
                <div className="space-y-1.5">
                  {(aiResult.objetivos ?? []).map((o, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-white/10 p-2">
                      <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs flex-1">{o.titulo}</span>
                      {o.prazo && <span className="text-xs text-muted-foreground">{o.prazo}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowReviewModal(false); setShowAIModal(true); }} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Gerar Novamente
            </Button>
            <Button onClick={handleApplyAI} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              <Sparkles className="w-3.5 h-3.5" /> Aplicar Planejamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
