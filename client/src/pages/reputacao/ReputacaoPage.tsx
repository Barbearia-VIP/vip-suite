import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { Star, MessageSquare, TrendingUp, AlertCircle, ThumbsUp, ThumbsDown, Minus, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";

const MOCK_REVIEWS = [
  { id: 1, platform: "Google", author: "Carlos M.", rating: 5, text: "Melhor barbearia da cidade! Atendimento impecável e corte perfeito.", date: "há 2 dias", sentiment: "positive" },
  { id: 2, platform: "iFood", author: "Ana S.", rating: 4, text: "Muito bom, só achei o tempo de espera um pouco longo.", date: "há 3 dias", sentiment: "neutral" },
  { id: 3, platform: "Google", author: "Pedro L.", rating: 2, text: "Fui atendido com pressa e o resultado não foi o esperado.", date: "há 5 dias", sentiment: "negative" },
  { id: 4, platform: "TripAdvisor", author: "Maria C.", rating: 5, text: "Experiência incrível! Voltarei com certeza.", date: "há 1 semana", sentiment: "positive" },
];

const PLATFORM_COLORS: Record<string, string> = {
  Google: "oklch(0.65 0.15 30)",
  iFood: "oklch(0.65 0.15 30)",
  TripAdvisor: "oklch(0.65 0.15 145)",
  "Uber Eats": "oklch(0.65 0.15 200)",
};

const SENTIMENT_CONFIG = {
  positive: { icon: ThumbsUp, color: "text-green-500", bg: "bg-green-500/10" },
  neutral: { icon: Minus, color: "text-amber-500", bg: "bg-amber-500/10" },
  negative: { icon: ThumbsDown, color: "text-red-500", bg: "bg-red-500/10" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

export default function ReputacaoPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [aiResponse, setAiResponse] = useState<Record<number, string>>({});
  const configQuery = trpc.orgs.moduleConfigs.useQuery(
    { unitId: selectedUnit?.id ?? 0, orgId: org?.id ?? 0 },
    { enabled: !!selectedUnit?.id && !!org?.id }
  );
  const hasConfig = configQuery.data?.some(c => c.module === "reputacao" && c.active);

  const generateResponse = (id: number, text: string) => {
    setAiResponse(prev => ({ ...prev, [id]: "Obrigado pelo seu feedback! Ficamos felizes em saber da sua experiência. Nossa equipe está sempre buscando melhorar o atendimento. Esperamos vê-lo em breve!" }));
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reputação"
        description={selectedUnit ? `Avaliações — ${selectedUnit.name}` : "Avaliações e reputação online"}
        actions={<Button variant="outline" size="sm" className="gap-1.5 text-xs"><RefreshCw className="w-3.5 h-3.5" />Sincronizar</Button>}
      />

      {!hasConfig && !configQuery.isLoading && (
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div><p className="text-xs font-medium text-foreground">Google Place ID não configurado</p>
          <p className="text-xs text-muted-foreground">Configure o Google Place ID em Configurações para sincronizar avaliações reais.</p></div>
        </CardContent></Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Nota Média</p>
          <div className="flex items-center gap-2"><p className="text-2xl font-bold text-foreground">4.3</p><Star className="w-5 h-5 fill-amber-400 text-amber-400" /></div>
          <p className="text-xs text-muted-foreground mt-1">Todas as plataformas</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total de Avaliações</p>
          <p className="text-2xl font-bold text-foreground">247</p>
          <p className="text-xs text-green-500 mt-1">+18 este mês</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Sentimento Positivo</p>
          <p className="text-2xl font-bold text-green-500">78%</p>
          <p className="text-xs text-muted-foreground mt-1">Das avaliações</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Sem Resposta</p>
          <p className="text-2xl font-bold text-amber-500">12</p>
          <p className="text-xs text-muted-foreground mt-1">Aguardando resposta</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="avaliacoes">
        <TabsList className="h-8">
          <TabsTrigger value="avaliacoes" className="text-xs h-6 px-3"><Star className="w-3 h-3 mr-1" />Avaliações</TabsTrigger>
          <TabsTrigger value="plataformas" className="text-xs h-6 px-3"><TrendingUp className="w-3 h-3 mr-1" />Plataformas</TabsTrigger>
        </TabsList>

        <TabsContent value="avaliacoes" className="mt-4 space-y-3">
          {MOCK_REVIEWS.map(review => {
            const S = SENTIMENT_CONFIG[review.sentiment as keyof typeof SENTIMENT_CONFIG] ?? SENTIMENT_CONFIG.neutral;
            const SIcon = S.icon;
            return (
              <Card key={review.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground">{review.author}</span>
                        <Badge variant="outline" className="text-xs h-4 px-1.5" style={{ color: PLATFORM_COLORS[review.platform] ?? "oklch(0.6 0 0)" }}>{review.platform}</Badge>
                      </div>
                      <StarRating rating={review.rating} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${S.bg} flex items-center justify-center`}><SIcon className={`w-3 h-3 ${S.color}`} /></div>
                      <span className="text-xs text-muted-foreground">{review.date}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{review.text}</p>
                  {aiResponse[review.id] ? (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <p className="text-xs font-medium text-foreground mb-1">Resposta gerada por IA:</p>
                      <p className="text-xs text-muted-foreground">{aiResponse[review.id]}</p>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => generateResponse(review.id, review.text)}>
                      <MessageSquare className="w-3 h-3" />Gerar resposta com IA
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="plataformas" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { name: "Google", rating: 4.5, total: 182, color: "oklch(0.65 0.15 30)" },
              { name: "iFood", rating: 4.1, total: 43, color: "oklch(0.65 0.15 30)" },
              { name: "TripAdvisor", rating: 4.3, total: 15, color: "oklch(0.65 0.15 145)" },
              { name: "Uber Eats", rating: 3.9, total: 7, color: "oklch(0.65 0.15 200)" },
            ].map(platform => (
              <Card key={platform.name} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{platform.name}</p>
                    <div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /><span className="text-sm font-bold text-foreground">{platform.rating}</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground">{platform.total} avaliações</p>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div className="h-1.5 rounded-full" style={{ width: `${(platform.rating / 5) * 100}%`, background: platform.color }} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
