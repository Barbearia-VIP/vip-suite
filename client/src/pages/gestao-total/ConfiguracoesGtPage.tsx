/**
 * ConfiguracoesGtPage.tsx — Configurações do módulo Gestão Total
 */
import { Settings, Bell, Palette, Globe, Lock, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const CONFIG_SECTIONS = [
  {
    icon: Bell,
    title: "Notificações",
    description: "Alertas de tarefas vencidas, problemas críticos e reuniões próximas.",
    action: "Configurar",
  },
  {
    icon: Palette,
    title: "Aparência",
    description: "Personalizar cores, logo e identidade visual do módulo.",
    action: "Personalizar",
  },
  {
    icon: Globe,
    title: "Idioma e Região",
    description: "Fuso horário, formato de data e moeda padrão.",
    action: "Ajustar",
  },
  {
    icon: Lock,
    title: "Segurança",
    description: "Políticas de acesso, autenticação em dois fatores e sessões ativas.",
    action: "Gerenciar",
  },
  {
    icon: Database,
    title: "Exportação de Dados",
    description: "Exportar relatórios, tarefas e indicadores em Excel ou PDF.",
    action: "Exportar",
  },
];

export default function ConfiguracoesGtPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Personalize o comportamento do módulo Gestão Total</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CONFIG_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{section.description}</p>
                <button
                  onClick={() => toast.info("Funcionalidade em desenvolvimento")}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  {section.action} →
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-6 text-center">
          <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Mais configurações em breve</p>
          <p className="text-xs text-muted-foreground mt-1">
            Esta seção será expandida com integrações, webhooks e automações avançadas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
