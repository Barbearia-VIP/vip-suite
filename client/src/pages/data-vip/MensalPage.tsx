/**
 * MensalPage.tsx — Análise mensal detalhada do Data VIP
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { BarChart3, TrendingUp, AlertCircle } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function MensalPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [meses, setMeses] = useState(12);

  const q = trpc.dataVip.faturamentoMensal.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, meses },
    { enabled: !!org?.id }
  );

  const data = (q.data ?? []).map(m => ({
    mes: MESES[parseInt(m.periodo.split("-")[1]) - 1] + "/" + m.periodo.split("-")[0].slice(2),
    faturamento: m.faturamento,
    atendimentos: m.atendimentos,
    ticketMedio: m.ticketMedio,
    clientes: m.clientes,
  }));

  const totFat = data.reduce((s, d) => s + d.faturamento, 0);
  const totAtend = data.reduce((s, d) => s + d.atendimentos, 0);
  const avgTicket = totAtend > 0 ? totFat / totAtend : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Análise Mensal
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"}
          </p>
        </div>
        <select
          value={meses}
          onChange={e => setMeses(Number(e.target.value))}
          className="text-sm bg-muted border border-border rounded px-2 py-1.5"
        >
          {[3,6,12,24].map(n => <option key={n} value={n}>Últimos {n} meses</option>)}
        </select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Faturamento Total", value: fmt(totFat) },
          { label: "Total Atendimentos", value: totAtend.toLocaleString("pt-BR") },
          { label: "Ticket Médio Geral", value: fmt(avgTicket) },
        ].map((k, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              {q.isLoading ? <Skeleton className="h-7 w-24 mt-1" /> : <p className="text-xl font-bold mt-1">{k.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico de faturamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Faturamento por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? <Skeleton className="h-56 w-full" /> :
           data.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              <AlertCircle className="w-4 h-4 mr-2" /> Sem dados — sincronize para ver o histórico
            </div>
           ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmt(v), "Faturamento"]} />
                <Bar dataKey="faturamento" fill="oklch(0.75 0.15 200)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
           )
          }
        </CardContent>
      </Card>

      {/* Gráfico de atendimentos e ticket */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Atendimentos por Mês</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-44 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="atendimentos" stroke="oklch(0.78 0.12 75)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ticket Médio por Mês</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-44 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `R$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Ticket Médio"]} />
                  <Line type="monotone" dataKey="ticketMedio" stroke="oklch(0.65 0.15 145)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela mensal */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Detalhamento Mensal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Mês</th>
                  <th className="text-right py-2 pr-4">Faturamento</th>
                  <th className="text-right py-2 pr-4">Atendimentos</th>
                  <th className="text-right py-2 pr-4">Ticket Médio</th>
                  <th className="text-right py-2">Clientes</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{r.mes}</td>
                    <td className="py-2 pr-4 text-right text-green-400">{fmt(r.faturamento)}</td>
                    <td className="py-2 pr-4 text-right">{r.atendimentos.toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-4 text-right">{fmt(r.ticketMedio)}</td>
                    <td className="py-2 text-right">{r.clientes.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
