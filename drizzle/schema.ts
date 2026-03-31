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
  unitId: int("unitId").notNull(),
  status: mysqlEnum("status", ["running", "success", "error"]).notNull(),
  registrosImportados: int("registrosImportados").default(0),
  erro: text("erro"),
  iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
  finalizadoEm: timestamp("finalizadoEm"),
});

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
  externalId: varchar("externalId", { length: 100 }),
  nome: varchar("nome", { length: 255 }),
  fotoUrl: text("fotoUrl"),
  expressao: mysqlEnum("expressao", ["satisfeito", "neutro", "insatisfeito"]),
  totalVisitas: int("totalVisitas").default(0),
  ultimaVisita: timestamp("ultimaVisita"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_cam_clientes_unit").on(t.unitId),
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
  categoria: varchar("categoria", { length: 100 }),
  responsavel: varchar("responsavel", { length: 255 }),
  etapas: json("etapas"), // Array de { titulo, descricao, responsavel, concluida }
  ativo: int("ativo").default(1).notNull(),
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
  titulo: varchar("titulo", { length: 255 }).notNull(),
  conteudo: text("conteudo"),
  categoria: varchar("categoria", { length: 100 }),
  versao: varchar("versao", { length: 20 }).default("1.0"),
  ativo: int("ativo").default(1).notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_gt_fin_org_ref").on(t.orgId, t.referencia),
  index("idx_gt_fin_tipo").on(t.tipo),
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
