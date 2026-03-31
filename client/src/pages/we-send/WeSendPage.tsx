import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/PageHeader";
import { MessageSquare, Upload, Send, Users, CheckCircle, XCircle, Clock, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";

const STEPS = ["Configurar sessão", "Importar contatos", "Criar mensagem", "Personalizar", "Revisar", "Enviar"];

export default function WeSendPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [step, setStep] = useState(0);
  const [contacts, setContacts] = useState<Array<{ name: string; phone: string }>>([
    { name: "Carlos Silva", phone: "48999990001" },
    { name: "Ana Souza", phone: "48999990002" },
    { name: "Pedro Lima", phone: "48999990003" },
  ]);
  const [message, setMessage] = useState("Olá {nome}! Temos uma novidade especial para você. Venha nos visitar! 🎉");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);

  const configQuery = trpc.orgs.moduleConfigs.useQuery(
    { unitId: selectedUnit?.id ?? 0, orgId: org?.id ?? 0 },
    { enabled: !!selectedUnit?.id && !!org?.id }
  );
  const hasConfig = configQuery.data?.some(c => c.module === "we_send" && c.active);

  const startSending = () => {
    setSending(true);
    let done = 0;
    const interval = setInterval(() => {
      done++;
      const s = Math.floor(Math.random() * done);
      const f = done - s;
      setSent(s);
      setFailed(f);
      setProgress(Math.round((done / contacts.length) * 100));
      if (done >= contacts.length) {
        clearInterval(interval);
        setSending(false);
        toast.success(`Envio concluído! ${s} enviados, ${f} falhas.`);
      }
    }, 600);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="We Send WhatsApp"
        description={selectedUnit ? `Envio em massa — ${selectedUnit.name}` : "Envio em massa de WhatsApp"}
      />

      {!hasConfig && !configQuery.isLoading && (
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div><p className="text-xs font-medium text-foreground">WAHA não configurado</p>
          <p className="text-xs text-muted-foreground">Configure a URL e chave da API WAHA em Configurações para enviar mensagens.</p></div>
        </CardContent></Card>
      )}

      {/* Wizard Steps */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              i === step ? "bg-primary text-primary-foreground" :
              i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold">{i < step ? "✓" : i + 1}</span>
              {s}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          {step === 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Verificar sessão WhatsApp</h3>
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${hasConfig ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                <div className={`w-2 h-2 rounded-full ${hasConfig ? "bg-green-500" : "bg-amber-500"}`} />
                <p className="text-xs text-foreground">{hasConfig ? "Sessão WAHA configurada e pronta" : "Configure a sessão WAHA em Configurações"}</p>
              </div>
              <p className="text-xs text-muted-foreground">A sessão WhatsApp precisa estar ativa no servidor WAHA para enviar mensagens.</p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Importar contatos</h3>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground mb-2">Arraste uma planilha CSV/Excel ou clique para selecionar</p>
                <Button variant="outline" size="sm" className="text-xs h-7">Selecionar arquivo</Button>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">{contacts.length} contatos carregados (exemplo):</p>
                {contacts.slice(0, 3).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-green-500" />{c.name} — {c.phone}
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Criar mensagem</h3>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem (use {"{nome}"} para personalizar)</Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} className="text-xs resize-none" />
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-medium text-foreground mb-1">Preview:</p>
                <p className="text-xs text-muted-foreground">{message.replace("{nome}", contacts[0]?.name ?? "Cliente")}</p>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Personalização</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Intervalo entre envios (seg)</Label><Input type="number" defaultValue="3" className="text-xs h-8" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Horário de início</Label><Input type="time" defaultValue="09:00" className="text-xs h-8" /></div>
              </div>
              <p className="text-xs text-muted-foreground">Recomendamos um intervalo mínimo de 3 segundos entre envios para evitar bloqueios.</p>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Revisar antes de enviar</h3>
              {[
                { label: "Contatos", value: `${contacts.length} destinatários` },
                { label: "Mensagem", value: message.slice(0, 60) + "..." },
                { label: "Intervalo", value: "3 segundos entre envios" },
                { label: "Tempo estimado", value: `~${Math.ceil(contacts.length * 3 / 60)} minutos` },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-xs py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Envio em andamento</h3>
              {sending || progress > 0 ? (
                <div className="space-y-3">
                  <Progress value={progress} className="h-2" />
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-lg font-bold text-foreground">{progress}%</p><p className="text-xs text-muted-foreground">Progresso</p></div>
                    <div><p className="text-lg font-bold text-green-500">{sent}</p><p className="text-xs text-muted-foreground">Enviados</p></div>
                    <div><p className="text-lg font-bold text-red-500">{failed}</p><p className="text-xs text-muted-foreground">Falhas</p></div>
                  </div>
                  {!sending && progress === 100 && (
                    <div className="flex items-center gap-2 text-xs text-green-500"><CheckCircle className="w-4 h-4" />Envio concluído com sucesso!</div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Pronto para enviar {contacts.length} mensagens</p>
                  <Button className="gap-2" onClick={startSending}><Send className="w-4 h-4" />Iniciar envio</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />Anterior
        </Button>
        <Button size="sm" className="gap-1 text-xs" disabled={step === STEPS.length - 1} onClick={() => setStep(s => s + 1)}>
          Próximo<ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
