import re

with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the churn endpoint (lines 1070-1174)
# We'll replace from "// ── Churn (visão geral)" to the closing }),
# by finding the pattern between cadencia end and churnPorBarbeiro start

old_start = '    // ── Churn (visão geral)'
old_end = '  // ── Churn por barbeiro'

idx_start = content.find(old_start)
idx_end = content.find(old_end)

if idx_start == -1 or idx_end == -1:
    print(f"ERROR: start={idx_start}, end={idx_end}")
    exit(1)

new_churn = '''    // ── Churn (visão geral) ────────────────────────────────────────────────────
  churn: protectedProcedure
    .input(baseInput.extend({
      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const diasPeriodo = input.periodo === "30d" ? 30
        : input.periodo === "60d" ? 60
        : input.periodo === "6m" ? 180
        : input.periodo === "12m" ? 365
        : 90;

      const dataInicio = input.dataInicio || new Date(Date.now() - diasPeriodo * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      if (extIds.length === 0) {
        return {
          resumo: { total: 0, ativos: 0, emRisco: 0, perdidos: 0, oneShots: 0, taxaRetencao: 0, taxaChurn: 0, mediaVisitas: 0, ticketMedio: 0, receitaPerdida: 0 },
          kpis: { churnGeral: 0, churnGeralPct: 0, churnFidelizados: 0, churnFidelizadosPct: 0, baseFidelizados: 0, churnOneShot: 0, churnOneShotPct: 0, baseOneShot: 0, resgatados: 0, emRisco45_90: 0 },
          perdidos: [], emRisco: [], resgatados: [], churnMensal: [], perdidosRecentes: [],
          periodo: { dataInicio, dataFim, diasPeriodo },
        };
      }

      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
      const unitInC = extIds.length === 1 ? `uu2.unidade = ${extIds[0]}` : `uu2.unidade IN (${extIds.join(",")})`;

      // Base do período: clientes que visitaram entre dataInicio e dataFim
      const basePeriodo = `(
        SELECT DISTINCT v.cliente
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IS NOT NULL AND v.cliente!=2
          AND DATE(v.data_criacao) >= \'${dataInicio}\' AND DATE(v.data_criacao) <= \'${dataFim}\'
      )`;

      // Total histórico de visitas por cliente
      const totalVisitasHist = `(
        SELECT v.cliente, COUNT(*) as tv
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IS NOT NULL AND v.cliente!=2
        GROUP BY v.cliente
      )`;

      const [kpisRows, emRiscoRows, perdidosRows, resgatadosRows, churnMensalRows] = await Promise.all([
        // KPIs principais
        queryExternal<{
          total: number; perdidos_total: number; fidelizados_total: number;
          perdidos_fidelizados: number; oneshot_total: number; perdidos_oneshot: number;
          resgatados: number; em_risco_45_90: number; ticket_medio: number;
        }>(`
          SELECT
            COUNT(DISTINCT bp.cliente) as total,
            SUM(CASE WHEN DATEDIFF(\'${dataFim}\', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos_total,
            SUM(CASE WHEN COALESCE(tvh.tv, 0) >= 3 THEN 1 ELSE 0 END) as fidelizados_total,
            SUM(CASE WHEN COALESCE(tvh.tv, 0) >= 3 AND DATEDIFF(\'${dataFim}\', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos_fidelizados,
            SUM(CASE WHEN COALESCE(tvh.tv, 0) = 1 THEN 1 ELSE 0 END) as oneshot_total,
            SUM(CASE WHEN COALESCE(tvh.tv, 0) = 1 AND DATEDIFF(\'${dataFim}\', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos_oneshot,
            SUM(CASE WHEN EXISTS (
              SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
              WHERE v2.cliente = bp.cliente AND ${unitInC}
                AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
                AND DATE(v2.data_criacao) >= \'${dataInicio}\' AND DATE(v2.data_criacao) <= \'${dataFim}\'
                AND EXISTS (
                  SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
                  WHERE v3.cliente = bp.cliente AND uu3.unidade = uu2.unidade
                    AND v3.comanda_temp=0 AND v3.cancelado_motivo IS NULL AND v3.status!=0
                    AND DATE(v3.data_criacao) < \'${dataInicio}\'
                    AND DATEDIFF(\'${dataInicio}\', DATE(v3.data_criacao)) >= 90
                    AND NOT EXISTS (
                      SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
                      WHERE v4.cliente = bp.cliente AND uu4.unidade = uu2.unidade
                        AND v4.comanda_temp=0 AND v4.cancelado_motivo IS NULL AND v4.status!=0
                        AND DATE(v4.data_criacao) >= DATE_SUB(\'${dataInicio}\', INTERVAL 90 DAY)
                        AND DATE(v4.data_criacao) < \'${dataInicio}\'
                    )
                )
            ) THEN 1 ELSE 0 END) as resgatados,
            SUM(CASE WHEN DATEDIFF(\'${dataFim}\', c.ultima_visita) BETWEEN 45 AND 90 THEN 1 ELSE 0 END) as em_risco_45_90,
            AVG(c.consumo) as ticket_medio
          FROM ${basePeriodo} bp
          JOIN clientes c ON c.id = bp.cliente
          LEFT JOIN ${totalVisitasHist} tvh ON tvh.cliente = bp.cliente
          WHERE c.status = 1
        `),
        // Clientes em risco (45-90d)
        queryExternal<{ id: number; nome: string; telefone: string; ultima_visita: Date; tv: number }>(`
          SELECT c.id, c.nome, c.telefone, c.ultima_visita, COALESCE(tvh.tv, 0) as tv
          FROM ${basePeriodo} bp
          JOIN clientes c ON c.id = bp.cliente
          LEFT JOIN ${totalVisitasHist} tvh ON tvh.cliente = bp.cliente
          WHERE c.status = 1 AND DATEDIFF(\'${dataFim}\', c.ultima_visita) BETWEEN 45 AND 90
          ORDER BY c.ultima_visita ASC LIMIT 500
        `),
        // Perdidos (>90d)
        queryExternal<{ id: number; nome: string; telefone: string; ultima_visita: Date; tv: number }>(`
          SELECT c.id, c.nome, c.telefone, c.ultima_visita, COALESCE(tvh.tv, 0) as tv
          FROM ${basePeriodo} bp
          JOIN clientes c ON c.id = bp.cliente
          LEFT JOIN ${totalVisitasHist} tvh ON tvh.cliente = bp.cliente
          WHERE c.status = 1 AND DATEDIFF(\'${dataFim}\', c.ultima_visita) > 90
          ORDER BY c.ultima_visita ASC LIMIT 500
        `),
        // Resgatados
        queryExternal<{ id: number; nome: string; telefone: string; ultima_visita: Date; tv: number }>(`
          SELECT c.id, c.nome, c.telefone, c.ultima_visita, COALESCE(tvh.tv, 0) as tv
          FROM ${basePeriodo} bp
          JOIN clientes c ON c.id = bp.cliente
          LEFT JOIN ${totalVisitasHist} tvh ON tvh.cliente = bp.cliente
          WHERE c.status = 1
            AND EXISTS (
              SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
              WHERE v2.cliente = bp.cliente AND ${unitInC}
                AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
                AND DATE(v2.data_criacao) >= \'${dataInicio}\' AND DATE(v2.data_criacao) <= \'${dataFim}\'
                AND EXISTS (
                  SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
                  WHERE v3.cliente = bp.cliente AND uu3.unidade = uu2.unidade
                    AND v3.comanda_temp=0 AND v3.cancelado_motivo IS NULL AND v3.status!=0
                    AND DATE(v3.data_criacao) < \'${dataInicio}\'
                    AND DATEDIFF(\'${dataInicio}\', DATE(v3.data_criacao)) >= 90
                    AND NOT EXISTS (
                      SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
                      WHERE v4.cliente = bp.cliente AND uu4.unidade = uu2.unidade
                        AND v4.comanda_temp=0 AND v4.cancelado_motivo IS NULL AND v4.status!=0
                        AND DATE(v4.data_criacao) >= DATE_SUB(\'${dataInicio}\', INTERVAL 90 DAY)
                        AND DATE(v4.data_criacao) < \'${dataInicio}\'
                    )
                )
            )
          ORDER BY c.ultima_visita DESC LIMIT 200
        `),
        // Churn mensal
        queryExternal<{ mes: string; total: number }>(`
          SELECT DATE_FORMAT(c.ultima_visita, \'%Y-%m\') as mes, COUNT(*) as total
          FROM ${basePeriodo} bp
          JOIN clientes c ON c.id = bp.cliente
          WHERE c.status = 1 AND DATEDIFF(\'${dataFim}\', c.ultima_visita) > 90
            AND c.ultima_visita >= DATE_SUB(\'${dataFim}\', INTERVAL 12 MONTH)
          GROUP BY mes ORDER BY mes
        `),
      ]);

      const k = kpisRows[0] || { total: 0, perdidos_total: 0, fidelizados_total: 0, perdidos_fidelizados: 0, oneshot_total: 0, perdidos_oneshot: 0, resgatados: 0, em_risco_45_90: 0, ticket_medio: 0 };
      const total = Number(k.total);
      const perdidosTotal = Number(k.perdidos_total);
      const fidelizadosTotal = Number(k.fidelizados_total);
      const perdidosFidelizados = Number(k.perdidos_fidelizados);
      const oneShotTotal = Number(k.oneshot_total);
      const perdidosOneShot = Number(k.perdidos_oneshot);
      const resgatadosTotal = Number(k.resgatados);
      const emRisco4590 = Number(k.em_risco_45_90);

      const mapCliente = (r: { id: number; nome: string; telefone: string; ultima_visita: Date; tv: number }) => ({
        clienteId: String(r.id),
        clienteNome: r.nome,
        telefone: r.telefone,
        ultimaVenda: r.ultima_visita,
        totalVisitas: Number(r.tv),
        dias: r.ultima_visita
          ? (() => {
              const uv = r.ultima_visita instanceof Date ? r.ultima_visita : new Date(r.ultima_visita as unknown as string);
              const ref = new Date(dataFim + "T12:00:00Z");
              return Math.max(0, Math.floor((ref.getTime() - uv.getTime()) / 86400000));
            })()
          : 999,
      });

      return {
        resumo: {
          total,
          ativos: Math.max(0, total - perdidosTotal - emRisco4590),
          emRisco: emRisco4590,
          perdidos: perdidosTotal,
          oneShots: oneShotTotal,
          taxaRetencao: total > 0 ? Math.round(((total - perdidosTotal) / total) * 100) : 0,
          taxaChurn: total > 0 ? Math.round((perdidosTotal / total) * 100) : 0,
          mediaVisitas: 0,
          ticketMedio: Math.round(Number(k.ticket_medio) * 100) / 100,
          receitaPerdida: Math.round(perdidosTotal * Number(k.ticket_medio) * 100) / 100,
        },
        kpis: {
          churnGeral: perdidosTotal,
          churnGeralPct: total > 0 ? Math.round(perdidosTotal / total * 1000) / 10 : 0,
          churnFidelizados: perdidosFidelizados,
          churnFidelizadosPct: fidelizadosTotal > 0 ? Math.round(perdidosFidelizados / fidelizadosTotal * 1000) / 10 : 0,
          baseFidelizados: fidelizadosTotal,
          churnOneShot: perdidosOneShot,
          churnOneShotPct: oneShotTotal > 0 ? Math.round(perdidosOneShot / oneShotTotal * 1000) / 10 : 0,
          baseOneShot: oneShotTotal,
          resgatados: resgatadosTotal,
          emRisco45_90: emRisco4590,
        },
        perdidos: perdidosRows.map(mapCliente),
        emRisco: emRiscoRows.map(mapCliente),
        resgatados: resgatadosRows.map(mapCliente),
        perdidosRecentes: perdidosRows.slice(0, 100).map(mapCliente),
        churnMensal: churnMensalRows.map(r => ({ mes: r.mes, total: Number(r.total) })),
        periodo: { dataInicio, dataFim, diasPeriodo },
      };
    }),
  '''

content = content[:idx_start] + new_churn + content[idx_end:]

with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - churn endpoint replaced successfully")
print(f"New content length: {len(content)}")
