import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download, FileJson, Users, MessageSquare, Calendar, Megaphone,
  MessageCircle, Globe, Target, FlaskConical, X,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

interface CampaignData {
  id?: number;
  campaignName?: string;
  status?: string;
  createdAt?: Date | string;
  executiveSummary?: string;
  personas?: AnyObj[];
  messages?: AnyObj;
  channelMix?: AnyObj[];
  budgetSplit?: AnyObj;
  calendar90d?: AnyObj[];
  contentIdeas?: AnyObj[];
  adsKits?: AnyObj;
  crmFlows?: AnyObj;
  landingPage?: AnyObj;
  kpisTargets?: AnyObj[];
  experimentsBacklog?: AnyObj[];
  risksCompliance?: string[];
  assumptions?: string[];
  jsonBlob?: AnyObj;
}

interface Props {
  open: boolean;
  onClose: () => void;
  campaign: CampaignData | null;
}

export default function CampaignPreview({ open, onClose, campaign }: Props) {
  if (!campaign) return null;

  const blob = campaign.jsonBlob as AnyObj | undefined;

  function exportJson() {
    const data = campaign?.jsonBlob ?? campaign;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanha-${campaign?.campaignName ?? "marketing"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  const personas = (campaign.personas ?? blob?.personas ?? []) as AnyObj[];
  const messages = (campaign.messages ?? blob?.messages ?? {}) as AnyObj;
  const channelMix = (campaign.channelMix ?? blob?.channel_mix ?? []) as AnyObj[];
  const budgetSplit = (campaign.budgetSplit ?? blob?.budget_split ?? {}) as AnyObj;
  const calendar90d = (campaign.calendar90d ?? blob?.calendar_90d ?? []) as AnyObj[];
  const contentIdeas = (campaign.contentIdeas ?? blob?.content_ideas ?? []) as AnyObj[];
  const adsKits = (campaign.adsKits ?? blob?.ads_kits ?? {}) as AnyObj;
  const crmFlows = (campaign.crmFlows ?? blob?.crm_flows ?? {}) as AnyObj;
  const landingPage = (campaign.landingPage ?? blob?.landing_page ?? {}) as AnyObj;
  const kpisTargets = (campaign.kpisTargets ?? blob?.kpis_targets ?? []) as AnyObj[];
  const experimentsBacklog = (campaign.experimentsBacklog ?? blob?.experiments_backlog ?? []) as AnyObj[];
  const risksCompliance = (campaign.risksCompliance ?? blob?.risks_compliance ?? []) as string[];
  const executiveSummary = campaign.executiveSummary ?? blob?.executive_summary ?? "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header fixo — não scrollable */}
        <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl truncate">{campaign.campaignName ?? "Campanha"}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline">{campaign.status ?? "draft"}</Badge>
                {campaign.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(campaign.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={exportPdf}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportJson}>
                <FileJson className="h-4 w-4 mr-1" /> JSON
              </Button>
            </div>
          </div>
        </div>

        {/* Abas fixas */}
        <Tabs defaultValue="resumo" className="flex flex-col flex-1 min-h-0">
          <div className="flex-shrink-0 px-6 pt-3 pb-0">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="resumo" className="gap-1 text-xs"><Users className="h-3 w-3" />Resumo</TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1 text-xs"><Calendar className="h-3 w-3" />Calendário</TabsTrigger>
            <TabsTrigger value="anuncios" className="gap-1 text-xs"><Megaphone className="h-3 w-3" />Anúncios</TabsTrigger>
            <TabsTrigger value="crm" className="gap-1 text-xs"><MessageCircle className="h-3 w-3" />CRM/WhatsApp</TabsTrigger>
            <TabsTrigger value="landing" className="gap-1 text-xs"><Globe className="h-3 w-3" />Landing Page</TabsTrigger>
            <TabsTrigger value="kpis" className="gap-1 text-xs"><Target className="h-3 w-3" />KPIs</TabsTrigger>
            <TabsTrigger value="experimentos" className="gap-1 text-xs"><FlaskConical className="h-3 w-3" />Experimentos</TabsTrigger>
          </TabsList>
          </div>
          {/* Área scrollable do conteúdo */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3">

          {/* ABA 1 — RESUMO */}
          <TabsContent value="resumo" className="space-y-4 mt-4">
            {executiveSummary && (
              <Card>
                <CardHeader><CardTitle className="text-base">Resumo Executivo</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed">{executiveSummary}</p></CardContent>
              </Card>
            )}

            {personas.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Personas</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {personas.map((p, i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.demographics}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {p.pain_points?.length > 0 && (
                          <div>
                            <p className="font-medium text-destructive mb-1">Dores</p>
                            <ul className="space-y-1">{p.pain_points.map((d: string, j: number) => <li key={j} className="text-muted-foreground">• {d}</li>)}</ul>
                          </div>
                        )}
                        {p.desires?.length > 0 && (
                          <div>
                            <p className="font-medium text-green-600 mb-1">Desejos</p>
                            <ul className="space-y-1">{p.desires.map((d: string, j: number) => <li key={j} className="text-muted-foreground">• {d}</li>)}</ul>
                          </div>
                        )}
                        {p.key_messages?.length > 0 && (
                          <div className="col-span-2">
                            <p className="font-medium text-primary mb-1">Mensagens-chave</p>
                            <ul className="space-y-1">{p.key_messages.map((m: string, j: number) => <li key={j} className="text-muted-foreground">• {m}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {messages.central_promise && (
              <Card>
                <CardHeader><CardTitle className="text-base">Proposta de Valor</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Promessa Central</p>
                    <p className="font-medium mt-1">{messages.central_promise}</p>
                  </div>
                  {messages.pillars?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Pilares</p>
                      <div className="flex flex-wrap gap-2">
                        {messages.pillars.map((p: string, i: number) => <Badge key={i} variant="secondary">{p}</Badge>)}
                      </div>
                    </div>
                  )}
                  {messages.social_proof?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Provas Sociais</p>
                      <ul className="space-y-1 text-sm">{messages.social_proof.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {channelMix.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Mix de Canais</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {channelMix.map((c, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{c.channel}</p>
                        <p className="text-sm text-muted-foreground">{c.justification}</p>
                      </div>
                      <Badge className="shrink-0">{c.budget_percentage}%</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA 2 — CALENDÁRIO */}
          <TabsContent value="calendario" className="space-y-4 mt-4">
            {calendar90d.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Calendário de 90 Dias</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {calendar90d.map((week: AnyObj, wi: number) => (
                    <div key={wi}>
                      <p className="font-semibold text-sm mb-2">Semana {week.week}</p>
                      <div className="space-y-2">
                        {(week.items ?? []).map((item: AnyObj, ii: number) => (
                          <div key={ii} className="grid grid-cols-6 gap-2 text-xs border rounded p-2 bg-muted/30">
                            <span className="font-medium">{item.day}</span>
                            <span className="col-span-2">{item.theme}</span>
                            <span className="text-muted-foreground">{item.format}</span>
                            <span className="text-muted-foreground">{item.objective}</span>
                            <span className="text-primary">{item.cta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {contentIdeas.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Ideias de Conteúdo</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {contentIdeas.map((idea: AnyObj, i: number) => (
                    <div key={i} className="border rounded-lg p-3 space-y-1">
                      <p className="font-medium text-sm">{idea.title}</p>
                      <p className="text-xs text-muted-foreground italic">"{idea.hook}"</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{idea.format}</Badge>
                        <Badge variant="secondary" className="text-xs">{idea.objective}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA 3 — ANÚNCIOS */}
          <TabsContent value="anuncios" className="space-y-4 mt-4">
            {adsKits.meta_ads && (
              <Card>
                <CardHeader><CardTitle className="text-base">Meta Ads</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {adsKits.meta_ads.headlines?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Headlines</p>
                      <ul className="space-y-1">{adsKits.meta_ads.headlines.map((h: string, i: number) => <li key={i} className="text-sm border-l-2 border-primary pl-3">{h}</li>)}</ul>
                    </div>
                  )}
                  {adsKits.meta_ads.primary_texts?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Textos Principais</p>
                      <ul className="space-y-2">{adsKits.meta_ads.primary_texts.map((t: string, i: number) => <li key={i} className="text-sm bg-muted/40 rounded p-2">{t}</li>)}</ul>
                    </div>
                  )}
                  {adsKits.meta_ads.ctas?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">CTAs</p>
                      <div className="flex flex-wrap gap-2">{adsKits.meta_ads.ctas.map((c: string, i: number) => <Badge key={i}>{c}</Badge>)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {adsKits.google_search && (
              <Card>
                <CardHeader><CardTitle className="text-base">Google Search Ads</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {adsKits.google_search.keywords?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Palavras-chave</p>
                      <div className="flex flex-wrap gap-2">{adsKits.google_search.keywords.map((k: string, i: number) => <Badge key={i} variant="secondary">{k}</Badge>)}</div>
                    </div>
                  )}
                  {adsKits.google_search.negative_keywords?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Palavras Negativas</p>
                      <div className="flex flex-wrap gap-2">{adsKits.google_search.negative_keywords.map((k: string, i: number) => <Badge key={i} variant="destructive">{k}</Badge>)}</div>
                    </div>
                  )}
                  {adsKits.google_search.ad_titles?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Títulos dos Anúncios</p>
                      <ul className="space-y-1">{adsKits.google_search.ad_titles.map((t: string, i: number) => <li key={i} className="text-sm border-l-2 border-blue-500 pl-3">{t}</li>)}</ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA 4 — CRM/WHATSAPP */}
          <TabsContent value="crm" className="space-y-4 mt-4">
            {crmFlows.whatsapp_templates?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Templates de WhatsApp</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {crmFlows.whatsapp_templates.map((t: string, i: number) => (
                    <div key={i} className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <p className="text-sm">{t}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {crmFlows.email_flows?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Fluxos de E-mail</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {crmFlows.email_flows.map((flow: AnyObj, fi: number) => (
                    <div key={fi}>
                      <p className="font-semibold text-sm mb-2">{flow.name}</p>
                      <div className="space-y-2">
                        {(flow.steps ?? []).map((step: AnyObj, si: number) => (
                          <div key={si} className="border rounded p-3 space-y-1">
                            <p className="text-xs text-muted-foreground">Dia {step.day}</p>
                            <p className="font-medium text-sm">{step.subject}</p>
                            <p className="text-sm text-muted-foreground">{step.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA 5 — LANDING PAGE */}
          <TabsContent value="landing" className="space-y-4 mt-4">
            {landingPage.structure?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Estrutura da Landing Page</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {landingPage.structure.map((section: AnyObj, i: number) => (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                      <Badge>{section.section}</Badge>
                      <p className="font-semibold">{section.headline}</p>
                      {section.subheadline && <p className="text-sm text-muted-foreground">{section.subheadline}</p>}
                      {section.cta && <p className="text-sm text-primary font-medium">CTA: {section.cta}</p>}
                      {section.items?.length > 0 && (
                        <ul className="space-y-1 text-sm">{section.items.map((item: string, j: number) => <li key={j}>• {item}</li>)}</ul>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {landingPage.checklist?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Checklist de Implementação</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {landingPage.checklist.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-green-500 mt-0.5">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA 6 — KPIS */}
          <TabsContent value="kpis" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Métricas-alvo</CardTitle></CardHeader>
              <CardContent>
                {kpisTargets.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {kpisTargets.map((kpi: AnyObj, i: number) => (
                      <div key={i} className="border rounded-lg p-4 space-y-1">
                        <p className="font-semibold text-primary">{kpi.metric}</p>
                        <p className="text-2xl font-bold">{kpi.target}</p>
                        <p className="text-xs text-muted-foreground">{kpi.formula}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum KPI definido.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 7 — EXPERIMENTOS */}
          <TabsContent value="experimentos" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Backlog de Experimentos (ICE Score)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {experimentsBacklog.length > 0 ? experimentsBacklog.map((exp: AnyObj, i: number) => (
                  <div key={i} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium">{exp.hypothesis}</p>
                      <Badge className="shrink-0 text-xs">ICE: {exp.ice_score}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Impacto: {exp.impact}/10</span>
                      <span>Confiança: {exp.confidence}/10</span>
                      <span>Facilidade: {exp.ease}/10</span>
                    </div>
                    <p className="text-xs text-primary">{exp.next_step}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Nenhum experimento definido.</p>
                )}
              </CardContent>
            </Card>

            {risksCompliance.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Riscos & Compliance</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {risksCompliance.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-amber-500 mt-0.5">⚠</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          </div>{/* fim da área scrollável */}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
