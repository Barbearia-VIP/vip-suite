/**
 * ClientesPage.tsx — Lista de clientes com busca e paginação
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, ChevronLeft, ChevronRight } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function ClientesPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const q = trpc.dataVip.clientes.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, search: search || undefined, page, pageSize: PAGE_SIZE },
    { enabled: !!org?.id }
  );

  const total = q.data?.total ?? 0;
  const clientes = q.data?.clientes ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"} · {total.toLocaleString("pt-BR")} clientes</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Telefone</th>
                  <th className="text-right px-4 py-2">Visitas</th>
                  <th className="text-right px-4 py-2">Total Gasto</th>
                  <th className="text-right px-4 py-2">Primeira Visita</th>
                  <th className="text-right px-4 py-2">Última Visita</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  : clientes.map((c: any) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{c.clienteNome || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{c.telefone || "—"}</td>
                        <td className="px-4 py-2 text-right">{Number(c.totalVisitas).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right text-green-400">{fmt(Number(c.totalGasto))}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{fmtDate(c.primeiraVenda)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{fmtDate(c.ultimaVenda)}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} clientes</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
