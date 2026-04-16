/**
 * MetasPage.tsx — Metas mensais + Faixas de comissão progressiva
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Target, Plus, Trash2, TrendingUp, Save, Info, Zap, Package, Users, Edit2, CheckCircle2, Clock } from "lucide-react";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

function fmt(v: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(Number(v));
}
function fmtPct(v: number | string) {
  return `${Number(v).toFixed(1)}%`;
}

// ─── Faixas de Comissão Progressiva ─────────────────────────────────────────

interface Faixa {
  id?: number;
  ordem: number;
  valorMinServicos: number;
  pctComissao: number;
  descricao: string;
}

function calcGanho(faixas: Faixa[], valorServicos: number): { faixa: Faixa | null; ganho: number; pct: number } {
  // Encontra a faixa mais alta que o barbeiro atingiu
  const sorted = [...faixas].sort((a, b) => b.valorMinServicos - a.valorMinServicos);
  const faixaAtingida = sorted.find(f => valorServicos >= f.valorMinServicos) ?? null;
  if (!faixaAtingida) return { faixa: null, ganho: 0, pct: 0 };
  const ganho = valorServicos * (faixaAtingida.pctComissao / 100);
  return { faixa: faixaAtingida, ganho, pct: faixaAtingida.pctComissao };
}

function FaixasComissaoTab() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const { user } = useAuth();
  // Admin ou gerente de unidade (unit_manager) pode editar as faixas da sua própria unidade
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin" || userRole === "unit_manager";

  // Unidade selecionada para editar faixas
  const [editUnitId, setEditUnitId] = useState<number | null>(null);
  const unitId = editUnitId ?? selectedUnit?.id ?? null;
  const unitObj = (units ?? []).find((u: any) => u.id === unitId);

  // Faixas em edição local
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [dirty, setDirty] = useState(false);

  // Preview
  const [previewValor, setPreviewValor] = useState<string>("3000");

  const q = trpc.dataVip.metaFaixasList.useQuery(
    { orgId: org?.id, unitId: unitId ?? undefined },
    { enabled: !!org?.id && !!unitId }
  );

  useEffect(() => {
    if (q.data) {
      setFaixas(q.data.map((f: any, i: number) => ({
        ...f,
        ordem: i,
        valorMinServicos: Number(f.valorMinServicos),
        pctComissao: Number(f.pctComissao),
      })));
      setDirty(false);
    }
  }, [q.data]);

  const utils = trpc.useUtils();
  const saveAll = trpc.dataVip.metaFaixasSaveAll.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.count} faixa(s) salva(s) com sucesso`);
      setDirty(false);
      utils.dataVip.metaFaixasList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function addFaixa() {
    const last = faixas[faixas.length - 1];
    const novaFaixa: Faixa = {
      ordem: faixas.length,
      valorMinServicos: last ? last.valorMinServicos + 500 : 0,
      pctComissao: last ? Math.min(last.pctComissao + 2, 100) : 33,
      descricao: "",
    };
    setFaixas(prev => [...prev, novaFaixa]);
    setDirty(true);
  }

  function removeFaixa(idx: number) {
    setFaixas(prev => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, ordem: i })));
    setDirty(true);
  }

  function updateFaixa(idx: number, field: keyof Faixa, value: string | number) {
    setFaixas(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
    setDirty(true);
  }

  function handleSave() {
    if (!unitId || !org?.id) return toast.error("Selecione uma unidade");
    saveAll.mutate({
      unitId,
      orgId: org.id,
      faixas: faixas.map((f, i) => ({
        id: f.id,
        ordem: i,
        valorMinServicos: Number(f.valorMinServicos),
        pctComissao: Number(f.pctComissao),
        descricao: f.descricao,
      })),
    });
  }

  const previewVal = Number(previewValor) || 0;
  const { faixa: faixaAtingida, ganho, pct } = calcGanho(faixas, previewVal);

  // Pré-carrega faixas do exemplo Santa Mônica
  function loadExemplo() {
    const exemplo: Faixa[] = [
      { ordem: 0, valorMinServicos: 0,       pctComissao: 33, descricao: "Base" },
      { ordem: 1, valorMinServicos: 16562.5,  pctComissao: 35, descricao: "Meta 250 atend." },
      { ordem: 2, valorMinServicos: 23187.5,  pctComissao: 37, descricao: "Meta 350 atend." },
      { ordem: 3, valorMinServicos: 26500,    pctComissao: 39, descricao: "Meta 400 atend." },
      { ordem: 4, valorMinServicos: 29812.5,  pctComissao: 41, descricao: "Meta 450 atend." },
      { ordem: 5, valorMinServicos: 33125,    pctComissao: 43, descricao: "Meta 500 atend." },
      { ordem: 6, valorMinServicos: 37100,    pctComissao: 45, descricao: "Meta 560 atend." },
      { ordem: 7, valorMinServicos: 40412.5,  pctComissao: 47, descricao: "Meta 610 atend." },
      { ordem: 8, valorMinServicos: 46375,    pctComissao: 50, descricao: "Meta 700 atend." },
    ];
    setFaixas(exemplo);
    setDirty(true);
    toast.info("Faixas do exemplo Santa Mônica carregadas. Clique em Salvar para confirmar.");
  }

  return (
    <div className="space-y-5">
      {/* Seletor de unidade */}
      {isAdmin && (units ?? []).length > 1 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Unidade:</Label>
          <Select value={String(unitId ?? "")} onValueChange={v => { setEditUnitId(Number(v)); setDirty(false); }}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione a unidade..." />
            </SelectTrigger>
            <SelectContent>
              {(units ?? []).map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!unitId ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Selecione uma unidade para configurar as faixas de comissão.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Tabela de faixas */}
          <div className="xl:col-span-2 space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Faixas de Comissão — {unitObj?.name ?? "Unidade"}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Ao atingir o valor mínimo de serviços, o barbeiro passa a ganhar o % correspondente sobre todos os serviços do período.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {faixas.length === 0 && (
                      <Button size="sm" variant="outline" onClick={loadExemplo} className="text-xs gap-1">
                        <Info className="w-3 h-3" /> Exemplo
                      </Button>
                    )}
                    <Button size="sm" onClick={addFaixa} className="gap-1.5">
                      <Plus className="w-4 h-4" /> Faixa
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {q.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : faixas.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    Nenhuma faixa cadastrada. Clique em <strong>+ Faixa</strong> para adicionar ou use o botão <strong>Exemplo</strong> para carregar o modelo Santa Mônica.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                      <div className="col-span-1">#</div>
                      <div className="col-span-4">Valor mín. serviços (R$)</div>
                      <div className="col-span-2">% Comissão</div>
                      <div className="col-span-4">Descrição</div>
                      <div className="col-span-1"></div>
                    </div>
                    {faixas.map((f, idx) => (
                      <div key={idx} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg border ${faixaAtingida && f.valorMinServicos === faixaAtingida.valorMinServicos && f.pctComissao === faixaAtingida.pctComissao ? "border-green-500/50 bg-green-500/5" : "border-border bg-muted/30"}`}>
                        <div className="col-span-1 text-xs text-muted-foreground font-mono">{idx + 1}</div>
                        <div className="col-span-4">
                          <Input
                            type="number"
                            value={f.valorMinServicos}
                            onChange={e => updateFaixa(idx, "valorMinServicos", e.target.value)}
                            className="h-8 text-sm"
                            disabled={!isAdmin}
                          />
                        </div>
                        <div className="col-span-2">
                          <div className="relative">
                            <Input
                              type="number"
                              value={f.pctComissao}
                              onChange={e => updateFaixa(idx, "pctComissao", e.target.value)}
                              className="h-8 text-sm pr-6"
                              min={0}
                              max={100}
                              disabled={!isAdmin}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={f.descricao}
                            onChange={e => updateFaixa(idx, "descricao", e.target.value)}
                            className="h-8 text-sm"
                            placeholder="Ex: Meta Bronze"
                            disabled={!isAdmin}
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {isAdmin && (
                            <button onClick={() => removeFaixa(idx)} className="text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isAdmin && dirty && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleSave} disabled={saveAll.isPending} className="gap-2">
                      <Save className="w-4 h-4" />
                      {saveAll.isPending ? "Salvando..." : "Salvar Faixas"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview de ganhos */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  Simulador de Ganhos
                </CardTitle>
                <CardDescription className="text-xs">
                  Informe o valor de serviços para simular o ganho do barbeiro.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Valor de serviços no período (R$)</Label>
                  <Input
                    type="number"
                    value={previewValor}
                    onChange={e => setPreviewValor(e.target.value)}
                    className="mt-1"
                    placeholder="Ex: 25000"
                  />
                </div>

                {faixas.length > 0 && (
                  <div className="space-y-3">
                    <div className={`rounded-lg p-3 ${faixaAtingida ? "bg-green-500/10 border border-green-500/30" : "bg-muted/50 border border-border"}`}>
                      <p className="text-xs text-muted-foreground">Faixa atingida</p>
                      {faixaAtingida ? (
                        <>
                          <p className="font-semibold text-green-400">{faixaAtingida.descricao || `Faixa ${faixaAtingida.pctComissao}%`}</p>
                          <p className="text-xs text-muted-foreground">A partir de {fmt(faixaAtingida.valorMinServicos)}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhuma faixa atingida</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">% Comissão</p>
                        <p className="text-xl font-bold text-primary">{fmtPct(pct)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Ganho total</p>
                        <p className="text-xl font-bold text-green-400">{fmt(ganho)}</p>
                      </div>
                    </div>

                    {/* Próxima faixa */}
                    {(() => {
                      const sorted = [...faixas].sort((a, b) => a.valorMinServicos - b.valorMinServicos);
                      const proxima = sorted.find(f => f.valorMinServicos > previewVal);
                      if (!proxima) return null;
                      const falta = proxima.valorMinServicos - previewVal;
                      return (
                        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                          <p className="text-xs text-yellow-400 font-medium">Próxima faixa: {fmtPct(proxima.pctComissao)}</p>
                          <p className="text-xs text-muted-foreground">Faltam {fmt(falta)} para atingir</p>
                          {proxima.descricao && <p className="text-xs text-muted-foreground">{proxima.descricao}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {faixas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Cadastre faixas ao lado para simular os ganhos.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tabela resumo */}
            {faixas.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tabela de Referência</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {[...faixas].sort((a, b) => a.valorMinServicos - b.valorMinServicos).map((f, idx) => (
                      <div key={idx} className={`flex items-center justify-between text-xs py-1 px-2 rounded ${faixaAtingida && f.valorMinServicos === faixaAtingida.valorMinServicos ? "bg-green-500/10 text-green-400" : "text-muted-foreground"}`}>
                        <span>{fmt(f.valorMinServicos)}</span>
                        <Badge variant="outline" className={`text-xs ${faixaAtingida && f.valorMinServicos === faixaAtingida.valorMinServicos ? "border-green-500/50 text-green-400" : ""}`}>
                          {fmtPct(f.pctComissao)}
                        </Badge>
                        <span>{fmt(f.valorMinServicos * f.pctComissao / 100)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// // ─── Meta Dinâmica ──────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  produto: "Venda de Produtos",
  servicos_multiplos: "Serviços Múltiplos por Comanda",
};
const TIPO_ICONS: Record<string, React.ReactNode> = {
  produto: <Package className="w-4 h-4" />,
  servicos_multiplos: <Users className="w-4 h-4" />,
};

interface MetaDinamica {
  id?: number;
  nome: string;
  tipo: "produto" | "servicos_multiplos";
  config: Record<string, any>;
  bonusTipo: "fixo" | "percentual";
  bonusValor: number;
  mesVigencia: string | null;
}

const META_VAZIA: MetaDinamica = {
  nome: "",
  tipo: "produto",
  config: {},
  bonusTipo: "fixo",
  bonusValor: 0,
  mesVigencia: null,
};

function MetaDinamicaTab() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const { user } = useAuth();
  // Admin ou gerente de unidade pode editar metas da sua própria unidade
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin" || userRole === "unit_manager";

  const [editUnitId, setEditUnitId] = useState<number | null>(null);
  const unitId = editUnitId ?? selectedUnit?.id ?? null;
  const unitObj = (units ?? []).find((u: any) => u.id === unitId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editMeta, setEditMeta] = useState<MetaDinamica>(META_VAZIA);
  const [editId, setEditId] = useState<number | null>(null);

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const q = trpc.dataVip.metaDinamicaList.useQuery(
    { unitId: unitId!, orgId: org?.id! },
    { enabled: !!unitId && !!org?.id }
  );
  const utils = trpc.useUtils();

  const saveMutation = trpc.dataVip.metaDinamicaSave.useMutation({
    onSuccess: () => {
      toast.success(editId ? "Meta atualizada" : "Meta criada");
      setModalOpen(false);
      utils.dataVip.metaDinamicaList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.dataVip.metaDinamicaDelete.useMutation({
    onSuccess: () => { toast.success("Meta removida"); utils.dataVip.metaDinamicaList.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function openNew() {
    setEditId(null);
    setEditMeta({ ...META_VAZIA });
    setModalOpen(true);
  }

  function openEdit(m: any) {
    setEditId(m.id);
    setEditMeta({
      nome: m.nome,
      tipo: m.tipo,
      config: m.config ?? {},
      bonusTipo: m.bonusTipo,
      bonusValor: Number(m.bonusValor),
      mesVigencia: m.mesVigencia ?? null,
    });
    setModalOpen(true);
  }

  function handleSave() {
    if (!unitId || !org?.id) return toast.error("Selecione uma unidade");
    if (!editMeta.nome.trim()) return toast.error("Informe o nome da meta");
    saveMutation.mutate({
      id: editId ?? undefined,
      unitId,
      orgId: org.id,
      ...editMeta,
    });
  }

  const metas = q.data ?? [];

  return (
    <div className="space-y-5">
      {/* Seletor de unidade */}
      {isAdmin && (units ?? []).length > 1 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Unidade:</Label>
          <Select value={String(unitId ?? "")} onValueChange={v => setEditUnitId(Number(v))}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione a unidade..." />
            </SelectTrigger>
            <SelectContent>
              {(units ?? []).map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!unitId ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Selecione uma unidade para gerenciar as metas dinâmicas.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold font-display tracking-tight">Metas Dinâmicas — {unitObj?.name ?? "Unidade"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crie metas com regras flexíveis. Ao bater a meta, o bônus aparece automaticamente na aba Comissões.
              </p>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={openNew} className="gap-1.5">
                <Plus className="w-4 h-4" /> Nova Meta
              </Button>
            )}
          </div>

          {/* Banner de carregamento */}
          {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
            <DataVipLoadingState rows={2} attempt={(q.failureCount ?? 0) + 1} />
          )}
          {q.isError && !isExternalDbTimeoutError(q.error) && (
            <DataVipErrorState onRetry={() => q.refetch()} />
          )}

          {q.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : metas.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma meta dinâmica cadastrada.</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em <strong>Nova Meta</strong> para criar a primeira.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {metas.map((m: any) => (
                <Card key={m.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          {TIPO_ICONS[m.tipo]}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{m.nome}</CardTitle>
                          <CardDescription className="text-xs">{TIPO_LABELS[m.tipo]}</CardDescription>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(m)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMutation.mutate({ id: m.id })} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {/* Config da regra */}
                    {m.tipo === "produto" && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                        {(m.config.criterio ?? "valor") === "quantidade"
                          ? <>Vender ≥ <strong>{m.config.qtdMinProdutos ?? 0} produto(s)</strong> no mês</>
                          : <>Vender ≥ <strong>{fmt(m.config.valorMinProdutos ?? 0)}</strong> em produtos</>
                        }
                      </div>
                    )}
                    {m.tipo === "servicos_multiplos" && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                        ≥ <strong>{m.config.minComandas ?? 1}</strong> comanda(s) com ≥ <strong>{m.config.minServicosComanda ?? 2}</strong> serviços cada
                      </div>
                    )}
                    {/* Bônus */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Bônus ao bater:</span>
                      <Badge variant="outline" className="text-green-400 border-green-500/40 text-xs">
                        {m.bonusTipo === "fixo" ? fmt(m.bonusValor) : `${Number(m.bonusValor).toFixed(1)}% sobre produtos`}
                      </Badge>
                    </div>
                    {/* Vigência */}
                    <div className="flex items-center gap-1.5 text-xs">
                      {m.mesVigencia ? (
                        <><Clock className="w-3 h-3 text-yellow-400" /><span className="text-yellow-400">Válida apenas em {m.mesVigencia}</span></>
                      ) : (
                        <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Recorrente (todos os meses)</span></>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal de criação/edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Meta" : "Nova Meta Dinâmica"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Nome */}
            <div>
              <Label className="text-sm">Nome da meta</Label>
              <Input
                value={editMeta.nome}
                onChange={e => setEditMeta(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Meta Produto Novembro"
                className="mt-1"
              />
            </div>

            {/* Tipo */}
            <div>
              <Label className="text-sm">Tipo de regra</Label>
              <Select value={editMeta.tipo} onValueChange={v => setEditMeta(prev => ({ ...prev, tipo: v as any, config: {} }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="produto">Venda de Produtos</SelectItem>
                  <SelectItem value="servicos_multiplos">Serviços Múltiplos por Comanda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Config por tipo */}
            {editMeta.tipo === "produto" && (
              <div className="space-y-3">
                {/* Seletor de critério */}
                <div>
                  <Label className="text-sm">Critério da meta</Label>
                  <Select
                    value={editMeta.config.criterio ?? "valor"}
                    onValueChange={v => setEditMeta(prev => ({
                      ...prev,
                      config: { criterio: v, valorMinProdutos: undefined, qtdMinProdutos: undefined }
                    }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor">Valor mínimo em produtos (R$)</SelectItem>
                      <SelectItem value="quantidade">Quantidade mínima de produtos vendidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Campo dinâmico conforme critério */}
                {(editMeta.config.criterio ?? "valor") === "valor" ? (
                  <div>
                    <Label className="text-sm">Valor mínimo (R$)</Label>
                    <Input
                      type="number"
                      value={editMeta.config.valorMinProdutos ?? ""}
                      onChange={e => setEditMeta(prev => ({ ...prev, config: { ...prev.config, valorMinProdutos: Number(e.target.value) } }))}
                      placeholder="Ex: 500"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">O colaborador precisa vender pelo menos esse valor em produtos para ganhar o bônus.</p>
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm">Quantidade mínima de produtos</Label>
                    <Input
                      type="number"
                      value={editMeta.config.qtdMinProdutos ?? ""}
                      onChange={e => setEditMeta(prev => ({ ...prev, config: { ...prev.config, qtdMinProdutos: Number(e.target.value) } }))}
                      placeholder="Ex: 10"
                      min={1}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">O colaborador precisa vender pelo menos essa quantidade de produtos para ganhar o bônus.</p>
                  </div>
                )}
              </div>
            )}
            {editMeta.tipo === "servicos_multiplos" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Mín. serviços por comanda</Label>
                  <Input
                    type="number"
                    value={editMeta.config.minServicosComanda ?? 2}
                    onChange={e => setEditMeta(prev => ({ ...prev, config: { ...prev.config, minServicosComanda: Number(e.target.value) } }))}
                    min={2}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Qtd. de serviços na mesma comanda.</p>
                </div>
                <div>
                  <Label className="text-sm">Mín. de comandas assim</Label>
                  <Input
                    type="number"
                    value={editMeta.config.minComandas ?? 1}
                    onChange={e => setEditMeta(prev => ({ ...prev, config: { ...prev.config, minComandas: Number(e.target.value) } }))}
                    min={1}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Qtd. mínima de comandas no mês.</p>
                </div>
              </div>
            )}

            {/* Bônus */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Tipo de bônus</Label>
                <Select value={editMeta.bonusTipo} onValueChange={v => setEditMeta(prev => ({ ...prev, bonusTipo: v as any }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">Valor fixo (R$)</SelectItem>
                    {editMeta.tipo === "produto" && <SelectItem value="percentual">Percentual sobre produtos (%)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">{editMeta.bonusTipo === "fixo" ? "Valor do bônus (R$)" : "Percentual (%)"}</Label>
                <Input
                  type="number"
                  value={editMeta.bonusValor}
                  onChange={e => setEditMeta(prev => ({ ...prev, bonusValor: Number(e.target.value) }))}
                  min={0}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Vigência */}
            <div>
              <Label className="text-sm">Vigência</Label>
              <Select
                value={editMeta.mesVigencia ?? "recorrente"}
                onValueChange={v => setEditMeta(prev => ({ ...prev, mesVigencia: v === "recorrente" ? null : v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente (todos os meses)</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    return <SelectItem key={val} value={val}>{d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                "Recorrente" aplica a meta em todos os meses. Escolha um mês específico para uma meta temporária.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────

export default function MetasPage() {
  const { selectedUnit } = useApp();

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight">
          <Target className="w-6 h-6" style={{ color: "oklch(0.76 0.145 72)" }} /> Metas
        </h1>
        <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
      </div>

      <Tabs defaultValue="dinamica">
        <TabsList className="glass-card border-0">
          <TabsTrigger value="dinamica" className="gap-1.5 data-[state=active]:text-amber-400">
            <Zap className="w-4 h-4" /> Meta Dinâmica
          </TabsTrigger>
          <TabsTrigger value="faixas" className="gap-1.5 data-[state=active]:text-amber-400">
            <TrendingUp className="w-4 h-4" /> Comissão Progressiva
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dinamica" className="mt-5">
          <MetaDinamicaTab />
        </TabsContent>
        <TabsContent value="faixas" className="mt-5">
          <FaixasComissaoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
