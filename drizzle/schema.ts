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
