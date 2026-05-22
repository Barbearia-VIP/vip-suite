import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import { createPool, Pool } from "mysql2/promise";
import {
  InsertUser,
  moduleAccess,
  moduleConfigs,
  organizations,
  units,
  userProfiles,
  users,
  vendas,
  colaboradores,
  metas,
  tasks,
  processos,
  indicadores,
  financialTransactions,
  avaliacoes,
  camClientes,
  camMetricasDiarias,
  instagramMetricas,
  whatsappCampanhas,
  syncLog,
  auditLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: MySql2Database | null = null;
let _pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,       // 10s para conectar
      enableKeepAlive: true,       // mantém conexão viva
      keepAliveInitialDelay: 10000, // keepalive a cada 10s
    });
    // Reconectar automaticamente após inatividade
    _pool.on("connection", (conn: any) => {
      conn.on("error", (err: Error) => {
        if ((err as any).code === "PROTOCOL_CONNECTION_LOST" || (err as any).code === "ECONNRESET") {
          console.warn("[Database] Conexão perdida, pool reconectará automaticamente.");
          _db = null; // força recriação do drizzle na próxima chamada
        }
      });
    });
  }
  return _pool!;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = getDbPool();
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Organizations ─────────────────────────────────────────────────────────────
export async function getOrgsByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(organizations).where(eq(organizations.ownerId, ownerId));
}

// Returns orgs where user is a member (has a userProfile) — used for non-admin users
export async function getOrgsByMember(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select({ orgId: userProfiles.orgId })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.active, true)));
  if (profiles.length === 0) return [];
  const orgIds = profiles.map((p) => p.orgId).filter((id): id is number => id !== null);
  if (orgIds.length === 0) return [];
  return db.select().from(organizations).where(inArray(organizations.id, orgIds));
}

export async function getOrgById(orgId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return result[0] ?? undefined;
}

export async function createOrg(data: {
  name: string;
  slug: string;
  segment?: string;
  primaryColor?: string;
  ownerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(organizations).values({
    name: data.name,
    slug: data.slug,
    segment: data.segment ?? null,
    primaryColor: data.primaryColor ?? "#1a1a2e",
    ownerId: data.ownerId,
    active: true,
  });
  const id = (result as unknown as { insertId: number }).insertId;
  return { id, ...data };
}

export async function updateOrg(orgId: number, data: Partial<{ name: string; segment: string; primaryColor: string; logoUrl: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(organizations).set(data).where(eq(organizations.id, orgId));
  return getOrgById(orgId);
}

// ── Units ─────────────────────────────────────────────────────────────────────
export async function getUnitsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(units).where(and(eq(units.orgId, orgId), eq(units.active, true)));
}

export async function getUnitById(unitId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  return result[0] ?? undefined;
}

export async function createUnit(data: {
  orgId: number;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  externalId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(units).values({
    orgId: data.orgId,
    name: data.name,
    slug: data.slug,
    address: data.address ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    phone: data.phone ?? null,
    externalId: data.externalId ?? null,
    active: true,
  });
  const id = (result as unknown as { insertId: number }).insertId;
  return { id, ...data };
}

export async function updateUnit(unitId: number, data: Partial<{ name: string; address: string; city: string; state: string; phone: string; externalId: string; active: boolean; aiPrompt: string | null }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(units).set(data).where(eq(units.id, unitId));
  return getUnitById(unitId);
}

// ── User Profiles ─────────────────────────────────────────────────────────────
export async function getUserProfile(userId: number, orgId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.orgId, orgId), eq(userProfiles.active, true)))
    .limit(1);
  return result[0] ?? undefined;
}

export async function upsertUserProfile(data: {
  userId: number;
  orgId: number;
  unitId?: number;
  role: "master" | "org_admin" | "unit_manager" | "team_lead" | "colaborador";
  active?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(userProfiles).values({
    userId: data.userId,
    orgId: data.orgId,
    unitId: data.unitId ?? null,
    role: data.role,
    active: data.active ?? true,
  }).onDuplicateKeyUpdate({
    set: {
      role: data.role,
      unitId: data.unitId ?? null,
      active: data.active ?? true,
    },
  });
}

export async function getUsersInOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      profileId: userProfiles.id,
      userId: userProfiles.userId,
      orgId: userProfiles.orgId,
      unitId: userProfiles.unitId,
      role: userProfiles.role,
      active: userProfiles.active,
      userName: users.name,
      userEmail: users.email,
    })
    .from(userProfiles)
    .leftJoin(users, eq(userProfiles.userId, users.id))
    .where(eq(userProfiles.orgId, orgId));
}

// ── Module Configs ─────────────────────────────────────────────────────────────
export async function getModuleConfigs(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  // Retorna apenas o registro mais recente por módulo (pode haver duplicatas sem UNIQUE constraint)
  const rows = await db.select().from(moduleConfigs)
    .where(eq(moduleConfigs.unitId, unitId))
    .orderBy(sql`${moduleConfigs.id} DESC`);
  // Deduplica: mantém apenas o primeiro (mais recente) de cada módulo
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.module)) return false;
    seen.add(r.module);
    return true;
  });
}

export async function upsertModuleConfig(data: {
  unitId: number;
  module: "data_vip" | "gestao_total" | "vip_cam" | "reputacao" | "auto_instagram" | "we_send";
  config: Record<string, unknown>;
  active?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Verifica se já existe um registro para este unitId+module
  const existing = await db.select({ id: moduleConfigs.id })
    .from(moduleConfigs)
    .where(and(eq(moduleConfigs.unitId, data.unitId), eq(moduleConfigs.module, data.module)))
    .orderBy(sql`${moduleConfigs.id} DESC`)
    .limit(1);
  if (existing.length > 0) {
    // UPDATE no registro mais recente
    await db.update(moduleConfigs)
      .set({ config: data.config, active: data.active ?? true })
      .where(eq(moduleConfigs.id, existing[0].id));
  } else {
    // INSERT novo
    await db.insert(moduleConfigs).values({
      unitId: data.unitId,
      module: data.module,
      config: data.config,
      active: data.active ?? true,
    });
  }
}

// ── Module Access ─────────────────────────────────────────────────────────────
export async function getModuleAccess(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(moduleAccess).where(eq(moduleAccess.unitId, unitId));
}

export async function upsertModuleAccess(data: {
  unitId: number;
  module: "data_vip" | "gestao_total" | "vip_cam" | "reputacao" | "auto_instagram" | "we_send";
  enabled: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(moduleAccess).values({
    unitId: data.unitId,
    module: data.module,
    enabled: data.enabled,
  }).onDuplicateKeyUpdate({
    set: { enabled: data.enabled },
  });
}

// ── Vendas / Data VIP ─────────────────────────────────────────────────────────
export async function getVendasByUnit(unitId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(vendas.unitId, unitId)];
  return db.select().from(vendas).where(and(...conditions)).orderBy(desc(vendas.dataVenda)).limit(500);
}

export async function getVendasKPIs(unitId: number) {
  const db = await getDb();
  if (!db) return { totalFaturamento: 0, totalAtendimentos: 0, ticketMedio: 0 };
  const result = await db
    .select({
      totalFaturamento: sql<number>`COALESCE(SUM(valorLiquido), 0)`,
      totalAtendimentos: sql<number>`COUNT(*)`,
    })
    .from(vendas)
    .where(eq(vendas.unitId, unitId));
  const row = result[0];
  const total = Number(row?.totalFaturamento ?? 0);
  const atend = Number(row?.totalAtendimentos ?? 0);
  return {
    totalFaturamento: total,
    totalAtendimentos: atend,
    ticketMedio: atend > 0 ? total / atend : 0,
  };
}

// ── Colaboradores ─────────────────────────────────────────────────────────────
export async function getColaboradoresByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(colaboradores).where(and(eq(colaboradores.unitId, unitId), eq(colaboradores.ativo, true)));
}

// ── Metas ─────────────────────────────────────────────────────────────────────
export async function getMetasByUnit(unitId: number, ano?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(metas.unitId, unitId)];
  if (ano) conditions.push(eq(metas.ano, ano));
  return db.select().from(metas).where(and(...conditions)).orderBy(desc(metas.ano), desc(metas.mes));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export async function getTasksByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.unitId, unitId)).orderBy(desc(tasks.createdAt)).limit(100);
}

export async function createTask(data: {
  unitId: number;
  titulo: string;
  descricao?: string;
  prioridade?: "baixa" | "media" | "alta" | "critica";
  responsavelId?: number;
  dataVencimento?: Date;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values({
    unitId: data.unitId,
    titulo: data.titulo,
    descricao: data.descricao ?? null,
    status: "pendente",
    prioridade: data.prioridade ?? "media",
    responsavelId: data.responsavelId ?? null,
    dataVencimento: data.dataVencimento ?? null,
    createdById: data.createdById,
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateTaskStatus(taskId: number, status: "pendente" | "em_andamento" | "concluida" | "cancelada") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({
    status,
    concluidaEm: status === "concluida" ? new Date() : null,
  }).where(eq(tasks.id, taskId));
}

// ── Processos ─────────────────────────────────────────────────────────────────
export async function getProcessosByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processos).where(eq(processos.unitId, unitId));
}

// ── Indicadores ───────────────────────────────────────────────────────────────
export async function getIndicadoresByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(indicadores).where(eq(indicadores.unitId, unitId));
}

// ── Financial ─────────────────────────────────────────────────────────────────
export async function getTransactionsByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialTransactions).where(eq(financialTransactions.unitId, unitId)).orderBy(desc(financialTransactions.dataTransacao)).limit(200);
}

// ── Avaliações ────────────────────────────────────────────────────────────────
export async function getAvaliacoesByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(avaliacoes).where(eq(avaliacoes.unitId, unitId)).orderBy(desc(avaliacoes.dataAvaliacao)).limit(200);
}

// ── VIP Cam ───────────────────────────────────────────────────────────────────
export async function getCamClientesByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(camClientes).where(eq(camClientes.unitId, unitId)).orderBy(desc(camClientes.ultimaVisita)).limit(200);
}

export async function getCamMetricasByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(camMetricasDiarias).where(eq(camMetricasDiarias.unitId, unitId)).orderBy(desc(camMetricasDiarias.data)).limit(30);
}

// ── Instagram ─────────────────────────────────────────────────────────────────
export async function getInstagramMetricasByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(instagramMetricas).where(eq(instagramMetricas.unitId, unitId)).orderBy(desc(instagramMetricas.data)).limit(30);
}

// ── WhatsApp Campanhas ────────────────────────────────────────────────────────
export async function getCampanhasByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappCampanhas).where(eq(whatsappCampanhas.unitId, unitId)).orderBy(desc(whatsappCampanhas.createdAt)).limit(50);
}

export async function createCampanha(data: {
  unitId: number;
  nome: string;
  mensagem: string;
  tipoMidia?: "texto" | "imagem" | "arquivo";
  totalContatos: number;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(whatsappCampanhas).values({
    unitId: data.unitId,
    nome: data.nome,
    mensagem: data.mensagem,
    tipoMidia: data.tipoMidia ?? "texto",
    totalContatos: data.totalContatos,
    status: "rascunho",
    createdById: data.createdById,
  });
  return (result as unknown as { insertId: number }).insertId;
}

// ── Sync Log ──────────────────────────────────────────────────────────────────
export async function getSyncLogByUnit(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncLog).where(eq(syncLog.unitId, unitId)).orderBy(desc(syncLog.iniciadoEm)).limit(20);
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
export async function createAuditLog(data: {
  userId: number;
  unitId?: number;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
  ip?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values({
    userId: data.userId,
    unitId: data.unitId ?? null,
    acao: data.acao,
    entidade: data.entidade ?? null,
    entidadeId: data.entidadeId ?? null,
    detalhes: data.detalhes ?? null,
    ip: data.ip ?? null,
  });
}
