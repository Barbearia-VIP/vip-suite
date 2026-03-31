/**
 * PlanejamentoPage.tsx — Planejamento Estratégico (Missão, Visão, SWOT, Objetivos)
 * Schema: id, orgId, unitId, ano, missao, visao, valores, swotForcas, swotFraquezas, swotOportunidades, swotAmeacas, objetivos
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save, Plus, Trash2, Target } from "lucide-react";

type Objetivo = { titulo: string; prazo?: string; responsavel?: string; status?: string };
type Planejamento = {
  id?: number; orgId: number; unitId: number | null; ano: number;
  missao: string | null; visao: string | null; valores: string | null;
  swotForcas: unknown; swotFraquezas: unknown; swotOportunidades: unknown; swotAmeacas: unknown;
  objetivos: unknown;
};

function SwotQuadrant({ title, color, items, onChange }: {
  title: string; color: string;
  items: string[]; onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <h4 className="text-xs font-semibold mb-2">{title}</h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-xs flex-1">{item}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
        <div className="flex gap-1">
          <Input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }} placeholder="Adicionar..." className="text-xs h-7" />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }}><Plus className="w-3 h-3" /></Button>
        </div>
      </div>
    </div>
  );
}

export default function PlanejamentoPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [missao, setMissao] = useState("");
  const [visao, setVisao] = useState("");
  const [valores, setValores] = useState("");
  const [forcas, setForcas] = useState<string[]>([]);
  const [fraquezas, setFraquezas] = useState<string[]>([]);
  const [oportunidades, setOportunidades] = useState<string[]>([]);
  const [ameacas, setAmeacas] = useState<string[]>([]);
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [novoObjetivo, setNovoObjetivo] = useState("");
  const [saved, setSaved] = useState(false);

  const q = trpc.gestaoTotal.planejamento.get.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, ano },
    { enabled: !!org?.id }
  );
  const data = q.data as unknown as Planejamento | null;

  useEffect(() => {
    if (data) {
      setMissao(data.missao ?? "");
      setVisao(data.visao ?? "");
      setValores(data.valores ?? "");
      setForcas(Array.isArray(data.swotForcas) ? (data.swotForcas as string[]) : []);
      setFraquezas(Array.isArray(data.swotFraquezas) ? (data.swotFraquezas as string[]) : []);
      setOportunidades(Array.isArray(data.swotOportunidades) ? (data.swotOportunidades as string[]) : []);
      setAmeacas(Array.isArray(data.swotAmeacas) ? (data.swotAmeacas as string[]) : []);
      setObjetivos(Array.isArray(data.objetivos) ? (data.objetivos as Objetivo[]) : []);
      setSaved(true);
    } else {
      setMissao(""); setVisao(""); setValores("");
      setForcas([]); setFraquezas([]); setOportunidades([]); setAmeacas([]);
      setObjetivos([]); setSaved(false);
    }
  }, [data]);

  const saveM = trpc.gestaoTotal.planejamento.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.planejamento.get.invalidate(); toast.success("Planejamento salvo!"); setSaved(true); },
    onError: () => toast.error("Erro ao salvar"),
  });

  const handleSave = () => {
    if (!org?.id) return;
    saveM.mutate({
      id: data?.id, orgId: org.id, unitId: selectedUnit?.id, ano,
      missao: missao || undefined, visao: visao || undefined, valores: valores || undefined,
      swotForcas: forcas, swotFraquezas: fraquezas, swotOportunidades: oportunidades, swotAmeacas: ameacas,
      objetivos,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Planejamento Estratégico</h1>
          <p className="text-sm text-muted-foreground">{saved ? "Salvo" : "Não salvo"} • Ano {ano}</p>
        </div>
        <div className="flex gap-2">
          <Input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value))} className="w-24 text-sm" min={2020} max={2030} />
          <Button size="sm" onClick={handleSave} disabled={saveM.isPending} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> Salvar
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-6">
          {/* Missão, Visão, Valores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-primary">Missão</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Textarea value={missao} onChange={e => setMissao(e.target.value)} placeholder="Por que a empresa existe..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-primary">Visão</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Textarea value={visao} onChange={e => setVisao(e.target.value)} placeholder="Onde quer chegar em 5 anos..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-primary">Valores</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Textarea value={valores} onChange={e => setValores(e.target.value)} placeholder="Princípios que guiam as decisões..." className="text-sm min-h-[80px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none" />
              </CardContent>
            </Card>
          </div>

          {/* SWOT */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Análise SWOT</h2>
            <div className="grid grid-cols-2 gap-3">
              <SwotQuadrant title="Forças (Strengths)" color="border-green-500/30 bg-green-500/5" items={forcas} onChange={setForcas} />
              <SwotQuadrant title="Fraquezas (Weaknesses)" color="border-red-500/30 bg-red-500/5" items={fraquezas} onChange={setFraquezas} />
              <SwotQuadrant title="Oportunidades (Opportunities)" color="border-blue-500/30 bg-blue-500/5" items={oportunidades} onChange={setOportunidades} />
              <SwotQuadrant title="Ameaças (Threats)" color="border-yellow-500/30 bg-yellow-500/5" items={ameacas} onChange={setAmeacas} />
            </div>
          </div>

          {/* Objetivos */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Objetivos Estratégicos</h2>
            <Card className="bg-card border-border">
              <CardContent className="p-3 space-y-2">
                {objetivos.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm flex-1">{o.titulo}</span>
                    {o.prazo && <span className="text-xs text-muted-foreground">{o.prazo}</span>}
                    <button onClick={() => setObjetivos(objetivos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Input value={novoObjetivo} onChange={e => setNovoObjetivo(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novoObjetivo.trim()) { setObjetivos([...objetivos, { titulo: novoObjetivo.trim() }]); setNovoObjetivo(""); } }} placeholder="Novo objetivo estratégico..." className="text-sm" />
                  <Button size="sm" variant="outline" onClick={() => { if (novoObjetivo.trim()) { setObjetivos([...objetivos, { titulo: novoObjetivo.trim() }]); setNovoObjetivo(""); } }}><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
