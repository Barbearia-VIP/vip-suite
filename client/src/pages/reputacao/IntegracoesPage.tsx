import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/PageHeader";
import { Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Globe, Star, Key, Info, AlertTriangle, ExternalLink, Copy, Wifi, WifiOff } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DatePicker } from "@/components/DatePicker";

type Plataforma = "google" | "ifood" | "tripadvisor" | "ubereats" | "rappi" | "instagram" | "facebook" | "manual";

interface FormState {
  plataforma: Plataforma;
  placeId: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export default function IntegracoesPage() {
  const { selectedUnit, availableUnits } = useApp();
  const utils = trpc.useUtils();
  useOrg(); // garante que as unidades sejam carregadas no contexto
  // Para o formulário, usa a unidade selecionada globalmente ou permite escolher
  const [formUnitId, setFormUnitId] = useState<number>(selectedUnit?.id ?? 0);
  const unitId = selectedUnit?.id ?? 0;
  const [novaIntegracao, setNovaIntegracao] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({
    plataforma: "google",
    placeId: "",
    apiKey: "",
    clientId: "",
    clientSecret: "",
  });
  const [importManual, setImportManual] = useState(false);
  const [showOAuthGuide, setShowOAuthGuide] = useState(false);
  const [manualForm, setManualForm] = useState({
    autorNome: "",
    nota: "5",
    comentario: "",
    dataAvaliacao: new Date().toISOString().split("T")[0],
  });

  const conexoesQuery = trpc.reputacao.getConexoes.useQuery({ unitId }, { enabled: !!unitId });
  const getAuthUrlQuery = trpc.reputacao.getGoogleAuthUrl.useQuery(
    { unitId, redirectOrigin: typeof window !== "undefined" ? window.location.origin : "" },
    { enabled: false }
  );
  const fetchReviewsMut = trpc.reputacao.fetchGoogleReviews.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronizado! ${data.importadas} novas, ${data.atualizadas} atualizadas`);
      utils.reputacao.getDashboard.invalidate();
      utils.reputacao.getConexoes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Detectar retorno do OAuth Google
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("google_connected");
    const oauthError = params.get("error");
    if (connected === "1") {
      toast.success("Google Business Profile conectado! Sincronizando avaliações...");
      window.history.replaceState({}, "", window.location.pathname);
      conexoesQuery.refetch().then(() => {
        fetchReviewsMut.mutate({ unitId });
      });
    } else if (oauthError) {
      toast.error(`Erro ao conectar com Google: ${decodeURIComponent(oauthError)}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const salvarMutation = trpc.reputacao.saveConexao.useMutation({
    onSuccess: () => {
      toast.success("Integração salva com sucesso!");
      setNovaIntegracao(false);
      setEditingId(null);
      setForm({ plataforma: "google", placeId: "", apiKey: "", clientId: "", clientSecret: "" });
      utils.reputacao.getConexoes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const excluirMutation = trpc.reputacao.deleteConexao.useMutation({
    onSuccess: () => { toast.success("Integração removida."); utils.reputacao.getConexoes.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const sincronizarMutation = trpc.reputacao.importarGooglePlaces.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.importadas} novas avaliações importadas, ${data.atualizadas} atualizadas.`);
      utils.reputacao.getConexoes.invalidate();
      utils.reputacao.getDashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const addAvaliacaoMutation = trpc.reputacao.addAvaliacao.useMutation({
    onSuccess: () => {
      toast.success("Avaliação adicionada!");
      setImportManual(false);
      setManualForm({ autorNome: "", nota: "5", comentario: "", dataAvaliacao: new Date().toISOString().split("T")[0] });
      utils.reputacao.getDashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const conexoes = conexoesQuery.data || [];
  const redirectUri = `${typeof window !== "undefined" ? window.location.origin : ""}/api/google-oauth/callback`;

  function openEdit(c: any) {
    setForm({
      plataforma: c.plataforma,
      placeId: c.googlePlaceId || c.externalId || "",
      apiKey: c.googleApiKey || "",
      clientId: c.googleClientId || "",
      clientSecret: c.googleClientSecret || "",
    });
    setFormUnitId(c.unitId || unitId);
    setEditingId(c.id);
    setNovaIntegracao(true);
  }

  function handleSalvar() {
    if (!formUnitId) {
      toast.error("Selecione uma unidade antes de salvar.");
      return;
    }
    salvarMutation.mutate({
      unitId: formUnitId,
      plataforma: form.plataforma,
      externalId: form.placeId,
      nome: availableUnits.find(u => u.id === formUnitId)?.name || selectedUnit?.name || "Unidade",
      googlePlaceId: form.plataforma === "google" ? form.placeId : undefined,
      googleApiKey: form.plataforma === "google" && form.apiKey ? form.apiKey : undefined,
      googleClientId: form.plataforma === "google" && form.clientId ? form.clientId : undefined,
      googleClientSecret: form.plataforma === "google" && form.clientSecret ? form.clientSecret : undefined,
    });
  }

  async function handleConectarGoogle() {
    const result = await getAuthUrlQuery.refetch();
    if (result.data?.url) {
      window.location.href = result.data.url;
    } else {
      toast.error("Não foi possível gerar URL de autorização. Verifique o Client ID.");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  }

  function getStatusBadge(c: any) {
    if (c.googleAccessToken) {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
          <Wifi className="w-3 h-3 mr-1" />OAuth Ativo
        </Badge>
      );
    }
    if (!c.googleAccessToken) {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
          <AlertTriangle className="w-3 h-3 mr-1" />Aguardando OAuth
        </Badge>
      );
    }
    if (c.isAtivo) {
      return (
        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
          <CheckCircle2 className="w-3 h-3 mr-1" />Ativa
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
        <WifiOff className="w-3 h-3 mr-1" />Inativa
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrações"
        description="Configure as plataformas de avaliação por unidade"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportManual(true)}>
              <Plus className="w-4 h-4 mr-2" />Avaliação Manual
            </Button>
            <Button size="sm" onClick={() => {
              setEditingId(null);
              setFormUnitId(selectedUnit?.id ?? 0);
              setForm({ plataforma: "google", placeId: "", apiKey: "", clientId: "", clientSecret: "" });
              setNovaIntegracao(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />Nova Integração
            </Button>
          </div>
        }
      />

      {!unitId && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Selecione uma unidade para gerenciar as integrações.</AlertDescription>
        </Alert>
      )}

      {/* Guia de configuração OAuth */}
      {conexoes.some((c: any) => c.plataforma === "google" && !c.googleAccessToken) && (
        <div className="glass-card border-amber-500/30 bg-amber-500/5">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Autorização Google Pendente
            </h3>
          </div>
          <div className="p-6 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              O Client ID do Google está configurado, mas a autorização OAuth ainda não foi concluída.
              Para importar avaliações do Google Business Profile, siga os passos abaixo:
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowOAuthGuide(!showOAuthGuide)}
            >
              <Info className="w-3.5 h-3.5 mr-1.5" />
              {showOAuthGuide ? "Ocultar instruções" : "Ver instruções de configuração"}
            </Button>
            {showOAuthGuide && (
              <div className="space-y-4 text-xs text-muted-foreground bg-background/50 rounded-lg p-4 border">
                <div>
                  <p className="font-semibold text-foreground mb-2">1. Ative as APIs no Google Cloud Console</p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>Acesse <a href="https://console.cloud.google.com/apis/library" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">APIs e Serviços → Biblioteca <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Ative: <strong>Google Business Profile API</strong></li>
                    <li>Ative: <strong>My Business Business Information API</strong></li>
                    <li>Ative: <strong>My Business Account Management API</strong></li>
                  </ol>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-2">2. Configure a Tela de Permissão OAuth</p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>Vá em <strong>APIs e Serviços → Tela de permissão OAuth</strong></li>
                    <li>Tipo de usuário: <strong>Externo</strong></li>
                    <li>Adicione o escopo: <code className="bg-muted px-1 rounded">https://www.googleapis.com/auth/business.manage</code></li>
                    <li>Adicione seu e-mail como <strong>usuário de teste</strong> (enquanto o app estiver em modo de teste)</li>
                  </ol>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-2">3. Crie as Credenciais OAuth</p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>Vá em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">Credenciais → Criar credenciais → ID do cliente OAuth <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Tipo: <strong>Aplicativo da Web</strong></li>
                    <li>Em <strong>"URIs de redirecionamento autorizados"</strong>, adicione exatamente:</li>
                  </ol>
                  <div className="flex items-center gap-2 bg-muted rounded p-2 mt-2">
                    <code className="text-xs flex-1 break-all text-primary">{redirectUri}</code>
                    <Button variant="ghost" size="sm" className="h-6 px-2 shrink-0" onClick={() => copyToClipboard(redirectUri)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="mt-2">4. Salve e copie o <strong>Client ID</strong> e <strong>Client Secret</strong> gerados</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-2">4. Configure na Integração</p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>Edite a integração Google abaixo e cole o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
                    <li>Clique em <strong>"Autorizar Google"</strong></li>
                    <li>Faça login com a conta que gerencia o Google Business Profile</li>
                    <li>As avaliações serão importadas automaticamente após a autorização</li>
                    <li>Respostas enviadas pelo sistema serão publicadas diretamente no Google</li>
                  </ol>
                </div>
                <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-blue-700 font-medium">Alternativa rápida (sem OAuth):</p>
                  <p className="mt-1">Adicione uma <strong>Google Places API Key</strong> na integração para importar as avaliações mais recentes sem precisar de autorização OAuth. As respostas, neste caso, precisarão ser feitas manualmente no Google.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {conexoesQuery.isLoading ? (
          [1, 2].map(i => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)
        ) : conexoes.length === 0 ? (
          <div className="glass-card">
            <div className="p-6 pt-0 py-12 text-center text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma integração configurada.</p>
              <p className="text-xs mt-1">Adicione uma integração para importar avaliações automaticamente.</p>
            </div>
          </div>
        ) : conexoes.map((c: any) => (
          <div className="glass-card" key={c.id}>
            <div className="p-6 pt-0 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium capitalize">{c.plataforma}</span>
                      {getStatusBadge(c)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.nome}</p>
                    {c.googlePlaceId && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Place ID: <code className="text-xs">{c.googlePlaceId}</code>
                      </p>
                    )}
                    {c.googleClientId && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Client ID: <code className="text-xs">{c.googleClientId.substring(0, 30)}...</code>
                      </p>
                    )}
                    {c.ultimaSincronizacao && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        Última sync: {new Date(c.ultimaSincronizacao).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {c.totalAvaliacoes > 0 && (
                      <p className="text-xs text-muted-foreground/60">
                        {c.totalAvaliacoes} avaliações · Média: {Number(c.notaMedia || 0).toFixed(1)} ★
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    Editar
                  </Button>

                  {/* Botão Autorizar Google OAuth */}
                  {c.plataforma === "google" && (
                    <Button
                      variant={c.googleAccessToken ? "outline" : "default"}
                      size="sm"
                      onClick={handleConectarGoogle}
                      disabled={getAuthUrlQuery.isFetching}
                      className={!c.googleAccessToken ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                    >
                      <Key className="w-3.5 h-3.5 mr-1.5" />
                      {c.googleAccessToken ? "Reautorizar" : "Autorizar Google"}
                    </Button>
                  )}

                  {/* Botão Sincronizar via OAuth (quando autorizado) */}
                  {c.plataforma === "google" && c.googleAccessToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchReviewsMut.mutate({ unitId })}
                      disabled={fetchReviewsMut.isPending}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchReviewsMut.isPending ? "animate-spin" : ""}`} />
                      Sincronizar
                    </Button>
                  )}

                  {/* Botão Sincronizar via Places API (fallback com API Key) */}
                  {c.plataforma === "google" && c.googlePlaceId && c.googleApiKey && !c.googleAccessToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sincronizarMutation.mutate({
                        unitId,
                        placeId: c.googlePlaceId,
                        apiKey: c.googleApiKey,
                      })}
                      disabled={sincronizarMutation.isPending}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sincronizarMutation.isPending ? "animate-spin" : ""}`} />
                      Sync Places
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => excluirMutation.mutate({ id: c.id, unitId })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Alerta: OAuth não concluído e sem API Key */}
              {c.plataforma === "google" && !c.googleAccessToken && !c.googleApiKey && (
                <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Para importar avaliações: <strong>1)</strong> Clique em "Autorizar Google" (requer configurar o redirect URI no Google Cloud Console), ou <strong>2)</strong> Edite e adicione uma <strong>Google Places API Key</strong> para importação imediata.
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dialog: Nova / Editar Integração */}
      <Dialog open={novaIntegracao} onOpenChange={(open) => { setNovaIntegracao(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Integração" : "Nova Integração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Seletor de unidade — obrigatório */}
            <div>
              <Label>Unidade <span className="text-destructive">*</span></Label>
              <Select
                value={formUnitId ? String(formUnitId) : ""}
                onValueChange={(v) => setFormUnitId(Number(v))}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!formUnitId && (
                <p className="text-xs text-destructive mt-1">Selecione a unidade para esta integração.</p>
              )}
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select
                value={form.plataforma}
                onValueChange={(v) => setForm(f => ({ ...f, plataforma: v as Plataforma }))}
                disabled={!!editingId}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Business Profile</SelectItem>
                  <SelectItem value="ifood">iFood</SelectItem>
                  <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Place ID / ID Externo</Label>
              <Input
                placeholder="Ex: ChIJ-TBxZ_s4J5URaJQWJ2zfqRA"
                value={form.placeId}
                onChange={(e) => setForm(f => ({ ...f, placeId: e.target.value }))}
              />
              {form.plataforma === "google" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Encontre em{" "}
                  <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" className="text-primary underline">
                    Google Place ID Finder
                  </a>
                </p>
              )}
            </div>

            {form.plataforma === "google" && (
              <>
                <Separator />
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    Google Places API Key
                    <Badge variant="outline" className="text-xs font-normal">Recomendado</Badge>
                  </Label>
                  <Input
                    type="password"
                    placeholder="AIza..."
                    value={form.apiKey}
                    onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Permite importar as 5 avaliações mais recentes imediatamente, sem OAuth. Crie em{" "}
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-primary underline">
                      Google Cloud Console
                    </a>
                    {" "}ativando a "Places API".
                  </p>
                </div>

                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">OAuth Google Business Profile</p>
                    <Badge variant="outline" className="text-xs font-normal">Avançado</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Permite importar <strong>todas as avaliações</strong> sem limite. Requer configurar o redirect URI no Google Cloud Console.
                  </p>
                  <div className="p-2.5 rounded-lg bg-muted/50 border">
                    <p className="text-xs font-medium mb-1">URI de redirecionamento autorizado:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs flex-1 break-all text-primary">{redirectUri}</code>
                      <Button variant="ghost" size="sm" className="h-6 px-2 shrink-0" onClick={() => copyToClipboard(redirectUri)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Adicione esta URL nas configurações OAuth do seu projeto no Google Cloud Console.</p>
                  </div>
                  <div>
                    <Label>Google Client ID</Label>
                    <Input
                      placeholder="Ex: 59770064530-xxx.apps.googleusercontent.com"
                      value={form.clientId}
                      onChange={(e) => setForm(f => ({ ...f, clientId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Google Client Secret</Label>
                    <Input
                      type="password"
                      placeholder="Ex: GOCSPX-..."
                      value={form.clientSecret}
                      onChange={(e) => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNovaIntegracao(false); setEditingId(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={!form.placeId || !formUnitId || salvarMutation.isPending}
            >
              {salvarMutation.isPending ? "Salvando..." : "Salvar Integração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Avaliação Manual */}
      <Dialog open={importManual} onOpenChange={setImportManual}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Avaliação Manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Autor</Label>
              <Input
                placeholder="Nome do cliente"
                value={manualForm.autorNome}
                onChange={(e) => setManualForm(f => ({ ...f, autorNome: e.target.value }))}
              />
            </div>
            <div>
              <Label>Nota</Label>
              <Select value={manualForm.nota} onValueChange={(v) => setManualForm(f => ({ ...f, nota: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comentário</Label>
              <Textarea
                placeholder="Texto da avaliação..."
                value={manualForm.comentario}
                onChange={(e) => setManualForm(f => ({ ...f, comentario: e.target.value }))}
                rows={4}
              />
            </div>
            <div>
              <Label>Data</Label>
              <DatePicker
                value={manualForm.dataAvaliacao}
                onChange={(v) => setManualForm(f => ({ ...f, dataAvaliacao: v }))}
                placeholder="Data da avaliação"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportManual(false)}>Cancelar</Button>
            <Button
              onClick={() => addAvaliacaoMutation.mutate({
                unitId,
                autorNome: manualForm.autorNome,
                nota: parseInt(manualForm.nota),
                comentario: manualForm.comentario,
                dataAvaliacao: manualForm.dataAvaliacao,
                plataforma: "manual",
              })}
              disabled={addAvaliacaoMutation.isPending}
            >
              <Star className="w-4 h-4 mr-2" />Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
