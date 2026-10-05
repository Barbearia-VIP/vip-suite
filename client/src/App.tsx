import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { lazy, Suspense, useEffect } from "react";
import { useSysUser } from "./contexts/SysUserContext";

// Pages
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// Dashboard
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const UnidadesPage = lazy(() => import("./pages/dashboard/UnidadesPage"));
const UsuariosPage = lazy(() => import("./pages/gestao-total/UsuariosSistemaPage"));
const PermissoesPage = lazy(() => import("./pages/gestao-total/PrivilegiosPage"));

// Data VIP
const DataVipPage = lazy(() => import("./pages/data-vip/DataVipPage"));
const DataVipDashboard = lazy(() => import("./pages/data-vip/DataVipDashboard"));
const FaturamentoPage = lazy(() => import("./pages/data-vip/FaturamentoPage"));
const ColaboradoresPage = lazy(() => import("./pages/data-vip/ColaboradoresPage"));
const ClientesPage = lazy(() => import("./pages/data-vip/ClientesPage"));
const MetasPage = lazy(() => import("./pages/data-vip/MetasPage"));
const RankingPage = lazy(() => import("./pages/data-vip/RankingPage"));
const SyncPage = lazy(() => import("./pages/data-vip/SyncPage"));
const MensalPage = lazy(() => import("./pages/data-vip/MensalPage"));
const RaioXPage = lazy(() => import("./pages/data-vip/RaioXPage"));
const ComissoesPage = lazy(() => import("./pages/data-vip/ComissoesPage"));
const SincronizacaoPage = lazy(() => import("./pages/data-vip/SincronizacaoPage"));
const ServicosPage = lazy(() => import("./pages/data-vip/ServicosPage"));
const ProdutosPage = lazy(() => import("./pages/data-vip/ProdutosPage"));
const CalendarioPage = lazy(() => import("./pages/data-vip/CalendarioPage"));
const RelatoriosPage = lazy(() => import("./pages/data-vip/RelatoriosPage"));
const AdministracaoPage = lazy(() => import("./pages/data-vip/AdministracaoPage"));

// Gestão Total
const GestaoTotalPage = lazy(() => import("./pages/gestao-total/GestaoTotalPage"));
const TarefasPage = lazy(() => import("./pages/gestao-total/TarefasPage"));
const ProcessosPage = lazy(() => import("./pages/gestao-total/ProcessosPage"));
const IndicadoresPage = lazy(() => import("./pages/gestao-total/IndicadoresPage"));
const FinanceiroPage = lazy(() => import("./pages/gestao-total/FinanceiroPage"));
const ComprasPage = lazy(() => import("./pages/gestao-total/ComprasPage"));
const ReunioesPage = lazy(() => import("./pages/gestao-total/ReunioesPage"));
const IAConselheiroPage = lazy(() => import("./pages/gestao-total/IAConselheiroPage"));
const GestaoTotalDashboard = lazy(() => import("./pages/gestao-total/GestaoTotalDashboard"));
const CargosPage = lazy(() => import("./pages/gestao-total/CargosPage"));
const ColaboradoresGtPage = lazy(() => import("./pages/gestao-total/ColaboradoresGtPage"));
const InstrucoesPage = lazy(() => import("./pages/gestao-total/InstrucoesPage"));
const ProblemasPage = lazy(() => import("./pages/gestao-total/ProblemasPage"));
const OportunidadesPage = lazy(() => import("./pages/gestao-total/OportunidadesPage"));
const RiscosPage = lazy(() => import("./pages/gestao-total/RiscosPage"));
const DocumentosPage = lazy(() => import("./pages/gestao-total/DocumentosPage"));
const MarketingPage = lazy(() => import("./pages/gestao-total/MarketingPage"));
const PlanejamentoPage = lazy(() => import("./pages/gestao-total/PlanejamentoPage"));
const ConfiguracoesGtPage = lazy(() => import("./pages/gestao-total/ConfiguracoesGtPage"));
const ConfiguracaoFinanceiraPage = lazy(() => import("./pages/gestao-total/ConfiguracaoFinanceiraPage"));
const PrivilegiosPage = lazy(() => import("./pages/gestao-total/PrivilegiosPage"));
const GuiaSistemaPage = lazy(() => import("./pages/gestao-total/GuiaSistemaPage"));
const UsuariosSistemaPage = lazy(() => import("./pages/gestao-total/UsuariosSistemaPage"));
import SysLogin from "./pages/SysLogin";

// VIP Cam
const VipCamPage = lazy(() => import("./pages/vip-cam/VipCamPage"));
const CamClientesPage = lazy(() => import("./pages/vip-cam/CamClientesPage"));
const CamHistoricoPage = lazy(() => import("./pages/vip-cam/CamHistoricoPage"));
const CamRelatoriosPage = lazy(() => import("./pages/vip-cam/CamRelatoriosPage"));
const CamConfigPage = lazy(() => import("./pages/vip-cam/CamConfigPage"));
const VipCamLivePage = lazy(() => import("./pages/vip-cam/VipCamLivePage"));

// Reputação
const ReputacaoPage = lazy(() => import("./pages/reputacao/ReputacaoPage"));
const AvaliacoesPage = lazy(() => import("./pages/reputacao/AvaliacoesPage"));
const RespostasPage = lazy(() => import("./pages/reputacao/RespostasPage"));
const AnaliseReputacaoPage = lazy(() => import("./pages/reputacao/AnaliseReputacaoPage"));
const IntegracoesPage = lazy(() => import("./pages/reputacao/IntegracoesPage"));
const ConfigIAPage = lazy(() => import("./pages/reputacao/ConfigIAPage"));
const HistoricoIAPage = lazy(() => import("./pages/reputacao/HistoricoIAPage"));

// Auto Instagram
const AutoInstagramPage = lazy(() => import("./pages/auto-instagram/AutoInstagramPage"));
const ComentariosPage = lazy(() => import("./pages/auto-instagram/ComentariosPage"));
const SeguidoresPage = lazy(() => import("./pages/auto-instagram/SeguidoresPage"));
const EngajamentoPage = lazy(() => import("./pages/auto-instagram/EngajamentoPage"));
const PromptsPage = lazy(() => import("./pages/auto-instagram/PromptsPage"));
const LogsPage = lazy(() => import("./pages/auto-instagram/LogsPage"));
const AprovacaoPage = lazy(() => import("./pages/auto-instagram/AprovacaoPage"));
const StoriesPage = lazy(() => import("./pages/auto-instagram/StoriesPage"));
const DiagnosticoPage = lazy(() => import("./pages/auto-instagram/DiagnosticoPage"));
const ComentariosSemRespostaPage = lazy(() => import("./pages/auto-instagram/ComentariosSemRespostaPage"));

// We Send
const WeSendPage = lazy(() => import("./pages/we-send/WeSendPage"));
const CampanhasPage = lazy(() => import("./pages/we-send/CampanhasPage"));
const RelatoriosWeSendPage = lazy(() => import("./pages/we-send/RelatoriosWeSendPage"));
const ConfiguracaoWeSendPage = lazy(() => import("./pages/we-send/ConfiguracaoWeSendPage"));

// Configurações
const ConfiguracoesPage = lazy(() => import("./pages/ConfiguracoesPage"));

// Status
const StatusPage = lazy(() => import("./pages/Status"));

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

      {/* Status */}
      <Route path="/status">
        <ProtectedLayout><StatusPage /></ProtectedLayout>
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
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">A carregar módulo...</div>}><Router /></Suspense>
            </AuthGuard>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
