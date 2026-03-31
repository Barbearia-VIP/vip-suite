/**
 * We Send — Router tRPC para gerenciamento de campanhas WhatsApp via WAHA API
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { wsConfig, wsCampanhas, wsContatos, wsTemplates, wsListasContatos, wsListaItens } from "../../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Helpers WAHA API ────────────────────────────────────────────────────────
async function wahaRequest(
  baseUrl: string,
  apiKey: string | null | undefined,
  method: string,
  path: string,
  body?: any
) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: { message: text } };
  }
}

// Formatar número de telefone para o formato WAHA (5548999990001@c.us)
function formatChatId(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, "");
  // Adiciona código do Brasil se não tiver
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `${withCountry}@c.us`;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const weSendRouter = router({
  // ── Configuração WAHA ─────────────────────────────────────────────────────
  getConfig: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      return config || null;
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      wahaUrl: z.string().url("URL inválida"),
      wahaApiKey: z.string().optional(),
      sessionName: z.string().min(1).default("default"),
      intervaloSegundos: z.number().min(1).max(60).default(3),
      horarioInicio: z.string().default("09:00"),
      horarioFim: z.string().default("18:00"),
      maxEnviosDia: z.number().min(1).max(10000).default(500),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select({ id: wsConfig.id }).from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (existing.length > 0) {
        await db.update(wsConfig).set({
          wahaUrl: input.wahaUrl,
          wahaApiKey: input.wahaApiKey || null,
          sessionName: input.sessionName,
          intervaloSegundos: input.intervaloSegundos,
          horarioInicio: input.horarioInicio,
          horarioFim: input.horarioFim,
          maxEnviosDia: input.maxEnviosDia,
          updatedAt: new Date(),
        }).where(eq(wsConfig.unitId, input.unitId));
      } else {
        await db.insert(wsConfig).values({
          unitId: input.unitId,
          wahaUrl: input.wahaUrl,
          wahaApiKey: input.wahaApiKey || null,
          sessionName: input.sessionName,
          intervaloSegundos: input.intervaloSegundos,
          horarioInicio: input.horarioInicio,
          horarioFim: input.horarioFim,
          maxEnviosDia: input.maxEnviosDia,
        });
      }
      return { success: true };
    }),

  // ── Status da sessão WAHA ─────────────────────────────────────────────────
  getSessionStatus: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (!config) return { status: "NOT_CONFIGURED", qrCode: null };
      try {
        const result = await wahaRequest(config.wahaUrl, config.wahaApiKey, "GET", `/api/sessions/${config.sessionName}`);
        if (!result.ok) return { status: "UNREACHABLE", qrCode: null, error: "Servidor WAHA não encontrado" };
        return {
          status: result.data.status || "UNKNOWN",
          qrCode: result.data.qrCode || null,
          me: result.data.me || null,
        };
      } catch (err: any) {
        return { status: "UNREACHABLE", qrCode: null, error: err.message };
      }
    }),

  getQrCode: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configure o servidor WAHA primeiro" });
      try {
        const result = await wahaRequest(config.wahaUrl, config.wahaApiKey, "GET", `/api/${config.sessionName}/auth/qr?format=image`);
        if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível obter o QR Code" });
        return { qrCode: result.data };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  startSession: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configure o servidor WAHA primeiro" });
      try {
        const result = await wahaRequest(config.wahaUrl, config.wahaApiKey, "POST", `/api/sessions`, {
          name: config.sessionName,
          start: true,
        });
        return { success: result.ok, status: result.data?.status, message: result.data?.message };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  stopSession: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        const result = await wahaRequest(config.wahaUrl, config.wahaApiKey, "DELETE", `/api/sessions/${config.sessionName}`);
        return { success: result.ok };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Templates ─────────────────────────────────────────────────────────────
  getTemplates: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(wsTemplates).where(eq(wsTemplates.unitId, input.unitId)).orderBy(desc(wsTemplates.createdAt));
    }),

  saveTemplate: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      unitId: z.number(),
      nome: z.string().min(1),
      conteudo: z.string().min(1),
      tipo: z.enum(["texto", "imagem", "arquivo"]).default("texto"),
      mediaUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        await db.update(wsTemplates).set({
          nome: input.nome,
          conteudo: input.conteudo,
          tipo: input.tipo,
          mediaUrl: input.mediaUrl || null,
          updatedAt: new Date(),
        }).where(and(eq(wsTemplates.id, input.id), eq(wsTemplates.unitId, input.unitId)));
      } else {
        await db.insert(wsTemplates).values({
          unitId: input.unitId,
          nome: input.nome,
          conteudo: input.conteudo,
          tipo: input.tipo,
          mediaUrl: input.mediaUrl || null,
        });
      }
      return { success: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(wsTemplates).where(and(eq(wsTemplates.id, input.id), eq(wsTemplates.unitId, input.unitId)));
      return { success: true };
    }),

  // ── Listas de Contatos ────────────────────────────────────────────────────
  getListas: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(wsListasContatos).where(eq(wsListasContatos.unitId, input.unitId)).orderBy(desc(wsListasContatos.createdAt));
    }),

  saveLista: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      unitId: z.number(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        await db.update(wsListasContatos).set({
          nome: input.nome,
          descricao: input.descricao || null,
          updatedAt: new Date(),
        }).where(and(eq(wsListasContatos.id, input.id), eq(wsListasContatos.unitId, input.unitId)));
        return { success: true };
      } else {
        const [result] = await db.insert(wsListasContatos).values({
          unitId: input.unitId,
          nome: input.nome,
          descricao: input.descricao || null,
        });
        return { success: true, id: (result as any).insertId };
      }
    }),

  deleteLista: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(wsListaItens).where(eq(wsListaItens.listaId, input.id));
      await db.delete(wsListasContatos).where(and(eq(wsListasContatos.id, input.id), eq(wsListasContatos.unitId, input.unitId)));
      return { success: true };
    }),

  getListaItens: protectedProcedure
    .input(z.object({ listaId: z.number(), unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(wsListaItens).where(and(eq(wsListaItens.listaId, input.listaId), eq(wsListaItens.unitId, input.unitId)));
    }),

  importarContatos: protectedProcedure
    .input(z.object({
      listaId: z.number(),
      unitId: z.number(),
      contatos: z.array(z.object({
        nome: z.string().optional(),
        telefone: z.string(),
        variaveis: z.record(z.string(), z.string()).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let importados = 0;
      for (const c of input.contatos) {
        const phone = c.telefone.replace(/\D/g, "");
        if (phone.length < 8) continue;
        await db.insert(wsListaItens).values({
          listaId: input.listaId,
          unitId: input.unitId,
          nome: c.nome || null,
          telefone: phone,
          variaveis: c.variaveis ? JSON.stringify(c.variaveis) : null,
        });
        importados++;
      }
      // Atualizar contador
      await db.update(wsListasContatos).set({
        totalContatos: sql`(SELECT COUNT(*) FROM ws_lista_itens WHERE listaId = ${input.listaId})` as any,
        updatedAt: new Date(),
      }).where(eq(wsListasContatos.id, input.listaId));
      return { importados };
    }),

  // ── Campanhas ─────────────────────────────────────────────────────────────
  getCampanhas: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(wsCampanhas).where(eq(wsCampanhas.unitId, input.unitId)).orderBy(desc(wsCampanhas.createdAt));
    }),

  getCampanha: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [campanha] = await db.select().from(wsCampanhas).where(and(eq(wsCampanhas.id, input.id), eq(wsCampanhas.unitId, input.unitId))).limit(1);
      if (!campanha) throw new TRPCError({ code: "NOT_FOUND" });
      const contatos = await db.select().from(wsContatos).where(eq(wsContatos.campanhaId, input.id));
      return { ...campanha, contatos };
    }),

  criarCampanha: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      mensagem: z.string().min(1),
      tipo: z.enum(["texto", "imagem", "arquivo"]).default("texto"),
      mediaUrl: z.string().optional(),
      intervaloSegundos: z.number().min(1).max(60).default(3),
      agendadaPara: z.string().optional(),
      contatos: z.array(z.object({
        nome: z.string().optional(),
        telefone: z.string(),
        variaveis: z.record(z.string(), z.string()).optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(wsCampanhas).values({
        unitId: input.unitId,
        nome: input.nome,
        descricao: input.descricao || null,
        mensagem: input.mensagem,
        tipo: input.tipo,
        mediaUrl: input.mediaUrl || null,
        intervaloSegundos: input.intervaloSegundos,
        agendadaPara: input.agendadaPara ? new Date(input.agendadaPara) : null,
        totalContatos: input.contatos.length,
        criadoPor: ctx.user?.name || "Sistema",
        status: "rascunho",
      });
      const campanhaId = (result as any).insertId;
      // Inserir contatos
      for (const c of input.contatos) {
        const phone = c.telefone.replace(/\D/g, "");
        if (phone.length < 8) continue;
        // Personalizar mensagem com variáveis
        let msg = input.mensagem;
        if (c.variaveis) {
          for (const [key, val] of Object.entries(c.variaveis)) {
            msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
          }
        }
        if (c.nome) msg = msg.replace(/\{nome\}/g, c.nome);
        await db.insert(wsContatos).values({
          campanhaId,
          unitId: input.unitId,
          nome: c.nome || null,
          telefone: phone,
          variaveis: c.variaveis ? JSON.stringify(c.variaveis) : null,
          mensagemPersonalizada: msg,
          status: "pendente",
        });
      }
      return { success: true, campanhaId };
    }),

  deleteCampanha: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(wsContatos).where(eq(wsContatos.campanhaId, input.id));
      await db.delete(wsCampanhas).where(and(eq(wsCampanhas.id, input.id), eq(wsCampanhas.unitId, input.unitId)));
      return { success: true };
    }),

  // ── Envio de campanha ─────────────────────────────────────────────────────
  enviarCampanha: protectedProcedure
    .input(z.object({ campanhaId: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Buscar configuração WAHA
      const [config] = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configure o servidor WAHA primeiro em Configurações" });
      // Verificar sessão ativa
      const sessionRes = await wahaRequest(config.wahaUrl, config.wahaApiKey, "GET", `/api/sessions/${config.sessionName}`);
      if (!sessionRes.ok || sessionRes.data?.status !== "WORKING") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A sessão WhatsApp não está ativa. Escaneie o QR Code primeiro." });
      }
      // Buscar campanha e contatos pendentes
      const [campanha] = await db.select().from(wsCampanhas).where(and(eq(wsCampanhas.id, input.campanhaId), eq(wsCampanhas.unitId, input.unitId))).limit(1);
      if (!campanha) throw new TRPCError({ code: "NOT_FOUND" });
      const contatosPendentes = await db.select().from(wsContatos).where(and(eq(wsContatos.campanhaId, input.campanhaId), eq(wsContatos.status, "pendente")));
      if (contatosPendentes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contato pendente nesta campanha" });
      // Marcar campanha como em andamento
      await db.update(wsCampanhas).set({
        status: "em_andamento",
        iniciadaEm: new Date(),
        updatedAt: new Date(),
      }).where(eq(wsCampanhas.id, input.campanhaId));
      // Enviar mensagens em background (sem await para não bloquear)
      const intervalo = (campanha.intervaloSegundos || config.intervaloSegundos || 3) * 1000;
      let enviados = 0, falhas = 0;
      const enviarEmBackground = async () => {
        for (const contato of contatosPendentes) {
          const chatId = formatChatId(contato.telefone);
          const mensagem = contato.mensagemPersonalizada || campanha.mensagem;
          try {
            const res = await wahaRequest(config.wahaUrl, config.wahaApiKey, "POST", "/api/sendText", {
              session: config.sessionName,
              chatId,
              text: mensagem,
            });
            if (res.ok) {
              enviados++;
              await db.update(wsContatos).set({
                status: "enviado",
                enviadoEm: new Date(),
                messageId: res.data?.id || null,
              }).where(eq(wsContatos.id, contato.id));
            } else {
              falhas++;
              await db.update(wsContatos).set({
                status: "falha",
                erroMensagem: res.data?.message || "Erro desconhecido",
              }).where(eq(wsContatos.id, contato.id));
            }
          } catch (err: any) {
            falhas++;
            await db.update(wsContatos).set({
              status: "falha",
              erroMensagem: err.message,
            }).where(eq(wsContatos.id, contato.id));
          }
          // Atualizar métricas da campanha
          await db.update(wsCampanhas).set({
            totalEnviados: enviados,
            totalFalhas: falhas,
            updatedAt: new Date(),
          }).where(eq(wsCampanhas.id, input.campanhaId));
          // Aguardar intervalo entre envios
          if (contato !== contatosPendentes[contatosPendentes.length - 1]) {
            await new Promise(r => setTimeout(r, intervalo));
          }
        }
        // Marcar campanha como concluída
        await db.update(wsCampanhas).set({
          status: "concluida",
          concluidaEm: new Date(),
          totalEnviados: enviados,
          totalFalhas: falhas,
          updatedAt: new Date(),
        }).where(eq(wsCampanhas.id, input.campanhaId));
      };
      // Executar em background sem bloquear a resposta
      enviarEmBackground().catch(console.error);
      return {
        success: true,
        message: `Iniciando envio para ${contatosPendentes.length} contatos`,
        total: contatosPendentes.length,
      };
    }),

  pausarCampanha: protectedProcedure
    .input(z.object({ campanhaId: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(wsCampanhas).set({ status: "pausada", updatedAt: new Date() }).where(and(eq(wsCampanhas.id, input.campanhaId), eq(wsCampanhas.unitId, input.unitId)));
      return { success: true };
    }),

  // ── Dashboard / Métricas ──────────────────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const campanhas = await db.select().from(wsCampanhas).where(eq(wsCampanhas.unitId, input.unitId));
      const config = await db.select().from(wsConfig).where(eq(wsConfig.unitId, input.unitId)).limit(1);
      const totalCampanhas = campanhas.length;
      const campanhasAtivas = campanhas.filter(c => c.status === "em_andamento").length;
      const totalEnviados = campanhas.reduce((s, c) => s + (c.totalEnviados || 0), 0);
      const totalFalhas = campanhas.reduce((s, c) => s + (c.totalFalhas || 0), 0);
      const taxaSucesso = totalEnviados > 0 ? Math.round((totalEnviados / (totalEnviados + totalFalhas)) * 100) : 0;
      // Envios este mês
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const enviadosMes = campanhas
        .filter(c => c.iniciadaEm && new Date(c.iniciadaEm) >= inicioMes)
        .reduce((s, c) => s + (c.totalEnviados || 0), 0);
      return {
        totalCampanhas,
        campanhasAtivas,
        totalEnviados,
        totalFalhas,
        taxaSucesso,
        enviadosMes,
        wahaConfigurado: config.length > 0,
        ultimasCampanhas: campanhas.slice(0, 5),
      };
    }),
});
