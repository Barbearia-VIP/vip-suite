/**
 * RaioXPage.tsx — Raio-X de retenção de clientes
 * Categorias: Ativo (≤45d) / Em Risco (46-90d) / Perdido (>90d) / Novo (≤45d desde cadastro)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, Search } from "lucide-react";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

const CAT_CONFIG = {
  ativo: { label: "Ativo", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  em_risco: { label: "Em Risco", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  perdido: { label: "Perdido", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export default function RaioXPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const [filtro, setFiltro] = useState<"todos" | "ativo" | "em_risco" | "perdido">("todos");
  const [search, setSearch] = useState("");

  const q = trpc.dataVip.raioX.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );

  const resumo = q.data?.resumo;
  const clientes = (q.data?.clientes ?? []).filter(c => {
    if (filtro !== "todos" && c.categoria !== filtro) return false;
    if (search && !c.clienteNome?.toLowerCase().includes(search.toLowerCase()) && !c.telefone?.includes(search)) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-purple-400" /> Raio-X de Retenção
        </h1>
        <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: "ativos", label: "Ativos (≤45 dias)", value: resumo?.ativos, color: "text-green-400" },
          { key: "emRisco", label: "Em Risco (46-90 dias)", value: resumo?.emRisco, color: "text-yellow-400" },
          { key: "perdidos", label: "Perdidos (>90 dias)", value: resumo?.perdidos, color: "text-red-400" },
          { key: "novos", label: "Novos (≤45 dias)", value: resumo?.novos, color: "text-blue-400" },
        ].map((k, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              {q.isLoading ? <Skeleton className="h-7 w-16 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value?.toLocaleString("pt-BR") ?? "—"}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["todos","ativo","em_risco","perdido"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}
          >
            {f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : f === "em_risco" ? "Em Risco" : "Perdidos"}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-7 text-xs w-48" />
        </div>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Telefone</th>
                  <th className="text-right px-4 py-2">Última Visita</th>
                  <th className="text-right px-4 py-2">Dias</th>
                  <th className="text-right px-4 py-2">Visitas</th>
                  <th className="text-center px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  : clientes.slice(0, 100).map((c: any, i: number) => {
                      const cfg = CAT_CONFIG[c.categoria as keyof typeof CAT_CONFIG] || CAT_CONFIG.ativo;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{c.clienteNome || "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{c.telefone || "—"}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{fmtDate(c.ultimaVenda)}</td>
                          <td className="px-4 py-2 text-right font-medium">{c.dias}</td>
                          <td className="px-4 py-2 text-right">{Number(c.totalVisitas).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
            {clientes.length > 100 && (
              <p className="text-xs text-muted-foreground text-center py-3">Mostrando 100 de {clientes.length} clientes. Use o filtro para refinar.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
