import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffect } from "react";
import { useSysUser } from "./contexts/SysUserContext";

// Pages
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// Dashboard
import DashboardPage from "./pages/dashboard/DashboardPage";
import UnidadesPage from "./pages/dashboard/UnidadesPage";
import UsuariosPage from "./pages/gestao-total/UsuariosSistemaPage";
import PermissoesPage from "./pages/gestao-total/PrivilegiosPage";

// Data VIP
import DataVipPage from "./pages/data-vip/DataVipPage";
import DataVipDashboard from "./pages/data-vip/DataVipDashboard";
import FaturamentoPage from "./pages/data-vip/FaturamentoPage";
import ColaboradoresPage from "./pages/data-vip/ColaboradoresPage";
import ClientesPage from "./pages/data-vip/ClientesPage";
import MetasPage from "./pages/data-vip/MetasPage";
import RankingPage from "./pages/data-vip/RankingPage";
import SyncPage from "./pages/data-vip/SyncPage";
import MensalPage from "./pages/data-vip/MensalPage";
import RaioXPage from "./pages/data-vip/RaioXPage";
import ComissoesPage from "./pages/data-vip/ComissoesPage";
import SincronizacaoPage from "./pages/data-vip/SincronizacaoPage";
import ServicosPage from "./pages/data-vip/ServicosPage";
import ProdutosPage from "./pages/data-vip/ProdutosPage";
import CalendarioPage from "./pages/data-vip/CalendarioPage";
import RelatoriosPage from "./pages/data-vip/RelatoriosPage";
import AdministracaoPage from "./pages/data-vip/AdministracaoPage";

// Gestão Total
import GestaoTotalPage from "./pages/gestao-total/GestaoTotalPage";
import TarefasPage from "./pages/gestao-total/TarefasPage";
import ProcessosPage from "./pages/gestao-total/ProcessosPage";
import IndicadoresPage from "./pages/gestao-total/IndicadoresPage";
import FinanceiroPage from "./pages/gestao-total/FinanceiroPage";
import ComprasPage from "./pages/gestao-total/ComprasPage";
import ReunioesPage from "./pages/gestao-total/ReunioesPage";
import IAConselheiroPage from "./pages/gestao-total/IAConselheiroPage";
import GestaoTotalDashboard from "./pages/gestao-total/GestaoTotalDashboard";
import CargosPage from "./pages/gestao-total/CargosPage";
import ColaboradoresGtPage from "./pages/gestao-total/ColaboradoresGtPage";
import InstrucoesPage from "./pages/gestao-total/InstrucoesPage";
import ProblemasPage from "./pages/gestao-total/ProblemasPage";
import OportunidadesPage from "./pages/gestao-total/OportunidadesPage";
import RiscosPage from "./pages/gestao-total/RiscosPage";
import DocumentosPage from "./pages/gestao-total/DocumentosPage";
import MarketingPage from "./pages/gestao-total/MarketingPage";
import PlanejamentoPage from "./pages/gestao-total/PlanejamentoPage";
import ConfiguracoesGtPage from "./pages/gestao-total/ConfiguracoesGtPage";
import ConfiguracaoFinanceiraPage from "./pages/gestao-total/ConfiguracaoFinanceiraPage";
import PrivilegiosPage from "./pages/gestao-total/PrivilegiosPage";
import GuiaSistemaPage from "./pages/gestao-total/GuiaSistemaPage";
import UsuariosSistemaPage from "./pages/gestao-total/UsuariosSistemaPage";
import SysLogin from "./pages/SysLogin";

// VIP Cam
import VipCamPage from "./pages/vip-cam/VipCamPage";
import CamClientesPage from "./pages/vip-cam/CamClientesPage";
import CamHistoricoPage from "./pages/vip-cam/CamHistoricoPage";
import CamRelatoriosPage from "./pages/vip-cam/CamRelatoriosPage";
import CamConfigPage from "./pages/vip-cam/CamConfigPage";
import VipCamLivePage from "./pages/vip-cam/VipCamLivePage";

// Reputação
import ReputacaoPage from "./pages/reputacao/ReputacaoPage";
import AvaliacoesPage from "./pages/reputacao/AvaliacoesPage";
import RespostasPage from "./pages/reputacao/RespostasPage";
import AnaliseReputacaoPage from "./pages/reputacao/AnaliseReputacaoPage";
import IntegracoesPage from "./pages/reputacao/IntegracoesPage";
import ConfigIAPage from "./pages/reputacao/ConfigIAPage";
import HistoricoIAPage from "./pages/reputacao/HistoricoIAPage";

// Auto Instagram
import AutoInstagramPage from "./pages/auto-instagram/AutoInstagramPage";
import ComentariosPage from "./pages/auto-instagram/ComentariosPage";
import SeguidoresPage from "./pages/auto-instagram/SeguidoresPage";
import EngajamentoPage from "./pages/auto-instagram/EngajamentoPage";
import PromptsPage from "./pages/auto-instagram/PromptsPage";
import LogsPage from "./pages/auto-instagram/LogsPage";
import AprovacaoPage from "./pages/auto-instagram/AprovacaoPage";
import StoriesPage from "./pages/auto-instagram/StoriesPage";
import DiagnosticoPage from "./pages/auto-instagram/DiagnosticoPage";
import ComentariosSemRespostaPage from "./pages/auto-instagram/ComentariosSemRespostaPage";

// We Send
import WeSendPage from "./pages/we-send/WeSendPage";
import CampanhasPage from "./pages/we-send/CampanhasPage";
import RelatoriosWeSendPage from "./pages/we-send/RelatoriosWeSendPage";
import ConfiguracaoWeSendPage from "./pages/we-send/ConfiguracaoWeSendPage";

// Configurações
import ConfiguracoesPage from "./pages/ConfiguracoesPage";

const PROTECTED_PATHS = [
  "/dashboard",
  "/data-vip",
  "/gestao-total",
  "/vip-cam",
  "/reputacao",
  "/auto-instagram",
  "/we-send",
  "/configuracoes",
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const { sysUser, isLoading: sysLoading } = useSysUser();
  const [location] = useLocation();

  // Considera autenticado se tiver sessão Manus OU sessão de usuário de unidade
  const isAnyAuthenticated = isAuthenticated || !!sysUser;
  const isStillLoading = loading || sysLoading;

  useEffect(() => {
    if (!isStillLoading && !isAnyAuthenticated) {
      const isProtected = PROTECTED_PATHS.some((p) => location.startsWith(p));
      if (isProtected) {
        // Redireciona para a página de login de unidade (e-mail/senha)
        // que também oferece o link para login Manus (administradores)
        window.location.href = "/login-unidade";
      }
    }
  }, [isAnyAuthenticated, isStillLoading, location]);

  if (isStillLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Carregando VIP Suite...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={SysLogin} />

      {/* Dashboard */}
      <Route path="/dashboard">
        <ProtectedLayout><DashboardPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/unidades">
        <ProtectedLayout><UnidadesPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/usuarios">
        <ProtectedLayout><UsuariosPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/permissoes">
        <ProtectedLayout><PermissoesPage /></ProtectedLayout>
      </Route>

      {/* Data VIP */}
      <Route path="/data-vip">
        <ProtectedLayout><DataVipDashboard /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/faturamento">
        <ProtectedLayout><FaturamentoPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/colaboradores">
        <ProtectedLayout><ColaboradoresPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/clientes">
        <ProtectedLayout><ClientesPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/metas">
        <ProtectedLayout><MetasPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/ranking">
        <ProtectedLayout><RankingPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/sync">
        <ProtectedLayout><SyncPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/dashboard">
        <ProtectedLayout><DataVipDashboard /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/mensal">
        <ProtectedLayout><MensalPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/raio-x">
        <ProtectedLayout><RaioXPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/comissoes">
        <ProtectedLayout><ComissoesPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/sincronizacao">
        <ProtectedLayout><SincronizacaoPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/servicos">
        <ProtectedLayout><ServicosPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/produtos">
        <ProtectedLayout><ProdutosPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/calendario">
        <ProtectedLayout><CalendarioPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/relatorios">
        <ProtectedLayout><RelatoriosPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/administracao">
        <ProtectedLayout><AdministracaoPage /></ProtectedLayout>
      </Route>

      {/* Gestão Total */}
      <Route path="/gestao-total">
        <ProtectedLayout><GestaoTotalDashboard /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/tarefas">
        <ProtectedLayout><TarefasPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/processos">
        <ProtectedLayout><ProcessosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/indicadores">
        <ProtectedLayout><IndicadoresPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/financeiro">
        <ProtectedLayout><FinanceiroPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/configuracao-financeira">
        <ProtectedLayout><ConfiguracaoFinanceiraPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/compras">
        <ProtectedLayout><ComprasPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/reunioes">
        <ProtectedLayout><ReunioesPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/ia">
        <ProtectedLayout><IAConselheiroPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/cargos">
        <ProtectedLayout><CargosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/colaboradores">
        <ProtectedLayout><ColaboradoresGtPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/instrucoes">
        <ProtectedLayout><InstrucoesPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/problemas">
        <ProtectedLayout><ProblemasPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/oportunidades">
        <ProtectedLayout><OportunidadesPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/riscos">
        <ProtectedLayout><RiscosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/documentos">
        <ProtectedLayout><DocumentosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/marketing">
        <ProtectedLayout><MarketingPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/planejamento">
        <ProtectedLayout><PlanejamentoPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/configuracoes">
        <ProtectedLayout><ConfiguracoesGtPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/privilegios">
        <ProtectedLayout><PrivilegiosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/usuarios-sistema">
        <ProtectedLayout><UsuariosSistemaPage /></ProtectedLayout>
      </Route>
      {/* Aliases do Dashboard apontando para as mesmas páginas */}
      <Route path="/gestao-total/guia">
        <ProtectedLayout><GuiaSistemaPage /></ProtectedLayout>
      </Route>

      {/* VIP Cam */}
      <Route path="/vip-cam">
        <ProtectedLayout><VipCamPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/clientes">
        <ProtectedLayout><CamClientesPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/historico">
        <ProtectedLayout><CamHistoricoPage /></ProtectedLayout>
      </Route>
       <Route path="/vip-cam/relatorios">
        <ProtectedLayout><CamRelatoriosPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/ao-vivo">
        <ProtectedLayout><VipCamLivePage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/configuracoes">
        <ProtectedLayout><CamConfigPage /></ProtectedLayout>
      </Route>
      {/* Reputação */}
      <Route path="/reputacao">
        <ProtectedLayout><ReputacaoPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/avaliacoes">
        <ProtectedLayout><AvaliacoesPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/respostas">
        <ProtectedLayout><RespostasPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/analise">
        <ProtectedLayout><AnaliseReputacaoPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/integracoes">
        <ProtectedLayout><IntegracoesPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/historico-ia">
        <ProtectedLayout><HistoricoIAPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/config-ia">
        <ProtectedLayout><ConfigIAPage /></ProtectedLayout>
      </Route>
      {/* Auto Instagram */}
      <Route path="/auto-instagram">
        <ProtectedLayout><AutoInstagramPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/comentarios">
        <ProtectedLayout><ComentariosPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/seguidores">
        <ProtectedLayout><SeguidoresPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/prompts">
        <ProtectedLayout><PromptsPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/logs">
        <ProtectedLayout><LogsPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/aprovacao">
        <ProtectedLayout><AprovacaoPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/stories">
        <ProtectedLayout><StoriesPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/diagnostico">
        <ProtectedLayout><DiagnosticoPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/engajamento">
        <ProtectedLayout><EngajamentoPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/sem-resposta">
        <ProtectedLayout><ComentariosSemRespostaPage /></ProtectedLayout>
      </Route>

      {/* We Send */}
      <Route path="/we-send">
        <ProtectedLayout><WeSendPage /></ProtectedLayout>
      </Route>
      <Route path="/we-send/campanhas">
        <ProtectedLayout><CampanhasPage /></ProtectedLayout>
      </Route>
      <Route path="/we-send/relatorios">
        <ProtectedLayout><RelatoriosWeSendPage /></ProtectedLayout>
      </Route>
      <Route path="/we-send/configuracoes">
        <ProtectedLayout><ConfiguracaoWeSendPage /></ProtectedLayout>
      </Route>

      {/* Configurações */}
      <Route path="/configuracoes">
        <ProtectedLayout><ConfiguracoesPage /></ProtectedLayout>
      </Route>

      <Route path="/login-unidade">
        <SysLogin />
      </Route>
      <Route path="/home-legacy" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <AppProvider>
          <TooltipProvider>
            <Toaster />
            <AuthGuard>
              <Router />
            </AuthGuard>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
