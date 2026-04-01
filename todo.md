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
