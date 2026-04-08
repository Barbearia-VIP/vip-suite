import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import {
  ClipboardList, CheckSquare, TrendingUp, DollarSign, Users,
  Plus, Calendar, Target, BarChart3, AlertCircle, Brain,
  CheckCircle, Clock, Circle
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";

const MOCK_TASKS = [
  { id: 1, title: "Revisar escala da semana", status: "pending", priority: "high", assignee: "João" },
  { id: 2, title: "Comprar produtos de limpeza", status: "done", priority: "medium", assignee: "Maria" },
  { id: 3, title: "Reunião com fornecedor", status: "in_progress", priority: "high", assignee: "Carlos" },
  { id: 4, title: "Atualizar cardápio de serviços", status: "pending", priority: "low", assignee: "Ana" },
];

const MOCK_INDICATORS = [
  { label: "NPS", value: "78", trend: "+5", color: "oklch(0.65 0.15 145)" },
  { label: "Ocupação", value: "87%", trend: "+3%", color: "oklch(0.65 0.15 200)" },
  { label: "Retenção", value: "64%", trend: "-2%", color: "oklch(0.65 0.15 30)" },
  { label: "Churn", value: "8%", trend: "-1%", color: "oklch(0.78 0.12 75)" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "Pendente", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-amber-500" },
  done: { label: "Concluído", icon: CheckCircle, color: "text-green-500" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-500",
  medium: "bg-amber-500/10 text-amber-500",
  low: "bg-green-500/10 text-green-500",
};

export default function GestaoTotalPage() {
  const { selectedUnit } = useApp();
  const [newTask, setNewTask] = useState("");
  const [tasks, setTasks] = useState(MOCK_TASKS);

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { id: Date.now(), title: newTask.trim(), status: "pending", priority: "medium", assignee: "Eu" }]);
    setNewTask("");
    toast.success("Tarefa adicionada!");
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Gestão Total"
        description={selectedUnit ? `ERP Operacional — ${selectedUnit.name}` : "ERP operacional da rede"}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {MOCK_INDICATORS.map(ind => (
          <div className="glass-card bg-white/5 border-white/10" key={ind.label}>
            <div className="p-6 pt-0 p-4">
              <p className="text-xs text-muted-foreground mb-1">{ind.label}</p>
              <p className="text-2xl font-bold text-foreground">{ind.value}</p>
              <p className="text-xs mt-1" style={{ color: ind.trend.startsWith("-") ? "oklch(0.65 0.15 30)" : "oklch(0.65 0.15 145)" }}>{ind.trend} vs mês anterior</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="tarefas">
        <TabsList className="h-8">
          <TabsTrigger value="tarefas" className="text-xs h-6 px-3"><CheckSquare className="w-3 h-3 mr-1" />Tarefas</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs h-6 px-3"><DollarSign className="w-3 h-3 mr-1" />Financeiro</TabsTrigger>
          <TabsTrigger value="processos" className="text-xs h-6 px-3"><ClipboardList className="w-3 h-3 mr-1" />Processos</TabsTrigger>
          <TabsTrigger value="ia" className="text-xs h-6 px-3"><Brain className="w-3 h-3 mr-1" />IA Conselheiro</TabsTrigger>
        </TabsList>

        <TabsContent value="tarefas" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Nova tarefa..." value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()} className="text-sm h-8" />
            <Button size="sm" className="h-8 gap-1 shrink-0" onClick={addTask}><Plus className="w-3.5 h-3.5" />Adicionar</Button>
          </div>
          <div className="space-y-2">
            {tasks.map(task => {
              const S = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = S.icon;
              return (
                <div className="glass-card bg-white/5 border-white/10" key={task.id}>
                  <div className="p-6 pt-0 p-3 flex items-center gap-3">
                    <button onClick={() => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: t.status === "done" ? "pending" : "done" } : t))}>
                      <StatusIcon className={`w-4 h-4 ${S.color}`} />
                    </button>
                    <span className={`flex-1 text-sm ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</span>
                    <Badge className={`text-xs shrink-0 ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{task.assignee}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Receita Bruta", value: "R$ 68.400", sub: "Mês atual", color: "oklch(0.65 0.15 145)" },
              { label: "Despesas", value: "R$ 24.200", sub: "Mês atual", color: "oklch(0.65 0.15 30)" },
              { label: "Lucro Líquido", value: "R$ 44.200", sub: "Margem: 64.6%", color: "oklch(0.65 0.15 200)" },
            ].map(item => (
              <div className="glass-card bg-white/5 border-white/10" key={item.label}>
                <div className="p-6 pt-0 p-5">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="glass-card bg-white/5 border-white/10 mt-4">
            <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm">DRE Simplificado — Março 2026</h3></div>
            <div className="p-6 pt-0">
              <div className="space-y-2">
                {[
                  { label: "Receita de Serviços", value: "R$ 62.000", type: "positive" },
                  { label: "Venda de Produtos", value: "R$ 6.400", type: "positive" },
                  { label: "(-) Custo de Produtos", value: "R$ 3.200", type: "negative" },
                  { label: "(-) Folha de Pagamento", value: "R$ 14.000", type: "negative" },
                  { label: "(-) Aluguel", value: "R$ 4.500", type: "negative" },
                  { label: "(-) Outros Custos", value: "R$ 2.500", type: "negative" },
                  { label: "= Lucro Líquido", value: "R$ 44.200", type: "result" },
                ].map(row => (
                  <div key={row.label} className={`flex justify-between text-xs py-1.5 border-b border-border/50 ${row.type === "result" ? "font-bold text-foreground border-0 pt-2" : "text-muted-foreground"}`}>
                    <span>{row.label}</span>
                    <span className={row.type === "positive" ? "text-green-500" : row.type === "negative" ? "text-red-400" : "text-foreground"}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="processos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: "Abertura da Unidade", steps: ["Ligar equipamentos", "Conferir estoque", "Verificar agenda", "Receber colaboradores"], done: 3 },
              { title: "Fechamento da Unidade", steps: ["Conferir caixa", "Limpar equipamentos", "Registrar ocorrências", "Fechar sistemas"], done: 0 },
              { title: "Atendimento ao Cliente", steps: ["Recepcionar", "Consultar histórico", "Executar serviço", "Registrar feedback"], done: 2 },
              { title: "Compras e Estoque", steps: ["Verificar mínimos", "Solicitar cotações", "Aprovar compra", "Receber e registrar"], done: 1 },
            ].map(proc => (
              <div className="glass-card bg-white/5 border-white/10" key={proc.title}>
                <div className="p-6 pb-2 pb-2"><h3 className="font-semibold text-foreground text-sm">{proc.title}</h3></div>
                <div className="p-6 pt-0 space-y-1.5">
                  {proc.steps.map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      {i < proc.done
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <span className={`text-xs ${i < proc.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{step}</span>
                    </div>
                  ))}
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(proc.done / proc.steps.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ia" className="mt-4">
          <div className="glass-card bg-white/5 border-white/10">
            <div className="p-6 pb-2 pb-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-primary" />IA Conselheiro</h3>
            </div>
            <div className="p-6 pt-0 space-y-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <p className="text-xs font-medium text-foreground mb-2">Análise do mês — Março 2026</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Com base nos dados desta unidade, o faturamento cresceu 21.6% em relação ao mês anterior, impulsionado principalmente pelo aumento de atendimentos (+17.4%). O ticket médio também subiu 3.5%, indicando upsell eficiente. Recomendo focar em retenção de clientes, pois a taxa de 64% ainda tem espaço para melhoria — considere implementar um programa de fidelidade.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Sugestões de ação:</p>
                {["Implementar programa de fidelidade para clientes recorrentes", "Revisar precificação dos combos — margem abaixo da média", "Considerar contratar mais 1 colaborador nos finais de semana"].map(s => (
                  <div key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
