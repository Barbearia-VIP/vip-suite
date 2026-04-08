import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import { Activity, RefreshCw, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function StoriesPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const configQuery = trpc.ig.getConfig.useQuery({ unitId }, { enabled: unitId > 0 });
  const logsQuery = trpc.igLogs.getList.useQuery({ unitId, type: "story_reply", pageSize: 30 }, { enabled: unitId > 0 });

  const saveConfigMut = trpc.ig.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); configQuery.refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const config = configQuery.data;
  const logs = logsQuery.data?.rows ?? [];

  const toggleStories = (enabled: boolean) => {
    if (!config) return;
    // Salva a config atual com o campo isActive para stories (via personalityPrompt como proxy)
    // Como não há campo replyToStories separado, usamos saveConfig com os campos existentes
    saveConfigMut.mutate({
      unitId,
      accessToken: config.accessToken ?? "",
      instagramUserId: config.instagramUserId ?? "",
      checkIntervalMinutes: config.checkIntervalMinutes,
      personalityPrompt: config.personalityPrompt ?? "",
      storyPersonalityPrompt: config.storyPersonalityPrompt ?? "",
      maxRepliesPerCycle: config.maxRepliesPerCycle,
      skipOwnComments: config.skipOwnComments === 1,
      requireApproval: config.requireApproval === 1,
    });
    toast.info(enabled ? "Respostas a stories ativadas" : "Respostas a stories desativadas");
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Respostas a Stories" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Respostas a Stories"
        description="Configure e monitore as respostas automáticas a menções em stories"
        actions={
          <Button variant="outline" size="sm" onClick={() => logsQuery.refetch()}>
            <RefreshCw className={`w-4 h-4 mr-2 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      {/* Configuração */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-3">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Configuração de Stories
          </h3>
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div>
              <Label className="text-sm font-medium">Bot ativo para Stories</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Responder automaticamente quando alguém mencionar a conta em um story</p>
            </div>
            <Switch
              checked={(config?.isActive ?? 0) === 1}
              onCheckedChange={toggleStories}
              disabled={saveConfigMut.isPending || configQuery.isLoading}
            />
          </div>

          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <p className="text-xs text-blue-400 font-medium mb-1">Como funciona:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>O bot monitora as menções da conta em stories de seguidores</li>
              <li>Quando detecta uma menção, gera uma resposta personalizada com IA</li>
              <li>A resposta é enviada como DM para o usuário que mencionou</li>
              <li>O prompt usado é o "Prompt para Stories" configurado no Editor de Prompts</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Logs de stories */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-2">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            Histórico de Respostas a Stories
          </h3>
        </div>
        <div className="p-6 pt-0 p-0">
          {logsQuery.isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma resposta a story registrada ainda</div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <Activity className="w-3.5 h-3.5 mt-0.5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{log.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/20">story</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
