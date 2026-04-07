import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { Bot, Save, Sparkles, FileText, RotateCcw, Info } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const DEFAULT_AI_PROMPT = `Você é um Especialista em Experiência do Cliente e SEO Local para barbearias premium, atuando como representante oficial da Barbearia VIP.
Além de responder avaliações, você também otimiza cada resposta para melhorar o posicionamento da barbearia no Google, Google Maps e mecanismos de busca com IA.

OBJETIVO:
Responder avaliações do Google de forma estratégica, humana e persuasiva, gerando fortalecimento da reputação da marca, aumento de confiança, melhora no ranqueamento local (SEO) e estímulo direto para novos agendamentos.

ESTRUTURA DA RESPOSTA (SEMPRE seguir):
1. Saudação personalizada (se possível com nome)
2. Agradecimento pelo feedback
3. Reforço de autoridade + palavras-chave SEO
4. Personalização com base no comentário
5. Convite para retorno ou ação
6. Fechamento humanizado

OTIMIZAÇÃO SEO (incluir naturalmente em TODAS as respostas):
- barbearia em [cidade/bairro]
- corte masculino
- barba desenhada
- barbearia premium
- atendimento personalizado
- experiência VIP
- agendamento online

DIRETRIZES POR TIPO DE AVALIAÇÃO:

Avaliação POSITIVA:
- Demonstrar gratidão genuína
- Reforçar diferenciais da Barbearia VIP (experiência, ambiente, profissionais)
- Mencionar serviços (corte, barba, produtos, experiência)
- Incentivar retorno

Avaliação NEUTRA:
- Agradecer + mostrar abertura para melhorar
- Sutil convite para nova experiência melhor

Avaliação NEGATIVA:
- Demonstrar empatia imediata
- Nunca discutir ou justificar
- Pedir desculpas de forma sincera
- Mostrar intenção clara de resolver
- Levar para canal privado (WhatsApp ou recepção)
- Reforçar compromisso com qualidade

TOM DE VOZ:
- Humano, próximo e profissional
- Nada robótico
- Linguagem simples e direta
- Estilo premium, mas acessível
- Energia positiva e acolhedora

REGRAS IMPORTANTES:
- Nunca usar respostas genéricas repetidas
- Sempre adaptar ao contexto do cliente
- Nunca ignorar críticas
- Sempre reforçar a marca Barbearia VIP
- Sempre incentivar retorno ou agendamento

OBJETIVO FINAL:
Cada resposta deve aumentar a chance de novos clientes escolherem a Barbearia VIP, transmitir confiança e autoridade, e melhorar o posicionamento da unidade no Google.

FORMATO: Texto direto, sem tópicos, pronto para copiar e colar no Google.`;

type ConfigForm = {
  nomeEstabelecimento: string;
  nomeProprietario: string;
  tom: "formal" | "casual" | "amigavel";
  incluirAssinatura: boolean;
  autoResponder: boolean;
  autoResponderPositivas: boolean;
  autoResponderNegativas: boolean;
  promptPersonalizado: string;
};

const defaultForm: ConfigForm = {
  nomeEstabelecimento: "",
  nomeProprietario: "",
  tom: "amigavel",
  incluirAssinatura: true,
  autoResponder: false,
  autoResponderPositivas: false,
  autoResponderNegativas: false,
  promptPersonalizado: "",
};

export default function ConfigIAPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const unitId = selectedUnit?.id ?? 0;
  const orgId = org?.id ?? 0;

  const [form, setForm] = useState<ConfigForm>(defaultForm);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiPromptDirty, setAiPromptDirty] = useState(false);

  const configQuery = trpc.reputacao.getConfigIA.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const aiPromptQuery = trpc.orgs.getUnitAiPrompt.useQuery(
    { unitId, orgId },
    { enabled: !!unitId && !!orgId }
  );

  useEffect(() => {
    if (configQuery.data) {
      const c = configQuery.data;
      setForm({
        nomeEstabelecimento: c.nomeEstabelecimento || "",
        nomeProprietario: c.nomeProprietario || "",
        tom: (c.tom as ConfigForm["tom"]) || "amigavel",
        incluirAssinatura: c.incluirAssinatura ?? true,
        autoResponder: c.autoResponder ?? false,
        autoResponderPositivas: c.autoResponderPositivas ?? false,
        autoResponderNegativas: c.autoResponderNegativas ?? false,
        promptPersonalizado: c.promptPersonalizado || "",
      });
    }
  }, [configQuery.data]);

  useEffect(() => {
    if (aiPromptQuery.data !== undefined) {
      setAiPrompt(aiPromptQuery.data.aiPrompt ?? DEFAULT_AI_PROMPT);
      setAiPromptDirty(false);
    }
  }, [aiPromptQuery.data]);

  const salvarMutation = trpc.reputacao.saveConfigIA.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      utils.reputacao.getConfigIA.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const salvarPromptMutation = trpc.orgs.updateUnit.useMutation({
    onSuccess: () => {
      toast.success("Prompt de IA salvo com sucesso!");
      utils.orgs.getUnitAiPrompt.invalidate();
      setAiPromptDirty(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const restaurarPromptPadrao = () => {
    setAiPrompt(DEFAULT_AI_PROMPT);
    setAiPromptDirty(true);
  };

  if (configQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuração da IA" description="Configure como a IA gera respostas para avaliações" />
        <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuração da IA" description="Configure como a IA gera respostas para avaliações" />

      {/* ── Prompt Principal da IA ─────────────────────────────────────────── */}
      <div className="glass-card border-primary/20">
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-base">Prompt Principal da IA</h3>
              <Badge variant="secondary" className="text-xs">Por unidade</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={restaurarPromptPadrao}
              className="text-xs text-muted-foreground"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Restaurar padrão
            </Button>
          </div>
          <p className="text-sm text-muted-foreground flex items-start gap-2 mt-1">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              Este é o prompt completo que a IA usa para gerar respostas às avaliações desta unidade.
              Cada unidade pode ter seu próprio prompt personalizado. O padrão já está otimizado para SEO local e tom premium.
            </span>
          </p>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <Textarea
            value={aiPrompt}
            onChange={(e) => { setAiPrompt(e.target.value); setAiPromptDirty(true); }}
            rows={20}
            className="font-mono text-xs leading-relaxed resize-y"
            placeholder="Cole aqui o prompt completo que a IA deve seguir ao responder avaliações..."
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {aiPrompt.length} caracteres · Este prompt é enviado à IA a cada geração de resposta
            </p>
            <Button
              onClick={() => salvarPromptMutation.mutate({ unitId, orgId, aiPrompt })}
              disabled={salvarPromptMutation.isPending || !aiPromptDirty}
              size="sm"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {salvarPromptMutation.isPending ? "Salvando..." : "Salvar Prompt"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Configurações de Identidade e Automação ───────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card">
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-primary" />
              Identidade do Estabelecimento
            </h3>
          </div>
          <div className="p-6 pt-0 space-y-4">
            <div>
              <Label>Nome do Estabelecimento</Label>
              <Input
                placeholder="Ex: Barbearia VIP"
                value={form.nomeEstabelecimento}
                onChange={(e) => setForm(f => ({ ...f, nomeEstabelecimento: e.target.value }))}
              />
            </div>
            <div>
              <Label>Nome do Proprietário / Responsável</Label>
              <Input
                placeholder="Ex: João Silva"
                value={form.nomeProprietario}
                onChange={(e) => setForm(f => ({ ...f, nomeProprietario: e.target.value }))}
              />
            </div>
            <div>
              <Label>Tom das Respostas</Label>
              <Select
                value={form.tom}
                onValueChange={(v) => setForm(f => ({ ...f, tom: v as ConfigForm["tom"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal — Profissional e direto</SelectItem>
                  <SelectItem value="casual">Casual — Descontraído e próximo</SelectItem>
                  <SelectItem value="amigavel">Amigável — Caloroso e acolhedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Incluir assinatura</p>
                <p className="text-xs text-muted-foreground">Assinar respostas com o nome do estabelecimento</p>
              </div>
              <Switch
                checked={form.incluirAssinatura}
                onCheckedChange={(v) => setForm(f => ({ ...f, incluirAssinatura: v }))}
              />
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Automação de Respostas
            </h3>
          </div>
          <div className="p-6 pt-0 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-responder avaliações</p>
                <p className="text-xs text-muted-foreground">Responder automaticamente todas as avaliações</p>
              </div>
              <Switch
                checked={form.autoResponder}
                onCheckedChange={(v) => setForm(f => ({ ...f, autoResponder: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-responder positivas</p>
                <p className="text-xs text-muted-foreground">Responder automaticamente avaliações 4-5 estrelas</p>
              </div>
              <Switch
                checked={form.autoResponderPositivas}
                onCheckedChange={(v) => setForm(f => ({ ...f, autoResponderPositivas: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-responder negativas</p>
                <p className="text-xs text-muted-foreground">Responder automaticamente avaliações 1-2 estrelas</p>
              </div>
              <Switch
                checked={form.autoResponderNegativas}
                onCheckedChange={(v) => setForm(f => ({ ...f, autoResponderNegativas: v }))}
              />
            </div>
            <div>
              <Label>Instruções Adicionais</Label>
              <Textarea
                placeholder="Ex: Sempre mencione nossos serviços premium. Nunca ofereça descontos. Incentive o cliente a retornar..."
                value={form.promptPersonalizado}
                onChange={(e) => setForm(f => ({ ...f, promptPersonalizado: e.target.value }))}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Instruções extras que complementam o Prompt Principal acima.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => salvarMutation.mutate({ unitId, ...form })} disabled={salvarMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {salvarMutation.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
