/**
 * ProcessosPage.tsx — Processos operacionais com geração por IA
 * Fluxo: Planejamento salvo → Gerar Processos com IA → Revisar/aceitar individual →
 *        Salvar → Enviar para Instruções de Trabalho (botão IT)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Edit2, Sparkles, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Send, Layers, Settings, RefreshCw, Users,
} from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";

type Etapa = { titulo: string; descricao?: string; responsavel?: string; concluida: boolean };
type ProcessoAI = {
  nome: string; tipo: "principal" | "apoio"; area?: string; descricao?: string;
  categoria?: string; duracaoEstimada?: string;
  etapas?: Etapa[]; recursos?: string[]; metricas?: string[]; riscos?: string[];
  aceito?: boolean;
};
type Processo = {
  id: number; orgId: number; unitId: number | null;
  nome: string; descricao: string | null; tipo: string | null; area: string | null;
  categoria: string | null; duracaoEstimada: string | null;
  responsavel: string | null; etapas: unknown; geradoPorIA: number | null; ativo: number;
  createdAt: Date; updatedAt: Date;
};

function ProcessoCard({ p, onEdit, onDelete, onEnviarIT }: {
  p: Processo; onEdit: () => void; onDelete: () => void; onEnviarIT: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const etapas = Array.isArray(p.etapas) ? (p.etapas as Etapa[]) : [];
  return (
    <div className="glass-card bg-white/5 border-white/10">
      <div className="p-6 pb-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-sm">{p.nome}</h3>
              {p.geradoPorIA ? <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30">IA</Badge> : null}
              <Badge variant="outline" className={`text-xs ${p.tipo === "principal" ? "text-blue-400 border-blue-400/30" : "text-gray-400 border-gray-400/30"}`}>
                {p.tipo === "principal" ? "Principal" : "Apoio"}
              </Badge>
              {p.area && <Badge variant="outline" className="text-xs">{p.area}</Badge>}
            </div>
            {p.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs text-violet-400 border-violet-400/30 hover:bg-violet-500/10" onClick={onEnviarIT} title="Enviar para Instruções de Trabalho">
              <Send className="w-3 h-3" /> IT
            </Button>
            <PermissionGuard moduleKey="gestao_total" sectionKey="processos">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
            </PermissionGuard>
          </div>
        </div>
      </div>
      {etapas.length > 0 && (
        <div className="p-6 pt-0 pt-0">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {etapas.length} etapa{etapas.length !== 1 ? "s" : ""}
            {p.duracaoEstimada && <span className="ml-2">• {p.duracaoEstimada}</span>}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {etapas.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                  <div><span className="font-medium">{e.titulo}</span>
                    {e.descricao && <p className="text-muted-foreground">{e.descricao}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FormProcesso({ initial, onSave, onClose }: {
  initial?: Partial<Processo>;
  onSave: (d: { nome: string; tipo: "principal" | "apoio"; descricao?: string; area?: string; categoria?: string; duracaoEstimada?: string; etapas?: Etapa[] }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [tipo, setTipo] = useState<"principal" | "apoio">((initial?.tipo as "principal" | "apoio") ?? "principal");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [duracao, setDuracao] = useState(initial?.duracaoEstimada ?? "");
  const [etapas, setEtapas] = useState<Etapa[]>(Array.isArray(initial?.etapas) ? (initial.etapas as Etapa[]) : []);
  const [novaEtapa, setNovaEtapa] = useState("");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1"><Label className="text-xs">Nome *</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Atendimento ao Cliente" className="text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={v => setTipo(v as "principal" | "apoio")}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="principal">Principal</SelectItem><SelectItem value="apoio">Apoio</SelectItem></SelectContent>
          </Select></div>
        <div className="space-y-1"><Label className="text-xs">Área</Label>
          <Input value={area} onChange={e => setArea(e.target.value)} placeholder="Ex: Atendimento..." className="text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Categoria</Label>
          <Input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ex: Operacional" className="text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Duração Estimada</Label>
          <Input value={duracao} onChange={e => setDuracao(e.target.value)} placeholder="Ex: 30 min" className="text-sm" /></div>
        <div className="col-span-2 space-y-1"><Label className="text-xs">Descrição</Label>
          <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o processo..." className="text-sm min-h-[60px] resize-none" /></div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Etapas</Label>
        <div className="space-y-1.5">
          {etapas.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
              <span className="text-xs flex-1">{e.titulo}</span>
              <button onClick={() => setEtapas(etapas.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && novaEtapa.trim()) { setEtapas([...etapas, { titulo: novaEtapa.trim(), concluida: false }]); setNovaEtapa(""); } }}
              placeholder="Nova etapa..." className="text-sm" />
            <Button size="sm" variant="outline" onClick={() => { if (novaEtapa.trim()) { setEtapas([...etapas, { titulo: novaEtapa.trim(), concluida: false }]); setNovaEtapa(""); } }}><Plus className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => { if (!nome.trim()) { toast.error("Nome obrigatório"); return; } onSave({ nome, tipo, descricao: descricao || undefined, area: area || undefined, categoria: categoria || undefined, duracaoEstimada: duracao || undefined, etapas }); }}>Salvar</Button>
      </div>
    </div>
  );
}

export default function ProcessosPage() {
  const { selectedUnit } = useApp();
  const { org, units } = useOrg();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Processo | null>(null);
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [showAIModal, setShowAIModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [aiProcessos, setAiProcessos] = useState<ProcessoAI[]>([]);
  // Modal de seleção de colaborador para IT
  const [showITModal, setShowITModal] = useState(false);
  const [itProcesso, setItProcesso] = useState<Processo | null>(null);
  const [itColaboradorId, setItColaboradorId] = useState<string>("");
  const [itSearch, setItSearch] = useState("");

  const currentUnit = units.find(u => u.id === selectedUnit?.id) ?? units[0];

  const q = trpc.gestaoTotal.processos.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const processos = (q.data ?? []) as unknown as Processo[];

  const planejamentoQ = trpc.gestaoTotal.planejamento.get.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, ano: new Date().getFullYear() },
    { enabled: !!org?.id }
  );

  const saveM = trpc.gestaoTotal.processos.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.processos.list.invalidate(); toast.success("Processo salvo!"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });

  const saveManyM = trpc.gestaoTotal.processos.saveMany.useMutation({
    onSuccess: (res) => {
      utils.gestaoTotal.processos.list.invalidate();
      toast.success(`${res.ids.length} processo(s) salvo(s)!`);
      setShowReviewModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteM = trpc.gestaoTotal.processos.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.processos.list.invalidate(); toast.success("Processo removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const generateM = trpc.gestaoTotal.processos.generateAI.useMutation({
    onSuccess: (res) => {
      if (res.success && res.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ps = ((res.data as any).processos ?? []) as ProcessoAI[];
        setAiProcessos(ps.map(p => ({ ...p, aceito: true })));
        setShowAIModal(false);
        setShowReviewModal(true);
      } else {
        toast.error("Erro ao gerar processos. Tente novamente.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerateAI = () => {
    if (!org || !currentUnit) return;
    const plan = planejamentoQ.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objetivos = Array.isArray(plan?.objetivos) ? (plan.objetivos as any[]).map((o: any) => o.titulo ?? "") : [];
    generateM.mutate({
      orgId: org.id, unitId: selectedUnit?.id,
      nomeUnidade: currentUnit.name,
      segmento: (org as any).segment ?? "Barbearia",
      missao: plan?.missao ?? undefined,
      visao: plan?.visao ?? undefined,
      objetivos,
    });
  };

  const handleSaveAccepted = () => {
    if (!org) return;
    const aceitos = aiProcessos.filter(p => p.aceito !== false);
    if (aceitos.length === 0) { toast.error("Selecione ao menos um processo"); return; }
    saveManyM.mutate({
      orgId: org.id, unitId: selectedUnit?.id,
      processos: aceitos.map(p => ({
        nome: p.nome, tipo: p.tipo ?? "principal",
        area: p.area, descricao: p.descricao, categoria: p.categoria,
        duracaoEstimada: p.duracaoEstimada, etapas: p.etapas,
        recursos: p.recursos, metricas: p.metricas, riscos: p.riscos,
      })),
    });
  };

  const colaboradoresQ = trpc.gestaoTotal.colaboradores.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, status: "ativo" },
    { enabled: !!org?.id && showITModal }
  );
  const colaboradores = (colaboradoresQ.data ?? []) as { id: number; nome: string; avatarUrl?: string | null }[];
  const colaboradoresFiltrados = itSearch.trim()
    ? colaboradores.filter(c => c.nome.toLowerCase().includes(itSearch.toLowerCase()))
    : colaboradores;

  // Mutation para gerar IT automaticamente ao destinar
  const generateITM = trpc.gestaoTotal.instrucoes.generateFromProcesso.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Instrução de Trabalho gerada com sucesso!");
        setShowITModal(false);
        navigate("/gestao-total/instrucoes");
      } else {
        toast.error("Erro ao gerar instrução. Tente novamente.");
      }
    },
    onError: (e) => toast.error("Erro ao gerar IT: " + e.message),
  });

  const handleEnviarIT = (p: Processo) => {
    setItProcesso(p);
    setItColaboradorId("");
    setItSearch("");
    setShowITModal(true);
  };

  const handleConfirmarIT = () => {
    if (!itProcesso || !org) return;
    const colab = colaboradores.find(c => String(c.id) === itColaboradorId);
    // Extrair etapas do processo
    const etapas = Array.isArray(itProcesso.etapas)
      ? (itProcesso.etapas as { titulo: string; descricao?: string; responsavel?: string }[]).map(e => ({
          titulo: e.titulo,
          descricao: e.descricao,
          responsavel: e.responsavel,
        }))
      : [];
    generateITM.mutate({
      orgId: org.id,
      unitId: selectedUnit?.id,
      processoId: itProcesso.id,
      processoNome: itProcesso.nome,
      processoDescricao: itProcesso.descricao ?? undefined,
      etapas,
      segmento: (org as any).segment ?? "Barbearia",
      responsavelNome: colab?.nome,
    });
  };

  const filtered = filterTipo === "todos" ? processos : processos.filter(p => p.tipo === filterTipo);
  const principais = filtered.filter(p => p.tipo === "principal" || !p.tipo);
  const apoio = filtered.filter(p => p.tipo === "apoio");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Processos</h1>
          <p className="text-sm text-muted-foreground">
            {currentUnit?.name ?? "Unidade"} • {processos.length} processo{processos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="principal">Principais</SelectItem>
              <SelectItem value="apoio">Apoio</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setShowAIModal(true)}
            className="gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10" disabled={generateM.isPending}>
            {generateM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Gerar com IA
          </Button>
          <PermissionGuard moduleKey="gestao_total" sectionKey="processos">
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Novo Processo
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {!q.isLoading && processos.length === 0 && (
        <div className="glass-card bg-white/5 border-white/10 border-dashed">
          <div className="p-6 pt-0 p-8 text-center">
            <Layers className="w-10 h-10 text-violet-400 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Nenhum processo ainda</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {planejamentoQ.data
                ? "O planejamento está pronto! Clique em \"Gerar com IA\" para criar os processos automaticamente."
                : "Crie o planejamento estratégico primeiro para que a IA gere processos personalizados."}
            </p>
            <Button onClick={() => setShowAIModal(true)} className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Sparkles className="w-4 h-4" /> Gerar Processos com IA
            </Button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-6">
          {principais.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 font-display tracking-tight">
                <Layers className="w-4 h-4 text-blue-400" /> Processos Principais
                <Badge variant="outline" className="text-xs">{principais.length}</Badge>
              </h2>
              <div className="space-y-3">
                {principais.map(p => (
                  <ProcessoCard key={p.id} p={p}
                    onEdit={() => { setEditing(p); setShowForm(true); }}
                    onDelete={() => { if (!org) return; deleteM.mutate({ id: p.id, orgId: org.id }); }}
                    onEnviarIT={() => handleEnviarIT(p)}
                  />
                ))}
              </div>
            </div>
          )}
          {apoio.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 font-display tracking-tight">
                <Settings className="w-4 h-4 text-gray-400" /> Processos de Apoio
                <Badge variant="outline" className="text-xs">{apoio.length}</Badge>
              </h2>
              <div className="space-y-3">
                {apoio.map(p => (
                  <ProcessoCard key={p.id} p={p}
                    onEdit={() => { setEditing(p); setShowForm(true); }}
                    onDelete={() => { if (!org) return; deleteM.mutate({ id: p.id, orgId: org.id }); }}
                    onEnviarIT={() => handleEnviarIT(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Formulário manual */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Processo" : "Novo Processo"}</DialogTitle></DialogHeader>
          <FormProcesso
            initial={editing ?? undefined}
            onSave={(d) => { if (!org) return; saveM.mutate({ id: editing?.id, orgId: org.id, unitId: selectedUnit?.id, ...d }); }}
            onClose={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar geração por IA */}
      <Dialog open={showAIModal} onOpenChange={setShowAIModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-400" /> Gerar Processos com IA</DialogTitle>
            <DialogDescription>A IA usará o planejamento estratégico salvo para gerar os processos operacionais.</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="rounded-lg bg-muted/30 border border-white/10 p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">Contexto utilizado</p>
              <p className="text-sm font-semibold">{currentUnit?.name ?? "—"}</p>
              {planejamentoQ.data?.missao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Missão: {planejamentoQ.data.missao}</p>}
              {!planejamentoQ.data && <p className="text-xs text-yellow-400 mt-1">Sem planejamento salvo — a IA usará o segmento da unidade como base.</p>}
            </div>
            <p className="text-xs text-muted-foreground">Serão gerados 4-6 processos principais e 2-4 de apoio. Você poderá aceitar ou rejeitar cada um individualmente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIModal(false)}>Cancelar</Button>
            <Button onClick={handleGenerateAI} disabled={generateM.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {generateM.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Sparkles className="w-4 h-4" />Gerar Processos</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Revisão dos processos gerados */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-400" /> Processos Gerados pela IA</DialogTitle>
            <DialogDescription>Aceite ou rejeite cada processo. Somente os aceitos serão salvos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {aiProcessos.map((p, i) => (
              <div key={i} className={`rounded-lg border p-3 transition-opacity ${p.aceito === false ? "opacity-40 border-white/10" : "border-violet-500/30 bg-violet-500/5"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{p.nome}</span>
                      <Badge variant="outline" className={`text-xs ${p.tipo === "principal" ? "text-blue-400 border-blue-400/30" : "text-gray-400 border-gray-400/30"}`}>
                        {p.tipo === "principal" ? "Principal" : "Apoio"}
                      </Badge>
                      {p.area && <Badge variant="outline" className="text-xs">{p.area}</Badge>}
                      {p.duracaoEstimada && <span className="text-xs text-muted-foreground">{p.duracaoEstimada}</span>}
                    </div>
                    {p.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
                    {p.etapas && p.etapas.length > 0 && <p className="text-xs text-muted-foreground mt-1">{p.etapas.length} etapa{p.etapas.length !== 1 ? "s" : ""}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setAiProcessos(aiProcessos.map((x, j) => j === i ? { ...x, aceito: true } : x))}
                      className={`p-1 rounded ${p.aceito !== false ? "text-green-400" : "text-muted-foreground hover:text-green-400"}`} title="Aceitar">
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => setAiProcessos(aiProcessos.map((x, j) => j === i ? { ...x, aceito: false } : x))}
                      className={`p-1 rounded ${p.aceito === false ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`} title="Rejeitar">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{aiProcessos.filter(p => p.aceito !== false).length} de {aiProcessos.length} selecionado(s)</div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowReviewModal(false); setShowAIModal(true); }} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Gerar Novamente
            </Button>
            <Button onClick={handleSaveAccepted} disabled={saveManyM.isPending} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              {saveManyM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Salvar Selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Selecionar colaborador para Instrução de Trabalho */}
      <Dialog open={showITModal} onOpenChange={v => { setShowITModal(v); if (!v) setItProcesso(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-400" /> Destinar Instrução de Trabalho
            </DialogTitle>
            <DialogDescription>
              Selecione o colaborador responsável pela instrução de trabalho do processo <strong>{itProcesso?.nome}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Input
                value={itSearch}
                onChange={e => setItSearch(e.target.value)}
                placeholder="Buscar colaborador..."
                className="text-sm pl-8"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
            </div>
            {colaboradoresQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
            ) : colaboradoresFiltrados.length === 0 ? (
              <div className="text-center py-6">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {colaboradores.length === 0
                    ? "Nenhum colaborador ativo cadastrado. Cadastre colaboradores em Pessoas → Colaboradores."
                    : "Nenhum colaborador encontrado com esse nome."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {colaboradoresFiltrados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setItColaboradorId(String(c.id) === itColaboradorId ? "" : String(c.id))}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      String(c.id) === itColaboradorId
                        ? "border-violet-500/50 bg-violet-500/10 text-foreground"
                        : "border-white/10 bg-white/5 hover:border-violet-500/30 hover:bg-violet-500/5 text-foreground"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 text-sm font-semibold text-violet-400">
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium flex-1">{c.nome}</span>
                    {String(c.id) === itColaboradorId && (
                      <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {colaboradores.length > 0 && !generateITM.isPending && (
              <p className="text-xs text-muted-foreground">Você pode prosseguir sem selecionar um colaborador e atribuir depois.</p>
            )}
            {generateITM.isPending && (
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-300">Gerando Instrução de Trabalho...</p>
                  <p className="text-xs text-muted-foreground">A IA está criando o plano detalhado. Aguarde alguns segundos.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowITModal(false)} disabled={generateITM.isPending}>Cancelar</Button>
            <Button onClick={handleConfirmarIT} disabled={generateITM.isPending} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              {generateITM.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando IT com IA...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> {itColaboradorId ? "Destinar e Gerar IT" : "Gerar IT sem Colaborador"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
