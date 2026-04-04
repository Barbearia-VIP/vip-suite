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

  // Joinville = unidade 29 (confirmado)
  const unidadeId = 29;

  // 1. Colunas de usuarios
  const [usuCols] = await conn.execute("DESCRIBE usuarios") as any;
  const usuFields = usuCols.map((c: any) => c.Field);
  console.log("=== Colunas de usuarios ===");
  console.log(usuFields.join(", "));

  // 2. Listar usuários da unidade 29
  const [usuarios] = await conn.execute(
    "SELECT id, nome, ativo FROM usuarios WHERE unidade = ? ORDER BY nome",
    [unidadeId]
  ) as any;
  console.log(`\n=== Usuários da unidade 29 (${usuarios.length}) ===`);
  console.table(usuarios);

  // 3. Colunas de vendas
  const [vendasCols] = await conn.execute("DESCRIBE vendas") as any;
  const vendasFields = vendasCols.map((c: any) => c.Field);
  console.log("\n=== Colunas de vendas ===");
  console.log(vendasFields.join(", "));

  // 4. Colunas de vendas_produtos
  const [vpCols] = await conn.execute("DESCRIBE vendas_produtos") as any;
  const vpFields = vpCols.map((c: any) => c.Field);
  console.log("\n=== Colunas de vendas_produtos ===");
  console.log(vpFields.join(", "));

  // 5. Amostra de vendas para ver campo colaborador
  const [sampleV] = await conn.execute(
    `SELECT id, colaborador, unidade, status, data_criacao FROM vendas WHERE unidade = ? AND data_criacao >= '2026-03-01' AND data_criacao < '2026-04-01' LIMIT 3`,
    [unidadeId]
  ) as any;
  console.log("\n=== Amostra de vendas março 2026 ===");
  console.table(sampleV);

  // 6. Atendimentos por colaborador em março
  const [atend] = await conn.execute(
    `SELECT 
       u.id, u.nome, u.ativo,
       COUNT(DISTINCT v.id) as atendimentos,
       COALESCE(SUM(vp.valor_total), 0) as faturamento
     FROM usuarios u
     LEFT JOIN vendas v ON v.colaborador = u.id
       AND v.unidade = ?
       AND v.data_criacao >= '2026-03-01'
       AND v.data_criacao < '2026-04-01'
       AND (v.status IS NULL OR v.status NOT IN ('cancelado','cancelada'))
     LEFT JOIN vendas_produtos vp ON vp.venda = v.id
       AND (vp.cancelado_motivo IS NULL OR vp.cancelado_motivo = '')
     WHERE u.unidade = ?
     GROUP BY u.id, u.nome, u.ativo
     ORDER BY faturamento DESC`,
    [unidadeId, unidadeId]
  ) as any;
  console.log(`\n=== Atendimentos por colaborador março 2026 (${atend.length} colaboradores) ===`);
  console.table(atend);

  // 7. Verificar campo colaborador em vendas_produtos
  const vpHasColab = vpFields.includes('colaborador');
  const vpHasColabId = vpFields.includes('colaborador_id');
  console.log(`\nvendas_produtos.colaborador: ${vpHasColab}, colaborador_id: ${vpHasColabId}`);

  // 8. Colunas de produtos
  const [prodCols] = await conn.execute("DESCRIBE produtos") as any;
  const prodFields = prodCols.map((c: any) => c.Field);
  console.log("\n=== Colunas de produtos ===");
  console.log(prodFields.join(", "));

  // 9. Categorias de produtos na unidade
  const [cats] = await conn.execute(
    "SELECT DISTINCT categoria, COUNT(*) as qtd FROM produtos WHERE unidade = ? GROUP BY categoria ORDER BY qtd DESC",
    [unidadeId]
  ) as any;
  console.log("\n=== Categorias de produtos ===");
  console.table(cats);

  await conn.end();
  console.log("\nFim!");
}

main().catch(console.error);
