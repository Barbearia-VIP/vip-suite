import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import PageHeader from "@/components/PageHeader";
import { Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Globe, Star, Key, Info } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Plataforma = "google" | "ifood" | "tripadvisor" | "ubereats" | "rappi" | "instagram" | "facebook" | "manual";

interface FormState {
  plataforma: Plataforma;
  placeId: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export default function IntegracoesPage() {
  const { selectedUnit } = useApp();
  const utils = trpc.useUtils();
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
  const [manualForm, setManualForm] = useState({
    autorNome: "",
    nota: "5",
    comentario: "",
    dataAvaliacao: new Date().toISOString().split("T")[0],
  });

  const conexoesQuery = trpc.reputacao.getConexoes.useQuery({ unitId }, { enabled: !!unitId });

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
      toast.success(`${data.importadas} novas avaliações importadas.`);
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

  function openEdit(c: any) {
    setForm({
      plataforma: c.plataforma,
      placeId: c.googlePlaceId || c.externalId || "",
      apiKey: c.googleApiKey || "",
      clientId: c.googleClientId || "",
      clientSecret: c.googleClientSecret || "",
    });
    setEditingId(c.id);
    setNovaIntegracao(true);
  }

  function handleSalvar() {
    salvarMutation.mutate({
      unitId,
      plataforma: form.plataforma,
      externalId: form.placeId,
      nome: selectedUnit?.name || "Unidade",
      googlePlaceId: form.plataforma === "google" ? form.placeId : undefined,
      googleApiKey: form.plataforma === "google" && form.apiKey ? form.apiKey : undefined,
      googleClientId: form.plataforma === "google" && form.clientId ? form.clientId : undefined,
      googleClientSecret: form.plataforma === "google" && form.clientSecret ? form.clientSecret : undefined,
    });
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
              setForm({ plataforma: "google", placeId: "", apiKey: "", clientId: "", clientSecret: "" });
              setNovaIntegracao(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />Nova Integração
            </Button>
          </div>
        }
      />

      {!unitId && (
        <div className="p-4 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/20 text-sm">
          Selecione uma unidade para gerenciar as integrações.
        </div>
      )}

      <div className="space-y-3">
        {conexoesQuery.isLoading ? (
          [1, 2].map(i => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)
        ) : conexoes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma integração configurada.</p>
              <p className="text-xs mt-1">Adicione uma integração para importar avaliações automaticamente.</p>
            </CardContent>
          </Card>
        ) : conexoes.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{c.plataforma}</span>
                      {c.isAtivo ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />Ativa
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
                          <XCircle className="w-3 h-3 mr-1" />Inativa
                        </Badge>
                      )}
                      {c.googleClientId && (
                        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
                          <Key className="w-3 h-3 mr-1" />OAuth App
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Place ID: {c.googlePlaceId || c.externalId || "—"}
                    </p>
                    {c.googleClientId && (
                      <p className="text-xs text-muted-foreground">
                        Client ID: {c.googleClientId.substring(0, 20)}...
                      </p>
                    )}
                    {c.ultimaSincronizacao && (
                      <p className="text-xs text-muted-foreground">
                        Última sync: {new Date(c.ultimaSincronizacao).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {c.totalAvaliacoes > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {c.totalAvaliacoes} avaliações · Nota média: {parseFloat(c.notaMedia || "0").toFixed(1)} ★
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(c)}
                  >
                    Editar
                  </Button>
                  {c.googlePlaceId && c.googleApiKey && (
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
                      Sincronizar
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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog: Nova / Editar Integração */}
      <Dialog open={novaIntegracao} onOpenChange={(open) => { setNovaIntegracao(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Integração" : "Nova Integração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plataforma</Label>
              <Select
                value={form.plataforma}
                onValueChange={(v) => setForm(f => ({ ...f, plataforma: v as Plataforma }))}
                disabled={!!editingId}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ifood">iFood</SelectItem>
                  <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Place ID / ID da Página</Label>
              <Input
                placeholder="Ex: ChIJN1t_tDeuEmsRUsoyG83frY4"
                value={form.placeId}
                onChange={(e) => setForm(f => ({ ...f, placeId: e.target.value }))}
              />
              {form.plataforma === "google" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Encontre em{" "}
                  <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" className="text-primary underline">
                    Place ID Finder
                  </a>
                </p>
              )}
            </div>

            {form.plataforma === "google" && (
              <>
                <Separator />
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong>Credenciais OAuth (Google Business Profile):</strong> Necessárias para importar avaliações via API oficial. Crie um projeto no{" "}
                    <a href="https://console.cloud.google.com" target="_blank" className="text-primary underline">Google Cloud Console</a>{" "}
                    e ative a API "Google My Business".
                  </p>
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

                <Separator />

                <div>
                  <Label>API Key do Google Places (alternativa)</Label>
                  <Input
                    type="password"
                    placeholder="Chave da API do Google Places (opcional)"
                    value={form.apiKey}
                    onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Usada como fallback quando o OAuth não está configurado.
                  </p>
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
              disabled={!form.placeId || salvarMutation.isPending}
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
              <Input
                type="date"
                value={manualForm.dataAvaliacao}
                onChange={(e) => setManualForm(f => ({ ...f, dataAvaliacao: e.target.value }))}
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
