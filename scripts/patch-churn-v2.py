"""
Substitui o endpoint churn por versão otimizada:
- Usa MAX(data_criacao) por cliente em vez de EXISTS aninhados
- Resgatados: clientes cuja última visita ANTES do período >= 90d antes de dataInicio
  E que visitaram no período (já estão em basePeriodo)
- Separa queries em sequência (não Promise.all) para reduzir carga simultânea
"""

with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '  churn: protectedProcedure\n    .input(baseInput.extend({\n      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),\n    }))\n    .query(async ({ ctx, input }) => {\n      const { extIds } = await resolveExternalIds(\n        ctx.user.id, ctx.user.role, input.orgId, input.unitId\n      );\n\n      const diasPeriodo = input.periodo === "30d" ? 30\n        : input.periodo === "60d" ? 60\n        : input.periodo === "6m" ? 180\n        : input.periodo === "12m" ? 365\n        : 90;\n\n      const dataInicio = input.dataInicio || new Date(Date.now() - diasPeriodo * 86400000).toISOString().split("T")[0];\n      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];\n\n      if (extIds.length === 0) {'

old_end = '    }),\n    // ── Churn por barbeiro'

idx_start = content.find(old_start)
idx_end = content.find(old_end)

if idx_start == -1:
    print("ERROR: start not found")
    # Try to find by simpler marker
    idx_start = content.find('  churn: protectedProcedure')
    print(f"Fallback start: {idx_start}")

if idx_end == -1:
    print("ERROR: end not found")
    idx_end = content.find('  // ── Churn por barbeiro')
    print(f"Fallback end: {idx_end}")

print(f"start={idx_start}, end={idx_end}")

new_churn = '''  churn: protectedProcedure
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

      // ── Passo 1: Clientes do período com stats agregados (1 query leve) ─────
      // Usa clientes.ultima_visita (campo indexado) para classificação
      // e conta visitas históricas via subquery simples
      const clientesBase = await queryExternal<{
        cliente_id: number; nome: string; telefone: string;
        ultima_visita: Date; tv_hist: number; ticket: number;
      }>(`
        SELECT
          c.id as cliente_id, c.nome, c.telefone, c.ultima_visita,
          COALESCE(tvh.tv, 0) as tv_hist,
          COALESCE(c.consumo, 0) as ticket
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN clientes c ON c.id = bp.cliente
        LEFT JOIN (
          SELECT v2.cliente, COUNT(*) as tv
          FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE ${unitIn.replace(/\buu\b/g, 'uu2')} AND v2.comanda_temp=0
            AND v2.cancelado_motivo IS NULL AND v2.status!=0
            AND v2.cliente IS NOT NULL AND v2.cliente!=2
          GROUP BY v2.cliente
        ) tvh ON tvh.cliente = c.id
        WHERE c.status = 1
        LIMIT 5000
      `);

      // ── Passo 2: Resgatados — clientes do período cuja visita ANTERIOR ao período
      //    foi há ≥90d antes de dataInicio (usando MAX da última visita antes do período)
      const resgatadosIds = await queryExternal<{ cliente_id: number; ultima_antes: Date }>(`
        SELECT bp.cliente as cliente_id, MAX(DATE(v_ant.data_criacao)) as ultima_antes
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN vendas v_ant ON v_ant.cliente = bp.cliente
        JOIN usuarios uu_ant ON v_ant.usuario = uu_ant.id
        WHERE ${unitIn.replace(/\buu\b/g, 'uu_ant')}
          AND v_ant.comanda_temp=0 AND v_ant.cancelado_motivo IS NULL AND v_ant.status!=0
          AND DATE(v_ant.data_criacao) < '${dataInicio}'
        GROUP BY bp.cliente
        HAVING DATEDIFF('${dataInicio}', ultima_antes) >= 90
        LIMIT 1000
      `);

      const resgatadosSet = new Set(resgatadosIds.map(r => r.cliente_id));

      // ── Classificação no Node.js (sem carga extra no banco) ─────────────────
      const dataFimMs = new Date(dataFim + "T12:00:00Z").getTime();

      const mapC = (c: typeof clientesBase[0]) => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        const dias = Math.max(0, Math.floor((dataFimMs - uv.getTime()) / 86400000));
        return {
          clienteId: String(c.cliente_id),
          clienteNome: c.nome,
          telefone: c.telefone,
          ultimaVenda: c.ultima_visita,
          totalVisitas: Number(c.tv_hist),
          dias,
        };
      };

      const perdidosList = clientesBase.filter(c => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        return Math.floor((dataFimMs - uv.getTime()) / 86400000) > 90;
      });

      const emRiscoList = clientesBase.filter(c => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        const d = Math.floor((dataFimMs - uv.getTime()) / 86400000);
        return d >= 45 && d <= 90;
      });

      const resgatadosList = clientesBase.filter(c => resgatadosSet.has(c.cliente_id));

      const total = clientesBase.length;
      const perdidosTotal = perdidosList.length;
      const emRisco4590 = emRiscoList.length;
      const resgatadosTotal = resgatadosList.length;
      const fidelizadosTotal = clientesBase.filter(c => Number(c.tv_hist) >= 3).length;
      const perdidosFidelizados = perdidosList.filter(c => Number(c.tv_hist) >= 3).length;
      const oneShotTotal = clientesBase.filter(c => Number(c.tv_hist) === 1).length;
      const perdidosOneShot = perdidosList.filter(c => Number(c.tv_hist) === 1).length;
      const ticketMedio = total > 0
        ? clientesBase.reduce((s, c) => s + Number(c.ticket), 0) / total
        : 0;

      // Churn mensal (baseado em ultima_visita dos perdidos)
      const churnMensalMap: Record<string, number> = {};
      for (const c of perdidosList) {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        const mes = `${uv.getFullYear()}-${String(uv.getMonth() + 1).padStart(2, "0")}`;
        churnMensalMap[mes] = (churnMensalMap[mes] || 0) + 1;
      }
      const churnMensal = Object.entries(churnMensalMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, total]) => ({ mes, total }));

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
          ticketMedio: Math.round(ticketMedio * 100) / 100,
          receitaPerdida: Math.round(perdidosTotal * ticketMedio * 100) / 100,
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
        perdidos: perdidosList.slice(0, 500).map(mapC),
        emRisco: emRiscoList.slice(0, 500).map(mapC),
        resgatados: resgatadosList.slice(0, 200).map(mapC),
        perdidosRecentes: perdidosList.slice(0, 100).map(mapC),
        churnMensal,
        periodo: { dataInicio, dataFim, diasPeriodo },
      };
    }),
    '''

content = content[:idx_start] + new_churn + content[idx_end:]

with open('/home/ubuntu/vip-suite/server/routers/raioX.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - churn endpoint replaced with optimized version")
print(f"New content length: {len(content)}")
