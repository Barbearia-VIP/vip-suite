/**
 * ServicosPage.tsx — Catálogo de serviços com configuração de categorias (base / extra)
 * Permite marcar cada serviço como 'base' ou 'extra' para uso nos KPIs do Dashboard.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Scissors, Save, Info } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { useChartTheme } from "@/hooks/useChartTheme";

type Categoria = "base" | "extra";

interface ServicoRow {
  nome: string;
  qtd: number;
  categoria: Categoria | null;
}

export default function ServicosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const ct = useChartTheme();

  // Estado local de edição: mapa nome → categoria
  const [overrides, setOverrides] = useState<Record<string, Categoria>>({});
  const [saving, setSaving] = useState(false);

  const q = trpc.dataVip.listServicosExterno.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );

  const saveMutation = trpc.dataVip.saveServicoCategorias.useMutation({
    onSuccess: (data) => {
      toast.success(`Categorias salvas — ${data.count} serviço(s) atualizados.`);
      q.refetch();
      setOverrides({});
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  const servicos: ServicoRow[] = q.data ?? [];

  // Mescla dados do servidor com overrides locais ainda não salvos
  const rows = useMemo(() =>
    servicos.map(s => ({
      ...s,
      categoriaEfetiva: overrides[s.nome] ?? s.categoria,
    })),
    [servicos, overrides]
  );

  const pendingCount = Object.keys(overrides).length;

  function toggle(nome: string, current: Categoria | null) {
    const next: Categoria = current === "base" ? "extra" : "base";
    setOverrides(prev => ({ ...prev, [nome]: next }));
  }

  function handleSave() {
    if (!org?.id) return;
    setSaving(true);
    const toSave = Object.entries(overrides).map(([nome, categoria]) => ({ nome, categoria }));
    saveMutation.mutate({ orgId: org.id, servicos: toSave }, {
      onSettled: () => setSaving(false),
    });
  }

  const baseCount = rows.filter(r => r.categoriaEfetiva === "base").length;
  const extraCount = rows.filter(r => r.categoriaEfetiva === "extra" || r.categoriaEfetiva === null).length;

  return (
    <div className="p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
            <Scissors className="w-6 h-6 text-primary" /> Serviços
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {rows.length} serviços
          </p>
        </div>
        {pendingCount > 0 && (
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            Salvar {pendingCount} alteração{pendingCount > 1 ? "ões" : ""}
          </Button>
        )}
      </div>

      {/* Banner de carregamento */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={3} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      {/* Info box */}
      <div className="glass-card flex items-start gap-3 p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <p>
          Marque cada serviço como <strong className="text-foreground">Base</strong> (corte, barba, etc.) ou{" "}
          <strong className="text-foreground">Extra</strong> (acabamento, sobrancelha, depilação, etc.).
          Os KPIs de <em>Serviços Extra</em> no Dashboard usam essa configuração.
          Serviços sem categoria são tratados como <strong className="text-foreground">Extra</strong>.
        </p>
      </div>

      {/* Resumo */}
      <div className="flex gap-3">
        <Badge variant="outline" className="text-emerald-400 border-emerald-400/40">
          {baseCount} Base
        </Badge>
        <Badge variant="outline" className="text-amber-400 border-amber-400/40">
          {extraCount} Extra / Sem categoria
        </Badge>
      </div>

      {/* Tabela */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: ct.border }}>
          <p className="text-sm font-medium text-muted-foreground">Clique na categoria para alternar entre Base e Extra</p>
        </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ borderBottom: ct.border, background: ct.cardBgMuted }}>
                  <th className="text-left px-4 py-2">Nome do Serviço</th>
                  <th className="text-right px-4 py-2">Qtd. Vendas</th>
                  <th className="text-center px-4 py-2 w-36">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={3} className="px-4 py-2">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : rows.length === 0
                    ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                            Nenhum serviço encontrado. Sincronize os dados primeiro.
                          </td>
                        </tr>
                      )
                    : rows.map((s) => {
                        const cat = s.categoriaEfetiva;
                        const isPending = s.nome in overrides;
                        return (
                          <tr
                            key={s.nome}
                            className="transition-colors"
                            style={{ borderBottom: ct.borderSubtle, background: isPending ? "oklch(0.76 0.145 72 / 0.04)" : undefined }}
                            onMouseEnter={e => (e.currentTarget.style.background = ct.cardBgHover)}
                            onMouseLeave={e => (e.currentTarget.style.background = isPending ? "oklch(0.76 0.145 72 / 0.04)" : "")}
                          >
                            <td className="px-4 py-2 font-medium">
                              {s.nome}
                              {isPending && (
                                <span className="ml-2 text-xs text-amber-400">• alterado</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {s.qtd.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => toggle(s.nome, cat)}
                                className="focus:outline-none"
                                title="Clique para alternar"
                              >
                                {cat === "base" ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">
                                    Base
                                  </Badge>
                                ) : cat === "extra" ? (
                                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 cursor-pointer">
                                    Extra
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground hover:bg-muted/50 cursor-pointer">
                                    Não definido
                                  </Badge>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                }
              </tbody>
            </table>
          </div>
      </div>
    </div>
  );
}
