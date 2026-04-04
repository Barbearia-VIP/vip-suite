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

  // Joinville = unidade 29
  const unidadeId = 29;

  // 1. Colunas de vendas (apenas campos relevantes)
  const [vendasCols] = await conn.execute("DESCRIBE vendas") as any;
  const vendasFields = vendasCols.map((c: any) => c.Field);
  console.log("=== Colunas de vendas ===");
  console.log(vendasFields.join(", "));

  // 2. Verificar campos de colaborador/usuario em vendas
  const hasColaborador = vendasFields.includes('colaborador');
  const hasUsuario = vendasFields.includes('usuario');
  const hasColaboradorId = vendasFields.includes('colaborador_id');
  console.log(`\nvendas.colaborador: ${hasColaborador}`);
  console.log(`vendas.usuario: ${hasUsuario}`);
  console.log(`vendas.colaborador_id: ${hasColaboradorId}`);

  // 3. Amostra de vendas para ver valores dos campos
  const [sample] = await conn.execute(
    `SELECT id, usuario, colaborador, unidade, status, comanda_temp, data_criacao 
     FROM vendas 
     WHERE unidade = ? AND data_criacao >= '2026-03-01' AND data_criacao < '2026-04-01' 
     LIMIT 5`,
    [unidadeId]
  ) as any;
  console.log("\n=== Amostra de vendas março 2026 ===");
  console.table(sample);

  // 4. Usuários da unidade 29
  const [usuarios] = await conn.execute(
    "SELECT id, nome, ativo FROM usuarios WHERE unidade = ? ORDER BY nome",
    [unidadeId]
  ) as any;
  console.log(`\n=== Usuários da unidade 29 (${usuarios.length}) ===`);
  console.table(usuarios);

  // 5. Contar vendas por campo 'usuario' em março
  const [porUsuario] = await conn.execute(
    `SELECT v.usuario, u.nome, COUNT(DISTINCT v.id) as vendas
     FROM vendas v
     LEFT JOIN usuarios u ON u.id = v.usuario
     WHERE v.unidade = ? AND v.data_criacao >= '2026-03-01' AND v.data_criacao < '2026-04-01'
       AND v.comanda_temp = 0 AND v.status != 0
     GROUP BY v.usuario, u.nome
     ORDER BY vendas DESC`,
    [unidadeId]
  ) as any;
  console.log(`\n=== Vendas por campo 'usuario' em março 2026 (${porUsuario.length} registros) ===`);
  console.table(porUsuario);

  // 6. Se existir campo 'colaborador', contar por ele também
  if (hasColaborador) {
    const [porColab] = await conn.execute(
      `SELECT v.colaborador, u.nome, COUNT(DISTINCT v.id) as vendas
       FROM vendas v
       LEFT JOIN usuarios u ON u.id = v.colaborador
       WHERE v.unidade = ? AND v.data_criacao >= '2026-03-01' AND v.data_criacao < '2026-04-01'
         AND v.comanda_temp = 0 AND v.status != 0
       GROUP BY v.colaborador, u.nome
       ORDER BY vendas DESC`,
      [unidadeId]
    ) as any;
    console.log(`\n=== Vendas por campo 'colaborador' em março 2026 (${porColab.length} registros) ===`);
    console.table(porColab);
  }

  await conn.end();
  console.log("\nFim!");
}

main().catch(console.error);
