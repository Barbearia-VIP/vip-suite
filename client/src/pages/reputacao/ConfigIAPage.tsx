import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { Bot, Save, Sparkles } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  const utils = trpc.useUtils();
  const unitId = selectedUnit?.id ?? 0;

  const [form, setForm] = useState<ConfigForm>(defaultForm);

  const configQuery = trpc.reputacao.getConfigIA.useQuery(
    { unitId },
    { enabled: !!unitId }
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

  const salvarMutation = trpc.reputacao.saveConfigIA.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      utils.reputacao.getConfigIA.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-primary" />
              Identidade do Estabelecimento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Automação de Respostas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <Label>Prompt Personalizado</Label>
              <Textarea
                placeholder="Ex: Sempre mencione nossos serviços premium. Nunca ofereça descontos. Incentive o cliente a retornar..."
                value={form.promptPersonalizado}
                onChange={(e) => setForm(f => ({ ...f, promptPersonalizado: e.target.value }))}
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Instruções adicionais que a IA seguirá ao gerar respostas.
              </p>
            </div>
          </CardContent>
        </Card>
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
