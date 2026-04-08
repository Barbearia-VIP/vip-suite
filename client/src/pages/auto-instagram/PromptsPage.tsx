import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import { BookOpen, Save, Zap, MessageCircle, Activity, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_COMMENT_PROMPT = `Você é o assistente virtual da Barbearia VIP, uma rede de barbearias premium.
Responda comentários de forma amigável, profissional e engajadora.
Use emojis com moderação. Seja breve (máximo 2 linhas).
Incentive o agendamento quando pertinente.
Responda sempre em português brasileiro.
Nunca revele que é uma IA.`;

const DEFAULT_STORY_PROMPT = `Você é o assistente virtual da Barbearia VIP.
Responda mensagens de stories de forma calorosa e pessoal.
Seja breve e direto. Use 1-2 emojis no máximo.
Incentive a visita à unidade ou o agendamento.
Responda sempre em português brasileiro.`;

export default function PromptsPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const promptsQuery = trpc.igPrompts.getPrompts.useQuery({ unitId }, { enabled: unitId > 0 });

  const [commentPrompt, setCommentPrompt] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [testComment, setTestComment] = useState("");
  const [testType, setTestType] = useState<"comment" | "story">("comment");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (promptsQuery.data) {
      setCommentPrompt(promptsQuery.data.personalityPrompt ?? DEFAULT_COMMENT_PROMPT);
      setStoryPrompt(promptsQuery.data.storyPersonalityPrompt ?? DEFAULT_STORY_PROMPT);
    }
  }, [promptsQuery.data]);

  const saveMut = trpc.igPrompts.savePrompts.useMutation({
    onSuccess: () => { toast.success("Prompts salvos com sucesso!"); promptsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const testMut = trpc.igPrompts.testPrompt.useMutation({
    onSuccess: (r) => {
      if (r.success && r.reply) setTestResult(r.reply);
      else toast.error(r.error ?? "Erro ao testar prompt");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    saveMut.mutate({ unitId, personalityPrompt: commentPrompt, storyPersonalityPrompt: storyPrompt });
  };

  const handleTest = () => {
    if (!testComment.trim()) { toast.error("Digite um comentário para testar"); return; }
    setTestResult(null);
    testMut.mutate({ unitId, commentText: testComment, promptType: testType });
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Editor de Prompts" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Editor de Prompts"
        description="Configure a personalidade do bot para comentários e stories"
        actions={
          <Button onClick={handleSave} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Prompts
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prompt de comentários */}
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-400" />
              Prompt para Comentários
            </h3>
            <p className="text-xs text-muted-foreground">Define como o bot responde a comentários nos posts</p>
          </div>
          <div className="p-6 pt-0 space-y-3">
            <Textarea
              value={commentPrompt}
              onChange={(e) => setCommentPrompt(e.target.value)}
              rows={10}
              className="text-sm font-mono resize-none"
              placeholder={DEFAULT_COMMENT_PROMPT}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{commentPrompt.length} caracteres</p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCommentPrompt(DEFAULT_COMMENT_PROMPT)}>
                Restaurar padrão
              </Button>
            </div>
          </div>
        </div>

        {/* Prompt de stories */}
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pb-2 pb-3">
            <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Prompt para Stories
            </h3>
            <p className="text-xs text-muted-foreground">Define como o bot responde a mensagens de stories</p>
          </div>
          <div className="p-6 pt-0 space-y-3">
            <Textarea
              value={storyPrompt}
              onChange={(e) => setStoryPrompt(e.target.value)}
              rows={10}
              className="text-sm font-mono resize-none"
              placeholder={DEFAULT_STORY_PROMPT}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{storyPrompt.length} caracteres</p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStoryPrompt(DEFAULT_STORY_PROMPT)}>
                Restaurar padrão
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Teste ao vivo */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Teste ao Vivo
          </h3>
          <p className="text-xs text-muted-foreground">Simule como o bot responderia a um comentário ou story específico</p>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={testType === "comment" ? "default" : "outline"}
              onClick={() => setTestType("comment")}
              className="text-xs"
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Comentário
            </Button>
            <Button
              size="sm"
              variant={testType === "story" ? "default" : "outline"}
              onClick={() => setTestType("story")}
              className="text-xs"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Story
            </Button>
          </div>

          <div className="flex gap-3">
            <Input
              placeholder={testType === "comment" ? "Ex: Quanto custa o corte?" : "Ex: Quero agendar!"}
              value={testComment}
              onChange={(e) => setTestComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
              className="flex-1"
            />
            <Button onClick={handleTest} disabled={testMut.isPending || !testComment.trim()}>
              {testMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            </Button>
          </div>

          {testResult && (
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-xs font-medium text-green-400">Resposta gerada pelo bot:</p>
              </div>
              <p className="text-sm text-foreground">{testResult}</p>
            </div>
          )}

          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground font-medium mb-1">Dicas para um bom prompt:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Defina claramente a personalidade e tom da marca</li>
              <li>Especifique o idioma (português brasileiro)</li>
              <li>Indique o limite de tamanho da resposta</li>
              <li>Mencione quando incentivar agendamento ou visita</li>
              <li>Instrua sobre o uso de emojis</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
