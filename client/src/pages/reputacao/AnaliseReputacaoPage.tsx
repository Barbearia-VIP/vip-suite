import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { BarChart3, TrendingUp, ThumbsUp, ThumbsDown, Star } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#22c55e", "#f59e0b", "#ef4444"];

export default function AnaliseReputacaoPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d" | "12m">("30d");

  const analiseQuery = trpc.reputacao.getAnalise.useQuery(
    { unitId, periodo },
    { enabled: !!unitId }
  );

  const resumoQuery = trpc.reputacao.getResumo.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const evolucao = (analiseQuery.data?.evolucao || []).map((e: any) => ({
    data: e.data,
    media: parseFloat(e.media || 0).toFixed(1),
    total: Number(e.total),
    positivas: Number(e.positivas),
    negativas: Number(e.negativas),
  }));

  const porPlataforma = (analiseQuery.data?.porPlataforma || []).map((p: any) => ({
    name: p.plataforma?.charAt(0).toUpperCase() + p.plataforma?.slice(1),
    total: Number(p.total),
    media: parseFloat(p.media || 0).toFixed(1),
  }));

  const porNota = (analiseQuery.data?.porNota || []).map((n: any) => ({
    nota: `${Math.round(n.nota)} ★`,
    total: Number(n.total),
  }));

  const resumo = resumoQuery.data;
  const sentimentoData = resumo ? [
    { name: "Positivas", value: Number(resumo.totalPositivas) },
    { name: "Neutras", value: Number(resumo.totalNeutras) },
    { name: "Negativas", value: Number(resumo.totalNegativas) },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análise de Reputação"
        description="Métricas detalhadas de sentimento e tendências"
        actions={
          <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="12m">Último ano</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Nota Média", value: resumo ? parseFloat(String(resumo.notaMedia)).toFixed(1) + " ★" : "—", icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Total Avaliações", value: resumo?.totalAvaliacoes ?? "—", icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "% Positivas", value: resumo ? `${Math.round((Number(resumo.totalPositivas) / (Number(resumo.totalAvaliacoes) || 1)) * 100)}%` : "—", icon: ThumbsUp, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "% Negativas", value: resumo ? `${Math.round((Number(resumo.totalNegativas) / (Number(resumo.totalAvaliacoes) || 1)) * 100)}%` : "—", icon: ThumbsDown, color: "text-red-500", bg: "bg-red-500/10" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              </div>
              <div className="text-2xl font-bold">{resumoQuery.isLoading ? "..." : k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Evolução da Nota Média</CardTitle></CardHeader>
          <CardContent>
            {evolucao.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolucao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v} ★`, "Nota Média"]} />
                  <Line type="monotone" dataKey="media" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição de Sentimentos</CardTitle></CardHeader>
          <CardContent>
            {sentimentoData.every(s => s.value === 0) ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sentimentoData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {sentimentoData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Avaliações por Plataforma</CardTitle></CardHeader>
          <CardContent>
            {porPlataforma.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porPlataforma}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Nota</CardTitle></CardHeader>
          <CardContent>
            {porNota.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porNota} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="nota" type="category" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
