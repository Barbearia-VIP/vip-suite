import { getDb } from "../server/db";

const sql = `
CREATE TABLE IF NOT EXISTS \`rep_avaliacoes\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`unitId\` int NOT NULL,
  \`conexaoId\` int,
  \`plataforma\` enum('google','ifood','tripadvisor','ubereats','rappi','facebook','instagram','manual') NOT NULL,
  \`externalId\` varchar(512),
  \`autorNome\` varchar(255),
  \`autorFoto\` varchar(512),
  \`nota\` decimal(3,1) NOT NULL,
  \`titulo\` varchar(512),
  \`comentario\` text,
  \`sentimento\` enum('positivo','neutro','negativo'),
  \`resposta\` text,
  \`respondidoEm\` timestamp NULL,
  \`respondidoPor\` varchar(255),
  \`respostaPublicada\` boolean DEFAULT false,
  \`dataAvaliacao\` timestamp NOT NULL,
  \`urlAvaliacao\` varchar(512),
  \`isVerificado\` boolean DEFAULT false,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`rep_avaliacoes_id\` PRIMARY KEY(\`id\`)
)`;

const sql2 = `
CREATE TABLE IF NOT EXISTS \`rep_conexoes\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`unitId\` int NOT NULL,
  \`plataforma\` enum('google','ifood','tripadvisor','ubereats','rappi','facebook','instagram','manual') NOT NULL,
  \`externalId\` varchar(255) NOT NULL,
  \`nome\` varchar(255),
  \`url\` varchar(512),
  \`googleAccessToken\` text,
  \`googleRefreshToken\` text,
  \`googleTokenExpiry\` timestamp NULL,
  \`googleAccountName\` varchar(255),
  \`googleLocationName\` varchar(255),
  \`googlePlaceId\` varchar(255),
  \`googleApiKey\` varchar(255),
  \`totalAvaliacoes\` int DEFAULT 0,
  \`notaMedia\` decimal(3,2),
  \`ultimaSincronizacao\` timestamp NULL,
  \`isAtivo\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`rep_conexoes_id\` PRIMARY KEY(\`id\`)
)`;

const sql3 = `
CREATE TABLE IF NOT EXISTS \`rep_config_ia\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`unitId\` int NOT NULL,
  \`nomeEstabelecimento\` varchar(255),
  \`nomeProprietario\` varchar(255),
  \`tom\` enum('formal','casual','amigavel') NOT NULL DEFAULT 'amigavel',
  \`incluirAssinatura\` boolean DEFAULT true,
  \`autoResponder\` boolean DEFAULT false,
  \`autoResponderPositivas\` boolean DEFAULT false,
  \`autoResponderNegativas\` boolean DEFAULT false,
  \`promptPersonalizado\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`rep_config_ia_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`rep_config_ia_unitId_unique\` UNIQUE(\`unitId\`)
)`;

const sql4 = `
CREATE TABLE IF NOT EXISTS \`rep_respostas_ia\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`avaliacaoId\` int NOT NULL,
  \`unitId\` int NOT NULL,
  \`textoGerado\` text NOT NULL,
  \`textoFinal\` text,
  \`tom\` varchar(50),
  \`usouIA\` boolean DEFAULT true,
  \`publicado\` boolean DEFAULT false,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`rep_respostas_ia_id\` PRIMARY KEY(\`id\`)
)`;

const sql5 = `
CREATE TABLE IF NOT EXISTS \`rep_resumo\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`unitId\` int NOT NULL,
  \`totalAvaliacoes\` int NOT NULL DEFAULT 0,
  \`notaMedia\` decimal(4,2) NOT NULL DEFAULT '0',
  \`taxaResposta\` decimal(5,2) DEFAULT '0',
  \`totalPositivas\` int DEFAULT 0,
  \`totalNeutras\` int DEFAULT 0,
  \`totalNegativas\` int DEFAULT 0,
  \`distribuicaoNotas\` json,
  \`notasPorPlataforma\` json,
  \`ultimoCalculo\` timestamp NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`rep_resumo_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`rep_resumo_unitId_unique\` UNIQUE(\`unitId\`)
)`;

const indexes = [
  "CREATE INDEX IF NOT EXISTS `idx_rep_aval_unit_plat` ON `rep_avaliacoes` (`unitId`,`plataforma`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_aval_unit_data` ON `rep_avaliacoes` (`unitId`,`dataAvaliacao`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_aval_unit_nota` ON `rep_avaliacoes` (`unitId`,`nota`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_conexoes_unit` ON `rep_conexoes` (`unitId`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_conexoes_unit_plat` ON `rep_conexoes` (`unitId`,`plataforma`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_resp_ia_avaliacao` ON `rep_respostas_ia` (`avaliacaoId`)",
  "CREATE INDEX IF NOT EXISTS `idx_rep_resp_ia_unit` ON `rep_respostas_ia` (`unitId`)",
];

async function run() {
  const db = await getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }
  
  const statements = [sql, sql2, sql3, sql4, sql5, ...indexes];
  let count = 0;
  for (const s of statements) {
    try {
      await db.execute(s as any);
      count++;
    } catch (e: any) {
      if (!e.message?.includes("Duplicate")) console.error("Error:", e.message);
    }
  }
  console.log(`Applied ${count}/${statements.length} statements`);
  process.exit(0);
}

run();
