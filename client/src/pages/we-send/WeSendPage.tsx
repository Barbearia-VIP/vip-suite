import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/PageHeader";
import {
  MessageSquare, Send, Users, CheckCircle,
  AlertCircle, ChevronRight, ChevronLeft, Upload, Plus, Trash2,
  Settings, BarChart3, Wifi, WifiOff, RefreshCw, Download, FolderOpen,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STEPS = [
  { label: "Contatos", icon: Users },
  { label: "Mensagem", icon: MessageSquare },
  { label: "Configurar", icon: Settings },
  { label: "Revisar", icon: CheckCircle },
  { label: "Enviar", icon: Send },
];

type Contato = { nome: string; telefone: string };

function parseCsv(text: string): Contato[] {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const contatos: Contato[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ""));
    if (parts.length === 0) continue;
    const hasPhone = (s: string) => /\d{8,}/.test(s.replace(/\D/g, ""));
    if (parts.length === 1) {
      if (hasPhone(parts[0])) contatos.push({ nome: "", telefone: parts[0] });
    } else if (parts.length >= 2) {
      if (hasPhone(parts[0])) {
        contatos.push({ nome: parts[1] || "", telefone: parts[0] });
      } else {
        contatos.push({ nome: parts[0] || "", telefone: parts[1] });
      }
    }
  }
  return contatos.filter(c => c.telefone.replace(/\D/g, "").length >= 8);
}

export default function WeSendPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [step, setStep] = useState(0);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoManual, setContatoManual] = useState({ nome: "", telefone: "" });
  const [mensagem, setMensagem] = useState("Olá {nome}! Temos uma novidade especial para você. Venha nos visitar! 🎉");
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [intervalo, setIntervalo] = useState(3);
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal de IA para gerar mensagem
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSegmento, setAiSegmento] = useState<"perdidos" | "em_risco" | "one_shot" | "geral">("geral");
  const [aiNomeBarbearia, setAiNomeBarbearia] = useState(selectedUnit?.name || "");
  const [aiOferta, setAiOferta] = useState("");
  const [aiTom, setAiTom] = useState<"casual" | "formal">("casual");
  const [aiDestaque, setAiDestaque] = useState("");
  const [aiMensagemGerada, setAiMensagemGerada] = useState("");

  const generateMessageMutation = trpc.weSend.generateCampaignMessage.useMutation({
    onSuccess: (data) => {
      setAiMensagemGerada(data.mensagem);
    },
    onError: (err) => toast.error(err.message || "Erro ao gerar mensagem"),
  });

  const handleGenerateAI = () => {
    setAiMensagemGerada("");
    generateMessageMutation.mutate({
      segmento: aiSegmento,
      nomeBarbearia: aiNomeBarbearia || undefined,
      oferta: aiOferta || undefined,
      tom: aiTom,
      destaque: aiDestaque || undefined,
    });
  };

  const handleApplyAIMessage = () => {
    if (aiMensagemGerada) {
      setMensagem(aiMensagemGerada);
      setShowAIModal(false);
      setAiMensagemGerada("");
      toast.success("Mensagem aplicada! Você pode editar antes de enviar.");
    }
  };

  // Modal de carregar campanha rascunho
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [loadingDraftId, setLoadingDraftId] = useState<number | null>(null);
  const draftCampanhasQuery = trpc.weSend.getDraftCampanhas.useQuery(
    { unitId },
    { enabled: showDraftModal && !!unitId }
  );

  const handleLoadDraft = async (campanhaId: number) => {
    setLoadingDraftId(campanhaId);
    try {
      const data = await utils.weSend.getDraftCampanhaContatos.fetch({ id: campanhaId, unitId });
      setNomeCampanha(data.nome);
      setMensagem(data.mensagem);
      setContatos(data.contatos.map(c => ({ nome: c.nome, telefone: c.telefone })));
      setShowDraftModal(false);
      toast.success(`${data.contatos.length} contatos carregados da campanha "${data.nome}"`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar campanha");
    } finally {
      setLoadingDraftId(null);
    }
  };

  const dashboardQuery = trpc.weSend.getDashboard.useQuery({ unitId }, { enabled: !!unitId });
  const configQuery = trpc.weSend.getConfig.useQuery({ unitId }, { enabled: !!unitId });
  const sessionQuery = trpc.weSend.getSessionStatus.useQuery({ unitId }, { enabled: !!unitId, refetchInterval: 10000 });
  const utils = trpc.useUtils();

  const criarCampanhaMutation = trpc.weSend.criarCampanha.useMutation({
    onSuccess: (data) => {
      toast.success("Campanha criada! Iniciando envio...");
      enviarMutation.mutate({ campanhaId: data.campanhaId, unitId });
    },
    onError: (err) => toast.error(err.message),
  });
  const enviarMutation = trpc.weSend.enviarCampanha.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.weSend.getDashboard.invalidate({ unitId });
      setStep(4);
    },
    onError: (err) => toast.error(err.message),
  });
  const startSessionMutation = trpc.weSend.startSession.useMutation({
    onSuccess: () => {
      toast.success("Sessão iniciada! Aguarde o QR Code.");
      utils.weSend.getSessionStatus.invalidate({ unitId });
    },
    onError: (err) => toast.error(err.message),
  });

  const sessionStatus = sessionQuery.data?.status || "UNKNOWN";
  const isSessionWorking = sessionStatus === "WORKING";
  const isConfigured = !!configQuery.data;
  const dashboard = dashboardQuery.data;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setContatos(prev => [...prev, ...parsed]);
      toast.success(`${parsed.length} contatos importados`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addContatoManual = () => {
    const phone = contatoManual.telefone.replace(/\D/g, "");
    if (phone.length < 8) { toast.error("Telefone inválido"); return; }
    setContatos(prev => [...prev, { nome: contatoManual.nome, telefone: phone }]);
    setContatoManual({ nome: "", telefone: "" });
  };

  const removeContato = (idx: number) => setContatos(prev => prev.filter((_, i) => i !== idx));

  const handleEnviar = () => {
    if (!nomeCampanha.trim()) { toast.error("Informe o nome da campanha"); return; }
    if (contatos.length === 0) { toast.error("Adicione pelo menos um contato"); return; }
    if (!mensagem.trim()) { toast.error("Escreva a mensagem"); return; }
    criarCampanhaMutation.mutate({
      unitId,
      nome: nomeCampanha,
      mensagem,
      tipo: "texto",
      intervaloSegundos: intervalo,
      contatos: contatos.map(c => ({ nome: c.nome, telefone: c.telefone, variaveis: c.nome ? { nome: c.nome } : undefined })),
    });
  };

  const statusColor: Record<string, string> = {
    WORKING: "text-green-500",
    SCAN_QR_CODE: "text-yellow-500",
    STARTING: "text-blue-500",
    STOPPED: "text-muted-foreground",
    FAILED: "text-red-500",
    UNREACHABLE: "text-red-500",
    NOT_CONFIGURED: "text-muted-foreground",
    UNKNOWN: "text-muted-foreground",
  };

  const statusLabel: Record<string, string> = {
    WORKING: "Conectado",
    SCAN_QR_CODE: "Aguardando QR",
    STARTING: "Iniciando...",
    STOPPED: "Parado",
    FAILED: "Falhou",
    UNREACHABLE: "Servidor inacessível",
    NOT_CONFIGURED: "Não configurado",
    UNKNOWN: "Desconhecido",
  };

  const currentStatusColor = statusColor[sessionStatus] || "text-muted-foreground";
  const currentStatusLabel = statusLabel[sessionStatus] || sessionStatus;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="We Send WhatsApp"
        description="Envio em massa via WhatsApp com WAHA API"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/we-send/campanhas">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <BarChart3 className="w-3.5 h-3.5" />Campanhas
              </Button>
            </Link>
            <Link href="/we-send/configuracoes">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Settings className="w-3.5 h-3.5" />Configurar WAHA
              </Button>
            </Link>
          </div>
        }
      />

      {/* Status da sessão */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/10 bg-white/5">
        {isSessionWorking ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">Status WhatsApp:</span>
        <span className={`text-xs font-medium ${currentStatusColor}`}>{currentStatusLabel}</span>
        {!isConfigured && (
          <Link href="/we-send/configuracoes">
            <Button variant="link" size="sm" className="text-xs h-auto p-0 ml-2">Configurar agora →</Button>
          </Link>
        )}
        {isConfigured && !isSessionWorking && sessionStatus !== "SCAN_QR_CODE" && sessionStatus !== "STARTING" && (
          <Button variant="outline" size="sm" className="text-xs h-7 ml-2 gap-1"
            onClick={() => startSessionMutation.mutate({ unitId })}
            disabled={startSessionMutation.isPending}>
            <RefreshCw className="w-3 h-3" />Iniciar sessão
          </Button>
        )}
        {sessionStatus === "SCAN_QR_CODE" && (
          <Link href="/we-send/configuracoes">
            <Button variant="link" size="sm" className="text-xs h-auto p-0 ml-2">Escanear QR →</Button>
          </Link>
        )}
      </div>

      {/* KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Campanhas", value: dashboard.totalCampanhas, icon: MessageSquare, color: "text-primary" },
            { label: "Enviados (total)", value: dashboard.totalEnviados.toLocaleString(), icon: Send, color: "text-green-500" },
            { label: "Este mês", value: dashboard.enviadosMes.toLocaleString(), icon: BarChart3, color: "text-blue-500" },
            { label: "Taxa de sucesso", value: `${dashboard.taxaSucesso}%`, icon: CheckCircle, color: "text-emerald-500" },
          ].map(kpi => (
            <div className="glass-card bg-white/5 border-white/10" key={kpi.label}>
              <div className="p-6 pt-0 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wizard nova campanha */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />Nova Campanha
          </h3>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    i === step ? "bg-primary text-primary-foreground" :
                    i < step ? "bg-primary/20 text-primary cursor-pointer" :
                    "text-muted-foreground"
                  }`}
                >
                  <s.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 pt-0 space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da campanha</Label>
                <Input
                  placeholder="Ex: Promoção de Aniversário"
                  value={nomeCampanha}
                  onChange={e => setNomeCampanha(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input placeholder="Nome do contato" value={contatoManual.nome} onChange={e => setContatoManual(p => ({ ...p, nome: e.target.value }))} className="text-xs h-8" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Telefone</Label>
                  <Input placeholder="48999990001" value={contatoManual.telefone} onChange={e => setContatoManual(p => ({ ...p, telefone: e.target.value }))} className="text-xs h-8" />
                </div>
                <div className="flex items-end">
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={addContatoManual}>
                    <Plus className="w-3 h-3" />Add
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou importar</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />Importar CSV
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/10" onClick={() => setShowDraftModal(true)}>
                  <FolderOpen className="w-3.5 h-3.5" />Carregar Campanha
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" onClick={() => {
                  const csv = "nome,telefone\nCarlos Silva,48999990001\nAna Souza,48999990002";
                  const blob = new Blob([csv], { type: "text/csv" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "modelo_contatos.csv"; a.click();
                }}>
                  <Download className="w-3.5 h-3.5" />Modelo CSV
                </Button>
              </div>
              {/* Modal de seleção de campanha rascunho */}
              <Dialog open={showDraftModal} onOpenChange={setShowDraftModal}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-sm">Carregar Campanha</DialogTitle>
                    <DialogDescription className="text-xs">
                      Selecione uma campanha rascunho para carregar os contatos e a mensagem.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {draftCampanhasQuery.isLoading && (
                      <p className="text-xs text-muted-foreground text-center py-4">Carregando campanhas...</p>
                    )}
                    {draftCampanhasQuery.data?.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhuma campanha rascunho disponível para esta unidade.</p>
                    )}
                    {draftCampanhasQuery.data?.map(camp => (
                      <button
                        key={camp.id}
                        onClick={() => handleLoadDraft(camp.id)}
                        disabled={loadingDraftId === camp.id}
                        className="w-full text-left rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-3 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{camp.nome}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {camp.totalContatos} contatos · {new Date(camp.createdAt!).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/40 text-amber-500">
                            rascunho
                          </Badge>
                        </div>
                        {loadingDraftId === camp.id && (
                          <p className="text-[10px] text-primary mt-1">Carregando contatos...</p>
                        )}
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>

              {contatos.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-muted/30 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-foreground">{contatos.length} contatos</p>
                  {contatos.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{c.nome || "(sem nome)"} — {c.telefone}</span>
                      <button onClick={() => removeContato(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mensagem (use {"{"}nome{"}"}  para personalizar)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => {
                      setAiNomeBarbearia(selectedUnit?.name || "");
                      setAiMensagemGerada("");
                      setShowAIModal(true);
                    }}
                  >
                    <Sparkles className="w-3 h-3" />Gerar com IA
                  </Button>
                </div>
                <Textarea
                  value={mensagem}
                  onChange={e => setMensagem(e.target.value)}
                  rows={5}
                  className="text-xs resize-none"
                  placeholder="Olá {nome}! Temos uma novidade para você..."
                />
                <p className="text-xs text-muted-foreground">{mensagem.length} caracteres</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-medium text-foreground mb-1">Preview:</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {mensagem.replace(/\{nome\}/g, contatos[0]?.nome || "Cliente")}
                </p>
              </div>

              {/* Modal mini-wizard IA */}
              <Dialog open={showAIModal} onOpenChange={open => { setShowAIModal(open); if (!open) setAiMensagemGerada(""); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Gerar mensagem com IA
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Responda algumas perguntas para personalizar a mensagem.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    {/* Pergunta 1: Segmento */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Para qual público é esta campanha?</Label>
                      <Select value={aiSegmento} onValueChange={(v) => setAiSegmento(v as typeof aiSegmento)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="perdidos" className="text-xs">Clientes Perdidos (sem visita há +90 dias)</SelectItem>
                          <SelectItem value="em_risco" className="text-xs">Em Risco (sem visita há 45–90 dias)</SelectItem>
                          <SelectItem value="one_shot" className="text-xs">One-Shot (visitaram apenas uma vez)</SelectItem>
                          <SelectItem value="geral" className="text-xs">Clientes em Geral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Pergunta 2: Nome da barbearia */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Nome da barbearia / unidade</Label>
                      <Input
                        value={aiNomeBarbearia}
                        onChange={e => setAiNomeBarbearia(e.target.value)}
                        placeholder="Ex: Barbearia VIP"
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Pergunta 3: Oferta */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tem alguma promoção ou oferta? <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                      <Input
                        value={aiOferta}
                        onChange={e => setAiOferta(e.target.value)}
                        placeholder="Ex: 20% de desconto no corte"
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Pergunta 4: Tom */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tom da mensagem</Label>
                      <div className="flex gap-2">
                        {(["casual", "formal"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setAiTom(t)}
                            className={`flex-1 py-1.5 rounded-md text-xs border transition-colors ${
                              aiTom === t
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {t === "casual" ? "😊 Casual" : "👔 Formal"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Resultado gerado */}
                    {aiMensagemGerada && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">Mensagem gerada:</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{aiMensagemGerada}</p>
                        <p className="text-[10px] text-muted-foreground">{aiMensagemGerada.length} caracteres</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      {!aiMensagemGerada ? (
                        <Button
                          className="flex-1 gap-1.5 text-xs"
                          onClick={handleGenerateAI}
                          disabled={generateMessageMutation.isPending}
                        >
                          {generateMessageMutation.isPending ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Gerando...</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" />Gerar mensagem</>
                          )}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            className="flex-1 gap-1.5 text-xs"
                            onClick={handleGenerateAI}
                            disabled={generateMessageMutation.isPending}
                          >
                            {generateMessageMutation.isPending ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Gerando...</>
                            ) : (
                              <><RefreshCw className="w-3.5 h-3.5" />Gerar outra</>
                            )}
                          </Button>
                          <Button
                            className="flex-1 gap-1.5 text-xs"
                            onClick={handleApplyAIMessage}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />Usar esta
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo entre envios (seg)</Label>
                  <Input type="number" min={1} max={60} value={intervalo} onChange={e => setIntervalo(Number(e.target.value))} className="text-xs h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tempo estimado</Label>
                  <div className="h-8 flex items-center text-xs text-muted-foreground">
                    ~{Math.ceil(contatos.length * intervalo / 60)} minutos
                  </div>
                </div>
              </div>
              <Alert>
                <AlertCircle className="w-3.5 h-3.5" />
                <AlertDescription className="text-xs">
                  Recomendamos intervalo mínimo de 3 segundos para evitar bloqueios pelo WhatsApp.
                </AlertDescription>
              </Alert>
              {!isSessionWorking && (
                <Alert>
                  <WifiOff className="w-3.5 h-3.5" />
                  <AlertDescription className="text-xs">
                    A sessão WhatsApp não está ativa.{" "}
                    <Link href="/we-send/configuracoes" className="underline">Configure o WAHA</Link> antes de enviar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Revisar antes de enviar</h3>
              {[
                { label: "Campanha", value: nomeCampanha || "(sem nome)" },
                { label: "Contatos", value: `${contatos.length} destinatários` },
                { label: "Mensagem", value: mensagem.slice(0, 80) + (mensagem.length > 80 ? "..." : "") },
                { label: "Intervalo", value: `${intervalo} segundos entre envios` },
                { label: "Tempo estimado", value: `~${Math.ceil(contatos.length * intervalo / 60)} minutos` },
                { label: "Status WhatsApp", value: currentStatusLabel },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-xs py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium text-right max-w-[60%]">{item.value}</span>
                </div>
              ))}
              {!isSessionWorking && (
                <Alert>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <AlertDescription className="text-xs text-yellow-600 dark:text-yellow-400">
                    Atenção: A sessão WhatsApp não está ativa. O envio pode falhar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <Send className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Envio iniciado!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  As mensagens estão sendo enviadas em segundo plano.
                  Acompanhe o progresso em{" "}
                  <Link href="/we-send/campanhas" className="underline text-primary">Campanhas</Link>.
                </p>
              </div>
              <Button size="sm" className="text-xs gap-1.5" onClick={() => {
                setStep(0); setContatos([]); setNomeCampanha("");
                setMensagem("Olá {nome}! Temos uma novidade especial para você. Venha nos visitar! 🎉");
              }}>
                <Plus className="w-3.5 h-3.5" />Nova campanha
              </Button>
            </div>
          )}

          {step < 4 && (
            <div className="flex justify-between pt-2">
              <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />Anterior
              </Button>
              {step < STEPS.length - 2 ? (
                <Button size="sm" className="gap-1 text-xs" onClick={() => setStep(s => s + 1)}
                  disabled={step === 0 && (contatos.length === 0 || !nomeCampanha.trim())}>
                  Próximo<ChevronRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button size="sm" className="gap-1 text-xs bg-green-600 hover:bg-green-700"
                  onClick={handleEnviar}
                  disabled={criarCampanhaMutation.isPending || enviarMutation.isPending || !isSessionWorking}>
                  {criarCampanhaMutation.isPending || enviarMutation.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" />Enviar agora</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
