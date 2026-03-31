/**
 * ServicosPage.tsx — Catálogo de serviços com preços
 */
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Scissors } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function ServicosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const q = trpc.dataVip.servicos.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const servicos = q.data ?? [];
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Scissors className="w-6 h-6 text-primary" /> Serviços</h1>
        <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"} · {servicos.length} serviços</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-right px-4 py-2">Preço</th>
                  <th className="text-right px-4 py-2">Duração</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={3} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>)
                  : servicos.length === 0
                    ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nenhum serviço cadastrado</td></tr>
                    : servicos.map((s: any) => (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{s.nome}</td>
                          <td className="px-4 py-2 text-right text-green-400">{s.preco ? fmt(Number(s.preco)) : "—"}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{s.duracaoMinutos ? `${s.duracaoMinutos} min` : "—"}</td>
                        </tr>
                      ))
                }
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
