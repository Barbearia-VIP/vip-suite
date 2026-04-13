import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─────────────────────────────────────────────
// USERS (base auth)
// ─────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────
// ORGANIZATIONS (franquias / redes)
// ─────────────────────────────────────────────
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 7 }).default("#1a1a2e"),
  segment: varchar("segment", { length: 100 }),
  ownerId: int("ownerId").notNull(), // FK → users.id
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;

// ─────────────────────────────────────────────
// UNITS (unidades / filiais)
// ─────────────────────────────────────────────
export const units = mysqlTable("units", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(), // FK → organizations.id
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  phone: varchar("phone", { length: 20 }),
  externalId: varchar("externalId", { length: 100 }), // ID na API externa
  aiPrompt: text("aiPrompt"), // Prompt personalizado para IA de respostas de avaliações
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Unit = typeof units.$inferSelect;

// ─────────────────────────────────────────────
// USER PROFILES (perfis de acesso por unidade)
// ─────────────────────────────────────────────
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK → users.id
  orgId: int("orgId").notNull(),   // FK → organizations.id
  unitId: int("unitId"),           // NULL = acesso a toda a org
  role: mysqlEnum("role", ["master", "org_admin", "unit_manager", "team_lead", "colaborador"]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_user_profiles_user").on(t.userId),
  index("idx_user_profiles_unit").on(t.unitId),
]);

export type UserProfile = typeof userProfiles.$inferSelect;

// ─────────────────────────────────────────────
// MODULE CONFIGS (chaves de API por unidade)
// ─────────────────────────────────────────────
export const moduleConfigs = mysqlTable("module_configs", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(), // FK → units.id
  module: mysqlEnum("module", [
    "data_vip",
    "gestao_total",
    "vip_cam",
    "reputacao",
    "auto_instagram",
    "we_send",
  ]).notNull(),
  config: json("config").notNull(), // chaves e tokens do módulo
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_module_configs_unit_module").on(t.unitId, t.module),
]);

export type ModuleConfig = typeof moduleConfigs.$inferSelect;

// ─────────────────────────────────────────────
// MODULE ACCESS (quais módulos cada unidade tem acesso)
// ─────────────────────────────────────────────
export const moduleAccess = mysqlTable("module_access", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  module: mysqlEnum("module", [
    "data_vip",
    "gestao_total",
    "vip_cam",
    "reputacao",
    "auto_instagram",
    "we_send",
  ]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// DATA VIP — vendas / faturamento
// ─────────────────────────────────────────────
export const vendas = mysqlTable("vendas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  externalId: varchar("externalId", { length: 100 }),
  clienteNome: varchar("clienteNome", { length: 255 }),
  clienteId: varchar("clienteId", { length: 100 }),
  colaboradorNome: varchar("colaboradorNome", { length: 255 }),
  colaboradorId: varchar("colaboradorId", { length: 100 }),
  valorBruto: decimal("valorBruto", { precision: 10, scale: 2 }),
  valorLiquido: decimal("valorLiquido", { precision: 10, scale: 2 }),
  desconto: decimal("desconto", { precision: 10, scale: 2 }).default("0"),
  servicos: json("servicos"), // lista de serviços da venda
  dataVenda: timestamp("dataVenda").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_vendas_unit_data").on(t.unitId, t.dataVenda),
  index("idx_vendas_colaborador").on(t.colaboradorId),
]);

export type Venda = typeof vendas.$inferSelect;

// ─────────────────────────────────────────────
// DATA VIP — colaboradores
// ─────────────────────────────────────────────
export const colaboradores = mysqlTable("colaboradores", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  externalId: varchar("externalId", { length: 100 }),
  nome: varchar("nome", { length: 255 }).notNull(),
  cargo: varchar("cargo", { length: 100 }),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  dataAdmissao: date("dataAdmissao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_colaboradores_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// DATA VIP — metas
// ─────────────────────────────────────────────
export const metas = mysqlTable("metas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  valorMeta: decimal("valorMeta", { precision: 12, scale: 2 }).notNull(),
  valorRealizado: decimal("valorRealizado", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_metas_unit_periodo").on(t.unitId, t.ano, t.mes),
]);

// ─────────────────────────────────────────────
// DATA VIP — sync log
// ─────────────────────────────────────────────
export const syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId").notNull(),
  modo: mysqlEnum("modo", ["auto", "manual_13m", "historico"]).notNull(),
  dataInicio: date("dataInicio"),
  dataFim: date("dataFim"),
  status: mysqlEnum("status", ["running", "success", "error"]).notNull(),
  fetchedCount: int("fetchedCount").default(0),
  insertedCount: int("insertedCount").default(0),
  durationMs: int("durationMs"),
  erro: text("erro"),
  iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
  finalizadoEm: timestamp("finalizadoEm"),
}, (t) => [
  index("idx_sync_log_unit").on(t.unitId, t.iniciadoEm),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — tarefas
// ─────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  titulo: varchar("titulo", { length: 500 }).notNull(),
  descricao: text("descricao"),
  status: mysqlEnum("status", ["pendente", "em_andamento", "concluida", "cancelada"]).default("pendente").notNull(),
  prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta", "critica"]).default("media").notNull(),
  responsavelId: int("responsavelId"), // FK → users.id
  dataVencimento: timestamp("dataVencimento"),
  concluidaEm: timestamp("concluidaEm"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_tasks_unit_status").on(t.unitId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — indicadores
// ─────────────────────────────────────────────
export const indicadores = mysqlTable("indicadores", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  unidade: varchar("unidade", { length: 50 }),
  meta: decimal("meta", { precision: 12, scale: 2 }),
  valorAtual: decimal("valorAtual", { precision: 12, scale: 2 }),
  periodicidade: mysqlEnum("periodicidade", ["diario", "semanal", "mensal", "trimestral", "anual"]).default("mensal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─────────────────────────────────────────────
// GESTÃO TOTAL — financeiro (contas)
// ─────────────────────────────────────────────
export const financialTransactions = mysqlTable("financial_transactions", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  tipo: mysqlEnum("tipo", ["receita", "despesa"]).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  descricao: varchar("descricao", { length: 500 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataTransacao: date("dataTransacao").notNull(),
  status: mysqlEnum("status", ["pendente", "pago", "cancelado"]).default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_financial_unit_data").on(t.unitId, t.dataTransacao),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — processos
// ─────────────────────────────────────────────
export const processos = mysqlTable("processos", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  responsavel: varchar("responsavel", { length: 255 }),
  status: mysqlEnum("status", ["ativo", "inativo", "revisao"]).default("ativo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─────────────────────────────────────────────
// VIP CAM — clientes reconhecidos
// ─────────────────────────────────────────────
export const camClientes = mysqlTable("cam_clientes", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  // Campos de reconhecimento facial
  faceDescriptor: json("faceDescriptor"), // array Float32Array serializado
  faceImageUrl: text("faceImageUrl"),     // URL S3 da foto do rosto
  // Campos de identidade
  nome: varchar("nome", { length: 255 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 50 }),
  faixaEtaria: varchar("faixaEtaria", { length: 50 }),
  genero: varchar("genero", { length: 20 }),
  // Campos de emoção/satisfação
  satisfactionLevel: mysqlEnum("satisfactionLevel", ["satisfied", "neutral", "unsatisfied"]).default("neutral"),
  expression: mysqlEnum("expression", ["happy", "neutral", "angry", "surprised", "sad", "disgusted", "fearful"]).default("neutral"),
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 4 }),
  // Visitas
  visitCount: int("visitCount").default(0),
  lastSeenAt: timestamp("lastSeenAt"),
  // Compat legado
  externalId: varchar("externalId", { length: 100 }),
  fotoUrl: text("fotoUrl"),
  expressao: mysqlEnum("expressao", ["satisfeito", "neutro", "insatisfeito"]),
  totalVisitas: int("totalVisitas").default(0),
  ultimaVisita: timestamp("ultimaVisita"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_cam_clientes_unit").on(t.unitId),
  index("idx_cam_clientes_last_seen").on(t.unitId, t.lastSeenAt),
]);

// ─────────────────────────────────────────────
// VIP CAM — timeline de capturas (cada detecção)
// ─────────────────────────────────────────────
export const camSentimentTimeline = mysqlTable("cam_sentiment_timeline", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  clienteId: int("clienteId").notNull(), // FK cam_clientes
  satisfactionLevel: mysqlEnum("satisfactionLevel", ["satisfied", "neutral", "unsatisfied"]).notNull(),
  expression: varchar("expression", { length: 50 }),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  faceImageUrl: text("faceImageUrl"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (t) => [
  index("idx_cam_timeline_cliente").on(t.clienteId),
  index("idx_cam_timeline_unit_date").on(t.unitId, t.recordedAt),
]);

// ─────────────────────────────────────────────
// VIP CAM — métricas horárias
// ─────────────────────────────────────────────
export const camMetricasHorarias = mysqlTable("cam_metricas_horarias", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  data: date("data").notNull(),
  hora: int("hora").notNull(), // 0-23
  totalDeteccoes: int("totalDeteccoes").default(0),
  satisfeitos: int("satisfeitos").default(0),
  neutros: int("neutros").default(0),
  insatisfeitos: int("insatisfeitos").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_cam_horarias_unit_data").on(t.unitId, t.data, t.hora),
]);

// ─────────────────────────────────────────────
// VIP CAM — configuração de câmera por unidade
// ─────────────────────────────────────────────
export const camCameraConfig = mysqlTable("cam_camera_config", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  // Tipo de câmera: usb (webcam local) ou ip (RTSP/RTSPS)
  cameraType: mysqlEnum("cameraType", ["usb", "ip"]).default("usb").notNull(),
  // Config para câmera IP
  rtspUrl: text("rtspUrl"),           // ex: rtsp://192.168.1.10:554/stream
  rtspLogin: varchar("rtspLogin", { length: 255 }),
  rtspPassword: varchar("rtspPassword", { length: 255 }),
  rtspProtocol: mysqlEnum("rtspProtocol", ["rtsp", "rtsps"]).default("rtsp"),
  // Config geral
  active: boolean("active").default(true),
  detectionThreshold: decimal("detectionThreshold", { precision: 3, scale: 2 }).default("0.55"),
  cooldownSeconds: int("cooldownSeconds").default(4),
  captureWindowMs: int("captureWindowMs").default(1500),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_cam_config_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// VIP CAM — métricas diárias
// ─────────────────────────────────────────────
export const camMetricasDiarias = mysqlTable("cam_metricas_diarias", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  data: date("data").notNull(),
  totalDeteccoes: int("totalDeteccoes").default(0),
  satisfeitos: int("satisfeitos").default(0),
  neutros: int("neutros").default(0),
  insatisfeitos: int("insatisfeitos").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_cam_metricas_unit_data").on(t.unitId, t.data),
]);

// ─────────────────────────────────────────────
// REPUTAÇÃO — avaliações
// ─────────────────────────────────────────────
export const avaliacoes = mysqlTable("avaliacoes", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  plataforma: mysqlEnum("plataforma", ["google", "ifood", "tripadvisor", "ubereats", "rappi", "outro"]).notNull(),
  externalId: varchar("externalId", { length: 255 }),
  autorNome: varchar("autorNome", { length: 255 }),
  nota: decimal("nota", { precision: 3, scale: 1 }),
  comentario: text("comentario"),
  sentimento: mysqlEnum("sentimento", ["positivo", "neutro", "negativo"]),
  resposta: text("resposta"),
  respondidoEm: timestamp("respondidoEm"),
  dataAvaliacao: timestamp("dataAvaliacao").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_avaliacoes_unit_plataforma").on(t.unitId, t.plataforma),
  index("idx_avaliacoes_unit_data").on(t.unitId, t.dataAvaliacao),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — métricas
// ─────────────────────────────────────────────
export const instagramMetricas = mysqlTable("instagram_metricas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  data: date("data").notNull(),
  seguidores: int("seguidores").default(0),
  novosSeguidores: int("novosSeguidores").default(0),
  impressoes: int("impressoes").default(0),
  alcance: int("alcance").default(0),
  comentariosRespondidos: int("comentariosRespondidos").default(0),
  boasVindasEnviadas: int("boasVindasEnviadas").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_instagram_unit_data").on(t.unitId, t.data),
]);

// ─────────────────────────────────────────────
// WE SEND — campanhas WhatsApp
// ─────────────────────────────────────────────
export const whatsappCampanhas = mysqlTable("whatsapp_campanhas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  mensagem: text("mensagem").notNull(),
  tipoMidia: mysqlEnum("tipoMidia", ["texto", "imagem", "arquivo"]).default("texto"),
  totalContatos: int("totalContatos").default(0),
  enviados: int("enviados").default(0),
  erros: int("erros").default(0),
  status: mysqlEnum("status", ["rascunho", "enviando", "concluida", "cancelada"]).default("rascunho").notNull(),
  iniciadoEm: timestamp("iniciadoEm"),
  finalizadoEm: timestamp("finalizadoEm"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_whatsapp_campanhas_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  unitId: int("unitId"),
  acao: varchar("acao", { length: 255 }).notNull(),
  entidade: varchar("entidade", { length: 100 }),
  entidadeId: varchar("entidadeId", { length: 100 }),
  detalhes: json("detalhes"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_audit_user").on(t.userId),
  index("idx_audit_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Configuração do Bot por Unidade
// ─────────────────────────────────────────────
export const igConfig = mysqlTable("ig_config", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  accessToken: text("accessToken"),
  instagramUserId: varchar("instagramUserId", { length: 64 }),
  checkIntervalMinutes: int("checkIntervalMinutes").default(5).notNull(),
  personalityPrompt: text("personalityPrompt"),
  storyPersonalityPrompt: text("storyPersonalityPrompt"),
  isActive: int("isActive").default(0).notNull(),
  maxRepliesPerCycle: int("maxRepliesPerCycle").default(10).notNull(),
  skipOwnComments: int("skipOwnComments").default(1).notNull(),
  requireApproval: int("requireApproval").default(0).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  startedAt: timestamp("startedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ig_config_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Configuração de Respostas a Stories
// ─────────────────────────────────────────────
export const igStoryReplyConfig = mysqlTable("ig_story_reply_config", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  isActive: int("isActive").default(0).notNull(),
  requireApproval: int("requireApproval").default(0).notNull(),
  replyToMentions: int("replyToMentions").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ig_story_config_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Logs de Atividade
// ─────────────────────────────────────────────
export const igActivityLogs = mysqlTable("ig_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  type: mysqlEnum("type", ["comment_reply", "story_reply", "welcome", "error", "info", "warning"]).notNull(),
  message: text("message").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ig_logs_unit_date").on(t.unitId, t.createdAt),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Log de Respostas a Stories
// ─────────────────────────────────────────────
export const igStoryReplyLog = mysqlTable("ig_story_reply_log", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  senderId: varchar("senderId", { length: 64 }).notNull(),
  storyId: varchar("storyId", { length: 128 }),
  storyUrl: text("storyUrl"),
  incomingText: text("incomingText"),
  replyText: text("replyText"),
  isMention: int("isMention").default(0),
  status: mysqlEnum("status", ["success", "failed", "pending_approval"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ig_story_log_unit").on(t.unitId, t.createdAt),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Fila de Aprovação
// ─────────────────────────────────────────────
export const igApprovalQueue = mysqlTable("ig_approval_queue", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  type: mysqlEnum("type", ["comment", "story"]).notNull(),
  commentId: varchar("commentId", { length: 128 }),
  postId: varchar("postId", { length: 128 }),
  authorName: varchar("authorName", { length: 120 }),
  commentText: text("commentText"),
  suggestedReply: text("suggestedReply"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "auto_approved"]).default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ig_approval_unit_status").on(t.unitId, t.status),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Estatísticas Diárias do Bot
// ─────────────────────────────────────────────
export const igBotStats = mysqlTable("ig_bot_stats", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  date: date("date").notNull(),
  repliesCount: int("repliesCount").default(0).notNull(),
  storiesReplied: int("storiesReplied").default(0).notNull(),
  errorsCount: int("errorsCount").default(0).notNull(),
  cyclesRun: int("cyclesRun").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ig_stats_unit_date").on(t.unitId, t.date),
]);

// ─────────────────────────────────────────────
// AUTO INSTAGRAM — Comentários Já Respondidos (evitar duplicatas)
// ─────────────────────────────────────────────
export const igRepliedComments = mysqlTable("ig_replied_comments", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  commentId: varchar("commentId", { length: 128 }).notNull(),
  repliedAt: timestamp("repliedAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ig_replied_unit_comment").on(t.unitId, t.commentId),
]);


// ═════════════════════════════════════════════════════════════════════════════
// GESTÃO TOTAL — Módulo de Gestão Empresarial
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Tarefas
// ─────────────────────────────────────────────
export const gtTarefas = mysqlTable("gt_tarefas", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  status: mysqlEnum("status", ["pendente", "em_andamento", "em_revisao", "concluida"]).default("pendente").notNull(),
  prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta", "critica"]).default("media").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  prazo: date("prazo"),
  concluidaEm: timestamp("concluidaEm"),
  ordem: int("ordem").default(0).notNull(),
  instrucaoId: int("instrucaoId"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_tarefas_org_unit").on(t.orgId, t.unitId),
  index("idx_gt_tarefas_status").on(t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Processos Operacionais
// ─────────────────────────────────────────────
export const gtProcessos = mysqlTable("gt_processos", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipo", ["principal", "apoio"]).default("principal").notNull(),
  categoria: varchar("categoria", { length: 100 }),
  area: varchar("area", { length: 100 }),
  responsavel: varchar("responsavel", { length: 255 }),
  etapas: json("etapas"), // Array de { titulo, descricao, responsavel, concluida }
  recursos: json("recursos"),   // string[]
  metricas: json("metricas"),   // string[]
  riscos: json("riscos"),       // string[]
  duracaoEstimada: varchar("duracaoEstimada", { length: 100 }),
  status: mysqlEnum("status", ["ativo", "inativo", "em_revisao"]).default("ativo").notNull(),
  geradoPorIA: int("geradoPorIA").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_processos_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Instruções de Trabalho
// ─────────────────────────────────────────────
export const gtInstrucoes = mysqlTable("gt_instrucoes", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  processoId: int("processoId"),  // FK → gt_processos.id
  titulo: varchar("titulo", { length: 255 }).notNull(),
  conteudo: text("conteudo"),
  plano: json("plano"),           // Plano detalhado gerado por IA (JSON estruturado)
  categoria: varchar("categoria", { length: 100 }),
  responsavelId: int("responsavelId"), // FK → gt_colaboradores.id
  responsavelNome: varchar("responsavelNome", { length: 255 }),
  status: mysqlEnum("status", ["pendente", "em_andamento", "concluida", "pausada"]).default("pendente").notNull(),
  versao: varchar("versao", { length: 20 }).default("1.0"),
  geradoPorIA: int("geradoPorIA").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_instrucoes_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Indicadores Estratégicos
// ─────────────────────────────────────────────
export const gtIndicadores = mysqlTable("gt_indicadores", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipo", ["numero", "percentual", "moeda", "tempo"]).default("numero").notNull(),
  valorAtual: decimal("valorAtual", { precision: 15, scale: 2 }),
  meta: decimal("meta", { precision: 15, scale: 2 }),
  periodo: varchar("periodo", { length: 7 }), // YYYY-MM
  tendencia: mysqlEnum("tendencia", ["subindo", "estavel", "caindo"]).default("estavel"),
  cor: varchar("cor", { length: 7 }).default("#70dc8f"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_indicadores_org_periodo").on(t.orgId, t.periodo),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Planejamento Estratégico
// ─────────────────────────────────────────────
export const gtPlanejamento = mysqlTable("gt_planejamento", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  missao: text("missao"),
  visao: text("visao"),
  valores: text("valores"),
  swotForcas: json("swotForcas"),     // string[]
  swotFraquezas: json("swotFraquezas"),
  swotOportunidades: json("swotOportunidades"),
  swotAmeacas: json("swotAmeacas"),
  objetivos: json("objetivos"),       // { titulo, prazo, responsavel, status }[]
  ano: int("ano").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_planejamento_org_ano").on(t.orgId, t.ano),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Reuniões
// ─────────────────────────────────────────────
export const gtReunioes = mysqlTable("gt_reunioes", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  data: timestamp("data").notNull(),
  duracao: int("duracao"), // minutos
  local: varchar("local", { length: 255 }),
  pauta: text("pauta"),
  ata: text("ata"),
  participantes: json("participantes"), // string[]
  status: mysqlEnum("status", ["agendada", "realizada", "cancelada"]).default("agendada").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_reunioes_org_data").on(t.orgId, t.data),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Cargos
// ─────────────────────────────────────────────
export const gtCargos = mysqlTable("gt_cargos", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  nivel: mysqlEnum("nivel", ["operacional", "tatico", "estrategico"]).default("operacional").notNull(),
  salarioBase: decimal("salarioBase", { precision: 10, scale: 2 }),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_cargos_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Colaboradores (gestão interna)
// ─────────────────────────────────────────────
export const gtColaboradores = mysqlTable("gt_colaboradores", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 20 }),
  cargoId: int("cargoId"),
  salario: decimal("salario", { precision: 10, scale: 2 }),
  dataAdmissao: date("dataAdmissao"),
  status: mysqlEnum("status", ["ativo", "ferias", "afastado", "desligado"]).default("ativo").notNull(),
  avatarUrl: text("avatarUrl"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_colab_org_unit").on(t.orgId, t.unitId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Financeiro (entradas e saídas)
// ─────────────────────────────────────────────
export const gtFinanceiro = mysqlTable("gt_financeiro", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  tipo: mysqlEnum("tipo", ["receita", "despesa"]).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 15, scale: 2 }).notNull(),
  vencimento: date("vencimento"),
  pago: int("pago").default(0).notNull(),
  paidAt: date("paidAt"),
  formaPagamento: varchar("formaPagamento", { length: 50 }),
  referencia: varchar("referencia", { length: 7 }), // YYYY-MM
  observacoes: text("observacoes"),
  dataVipRef: varchar("dataVipRef", { length: 100 }), // 'datavip:{unitId}:{YYYY-MM-DD}' — controle de duplicação
  // Recorrência
  recorrente: int("recorrente").default(0).notNull(), // 0=não | 1=sim (template)
  recorrenciaMeses: int("recorrenciaMeses"),           // null=indefinido | N=número de meses restantes
  recorrenciaParentId: int("recorrenciaParentId"),     // ID do template pai
  recorrenciaDia: int("recorrenciaDia"),               // dia do mês para vencimento (1-31)
  recorrenciaRef: varchar("recorrenciaRef", { length: 30 }), // chave única para evitar duplicação: '{parentId}:{YYYY-MM}'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_fin_org_ref").on(t.orgId, t.referencia),
  index("idx_gt_fin_tipo").on(t.tipo),
  uniqueIndex("uq_datavip_ref").on(t.dataVipRef),
  index("idx_gt_fin_recorrente").on(t.recorrente),
  uniqueIndex("uq_recorrencia_ref").on(t.recorrenciaRef),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Fornecedores
// ─────────────────────────────────────────────
export const gtFornecedores = mysqlTable("gt_fornecedores", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 20 }),
  categoria: varchar("categoria", { length: 100 }),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_forn_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Pedidos de Compra
// ─────────────────────────────────────────────
export const gtCompras = mysqlTable("gt_compras", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  fornecedorId: int("fornecedorId"),
  fornecedorNome: varchar("fornecedorNome", { length: 255 }),
  status: mysqlEnum("status", ["rascunho", "aguardando_aprovacao", "aprovado", "recebido", "cancelado"]).default("rascunho").notNull(),
  itens: json("itens"), // { descricao, qtd, valorUnit, total }[]
  total: decimal("total", { precision: 15, scale: 2 }),
  observacoes: text("observacoes"),
  aprovadoPor: varchar("aprovadoPor", { length: 255 }),
  aprovadoEm: timestamp("aprovadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_compras_org_status").on(t.orgId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Problemas
// ─────────────────────────────────────────────
export const gtProblemas = mysqlTable("gt_problemas", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  severidade: mysqlEnum("severidade", ["baixa", "media", "alta", "critica"]).default("media").notNull(),
  status: mysqlEnum("status", ["aberto", "em_analise", "resolvido", "fechado"]).default("aberto").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  resolucao: text("resolucao"),
  resolvidoEm: timestamp("resolvidoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_prob_org_status").on(t.orgId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Oportunidades
// ─────────────────────────────────────────────
export const gtOportunidades = mysqlTable("gt_oportunidades", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta"]).default("media").notNull(),
  status: mysqlEnum("status", ["identificada", "em_avaliacao", "aprovada", "implementando", "concluida", "descartada"]).default("identificada").notNull(),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  responsavel: varchar("responsavel", { length: 255 }),
  prazo: date("prazo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_opor_org_status").on(t.orgId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Riscos
// ─────────────────────────────────────────────
export const gtRiscos = mysqlTable("gt_riscos", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  probabilidade: mysqlEnum("probabilidade", ["baixa", "media", "alta"]).default("media").notNull(),
  impacto: mysqlEnum("impacto", ["baixo", "medio", "alto"]).default("medio").notNull(),
  status: mysqlEnum("status", ["identificado", "monitorando", "mitigado", "aceito"]).default("identificado").notNull(),
  mitigacao: text("mitigacao"),
  responsavel: varchar("responsavel", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_riscos_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Documentos
// ─────────────────────────────────────────────
export const gtDocumentos = mysqlTable("gt_documentos", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  categoria: varchar("categoria", { length: 100 }),
  urlArquivo: text("urlArquivo"),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }),
  tamanho: int("tamanho"), // bytes
  versao: varchar("versao", { length: 20 }).default("1.0"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_docs_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Campanhas de Marketing
// ─────────────────────────────────────────────
export const gtMarketing = mysqlTable("gt_marketing", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  canal: mysqlEnum("canal", ["instagram", "facebook", "whatsapp", "email", "google", "offline", "outro"]).default("instagram").notNull(),
  status: mysqlEnum("status", ["planejamento", "ativa", "pausada", "concluida"]).default("planejamento").notNull(),
  budget: decimal("budget", { precision: 15, scale: 2 }),
  gasto: decimal("gasto", { precision: 15, scale: 2 }),
  alcance: int("alcance"),
  cliques: int("cliques"),
  conversoes: int("conversoes"),
  dataInicio: date("dataInicio"),
  dataFim: date("dataFim"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_mkt_org_status").on(t.orgId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Campanhas de Marketing com IA
// ─────────────────────────────────────────────
export const gtMarketingCampaigns = mysqlTable("gt_marketing_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  campaignName: varchar("campaignName", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft | active | archived
  version: varchar("version", { length: 20 }).default("v1").notNull(),
  // Inputs do wizard
  wizardResponses: json("wizardResponses"), // WizardData completo
  internalDataUsed: json("internalDataUsed"), // { company, social_accounts }
  // Outputs da IA (campos individuais para consulta)
  executiveSummary: text("executiveSummary"),
  personas: json("personas"),
  messages: json("messages"),
  channelMix: json("channelMix"),
  budgetSplit: json("budgetSplit"),
  calendar90d: json("calendar90d"),
  contentIdeas: json("contentIdeas"),
  adsKits: json("adsKits"),
  crmFlows: json("crmFlows"),
  landingPage: json("landingPage"),
  kpisTargets: json("kpisTargets"),
  experimentsBacklog: json("experimentsBacklog"),
  risksCompliance: json("risksCompliance"),
  assumptions: json("assumptions"),
  jsonBlob: json("jsonBlob"), // cópia integral
  // Atribuição
  assignedToId: int("assignedToId"), // FK → gt_colaboradores_gt.id
  assignedToName: varchar("assignedToName", { length: 255 }),
  assignedAt: timestamp("assignedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_mkt_camp_org").on(t.orgId, t.status),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Conversas com IA Conselheiro
// ─────────────────────────────────────────────
export const gtAdvisorConversations = mysqlTable("gt_advisor_conversations", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  userId: int("userId").notNull(),
  messages: json("messages").notNull(), // { role, content, timestamp }[]
  titulo: varchar("titulo", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_advisor_org_user").on(t.orgId, t.userId),
]);

// ─────────────────────────────────────────────
// GESTÃO TOTAL — Log de Auditoria
// ─────────────────────────────────────────────
export const gtAuditLog = mysqlTable("gt_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  acao: varchar("acao", { length: 50 }).notNull(), // created, updated, deleted
  entidade: varchar("entidade", { length: 100 }).notNull(),
  entidadeId: int("entidadeId"),
  descricao: text("descricao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_gt_audit_org").on(t.orgId),
]);

// ─────────────────────────────────────────────
// REPUTAÇÃO — Conexões de plataformas
// ─────────────────────────────────────────────
export const repConexoes = mysqlTable("rep_conexoes", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  plataforma: mysqlEnum("plataforma", ["google", "ifood", "tripadvisor", "ubereats", "rappi", "facebook", "instagram", "manual"]).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(), // placeId do Google, etc.
  nome: varchar("nome", { length: 255 }),
  url: varchar("url", { length: 512 }),
  // Credenciais OAuth Google Business Profile
  googleAccessToken: text("googleAccessToken"),
  googleRefreshToken: text("googleRefreshToken"),
  googleTokenExpiry: timestamp("googleTokenExpiry"),
  googleAccountName: varchar("googleAccountName", { length: 255 }), // accounts/xxx
  googleLocationName: varchar("googleLocationName", { length: 255 }), // accounts/xxx/locations/yyy
  // Config Google Places API (fallback)
  googlePlaceId: varchar("googlePlaceId", { length: 255 }),
  googleApiKey: varchar("googleApiKey", { length: 255 }),
  // OAuth App credentials (por unidade — permite cada unidade ter seu próprio app Google)
  googleClientId: varchar("googleClientId", { length: 512 }),
  googleClientSecret: varchar("googleClientSecret", { length: 512 }),
  // Métricas
  totalAvaliacoes: int("totalAvaliacoes").default(0),
  notaMedia: decimal("notaMedia", { precision: 3, scale: 2 }),
  ultimaSincronizacao: timestamp("ultimaSincronizacao"),
  isAtivo: boolean("isAtivo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_rep_conexoes_unit").on(t.unitId),
  index("idx_rep_conexoes_unit_plat").on(t.unitId, t.plataforma),
]);

// ─────────────────────────────────────────────
// REPUTAÇÃO — Avaliações (tabela principal enriquecida)
// ─────────────────────────────────────────────
export const repAvaliacoes = mysqlTable("rep_avaliacoes", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  conexaoId: int("conexaoId"),
  plataforma: mysqlEnum("plataforma", ["google", "ifood", "tripadvisor", "ubereats", "rappi", "facebook", "instagram", "manual"]).notNull(),
  externalId: varchar("externalId", { length: 512 }), // ID único na plataforma
  autorNome: varchar("autorNome", { length: 255 }),
  autorFoto: varchar("autorFoto", { length: 512 }),
  nota: decimal("nota", { precision: 3, scale: 1 }).notNull(),
  titulo: varchar("titulo", { length: 512 }),
  comentario: text("comentario"),
  sentimento: mysqlEnum("sentimento", ["positivo", "neutro", "negativo"]),
  // Resposta
  resposta: text("resposta"),
  respondidoEm: timestamp("respondidoEm"),
  respondidoPor: varchar("respondidoPor", { length: 255 }),
  respostaPublicada: boolean("respostaPublicada").default(false),
  // Metadados
  dataAvaliacao: timestamp("dataAvaliacao").notNull(),
  urlAvaliacao: varchar("urlAvaliacao", { length: 512 }),
  isVerificado: boolean("isVerificado").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_rep_aval_unit_plat").on(t.unitId, t.plataforma),
  index("idx_rep_aval_unit_data").on(t.unitId, t.dataAvaliacao),
  index("idx_rep_aval_unit_nota").on(t.unitId, t.nota),
  index("idx_rep_aval_external").on(t.externalId),
]);

// ─────────────────────────────────────────────
// REPUTAÇÃO — Resumo por unidade (cache de métricas)
// ─────────────────────────────────────────────
export const repResumo = mysqlTable("rep_resumo", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  totalAvaliacoes: int("totalAvaliacoes").default(0).notNull(),
  notaMedia: decimal("notaMedia", { precision: 4, scale: 2 }).default("0").notNull(),
  taxaResposta: decimal("taxaResposta", { precision: 5, scale: 2 }).default("0"),
  totalPositivas: int("totalPositivas").default(0),
  totalNeutras: int("totalNeutras").default(0),
  totalNegativas: int("totalNegativas").default(0),
  distribuicaoNotas: json("distribuicaoNotas"), // { "5": 10, "4": 5, ... }
  notasPorPlataforma: json("notasPorPlataforma"), // { "google": { avg: 4.5, count: 20 }, ... }
  ultimoCalculo: timestamp("ultimoCalculo").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─────────────────────────────────────────────
// REPUTAÇÃO — Configurações de IA para respostas
// ─────────────────────────────────────────────
export const repConfigIA = mysqlTable("rep_config_ia", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  nomeEstabelecimento: varchar("nomeEstabelecimento", { length: 255 }),
  nomeProprietario: varchar("nomeProprietario", { length: 255 }),
  tom: mysqlEnum("tom", ["formal", "casual", "amigavel"]).default("amigavel").notNull(),
  incluirAssinatura: boolean("incluirAssinatura").default(true),
  autoResponder: boolean("autoResponder").default(false),
  autoResponderPositivas: boolean("autoResponderPositivas").default(false),
  autoResponderNegativas: boolean("autoResponderNegativas").default(false),
  promptPersonalizado: text("promptPersonalizado"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─────────────────────────────────────────────
// REPUTAÇÃO — Histórico de respostas geradas por IA
// ─────────────────────────────────────────────
export const repRespostasIA = mysqlTable("rep_respostas_ia", {
  id: int("id").autoincrement().primaryKey(),
  avaliacaoId: int("avaliacaoId").notNull(),
  unitId: int("unitId").notNull(),
  textoGerado: text("textoGerado").notNull(),
  textoFinal: text("textoFinal"),
  tom: varchar("tom", { length: 50 }),
  usouIA: boolean("usouIA").default(true),
  publicado: boolean("publicado").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_rep_resp_ia_avaliacao").on(t.avaliacaoId),
  index("idx_rep_resp_ia_unit").on(t.unitId),
]);

// ═════════════════════════════════════════════════════════════════════════════
// WE SEND — WhatsApp Campaign Management (WAHA API)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// WE SEND — Configuração WAHA por unidade
// ─────────────────────────────────────────────
export const wsConfig = mysqlTable("ws_config", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull().unique(),
  wahaUrl: varchar("wahaUrl", { length: 512 }).notNull().default("http://localhost:3001"),
  wahaApiKey: varchar("wahaApiKey", { length: 512 }),
  sessionName: varchar("sessionName", { length: 255 }).notNull().default("default"),
  // Status da sessão (cached)
  sessionStatus: varchar("sessionStatus", { length: 50 }).default("STOPPED"),
  sessionStatusAt: timestamp("sessionStatusAt"),
  // Configurações de envio
  intervaloSegundos: int("intervaloSegundos").default(3).notNull(),
  horarioInicio: varchar("horarioInicio", { length: 5 }).default("09:00"),
  horarioFim: varchar("horarioFim", { length: 5 }).default("18:00"),
  maxEnviosDia: int("maxEnviosDia").default(500),
  isAtivo: boolean("isAtivo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ws_config_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// WE SEND — Templates de mensagem
// ─────────────────────────────────────────────
export const wsTemplates = mysqlTable("ws_templates", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  conteudo: text("conteudo").notNull(),
  tipo: mysqlEnum("tipo", ["texto", "imagem", "arquivo"]).default("texto").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  variaveis: text("variaveis"), // JSON: ["nome", "telefone", etc.]
  isAtivo: boolean("isAtivo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ws_templates_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// WE SEND — Campanhas
// ─────────────────────────────────────────────
export const wsCampanhas = mysqlTable("ws_campanhas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  templateId: int("templateId"),
  mensagem: text("mensagem").notNull(),
  tipo: mysqlEnum("tipo", ["texto", "imagem", "arquivo"]).default("texto").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  status: mysqlEnum("status", ["rascunho", "agendada", "em_andamento", "pausada", "concluida", "cancelada"]).default("rascunho").notNull(),
  // Agendamento
  agendadaPara: timestamp("agendadaPara"),
  iniciadaEm: timestamp("iniciadaEm"),
  concluidaEm: timestamp("concluidaEm"),
  // Métricas
  totalContatos: int("totalContatos").default(0),
  totalEnviados: int("totalEnviados").default(0),
  totalFalhas: int("totalFalhas").default(0),
  totalEntregues: int("totalEntregues").default(0),
  totalLidos: int("totalLidos").default(0),
  // Configurações
  intervaloSegundos: int("intervaloSegundos").default(3),
  criadoPor: varchar("criadoPor", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ws_campanhas_unit").on(t.unitId),
  index("idx_ws_campanhas_status").on(t.status),
]);

// ─────────────────────────────────────────────
// WE SEND — Contatos da campanha
// ─────────────────────────────────────────────
export const wsContatos = mysqlTable("ws_contatos", {
  id: int("id").autoincrement().primaryKey(),
  campanhaId: int("campanhaId").notNull(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  // Variáveis personalizadas (JSON)
  variaveis: text("variaveis"),
  // Status do envio
  status: mysqlEnum("status", ["pendente", "enviado", "falha", "entregue", "lido", "bloqueado"]).default("pendente").notNull(),
  mensagemPersonalizada: text("mensagemPersonalizada"),
  erroMensagem: varchar("erroMensagem", { length: 512 }),
  enviadoEm: timestamp("enviadoEm"),
  messageId: varchar("messageId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ws_contatos_campanha").on(t.campanhaId),
  index("idx_ws_contatos_unit").on(t.unitId),
  index("idx_ws_contatos_status").on(t.status),
]);

// ─────────────────────────────────────────────
// WE SEND — Listas de contatos reutilizáveis
// ─────────────────────────────────────────────
export const wsListasContatos = mysqlTable("ws_listas_contatos", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  totalContatos: int("totalContatos").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_ws_listas_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// WE SEND — Itens das listas de contatos
// ─────────────────────────────────────────────
export const wsListaItens = mysqlTable("ws_lista_itens", {
  id: int("id").autoincrement().primaryKey(),
  listaId: int("listaId").notNull(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  variaveis: text("variaveis"), // JSON com campos extras
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_ws_lista_itens_lista").on(t.listaId),
  index("idx_ws_lista_itens_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// DATA VIP — configuração de categorias de serviços
// Permite marcar cada serviço (por nome) como 'base' ou 'extra' por organização
// ─────────────────────────────────────────────
export const servicoCategorias = mysqlTable("servico_categorias", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),              // FK → organizations.id
  nomeServico: varchar("nomeServico", { length: 255 }).notNull(),
  categoria: mysqlEnum("categoria", ["base", "extra"]).notNull().default("extra"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_servico_categorias_org").on(t.orgId),
  uniqueIndex("idx_servico_categorias_org_nome").on(t.orgId, t.nomeServico),
]);

export type ServicoCategoria = typeof servicoCategorias.$inferSelect;
export type InsertServicoCategoria = typeof servicoCategorias.$inferInsert;

// ─────────────────────────────────────────────
// DATA VIP — Registro de contatos WhatsApp com clientes
// Salva cada vez que um colaborador envia mensagem via WhatsApp para um cliente
// ─────────────────────────────────────────────
export const clienteContatos = mysqlTable("cliente_contatos", {
  id: int("id").autoincrement().primaryKey(),
  clienteExtId: int("clienteExtId").notNull(), // ID do cliente no banco externo
  orgId: int("orgId"),                          // FK → organizations.id
  unitId: int("unitId"),                        // FK → units.id
  mensagem: text("mensagem"),                   // Mensagem enviada
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => [
  index("idx_cliente_contatos_cliente").on(t.clienteExtId),
  index("idx_cliente_contatos_unit").on(t.unitId),
  index("idx_cliente_contatos_org").on(t.orgId),
]);

export type ClienteContato = typeof clienteContatos.$inferSelect;
export type InsertClienteContato = typeof clienteContatos.$inferInsert;

// ─────────────────────────────────────────────
// DATA VIP — Faixas de comissão progressiva por meta
// Cada faixa define: ao atingir valorMinServicos (R$) no período,
// o barbeiro passa a ganhar pctComissao% sobre todos os serviços.
// ─────────────────────────────────────────────
export const metaFaixas = mysqlTable("meta_faixas", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),              // FK → units.id
  orgId: int("orgId").notNull(),                // FK → organizations.id
  ordem: int("ordem").notNull().default(0),     // Ordem de exibição (0 = faixa base)
  valorMinServicos: decimal("valorMinServicos", { precision: 12, scale: 2 }).notNull().default("0"), // Valor mínimo de serviços para ativar a faixa
  pctComissao: decimal("pctComissao", { precision: 5, scale: 2 }).notNull(),   // % de comissão ao atingir a faixa
  descricao: varchar("descricao", { length: 255 }),                             // Label opcional (ex: "Meta Bronze")
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_meta_faixas_unit").on(t.unitId),
  index("idx_meta_faixas_org").on(t.orgId),
]);

export type MetaFaixa = typeof metaFaixas.$inferSelect;
export type InsertMetaFaixa = typeof metaFaixas.$inferInsert;

// ─────────────────────────────────────────────
// DATA VIP — Metas Dinâmicas
// Metas com regras flexíveis (produtos, serviços múltiplos por comanda)
// Bônus aplicado por colaborador da unidade ao bater a meta no período
// ─────────────────────────────────────────────
export const metasDinamicas = mysqlTable("metas_dinamicas", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  // tipo: 'produto' | 'servicos_multiplos'
  tipo: varchar("tipo", { length: 50 }).notNull(),
  // JSON com parâmetros da regra:
  // produto: { valorMinProdutos: number }
  // servicos_multiplos: { minServicosComanda: number, minComandas: number }
  config: text("config").notNull().default("{}"),
  // Bônus ao bater a meta (por colaborador da unidade)
  bonusTipo: varchar("bonusTipo", { length: 20 }).notNull().default("fixo"), // 'fixo' | 'percentual'
  bonusValor: decimal("bonusValor", { precision: 10, scale: 2 }).notNull().default("0"),
  // Vigência: null = recorrente (todos os meses), ou 'YYYY-MM' para mês específico
  mesVigencia: varchar("mesVigencia", { length: 7 }),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_metas_dinamicas_unit").on(t.unitId),
  index("idx_metas_dinamicas_org").on(t.orgId),
]);
export type MetaDinamica = typeof metasDinamicas.$inferSelect;
export type InsertMetaDinamica = typeof metasDinamicas.$inferInsert;

// ─────────────────────────────────────────────
// DATA VIP — Categorias de Produtos
// Classificação manual de produtos do banco externo (cabelo | barba | outros)
// Chave: orgId + nomeProduto (nome único por org)
// ─────────────────────────────────────────────
export const produtoCategorias = mysqlTable("produto_categorias", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  nomeProduto: varchar("nomeProduto", { length: 255 }).notNull(),
  // categoria: 'cabelo' | 'barba' | 'outros'
  categoria: varchar("categoria", { length: 50 }).notNull().default("outros"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_produto_categorias_org").on(t.orgId),
  uniqueIndex("uq_produto_cat_org_nome").on(t.orgId, t.nomeProduto),
]);
export type ProdutoCategoria = typeof produtoCategorias.$inferSelect;
export type InsertProdutoCategoria = typeof produtoCategorias.$inferInsert;

// ─────────────────────────────────────────────
// RAIO-X CACHE — Cache persistente de dados históricos
// Armazena snapshots mensais calculados do banco externo
// para evitar queries pesadas em períodos já fechados.
// Chave: unitId + mesRef (YYYY-MM) + tipo
// ─────────────────────────────────────────────

// Snapshot mensal da Visão Geral do Raio-X
export const raioXCacheVisaoGeral = mysqlTable("raio_x_cache_visao_geral", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  orgId: int("orgId").notNull(),
  mesRef: varchar("mesRef", { length: 7 }).notNull(), // YYYY-MM
  // JSON com os dados calculados (kpis, distribuicoes, evolucao mensal)
  dados: json("dados").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_raiox_vg_unit").on(t.unitId),
  index("idx_raiox_vg_org").on(t.orgId),
  uniqueIndex("uq_raiox_vg_unit_mes").on(t.unitId, t.mesRef),
]);
export type RaioXCacheVisaoGeral = typeof raioXCacheVisaoGeral.$inferSelect;
export type InsertRaioXCacheVisaoGeral = typeof raioXCacheVisaoGeral.$inferInsert;

// Snapshot mensal do Churn do Raio-X
export const raioXCacheChurn = mysqlTable("raio_x_cache_churn", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  orgId: int("orgId").notNull(),
  mesRef: varchar("mesRef", { length: 7 }).notNull(), // YYYY-MM
  dados: json("dados").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_raiox_churn_unit").on(t.unitId),
  uniqueIndex("uq_raiox_churn_unit_mes").on(t.unitId, t.mesRef),
]);
export type RaioXCacheChurn = typeof raioXCacheChurn.$inferSelect;
export type InsertRaioXCacheChurn = typeof raioXCacheChurn.$inferInsert;

// Snapshot mensal do Cohort do Raio-X
export const raioXCacheCohort = mysqlTable("raio_x_cache_cohort", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  orgId: int("orgId").notNull(),
  mesRef: varchar("mesRef", { length: 7 }).notNull(), // YYYY-MM
  dados: json("dados").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_raiox_cohort_unit").on(t.unitId),
  uniqueIndex("uq_raiox_cohort_unit_mes").on(t.unitId, t.mesRef),
]);
export type RaioXCacheCohort = typeof raioXCacheCohort.$inferSelect;
export type InsertRaioXCacheCohort = typeof raioXCacheCohort.$inferInsert;

// Snapshot mensal do Routing (barbeiros) do Raio-X
export const raioXCacheRouting = mysqlTable("raio_x_cache_routing", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  orgId: int("orgId").notNull(),
  mesRef: varchar("mesRef", { length: 7 }).notNull(), // YYYY-MM
  dados: json("dados").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_raiox_routing_unit").on(t.unitId),
  uniqueIndex("uq_raiox_routing_unit_mes").on(t.unitId, t.mesRef),
]);
export type RaioXCacheRouting = typeof raioXCacheRouting.$inferSelect;
export type InsertRaioXCacheRouting = typeof raioXCacheRouting.$inferInsert;

// Log de sincronização do cache do Raio-X
export const raioXCacheSyncLog = mysqlTable("raio_x_cache_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  orgId: int("orgId").notNull(),
  mesRef: varchar("mesRef", { length: 7 }).notNull(), // YYYY-MM
  tipo: varchar("tipo", { length: 30 }).notNull(), // visao_geral | churn | cohort | routing
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | success | error
  erro: text("erro"),
  duracaoMs: int("duracaoMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_raiox_sync_unit").on(t.unitId),
  index("idx_raiox_sync_mes").on(t.mesRef),
]);
export type RaioXCacheSyncLog = typeof raioXCacheSyncLog.$inferSelect;
export type InsertRaioXCacheSyncLog = typeof raioXCacheSyncLog.$inferInsert;

// ── Histórico de Conteúdos Gerados (Gerador de Conteúdo - Marketing) ──────────
export const gtContentHistory = mysqlTable("gt_content_history", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  createdBy: int("createdBy").notNull(),
  // Parâmetros do wizard
  objetivo: varchar("objetivo", { length: 255 }).notNull(),
  formato: varchar("formato", { length: 100 }).notNull(),
  tipoEntrega: varchar("tipoEntrega", { length: 100 }).notNull(),
  publico: varchar("publico", { length: 255 }).notNull(),
  diferenciais: text("diferenciais").notNull(),
  tom: varchar("tom", { length: 100 }).notNull(),
  // Resultado gerado (array de ideias em JSON)
  ideias: json("ideias").notNull(),
  // Metadados
  titulo: varchar("titulo", { length: 255 }), // título da primeira ideia (para exibição na lista)
  favoritado: boolean("favoritado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_content_history_org").on(t.orgId),
  index("idx_content_history_unit").on(t.unitId),
  index("idx_content_history_created").on(t.createdAt),
]);
export type GtContentHistory = typeof gtContentHistory.$inferSelect;
export type InsertGtContentHistory = typeof gtContentHistory.$inferInsert;

// ── Histórico de Artes Geradas (Criação de Arte - Marketing) ──────────────────
export const gtArtHistory = mysqlTable("gt_art_history", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  createdBy: int("createdBy").notNull(),
  assunto: varchar("assunto", { length: 100 }).notNull(),
  tipoArte: varchar("tipoArte", { length: 100 }).notNull(),
  objetivo: varchar("objetivo", { length: 100 }).notNull(),
  tema: varchar("tema", { length: 100 }).notNull(),
  descricao: text("descricao").notNull(),
  briefing: text("briefing").notNull(),
  tipoImagem: varchar("tipoImagem", { length: 20 }).notNull(), // upload | ia | banco
  imagemUrl: text("imagemUrl"),
  resultado: json("resultado").notNull(),
  favoritado: boolean("favoritado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_art_history_org").on(t.orgId),
  index("idx_art_history_unit").on(t.unitId),
]);
export type GtArtHistory = typeof gtArtHistory.$inferSelect;
export type InsertGtArtHistory = typeof gtArtHistory.$inferInsert;

// ── Brand Assets (logo global da organização) ────────────────────────────────
export const gtBrandAssets = mysqlTable("gt_brand_assets", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("org_id").notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // 'logo', 'favicon', etc.
  url: text("url").notNull(),
  fileKey: text("file_key").notNull(),
  nome: varchar("nome", { length: 255 }),
  descricao: varchar("descricao", { length: 500 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_brand_assets_org_tipo").on(t.orgId, t.tipo),
]);
export type GtBrandAsset = typeof gtBrandAssets.$inferSelect;

// ── Image Bank (banco de imagens global da organização) ──────────────────────
export const gtImageBank = mysqlTable("gt_image_bank", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("org_id").notNull(),
  url: text("url").notNull(),
  fileKey: text("file_key").notNull(),
  nome: varchar("nome", { length: 255 }),
  descricao: text("descricao"),
  tags: text("tags"), // JSON array de tags
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
}, (t) => [
  index("idx_image_bank_org").on(t.orgId),
]);
export type GtImageBankItem = typeof gtImageBank.$inferSelect;

// ── Configuração Financeira — Taxas de Cartão e Taxa Bancária ─────────────────
export const gtFinConfig = mysqlTable("gt_fin_config", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  taxaCredito: decimal("taxaCredito", { precision: 5, scale: 2 }).default("0").notNull(),
  taxaDebito:  decimal("taxaDebito",  { precision: 5, scale: 2 }).default("0").notNull(),
  taxaBancaria: decimal("taxaBancaria", { precision: 10, scale: 2 }).default("0").notNull(),
  taxaBancariaAtiva: int("taxaBancariaAtiva").default(0).notNull(),
  taxaBancariaDia: int("taxaBancariaDia").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_fin_config_org").on(t.orgId, t.unitId),
]);
export type GtFinConfig = typeof gtFinConfig.$inferSelect;

// ── Configuração Financeira — Funcionários CLT ────────────────────────────────
export const gtFuncionariosClt = mysqlTable("gt_funcionarios_clt", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  unitId: int("unitId"),
  nome: varchar("nome", { length: 255 }).notNull(),
  cargo: varchar("cargo", { length: 255 }),
  salario: decimal("salario", { precision: 10, scale: 2 }).notNull(),
  diaPagamento: int("diaPagamento").default(5).notNull(),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_func_clt_org").on(t.orgId, t.unitId),
]);
export type GtFuncionarioClt = typeof gtFuncionariosClt.$inferSelect;

// ─────────────────────────────────────────────
// SYSTEM USERS (usuários de unidade — login e-mail/senha)
// ─────────────────────────────────────────────
export const sysUsers = mysqlTable("sys_users", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  roleId: int("roleId"),
  active: int("active").default(1).notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_sys_users_org").on(t.orgId),
  index("idx_sys_users_email").on(t.email),
]);
export type SysUser = typeof sysUsers.$inferSelect;

// ─────────────────────────────────────────────
// SYSTEM USER UNITS (unidades que o usuário pode acessar)
// ─────────────────────────────────────────────
export const sysUserUnits = mysqlTable("sys_user_units", {
  id: int("id").autoincrement().primaryKey(),
  sysUserId: int("sysUserId").notNull(),
  unitId: int("unitId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_sys_user_units_user").on(t.sysUserId),
  index("idx_sys_user_units_unit").on(t.unitId),
]);

// ─────────────────────────────────────────────
// SYSTEM ROLES (perfis de acesso configuráveis)
// ─────────────────────────────────────────────
export const sysRoles = mysqlTable("sys_roles", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isSystem: int("isSystem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_sys_roles_org").on(t.orgId),
]);
export type SysRole = typeof sysRoles.$inferSelect;

// ─────────────────────────────────────────────
// SYSTEM ROLE PERMISSIONS (permissões por módulo/seção)
// ─────────────────────────────────────────────
export const sysRolePermissions = mysqlTable("sys_role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  roleId: int("roleId").notNull(),
  moduleKey: varchar("moduleKey", { length: 100 }).notNull(),
  sectionKey: varchar("sectionKey", { length: 100 }).notNull(),
  canView: int("canView").default(1).notNull(),
  canEdit: int("canEdit").default(0).notNull(),
}, (t) => [
  index("idx_sys_role_perms_role").on(t.roleId),
]);
export type SysRolePermission = typeof sysRolePermissions.$inferSelect;
