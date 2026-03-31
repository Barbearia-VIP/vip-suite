import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import { Instagram, MessageSquare, Heart, Users, TrendingUp, AlertCircle, Bot, Settings, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";

const MOCK_COMMENTS = [
  { id: 1, user: "@carlos_vip", text: "Ficou incrível! 🔥", post: "Corte do dia", replied: true, time: "há 5 min" },
  { id: 2, user: "@ana_beauty", text: "Quanto custa o combo?", post: "Promoção", replied: false, time: "há 12 min" },
  { id: 3, user: "@pedro_barber", text: "Melhor barbearia! ❤️", post: "Story", replied: true, time: "há 25 min" },
  { id: 4, user: "@maria_style", text: "Quero agendar!", post: "Novo serviço", replied: false, time: "há 1h" },
];

const MOCK_RULES = [
  { id: 1, trigger: "preço", response: "Olá! Para saber os preços, acesse nosso link na bio ou envie uma DM 😊", active: true },
  { id: 2, trigger: "agendar", response: "Oi! Para agendar, clique no link da bio ou nos chame no WhatsApp!", active: true },
  { id: 3, trigger: "❤️", response: "Obrigado pelo carinho! 🙏 Nos vemos em breve!", active: false },
];

export default function AutoInstagramPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [rules, setRules] = useState(MOCK_RULES);
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const configQuery = trpc.orgs.moduleConfigs.useQuery(
    { unitId: selectedUnit?.id ?? 0, orgId: org?.id ?? 0 },
    { enabled: !!selectedUnit?.id && !!org?.id }
  );
  const hasConfig = configQuery.data?.some(c => c.module === "auto_instagram" && c.active);

  const addRule = () => {
    if (!newTrigger.trim() || !newResponse.trim()) return;
    setRules(prev => [...prev, { id: Date.now(), trigger: newTrigger.trim(), response: newResponse.trim(), active: true }]);
    setNewTrigger(""); setNewResponse("");
    toast.success("Regra adicionada!");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Auto Instagram"
        description={selectedUnit ? `Automação — ${selectedUnit.name}` : "Automação de Instagram"}
        actions={
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasConfig ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
            <span className="text-xs text-muted-foreground">{hasConfig ? "Bot ativo" : "Bot inativo"}</span>
          </div>
        }
      />

      {!hasConfig && !configQuery.isLoading && (
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div><p className="text-xs font-medium text-foreground">Instagram não conectado</p>
          <p className="text-xs text-muted-foreground">Configure o Access Token do Instagram em Configurações para ativar o bot.</p></div>
        </CardContent></Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Comentários respondidos", value: "142", sub: "Este mês", icon: MessageSquare, color: "oklch(0.65 0.15 320)" },
          { label: "Novos seguidores", value: "+38", sub: "Esta semana", icon: Users, color: "oklch(0.65 0.15 200)" },
          { label: "Taxa de engajamento", value: "6.8%", sub: "Média dos posts", icon: TrendingUp, color: "oklch(0.65 0.15 145)" },
          { label: "Curtidas totais", value: "1.2k", sub: "Último mês", icon: Heart, color: "oklch(0.65 0.15 30)" },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="bg-card border-border"><CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div><p className="text-xs text-muted-foreground mb-1">{kpi.label}</p><p className="text-xl font-bold text-foreground">{kpi.value}</p><p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p></div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}20` }}><Icon className="w-4 h-4" style={{ color: kpi.color }} /></div>
              </div>
            </CardContent></Card>
          );
        })}
      </div>

      <Tabs defaultValue="comentarios">
        <TabsList className="h-8">
          <TabsTrigger value="comentarios" className="text-xs h-6 px-3"><MessageSquare className="w-3 h-3 mr-1" />Comentários</TabsTrigger>
          <TabsTrigger value="regras" className="text-xs h-6 px-3"><Bot className="w-3 h-3 mr-1" />Regras do Bot</TabsTrigger>
        </TabsList>

        <TabsContent value="comentarios" className="mt-4 space-y-2">
          {MOCK_COMMENTS.map(comment => (
            <Card key={comment.id} className="bg-card border-border">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{comment.user[1]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground">{comment.user}</span>
                    <span className="text-xs text-muted-foreground">em {comment.post}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{comment.text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={comment.replied ? "secondary" : "outline"} className="text-xs">
                    {comment.replied ? "Respondido" : "Pendente"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{comment.time}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="regras" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Nova Regra de Resposta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Palavra-chave / gatilho</Label><Input placeholder="Ex: preço, agendar, ❤️" value={newTrigger} onChange={e => setNewTrigger(e.target.value)} className="text-xs h-8" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Resposta automática</Label><Input placeholder="Resposta que será enviada" value={newResponse} onChange={e => setNewResponse(e.target.value)} className="text-xs h-8" /></div>
              </div>
              <Button size="sm" className="gap-1 text-xs h-7" onClick={addRule}><Plus className="w-3 h-3" />Adicionar regra</Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {rules.map(rule => (
              <Card key={rule.id} className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <Switch checked={rule.active} onCheckedChange={v => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: v } : r))} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-xs h-4 px-1.5">Gatilho: {rule.trigger}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{rule.response}</p>
                  </div>
                  <button onClick={() => setRules(prev => prev.filter(r => r.id !== rule.id))} className="text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
