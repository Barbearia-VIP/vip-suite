/**
 * GuiaSistemaPage.tsx — Guia de uso do módulo Gestão Total
 */
import { BookOpen, ChevronRight, LayoutDashboard, ClipboardList, Map, Activity, Users, BarChart3, FileText, AlertTriangle, TrendingUp, ShieldAlert, Megaphone, DollarSign, Calendar, ShoppingCart, Brain, Settings, Shield } from "lucide-react";
import { useState } from "react";

const GUIA_SECTIONS = [
  {
    icon: LayoutDashboard,
    titulo: "Dashboard",
    resumo: "Visão consolidada dos KPIs operacionais da unidade.",
    conteudo: "O Dashboard apresenta os principais indicadores em tempo real: tarefas abertas, problemas críticos, reuniões agendadas, resultado financeiro do mês e oportunidades identificadas. Use-o como ponto de partida diário para verificar a saúde da operação.",
  },
  {
    icon: Map,
    titulo: "Planejamento",
    resumo: "Missão, visão, valores e análise SWOT.",
    conteudo: "Registre a missão, visão e valores da unidade. A análise SWOT (Forças, Fraquezas, Oportunidades, Ameaças) ajuda a estruturar o planejamento estratégico e orientar as decisões de médio e longo prazo.",
  },
  {
    icon: Activity,
    titulo: "Processos",
    resumo: "Mapeamento de processos operacionais com etapas e responsáveis.",
    conteudo: "Documente os processos da barbearia (atendimento, abertura, fechamento, etc.) com etapas sequenciais, responsáveis e checklists. Processos bem documentados reduzem erros e facilitam o treinamento de novos colaboradores.",
  },
  {
    icon: BookOpen,
    titulo: "Instruções de Trabalho",
    resumo: "Procedimentos detalhados por categoria.",
    conteudo: "Registre instruções operacionais detalhadas (como realizar um corte específico, como usar o sistema de agendamento, etc.). Organize por categoria para facilitar a consulta rápida pela equipe.",
  },
  {
    icon: ClipboardList,
    titulo: "Tarefas",
    resumo: "Gestão de tarefas com kanban e prioridades.",
    conteudo: "Crie e acompanhe tarefas com status (Pendente → Em andamento → Em revisão → Concluída), prioridade (Baixa/Média/Alta/Crítica) e responsável. Use o kanban para visualizar o fluxo de trabalho da equipe.",
  },
  {
    icon: Users,
    titulo: "Pessoas (Cargos e Colaboradores)",
    resumo: "Gestão da equipe, cargos e informações de RH.",
    conteudo: "Cadastre os cargos da unidade (Barbeiro, Recepcionista, Gerente, etc.) e os colaboradores com suas informações de contato, salário e status. Mantenha o histórico atualizado para facilitar a gestão de RH.",
  },
  {
    icon: BarChart3,
    titulo: "Indicadores",
    resumo: "KPIs estratégicos com metas e histórico.",
    conteudo: "Defina indicadores-chave de desempenho (NPS, taxa de retenção, ocupação, ticket médio, etc.) com metas mensais. O sistema registra o histórico para análise de tendências e comparação entre períodos.",
  },
  {
    icon: FileText,
    titulo: "Documentos",
    resumo: "Repositório centralizado de documentos da unidade.",
    conteudo: "Armazene contratos, manuais, certificados e outros documentos importantes. Organize por categoria e mantenha versões atualizadas para acesso rápido pela equipe.",
  },
  {
    icon: AlertTriangle,
    titulo: "Problemas",
    resumo: "Registro e acompanhamento de problemas operacionais.",
    conteudo: "Registre problemas identificados na operação com severidade (Baixa/Média/Alta/Crítica), responsável pela solução e prazo. Acompanhe o status até a resolução completa.",
  },
  {
    icon: TrendingUp,
    titulo: "Oportunidades",
    resumo: "Identificação e avaliação de oportunidades de melhoria.",
    conteudo: "Registre oportunidades de melhoria ou crescimento com valor estimado, prioridade e responsável. Acompanhe o progresso desde a identificação até a implementação.",
  },
  {
    icon: ShieldAlert,
    titulo: "Riscos",
    resumo: "Mapa de riscos com probabilidade e impacto.",
    conteudo: "Identifique riscos operacionais, financeiros e estratégicos. Avalie probabilidade e impacto para priorizar ações de mitigação. Mantenha o mapa de riscos atualizado para antecipar problemas.",
  },
  {
    icon: Megaphone,
    titulo: "Marketing",
    resumo: "Campanhas e métricas de marketing.",
    conteudo: "Registre campanhas de marketing (redes sociais, panfletos, promoções) com canal, budget, período e métricas de resultado. Analise o retorno de cada ação para otimizar os investimentos.",
  },
  {
    icon: DollarSign,
    titulo: "Financeiro",
    resumo: "DRE simplificado com receitas e despesas.",
    conteudo: "Lance receitas e despesas operacionais com categoria, vencimento e status de pagamento. O DRE consolida o resultado financeiro do período. Lançamentos marcados com 'Data VIP' são gerados automaticamente pela sincronização de faturamento.",
  },
  {
    icon: Calendar,
    titulo: "Reuniões",
    resumo: "Agendamento e registro de atas de reuniões.",
    conteudo: "Agende reuniões com pauta, participantes e local. Após a realização, registre a ata com as decisões tomadas e os responsáveis. Mantenha o histórico para referência futura.",
  },
  {
    icon: ShoppingCart,
    titulo: "Compras",
    resumo: "Pedidos de compra com aprovação e fornecedores.",
    conteudo: "Gerencie pedidos de compra com itens, fornecedor, valor total e fluxo de aprovação. Cadastre fornecedores com dados de contato e histórico de compras.",
  },
  {
    icon: Brain,
    titulo: "IA Conselheiro",
    resumo: "Assistente de IA com contexto da unidade.",
    conteudo: "O IA Conselheiro tem acesso ao contexto da sua unidade (tarefas, indicadores, problemas, financeiro) e pode responder perguntas, sugerir ações e ajudar na tomada de decisões. Use-o para análises rápidas e insights estratégicos.",
  },
];

export default function GuiaSistemaPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Guia do Sistema</h1>
        <p className="text-sm text-muted-foreground">Como usar cada seção do módulo Gestão Total</p>
      </div>

      <div className="glass-card bg-primary/5 border-primary/20">
        <div className="p-6 pt-0 p-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Bem-vindo ao Gestão Total</p>
            <p className="text-xs text-muted-foreground mt-1">
              O Gestão Total é o módulo ERP do VIP Suite, projetado para centralizar a gestão operacional da barbearia.
              Clique em qualquer seção abaixo para entender como utilizá-la.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {GUIA_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isOpen = expanded === section.titulo;
          return (
            <div key={section.titulo} className={`glass-card cursor-pointer transition-all ${isOpen ? "border-primary/30" : "hover:border-muted-foreground/30"}`} onClick={() => setExpanded(isOpen ? null : section.titulo)}>
              <div className="p-6 pt-0 p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? "bg-primary/15" : "bg-muted/50"}`}>
                    <Icon className={`w-4 h-4 ${isOpen ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{section.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{section.resumo}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-muted-foreground leading-relaxed">{section.conteudo}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
