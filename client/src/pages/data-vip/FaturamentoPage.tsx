/**
 * FaturamentoPage.tsx — Análise detalhada de faturamento por produto e forma de pagamento
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign } from "lucide-react";

const COLORS = ["oklch(0.75 0.15 200)","oklch(0.78 0.12 75)","oklch(0.65 0.15 145)","oklch(0.65 0.15 280)","oklch(0.65 0.12 30)","oklch(0.7 0.1 320)"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function FaturamentoPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const periodos = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      list.push({ val, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    return list;
  }, []);

  const q = trpc.dataVip.faturamentoPorProduto.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, periodo },
    { enabled: !!org?.id }
  );

  const produtos = q.data?.porProduto ?? [];
  const pagamentos = q.data?.porPagamento ?? [];
  const totalProd = produtos.reduce((s, p) => s + p.total, 0);
  const totalPag = pagamentos.reduce((s, p) => s + p.total, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" /> Faturamento
          </h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="text-sm bg-muted border border-border rounded px-2 py-1.5">
          {periodos.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Por produto */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Por Serviço/Produto</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={produtos.slice(0,10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                    <XAxis type="number" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="produto" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Faturamento"]} />
                    <Bar dataKey="total" fill="oklch(0.75 0.15 200)" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1">
                  {produtos.slice(0,8).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {p.produto}
                      </span>
                      <span className="font-medium">{fmt(p.total)} ({totalProd > 0 ? Math.round(p.total/totalProd*100) : 0}%)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Por pagamento */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Por Forma de Pagamento</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pagamentos} dataKey="total" cx="50%" cy="50%" outerRadius={70} innerRadius={35} label={({ forma, percent }) => `${(percent*100).toFixed(0)}%`}>
                      {pagamentos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), "Faturamento"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1">
                  {pagamentos.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {p.forma || "Outros"}
                      </span>
                      <span className="font-medium">{fmt(p.total)} · {p.qtd} transações</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
