import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar estrutura atual
const [rows] = await conn.execute("DESCRIBE dimensao_colaboradores");
const tipoField = rows.find(r => r.Field === "tipoColaborador");
console.log("Campo tipoColaborador:", tipoField?.Type);

// Verificar se estetica já existe no enum
if (tipoField?.Type?.includes("estetica")) {
  console.log("✅ 'estetica' já está no enum");
} else {
  console.log("⚠️ 'estetica' NÃO está no enum — alterando...");
  await conn.execute(`
    ALTER TABLE dimensao_colaboradores 
    MODIFY COLUMN tipoColaborador ENUM('barbeiro','recepcao','estetica','nenhum') NOT NULL DEFAULT 'nenhum'
  `);
  console.log("✅ Enum atualizado com sucesso!");
  
  // Verificar novamente
  const [rows2] = await conn.execute("DESCRIBE dimensao_colaboradores");
  const tipoField2 = rows2.find(r => r.Field === "tipoColaborador");
  console.log("Novo tipo:", tipoField2?.Type);
}

await conn.end();
