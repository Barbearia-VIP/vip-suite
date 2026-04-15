/**
 * MarketingPage.tsx — Marketing com IA + Campanhas manuais
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Megaphone, Wand2, Eye, UserCheck,
  Calendar, Target, Sparkles, PenLine, Palette, History, Star, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import MarketingCampaignWizard, { type WizardData } from "@/components/MarketingCampaignWizard";
import { DatePicker } from "@/components/DatePicker";
import CampaignPreview from "@/components/CampaignPreview";
import AssignCampaignModal from "@/components/AssignCampaignModal";
import ContentGeneratorWizard, { type ContentWizardData } from "@/components/ContentGeneratorWizard";
import ContentHistoryPanel from "@/components/ContentHistoryPanel";
import ArtGeneratorWizard, { type ArtWizardData, type ArtResultado } from "@/components/ArtGeneratorWizard";
import ArtHistoryPanel from "@/components/ArtHistoryPanel";

type Campanha = {
  id: number; orgId: number; unitId: number | null;
  nome: string; descricao: string | null;
  canal: "instagram" | "facebook" | "whatsapp" | "email" | "google" | "offline" | "outro";
  status: "planejamento" | "ativa" | "pausada" | "concluida";
  budget: string | null; gasto: string | null;
  alcance: number | null; cliques: number | null; conversoes: number | null;
  dataInicio: Date | null; dataFim: Date | null;
  createdAt: Date; updatedAt: Date;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AICampaign = Record<string, any>;

const STATUS_COLORS: Record<string, string> = {
  planejamento: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ativa: "bg-green-500/20 text-green-400 border-green-500/30",
  pausada: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  concluida: "bg-muted text-muted-foreground border-white/10",
  draft: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  archived: "bg-muted text-muted-foreground border-white/10",
};
const CANAL_ICONS: Record<string, string> = {
  instagram: "IG", facebook: "FB", whatsapp: "WA", email: "EM", google: "GG", offline: "OF", outro: "OT",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function FormCampanha({ initial, onSave, onClose }: {
  initial?: Partial<Campanha>;
  onSave: (d: { nome: string; descricao?: string; canal: "instagram"|"facebook"|"whatsapp"|"email"|"google"|"offline"|"outro"; status: "planejamento"|"ativa"|"pausada"|"concluida"; budget?: number; gasto?: number; alcance?: number; cliques?: number; conversoes?: number; dataInicio?: string; dataFim?: string }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [canal, setCanal] = useState<"instagram"|"facebook"|"whatsapp"|"email"|"google"|"offline"|"outro">(initial?.canal ?? "instagram");
  const [status, setStatus] = useState<"planejamento"|"ativa"|"pausada"|"concluida">(initial?.status ?? "planejamento");
  const [budget, setBudget] = useState(initial?.budget ?? "");
  const [gasto, setGasto] = useState(initial?.gasto ?? "");
  const [dataInicio, setDataInicio] = useState(initial?.dataInicio ? new Date(initial.dataInicio).toISOString().split("T")[0] : "");
  const [dataFim, setDataFim] = useState(initial?.dataFim ? new Date(initial.dataFim).toISOString().split("T")[0] : "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Nome da Campanha *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Promoção Dia dos Pais" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Canal</Label>
          <Select value={canal} onValueChange={v => setCanal(v as typeof canal)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["instagram", "facebook", "whatsapp", "email", "google", "offline", "outro"].map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="planejamento">Planejamento</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Budget (R$)</Label>
          <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Gasto (R$)</Label>
          <Input type="number" value={gasto} onChange={e => setGasto(e.target.value)} placeholder="0" className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Data Início</Label>
          <DatePicker value={dataInicio} onChange={setDataInicio} placeholder="Data início" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Data Fim</Label>
          <DatePicker value={dataFim} onChange={setDataFim} min={dataInicio} placeholder="Data fim" />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição / Objetivo</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Objetivo da campanha..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ nome, descricao: descricao || undefined, canal, status, budget: budget ? parseFloat(budget as string) : undefined, gasto: gasto ? parseFloat(gasto as string) : undefined, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined })} disabled={!nome.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function MarketingPage() {
  const { selectedUnit, organization } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();

  // Estado do wizard e modais
  const [wizardOpen, setWizardOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<AICampaign | null>(null);
  const [assignModal, setAssignModal] = useState<{ id: number; name: string } | null>(null);

  // Estado das campanhas manuais
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");

  // Estado do Gerador de Conteúdo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contentResult, setContentResult] = useState<any[] | null>(null);

  // Estado da Criação de Arte
  const [artResult, setArtResult] = useState<{ resultado: ArtResultado; imagemUrl: string | null } | null>(null);
  const [isUploadingArtImage, setIsUploadingArtImage] = useState(false);
  const [flyerResult, setFlyerResult] = useState<{ flyerUrl: string | null; prompt: string; logoUrl?: string | null; allLogos?: { url: string; nome: string | null }[]; logoWarning?: string | null } | null>(null);
  // Guarda o último resultado da arte para uso no flyer
  const [lastArtData, setLastArtData] = useState<{ resultado: ArtResultado; imagemUrl: string | null; assunto: string; tipoArte: string; tipoImagem?: string; bancoVipImageUrl?: string } | null>(null);
  // Guarda os parâmetros do último flyer gerado para regeneração
  const [lastFlyerParams, setLastFlyerParams] = useState<{
    orgId: number; unitId?: number;
    headline: string; textoSecundario: string; cta: string;
    conceito: string; direcaoVisual: { cores: string; tipografia: string; estiloImagem: string; elementosVisuais: string };
    layout: { topo: string; centro: string; rodape: string };
    imagemUrl: string | null; assunto: string; tipoArte: string;
    tipoImagem?: "upload" | "ia" | "banco" | "banco-vip";
    logoId?: number;
  } | null>(null);

  // Queries
  const manualQ = trpc.gestaoTotal.marketing.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, status: filterStatus !== "todos" ? filterStatus : undefined },
    { enabled: !!org?.id }
  );
  const aiQ = trpc.gestaoTotal.marketingCampaigns.listCampaigns.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );

  const campanhas = (manualQ.data ?? []) as unknown as Campanha[];
  const aiCampaigns = (aiQ.data ?? []) as AICampaign[];

  // Mutations manuais
  const saveM = trpc.gestaoTotal.marketing.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.marketing.list.invalidate(); toast.success("Campanha salva!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.marketing.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.marketing.list.invalidate(); toast.success("Removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  // Mutation de Gerador de Conteúdo
  // Guarda os dados do wizard para salvar junto com o resultado
  const [lastWizardData, setLastWizardData] = useState<ContentWizardData | null>(null);

  const saveContentM = trpc.gestaoTotal.marketingCampaigns.saveContent.useMutation({
    onSuccess: () => utils.gestaoTotal.marketingCampaigns.listContentHistory.invalidate(),
  });

  const generateContentM = trpc.gestaoTotal.marketingCampaigns.generateContent.useMutation({
    onSuccess: (data, variables) => {
      if (data.ideias && data.ideias.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setContentResult(data.ideias as any[]);
        // Salvar automaticamente no histórico
        if (org?.id) {
          saveContentM.mutate({
            orgId: org.id,
            unitId: selectedUnit?.id,
            objetivo: variables.objetivo,
            formato: variables.formato,
            tipoEntrega: variables.tipoEntrega,
            publico: variables.publico,
            diferenciais: variables.diferenciais,
            tom: variables.tom,
            ideias: data.ideias,
          });
        }
      } else {
        toast.error("Nenhuma ideia foi gerada. Tente novamente.");
      }
    },
    onError: (err) => toast.error("Erro ao gerar conteúdo: " + err.message),
  });

  function handleGenerateContent(wizardData: ContentWizardData) {
    if (!org?.id) return;
    setLastWizardData(wizardData);
    generateContentM.mutate({
      orgId: org.id,
      unitId: selectedUnit?.id,
      companyName: org.name,
      ...wizardData,
    });
  }

  // Mutation de geração com IA
  const generateM = trpc.gestaoTotal.marketingCampaigns.generateCampaign.useMutation({
    onSuccess: (result) => {
      toast.success("Campanha gerada com sucesso!");
      setWizardOpen(false);
      utils.gestaoTotal.marketingCampaigns.listCampaigns.invalidate();
      // Abre o preview com a campanha recém-criada
      if (result.campaign) {
        setPreviewCampaign({
          id: result.id,
          campaignName: result.campaignName,
          status: "draft",
          createdAt: new Date(),
          jsonBlob: result.campaign,
          ...result.campaign,
        });
      }
    },
    onError: (err) => {
      toast.error("Erro ao gerar campanha: " + err.message);
    },
  });

  // Mutation de Criação de Arte
  const generateArtM = trpc.gestaoTotal.marketingCampaigns.generateArt.useMutation({
    onSuccess: (data, variables) => {
      const res = { resultado: data.resultado as ArtResultado, imagemUrl: data.imagemUrl ?? null };
      setArtResult(res);
      setLastArtData({
        resultado: data.resultado as ArtResultado,
        imagemUrl: data.imagemUrl ?? null,
        assunto: variables.assunto,
        tipoArte: variables.tipoArte,
        tipoImagem: variables.tipoImagem,
        bancoVipImageUrl: variables.bancoVipImageUrl, // URL original do banco VIP
      });
      setFlyerResult(null); // limpa flyer anterior ao gerar nova arte
      utils.gestaoTotal.marketingCampaigns.listArtHistory.invalidate();
      toast.success("Arte criada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao criar arte: " + err.message),
  });

  // Mutation de Gerar Flyer
  const generateFlyerM = trpc.gestaoTotal.marketingCampaigns.generateFlyer.useMutation({
    onSuccess: (data) => {
      setFlyerResult({ flyerUrl: data.flyerUrl, prompt: data.prompt, logoUrl: data.logoUrl, allLogos: data.allLogos, logoWarning: data.logoWarning });
      toast.success("Flyer gerado com sucesso!");
    },
    onError: (err) => toast.error("Erro ao gerar flyer: " + err.message),
  });

  // Mutation de exclusão de campanha IA
  const deleteAiM = trpc.gestaoTotal.marketingCampaigns.deleteCampaign.useMutation({
    onSuccess: () => { utils.gestaoTotal.marketingCampaigns.listCampaigns.invalidate(); toast.success("Campanha removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  // Query de detalhe da campanha IA (para abrir preview)
  const [selectedAiId, setSelectedAiId] = useState<number | null>(null);
  const aiDetailQ = trpc.gestaoTotal.marketingCampaigns.getCampaign.useQuery(
    { id: selectedAiId ?? 0, orgId: org?.id ?? 0 },
    { enabled: !!selectedAiId && !!org?.id }
  );

  function handleViewCampaign(id: number) {
    setSelectedAiId(id);
  }

  // Quando o detalhe carrega, abre o preview
  if (aiDetailQ.data && selectedAiId && !previewCampaign) {
    setPreviewCampaign(aiDetailQ.data as AICampaign);
    setSelectedAiId(null);
  }

  function handleGenerate(wizardData: WizardData) {
    if (!org?.id) return;
    generateM.mutate({
      orgId: org.id,
      unitId: selectedUnit?.id,
      wizardData,
      internalData: {
        company: {
          name: org?.name,
        },
      },
    });
  }

  const ativas = campanhas.filter(c => c.status === "ativa").length;
  const totalBudget = campanhas.reduce((s, c) => s + Number(c.budget ?? 0), 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            {ativas} campanhas ativas • {fmt(totalBudget)} budget total • {aiCampaigns.length} estratégias com IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova Campanha
          </Button>
          <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Gerar com IA
          </Button>
        </div>
      </div>

      <Tabs defaultValue="estrategias">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="estrategias" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Estratégias com IA
            {aiCampaigns.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{aiCampaigns.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Campanhas Manuais
            {campanhas.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{campanhas.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="conteudo" className="gap-1.5">
            <PenLine className="h-3.5 w-3.5" /> Gerador de Conteúdo
          </TabsTrigger>
          <TabsTrigger value="arte" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Criação de Arte
          </TabsTrigger>
        </TabsList>

        {/* ABA: Estratégias com IA */}
        <TabsContent value="estrategias" className="mt-4 space-y-4">
          {/* Card de geração */}
          <div className="glass-card border-primary/30 bg-primary/5">
            <div className="p-6 pt-0 p-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Gerador de Estratégia com IA</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Crie uma campanha completa com personas, calendário de 90 dias, anúncios, fluxos de CRM e muito mais.
                </p>
              </div>
              <Button onClick={() => setWizardOpen(true)} className="gap-2 shrink-0">
                <Wand2 className="h-4 w-4" /> Gerar Nova Campanha com IA
              </Button>
            </div>
          </div>

          {aiQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
            </div>
          ) : aiCampaigns.length === 0 ? (
            <div className="glass-card">
              <div className="p-6 pt-0 p-8 text-center">
                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma estratégia gerada ainda</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setWizardOpen(true)}>
                  Gerar primeira campanha
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {aiCampaigns.map((c: AICampaign) => {
                const channels = (c.channelMix as AICampaign[] | undefined) ?? [];
                const wr = c.wizardResponses as AICampaign | undefined;
                return (
                  <div className="glass-card bg-white/5 border-white/10 hover:border-primary/40 transition-colors" key={c.id}>
                    <div className="p-6 pb-2 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground text-sm truncate">{c.campaignName}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteAiM.mutate({ id: c.id, orgId: org?.id ?? 0 })}
                          className="text-muted-foreground hover:text-red-400 p-0.5 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-6 pt-0 pt-0 space-y-3">
                      {c.executiveSummary && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.executiveSummary}</p>
                      )}
                      {channels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {channels.slice(0, 4).map((ch: AICampaign, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{ch.channel} {ch.budget_percentage}%</Badge>
                          ))}
                        </div>
                      )}
                      {wr?.budget?.total && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{fmt(wr.budget.total)}</span> de orçamento
                        </p>
                      )}
                      {c.assignedToName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <UserCheck className="h-3 w-3" /> Atribuído a: <span className="font-medium">{c.assignedToName}</span>
                        </p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => handleViewCampaign(c.id)}>
                          <Eye className="h-3 w-3" /> Visualizar
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => setAssignModal({ id: c.id, name: c.campaignName })}>
                          <UserCheck className="h-3 w-3" /> Destinar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA: Campanhas Manuais */}
        <TabsContent value="campanhas" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["todos", "planejamento", "ativa", "pausada", "concluida"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
                {s}
              </button>
            ))}
          </div>

          {manualQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
          ) : campanhas.length === 0 ? (
            <div className="glass-card bg-white/5 border-white/10">
              <div className="p-6 pt-0 p-8 text-center">
                <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Criar campanha</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campanhas.map(c => (
                <div className="glass-card bg-white/5 border-white/10 hover:border-primary/40 transition-colors" key={c.id}>
                  <div className="p-6 pb-2 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {CANAL_ICONS[c.canal] ?? "??"}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground text-sm truncate">{c.nome}</h3>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">{c.canal}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                        <button onClick={() => setEditing(c)} className="text-muted-foreground hover:text-foreground p-0.5 ml-1"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => deleteM.mutate({ id: c.id, orgId: c.orgId })} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 pt-0 pt-0">
                    <div className="grid grid-cols-2 gap-2">
                      {c.budget && <div><p className="text-xs text-muted-foreground">Budget</p><p className="text-sm font-semibold">{fmt(Number(c.budget))}</p></div>}
                      {c.gasto && <div><p className="text-xs text-muted-foreground">Gasto</p><p className="text-sm font-semibold">{fmt(Number(c.gasto))}</p></div>}
                      {c.alcance && <div><p className="text-xs text-muted-foreground">Alcance</p><p className="text-sm font-semibold">{c.alcance.toLocaleString("pt-BR")}</p></div>}
                      {c.conversoes && <div><p className="text-xs text-muted-foreground">Conversões</p><p className="text-sm font-semibold text-green-400">{c.conversoes}</p></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ABA: Gerador de Conteúdo */}
        <TabsContent value="conteudo" className="mt-4 space-y-6">
          <ContentGeneratorWizard
            onGenerate={handleGenerateContent}
            isGenerating={generateContentM.isPending}
            result={contentResult}
            onReset={() => setContentResult(null)}
          />
          <ContentHistoryPanel orgId={org?.id ?? 0} unitId={selectedUnit?.id} onReuse={(ideias: unknown[]) => setContentResult(ideias)} />
        </TabsContent>

        {/* ABA: Criação de Arte */}
        <TabsContent value="arte" className="mt-4 space-y-4">
          <ArtGeneratorWizard
            orgId={org?.id}
            onGenerate={(wizardData: ArtWizardData) => {
              if (!org?.id) return;
              generateArtM.mutate({
                orgId: org.id,
                unitId: selectedUnit?.id,
                companyName: org.name,
                assunto: wizardData.assunto,
                tipoArte: wizardData.tipoArte,
                objetivo: wizardData.objetivo,
                tema: wizardData.tema,
                descricao: wizardData.descricao,
                briefing: wizardData.briefing,
                tipoImagem: wizardData.tipoImagem === "banco-vip" ? "banco-vip" : wizardData.tipoImagem,
                imagemUrl: wizardData.tipoImagem !== "banco-vip" ? wizardData.imagemUrl : undefined,
                bancoVipImageUrl: wizardData.tipoImagem === "banco-vip" ? wizardData.imagemUrl : undefined,
              });
            }}
            isGenerating={generateArtM.isPending}
            result={artResult}
            onReset={() => { setArtResult(null); setFlyerResult(null); setLastArtData(null); }}
            onUploadImage={async (file: File) => {
              setIsUploadingArtImage(true);
              try {
                const formData = new FormData();
                formData.append("file", file);
                const res = await fetch("/api/upload-art-image", { method: "POST", body: formData });
                const json = await res.json() as { url: string };
                return json.url;
              } finally {
                setIsUploadingArtImage(false);
              }
            }}
            isUploading={isUploadingArtImage}
            onGenerateFlyer={(layout, logoId, textos, tipoArteOverride) => {
              if (!org?.id || !artResult) return;
              // Usa textos editados pelo usuário na prévia ortográfica, ou os originais
              const headline = textos?.headline ?? artResult.resultado.headline;
              const textoSecundario = textos?.textoSecundario ?? artResult.resultado.textoSecundario;
              const cta = textos?.cta ?? artResult.resultado.cta;
              // Garantir que a imagem seja passada: usa a refinada, ou a original do banco VIP como fallback
              const imagemParaFlyer = artResult.imagemUrl
                ?? lastArtData?.bancoVipImageUrl  // fallback: imagem original do banco VIP
                ?? null;

              console.log("[generateFlyer] imagemUrl:", imagemParaFlyer?.substring(0, 80));
              console.log("[generateFlyer] tipoImagem:", lastArtData?.tipoImagem);
              console.log("[generateFlyer] tipoArte:", lastArtData?.tipoArte);

              const params = {
                orgId: org.id,
                unitId: selectedUnit?.id,
                headline,
                textoSecundario,
                cta,
                conceito: artResult.resultado.conceito,
                direcaoVisual: artResult.resultado.direcaoVisual,
                layout,
                imagemUrl: imagemParaFlyer,
                assunto: lastArtData?.assunto ?? "",
                tipoArte: tipoArteOverride ?? lastArtData?.tipoArte ?? "post_instagram",
                tipoImagem: (lastArtData?.tipoImagem as "upload" | "ia" | "banco" | "banco-vip" | undefined),
                logoId,
              };
              // Guarda os parâmetros para regeneração
              setLastFlyerParams(params);
              generateFlyerM.mutate(params);
            }}
            onRegenerateFlyer={() => {
              if (!lastFlyerParams) return;
              // Regenera com os mesmos parâmetros mas a IA varia a composição visual
              generateFlyerM.mutate(lastFlyerParams);
            }}
            isGeneratingFlyer={generateFlyerM.isPending}
            flyerResult={flyerResult}
          />
          {org?.id && (
            <ArtHistoryPanel
              orgId={org.id}
              unitId={selectedUnit?.id}
              onReuse={({ wizardData, resultado, imagemUrl }) => {
                setArtResult({ resultado, imagemUrl });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Wizard de geração com IA */}
      <MarketingCampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onGenerate={handleGenerate}
        isGenerating={generateM.isPending}
      />

      {/* Preview da campanha gerada */}
      <CampaignPreview
        open={!!previewCampaign}
        onClose={() => setPreviewCampaign(null)}
        campaign={previewCampaign}
      />

      {/* Modal de atribuição */}
      {assignModal && (
        <AssignCampaignModal
          open={!!assignModal}
          onClose={() => setAssignModal(null)}
          campaignId={assignModal.id}
          campaignName={assignModal.name}
          onAssigned={() => utils.gestaoTotal.marketingCampaigns.listCampaigns.invalidate()}
        />
      )}

      {/* Formulário de campanha manual */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <FormCampanha
            onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }}
            onClose={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Campanha</DialogTitle></DialogHeader>
          {editing && (
            <FormCampanha
              initial={editing}
              onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
