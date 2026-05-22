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

## Módulo VIP Cam — Implementação Completa

### Banco de Dados
- [x] Tabela cam_clientes atualizada (faceDescriptor, faceImageUrl, visitCount, lastSeenAt, satisfactionLevel)
- [x] Tabela cam_sentiment_timeline (detecções em tempo real com expression, confidence, satisfactionLevel)
- [x] Tabela cam_hourly_metrics (métricas por hora: satisfeitos, neutros, insatisfeitos, totalDeteccoes)
- [x] Tabela cam_camera_config (tipo USB/IP, rtspUrl, rtspLogin, rtspPassword, rtspProtocol, threshold, cooldown)
- [x] Tabela cam_metricas_diarias atualizada (satisfeitos, neutros, insatisfeitos, satisfactionRate)

### Modelos face-api
- [x] Upload dos 8 modelos face-api para CDN (TinyFaceDetector, FaceRecognitionNet, FaceLandmark68Net, etc.)
- [x] Arquivo faceApiModels.ts com URLs do CDN para carregamento no frontend

### Router tRPC
- [x] vipCam.getClientes (lista com filtro por satisfação, busca, paginação)
- [x] vipCam.getClienteDetail (detalhes + histórico de visitas)
- [x] vipCam.registerDetection (registra detecção, salva foto no S3, atualiza métricas)
- [x] vipCam.getTimeline (histórico paginado com filtro de data)
- [x] vipCam.getMetricas (KPIs diários com totais e taxa de satisfação)
- [x] vipCam.getDashboard (KPIs do dashboard: detecções hoje, satisfação, clientes únicos)
- [x] vipCam.getCameraConfig (busca configuração da câmera da unidade)
- [x] vipCam.saveCameraConfig (salva configuração: tipo, RTSP, threshold, cooldown)
- [x] vipCam.updateCliente (atualiza nome do cliente reconhecido)

### Componentes e Hooks
- [x] Hook useFaceApi (carrega modelos do CDN com progresso)
- [x] emotionClassifier.ts (classifica emoções: satisfied/neutral/unsatisfied com limiares)
- [x] EmotionCamera.tsx (componente principal: webcam USB + câmera IP via HLS proxy)

### Páginas
- [x] /vip-cam — Dashboard com KPIs de satisfação e detecções
- [x] /vip-cam/ao-vivo — Câmera ao vivo com reconhecimento facial em tempo real
- [x] /vip-cam/clientes — Lista de clientes reconhecidos com filtros
- [x] /vip-cam/historico — Timeline paginada de detecções
- [x] /vip-cam/relatorios — Métricas e gráficos de satisfação
- [x] /vip-cam/configuracoes — Configuração de câmera (USB ou IP RTSP/RTSPS)
- [x] Navegação lateral atualizada com 6 itens e ícones distintos
- [x] Testes Vitest: 82 testes passando (26 novos VIP Cam + 56 existentes)

## Módulo Reputação — Implementação Completa

### Banco de Dados
- [x] Tabela rep_conexoes (plataforma, placeId, apiKey, accessToken, unitId)
- [x] Tabela rep_avaliacoes (nota, texto, autor, data, respondida, resposta, sentimento, plataforma, unitId)
- [x] Tabela rep_config_ia (nomeEstabelecimento, nomeProprietario, tom, incluirAssinatura, autoResponder, promptPersonalizado)
- [x] Tabela rep_respostas_ia (avaliacaoId, textoGerado, textoFinal, aprovada, unitId)
- [x] Tabela rep_metricas_diarias (data, unitId, totalAvaliacoes, mediaNotas, positivas, neutras, negativas, respondidas)
- [x] Tabela rep_sentiment_timeline (avaliacaoId, sentimento, confianca, palavrasChave, unitId)
- [x] Tabela rep_alertas (tipo, mensagem, lida, unitId)
- [x] Tabela rep_templates_resposta (nome, texto, plataforma, nota, unitId)
- [x] Tabela rep_historico_importacao (plataforma, totalImportadas, status, unitId)
- [x] Tabela rep_palavras_chave (palavra, frequencia, sentimento, unitId)
- [x] Tabela rep_concorrentes (nome, placeId, mediaNotas, totalAvaliacoes, unitId)
- [x] Tabela rep_audit_log (acao, entidade, usuarioId, unitId)

### Router tRPC
- [x] reputacao.getDashboard (KPIs: média, total, taxa resposta, NPS, tendência)
- [x] reputacao.getAvaliacoes (lista com filtros: nota, sentimento, semResposta, plataforma, busca)
- [x] reputacao.getAvaliacaoDetail (detalhes + histórico de respostas IA)
- [x] reputacao.gerarRespostaIA (gera resposta com LLM usando config da unidade)
- [x] reputacao.responderAvaliacao (salva resposta final)
- [x] reputacao.getAnalise (análise de sentimento por período: 7d/30d/90d/12m)
- [x] reputacao.getConexoes (lista conexões Google/iFood/TripAdvisor da unidade)
- [x] reputacao.saveConexao (salva/atualiza conexão com plataforma)
- [x] reputacao.deleteConexao (remove conexão)
- [x] reputacao.importarGooglePlaces (importa avaliações via Google Places API)
- [x] reputacao.getConfigIA (busca configuração da IA da unidade)
- [x] reputacao.saveConfigIA (salva configuração: tom, nome, autoResponder, prompt)

### Páginas
- [x] /reputacao — Dashboard com KPIs e gráficos de tendência
- [x] /reputacao/avaliacoes — Lista de avaliações com filtros e geração de resposta IA
- [x] /reputacao/respostas — Avaliações respondidas com histórico
- [x] /reputacao/analise — Análise de sentimento por período com gráficos
- [x] /reputacao/integracoes — Conexão com Google Places, iFood, TripAdvisor
- [x] /reputacao/config-ia — Configuração da IA (tom, nome, autoResponder, prompt personalizado)
- [x] Navegação lateral atualizada com 6 itens
- [x] Testes Vitest: 99 testes passando (23 novos Reputação + 76 existentes)

## Credenciais Google Business Profile por Unidade

- [ ] Adicionar campos Google na tabela unit_configs (googleClientId, googleClientSecret, googlePlaceId, googleAccessToken, googleRefreshToken, googleTokenExpiry)
- [ ] Aplicar migration no banco
- [ ] Router tRPC: saveGoogleConfig, getGoogleConfig, testGoogleConnection por unidade
- [ ] UI de configurações da unidade com seção Google Business Profile
- [ ] Pré-cadastrar credenciais da unidade Santa Mônica (Place ID: ChIJ-TBxZ_s4J5URaJQWJ2zfqRA)
- [ ] Atualizar router reputacao.importarGooglePlaces para usar credenciais da unidade

## Bug: Reputação sem dados após configurar credenciais Google
- [ ] Diagnosticar por que importarGooglePlaces não retorna dados reais
- [ ] Corrigir pipeline de importação Google Places API (endpoint, mapeamento de campos)
- [ ] Corrigir getDashboard/getAvaliacoes/getAnalise para retornar dados após importação
- [ ] Sincronizar automaticamente após salvar integração com sucesso

## Módulo We Send — Implementação Completa (WAHA)

### Banco de Dados
- [x] Tabela ws_config (wahaUrl, wahaApiKey, sessionName, intervaloSegundos, horarioInicio, horarioFim, maxEnviosDia)
- [x] Tabela ws_campanhas (nome, mensagem, tipo, status, totalContatos, totalEnviados, totalFalhas, intervaloSegundos)
- [x] Tabela ws_lista_itens (campanhaId, unitId, nome, telefone, variaveis, status, erroMsg)
- [x] Migration aplicada no banco de dados

### Routers tRPC
- [x] Router weSend.getConfig (buscar configurações WAHA da unidade)
- [x] Router weSend.saveConfig (salvar configurações WAHA)
- [x] Router weSend.getSessionStatus (status da sessão WhatsApp + QR Code)
- [x] Router weSend.startSession (iniciar sessão WAHA)
- [x] Router weSend.stopSession (encerrar sessão WAHA)
- [x] Router weSend.getDashboard (KPIs: totalCampanhas, totalEnviados, enviadosMes, taxaSucesso, totalFalhas)
- [x] Router weSend.getCampanhas (listar campanhas com métricas)
- [x] Router weSend.getCampanha (detalhes de uma campanha + lista de contatos)
- [x] Router weSend.criarCampanha (criar campanha com lista de contatos)
- [x] Router weSend.enviarCampanha (disparar envio em background via WAHA API)
- [x] Router weSend.pausarCampanha (pausar campanha em andamento)
- [x] Router weSend.deleteCampanha (remover campanha)
- [x] Router weSend.importarContatos (importar contatos para uma lista)

### Páginas
- [x] Página /we-send — Dashboard com KPIs + wizard de nova campanha (5 etapas)
  - [x] Step 0: Nome da campanha + adicionar contatos manualmente + importar CSV
  - [x] Step 1: Editor de mensagem com personalização {nome} + preview
  - [x] Step 2: Configurar intervalo entre envios + alertas de sessão
  - [x] Step 3: Revisão completa antes de enviar
  - [x] Step 4: Confirmação de envio iniciado
- [x] Página /we-send/campanhas — Histórico com status, progresso, detalhes e ações (pausar/deletar)
- [x] Página /we-send/relatorios — Métricas consolidadas, campanhas por status, top 5 campanhas
- [x] Página /we-send/configuracoes — Config WAHA (URL, API Key, sessão, horários), QR Code, guia de instalação
- [x] Navegação lateral atualizada com 4 links (Nova Campanha, Campanhas, Relatórios, Configurações WAHA)

### Melhorias Módulo Reputação
- [x] Página /reputacao/integracoes reescrita com melhor UX
  - [x] Status da conexão Google (OAuth vs Places API)
  - [x] Instruções claras sobre redirect URI para Google Cloud Console
  - [x] Botão para copiar redirect URI
  - [x] Seção de configuração da Places API Key
  - [x] Botão de sincronização com feedback visual

## Bugs Corrigidos (31/03/2026)

- [x] Dados Data VIP zerados — migração de 6.363 registros de `vendas` para `vendas_api_raw`, reconstrução de dimensões (2.276 clientes, 25 colaboradores)
- [x] Formulário Nova Integração (Reputação) salvava com `unitId=0` quando nenhuma unidade estava selecionada — corrigido com seletor de unidade obrigatório no dialog
- [x] Registro duplicado com `unitId=0` removido do banco (`rep_conexoes`)

## Melhorias Sessão 01/04/2026
- [x] Badge "Data VIP" adicionado nos lançamentos do Financeiro (Gestão Total) — identificação visual clara de lançamentos gerados automaticamente pelo Data VIP
- [x] Botões de editar/excluir ocultados para lançamentos com `dataVipRef` preenchido (gerenciados automaticamente)
- [x] Bug corrigido: auto-sync usava `o.status = 'active'` mas tabela usa `o.active = 1` — corrigido em vipDataSync.ts linha 498

## Reorganização Menu Gestão Total (01/04/2026)
- [x] Menu lateral reorganizado seguindo jornada real: Dashboard → Planejamento → Processos → Instruções de Trabalho → Tarefas → Pessoas (grupo: Cargos + Colaboradores) → Indicadores → Documentos → Problemas → Oportunidades → Riscos → Marketing → Financeiro → Reuniões → Compras → IA Conselheiro → Configurações → Privilégios → separador → Guia do Sistema
- [x] Suporte a grupos no menu lateral (tipo "group" com label de seção e itens filhos com indentação)
- [x] Suporte a separadores visuais no menu lateral (tipo "separator")
- [x] Página Configurações GT criada (/gestao-total/configuracoes) — 5 seções: Notificações, Aparência, Idioma, Segurança, Exportação
- [x] Página Privilégios criada (/gestao-total/privilegios) — 5 perfis com permissões visuais (Master, Admin, Gerente, Líder, Colaborador)
- [x] Página Guia do Sistema criada (/gestao-total/guia) — accordion expansível com descrição de cada seção do módulo
- [x] 3 novas rotas registradas no App.tsx

## Sessão 01/04/2026 — Fluxo IA Gestão Total

- [x] Reorganizar menu lateral do Gestão Total (Dashboard, Planejamento, Processos, IT, Tarefas, Pessoas, Indicadores, Documentos, Problemas, Oportunidades, Riscos, Marketing, Financeiro, Reuniões, Compras, IA Conselheiro, Configurações, Privilégios, Guia do Sistema)
- [x] Criar grupo "Pessoas" com Cargos e Colaboradores no menu
- [x] Criar páginas placeholder: ConfiguracoesGtPage, PrivilegiosPage, GuiaSistemaPage
- [x] Atualizar schema: gtProcessos com tipo/area/duracaoEstimada/etapas/recursos/metricas/riscos/geradoPorIA/status, gtInstrucoes com processoId/plano/responsavelNome/responsavelId/geradoPorIA/status
- [x] Migração SQL aplicada no banco (0008_gt_ai_flow.sql)
- [x] PlanejamentoPage: botão "Gerar com IA", modal de contexto (segmento/porte/diferenciais/desafios), modal de revisão (Missão/Visão/Valores + SWOT + Objetivos)
- [x] ProcessosPage: botão "Gerar Processos com IA", modal de revisão com aceitar/rejeitar individual, botão "IT" para enviar processo para Instruções de Trabalho
- [x] InstrucoesPage: recebe processoId via query param, modal de geração por IA, visualização do plano detalhado (objetivo, materiais, passos, dicas, alertas, indicadores)
- [x] Router gestaoTotal.ts: procedures generateAI (planejamento), generateAI (processos), saveMany (processos), generateFromProcesso (instrucoes)

## Bugs VIP Cam (01/04/2026)

- [x] Corrigir erro 403 no carregamento dos modelos do face-api.js — modelos copiados para client/public/models/ e servidos localmente
- [x] Corrigir SelectItem com value vazio na página VIP Cam ao vivo

## Indicadores Integrados — Implementação Completa

- [x] Procedure `gestaoTotal.indicadores.consolidado` — retorna indicadores reais do sistema (tarefas, financeiro, compras, colaboradores, oportunidades)
- [x] IndicadoresPage reescrita com layout integrado: cards com valor real vs meta, barra de progresso colorida (verde/amarelo/vermelho)
- [x] Resumo rápido: 3 cards de status (No alvo, Atenção, Crítico)
- [x] 3 abas: Visão Geral (grid de cards), Por Categoria (agrupado), Gráficos (BarChart + RadarChart)
- [x] Tendência por indicador (seta subindo/estável/caindo)
- [x] Link direto para o módulo de cada categoria (Produtividade → Tarefas, Financeiro → Financeiro, etc.)
- [x] Atualização automática a cada 60 segundos

## Sincronização Data VIP → Financeiro (Concluído)

- [x] Analisar estrutura de vendas_api_raw e gt_financeiro para mapear campos
- [x] Adicionar coluna `dataVipRef` (VARCHAR 100) e índice único `uq_datavip_ref` em gt_financeiro
- [x] Criar procedure `gestaoTotal.financeiro.syncDataVip` (mutation manual) no servidor
- [x] Criar procedure `gestaoTotal.financeiro.syncDataVipStatus` (query de status) no servidor
- [x] Integrar chamada `syncGtFinanceiro` nos 3 modos de sync do Data VIP (auto, 13m, histórico)
- [x] Exibir badge "Data VIP" nas entradas sincronizadas na página Financeiro
- [x] Botão "Sincronizar Data VIP" na FinanceiroPage com feedback de progresso
- [x] Painel de status da sincronização (total de registros, período, última atualização)
- [x] Impedir duplicação (upsert por chave datavip:{unitId}:{YYYY-MM-DD})
- [x] 19 testes vitest passando para a lógica de sincronização

## Módulo Marketing com IA — Implementação Completa

### Banco de Dados
- [x] Tabela gt_marketing_campaigns (campos JSONB individuais + json_blob)
- [x] Migration SQL aplicada no banco

### Routers tRPC
- [x] gestaoTotal.marketingCampaigns.listCampaigns (lista campanhas da org)
- [x] gestaoTotal.marketingCampaigns.getCampaign (detalhe de uma campanha)
- [x] gestaoTotal.marketingCampaigns.generateCampaign (wizard data → LLM → salva no banco)
- [x] gestaoTotal.marketingCampaigns.deleteCampaign
- [x] gestaoTotal.marketingCampaigns.assignCampaign (atribuir a colaborador)

### Componentes
- [x] MarketingCampaignWizard.tsx — wizard modal 10 etapas com barra de progresso
- [x] CampaignPreview.tsx — modal de visualização com 7 abas
- [x] AssignCampaignModal.tsx — modal de atribuição a colaborador

### Páginas
- [x] Atualizar /gestao-total/marketing — botão "Gerar Nova Campanha com IA", lista de campanhas geradas

### Testes
- [x] 27 testes vitest passando (145 total)

## VIP Cam — Ajuste de Lógica de Satisfação (SenseVIP) (Concluído)

- [x] Confirmar que `calcFinalSatisfactionLevel` já implementa as 3 regras do SenseVIP corretamente
- [x] Confirmar que `saveCapture` aplica a regra para clientes existentes (busca histórico + nova captura)
- [x] Confirmar que novo cliente (1ª captura) salva o nível bruto corretamente (regra se aplica a partir da 2ª)
- [x] Adicionar procedure `recalcAllClients` — recálculo em lote com regra de prioridade positiva
- [x] Adicionar procedure `getDailyUniqueStats` — clientes únicos do dia com regra de prioridade
- [x] Adicionar botão "Recalcular Agora" na página de Configurações do VIP Cam
- [x] 23 testes vitest cobrindo os 3 cenários (satisfeito permanente, neutro prevalece, insatisfeito maioria) + casos extremos (168 total)

## VIP Cam — Auditoria de Recálculos e Badge Em Risco

- [ ] Verificar tabela de auditoria existente (cam_audit_log ou gt_audit_log)
- [ ] Registrar auditoria no `recalcAllClients`: quem acionou, quando, quantos atualizados
- [ ] Criar procedure `getRecalcHistory` para listar histórico de recálculos
- [ ] Exibir histórico de recálculos na CamConfigPage (últimas 10 execuções)
- [ ] Adicionar campo `riskLevel` no retorno de `getClientes` (em_risco quando neutros = insatisfeitos e sem satisfeito)
- [ ] Exibir badge laranja "Em Risco" na CamClientesPage para clientes em risco
- [ ] Testes vitest para a lógica de detecção de risco

## VIP Cam — Correção de Lógica de Satisfação (Bug: todos insatisfeitos) (Concluído)

- [x] Diagnosticado: thresholds de angry(0.30), disgusted(0.30) e sad(0.40) muito baixos para o modelo face-api
- [x] Corrigido angry >= 0.55 (era 0.30) — evita falsos positivos de raiva em rostos sérios
- [x] Corrigido disgusted >= 0.50 (era 0.30) — evita confundir "concentrado" com "enojado"
- [x] Corrigido sad >= 0.60 && happy < 0.15 (era 0.40 e 0.20) — só tristeza muito marcada
- [x] Corrigido happy >= 0.35 (era 0.40) — captura sorrisos leves
- [x] Aumentado scoreThreshold do detector de rosto: 0.25 → 0.45 (menos detecções falsas)
- [x] 20 novos testes vitest cobrindo os novos thresholds (183 total)
- [ ] Recalcular clientes existentes com a nova lógica (fazer via botão na página de Configurações)

## VIP Cam — Reclassificação Histórica com Novos Thresholds (Concluído)

- [x] Verificado: cam_sentiment_timeline não tem scores brutos, apenas expression+confidence dominante
- [x] Criado procedure `reclassifyAllHistory`: reavalia cada registro por expression+confidence com novos thresholds
- [x] Procedure recalcula status final de todos os clientes após atualizar a timeline
- [x] Adicionado card azul "Reclassificar Histórico com Nova Lógica" na CamConfigPage
- [x] Auditoria registrada na gt_audit_log após cada reclassificação
- [x] 15 novos testes vitest para reclassifyByExpression (198 total)

## VIP Cam — Correção: Reclassificação processa apenas parte dos registros (Concluído)

- [x] Diagnosticado: timeout do tRPC causado por N queries individuais (1 por registro)
- [x] Etapa 1 reescrita com SQL nativo UPDATE...CASE WHEN (1 query para toda a timeline)
- [x] Etapa 2 reescrita com chunks de 500 clientes (busca timeline em batch com inArray)
- [x] Adicionado import de inArray no vipCam.ts
- [x] 198 testes passando

## VIP Cam — Correção: Histórico órfão sem clientes associados (Concluído)

- [x] Diagnosticado: não havia órfãos (clienteId sempre válido), mas 302 de 307 capturas estavam no cliente 2
- [x] Causa raiz: FACE_MATCH_THRESHOLD = 0.55 muito permissivo — rostos diferentes eram agrupados como 1 cliente
- [x] Corrigido FACE_MATCH_THRESHOLD de 0.55 para 0.42 (valor recomendado para face-api.js 128-dim)
- [x] Média evolutiva do descriptor mantida (comportamento correto, melhora reconhecimento do mesmo cliente)
- [x] Dados incorretos limpos: 307 capturas e 4 clientes removidos, auto_increment resetado
- [x] VIP Cam pronto para recomeçar com threshold correto

## Gestão Total — Marketing: Correção de Responsividade

- [x] Corrigir conteúdo cortado no topo da campanha gerada (MarketingPage / CampaignPreview)
- [x] CampaignPreview: header fixo (título + badges + botões PDF/JSON) + conteúdo scrollável separado
- [x] MarketingCampaignWizard: header fixo (título + progresso) + conteúdo scrollável + footer fixo com botões

## VIP Cam — Correção: Foto do cliente existente

- [x] Corrigir saveCapture: atualizar faceImageUrl do cliente existente quando ele não tiver foto

## Dashboard Geral — Visão Macro Integrada (Concluído)

- [x] Procedure `dashboard.kpis` atualizado com filtro de período (dateFrom/dateTo)
- [x] VIP Cam: clientes únicos no período, % satisfeitos/neutros/insatisfeitos com regra SenseVIP
- [x] Google: nota média Google, total sem resposta (repAvaliacoes), fallback para tabela avaliacoes
- [x] Gestão Total: tarefas pendentes, problemas ativos, reuniões hoje, resultado financeiro
- [x] Data VIP: faturamento, atendimentos, ticket médio no período
- [x] Reformulada página Dashboard com seletor de período (Hoje/Semana/Mês/Trimestre/Personalizado)
- [x] 6 cards de módulo com link direto, badge de status (Ativo/Sem dados/Configurar)
- [x] Gráfico de faturamento mensal (6 meses) com AreaChart
- [x] Painel de status dos módulos com indicador Wifi/WifiOff
- [x] Ranking de unidades (admin)
- [x] Acesso rápido aos 6 módulos
- [x] Atualização automática a cada 2 minutos (refetchInterval: 120000)

## Dashboard Geral — Correção de Sincronização de Dados

- [ ] Investigar por que os cards mostram "Sem dados" mesmo com dados no banco
- [ ] Corrigir queries do procedure kpis para Data VIP (vendas_api_raw / valorLiquido)
- [ ] Corrigir queries do procedure kpis para Gestão Total (gt_tarefas, gt_problemas, gt_reunioes)
- [ ] Corrigir queries do procedure kpis para VIP Cam (cam_sentiment_timeline / cam_clientes)
- [ ] Corrigir queries do procedure kpis para Reputação (rep_avaliacoes / avaliacoes)
- [ ] Garantir que filtros de orgId/unitId e período estão corretos em todas as queries

## Bugs Novos

- [x] Sincronização Data VIP travada: syncStatusMap usa orgId como chave mas múltiplas unidades têm o mesmo orgId, causando "Sync already running for this unit" ao tentar sincronizar várias unidades
- [x] SincronizacaoPage: exibir quais unidades têm credenciais configuradas e bloquear botão de sync para unidades sem credenciais, em vez de lançar erro genérico
- [x] Dados sincronizados somem após sair e voltar: bug crítico corrigido — DELETE usava apenas orgId, apagando dados de todas as unidades; corrigido para filtrar por orgId AND unitId
- [x] Botão "Sincronizar Todas as Unidades" com execução sequencial, seleção de modo (2 dias / 13 meses) e progresso em tempo real

## Raio X Clientes — Expansão Completa
- [ ] Endpoints tRPC: raioXVisaoGeral (sinais da base, saúde, distribuições)
- [ ] Endpoints tRPC: raioXOneShot (clientes com 1 visita)
- [ ] Endpoints tRPC: raioXCadencia (frequência e perfil)
- [ ] Endpoints tRPC: raioXChurn (perdas e retenção mensal)
- [ ] Endpoints tRPC: raioXCohort (por coorte de entrada)
- [ ] Endpoints tRPC: raioXBarbeiros (por colaborador)
- [x] Endpoints tRPC: raioXDiagnostico (qualidade de dados)
- [ ] Frontend: aba Visão Geral (sinais da base, atividade, saúde, distribuições)
- [ ] Frontend: aba One-Shot (clientes com 1 visita)
- [ ] Frontend: aba Cadência (frequência e perfil)
- [ ] Frontend: aba Churn (perdas e retenção)
- [ ] Frontend: aba Cohort (por coorte de entrada)
- [ ] Frontend: aba Barbeiros (por colaborador)
- [ ] Frontend: aba Ações (fila de contato CRM)
- [x] Frontend: aba Diagnóstico (qualidade de dados)

## Raio X Clientes — Implementação Completa (Data VIP)

- [x] Router tRPC raioX.visaoGeral (sinais da base, atividade, saúde, distribuições, novos clientes)
- [x] Router tRPC raioX.oneShot (lista paginada com filtros aguardando/em_risco/perdido e busca)
- [x] Router tRPC raioX.cadencia (distribuição por cadência, top clientes por frequência)
- [x] Router tRPC raioX.churn (taxa de churn, perdidos recentes, gráfico mensal)
- [x] Router tRPC raioX.cohort (por mês de entrada, retenção e fidelização)
- [x] Router tRPC raioX.barbeiros (atendimentos, faturamento, clientes únicos, novos por barbeiro)
- [x] Router tRPC raioX.acoes (fila de contato por prioridade: alta/média/baixa)
- [x] Router tRPC raioX.diagnostico (qualidade da base, alertas, distribuição por visitas)
- [x] Página /data-vip/raio-x reescrita com todas as 8 abas
- [x] Score de saúde da base (% ativos) com indicador visual
- [x] Gráficos recharts: novos clientes mensal, churn mensal, barbeiros
- [ ] Raio X - Seletor de período com opções predefinidas e personalizado

## Raio X — Filtro por Barbeiro na Aba Churn

- [x] Endpoint tRPC raioX.churnPorBarbeiro (clientes atendidos no período, status atual por barbeiro)
- [x] Toggle "Visão Geral / Por Barbeiro" na aba Churn
- [x] Tabela de retenção por barbeiro: Clientes, Ativos, Em Risco, Perdidos, One-Shot, Retenção %, Churn %, Méd. Visitas, Ticket Médio
- [x] Correção: query usa subquery para clientes únicos do período + status atual da dimensao_clientes
- [x] Correção: fmtDate lida com objetos Date do MySQL e strings
- [x] Nota informativa: usar períodos mais antigos para ver churn real

## Migração Data VIP → Banco MySQL Externo (franquia_producao)

- [x] Criar helper de conexão com banco externo via SSH tunnel (server/db-external.ts)
- [x] Configurar credenciais do banco externo como secrets (DB_EXT_HOST, DB_EXT_USER, DB_EXT_PASS, DB_EXT_NAME, SSH_HOST, SSH_USER, SSH_PASS)
- [x] Criar script de startup do túnel SSH automático no servidor
- [x] Reescrever router dataVip.dashboard para usar tabelas nativas (dashboard_faturamento, vendas, vendas_produtos)
- [x] Reescrever router dataVip.faturamento para usar vendas + vendas_produtos + formas_pagamentos
- [x] Reescrever router dataVip.clientes para usar tabela clientes nativa
- [x] Reescrever router dataVip.colaboradores para usar dashboard_colaboradores + usuarios
- [x] Reescrever router dataVip.ranking para usar dashboard_faturamento por unidade
- [x] Reescrever Raio X para usar clientes.ultima_visita + vendas nativas
- [x] Sincronizar lista de unidades do banco externo com tabela units do VIP Suite
- [x] Remover dependência da API franquiabv.com.br/api/unidade/vendasV2
- [x] Testar todos os módulos com dados reais do banco de produção

## Correções Pós-Migração (Banco Externo)

- [x] Data VIP Dashboard: indicador "Mês em andamento" para meses parciais (evitar -96% vs mês ant.)
- [x] Raio X One-Shot: campo "Gasto" corrigido para usar SUM(v.valor_total) em vez de c.consumo (campo desatualizado)
- [x] Raio X Barbeiros: query corrigida de v.total para v.valor_total (campo correto na tabela vendas)
- [x] Todas as abas do Raio X testadas e funcionando: Visão Geral, One-Shot, Cadência, Churn, Cohort, Barbeiros, Diagnóstico

## Prompt de IA por Unidade (Reputação)

- [ ] Adicionar coluna ai_prompt (TEXT) na tabela units do banco local
- [ ] Popular todas as unidades com o prompt padrão da Barbearia VIP
- [ ] Criar procedure tRPC para salvar/buscar ai_prompt da unidade
- [ ] Criar UI de edição do Prompt de IA nas configurações da unidade
- [ ] Integrar ai_prompt na geração de respostas de avaliações (Reputação)

## Histórico Auto-Resposta (Reputação)

- [x] Criar procedure tRPC getHistoricoAutoResposta no reputacao.ts
- [x] Criar componente HistoricoAutoResposta.tsx na página de Reputação
- [x] Adicionar aba "Histórico Auto-Resposta" na navegação do módulo Reputação

## Melhorias Aba Análise de Reputação

- [ ] Nuvem de Palavras dos comentários (palavras mais frequentes, coloridas por sentimento)
- [ ] KPIs de Tempo Médio de Resposta da IA (tempo médio, % respondidas em <1h, <24h, >24h)
- [ ] Alertas de Queda de Nota (badge vermelho/amarelo se nota caiu 0.3★ ou 2+ negativas na semana)
- [x] Adicionar gráfico SVG Evolução da Nota Média (igual ao dashboard) na aba Análise de Reputação
- [x] Medidor visual (gauge SVG) de NPS estimado na aba Análise de Reputação
- [x] Melhorar layout aba Análise: NPS e Alertas 50/50, gauge mais moderno, remover gráficos sem dados
- [x] Redesenhar gráfico Distribuição de Sentimentos com visual moderno e impactante
- [x] Bug: erro INSERT na tabela regras_comissao (ON DUPLICATE KEY / colaboradorId 200) na página Comissões
- [x] Bug persistente: INSERT regras_comissao corrigido — adicionada coluna updatedAt e UNIQUE KEY (orgId, colaboradorId)

## Melhorias UX Data VIP Dashboard (Sessão Atual)

- [x] Banner de erro amigável quando banco externo está indisponível (amarelo com botão "Tentar novamente")
- [x] Skeletons de carregamento realistas para cards de colaboradores (5 cards animados com grid de KPIs)
- [x] Helper handleExternalDbError no router dataVip.ts — converte erros SSH/handshake em SERVICE_UNAVAILABLE com mensagem em português
- [x] Try/catch com handleExternalDbError nas procedures dashboard e evolucaoDiaria
- [ ] Validar dados de colaboradores quando SSH reconectar (aguardando estabilização do servidor externo)
- [ ] Testar lógica em múltiplas unidades além de Joinville

## Reformulação Página Faturamento Data VIP

- [x] Backend: procedure faturamentoDetalhado com comparativos (per. anterior, ano anterior, méd. 6m, méd. 12m)
- [x] Backend: procedure topBarbeiros com ranking por faturamento e % do total
- [x] Backend: procedure topItens com ranking de serviços/produtos mais vendidos
- [x] Backend: procedure composicaoGrupo com Fat. Base, Extra, Produtos por categoria
- [x] Frontend: Resumo Executivo — cards Total Geral, Fat. Base, Extras, Produtos, Outros
- [x] Frontend: Tabela comparativa multi-período com variações percentuais coloridas
- [x] Frontend: Seção Composição por grupo com barra de progresso
- [x] Frontend: Seção Top Barbeiros com ranking e barra de progresso
- [x] Frontend: Seção Top Itens com ranking de serviços

## Bloco Aberturas - Página Faturamento

- [x] Backend: queries para 7 visualizações (periodo, barbeiro, grupo, item, diaSemana, pagamento, faixaHoraria)
- [x] Frontend: componente AberturasChart.tsx com 7 abas seleçionáveis
- [x] Frontend: gráfico Recharts (Barra/Linha/Pizza) com área preenchida amarela
- [x] Frontend: KPIs Acumulado, Média, Máximo, Mínimo acima do gráfico
- [x] Frontend: linha de referência Média Atual no gráfico
- [x] Frontend: tabela de ranking abaixo do gráfico
- [x] Frontend: Por período com granularidade Dia/Semana/Mês
- [x] Frontend: Por barbeiro com ranking e participação
- [x] Frontend: Por grupo (Serviço Base, Extra, Produtos)
- [x] Frontend: Por item com filtro Top 10/20/50/Todos
- [x] Frontend: Dia da semana (Dom a Sáb)
- [x] Frontend: Pagamento por forma de pagamento
- [x] Frontend: Faixa horária com picos e ociosidade
- [x] Integrar AberturasChart na FaturamentoPage.tsx

## Correções Aberturas - Por Período

- [x] Corrigir agrupamento por semana (erro ao calcular início da semana)
- [x] Adicionar 3 linhas de referência no gráfico: Média Atual, Méd. SPLY, Méd. 6m
- [x] Exibir legenda das 3 linhas abaixo do gráfico (como no sistema de referência)

## Correção Granularidade Semana - Aberturas
- [x] Diagnosticar e corrigir granularidade "Semana" que não exibe dados no bloco Aberturas
- [x] Corrigir campo 'dia' retornando como objeto Date (usar DATE_FORMAT em vez de DATE() no SQL)

## Correção Comparativo de Períodos - Médias
- [x] Corrigir Dias trab. nas médias de 6 e 12 meses (estava somando, deve ser média)
- [x] Adicionar Fat/dia trab. para médias de 6 e 12 meses (estava vazio)
- [x] Adicionar pctDias e pctFatDia para med6 e med12 (variação vs. atual)

## Correção Média Dias Trabalhados 6m/12m (2ª iteração)
- [x] Reavaliação: média dias trab. 6m esperada ~26, 12m ~25 — corrigido com getDiasTrabalhadosMedia (GROUP BY mês)

## Ranking Barbeiros - Faturamento
- [x] Renomear "TOP Barbeiros" para "Ranking Barbeiros" na página de Faturamento
- [x] Exibir todos os barbeiros (remover limite de 8) no frontend e backend

## Renomeação Ranking Colaboradores
- [x] Renomear "Ranking Barbeiros" para "Ranking Colaboradores" na página de Faturamento

## Top Itens - Limite
- [x] Alterar exibição de Top Itens de 8 para 12 itens

## Composição Produtos - Subdivisão
- [x] Subdividir "Produtos" em Prod. Cabelo, Prod. Barba e Prod. Empório usando campo categoria do banco externo

## Comparativo de Períodos - Datas nos cabeçalhos
- [x] Exibir datas do período abaixo de cada cabeçalho de coluna (ex: "01 out – 31 out 2025" em amarelo)

## Resumo Executivo - Card Outros → Dias Trabalhados
- [x] Substituir card "Outros / R$ 0" por "Dias Trabalhados" do mês selecionado no Resumo Executivo

## Mensal - Painel de KPIs
- [x] Criar procedure backend kpisMensais com: faturamento, atendimentos, ticket médio, clientes, clientes novos, extras qtd, extras R$, serviços totais, dias trabalhados, fat/dia
- [x] Calcular comparativos SPLY (ano anterior), MOM (mês anterior), M12 (média 12m), M6 (média 6m) para cada KPI
- [x] Implementar 10 cards de KPIs no frontend abaixo do gráfico mensal com estilo do modelo

## Mensal - KPIs ajuste de posição e seletor
- [x] Remover seletor de mês próprio dos KPIs — usar período do topo (3/6/12/24 meses)
- [x] Mover cards de KPIs para logo abaixo do gráfico de Faturamento Mensal
- [x] KPIs mostram dados do último mês do período selecionado com comparativos SPLY/MOM/M12/M6

## Mensal - KPIs soma do período selecionado
- [x] Criar procedure backend kpisPeriodoMensal que agrega KPIs de N meses completos (soma do período)
- [x] Comparativos SPLY/MOM/M12/M6 calculados para o período equivalente (mesmo N meses anterior)
- [x] Frontend usa meses selecionado no topo para chamar a procedure
## Mensal - Gráfico Evolução Mensal avançado
- [ ] Estender backend faturamentoMensal para retornar: extras qtd, extras R$, serviços, produtos qtd, produtos valor, clientes novos
- [ ] Gráfico com toggle linha/barras e seletor de métrica (10 opções)
- [ ] Cards de resumo: Acumulado, Média/Mês, Máximo (mês), Mínimo (mês)
- [ ] Tooltip rico ao hover: valor da métrica + dados secundários do mês
- [ ] Linha de média tracejada no gráfico

## Mensal - Gráfico Evolução Mensal Avançado
- [x] Gráfico Evolução Mensal com toggle linha/barras e seletor de métrica (10 opções)
- [x] Cards de resumo: Acumulado, Média/Mês, Máximo (com mês), Mínimo (com mês)
- [x] Tooltip rico ao passar o mouse: todos os dados do mês
- [x] Linha de média tracejada no gráfico

## Bug - getFaturamentoMensalDetalhado
- [x] Corrigir erro "Unknown column 'v.valor_liquido'" na função getFaturamentoMensalDetalhado — corrigido para SUM(vp.valor_total)

## Mensal - Filtro Avançado
- [ ] Seletor de Início (Mês + Ano) e Fim (Mês + Ano) com botão reset
- [ ] Filtro de Tipo: Todos / Colaborador / Caixa
- [ ] Seletor de Colaborador individual com lista completa e contagem
- [ ] Botão "Aplicar Filtros" em amarelo
- [ ] Padrão: últimos 3 meses, Tipo = Todos, Colaborador = Todos
- [ ] Backend: procedure listarColaboradoresMensal para popular o seletor
- [ ] Backend: adaptar getFaturamentoMensalDetalhado para filtrar por colaboradorId e tipo

## Data VIP Mensal — Painel de Filtros Avançado

- [x] Backend: função getFaturamentoMensalDetalhadoFiltrado com filtros dataInicio/dataFim/colaboradorId/tipo
- [x] Backend: função getListaColaboradoresMensal para listar colaboradores ativos
- [x] Backend: procedure listarColaboradoresMensal (orgId/unitId → extIds)
- [x] Backend: procedure faturamentoMensalFiltrado (orgId/unitId/dataInicio/dataFim/colaboradorId/tipo)
- [x] Frontend: painel de filtros colapsável com header resumo (Fev/2026 → Abr/2026)
- [x] Frontend: seletores Início e Fim (mês + ano independentes)
- [x] Frontend: botões de Tipo (Todos / Colab. / Caixa)
- [x] Frontend: seletor de Colaborador com contagem e filtro por tipo
- [x] Frontend: botão "Aplicar Filtros" em amarelo/dourado
- [x] Frontend: padrão 3 meses (Fev–Abr 2026), Tipo=Todos, Colaborador=Todos
- [x] Frontend: gráfico Evolução Mensal usa faturamentoMensalFiltrado
- [x] Frontend: tabela Detalhamento Mensal usa mesmos dados filtrados
- [x] Frontend: KPIs do Período usa mesesNoPeriodo calculado do intervalo

## Ajustes Filtros Mensal (solicitado)
- [x] Remover botões de Tipo (Todos/Colab./Caixa) do painel de filtros
- [x] Seletor de colaborador deve funcionar corretamente (mostrar todos, selecionar um)
- [x] Filtro de colaborador deve atualizar gráfico, KPIs e tabela ao aplicar
- [x] Corrigir query getListaColaboradoresMensal (remover JOIN com dimensao_colaboradores inexistente)
- [x] Remover filtro de tipo da query getFaturamentoMensalDetalhadoFiltrado (tabela não existe)

## Filtro Colaboradores por Período
- [x] Backend: adicionar dataInicio/dataFim na procedure listarColaboradoresMensal e na query getListaColaboradoresMensal
- [x] Frontend: passar dataInicio/dataFim dos filtros aplicados para a query de colaboradores, mostrando apenas quem tem vendas no período

## KPIs do Período filtrados por colaborador
- [x] Backend: atualizar procedure kpisPeriodoMensal para aceitar colaboradorId e filtrar os dados
- [x] Backend: atualizar getKpisRealtimeByRange para aceitar e aplicar colaboradorId em todas as queries SQL
- [x] Frontend: passar colaboradorId dos filtros aplicados para a query kpisPeriodoMensal

## Indicador Visual de Colaborador no Cabeçalho
- [x] Exibir badge com nome do colaborador selecionado no cabeçalho da página Mensal
- [x] Badge deve ter botão de remover (×) para limpar o filtro rapidamente

## Painel de Clientes (Data VIP)
- [x] Backend: query KPIs gerais (total clientes, novos, novos que retornaram, atendimentos, ticket médio, valor total, retenção 30d)
- [x] Backend: query distribuição por status (Assíduo, Regular, Espaçando, 1ª Vez, Em Risco, Perdido)
- [x] Backend: query evolução mensal (clientes únicos + novos por mês)
- [x] Backend: query distribuição por frequência de visitas (1x, 2x, 3-4x, 5-9x, 10-12x, 13-15x, 16-20x, 21-30x, 30+)
- [x] Backend: query distribuição por dias sem vir (≤20d, 21-30d, 31-45d, 46-75d, >75d)
- [x] Backend: query composição por status (barras proporcionais)
- [x] Backend: query Top 10 clientes por valor (nome, status, visitas, valor total, dias sem vir)
- [x] Frontend: seletor de período (mês/ano início e fim, padrão últimos 12 meses)
- [x] Frontend: cards KPIs no topo
- [x] Frontend: cards de distribuição por status (Assíduo, Regular, Espaçando, 1ª Vez, Em Risco, Perdido)
- [x] Frontend: barra de status da carteira (proporções coloridas)
- [x] Frontend: gráfico evolução mensal (barras clientes únicos + linha novos)
- [x] Frontend: barra de distribuição por frequência de visitas
- [x] Frontend: composição por status (barras horizontais proporcionais)
- [x] Frontend: barra de distribuição por dias sem vir
- [x] Frontend: tabela Top 10 clientes por valor
- [x] Corrigir procedure clientes (query usava colunas visitas/consumo inexistentes na tabela)

## Melhorias Painel de Clientes (3 itens)
- [x] Backend: query clientesChurnRisco (lista Em Risco e Perdidos com filtros: colaborador, dias sem vir, valor)
- [x] Backend: query clientesTopExpandido (Top 50/100 com paginação, busca por nome, exportação CSV)
- [x] Backend: adicionar colaboradorId em todas as procedures de clientes (kpis, status, evolução, frequência, dias, top)
- [x] Backend: query listarColaboradoresClientes para popular seletor de colaborador
- [x] Frontend: aba "Churn & Risco" com tabela filtrada por status Em Risco/Perdido, colaborador e dias sem vir
- [x] Frontend: aba "Top Clientes" com tabela expandida (50/100), paginação, busca e botão exportar CSV
- [x] Frontend: seletor de colaborador no painel de filtros da ClientesPage
- [x] Frontend: todos os indicadores respondem ao colaborador selecionado

## Painel Lateral de Detalhes do Cliente
- [x] Backend: query getClienteDetalhes (info do cliente, KPIs, histórico de visitas, serviços mais consumidos, evolução de gasto mensal)
- [x] Frontend: Sheet/Drawer lateral que abre ao clicar no nome do cliente nas tabelas Churn & Risco e Top Clientes
- [x] Frontend: seção de KPIs do cliente (total visitas, valor total, ticket médio, dias sem vir, status)
- [x] Frontend: mini-gráfico de evolução de gasto mensal
- [x] Frontend: lista de últimas visitas com data, serviços e valor
- [x] Frontend: serviços mais consumidos (top 5)

## Botão WhatsApp no Painel Lateral de Detalhes do Cliente
- [x] Verificar se tabela clientes tem campo telefone no banco externo (campo c.telefone existe)
- [x] Adicionar telefone na query getClienteDetalhes e no objeto de retorno
- [x] Frontend: botão "WhatsApp" verde no cabeçalho do drawer (visível apenas quando telefone existe)
- [x] Frontend: exibir número do telefone abaixo do nome no drawer
- [x] Frontend: modal de envio com campo de mensagem personalizada e número do cliente
- [x] Frontend: botão "Abrir WhatsApp" abre link wa.me com mensagem pré-preenchida

## Melhorias WhatsApp Painel de Clientes
- [ ] Backend: tabela cliente_contatos (clienteId, orgId, unitId, mensagem, criadoEm)
- [ ] Backend: procedure registrarContato (salva contato feito via WhatsApp)
- [ ] Backend: procedure buscarUltimoContato (retorna data do último contato por clienteId)
- [ ] Backend: clienteDetalhes retorna ultimoContato
- [ ] Backend: clientesChurnRisco retorna ultimoContato de cada cliente
- [ ] Frontend: templates de mensagem no modal WhatsApp (3 atalhos: sentimos falta, promoção, agendamento)
- [ ] Frontend: ao clicar "Abrir WhatsApp" registrar contato no banco automaticamente
- [ ] Frontend: badge "Contatado" na tabela Churn & Risco para clientes já contatados
- [ ] Frontend: checkbox de seleção múltipla na tabela Churn & Risco
- [ ] Frontend: botão "Contatar selecionados" com modal de envio em massa

## Ajuste Limiar Em Risco (Abr/2026)
- [x] Investigar limiares: testado 46-60d (134 em risco) e 46-90d (263 em risco) vs ref 425 — mantido 46-90d como mais próximo da referência
- [x] Ativos ajustados para ≤45d (era ≤60d) — label atualizado no frontend
- [x] Labels Churn e Cadência atualizados para refletir limiares corretos (46-90d, >90d)

## InfoPopover — Saúde da Base (Abr/2026)
- [x] Backend: retornar metadados de contexto (periodo, ref, base, regra) no endpoint raioX.visaoGeral
- [x] Frontend: componente InfoPopover reutilizável (ícone ?, popover com contexto)
- [x] Frontend: botão InfoPopover em "Em Risco" com regra 46d ≤ dias_sem_vir ≤ 90d
- [x] Frontend: botão InfoPopover em "Perdidos" com regra dias_sem_vir > 90d
- [x] Frontend: botão InfoPopover em "One-shot risco" com regra visitas=1 E 46d ≤ dias_sem_vir ≤ 90d
- [x] Frontend: botão InfoPopover em "One-shot perdido" com regra visitas=1 E dias_sem_vir > 90d

## InfoPopover — Distribuições da Base (Abr/2026)
- [x] Backend: retornar contexto para Por Perfil (universo, regras Fiel/Recorrente/Regular/Ocasional/One-shot)
- [x] Backend: retornar contexto para Por Cadência (universo recorrentes ≥2 visitas, regras por dias sem vir)
- [x] Backend: retornar contexto para Status 12m (universo base S, regras ≤45d/46-90d/>90d)
- [x] Backend: retornar contexto para One-Shot (universo 1ª visita única, regras Aguardando/Em risco/Perdido)
- [x] Frontend: InfoPopover em "Por Perfil" com regras Fiel ≥12v ≤45d, Recorrente ≥6v ≤60d, Regular ≥3v ≤90d
- [x] Frontend: InfoPopover em "Por Cadência" com regras por dias sem vir (recorrentes, REF dataFim)
- [x] Frontend: InfoPopover em "Status 12m" com regras ≤45d/46-90d/>90d e nota sobre "Perdido por recência"
- [x] Frontend: InfoPopover em "One-Shot" com regras Aguardando ≤45d, Em risco 46-90d, Perdido >90d

## Ajuste Base de Cálculo — MAX(vendas.data_criacao) (Abr/2026)
- [x] Reescrever subquery baseS12m para usar MAX(vendas.data_criacao) por cliente/unidade em vez de clientes.ultima_visita
- [x] Reescrever cálculo de dias_sem_vir para usar DATEDIFF(dataFim, ultima_venda) em vez de DATEDIFF(NOW(), c.ultima_visita)
- [x] Ajustar todas as queries dependentes: Por Cadência, Status 12m, One-Shot, Cadência Individual, Risco Mensal, Saúde por Barbeiro
- [x] Validado: universo subiu de 1.659 para 1.748 (ref: 1.738, dif. +10). One-shots acertaram exatamente (44 e 232). Mantido DATEDIFF(dataFim, ultima_venda) como logica correta.

## Cadência Individual — Lógica de Ratio (Abr/2026)
- [x] Investigado: 6 configurações testadas. Configuração final: universo base P 24m + >=2 visitas históricas + cadência habitual histórica completa
- [x] Validado: universo 1.896 (ref: 2.576). Divergencia estrutural documentada no InfoPopover.
- [x] Backend: aplicar configuração final na query de Cadência Individual (universo 24m, >=2 hist, cadência hist completa)
- [x] Frontend: atualizar labels dos 6 status e InfoPopover com lógica documentada

## Correção Sinais da Base (Abr/2026)
- [ ] Investigar divergência: Ativos mostrando "60D" em vez de "45d", Perdidos divergindo
- [ ] Corrigir query de Ativos para usar <=45d (não <=60d)
- [ ] Corrigir labels no frontend (Ativos ≤45d, não 60d)
- [ ] Validar números contra referência

## Ajuste Limiar Ativos 60d (Abr/2026)
- [ ] Validar que limiar <=60d para Ativos produz 767 (ref) vs 557 atual
- [ ] Backend: ajustar limiar Ativos de <=45d para <=60d em raioX.ts (sinais, status12m, saude barbeiro)
- [ ] Frontend: atualizar label "Ativos (<=45d)" para "Ativos (<=60d)" e InfoPopovers

## Melhorias Cohort (Filtro de Colaborador)
- [x] Cohort: filtrar cohort histórico (grid M+1…M+6) pelo colaboradorId selecionado
- [x] Cohort: badge visual na aba "Cohort" quando filtro de colaborador estiver ativo
- [x] Cohort: modo de comparação lado a lado de dois colaboradores nos KPIs

## Cohort Histórico — Comparação Lado a Lado
- [x] Cohort Histórico: exibir linhas de A e B sobrepostas na grade M+1…M+6 quando modo comparação ativo

## Aba Diagnóstico — Raio X Clientes

- [ ] Endpoint raioX.diagnostico com KPIs de qualidade de dados e saúde da base
- [ ] UI: cards de KPIs (total clientes, sem telefone, sem cadastro, etc.)
- [ ] UI: gráficos e tabelas de diagnóstico da base de clientes

## Diagnóstico — Correções (2026-04-07)

- [x] Corrigir dados ausentes: freq. média, telefone, atendimentos sem cadastro, saúde da base
- [x] Corrigir atendimentos sem cadastro: mostrar tabela com cadastrados vs sem cadastro
- [x] Remover card "Sem Nome" do diagnóstico
- [x] Corrigir distribuições: visitas, ausência, horários de pico, dias da semana
- [x] Corrigir clientes com/sem telefone (query na tabela clientes)

## Comissões — Correções (2026-04-07)

- [ ] Investigar por que comissões retornam R$ 0,00 (regras não encontradas ou não aplicadas)
- [ ] Corrigir busca de regras de comissão por colaborador/unidade
- [ ] Garantir que todos os colaboradores com venda no período apareçam
- [ ] Exibir comissões calculadas conforme regras cadastradas na aba colaboradores

## Comissões Integradas com Colaboradores (2026-04-07)

- [x] Verificar estrutura da tabela dimensao_colaboradores e como comissão de serviços está cadastrada
- [x] Adicionar campo pct_comissao_produtos na tabela de colaboradores (schema + migration)
- [x] Adicionar campo de comissão de produtos na UI da aba Colaboradores
- [x] Corrigir endpoint comissoes para buscar percentuais da tabela de colaboradores (serviços e produtos)
- [x] Redesenhar UI da página Comissões com cards por colaborador (S.Base, S.Extra, Produtos)

## Comissões — Correção Breakdown (2026-04-07)

- [x] Investigar por que extra_valor e produtos_valor chegam zerados no endpoint comissoes
- [x] Corrigir query para separar corretamente S.Base, S.Extra e Produtos

## Comissões — Fix Malformed packet (2026-04-07)

- [x] Corrigir erro "Malformed communication packet" na query getColaboradoresComissoes (parâmetros SQL inválidos)

## Data VIP — Menu Lateral (2026-04-07)

- [x] Agrupar Colaboradores, Comissões, Metas, Serviços sob título "Gestão de Colaboradores" com espaçamento
- [x] Remover Relatórios, Sincronização e Administração do menu lateral do Data VIP

## Instagram — Bug Configurações (2026-04-07)

- [x] Corrigir salvamento de configurações do Instagram por unidade (dados não persistem)
- [x] Corrigir getModuleConfigs para retornar apenas o registro mais recente por módulo (deduplicar)
- [x] Corrigir upsertModuleConfig para fazer UPDATE quando já existe (não INSERT duplicado)

## Auto Instagram — Status "Não Configurado" (2026-04-07)

- [x] Investigar por que Auto Instagram aparece "não configurado" mesmo com credencial salva
- [x] Corrigir: saveModuleConfig agora sincroniza igConfig (tabela usada pelo bot) ao salvar auto_instagram
- [x] Adicionar botão "Testar Conexão" na página de Configurações com feedback visual de erro/sucesso

## Instagram — Token Inválido (2026-04-07)

- [x] Verificar token salvo no banco: token IGAA (curta duração) ao invés de EAA (longa duração)
- [x] Melhorar testConnection: detecta token IGAA com instruções claras, limpa aspas extras, mensagens de erro enriquecidas

## Metas Progressivas por Faixas (2026-04-07)

- [x] Criar tabela meta_faixas no banco (unitId, faixaMinServicos, pctComissao, pctBonus, ordem)
- [x] Criar endpoints tRPC: metaFaixasList, metaFaixaSave, metaFaixasSaveAll, metaFaixaDelete
- [x] Redesenhar UI da página Metas com tabela editável de faixas + simulador de ganhos
- [x] Integrar cálculo de meta na página Comissões (faixa atingida, próxima faixa e comissão efetiva)

## Metas — Bug toFixed (2026-04-07)

- [x] Corrigir TypeError: v.toFixed is not a function no FaixasComissaoTab (valores numéricos chegam como string do banco)

## Comissões — Bônus de Meta (2026-04-07)

- [x] Atualizar endpoint comissoes para buscar faixas de meta e calcular bônus por colaborador
- [x] Lógica: faturamento total (serviços + produtos) determina a faixa atingida; bônus = (pctFaixa - pctBase) * valorServicos
- [x] Atualizar UI da página Comissões para exibir linha de Bônus Meta e Total Comissão com bônus incluído

## Meta Dinâmica (2026-04-07)

- [x] Criar tabela metas_dinamicas (id, orgId, unitId, nome, tipo: produto|servicos_multiplos, mesEspecifico, ativo)
- [x] Criar endpoints tRPC: metaDinamicaList, metaDinamicaSave, metaDinamicaDelete, metaDinamicaCalc
- [x] Redesenhar aba "Meta Dinâmica" na página Metas com UI de criação de regras (formulário completo com tipo, config, bônus, vigência)
- [x] Integrar bônus de meta dinâmica na aba Comissões (badges verdes por meta batida, total incluindo bônus dinâmico)

## Metas — Simplificação (2026-04-07)

- [x] Remover aba "Metas de Faturamento" da página Metas (manter apenas Meta Dinâmica e Comissão Progressiva)

## Meta Dinâmica — Critério por Quantidade (2026-04-07)

- [x] Adicionar seletor "Critério: Valor (R$) ou Quantidade de produtos" no tipo Produto da Meta Dinâmica
- [x] Atualizar UI do card de meta para exibir o critério correto (valor ou qtd)
- [x] Atualizar endpoint metaDinamicaCalc para calcular por quantidade de produtos vendidos

## Bug — metaDinamicaCalc (2026-04-07)

- [x] Corrigir erro "Table 'franquia_producao.comandas' doesn't exist" no metaDinamicaCalc — reescrito com schema real: vendas, vendas_produtos, usuarios, produtos

## Bug — metaDinamicaCalc Malformed packet (2026-04-07)

- [x] Corrigir "Malformed communication packet" no metaDinamicaCalc — datas convertidas para strings ISO (YYYY-MM-DD) antes de passar ao queryExternal

## Aba Produtos na Data VIP (2026-04-07)

- [x] Criar tabela produto_categorias (orgId, nomeProduto, categoria: cabelo|barba|outros)
- [x] Criar endpoints tRPC: dataVip.listProdutosExterno e dataVip.saveProdutoCategorias
- [x] Criar ProdutosPage com listagem, busca, classificação por tipo e editor de categoria (clique para alternar Cabelo → Barba → Outros)
- [x] Adicionar botão de exportar CSV dos produtos com categoria
- [x] Registrar rota /data-vip/produtos e link de navegação abaixo de Serviços

## Loading padronizado Data VIP (2026-04-07)

- [x] Componente DataVipLoadingState já existia e foi reutilizado
- [x] Aplicar loading padronizado em todas as páginas Data VIP que consultam banco externo (ColaboradoresPage, ClientesPage, ComissoesPage, ServicosPage, ProdutosPage, RankingPage, RelatoriosPage, MetasPage, CalendarioPage, AdministracaoPage, SincronizacaoPage)

## Bug — Loading Raio-X Clientes (2026-04-07)

- [x] Adicionar banner de loading padronizado na aba Visão Geral do Raio-X de Clientes — substituído skeleton genérico pelo DataVipLoadingState

## Bug — Loading Faturamento e Mensal (2026-04-07)

- [x] Adicionar banner de loading padronizado na aba Faturamento — agora exibe DataVipLoadingState durante isLoading inicial e timeout
- [x] Adicionar banner de loading padronizado na aba Mensal — adicionado banner após FiltrosPanel

## Redesign Visual Completo (2026-04-07)

- [x] Novo design system: CSS variables OKLCH grafite+âmbar, glassmorphism, gradientes (index.css)
- [x] AppLayout e sidebar modernizados com glassmorphism, accent dourado, nav premium
- [x] Dashboard principal: cards KPI com gradiente e glassmorphism
- [x] Data VIP Faturamento: cards ResumoCard, tabela comparativa e seções modernizados
- [x] Data VIP Mensal: KpiCard, tooltip e gráficos com gradiente âmbar
- [x] AberturasChart: tooltip glass, barras com gradiente, grid sutil, cores OKLCH
- [x] DataVipDashboard: tooltip glass, PAG_COLORS modernizados

## Redesign Páginas Restantes Data VIP (2026-04-08)

- [x] Modernizar ComissoesPage com glassmorphism e gradientes
- [x] Modernizar MetasPage com glassmorphism e gradientes
- [x] Modernizar ColaboradoresPage com glassmorphism e gradientes
- [x] Modernizar ProdutosPage com glassmorphism e gradientes
- [x] Modernizar ServicosPage com glassmorphism e gradientes
- [x] Modernizar ClientesPage com glassmorphism e gradientes
- [x] Modernizar RaioXPage (todas as abas) com glassmorphism e gradientes
- [x] Modernizar RankingPage com glassmorphism e gradientes
- [x] Modernizar RelatoriosPage com glassmorphism e gradientes
- [x] Modernizar CalendarioPage com glassmorphism e gradientes

## Redesign Módulos Restantes (2026-04-08)

- [x] Modernizar Gestão Total (todas as páginas) com glassmorphism e gradientes âmbar
- [x] Modernizar VIP Cam com glassmorphism e gradientes âmbar
- [x] Modernizar Reputação com glassmorphism e gradientes âmbar
- [x] Modernizar Auto Instagram com glassmorphism e gradientes âmbar
- [x] Modernizar We Send WhatsApp com glassmorphism e gradientes âmbar

## Micro-animações de Entrada (2026-04-08)

- [x] Definir keyframes vip-fade-up, vip-fade-in, vip-scale-in, vip-slide-right no index.css
- [x] glass-card tem animação vip-fade-up embutida por padrão (todas as páginas)
- [x] Aplicar animate-fade-in nos wrappers principais de 32 páginas do sistema
- [x] Classes utilitárias delay-50 a delay-400 para grids escalonados

## Fonte Premium Geist (2026-04-08)

- [x] Carregar Geist via Google Fonts CDN no index.html (junto com Inter)
- [x] Definir --font-display: 'Geist' no @theme do design system
- [x] Aplicar font-display em h1/h2 de 43 páginas e componentes via script
- [x] Aplicar font-display no KpiCard do Dashboard (valores estatísticos)
- [x] Aplicar font-display no branding "VIP Suite" do AppLayout
- [x] Aplicar font-display no PageHeader (todos os títulos de página)
- [x] Configurar font-feature-settings para ligatures e alternates do Geist

## Modernização de Gráficos Recharts (2026-04-08)

- [x] Substituir CORES object no RaioXPage para padrão OKLCH âmbar
- [x] Modernizar 9 gráficos do RaioXPage com tooltip glass (backdrop-filter, box-shadow)
- [x] Adicionar gradientes defs no AreaChart de evolução por status (5 gradientes empilhados)
- [x] Adicionar gradientes defs no AreaChart de churn mensal (2 gradientes)
- [x] Modernizar BarChart e RadarChart do IndicadoresPage (Gestão Total)
- [x] Adicionar gradiente âmbar no BarChart de atingimento de indicadores
- [x] Adicionar radialGradient no RadarChart de performance
- [x] Modernizar tooltips do AutoInstagramPage, DataVipPage e DataVipDashboard
- [x] Modernizar AreaChart de evolução de gasto do ClientesPage
- [x] Remover axisLine/tickLine dos eixos para visual mais limpo
- [x] TypeScript 0 erros após todas as modificações

## Modernização de Gráficos Recharts (2026-04-08)
- [x] Substituir CORES object no RaioXPage para padrão OKLCH âmbar
- [x] Modernizar 9 gráficos do RaioXPage com tooltip glass
- [x] Gradientes defs no AreaChart de evolução por status (5 gradientes)
- [x] Gradientes defs no AreaChart de churn mensal
- [x] Modernizar BarChart e RadarChart do IndicadoresPage
- [x] Gradiente âmbar no BarChart + radialGradient no RadarChart
- [x] Modernizar tooltips do AutoInstagramPage, DataVipPage, DataVipDashboard
- [x] Modernizar AreaChart do ClientesPage
- [x] TypeScript 0 erros

## VIP Cam — Correções de Timezone e KPIs (2026-04-08)
- [x] Corrigir timezone Brasil (UTC-3) no getDashboard e saveCapture
- [x] Mudar "Detecções Hoje" para "Clientes no Mês" (contagem de camClientes por mês)
- [x] Mudar "Taxa de Satisfação" para calcular por clientes do mês (não detecções do dia)
- [x] Mudar "Clientes Únicos" para "Clientes no Mês" (lastSeenAt dentro do mês atual)
- [x] Manter "Novos HOJE" com data correta do Brasil
- [x] Adicionar procedure getMonthStats no router vipCam
- [x] Atualizar VipCamPage para usar novos KPIs mensais
- [x] Incluir dia atual no gráfico de tendência do Dashboard
- [x] Gráfico de tendência do Dashboard: incluir dia atual
- [x] Gráfico de tendência do Dashboard: usar camClientes (clientes reais) em vez de camMetricasDiarias
- [x] 1º card VIP Cam: mudar para total de detecções do mês (camMetricasDiarias)
- [x] Métricas VIP Cam: satisfação/satisfeitos/neutros/insatisfeitos por base de clientes
- [x] Métricas VIP Cam: adicionar neutros nos totais
- [x] Métricas VIP Cam: manter total de detecções do histórico

## Dashboard Principal — Modernização de Cards (2026-04-08)
- [x] VIP Cam card: gráfico de distribuição do período selecionado
- [x] Reputação card: NPS + nota Google + pendentes de resposta (histórico)
- [x] Gestão Total card: tarefas pendentes, reuniões hoje, faturamento, despesas, resultado (período)
- [x] Visual dos cards: mais moderno e impactante
- [x] Card Reputação Dashboard: remover NPS, manter apenas nota Google + pendentes
- [x] Card Auto Instagram Dashboard: mostrar comentários respondidos e stories respondidos separadamente
- [x] Corrigir card Auto Instagram: dados não aparecem mesmo com bot rodando
- [x] VIP Cam aba Detecções por Hora: gráfico de linha premium com clientes únicos, KPIs do dia, todas as 24h
- [x] Tema claro: menu superior e lateral mudar de cor

## Tema Claro (Light Mode)
- [x] ThemeProvider e useTheme hook criados com persistência em localStorage
- [x] Botão Sol/Lua adicionado no header
- [x] Variáveis CSS para tema claro definidas no index.css
- [x] Hook useChartTheme criado para gráficos Recharts
- [x] AppLayout.tsx atualizado — sidebar e header respondem ao tema
- [x] glass-card e kpi-card atualizados no CSS para tema claro
- [x] Transição suave 0.3s ease em body, glass-card, kpi-card, header e sidebar
- [x] Sincronizar tema com prefers-color-scheme do SO (localStorage como override manual, ponto âmbar no botão quando seguindo o sistema)

## Auditoria Tema Claro
- [x] Auditoria de contraste no tema claro — corrigidos boxes escuros hardcoded em DashboardPage, MensalPage, FaturamentoPage, DataVipPage, DataVipDashboard, ColaboradoresPage, ProdutosPage, ServicosPage, CamRelatoriosPage, AppLayout, chart.tsx

## Seletores de Data
- [x] Criar componente DatePicker reutilizável (Popover + Calendar)
- [x] Substituir todos os inputs type="date" por DatePicker em todo o sistema (14 arquivos, 25 campos)

## Data VIP Dashboard
- [x] Seleção de período no DataVipDashboard já existia — confirmado: botão Abr 2026 no header abre popover com atalhos rápidos, lista de 24 meses e calendário de range personalizado

## Correção Seletor de Período Data VIP
- [x] Reorganizar popover do DateRangePicker: calendário de 2 meses em destaque no topo, atalhos e meses em painel inferior

## Auditoria de Dados Data VIP (Joinville como referência)
- [x] Corrigir faturamento: substituir status != 0 por status = 1 em todas as queries (69+ ocorrências em dataVipQueries.ts, dataVip.ts, raioX.ts, dashboard.ts, vipDataSync.ts) — exclui comandas em aberto (status=2) e mantém apenas fechadas/pagas (status=1)

## Seletor de Período Compacto (Data VIP Dashboard)
- [x] Compactar DateRangePicker: 1 mês de calendário no topo + atalhos em linha + lista de meses, largura fixa 300px

## Performance Raio-X
- [ ] Diagnosticar e otimizar lentidão no carregamento do Raio-X (queries do servidor externo)

## Performance Raio-X
- [x] Diagnosticar e otimizar lentidão no carregamento do Raio-X
  - [x] Cache em memória 10min para visaoGeral, churn, cohort e barbeiros
  - [x] Paralelizar loops sequenciais de 12 meses (cadencia + churn) com Promise.all
  - [x] Resultado: 12 queries sequenciais → 12 queries paralelas (redução ~10x no tempo dos loops)

## Bug: Timeout no Raio-X ao mudar período
- [ ] Investigar timeout "Tentativa 3 de 3" no Raio-X ao mudar período — query visaoGeral trava sem carregar

## Cache Persistente Raio-X (Joinville primeiro, depois demais unidades)
- [ ] Criar tabelas no banco interno para cache de dados históricos do Raio-X por unidade
- [ ] Criar job noturno que sincroniza dados históricos do banco externo para o banco interno
- [ ] Atualizar router do Raio-X para usar cache interno (dados históricos) + banco externo (semana atual)

- [x] Bug corrigido: query raio_x_cache_sync_log usava campos inexistentes (startedAt/finishedAt/mesesSynced) → corrigido para createdAt/status/duracaoMs
- [x] Corrigir lógica de routing: Só 1 barbeiro, Multi-barbeiro e Média barb/cliente devem usar barbeiros distintos NO PERÍODO (não histórico total)
- [x] Corrigir cache persistente Raio-X: dados históricos devem ser servidos EXCLUSIVAMENTE do cache local, sem disparar queries SSH
- [x] Gestão Total - Marketing: corrigir seletor de colaboradores na destinação de campanha (não consegue selecionar colaborador cadastrado) e criar tarefa para o colaborador selecionado
- [x] Marketing - Adicionar aba 'Gerador de Conteúdo' no menu de Marketing (estrutura pronta para lógica futura)
- [x] Marketing - Adicionar aba 'Criação de Arte' no menu de Marketing (estrutura pronta para lógica futura)
- [x] Marketing - Gerador de Conteúdo: wizard 6 telas (objetivo, formato, entrega, público, diferencial, tom)
- [x] Marketing - Gerador de Conteúdo: procedure tRPC com prompt mestre Barbearia VIP
- [x] Marketing - Gerador de Conteúdo: exibir 3 ideias geradas com roteiro, legenda e CTA
- [x] Marketing - Gerador de Conteúdo: tabela gt_content_history no schema e migração
- [x] Marketing - Gerador de Conteúdo: procedures tRPC saveContent e listContentHistory
- [x] Marketing - Gerador de Conteúdo: painel de histórico com visualização e reutilização
- [x] Marketing - Criação de Arte: tabela gt_art_history no schema e migração
- [x] Marketing - Criação de Arte: procedure tRPC generateArt com prompt mestre VIP
- [x] Marketing - Criação de Arte: wizard de 7 telas ArtGeneratorWizard no frontend
- [x] Marketing - Criação de Arte: geração de imagem via IA (nano banana) e exibição do resultado
- [x] Marketing - Criação de Arte: histórico de artes geradas
- [x] Criação de Arte: endpoint /api/upload-art-image para upload de imagem de referência para S3
- [x] Criação de Arte: painel ArtHistoryPanel com miniaturas, favoritos e reutilizar
- [x] Criação de Arte: botão de download na miniatura (ArtHistoryPanel) e no resultado expandido (ArtGeneratorWizard)
- [ ] Criação de Arte: botão "Gerar Flyer" no resultado usando imagem + estrutura de layout editável
- [ ] Criação de Arte: campos editáveis na estrutura de layout (Topo, Centro, Rodapé) antes de gerar flyer
- [ ] Configurações: upload de logo global da Barbearia VIP (disponível para todas as unidades)
- [ ] Configurações: banco de imagens global (upload de múltiplas imagens de referência para todas as unidades)
- [x] Configurações: suporte a múltiplas logos (até 4 versões) com nome e descrição
- [x] Criação de Arte: flyer sempre usa logo salva nas Configurações (gt_brand_assets) como referência obrigatória — nunca cria logo nova
- [x] Dashboard: substituir mensagem 'Sem dados no período / Sincronizar Data VIP' por estado visual amigável de sincronização (ícone animado, pulse, texto 'Aguardando dados' / 'Sincronizando dados…' com última sync)
- [x] Gestão Total: remover Problemas, Oportunidades, Riscos e Compras do menu lateral
- [x] Gestão Total: reordenar menu lateral — Financeiro sobe para antes de Indicadores
- [x] Financeiro: despesas recorrentes — campo no formulário, geração automática mensal e aba Recorrentes
- [x] Financeiro: corrigir toggle 'Vencimento recorrente' que não responde ao clique no formulário
- [x] Financeiro: toggle vencimento recorrente ainda não funciona — substituir Switch por botão nativo
- [x] Dashboard: ajustar queries de faturamento para usar sync_vendas_produtos.valor_total (alinhamento com sistema de origem)
- [x] Data VIP: corrigir cores hardcoded do box Aberturas para o tema claro (bg-card, border-border, axisColor, gridStroke, text semântico)
- [x] Sincronização completa de abril/2026 para todas as 31 unidades
- [x] Correção do upsertBatch para processar em lotes de 200 (evitar too many placeholders)
- [x] Dashboard/Data VIP: padronizar faturamento para usar sync_vendas.valor_total (valor real cobrado) em todas as queries
- [x] Data VIP: padronizar todas as queries de faturamento para usar sync_vendas.valor_total
- [x] Gestão Total: alinhar syncGtFinanceiro para usar sync_vendas.valor_total como padrão (igual Data VIP)
- [x] Marketing: adicionar sufixos de qualidade técnica nos prompts de geração de imagem (Nano Banana)
- [ ] Marketing/Criação de Arte: remover Story e Carrossel da tela 2 (formato)
- [ ] Marketing/Criação de Arte: remover "Livre" da tela 4 (tema visual)
- [ ] Marketing/Criação de Arte: remover "Sugestões de banco externo" da tela 7 (imagem)
- [ ] Marketing/Criação de Arte: remover URL/endereço do site do rodapé da imagem gerada
- [ ] Marketing/Criação de Arte: melhorar prompt final para menos texto e sem erros ortográficos
- [ ] Marketing/Criação de Arte: imagem do banco VIP deve ocupar toda a arte (full-bleed), não apenas o centro
- [ ] Marketing/Criação de Arte: quando imagem for do banco VIP, apenas melhorar qualidade sem adicionar novos elementos

## Correções e Melhorias (Abril 2026)

- [x] Raio-X: corrigido para sysUser (query lenta mas funcional — dados reais carregados)
- [x] Todos os módulos verificados para sysUser joao@barbeariavip.com.br: Data VIP, Gestão Total, VIP Cam, Reputação, Auto Instagram, We Send — todos funcionando
- [x] Seletor de unidade: implementado modo somente leitura para sysUser com apenas 1 unidade vinculada (para sysUser com múltiplas unidades, dropdown permanece disponível)
- [x] Sidebar do sysUser: itens restritos (Unidades, Usuários do Sistema, Perfis de Acesso) ocultos corretamente

## Bug: Sincronização Data VIP não está funcionando

- [x] Diagnosticar por que o status aparece como "sincronizado" mas os dados não chegam
- [x] Verificar credenciais de API por unidade (orgApiKey, orgApiUrl) — todas configuradas
- [x] Verificar logs do scheduler automático (08:00 BRT + 4h) — funcionando
- [x] Verificar se a chamada à API externa está sendo feita corretamente — OK (túnel SSH + API REST)
- [x] Verificar se os dados estão sendo persistidos no banco — 3M+ registros, última sync hoje
- [x] Corrigir valor_liquido → valor_total nas metas (bug menor)
- [x] Limpar 26 registros running presos no sync_log
- [x] Adicionar limpeza automática de running presos ao reiniciar servidor

## Bug: Erro "Unexpected token '<'" na página /data-vip/sync

- [x] Identificar qual mutation tRPC está retornando HTML em vez de JSON — sync.syncNow com timeout 504
- [x] Converter syncNow para fire-and-forget com polling de syncNowStatus
- [x] Atualizar SyncPage.tsx para polling + progresso (X/Y unidades)

## Melhoria: Instagram — Histórico de Respostas

- [x] Analisar estrutura atual do módulo Instagram (fila de aprovação, tabelas, router)
- [x] Verificar se tabela de histórico de respostas já existe — ig_approval_queue já tem todos os campos
- [x] Remover componente de fila de aprovação do frontend
- [x] Criar componente de histórico de respostas (autor, comentário, resposta, status, data)
- [x] Adicionar procedure getHistory no igApprovalRouter (filtra approved + auto_approved)
- [x] Atualizar label do menu de "Fila de Aprovação" para "Histórico de Respostas"
- [x] Testar exibição do histórico no frontend — OK (estado vazio correto, busca funcional, paginação)

## Correção: Instagram — Acesso Rápido e Migração de Logs

- [x] Corrigir label "Fila de Aprovação" para "Histórico de Respostas" no acesso rápido (AutoInstagramPage.tsx)
- [x] Analisar estrutura da tabela ig_activity_logs (comment_reply) para migrar dados
- [x] Migrar 8 respostas dos logs para ig_approval_queue com status auto_approved
- [x] Substituir card "Aguardando Aprovação" por "Respostas Enviadas" com link para histórico

## Melhoria: Instagram — Texto Completo dos Comentários

- [x] Diagnosticar origem do truncamento — era no log de atividade (substring 60 chars), não no ig_approval_queue
- [x] Corrigir igScheduler.ts para salvar texto completo no log de atividade (remover .substring(0,60))
- [x] Atualizar 8 registros existentes com texto completo via Meta Graph API (0 falhas)

## Feature: Instagram — Comentários Sem Resposta

- [x] Procedure getUnreplied: busca posts do período, lista comentários, verifica respostas no IG e no banco local
- [x] Procedure replyWithAI: gera resposta via LLM com prompt do sistema, envia via Meta Graph API, registra no banco
- [x] Procedure generatePreview: pré-visualização da resposta antes de enviar
- [x] Criar ComentariosSemRespostaPage.tsx: seletor de período, atalhos (7/30/90 dias), lista separada (sem resposta / já respondidos no IG), botão "Responder com IA", preview editável, botão regerar
- [x] Registrar rota /auto-instagram/sem-resposta no App.tsx
- [x] Adicionar item "Sem Resposta" ao menu lateral do Instagram
- [x] Testar página no browser — OK (UI carregou, seletor de período funcional)

## Correção: Botão "Configurações" no rodapé do AppLayout

- [x] Ocultar botão "Configurações" (chaves de API) para perfis não-master e não-administrador (gestor de unidade não deve ver) — condicionado a userRole === "master" || userRole === "org_admin"

## Correção: Espaçamento no topo das páginas VIP Cam e Reputação

- [x] VIP Cam: adicionado p-6 no container externo (loading e main return)
- [x] Reputação: adicionado p-6 no container externo

## Feature: Integração Raio-X → We Send (Campanhas)

- [x] Verificar se sync_clientes tem campo de telefone — confirmado, 5.556 clientes com telefone_sem_mascara
- [x] Garantir que o syncEngine popula telefone dos clientes — já populado
- [x] Criar procedure raioX.createCampaignFromSegment (perdidos >90d, em_risco 61-90d, one_shot_urgente >=46d)
- [x] Adicionar botão "Enviar para campanha" nos cards Perdidos, Em Risco e One-Shot Urgente do Raio-X
- [x] Modal com nome pré-preenchido (ex: "Clientes Perdidos — 14/04/2026"), mensagem com {nome}, info de contatos
- [x] Campanha criada como rascunho no We Send com contatos pré-carregados, redirect para /we-send/campanhas
- [x] Apenas contatos da unidade ativa incluídos (filtro por unitId na query)
- [x] Testado no browser — OK (1.568 contatos Perdidos, modal funcional)

## Feature: We Send — Carregar Campanha do Raio-X no Wizard

- [x] Adicionar procedure weSend.getDraftCampanhas para listar campanhas rascunho da unidade
- [x] Adicionar procedure weSend.getDraftCampanhaContatos para retornar contatos de uma campanha
- [x] Adicionar botão "Carregar Campanha" no wizard de nova campanha ao lado do "Importar CSV"
- [x] Modal com lista de campanhas rascunho (nome, total contatos, data de criação, badge "rascunho")
- [x] Ao selecionar, preenche automaticamente nome, mensagem e contatos no wizard
- [x] TypeScript compilou sem erros (0 errors)

## Feature: We Send — Gerar Mensagem com IA no Wizard

- [ ] Procedure weSend.generateCampaignMessage: recebe segmento (perdidos/em_risco/one_shot), nome da barbearia, oferta/promoção, tom (formal/casual) e gera mensagem curta e engajadora
- [ ] Mini-wizard de 3 perguntas: 1) Tem alguma oferta ou promoção? 2) Tom da mensagem (casual/formal)? 3) Algo especial a destacar?
- [ ] Botão "Gerar com IA" no step de mensagem do wizard
- [ ] Mensagem gerada pré-preenche o campo de texto (editável)
- [ ] Botão "Regerar" para gerar nova versão
- [ ] Mensagem adaptada ao segmento: perdidos (reativação), em risco (urgência/incentivo), one-shot (fidelização)

## VIP Cam — Reconhecimento Facial Server-Side para Câmera IP (2026-05-22)

- [x] Validar @vladmandic/face-api + canvas em Node.js com frame real da câmera Dahua (1280x724, 98.2% confiança)
- [x] Criar faceRecognitionService.ts: initFaceRecognition(), detectFaces(), matchFaceDescriptor()
- [x] Integrar loop de detecção automática no ipCameraWorker.ts (a cada 30s, salva no DB sem browser)
- [x] Implementar saveCaptureInternal() no worker (replica lógica do tRPC saveCapture, sem overhead HTTP)
- [x] Adicionar campos de telemetria no worker: lastDetectionAt, lastDetectionCount, totalCapturesSaved
- [x] Atualizar EmotionCamera.tsx: câmera IP usa apenas polling de frames (sem face-api no browser)
- [x] Câmera USB mantida inalterada (face-api.js no browser, comportamento original)
- [x] Badge "Captura automática ativa" e informações do worker na UI da câmera IP
- [x] Testes Vitest: 15 testes passando (matchFaceDescriptor + mapExpressionToSatisfaction)

## VIP Cam — Overlay de Face Boxes (Concluído)

- [x] FaceBox interface exportada no ipCameraWorker.ts com coordenadas e satisfação
- [x] Worker armazena lastDetections[] com boxes de cada face detectada
- [x] Endpoint GET /api/vip-cam/stream/:unitId/detections expõe os boxes
- [x] EmotionCamera.tsx: polling de detecções a cada 5s (câmera IP)
- [x] Canvas overlay absoluto sobre o feed ao vivo com retângulos verde/âmbar/vermelho
- [x] Label com emoji de satisfação e % de confiança em cada box
- [x] Boxes expiram após 60s (worker detecta a cada 30s)
- [x] Câmera USB: comportamento inalterado
