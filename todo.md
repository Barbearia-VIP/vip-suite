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

## Integração Dashboard Central
- [ ] Dashboard integrado com KPIs reais do Data VIP (vendas do BD)
- [ ] Dashboard integrado com KPIs do Gestão Total (tarefas, processos)
- [ ] Dashboard integrado com KPIs do VIP Cam (reconhecimentos do BD)
- [ ] Dashboard integrado com KPIs da Reputação (avaliações do BD)
- [ ] Dashboard integrado com KPIs do Auto Instagram (métricas do BD)
- [ ] Dashboard integrado com KPIs do We Send WhatsApp (campanhas do BD)
- [ ] Estado "aguardando configuração" para módulos sem chaves configuradas
- [ ] Gráfico de faturamento mensal com dados reais do BD
- [ ] Ranking de unidades com dados reais do BD

## Módulo Auto Instagram (Concluído)

- [x] Tabelas BD: ig_config, ig_activity_logs, story_reply_config, story_reply_log, ig_approval_queue, ig_bot_stats, ig_replied_comments
- [x] Bot scheduler no servidor (setInterval por unidade, persiste entre sessões, reinicia ao ligar servidor)
- [x] Router tRPC: ig (getConfig, saveConfig, testConnection, getStatus, startBot, stopBot, runCycleNow)
- [x] Router tRPC: igPrompts (getCommentPrompt, saveCommentPrompt, getStoryPrompt, saveStoryPrompt, testPrompt)
- [x] Router tRPC: igDashboard (getStats, getHealthStatus, getRecentActivity, getChartData)
- [x] Router tRPC: igLogs (getList, exportCsv)
- [x] Router tRPC: igApproval (getPending, approve, reject)
- [x] Router tRPC: igStories (getConfig, saveConfig, getLogs)
- [x] Seção Auto Instagram no painel de configurações da unidade (accessToken, instagramUserId, intervalo, toggles)
- [x] Página /auto-instagram — Dashboard com KPIs, estado do bot, gráfico de barras 7 dias, logs recentes
- [x] Página /auto-instagram/prompts — Editor de prompts comentários + stories com teste ao vivo
- [x] Página /auto-instagram/logs — Histórico paginado com filtros e exportação CSV
- [x] Página /auto-instagram/aprovacao — Fila de aprovação manual com edição de respostas
- [x] Página /auto-instagram/stories — Config e logs de respostas a stories
- [x] Página /auto-instagram/diagnostico — Teste de conexão, info da conta, forçar ciclo
- [x] Testes Vitest: 15 testes passando

## Módulo Data VIP — Implementação Completa

- [x] Verificar/criar tabelas: vendas_api_raw, dimensao_clientes, dimensao_colaboradores, metas, sync_log, servicos, comissoes, regras_comissao, folgas, feriados, relatorios_semanais
- [x] Sync engine: syncVendas(), updateDimensoes(), syncVendasChunked() com retry e backoff
- [x] Scheduler automático às 08:00 BRT (últimos 2 dias) com Map<orgId, UnitSyncStatus>
- [x] Router dataVip.dashboard — KPIs: faturamento, atendimentos, ticket médio, clientes novos, extras
- [x] Router dataVip.faturamento — análise por produto, forma pagamento, período
- [x] Router dataVip.clientes — lista com filtros, paginação, busca
- [x] Router dataVip.raioX — classificação Ativo/Em Risco/Perdido/Novo
- [x] Router dataVip.colaboradores — lista, tipo (barbeiro/recepção), métricas
- [x] Router dataVip.comissoes — cálculo por regras configuráveis
- [x] Router dataVip.metas — CRUD metas mensais com alertas
- [x] Router dataVip.ranking — ranking da rede com controle de visibilidade
- [x] Router dataVip.sync — 3 modos: 2 dias, 13 meses, histórico completo
- [x] Controle de acesso: dados por unidade, visão geral apenas admin + "Todas as Unidades"
- [x] Página /data-vip — Dashboard com KPIs e gráficos
- [x] Página /data-vip/mensal — Análise mensal com gráficos
- [x] Página /data-vip/ranking — Ranking da rede
- [x] Página /data-vip/faturamento — Análise detalhada de faturamento
- [x] Página /data-vip/clientes — Lista de clientes com filtros
- [x] Página /data-vip/raio-x — Raio X de retenção
- [x] Página /data-vip/colaboradores — Gestão de colaboradores
- [x] Página /data-vip/comissoes — Cálculo de comissões
- [x] Página /data-vip/metas — Metas mensais com alertas
- [x] Página /data-vip/servicos — Catálogo de serviços
- [x] Página /data-vip/relatorios — Relatórios semanais
- [x] Página /data-vip/calendario — Folgas e feriados
- [x] Página /data-vip/sincronizacao — Painel de sync com 3 modos
- [x] Página /data-vip/administracao — CRUD orgs com teste de credenciais
- [x] Navegação lateral do módulo atualizada com todos os links
- [x] Testes Vitest: 34 testes passando (15 novos Data VIP + 19 existentes)

## Módulo Gestão Total — Implementação Completa

### Banco de Dados
- [x] Tabela gt_tarefas (status, prioridade, responsável, prazo)
- [x] Tabela gt_processos (etapas, responsáveis, checklists)
- [x] Tabela gt_instrucoes_trabalho (título, conteúdo, categoria)
- [x] Tabela gt_indicadores (nome, tipo, valor_atual, meta, período)
- [x] Tabela gt_planejamento_estrategico (missão, visão, valores, SWOT)
- [x] Tabela gt_reunioes (data, pauta, ata, participantes)
- [x] Tabela gt_colaboradores_gt (nome, cargo_id, salário, status)
- [x] Tabela gt_cargos (nome, descrição, nível)
- [x] Tabela gt_financeiro (tipo receita/despesa, categoria, valor, vencimento)
- [x] Tabela gt_compras (fornecedor, status, itens, total)
- [x] Tabela gt_fornecedores
- [x] Tabela gt_problemas (severidade, status, responsável)
- [x] Tabela gt_oportunidades (prioridade, status, valor_estimado)
- [x] Tabela gt_riscos (probabilidade, impacto, mitigação)
- [x] Tabela gt_documentos (título, categoria, url_arquivo)
- [x] Tabela gt_marketing (canal, status, budget, métricas)
- [x] Tabela gt_audit_log (ação, entidade, usuário, timestamp)
- [x] Tabela gt_advisor_conversations (mensagens, contexto)

### Routers tRPC
- [x] Router gestaoTotal.tarefas (CRUD + kanban status update)
- [x] Router gestaoTotal.processos (CRUD + etapas)
- [x] Router gestaoTotal.instrucoes (CRUD)
- [x] Router gestaoTotal.indicadores (CRUD + histórico)
- [x] Router gestaoTotal.planejamento (CRUD + SWOT)
- [x] Router gestaoTotal.reunioes (CRUD + ata)
- [x] Router gestaoTotal.colaboradores (CRUD + cargos)
- [x] Router gestaoTotal.cargos (CRUD)
- [x] Router gestaoTotal.financeiro (CRUD + DRE)
- [x] Router gestaoTotal.fornecedores (CRUD)
- [x] Router gestaoTotal.compras (CRUD + aprovação)
- [x] Router gestaoTotal.problemas (CRUD)
- [x] Router gestaoTotal.oportunidades (CRUD)
- [x] Router gestaoTotal.riscos (CRUD)
- [x] Router gestaoTotal.documentos (CRUD)
- [x] Router gestaoTotal.marketing (CRUD + métricas)
- [x] Router gestaoTotal.dashboard (KPIs consolidados)
- [x] Router gestaoTotal.ia (chat + histórico de conversas)
- [x] Router gestaoTotal.auditoria (log de ações)

### Páginas
- [x] Página /gestao-total — Dashboard com KPIs integrados (GestaoTotalDashboard)
- [x] Página /gestao-total/tarefas — Lista + Kanban drag-and-drop
- [x] Página /gestao-total/indicadores — Indicadores estratégicos
- [x] Página /gestao-total/planejamento — Planejamento estratégico + SWOT
- [x] Página /gestao-total/processos — Processos operacionais
- [x] Página /gestao-total/instrucoes — Instruções de trabalho
- [x] Página /gestao-total/reunioes — Reuniões com pauta e ata
- [x] Página /gestao-total/colaboradores — Gestão de colaboradores
- [x] Página /gestao-total/cargos — Cargos e funções
- [x] Página /gestao-total/financeiro — DRE + lançamentos
- [x] Página /gestao-total/compras — Fornecedores + pedidos + aprovação
- [x] Página /gestao-total/problemas — Registro de problemas
- [x] Página /gestao-total/oportunidades — Oportunidades identificadas
- [x] Página /gestao-total/riscos — Mapa de riscos
- [x] Página /gestao-total/documentos — Gestão de documentos
- [x] Página /gestao-total/marketing — Campanhas e métricas
- [x] Página /gestao-total/ia — IA Conselheiro (chat com contexto da unidade)
- [x] Navegação lateral atualizada com 17 links e ícones distintos
- [x] Dashboard Central atualizado com KPIs do Gestão Total (tarefas, problemas, reuniões, financeiro)
- [x] Testes Vitest: 56 testes passando (22 novos Gestão Total + 34 existentes)
