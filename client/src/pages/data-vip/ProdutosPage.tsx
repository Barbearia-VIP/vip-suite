/**
 * ProdutosPage.tsx — Catálogo de produtos com configuração de categorias (cabelo | barba | outros)
 * Permite marcar cada produto como 'cabelo', 'barba' ou 'outros' para uso nos KPIs.
 * Também oferece exportação CSV da base de produtos.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Package, Save, Info, Download, Search } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";
import { useChartTheme } from "@/hooks/useChartTheme";

type Categoria = "cabelo" | "barba" | "outros";

interface ProdutoRow {
  nome: string;
  qtd: number;
  valorTotal: number;
  categoria: Categoria | null;
}

const CAT_LABELS: Record<Categoria, string> = {
  cabelo: "Cabelo",
  barba: "Barba",
  outros: "Outros",
};

const CAT_COLORS: Record<Categoria, string> = {
  cabelo: "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30",
  barba: "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30",
  outros: "bg-muted/40 text-muted-foreground border-border hover:bg-muted/60",
};

const CAT_CYCLE: Record<Categoria | "null", Categoria> = {
  null: "cabelo",
  cabelo: "barba",
  barba: "outros",
  outros: "cabelo",
};

export default function ProdutosPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const ct = useChartTheme();

  const [overrides, setOverrides] = useState<Record<string, Categoria>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const q = trpc.dataVip.listProdutosExterno.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );

  const saveMutation = trpc.dataVip.saveProdutoCategorias.useMutation({
    onSuccess: (data) => {
      toast.success(`Categorias salvas — ${data.count} produto(s) atualizados.`);
      q.refetch();
      setOverrides({});
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  const produtos: ProdutoRow[] = q.data ?? [];

  const rows = useMemo(() =>
    produtos.map(p => ({
      ...p,
      categoriaEfetiva: overrides[p.nome] ?? p.categoria,
    })),
    [produtos, overrides]
  );

  const filteredRows = useMemo(() =>
    search.trim()
      ? rows.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()))
      : rows,
    [rows, search]
  );

  const pendingCount = Object.keys(overrides).length;

  const cabeloCount = rows.filter(r => r.categoriaEfetiva === "cabelo").length;
  const barbaCount = rows.filter(r => r.categoriaEfetiva === "barba").length;
  const outrosCount = rows.filter(r => !r.categoriaEfetiva || r.categoriaEfetiva === "outros").length;

  function toggle(nome: string, current: Categoria | null) {
    const key = (current ?? "null") as keyof typeof CAT_CYCLE;
    const next = CAT_CYCLE[key];
    setOverrides(prev => ({ ...prev, [nome]: next }));
  }

  function handleSave() {
    if (!org?.id) return;
    setSaving(true);
    const toSave = Object.entries(overrides).map(([nome, categoria]) => ({ nome, categoria }));
    saveMutation.mutate({ orgId: org.id, produtos: toSave }, {
      onSettled: () => setSaving(false),
    });
  }

  function handleExportCSV() {
    const header = "Nome,Categoria,Qtd Vendas,Valor Total (R$)";
    const lines = rows.map(r =>
      `"${r.nome}","${CAT_LABELS[r.categoriaEfetiva ?? "outros"] ?? "Não definido"}",${r.qtd},${r.valorTotal.toFixed(2)}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produtos_${selectedUnit?.name ?? "unidade"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso.");
  }

  return (
    <div className="p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
            <Package className="w-6 h-6 text-primary" /> Produtos
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedUnit ? selectedUnit.name : "Todas as unidades"} · {rows.length} produto(s)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportCSV} disabled={rows.length === 0} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
          {pendingCount > 0 && (
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              Salvar {pendingCount} alteração{pendingCount > 1 ? "ões" : ""}
            </Button>
          )}
        </div>
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
          Classifique cada produto como{" "}
          <strong className="text-blue-400">Cabelo</strong>,{" "}
          <strong className="text-amber-400">Barba</strong> ou{" "}
          <strong className="text-foreground">Outros</strong>.
          Clique na categoria para alternar entre os tipos. Produtos sem categoria são tratados como <strong className="text-foreground">Outros</strong>.
        </p>
      </div>

      {/* Resumo */}
      <div className="flex gap-3 flex-wrap">
        <Badge variant="outline" className="text-blue-400 border-blue-400/40">
          {cabeloCount} Cabelo
        </Badge>
        <Badge variant="outline" className="text-amber-400 border-amber-400/40">
          {barbaCount} Barba
        </Badge>
        <Badge variant="outline" className="text-muted-foreground border-border">
          {outrosCount} Outros / Sem categoria
        </Badge>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: ct.border }}>
          <p className="text-sm font-medium text-muted-foreground">Clique na categoria para alternar: Cabelo → Barba → Outros → Cabelo</p>
        </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ borderBottom: ct.border, background: ct.cardBgMuted }}>
                  <th className="text-left px-4 py-2">Nome do Produto</th>
                  <th className="text-right px-4 py-2">Qtd. Vendas</th>
                  <th className="text-right px-4 py-2">Valor Total</th>
                  <th className="text-center px-4 py-2 w-36">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={4} className="px-4 py-2">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : filteredRows.length === 0
                    ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                            {search ? "Nenhum produto encontrado para essa busca." : "Nenhum produto encontrado. Sincronize os dados primeiro."}
                          </td>
                        </tr>
                      )
                    : filteredRows.map((p) => {
                        const cat = p.categoriaEfetiva;
                        const isPending = p.nome in overrides;
                        return (
                          <tr
                            key={p.nome}
                            className="transition-colors"
                            style={{ borderBottom: ct.borderSubtle, background: isPending ? "oklch(0.76 0.145 72 / 0.04)" : undefined }}
                            onMouseEnter={e => (e.currentTarget.style.background = ct.cardBgHover)}
                            onMouseLeave={e => (e.currentTarget.style.background = isPending ? "oklch(0.76 0.145 72 / 0.04)" : "")}
                          >
                            <td className="px-4 py-2 font-medium">
                              {p.nome}
                              {isPending && (
                                <span className="ml-2 text-xs text-amber-400">• alterado</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {p.qtd.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {p.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => toggle(p.nome, cat)}
                                className="focus:outline-none"
                                title="Clique para alternar categoria"
                              >
                                {cat && cat !== "outros" ? (
                                  <Badge className={`${CAT_COLORS[cat]} cursor-pointer`}>
                                    {CAT_LABELS[cat]}
                                  </Badge>
                                ) : cat === "outros" ? (
                                  <Badge className={`${CAT_COLORS.outros} cursor-pointer`}>
                                    Outros
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
