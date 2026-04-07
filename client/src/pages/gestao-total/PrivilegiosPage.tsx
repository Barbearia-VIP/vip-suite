/**
 * PrivilegiosPage.tsx — Controle de privilégios e permissões do Gestão Total
 */
import { Shield, Users, Lock, Eye, Edit2, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PERFIS = [
  {
    nome: "Master",
    descricao: "Acesso total ao sistema, sem restrições.",
    cor: "bg-red-500/20 text-red-400 border-red-500/30",
    permissoes: ["Ver", "Criar", "Editar", "Excluir", "Configurar", "Exportar"],
  },
  {
    nome: "Administrador",
    descricao: "Gerencia unidades, usuários e configurações gerais.",
    cor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    permissoes: ["Ver", "Criar", "Editar", "Excluir", "Exportar"],
  },
  {
    nome: "Gerente de Unidade",
    descricao: "Acesso completo à sua unidade, sem acesso a outras.",
    cor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    permissoes: ["Ver", "Criar", "Editar"],
  },
  {
    nome: "Líder de Equipe",
    descricao: "Gerencia tarefas e colaboradores da equipe.",
    cor: "bg-green-500/20 text-green-400 border-green-500/30",
    permissoes: ["Ver", "Criar"],
  },
  {
    nome: "Colaborador",
    descricao: "Visualiza dados e registra atividades próprias.",
    cor: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    permissoes: ["Ver"],
  },
];

const PERMISSAO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Ver: Eye,
  Criar: Plus,
  Editar: Edit2,
  Excluir: Trash2,
  Configurar: Lock,
  Exportar: Shield,
};

export default function PrivilegiosPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Privilégios</h1>
          <p className="text-sm text-muted-foreground">Controle de acesso e permissões por perfil de usuário</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Users className="w-3 h-3" />
          5 perfis configurados
        </Badge>
      </div>

      <div className="space-y-3">
        {PERFIS.map((perfil) => (
          <div className="glass-card bg-white/5 border-white/10" key={perfil.nome}>
            <div className="p-6 pb-2 pb-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${perfil.cor}`}>
                  {perfil.nome}
                </span>
                <span className="text-xs text-muted-foreground font-normal">{perfil.descricao}</span>
              </h3>
            </div>
            <div className="p-6 pt-0">
              <div className="flex flex-wrap gap-2">
                {perfil.permissoes.map((p) => {
                  const Icon = PERMISSAO_ICONS[p] ?? Shield;
                  return (
                    <div
                      key={p}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-1 rounded"
                    >
                      <Icon className="w-3 h-3" />
                      {p}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card bg-white/5 border-white/10 border-dashed">
        <div className="p-6 pt-0 p-6 text-center">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Configuração granular em desenvolvimento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Em breve será possível customizar permissões por módulo, página e ação individualmente para cada perfil.
          </p>
        </div>
      </div>
    </div>
  );
}
