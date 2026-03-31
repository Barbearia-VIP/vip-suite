import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { Camera, Smile, Meh, Frown, Users, TrendingUp, AlertCircle, Activity } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { trpc } from "@/lib/trpc";

const MOCK_HISTORY = [
  { id: 1, name: "Carlos Silva", expression: "satisfeito", time: "14:32", visits: 8 },
  { id: 2, name: "Ana Souza", expression: "neutro", time: "14:15", visits: 3 },
  { id: 3, name: "Pedro Lima", expression: "satisfeito", time: "13:58", visits: 12 },
  { id: 4, name: "Maria Costa", expression: "irritado", time: "13:42", visits: 1 },
  { id: 5, name: "João Alves", expression: "satisfeito", time: "13:20", visits: 5 },
];

const EXPR_CONFIG = {
  satisfeito: { label: "Satisfeito", icon: Smile, color: "oklch(0.65 0.15 145)", bg: "bg-green-500/10" },
  neutro: { label: "Neutro", icon: Meh, color: "oklch(0.78 0.12 75)", bg: "bg-amber-500/10" },
  irritado: { label: "Irritado", icon: Frown, color: "oklch(0.65 0.15 30)", bg: "bg-red-500/10" },
};

const MOCK_PIE = [
  { name: "Satisfeito", value: 68 },
  { name: "Neutro", value: 24 },
  { name: "Irritado", value: 8 },
];
const PIE_COLORS = ["oklch(0.65 0.15 145)", "oklch(0.78 0.12 75)", "oklch(0.65 0.15 30)"];

export default function VipCamPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const configQuery = trpc.orgs.moduleConfigs.useQuery(
    { unitId: selectedUnit?.id ?? 0, orgId: org?.id ?? 0 },
    { enabled: !!selectedUnit?.id && !!org?.id }
  );
  const hasConfig = configQuery.data?.some(c => c.module === "vip_cam" && c.active);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="VIP Cam"
        description={selectedUnit ? `Reconhecimento Facial — ${selectedUnit.name}` : "Reconhecimento facial da rede"}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Câmera ativa</span>
          </div>
        }
      />

      {!hasConfig && !configQuery.isLoading && (
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div><p className="text-xs font-medium text-foreground">Câmera não configurada</p>
          <p className="text-xs text-muted-foreground">Configure as credenciais do Supabase em Configurações para ativar o reconhecimento.</p></div>
        </CardContent></Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Reconhecidos hoje</p>
          <p className="text-2xl font-bold text-foreground">47</p>
          <p className="text-xs text-green-500 mt-1">+12% vs ontem</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Satisfação geral</p>
          <p className="text-2xl font-bold text-green-500">68%</p>
          <p className="text-xs text-muted-foreground mt-1">Satisfeitos</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Clientes VIP</p>
          <p className="text-2xl font-bold text-foreground">18</p>
          <p className="text-xs text-muted-foreground mt-1">5+ visitas</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Novos clientes</p>
          <p className="text-2xl font-bold text-foreground">9</p>
          <p className="text-xs text-muted-foreground mt-1">Primeira visita</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="historico">
        <TabsList className="h-8">
          <TabsTrigger value="historico" className="text-xs h-6 px-3"><Activity className="w-3 h-3 mr-1" />Histórico</TabsTrigger>
          <TabsTrigger value="analise" className="text-xs h-6 px-3"><TrendingUp className="w-3 h-3 mr-1" />Análise</TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="mt-4">
          <div className="space-y-2">
            {MOCK_HISTORY.map(entry => {
              const E = EXPR_CONFIG[entry.expression as keyof typeof EXPR_CONFIG] ?? EXPR_CONFIG.neutro;
              const EIcon = E.icon;
              return (
                <Card key={entry.id} className="bg-card border-border">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${E.bg} flex items-center justify-center shrink-0`}>
                      <EIcon className="w-4 h-4" style={{ color: E.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.visits} visita{entry.visits !== 1 ? "s" : ""}</p>
                    </div>
                    <Badge className={`text-xs ${E.bg}`} style={{ color: E.color }}>{E.label}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{entry.time}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="analise" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição de Expressões</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={MOCK_PIE} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {MOCK_PIE.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "oklch(0.15 0 0)", border: "1px solid oklch(0.25 0 0)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center mt-2">
                  {MOCK_PIE.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-xs text-muted-foreground">{p.name} ({p.value}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {Object.entries(EXPR_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const pct = MOCK_PIE.find(p => p.name.toLowerCase() === key)?.value ?? 0;
                return (
                  <Card key={key} className="bg-card border-border">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: cfg.color }} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-foreground">{pct}%</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
