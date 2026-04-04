import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 13307,
    user: process.env.DB_EXT_USER,
    password: process.env.DB_EXT_PASS,
    database: process.env.DB_EXT_NAME,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
  });

  console.log("Conectado!\n");

  // 1. Descobrir Joinville na tabela unidades
  const [unidCols] = await conn.execute("DESCRIBE unidades") as any;
  console.log("=== Colunas de unidades ===");
  console.log(unidCols.map((c: any) => c.Field).join(", "));

  const [unidades] = await conn.execute(
    "SELECT * FROM unidades WHERE nome LIKE '%joinville%' OR nome LIKE '%Joinville%' OR nome LIKE '%JOIN%' LIMIT 5"
  ) as any;
  console.log("\n=== Unidades Joinville ===");
  console.table(unidades);

  if (!unidades.length) {
    const [allUnids] = await conn.execute("SELECT id, nome FROM unidades ORDER BY nome LIMIT 30") as any;
    console.log("=== Todas as unidades ===");
    console.table(allUnids);
    await conn.end();
    return;
  }

  const unidadeId = unidades[0].id;
  console.log(`\nUsando unidadeId = ${unidadeId} (${unidades[0].nome})\n`);

  // 2. Verificar colunas de usuarios (colaboradores)
  const [usuCols] = await conn.execute("DESCRIBE usuarios") as any;
  console.log("=== Colunas de usuarios ===");
  console.log(usuCols.map((c: any) => c.Field).join(", "));

  // 3. Listar usuários da unidade
  const [usuarios] = await conn.execute(
    "SELECT id, nome, ativo, unidade FROM usuarios WHERE unidade = ? ORDER BY nome",
    [unidadeId]
  ) as any;
  console.log(`\n=== Usuários da unidade Joinville (${usuarios.length}) ===`);
  console.table(usuarios);

  // 4. Verificar colunas de vendas
  const [vendasCols] = await conn.execute("DESCRIBE vendas") as any;
  console.log("\n=== Colunas de vendas ===");
  console.log(vendasCols.map((c: any) => c.Field).join(", "));

  // 5. Verificar colunas de vendas_produtos
  const [vpCols] = await conn.execute("DESCRIBE vendas_produtos") as any;
  console.log("\n=== Colunas de vendas_produtos ===");
  console.log(vpCols.map((c: any) => c.Field).join(", "));

  // 6. Amostra de vendas para ver campos de colaborador
  const [sampleVendas] = await conn.execute(
    `SELECT * FROM vendas WHERE unidade = ? AND data_criacao >= '2026-03-01' AND data_criacao < '2026-04-01' LIMIT 3`,
    [unidadeId]
  ) as any;
  console.log("\n=== Amostra de vendas março 2026 ===");
  if (sampleVendas.length) console.table(sampleVendas);

  // 7. Atendimentos por usuário em março
  const [atendPorUsuario] = await conn.execute(
    `SELECT 
       u.id,
       u.nome,
       u.ativo,
       COUNT(DISTINCT v.id) as atendimentos,
       COALESCE(SUM(vp.valor_total), 0) as faturamento,
       COUNT(DISTINCT vp.id) as total_servicos
     FROM usuarios u
     LEFT JOIN vendas v ON v.colaborador = u.id
       AND v.unidade = ?
       AND v.data_criacao >= '2026-03-01'
       AND v.data_criacao < '2026-04-01'
       AND (v.status IS NULL OR v.status NOT IN ('cancelado', 'cancelada'))
     LEFT JOIN vendas_produtos vp ON vp.venda = v.id
       AND (vp.cancelado_motivo IS NULL OR vp.cancelado_motivo = '')
     WHERE u.unidade = ?
     GROUP BY u.id, u.nome, u.ativo
     ORDER BY faturamento DESC`,
    [unidadeId, unidadeId]
  ) as any;
  console.log("\n=== Atendimentos por usuário em março 2026 (campo colaborador) ===");
  console.table(atendPorUsuario);

  // 8. Verificar se o campo é 'colaborador' ou 'usuario' ou 'colaborador_id'
  const hasColaborador = vendasCols.some((c: any) => c.Field === 'colaborador');
  const hasColaboradorId = vendasCols.some((c: any) => c.Field === 'colaborador_id');
  const hasUsuario = vendasCols.some((c: any) => c.Field === 'usuario');
  console.log(`\n=== Campos de colaborador em vendas ===`);
  console.log(`colaborador: ${hasColaborador}, colaborador_id: ${hasColaboradorId}, usuario: ${hasUsuario}`);

  // 9. Verificar campo em vendas_produtos
  const vpHasColab = vpCols.some((c: any) => c.Field === 'colaborador');
  const vpHasColabId = vpCols.some((c: any) => c.Field === 'colaborador_id');
  console.log(`vendas_produtos.colaborador: ${vpHasColab}, vendas_produtos.colaborador_id: ${vpHasColabId}`);

  // 10. Verificar campo de unidade em vendas
  const hasUnidade = vendasCols.some((c: any) => c.Field === 'unidade');
  const hasUnidadeId = vendasCols.some((c: any) => c.Field === 'unidade_id');
  console.log(`vendas.unidade: ${hasUnidade}, vendas.unidade_id: ${hasUnidadeId}`);

  // 11. Verificar campo de unidade em usuarios
  const usuHasUnidade = usuCols.some((c: any) => c.Field === 'unidade');
  const usuHasUnidadeId = usuCols.some((c: any) => c.Field === 'unidade_id');
  console.log(`usuarios.unidade: ${usuHasUnidade}, usuarios.unidade_id: ${usuHasUnidadeId}`);

  // 12. Verificar campo de produtos em vendas_produtos
  const vpHasProduto = vpCols.some((c: any) => c.Field === 'produto');
  const vpHasProdutoId = vpCols.some((c: any) => c.Field === 'produto_id');
  console.log(`vendas_produtos.produto: ${vpHasProduto}, vendas_produtos.produto_id: ${vpHasProdutoId}`);

  // 13. Verificar campo de categoria em produtos
  const [prodCols] = await conn.execute("DESCRIBE produtos") as any;
  console.log("\n=== Colunas de produtos ===");
  console.log(prodCols.map((c: any) => c.Field).join(", "));

  // 14. Verificar categorias de produtos
  const [categorias] = await conn.execute(
    "SELECT DISTINCT categoria FROM produtos WHERE unidade = ? LIMIT 20",
    [unidadeId]
  ) as any;
  console.log("\n=== Categorias de produtos na unidade ===");
  console.table(categorias);

  await conn.end();
  console.log("\nDiagnóstico concluído!");
}

main().catch(console.error);
