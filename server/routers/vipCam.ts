/**
 * VIP Cam Router — Reconhecimento facial em tempo real
 * Suporte a webcam USB e câmera IP (RTSP/RTSPS)
 * Separação de dados por unidade (unitId)
 */
import { z } from 'zod';
import { eq, and, desc, sql, gte, lte, count, inArray } from 'drizzle-orm';
import { router, protectedProcedure, sysUserProcedure } from '../_core/trpc';
import { getDb } from '../db';
import {
  camClientes,
  camSentimentTimeline,
  camMetricasDiarias,
  camMetricasHorarias,
  camCameraConfig,
  gtAuditLog,
} from '../../drizzle/schema';
import { storagePut } from '../storage';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Retorna a data atual no fuso horário do Brasil (UTC-3) no formato YYYY-MM-DD.
 * Evita o problema de troca de dia às 21h UTC (meia-noite BRT).
 */
function todayBRT(): string {
  const now = new Date();
  // UTC-3: subtrai 3 horas
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

/**
 * Retorna a hora atual no fuso horário do Brasil (UTC-3).
 */
function hourBRT(): number {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.getUTCHours();
}

/**
 * Retorna o início e fim do mês atual no fuso Brasil (UTC-3) como objetos Date UTC.
 * Ex: para abril/2026, retorna início = 2026-04-01T03:00:00Z e fim = 2026-05-01T02:59:59Z
 */
function currentMonthRangeBRT(): { start: Date; end: Date; yearMonth: string } {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = brt.getUTCFullYear();
  const month = brt.getUTCMonth(); // 0-indexed
  // Início do mês em BRT = início do mês BRT convertido para UTC (adiciona 3h)
  const startBRT = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const startUTC = new Date(startBRT.getTime() + 3 * 60 * 60 * 1000);
  // Fim do mês em BRT = início do próximo mês BRT - 1ms, convertido para UTC
  const endBRT = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const endUTC = new Date(endBRT.getTime() + 3 * 60 * 60 * 1000 - 1);
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  return { start: startUTC, end: endUTC, yearMonth };
}

/**
 * Retorna o início e fim do dia atual no fuso Brasil (UTC-3) como objetos Date UTC.
 */
function todayRangeBRT(): { start: Date; end: Date } {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = brt.getUTCFullYear();
  const month = brt.getUTCMonth();
  const day = brt.getUTCDate();
  // Início do dia BRT convertido para UTC
  const startBRT = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const startUTC = new Date(startBRT.getTime() + 3 * 60 * 60 * 1000);
  // Fim do dia BRT convertido para UTC
  const endBRT = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  const endUTC = new Date(endBRT.getTime() + 3 * 60 * 60 * 1000);
  return { start: startUTC, end: endUTC };
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Calcula a distância euclidiana entre dois descritores faciais.
 * Threshold: 0.55 (abaixo = mesmo cliente)
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Aplica a regra de prioridade por PROPORÇÃO (Nível 2).
 *
 * Lógica anterior (otimista demais):
 *   1. Se houver QUALQUER "satisfied" → satisfied para sempre
 *   2. Se neutros >= insatisfeitos → neutral
 *   3. Caso contrário → unsatisfied
 *
 * Nova lógica (proporcional):
 *   1. Se insatisfeitos >= 30% do total → unsatisfied
 *   2. Se satisfeitos >= 40% do total (e insatisfeitos < 30%) → satisfied
 *   3. Caso contrário → neutral
 *
 * Isso reflete a experiência real do cliente ao longo do tempo,
 * sem que um único sorriso apague todo o histórico negativo.
 */
function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: string }>
): 'satisfied' | 'neutral' | 'unsatisfied' {
  const total = timeline.length;
  if (total === 0) return 'neutral';

  const satisfied = timeline.filter(t => t.satisfactionLevel === 'satisfied').length;
  const unsatisfied = timeline.filter(t => t.satisfactionLevel === 'unsatisfied').length;

  const pctUnsatisfied = unsatisfied / total;
  const pctSatisfied = satisfied / total;

  // Pelo menos 1 captura satisfeita → Satisfeito (reação positiva real prevalece)
  if (satisfied >= 1) return 'satisfied';

  // Sem nenhuma satisfeita: insatisfeito se >= 25% das capturas forem negativas
  if (pctUnsatisfied >= 0.25) return 'unsatisfied';

  // Neutro em todos os outros casos
  return 'neutral';
}

// ─────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────

export const vipCamRouter = router({

  // ── Configuração de câmera ──────────────────

  getCameraConfig: sysUserProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [config] = await db!
        .select()
        .from(camCameraConfig)
        .where(eq(camCameraConfig.unitId, input.unitId))
        .limit(1);
      return config ?? null;
    }),

  saveCameraConfig: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      cameraType: z.enum(['usb', 'ip']),
      rtspUrl: z.string().optional(),
      rtspLogin: z.string().optional(),
      rtspPassword: z.string().optional(),
      rtspProtocol: z.enum(['rtsp', 'rtsps']).optional(),
      active: z.boolean().optional(),
      detectionThreshold: z.string().optional(),
      cooldownSeconds: z.number().optional(),
      captureWindowMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db!
        .select({ id: camCameraConfig.id })
        .from(camCameraConfig)
        .where(eq(camCameraConfig.unitId, input.unitId))
        .limit(1);

      const data = {
        cameraType: input.cameraType,
        rtspUrl: input.rtspUrl ?? null,
        rtspLogin: input.rtspLogin ?? null,
        rtspPassword: input.rtspPassword ?? null,
        rtspProtocol: input.rtspProtocol ?? 'rtsp',
        active: input.active ?? true,
        detectionThreshold: input.detectionThreshold ?? '0.55',
        cooldownSeconds: input.cooldownSeconds ?? 4,
        captureWindowMs: input.captureWindowMs ?? 1500,
      };

      if (existing.length > 0) {
        await db!.update(camCameraConfig).set(data).where(eq(camCameraConfig.unitId, input.unitId));
      } else {
        await db!.insert(camCameraConfig).values({ unitId: input.unitId, ...data });
      }
      return { success: true };
    }),

  // ── Descritores faciais (cache) ─────────────

  getFaceDescriptors: sysUserProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Retorna apenas clientes com descriptor válido para o cache local
      const clientes = await db!
        .select({
          id: camClientes.id,
          faceDescriptor: camClientes.faceDescriptor,
          faceImageUrl: camClientes.faceImageUrl,
          satisfactionLevel: camClientes.satisfactionLevel,
          visitCount: camClientes.visitCount,
          lastSeenAt: camClientes.lastSeenAt,
          nome: camClientes.nome,
        })
        .from(camClientes)
        .where(
          and(
            eq(camClientes.unitId, input.unitId),
            sql`${camClientes.faceDescriptor} IS NOT NULL`
          )
        );
      return clientes;
    }),

  // ── Upload de imagem de rosto ───────────────

  uploadFaceImage: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      imageBase64: z.string(), // base64 da imagem (data:image/jpeg;base64,...)
    }))
    .mutation(async ({ input }) => {
      // Decodificar base64
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const key = `vip-cam/unit-${input.unitId}/faces/${randomSuffix()}.jpg`;
      const { url } = await storagePut(key, buffer, 'image/jpeg');
      return { url };
    }),

  // ── Salvar captura (cliente + timeline + métricas) ──

  saveCapture: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      // Dados do rosto detectado
      faceDescriptor: z.array(z.number()), // Float32Array como array
      satisfactionLevel: z.enum(['satisfied', 'neutral', 'unsatisfied']),
      expression: z.string(),
      confidence: z.number(),
      faceImageUrl: z.string().optional(),
      // Se já identificou o cliente (match no cache)
      existingClienteId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const todayStr = todayBRT(); // Data no fuso Brasil (UTC-3)
      const currentHour = hourBRT(); // Hora no fuso Brasil (UTC-3)

      let clienteId: number;
      let isNewCliente = false;

      if (input.existingClienteId) {
        // ── Cliente existente: atualizar descriptor e satisfação ──
        clienteId = input.existingClienteId;

        // Buscar dados atuais do cliente
        const [cliente] = await db!
          .select()
          .from(camClientes)
          .where(and(eq(camClientes.id, clienteId), eq(camClientes.unitId, input.unitId)))
          .limit(1);

        if (!cliente) throw new Error('Cliente não encontrado');

        // Atualizar descriptor: 70% velho + 30% novo
        const oldDescriptor = (cliente.faceDescriptor as number[]) ?? [];
        let newDescriptor = input.faceDescriptor;
        if (oldDescriptor.length === newDescriptor.length) {
          newDescriptor = oldDescriptor.map((v, i) => v * 0.7 + newDescriptor[i] * 0.3);
        }

        // Buscar histórico da timeline para calcular satisfação final
        const timeline = await db!
          .select({ satisfactionLevel: camSentimentTimeline.satisfactionLevel })
          .from(camSentimentTimeline)
          .where(and(
            eq(camSentimentTimeline.clienteId, clienteId),
            eq(camSentimentTimeline.unitId, input.unitId)
          ));

        // Adicionar a captura atual ao cálculo
        const allTimeline = [...timeline, { satisfactionLevel: input.satisfactionLevel }];
        const finalLevel = calcFinalSatisfactionLevel(allTimeline);

        // Verificar se é a primeira visita do dia (para incrementar visitCount)
        // Comparar lastSeenAt com a data atual no fuso Brasil
        const lastSeenDate = cliente.lastSeenAt
          ? (() => {
              const d = new Date(cliente.lastSeenAt);
              const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
              return brt.toISOString().slice(0, 10);
            })()
          : null;
        const isNewDay = lastSeenDate !== todayStr;

        // Atualizar foto apenas se o cliente ainda não tiver foto salva
        const shouldUpdatePhoto = !cliente.faceImageUrl && !!input.faceImageUrl;

        await db!.update(camClientes).set({
          faceDescriptor: newDescriptor,
          satisfactionLevel: finalLevel,
          expression: input.expression as any,
          confidenceScore: String(input.confidence),
          lastSeenAt: now,
          visitCount: isNewDay ? sql`${camClientes.visitCount} + 1` : undefined,
          // Atualizar foto se ainda não tiver
          ...(shouldUpdatePhoto ? { faceImageUrl: input.faceImageUrl, fotoUrl: input.faceImageUrl } : {}),
          // Compat legado
          expressao: finalLevel === 'satisfied' ? 'satisfeito' : finalLevel === 'neutral' ? 'neutro' : 'insatisfeito',
          totalVisitas: isNewDay ? sql`${camClientes.totalVisitas} + 1` : undefined,
          ultimaVisita: now,
          updatedAt: now,
        }).where(eq(camClientes.id, clienteId));

      } else {
        // ── Novo cliente ──
        isNewCliente = true;
        const [result] = await db!.insert(camClientes).values({
          unitId: input.unitId,
          faceDescriptor: input.faceDescriptor,
          faceImageUrl: input.faceImageUrl ?? null,
          satisfactionLevel: input.satisfactionLevel,
          expression: input.expression as any,
          confidenceScore: String(input.confidence),
          visitCount: 1,
          lastSeenAt: now,
          // Compat legado
          fotoUrl: input.faceImageUrl ?? null,
          expressao: input.satisfactionLevel === 'satisfied' ? 'satisfeito' : input.satisfactionLevel === 'neutral' ? 'neutro' : 'insatisfeito',
          totalVisitas: 1,
          ultimaVisita: now,
        });
        clienteId = (result as any).insertId;
      }

      // ── Inserir na timeline ──
      await db!.insert(camSentimentTimeline).values({
        unitId: input.unitId,
        clienteId,
        satisfactionLevel: input.satisfactionLevel,
        expression: input.expression,
        confidence: String(input.confidence),
        faceImageUrl: input.faceImageUrl ?? null,
        recordedAt: now,
      });

      // ── Atualizar métricas diárias ──
      const [existingMetric] = await db!
        .select()
        .from(camMetricasDiarias)
        .where(and(
          eq(camMetricasDiarias.unitId, input.unitId),
          eq(camMetricasDiarias.data, todayStr as any)
        ))
        .limit(1);

      const satisfiedInc = input.satisfactionLevel === 'satisfied' ? 1 : 0;
      const neutralInc = input.satisfactionLevel === 'neutral' ? 1 : 0;
      const unsatisfiedInc = input.satisfactionLevel === 'unsatisfied' ? 1 : 0;

      if (existingMetric) {
        await db!.update(camMetricasDiarias).set({
          totalDeteccoes: sql`${camMetricasDiarias.totalDeteccoes} + 1`,
          satisfeitos: sql`${camMetricasDiarias.satisfeitos} + ${satisfiedInc}`,
          neutros: sql`${camMetricasDiarias.neutros} + ${neutralInc}`,
          insatisfeitos: sql`${camMetricasDiarias.insatisfeitos} + ${unsatisfiedInc}`,
        }).where(and(
          eq(camMetricasDiarias.unitId, input.unitId),
          eq(camMetricasDiarias.data, todayStr as any)
        ));
      } else {
        await db!.insert(camMetricasDiarias).values({
          unitId: input.unitId,
          data: todayStr as any,
          totalDeteccoes: 1,
          satisfeitos: satisfiedInc,
          neutros: neutralInc,
          insatisfeitos: unsatisfiedInc,
        });
      }

      // ── Atualizar métricas horárias ──
      const [existingHourly] = await db!
        .select()
        .from(camMetricasHorarias)
        .where(and(
          eq(camMetricasHorarias.unitId, input.unitId),
          eq(camMetricasHorarias.data, todayStr as any),
          eq(camMetricasHorarias.hora, currentHour)
        ))
        .limit(1);

      if (existingHourly) {
        await db!.update(camMetricasHorarias).set({
          totalDeteccoes: sql`${camMetricasHorarias.totalDeteccoes} + 1`,
          satisfeitos: sql`${camMetricasHorarias.satisfeitos} + ${satisfiedInc}`,
          neutros: sql`${camMetricasHorarias.neutros} + ${neutralInc}`,
          insatisfeitos: sql`${camMetricasHorarias.insatisfeitos} + ${unsatisfiedInc}`,
        }).where(and(
          eq(camMetricasHorarias.unitId, input.unitId),
          eq(camMetricasHorarias.data, todayStr as any),
          eq(camMetricasHorarias.hora, currentHour)
        ));
      } else {
        await db!.insert(camMetricasHorarias).values({
          unitId: input.unitId,
          data: todayStr as any,
          hora: currentHour,
          totalDeteccoes: 1,
          satisfeitos: satisfiedInc,
          neutros: neutralInc,
          insatisfeitos: unsatisfiedInc,
        });
      }

      return { clienteId, isNewCliente };
    }),

  // ── Dashboard / KPIs ────────────────────────

  getDashboard: sysUserProcedure
    .input(z.object({
      unitId: z.number().optional(), // null = todas as unidades (admin)
      date: z.string().optional(),   // YYYY-MM-DD, default hoje BRT
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Usar fuso Brasil (UTC-3) para determinar a data atual
      const targetDate = input.date ?? todayBRT();

      // ── Métricas do dia (detecções) ──
      const whereUnit = input.unitId
        ? eq(camMetricasDiarias.unitId, input.unitId)
        : sql`1=1`;

      const dailyRows = await db!
        .select()
        .from(camMetricasDiarias)
        .where(and(
          whereUnit,
          eq(camMetricasDiarias.data, targetDate as any)
        ));

      const todayMetrics = dailyRows.reduce((acc, r) => ({
        totalDeteccoes: acc.totalDeteccoes + (r.totalDeteccoes ?? 0),
        satisfeitos: acc.satisfeitos + (r.satisfeitos ?? 0),
        neutros: acc.neutros + (r.neutros ?? 0),
        insatisfeitos: acc.insatisfeitos + (r.insatisfeitos ?? 0),
      }), { totalDeteccoes: 0, satisfeitos: 0, neutros: 0, insatisfeitos: 0 });

      // ── Clientes novos HOJE (fuso Brasil) ──
      const todayRange = todayRangeBRT();
      const whereClienteUnitNew = input.unitId
        ? and(eq(camClientes.unitId, input.unitId), gte(camClientes.createdAt, todayRange.start), lte(camClientes.createdAt, todayRange.end))
        : and(gte(camClientes.createdAt, todayRange.start), lte(camClientes.createdAt, todayRange.end));

      const [novosHojeRow] = await db!
        .select({ total: count() })
        .from(camClientes)
        .where(whereClienteUnitNew);

      // ── KPIs do MÊS ATUAL (baseados em camClientes, não em detecções) ──
      const monthRange = currentMonthRangeBRT();

      // Clientes únicos que visitaram no mês (lastSeenAt dentro do mês)
      const whereClientesMes = input.unitId
        ? and(eq(camClientes.unitId, input.unitId), gte(camClientes.lastSeenAt, monthRange.start), lte(camClientes.lastSeenAt, monthRange.end))
        : and(gte(camClientes.lastSeenAt, monthRange.start), lte(camClientes.lastSeenAt, monthRange.end));

      const [clientesMesRow] = await db!
        .select({ total: count() })
        .from(camClientes)
        .where(whereClientesMes);

      // Clientes novos no mês (createdAt dentro do mês)
      const whereNovosMes = input.unitId
        ? and(eq(camClientes.unitId, input.unitId), gte(camClientes.createdAt, monthRange.start), lte(camClientes.createdAt, monthRange.end))
        : and(gte(camClientes.createdAt, monthRange.start), lte(camClientes.createdAt, monthRange.end));

      const [novosMesRow] = await db!
        .select({ total: count() })
        .from(camClientes)
        .where(whereNovosMes);

      // Taxa de satisfação do mês: baseada nos clientes que visitaram no mês
      // Conta clientes por satisfactionLevel dentre os que visitaram no mês
      const clientesMesSatisf = await db!
        .select({
          satisfactionLevel: camClientes.satisfactionLevel,
          total: count(),
        })
        .from(camClientes)
        .where(whereClientesMes)
        .groupBy(camClientes.satisfactionLevel);

      const satisfMap = { satisfied: 0, neutral: 0, unsatisfied: 0 };
      for (const row of clientesMesSatisf) {
        if (row.satisfactionLevel === 'satisfied') satisfMap.satisfied = row.total;
        else if (row.satisfactionLevel === 'neutral') satisfMap.neutral = row.total;
        else if (row.satisfactionLevel === 'unsatisfied') satisfMap.unsatisfied = row.total;
      }
      const totalClientesMes = satisfMap.satisfied + satisfMap.neutral + satisfMap.unsatisfied;
      const satisfactionRateMes = totalClientesMes > 0
        ? Math.round((satisfMap.satisfied / totalClientesMes) * 100)
        : 0;

      // ── Total de detecções no mês (camMetricasDiarias) ──
      // Usa o range do mês BRT convertido para string de data (formato YYYY-MM-DD)
      const mesStartStr = monthRange.start.toISOString().slice(0, 10);
      const mesEndStr = monthRange.end.toISOString().slice(0, 10);

      const whereDeteccoesMes = input.unitId
        ? and(
            eq(camMetricasDiarias.unitId, input.unitId),
            gte(camMetricasDiarias.data, mesStartStr as any),
            lte(camMetricasDiarias.data, mesEndStr as any)
          )
        : and(
            gte(camMetricasDiarias.data, mesStartStr as any),
            lte(camMetricasDiarias.data, mesEndStr as any)
          );

      const deteccoesMesRows = await db!
        .select({ total: sql<number>`COALESCE(SUM(${camMetricasDiarias.totalDeteccoes}), 0)` })
        .from(camMetricasDiarias)
        .where(whereDeteccoesMes);

      const deteccoesMes = Number(deteccoesMesRows[0]?.total ?? 0);

      // ── Total geral de clientes na base ──
      const whereClienteUnit = input.unitId
        ? eq(camClientes.unitId, input.unitId)
        : sql`1=1`;

      const [totalClientesRow] = await db!
        .select({ total: count() })
        .from(camClientes)
        .where(whereClienteUnit);

      // ── Métricas dos últimos 7 dias (para gráfico de tendência) ──
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

      const whereUnit7 = input.unitId
        ? and(eq(camMetricasDiarias.unitId, input.unitId), gte(camMetricasDiarias.data, sevenDaysAgoStr as any))
        : gte(camMetricasDiarias.data, sevenDaysAgoStr as any);

      const last7Days = await db!
        .select()
        .from(camMetricasDiarias)
        .where(whereUnit7)
        .orderBy(camMetricasDiarias.data);

      // ── Métricas horárias de hoje ──
      const whereHourlyUnit = input.unitId
        ? and(eq(camMetricasHorarias.unitId, input.unitId), eq(camMetricasHorarias.data, targetDate as any))
        : eq(camMetricasHorarias.data, targetDate as any);

      const hourlyToday = await db!
        .select()
        .from(camMetricasHorarias)
        .where(whereHourlyUnit)
        .orderBy(camMetricasHorarias.hora);

      // ── Clientes únicos por hora do dia (via lastSeenAt em BRT) ──
      // lastSeenAt é UTC; converter para BRT subtraindo 3h: HOUR(DATE_SUB(lastSeenAt, INTERVAL 3 HOUR))
      const unitWhereStr = input.unitId ? `AND unitId = ${input.unitId}` : '';
      const clientesHoraRaw = await db!.execute(sql.raw(
        `SELECT HOUR(DATE_SUB(lastSeenAt, INTERVAL 3 HOUR)) as hora, COUNT(*) as total
         FROM cam_clientes
         WHERE DATE(DATE_SUB(lastSeenAt, INTERVAL 3 HOUR)) = '${targetDate}'
         ${unitWhereStr}
         GROUP BY HOUR(DATE_SUB(lastSeenAt, INTERVAL 3 HOUR))
         ORDER BY hora`
      ));
      // Drizzle execute retorna [[rows], metadata] — acessar rows corretamente
      const clientesHoraRows: Array<{ hora: number; total: number }> =
        (Array.isArray((clientesHoraRaw as any)[0]) ? (clientesHoraRaw as any)[0] : clientesHoraRaw) as any;

      // KPIs do dia baseados em clientes reais (lastSeenAt hoje BRT)
      const clientesHojeRaw = await db!.execute(sql.raw(
        `SELECT
           COUNT(*) as totalClientes,
           SUM(CASE WHEN satisfactionLevel = 'satisfied' THEN 1 ELSE 0 END) as satisfeitos,
           SUM(CASE WHEN satisfactionLevel = 'neutral' THEN 1 ELSE 0 END) as neutros,
           SUM(CASE WHEN satisfactionLevel = 'unsatisfied' THEN 1 ELSE 0 END) as insatisfeitos
         FROM cam_clientes
         WHERE DATE(DATE_SUB(lastSeenAt, INTERVAL 3 HOUR)) = '${targetDate}'
         ${unitWhereStr}`
      ));
      const clientesHojeRow: any =
        Array.isArray((clientesHojeRaw as any)[0])
          ? (clientesHojeRaw as any)[0][0]
          : (clientesHojeRaw as any)[0];

      const kpisHoje = {
        totalClientes: Number(clientesHojeRow?.totalClientes ?? 0),
        totalDeteccoes: todayMetrics.totalDeteccoes,
        satisfeitos: Number(clientesHojeRow?.satisfeitos ?? 0),
        neutros: Number(clientesHojeRow?.neutros ?? 0),
        insatisfeitos: Number(clientesHojeRow?.insatisfeitos ?? 0),
      };

      // Índice de satisfação do dia (para compatibilidade com gráfico horário)
      const satisfactionRateHoje = todayMetrics.totalDeteccoes > 0
        ? Math.round((todayMetrics.satisfeitos / todayMetrics.totalDeteccoes) * 100)
        : 0;

      return {
        today: {
          ...todayMetrics,
          satisfactionRate: satisfactionRateHoje,
          novosClientes: novosHojeRow?.total ?? 0,
        },
        // KPIs do mês (baseados em clientes reais + detecções)
        mes: {
          deteccoes: deteccoesMes,
          clientesUnicos: clientesMesRow?.total ?? 0,
          novosClientes: novosMesRow?.total ?? 0,
          satisfactionRate: satisfactionRateMes,
          satisfeitos: satisfMap.satisfied,
          neutros: satisfMap.neutral,
          insatisfeitos: satisfMap.unsatisfied,
          totalClientes: totalClientesMes,
          yearMonth: monthRange.yearMonth,
        },
        totalClientes: totalClientesRow?.total ?? 0,
        last7Days,
        hourlyToday,
        clientesUnicosPorHora: clientesHoraRows,
        kpisHoje,
      };
    }),

  // ── Lista de clientes ───────────────────────

  getClientes: sysUserProcedure
    .input(z.object({
      unitId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
      satisfactionLevel: z.enum(['satisfied', 'neutral', 'unsatisfied', 'all']).default('all'),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.unitId) conditions.push(eq(camClientes.unitId, input.unitId));
      if (input.satisfactionLevel !== 'all') {
        conditions.push(eq(camClientes.satisfactionLevel, input.satisfactionLevel));
      }
      if (input.search) {
        conditions.push(sql`${camClientes.nome} LIKE ${`%${input.search}%`}`);
      }

      const where = conditions.length > 0 ? and(...conditions) : sql`1=1`;

      const [totalRow] = await db!
        .select({ total: count() })
        .from(camClientes)
        .where(where);

      const clientes = await db!
        .select({
          id: camClientes.id,
          unitId: camClientes.unitId,
          nome: camClientes.nome,
          faceImageUrl: camClientes.faceImageUrl,
          fotoUrl: camClientes.fotoUrl,
          satisfactionLevel: camClientes.satisfactionLevel,
          expression: camClientes.expression,
          visitCount: camClientes.visitCount,
          lastSeenAt: camClientes.lastSeenAt,
          createdAt: camClientes.createdAt,
        })
        .from(camClientes)
        .where(where)
        .orderBy(desc(camClientes.lastSeenAt))
        .limit(input.limit)
        .offset(offset);

      // Calcular riskLevel para cada cliente:
      // "em_risco" quando: sem nenhuma captura satisfeita E neutros === insatisfeitos
      // (ou seja, uma única captura negativa a mais mudaria o status para insatisfeito)
      const clienteIds = clientes.map(c => c.id);
      const riskMap = new Map<number, 'em_risco' | 'seguro'>();

      if (clienteIds.length > 0) {
        // Buscar contagens agrupadas por cliente e nível de satisfação
        const counts = await db!
          .select({
            clienteId: camSentimentTimeline.clienteId,
            satisfactionLevel: camSentimentTimeline.satisfactionLevel,
            total: count(),
          })
          .from(camSentimentTimeline)
          .where(sql`${camSentimentTimeline.clienteId} IN (${sql.join(clienteIds.map(id => sql`${id}`), sql`, `)})`)
          .groupBy(camSentimentTimeline.clienteId, camSentimentTimeline.satisfactionLevel);

        // Agrupar por cliente
        const clienteCounts = new Map<number, { satisfied: number; neutral: number; unsatisfied: number }>();
        for (const row of counts) {
          if (!clienteCounts.has(row.clienteId)) {
            clienteCounts.set(row.clienteId, { satisfied: 0, neutral: 0, unsatisfied: 0 });
          }
          const c = clienteCounts.get(row.clienteId)!;
          if (row.satisfactionLevel === 'satisfied') c.satisfied += row.total;
          else if (row.satisfactionLevel === 'neutral') c.neutral += row.total;
          else if (row.satisfactionLevel === 'unsatisfied') c.unsatisfied += row.total;
        }

        for (const id of clienteIds) {
          const c = clienteCounts.get(id) ?? { satisfied: 0, neutral: 0, unsatisfied: 0 };
          // Em risco: sem satisfeito E neutros === insatisfeitos (empate — próxima captura negativa muda status)
          const isAtRisk = c.satisfied === 0 && c.neutral === c.unsatisfied && c.neutral > 0;
          riskMap.set(id, isAtRisk ? 'em_risco' : 'seguro');
        }
      }

      const clientesComRisco = clientes.map(c => ({
        ...c,
        riskLevel: riskMap.get(c.id) ?? 'seguro',
      }));

      return {
        clientes: clientesComRisco,
        total: totalRow?.total ?? 0,
        page: input.page,
        totalPages: Math.ceil((totalRow?.total ?? 0) / input.limit),
      };
    }),

  // ── Detalhes de um cliente ──────────────────

  getClienteDetail: sysUserProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cliente] = await db!
        .select()
        .from(camClientes)
        .where(and(eq(camClientes.id, input.id), eq(camClientes.unitId, input.unitId)))
        .limit(1);

      if (!cliente) throw new Error('Cliente não encontrado');

      // Histórico da timeline (últimas 50 capturas)
      const timeline = await db!
        .select()
        .from(camSentimentTimeline)
        .where(and(
          eq(camSentimentTimeline.clienteId, input.id),
          eq(camSentimentTimeline.unitId, input.unitId)
        ))
        .orderBy(desc(camSentimentTimeline.recordedAt))
        .limit(50);

      return { cliente, timeline };
    }),

  // ── Atualizar dados do cliente ──────────────

  updateCliente: sysUserProcedure
    .input(z.object({
      id: z.number(),
      unitId: z.number(),
      nome: z.string().optional(),
      email: z.string().optional(),
      telefone: z.string().optional(),
      faixaEtaria: z.string().optional(),
      genero: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, unitId, ...data } = input;
      await db!.update(camClientes).set(data).where(
        and(eq(camClientes.id, id), eq(camClientes.unitId, unitId))
      );
      return { success: true };
    }),

  // ── Métricas detalhadas ─────────────────────

  getMetricas: sysUserProcedure
    .input(z.object({
      unitId: z.number().optional(),
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const whereDaily = input.unitId
        ? and(
            eq(camMetricasDiarias.unitId, input.unitId),
            gte(camMetricasDiarias.data, input.startDate as any),
            lte(camMetricasDiarias.data, input.endDate as any)
          )
        : and(
            gte(camMetricasDiarias.data, input.startDate as any),
            lte(camMetricasDiarias.data, input.endDate as any)
          );

      const daily = await db!
        .select()
        .from(camMetricasDiarias)
        .where(whereDaily)
        .orderBy(camMetricasDiarias.data);

      const whereHourly = input.unitId
        ? and(
            eq(camMetricasHorarias.unitId, input.unitId),
            gte(camMetricasHorarias.data, input.startDate as any),
            lte(camMetricasHorarias.data, input.endDate as any)
          )
        : and(
            gte(camMetricasHorarias.data, input.startDate as any),
            lte(camMetricasHorarias.data, input.endDate as any)
          );

      const hourly = await db!
        .select()
        .from(camMetricasHorarias)
        .where(whereHourly)
        .orderBy(camMetricasHorarias.data, camMetricasHorarias.hora);

      // Totais do período
      const totals = daily.reduce((acc, r) => ({
        totalDeteccoes: acc.totalDeteccoes + (r.totalDeteccoes ?? 0),
        satisfeitos: acc.satisfeitos + (r.satisfeitos ?? 0),
        neutros: acc.neutros + (r.neutros ?? 0),
        insatisfeitos: acc.insatisfeitos + (r.insatisfeitos ?? 0),
      }), { totalDeteccoes: 0, satisfeitos: 0, neutros: 0, insatisfeitos: 0 });

      const satisfactionRate = totals.totalDeteccoes > 0
        ? Math.round((totals.satisfeitos / totals.totalDeteccoes) * 100)
        : 0;

      // ── Clientes únicos por dia (via lastSeenAt em camClientes) ──
      // Converte startDate/endDate (YYYY-MM-DD BRT) para range UTC
      // Adiciona 3h para converter BRT → UTC (início do dia BRT = 03:00 UTC)
      const startUTC = new Date(input.startDate + 'T03:00:00Z');
      // Fim do dia endDate BRT = endDate+1 02:59:59 UTC
      const endUTC = new Date(input.endDate + 'T02:59:59Z');
      endUTC.setDate(endUTC.getDate() + 1);

      const whereClientesPeriodo = input.unitId
        ? and(
            eq(camClientes.unitId, input.unitId),
            gte(camClientes.lastSeenAt, startUTC),
            lte(camClientes.lastSeenAt, endUTC)
          )
        : and(
            gte(camClientes.lastSeenAt, startUTC),
            lte(camClientes.lastSeenAt, endUTC)
          );

      // Busca todos os clientes que visitaram no período com seu lastSeenAt
      const clientesNoPeriodo = await db!
        .select({
          id: camClientes.id,
          lastSeenAt: camClientes.lastSeenAt,
          satisfactionLevel: camClientes.satisfactionLevel,
        })
        .from(camClientes)
        .where(whereClientesPeriodo);

      // Agrupa por dia BRT (subtrai 3h para converter UTC → BRT)
      const clientesPorDiaMap = new Map<string, { total: number; satisfeitos: number; neutros: number; insatisfeitos: number }>();
      for (const c of clientesNoPeriodo) {
        if (!c.lastSeenAt) continue;
        const brt = new Date(new Date(c.lastSeenAt).getTime() - 3 * 60 * 60 * 1000);
        const dia = brt.toISOString().slice(0, 10);
        const entry = clientesPorDiaMap.get(dia) ?? { total: 0, satisfeitos: 0, neutros: 0, insatisfeitos: 0 };
        entry.total++;
        if (c.satisfactionLevel === 'satisfied') entry.satisfeitos++;
        else if (c.satisfactionLevel === 'neutral') entry.neutros++;
        else entry.insatisfeitos++;
        clientesPorDiaMap.set(dia, entry);
      }

      // Garante que o dia atual (BRT) está incluído mesmo sem dados
      const todayKey = todayBRT();
      if (!clientesPorDiaMap.has(todayKey)) {
        clientesPorDiaMap.set(todayKey, { total: 0, satisfeitos: 0, neutros: 0, insatisfeitos: 0 });
      }

      // Ordena por data
      const clientesPorDia = Array.from(clientesPorDiaMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, v]) => ({ data, ...v }));

      // ── Totais por base de clientes (satisfactionLevel de camClientes) ──
      // Conta todos os clientes da unidade (sem filtro de período)
      // pois satisfactionLevel é o estado atual consolidado do cliente
      const whereClientesBase = input.unitId
        ? eq(camClientes.unitId, input.unitId)
        : sql`1=1`;

      const clientesBase = await db!
        .select({
          satisfactionLevel: camClientes.satisfactionLevel,
          total: count(),
        })
        .from(camClientes)
        .where(whereClientesBase)
        .groupBy(camClientes.satisfactionLevel);

      const clientesTotals = clientesBase.reduce(
        (acc, r) => {
          const n = Number(r.total);
          if (r.satisfactionLevel === 'satisfied') acc.satisfeitos += n;
          else if (r.satisfactionLevel === 'neutral') acc.neutros += n;
          else acc.insatisfeitos += n;
          acc.totalClientes += n;
          return acc;
        },
        { satisfeitos: 0, neutros: 0, insatisfeitos: 0, totalClientes: 0 }
      );

      const satisfactionRateClientes = clientesTotals.totalClientes > 0
        ? Math.round((clientesTotals.satisfeitos / clientesTotals.totalClientes) * 100)
        : 0;

      return {
        daily,
        hourly,
        totals: { ...totals, satisfactionRate },
        clientesPorDia,
        clientesTotals: { ...clientesTotals, satisfactionRate: satisfactionRateClientes },
      };
    }),

  // ── Timeline paginada ───────────────────────

  getTimeline: sysUserProcedure
    .input(z.object({
      unitId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.unitId) conditions.push(eq(camSentimentTimeline.unitId, input.unitId));
      if (input.startDate) {
        conditions.push(gte(camSentimentTimeline.recordedAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(camSentimentTimeline.recordedAt, new Date(input.endDate + 'T23:59:59Z')));
      }

      const where = conditions.length > 0 ? and(...conditions) : sql`1=1`;

      const [totalRow] = await db!
        .select({ total: count() })
        .from(camSentimentTimeline)
        .where(where);

      const timeline = await db!
        .select()
        .from(camSentimentTimeline)
        .where(where)
        .orderBy(desc(camSentimentTimeline.recordedAt))
        .limit(input.limit)
        .offset(offset);

      return {
        timeline,
        total: totalRow?.total ?? 0,
        page: input.page,
        totalPages: Math.ceil((totalRow?.total ?? 0) / input.limit),
      };
    }),

  // ── Recalcular satisfação de todos os clientes da unidade ──
  // Percorre todos os clientes e reaplica a regra de prioridade positiva
  // usando o histórico completo de capturas de cada um.
  recalcAllClients: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      orgId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Buscar todos os clientes da unidade
      const clientes = await db!
        .select({ id: camClientes.id })
        .from(camClientes)
        .where(eq(camClientes.unitId, input.unitId));

      let updated = 0;
      for (const cliente of clientes) {
        // Buscar todo o histórico de capturas do cliente
        const timeline = await db!
          .select({ satisfactionLevel: camSentimentTimeline.satisfactionLevel })
          .from(camSentimentTimeline)
          .where(and(
            eq(camSentimentTimeline.clienteId, cliente.id),
            eq(camSentimentTimeline.unitId, input.unitId)
          ));

        if (timeline.length === 0) continue;

        // Aplicar a regra de prioridade positiva
        const finalLevel = calcFinalSatisfactionLevel(timeline);
        const expressaoLegado = finalLevel === 'satisfied' ? 'satisfeito'
          : finalLevel === 'neutral' ? 'neutro' : 'insatisfeito';

        await db!.update(camClientes).set({
          satisfactionLevel: finalLevel,
          expressao: expressaoLegado,
          updatedAt: new Date(),
        }).where(and(
          eq(camClientes.id, cliente.id),
          eq(camClientes.unitId, input.unitId)
        ));
        updated++;
      }

      // Registrar auditoria do recálculo
      try {
        const orgId = input.orgId ?? input.unitId;
        await db!.insert(gtAuditLog).values({
          orgId,
          unitId: input.unitId,
          userId: ctx.user!.id,
          userName: ctx.user!.name ?? 'Usuário',
          acao: 'recalc',
          entidade: 'vip_cam_satisfaction',
          descricao: `Recálculo de satisfação em lote: ${updated} de ${clientes.length} clientes atualizados (regra SenseVIP)`,
        });
      } catch { /* não bloquear por falha de auditoria */ }

      return { updated, total: clientes.length };
    }),

  // ── Histórico de recálculos de satisfação ──
  // Lista os últimos recálculos registrados na tabela de auditoria para a unidade.
  getRecalcHistory: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      limit: z.number().default(10),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const history = await db!
        .select({
          id: gtAuditLog.id,
          userId: gtAuditLog.userId,
          userName: gtAuditLog.userName,
          descricao: gtAuditLog.descricao,
          createdAt: gtAuditLog.createdAt,
        })
        .from(gtAuditLog)
        .where(and(
          eq(gtAuditLog.unitId, input.unitId),
          eq(gtAuditLog.entidade, 'vip_cam_satisfaction'),
          eq(gtAuditLog.acao, 'recalc')
        ))
        .orderBy(desc(gtAuditLog.createdAt))
        .limit(input.limit);
      return history;
    }),

  // ── Clientes únicos do dia com satisfação calculada pela regra de prioridade ──
  // Retorna contagem de satisfeitos/neutros/insatisfeitos únicos de um dia,
  // aplicando a regra: satisfeito permanente > neutro >= insatisfeito > insatisfeito
  getDailyUniqueStats: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      date: z.string().optional(), // YYYY-MM-DD, default hoje
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const targetDate = input.date ?? new Date().toISOString().slice(0, 10);
      const startOfDay = new Date(targetDate + 'T00:00:00Z');
      const endOfDay = new Date(targetDate + 'T23:59:59Z');

      // Buscar todas as capturas do dia agrupadas por cliente
      const capturasDoDia = await db!
        .select({
          clienteId: camSentimentTimeline.clienteId,
          satisfactionLevel: camSentimentTimeline.satisfactionLevel,
        })
        .from(camSentimentTimeline)
        .where(and(
          eq(camSentimentTimeline.unitId, input.unitId),
          gte(camSentimentTimeline.recordedAt, startOfDay),
          lte(camSentimentTimeline.recordedAt, endOfDay)
        ));

      // Agrupar por cliente e aplicar a regra de prioridade
      const clienteMap = new Map<number, Array<{ satisfactionLevel: string }>>();
      for (const captura of capturasDoDia) {
        if (!clienteMap.has(captura.clienteId)) {
          clienteMap.set(captura.clienteId, []);
        }
        clienteMap.get(captura.clienteId)!.push({ satisfactionLevel: captura.satisfactionLevel });
      }

      let satisfeitos = 0;
      let neutros = 0;
      let insatisfeitos = 0;
      for (const timeline of Array.from(clienteMap.values())) {
        const level = calcFinalSatisfactionLevel(timeline);
        if (level === 'satisfied') satisfeitos++;
        else if (level === 'neutral') neutros++;
        else insatisfeitos++;
      }

      return {
        date: targetDate,
        totalUnicos: clienteMap.size,
        satisfeitos,
        neutros,
        insatisfeitos,
        satisfactionRate: clienteMap.size > 0
          ? Math.round((satisfeitos / clienteMap.size) * 100)
          : 0,
      };
    }),

  // ── Reclassificar histórico completo com novos thresholds ──
  // Usa SQL nativo em batch para evitar timeout em bases grandes.
  // Etapa 1: UPDATE da timeline via CASE WHEN (1 query total)
  // Etapa 2: Recalc de clientes em chunks de 500 (N/500 queries)
  reclassifyAllHistory: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      orgId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // ── Etapa 1: Reclassificar a timeline inteira com 1 query SQL nativa ──
      // Regras por expression+confidence com thresholds Nível 1 (reduzidos):
      //   happy >= 0.35 → satisfied
      //   angry >= 0.35 → unsatisfied  (era 0.55)
      //   disgusted >= 0.35 → unsatisfied  (era 0.50)
      //   sad >= 0.45 → unsatisfied  (era 0.60)
      //   qualquer outra coisa → neutral
      const timelineResult = await db!.execute(sql`
        UPDATE cam_sentiment_timeline
        SET satisfactionLevel = CASE
          WHEN expression = 'happy'     AND CAST(confidence AS DECIMAL(10,4)) >= 0.12 THEN 'satisfied'
          WHEN expression = 'angry'     AND CAST(confidence AS DECIMAL(10,4)) >= 0.30 THEN 'unsatisfied'
          WHEN expression = 'disgusted' AND CAST(confidence AS DECIMAL(10,4)) >= 0.30 THEN 'unsatisfied'
          WHEN expression = 'sad'       AND CAST(confidence AS DECIMAL(10,4)) >= 0.40 THEN 'unsatisfied'
          ELSE 'neutral'
        END
        WHERE unitId = ${input.unitId}
      `);
      const timelineUpdated = (timelineResult as any)?.[0]?.affectedRows ?? 0;

      // ── Etapa 2: Buscar total de registros da timeline para o relatório ──
      const [totalRow] = await db!.execute(sql`
        SELECT COUNT(*) as total FROM cam_sentiment_timeline WHERE unitId = ${input.unitId}
      `) as any;
      const timelineTotal = Number(totalRow?.[0]?.total ?? 0);

      // ── Etapa 3: Recalcular status final de cada cliente (chunks de 500) ──
      // Busca todos os clientes da unidade sem limite
      const clientes = await db!
        .select({ id: camClientes.id })
        .from(camClientes)
        .where(eq(camClientes.unitId, input.unitId));

      let clientesUpdated = 0;
      const CHUNK = 500;

      for (let i = 0; i < clientes.length; i += CHUNK) {
        const chunk = clientes.slice(i, i + CHUNK);
        const clienteIds = chunk.map(c => c.id);

        // Buscar toda a timeline deste chunk de clientes de uma vez
        const timelines = await db!
          .select({
            clienteId: camSentimentTimeline.clienteId,
            satisfactionLevel: camSentimentTimeline.satisfactionLevel,
          })
          .from(camSentimentTimeline)
          .where(and(
            inArray(camSentimentTimeline.clienteId, clienteIds),
            eq(camSentimentTimeline.unitId, input.unitId)
          ));

        // Agrupar por cliente
        const byCliente = new Map<number, string[]>();
        for (const t of timelines) {
          if (!byCliente.has(t.clienteId)) byCliente.set(t.clienteId, []);
          byCliente.get(t.clienteId)!.push(t.satisfactionLevel);
        }

        // Atualizar cada cliente com o status final calculado
        for (const clienteId of clienteIds) {
          const levels = byCliente.get(clienteId);
          if (!levels || levels.length === 0) continue;

          const tl = levels.map(s => ({ satisfactionLevel: s }));
          const finalLevel = calcFinalSatisfactionLevel(tl);
          const expressaoLegado = finalLevel === 'satisfied' ? 'satisfeito'
            : finalLevel === 'neutral' ? 'neutro' : 'insatisfeito';

          await db!.update(camClientes).set({
            satisfactionLevel: finalLevel,
            expressao: expressaoLegado,
            updatedAt: new Date(),
          }).where(and(
            eq(camClientes.id, clienteId),
            eq(camClientes.unitId, input.unitId)
          ));
          clientesUpdated++;
        }
      }

      // ── Registrar auditoria ──
      try {
        const orgId = input.orgId ?? input.unitId;
        await db!.insert(gtAuditLog).values({
          orgId,
          unitId: input.unitId,
          userId: ctx.user!.id,
          userName: ctx.user!.name ?? 'Usuário',
          acao: 'recalc',
          entidade: 'vip_cam_satisfaction',
          descricao: `Reclassificação histórica completa (Nível 2 — proporcional, happy≥0.20, 25%/30%): ${timelineTotal} capturas processadas (${timelineUpdated} alteradas), ${clientesUpdated} clientes recalculados`,
        });
      } catch { /* não bloquear por falha de auditoria */ }

      return {
        timelineTotal,
        timelineUpdated,
        clientesTotal: clientes.length,
        clientesUpdated,
      };
    }),

  // ── Capturas recentes (painel ao vivo da câmera IP) ──
  getRecentCaptures: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const captures = await db!
        .select({
          id: camSentimentTimeline.id,
          clienteId: camSentimentTimeline.clienteId,
          satisfactionLevel: camSentimentTimeline.satisfactionLevel,
          expression: camSentimentTimeline.expression,
          confidence: camSentimentTimeline.confidence,
          recordedAt: camSentimentTimeline.recordedAt,
        })
        .from(camSentimentTimeline)
        .where(eq(camSentimentTimeline.unitId, input.unitId))
        .orderBy(desc(camSentimentTimeline.recordedAt))
        .limit(input.limit);
      // Métricas de hoje (BRT)
      const todayStr = (() => {
        const now = new Date();
        const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        return brt.toISOString().slice(0, 10);
      })();
      const [metric] = await db!
        .select()
        .from(camMetricasDiarias)
        .where(and(
          eq(camMetricasDiarias.unitId, input.unitId),
          eq(camMetricasDiarias.data, todayStr as any)
        ))
        .limit(1);
      return {
        captures,
        todayStats: metric ? {
          total: Number(metric.totalDeteccoes),
          satisfied: Number(metric.satisfeitos),
          neutral: Number(metric.neutros),
          unsatisfied: Number(metric.insatisfeitos),
        } : { total: 0, satisfied: 0, neutral: 0, unsatisfied: 0 },
      };
    }),
});

