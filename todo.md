# VIP Suite — TODO

## Fase 1: Base do Projeto
- [x] Schema do banco de dados (orgs, units, users, perfis, permissões, configurações de módulos)
- [x] Migrations aplicadas no BD
- [x] Helpers de query no server/db.ts
- [x] tRPC routers base (auth, orgs, units, users)

## Fase 2: Design System e Layout
- [x] Design system (cores, tipografia, tokens CSS)
- [x] Layout principal com navegação superior (7 módulos)
- [x] Sidebar por módulo
- [x] Seletor de unidade no header
- [x] Tema escuro como padrão
- [x] Responsividade mobile

## Fase 3: Autenticação e Controle de Acesso
- [x] Login com autenticação Manus OAuth
- [x] 5 perfis de acesso: master, org_admin, unit_manager, team_lead, colaborador
- [x] Controle de permissões por unidade
- [x] Tela de cadastro de organização (onboarding)
- [x] Guard de rotas por perfil

## Fase 4: Painel de Controle por Unidade
- [x] Tela de listagem de unidades (admin)
- [x] Tela de cadastro/edição de unidade
- [x] Painel de configurações da unidade (chaves de API por módulo)
  - [x] Config API externa (Data VIP)
  - [x] Config Instagram (Auto Instagram)
  - [x] Config WhatsApp WAHA (We Send)
  - [x] Config Google Reviews (Reputação)
  - [x] Config VIP CAM (Supabase keys)
- [x] Gestão de usuários por unidade

## Fase 5: Dashboard Central
- [x] KPIs consolidados por unidade selecionada
  - [x] Faturamento (Data VIP)
  - [x] Satisfação de clientes (VIP CAM)
  - [x] Avaliações Google (Reputação)
  - [x] Seguidores / engajamento (Auto Instagram)
  - [x] Mensagens enviadas (We Send)
  - [x] Tarefas em aberto (Gestão Total)
- [x] Gráficos de tendência

## Fase 6: Módulo Data VIP
- [x] Dashboard de faturamento (diário, mensal, comparativo)
- [x] Ranking da rede com controle de visibilidade
- [x] Mix de serviços (PieChart)
- [x] Metas de faturamento com barra de progresso
- [x] Botão de sincronização com API externa

## Fase 7: Módulo Gestão Total
- [x] KPIs operacionais (NPS, Ocupação, Retenção, Churn)
- [x] Gestão de tarefas (status, prioridade, responsável)
- [x] DRE simplificado (Receita, Despesas, Lucro)
- [x] Processos operacionais com checklists
- [x] IA Conselheiro com análise e sugestões

## Fase 8: Módulos Restantes
- [x] VIP CAM: histórico de reconhecimentos, distribuição de expressões, KPIs
- [x] Reputação: avaliações por plataforma, resposta com IA, análise de sentimento
- [x] Auto Instagram: comentários, regras do bot, KPIs de engajamento
- [x] We Send WhatsApp: wizard de 6 etapas, importação de contatos, relatório de envio

## Fase 9: Entrega
- [x] Testes vitest passando (15 testes)
- [x] Repositório GitHub criado (floripabalada/vip-suite)
- [x] Checkpoint salvo

## Pendente (próximas iterações)
- [ ] Integração real com API externa do Data VIP (configurável por unidade)
- [ ] Integração real com Google Places API para Reputação
- [ ] Integração real com Meta Graph API para Auto Instagram
- [ ] Integração real com WAHA para We Send WhatsApp
- [ ] Integração real com Supabase para VIP Cam
- [ ] Gestão Total: módulo de Reuniões e Compras completos
- [ ] Página de Permissões com controle granular por módulo
- [ ] Exportação de relatórios em Excel/PDF
- [ ] Colaboradores, comissões e calendário (Data VIP)
- [ ] Clientes e raio-X (retenção, churn, coorte)

## Bugs Reportados

- [x] orgs.myProfile retorna undefined quando usuário não tem userProfile no banco
- [x] orgs.units retorna "Sem acesso a esta organização" para usuário admin sem userProfile
- [x] Botão de sincronização do Data VIP não funciona — implementar chamada real à API externa
- [x] Implementar router de sincronização Data VIP com API https://franquiabv.com.br/api/unidade/vendasV2
- [x] Conectar botão Sincronizar no DataVipPage ao router de sync
- [x] Seletor de data de início e fim no modal de sincronização do Data VIP
- [x] Feedback de progresso em tempo real durante sincronização
