import re

with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'r') as f:
    content = f.read()

old = '''  // ── Cohort ───────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const rows = await getCohortClientes(extIds);
      return {
        cohorts: rows.map(r => ({
          cohort: r.cohort_mes,
          totalEntrada: Number(r.total_entrada),
          voltaram: Number(r.voltaram),
          taxaRetencao: Number(r.taxa_retencao),
          fidelizados: 0,
          taxaFidelizacao: 0,
          mediaVisitas: 0,
          mediaGasto: 0,
        })),
      };
    }),'''

new = '''  // ── Cohort ───────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      if (extIds.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null };
      }
      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
      const unitIn2 = extIds.length === 1 ? `uu2.unidade = ${extIds[0]}` : `uu2.unidade IN (${extIds.join(",")})`;

      const dataIni = input.dataIni ? new Date(input.dataIni) : new Date(Date.now() - 90 * 86400000);
      const dataFim = input.dataFim ? new Date(input.dataFim) : new Date();
      const dataIniStr = `${dataIni.getFullYear()}-${String(dataIni.getMonth()+1).padStart(2,"0")}-${String(dataIni.getDate()).padStart(2,"0")}`;
      const dataFimStr = `${dataFim.getFullYear()}-${String(dataFim.getMonth()+1).padStart(2,"0")}-${String(dataFim.getDate()).padStart(2,"0")}`;

      // ── 1) Clientes novos no período (1ª visita histórica dentro do período) ──
      const novosRows = await queryExternal<{
        cliente_id: number;
        primeiraVisita: string | Date;
        mes: string;
        ticketPrimeira: number;
      }>(`
        SELECT sub.cliente as cliente_id, sub.primeiraVisita, DATE_FORMAT(sub.primeiraVisita, '%Y-%m') as mes,
          sub.ticketPrimeira
        FROM (
          SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeiraVisita,
            (SELECT v2.total FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE ${unitIn2} AND v2.cliente = v.cliente AND v2.comanda_temp=0
               AND v2.cancelado_motivo IS NULL AND v2.status!=0
             ORDER BY v2.data_criacao ASC LIMIT 1) as ticketPrimeira
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente
          HAVING primeiraVisita >= '${dataIniStr}' AND primeiraVisita <= '${dataFimStr}'
        ) sub
      `);

      if (novosRows.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null };
      }

      const clienteIds = novosRows.map(r => r.cliente_id);
      const idList = clienteIds.join(",");

      // ── 2) Todas as visitas posteriores desses clientes ──
      const visitasPost = await queryExternal<{
        cliente_id: number;
        data_visita: string | Date;
        total: number;
      }>(`
        SELECT v.cliente as cliente_id, DATE(v.data_criacao) as data_visita, v.total
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IN (${idList})
        ORDER BY v.cliente, v.data_criacao
      `);

      // Mapear visitas por cliente
      const visitasMap = new Map<number, Array<{ data: string; total: number }>>();
      for (const v of visitasPost) {
        const dt = v.data_visita instanceof Date
          ? `${v.data_visita.getUTCFullYear()}-${String(v.data_visita.getUTCMonth()+1).padStart(2,"0")}-${String(v.data_visita.getUTCDate()).padStart(2,"0")}`
          : String(v.data_visita).slice(0, 10);
        if (!visitasMap.has(v.cliente_id)) visitasMap.set(v.cliente_id, []);
        visitasMap.get(v.cliente_id)!.push({ data: dt, total: Number(v.total) });
      }

      // ── 3) Calcular métricas por cliente ──
      const hoje = new Date();
      const hojeMs = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());

      const clientesMes = new Map<string, Array<{
        clienteId: number; primeiraVisita: string; ticket: number;
        ret30: boolean; ret60: boolean; ret90: boolean;
        diasAte2a: number | null; totalVisitas: number;
      }>>();

      for (const n of novosRows) {
        const pv = n.primeiraVisita instanceof Date
          ? `${n.primeiraVisita.getUTCFullYear()}-${String(n.primeiraVisita.getUTCMonth()+1).padStart(2,"0")}-${String(n.primeiraVisita.getUTCDate()).padStart(2,"0")}`
          : String(n.primeiraVisita).slice(0, 10);
        const pvMs = new Date(pv + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(n.cliente_id) || [];
        const visitasPost2 = visitas.filter(v => v.data > pv);
        const ret30 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 30 * 86400000);
        const ret60 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 60 * 86400000);
        const ret90 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 90 * 86400000);
        const segunda = visitasPost2.length > 0 ? visitasPost2[0] : null;
        const diasAte2a = segunda ? Math.floor((new Date(segunda.data + "T12:00:00Z").getTime() - pvMs) / 86400000) : null;
        const totalVisitas = visitas.length;

        if (!clientesMes.has(n.mes)) clientesMes.set(n.mes, []);
        clientesMes.get(n.mes)!.push({
          clienteId: n.cliente_id, primeiraVisita: pv, ticket: Number(n.ticketPrimeira) || 0,
          ret30, ret60, ret90, diasAte2a, totalVisitas,
        });
      }

      // ── 4) Cohort Mensal (dias corridos) ──
      const cohortMensal = Array.from(clientesMes.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, clientes]) => {
          const novos = clientes.length;
          const r30 = clientes.filter(c => c.ret30).length;
          const r60 = clientes.filter(c => c.ret60).length;
          const r90 = clientes.filter(c => c.ret90).length;
          return {
            mes,
            novos,
            ret30: r30,
            ret60: r60,
            ret90: r90,
            pctRet30: novos > 0 ? Math.round(r30 / novos * 1000) / 10 : 0,
            pctRet60: novos > 0 ? Math.round(r60 / novos * 1000) / 10 : 0,
            pctRet90: novos > 0 ? Math.round(r90 / novos * 1000) / 10 : 0,
          };
        });

      // ── 5) Análise geral de novos ──
      const todosNovos = novosRows.length;
      const allClientes = Array.from(clientesMes.values()).flat();
      const totalRet30 = allClientes.filter(c => c.ret30).length;
      const totalRet60 = allClientes.filter(c => c.ret60).length;
      const recorrentes60 = allClientes.filter(c => c.totalVisitas >= 2).length;
      const diasAte2aList = allClientes.filter(c => c.diasAte2a !== null).map(c => c.diasAte2a!).sort((a,b)=>a-b);
      const mediana2a = diasAte2aList.length > 0 ? diasAte2aList[Math.floor(diasAte2aList.length / 2)] : null;
      const tickets = allClientes.filter(c => c.ticket > 0).map(c => c.ticket);
      const ticketMedio = tickets.length > 0 ? Math.round(tickets.reduce((a,b)=>a+b,0) / tickets.length * 100) / 100 : 0;

      // Total de clientes únicos no período (base para % novos)
      const baseRows = await queryExternal<{ total: number }>(`
        SELECT COUNT(DISTINCT v.cliente) as total
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IS NOT NULL AND v.cliente!=2
          AND DATE(v.data_criacao) >= '${dataIniStr}' AND DATE(v.data_criacao) <= '${dataFimStr}'
      `);
      const totalBase = Number(baseRows[0]?.total) || 1;

      const analiseNovos = {
        novos: todosNovos,
        pctNovos: Math.round(todosNovos / totalBase * 1000) / 10,
        retencao30: totalRet30,
        pctRetencao30: todosNovos > 0 ? Math.round(totalRet30 / todosNovos * 1000) / 10 : 0,
        recorrentes60,
        pctRecorrentes60: todosNovos > 0 ? Math.round(recorrentes60 / todosNovos * 1000) / 10 : 0,
        mediana2aVisita: mediana2a,
        ticketMedio1aVisita: ticketMedio,
      };

      // ── 6) Distribuição de retenção ──
      const aguardando = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret30 && diasDesde <= 30;
      }).length;
      const ret30Exato = allClientes.filter(c => c.ret30 && !allClientes.filter(x => x.clienteId === c.clienteId && x.ret60)[0]?.ret60).length;
      // Simplificado: ret30 mas não ret60
      const ret30Only = allClientes.filter(c => c.ret30).length;
      const ret31_45 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(c.clienteId) || [];
        const visitasPost2 = visitas.filter(v => v.data > c.primeiraVisita);
        return visitasPost2.some(v => {
          const d = new Date(v.data + "T12:00:00Z").getTime() - pvMs;
          return d > 30 * 86400000 && d <= 45 * 86400000;
        });
      }).length;
      const ret46_60 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(c.clienteId) || [];
        const visitasPost2 = visitas.filter(v => v.data > c.primeiraVisita);
        return visitasPost2.some(v => {
          const d = new Date(v.data + "T12:00:00Z").getTime() - pvMs;
          return d > 45 * 86400000 && d <= 60 * 86400000;
        });
      }).length;
      const naoRetornou30 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret30 && diasDesde > 30 && diasDesde <= 60;
      }).length;
      const naoRetornou60 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret60 && diasDesde > 60;
      }).length;

      const distribuicao = {
        retornou30: totalRet30,
        pctRetornou30: todosNovos > 0 ? Math.round(totalRet30 / todosNovos * 1000) / 10 : 0,
        retornou31_45: ret31_45,
        pctRetornou31_45: todosNovos > 0 ? Math.round(ret31_45 / todosNovos * 1000) / 10 : 0,
        retornou46_60: ret46_60,
        pctRetornou46_60: todosNovos > 0 ? Math.round(ret46_60 / todosNovos * 1000) / 10 : 0,
        aguardando,
        pctAguardando: todosNovos > 0 ? Math.round(aguardando / todosNovos * 1000) / 10 : 0,
        naoRetornou30,
        pctNaoRetornou30: todosNovos > 0 ? Math.round(naoRetornou30 / todosNovos * 1000) / 10 : 0,
        naoRetornou60,
        pctNaoRetornou60: todosNovos > 0 ? Math.round(naoRetornou60 / todosNovos * 1000) / 10 : 0,
        total: todosNovos,
      };

      return { cohortMensal, analiseNovos, distribuicao };
    }),'''

if old in content:
    content = content.replace(old, new, 1)
    with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'w') as f:
        f.write(content)
    print("SUCCESS: endpoint cohort substituído")
else:
    print("ERROR: trecho não encontrado")
    # Mostrar o que existe
    idx = content.find('// ── Cohort')
    print(f"Cohort encontrado em: {idx}")
    print(repr(content[idx:idx+200]))
