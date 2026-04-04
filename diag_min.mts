import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 13307,
    user: process.env.DB_EXT_USER,
    password: process.env.DB_EXT_PASS,
    database: process.env.DB_EXT_NAME,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  });

  // Apenas colunas de vendas e uma amostra
  const [cols] = await conn.execute("DESCRIBE vendas") as any;
  console.log("COLUNAS VENDAS:", cols.map((c: any) => c.Field).join(", "));

  const [sample] = await conn.execute(
    "SELECT id, usuario, colaborador, unidade FROM vendas WHERE unidade=29 AND data_criacao >= '2026-03-01' LIMIT 3"
  ) as any;
  console.log("AMOSTRA:", JSON.stringify(sample));

  // Contar por usuario vs colaborador
  const [byUsu] = await conn.execute(
    "SELECT usuario, COUNT(*) as n FROM vendas WHERE unidade=29 AND data_criacao>='2026-03-01' AND data_criacao<'2026-04-01' AND comanda_temp=0 AND status!=0 GROUP BY usuario ORDER BY n DESC LIMIT 10"
  ) as any;
  console.log("POR USUARIO:", JSON.stringify(byUsu));

  const hasCo = cols.some((c: any) => c.Field === 'colaborador');
  if (hasCo) {
    const [byCo] = await conn.execute(
      "SELECT colaborador, COUNT(*) as n FROM vendas WHERE unidade=29 AND data_criacao>='2026-03-01' AND data_criacao<'2026-04-01' AND comanda_temp=0 AND status!=0 GROUP BY colaborador ORDER BY n DESC LIMIT 10"
    ) as any;
    console.log("POR COLABORADOR:", JSON.stringify(byCo));
  }

  // Usuarios da unidade 29
  const [usu] = await conn.execute(
    "SELECT id, nome FROM usuarios WHERE unidade=29 ORDER BY nome"
  ) as any;
  console.log("USUARIOS:", JSON.stringify(usu));

  await conn.end();
}

main().catch(e => console.error("ERRO:", e.message));
