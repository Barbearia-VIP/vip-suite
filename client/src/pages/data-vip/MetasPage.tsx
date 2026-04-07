/**
 * MetasPage.tsx — Metas mensais + Faixas de comissão progressiva
 */
import { useState, useMemo, useEffect } from "react";
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
import { Target, Plus, Trash2, TrendingUp, Save, Info } from "lucide-react";

function fmt(v: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(Number(v));
}
function fmtPct(v: number | string) {
  return `${Number(v).toFixed(1)}%`;
}
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";

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

// ─── Metas de Faturamento (existente) ────────────────────────────────────────

function MetasFaturamentoTab() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const [ano, setAno] = useState(new Date().getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ unitId: "", periodo: "", metaFaturamento: "", alertaAbaixoPercent: "80" });

  const q = trpc.dataVip.metas.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, ano },
    { enabled: !!org?.id }
  );
  const utils = trpc.useUtils();
  const saveMeta = trpc.dataVip.saveMeta.useMutation({
    onSuccess: () => { toast.success("Meta salva"); setModalOpen(false); utils.dataVip.metas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMeta = trpc.dataVip.deleteMeta.useMutation({
    onSuccess: () => { toast.success("Meta removida"); utils.dataVip.metas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const metas = q.data ?? [];
  const periodoOptions = useMemo(() => {
    const list = [];
    for (let m = 1; m <= 12; m++) {
      const val = `${ano}-${String(m).padStart(2, "0")}`;
      list.push({ val, label: `${MESES[m-1]} ${ano}` });
    }
    return list;
  }, [ano]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="text-sm bg-muted border border-border rounded px-2 py-1.5">
            {[ano-1, ano, ano+1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Nova Meta
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {q.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : metas.length === 0
            ? <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Nenhuma meta cadastrada para {ano}.</CardContent></Card>
            : metas.map((m: any) => {
                const pct = m.percentual;
                const color = pct >= 100 ? "bg-green-500" : pct >= m.alertaAbaixoPercent ? "bg-yellow-500" : "bg-red-500";
                return (
                  <Card key={m.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{m.unitName || "Rede"} — {MESES[parseInt(m.periodo.split("-")[1])-1]} {m.periodo.split("-")[0]}</p>
                          <p className="text-xs text-muted-foreground">Meta: {fmt(m.metaFaturamento)} · Realizado: {fmt(m.realizado)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${pct >= 100 ? "text-green-400" : pct >= m.alertaAbaixoPercent ? "text-yellow-400" : "text-red-400"}`}>{pct}%</span>
                          {isAdmin && <button onClick={() => deleteMeta.mutate({ id: m.id })} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
        }
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Unidade</Label>
              <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(units ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período</Label>
              <Select value={form.periodo} onValueChange={v => setForm(f => ({ ...f, periodo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{periodoOptions.map(p => <SelectItem key={p.val} value={p.val}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Meta de Faturamento (R$)</Label>
              <Input type="number" value={form.metaFaturamento} onChange={e => setForm(f => ({ ...f, metaFaturamento: e.target.value }))} placeholder="Ex: 50000" />
            </div>
            <div>
              <Label>Alerta abaixo de (%)</Label>
              <Input type="number" value={form.alertaAbaixoPercent} onChange={e => setForm(f => ({ ...f, alertaAbaixoPercent: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMeta.mutate({ orgId: org!.id, unitId: form.unitId ? Number(form.unitId) : undefined, periodo: form.periodo, metaFaturamento: Number(form.metaFaturamento), alertaAbaixoPercent: Number(form.alertaAbaixoPercent) })} disabled={saveMeta.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function MetasPage() {
  const { selectedUnit } = useApp();

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="w-6 h-6 text-red-400" /> Metas
        </h1>
        <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
      </div>

      <Tabs defaultValue="faixas">
        <TabsList>
          <TabsTrigger value="faixas" className="gap-1.5">
            <TrendingUp className="w-4 h-4" /> Comissão Progressiva
          </TabsTrigger>
          <TabsTrigger value="faturamento" className="gap-1.5">
            <Target className="w-4 h-4" /> Metas de Faturamento
          </TabsTrigger>
        </TabsList>
        <TabsContent value="faixas" className="mt-5">
          <FaixasComissaoTab />
        </TabsContent>
        <TabsContent value="faturamento" className="mt-5">
          <MetasFaturamentoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
