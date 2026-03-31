/**
 * migrate-units.mjs
 * Migra as 30 unidades da Barbearia VIP do VIP Data para o VIP Suite.
 * Cria: 1 organização "Barbearia VIP" + 30 unidades + module_configs (data_vip) com apiUnidadeId e apiHash.
 * Execução: node migrate-units.mjs
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não encontrada.");
  process.exit(1);
}

// ─── 30 unidades extraídas do VIP Data ───────────────────────────────────────
const UNITS = [
  { nome: "Florianópolis - Santa Mônica",         apiUnidadeId: "1",  apiHash: "prc4ebj1tvjd7xrwn15dt1xtr6783wgrg0ws3bn39ndllb0fei0dnvykxp78" },
  { nome: "Balneário Camboriú - Centro",           apiUnidadeId: "5",  apiHash: "ix1taeh3ip2cvpuj79m0h9uxu6x2poxqh5xyq47z56gelyu0wn7ixagu5hxv" },
  { nome: "Curitiba - Mercês",                     apiUnidadeId: "10", apiHash: "12lw2fmfecvcil74tjxoaerap2p8pto05gt502g9ipz18uqzvt5aax6qy2yp" },
  { nome: "Itapema - Meia Praia",                  apiUnidadeId: "13", apiHash: "mh90c86fbtq1sve8b53huufd5021htbop14rpjj2bu2nwpoqs5zze060rea0" },
  { nome: "Viçosa - Centro",                       apiUnidadeId: "14", apiHash: "nfoo88l77apw6sbdhbzqgm4vvpkjsz87xfbwwsdrffczcjh9agfw13fpurt2" },
  { nome: "Florianópolis - Ingleses",              apiUnidadeId: "18", apiHash: "f1fcd8uzae36ai03o98yl234o58my6rlc9o38z9mgt5lk4o4miz4fk9bk1wt" },
  { nome: "Ubá - Centro",                          apiUnidadeId: "19", apiHash: "tibhuo3uuw288otq94imrugsi4v3oq519k109aobjxch1lpf2840idbgfc1h" },
  { nome: "Itajaí - Centro",                       apiUnidadeId: "20", apiHash: "4ewz2abkowlfzaj2xutm2upaykbvucip2kb2bm9fbk9j81kprgq3p07jlja1" },
  { nome: "Imbituba - Centro",                     apiUnidadeId: "21", apiHash: "5i7v46zxnjeggovh2slxlhgeobas26ce89qh7uc5dq4ld7iyrhvpnn0ufty9" },
  { nome: "Palhoça - Pedra Branca",                apiUnidadeId: "22", apiHash: "sffsfzk9xzraq5j84o4n0yjgod21ybqz1ngxf0tvli4cbv5awij03vgk4u72" },
  { nome: "Criciúma - Michel",                     apiUnidadeId: "24", apiHash: "onn0c73jjs1kef3lmrca222e1zd5l3rz97f8twi6j6le7u03zaklyhzotkqe" },
  { nome: "Florianópolis - Jurerê",                apiUnidadeId: "25", apiHash: "4qt2fw71majk5i6d4amuws4e6qruxbe8mg8s2wfx8uvi2i0v1lxmx5lm00wj" },
  { nome: "Florianópolis - Rio Tavares",           apiUnidadeId: "26", apiHash: "1x4cob2wgtqgpngodozgj75je917u7qyzy1na72jpvg84m0ld64xp1x5d4xu" },
  { nome: "Barbacena - Centro",                    apiUnidadeId: "27", apiHash: "ofpo3y7fkexe9jy63osuq0iylutl6ls6e6pjmigknevul2a4co6p1o9a0zfq" },
  { nome: "Joinville",                             apiUnidadeId: "29", apiHash: "" },
  { nome: "Florianópolis - Coqueiros",             apiUnidadeId: "32", apiHash: "1e8xwj2eypmoigerxg77ktklytb9zwo9flremz5yam21atigdu5fxg3lxwn9" },
  { nome: "Florianópolis - Beiramar Shopping",     apiUnidadeId: "38", apiHash: "nbw1v7b9ku9ewdket5909ytz80q7c8921c7j1d5qtupbxqgur007mmfgp0zo" },
  { nome: "Curitiba - Água Verde",                 apiUnidadeId: "39", apiHash: "6i3raxgfpx50qnjgpnxecfgfys2nu10k1sgloqhh5vna94s0wmts48idcnsw" },
  { nome: "Ponte Nova - Guarapiranga",             apiUnidadeId: "43", apiHash: "w6dywej2ccls2tmgevwmfhnjzq5kqlv3l5ndiwt9vp5kswoussl5szcfvm5t" },
  { nome: "Florianópolis - Centro",                apiUnidadeId: "45", apiHash: "a6irro2mlngr3lzb0u7z7pf4awdagcub7aegxoskal2u6tdpxw103bh98lif" },
  { nome: "Lages - Centro",                        apiUnidadeId: "46", apiHash: "zezxaksxy25cofu2dusjnsicuqj0awb4dnaa4diq2q1f3sia1tw49z02909c" },
  { nome: "Balneário Camboriú - Avenida Brasil",   apiUnidadeId: "47", apiHash: "sxb92z6c8qx94uaol88q9ytngulwuy6mybyk5b0ub91bfjkhg79eumh8nac5" },
  { nome: "São José - Shopping Itaguaçu",          apiUnidadeId: "48", apiHash: "nox5dgxre0mznvauusyxv51ti266y6k0yh1rhi5wloitw0yiw6hv0egw4u7q" },
  { nome: "Rio de Janeiro - Barra da Tijuca",      apiUnidadeId: "49", apiHash: "qlpmr61mj2x6nze74yifrwm3c6mn2bglgoksj72l82dp0gj2eqi22p7dz4y9" },
  { nome: "Cataguases - Vila Domingos Lopes",      apiUnidadeId: "50", apiHash: "uaijvibnssxgshne9la01wm5fezj7vz9wjbmvs62ui4etiisku43oh2bkbtl" },
  { nome: "Marília - Jardim Maria Izabel",         apiUnidadeId: "51", apiHash: "i3wuc17770mth42uhuxwebfjfp2acf3kirpxl71kj3y10xvfdliswcnj0uht" },
  { nome: "Volta Redonda - Shopping Park Sul",     apiUnidadeId: "52", apiHash: "6fa92nn31nllgrskfwjannat3zaot3005oufkyizju7tx07h48srgwcb08f2" },
  { nome: "Visconde do Rio Branco - Centro",       apiUnidadeId: "54", apiHash: "ls4hw7ixv0q178m738dbae26rtwoynpk3q6me9qltxukkymbnntefj0dqn1q" },
  { nome: "Conselheiro Lafaiete - Centro",         apiUnidadeId: "55", apiHash: "buxl26hp25mf2m1sfgm0wcgh3449z2a4r37nhfx8dnjifbc229qf4fn5116x" },
  { nome: "Juiz de Fora - São Mateus",             apiUnidadeId: "57", apiHash: "m1i6vk3uiqoy1tb4dt3xp6jztwzutvi6441e69650gye8zh09z7cqud2a5yf" },
  { nome: "Chapecó - Centro",                      apiUnidadeId: "58", apiHash: "ur4krtvg2d6m3k1qaoobk0zzj0gebin3jepm4ydyf735p30227x87y6lt8st" },
];

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function run() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("✅ Conectado ao banco do VIP Suite\n");

  try {
    // 1. Buscar o primeiro usuário admin para ser o ownerId da org
    const [adminUsers] = await conn.execute(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
    );
    if (adminUsers.length === 0) {
      console.error("❌ Nenhum usuário admin encontrado. Faça login no VIP Suite primeiro.");
      process.exit(1);
    }
    const ownerId = adminUsers[0].id;
    console.log(`👤 Owner ID: ${ownerId}`);

    // 2. Criar ou reutilizar organização "Barbearia VIP"
    const [existingOrgs] = await conn.execute(
      "SELECT id FROM organizations WHERE slug = 'barbearia-vip' LIMIT 1"
    );
    let orgId;

    if (existingOrgs.length > 0) {
      orgId = existingOrgs[0].id;
      console.log(`ℹ️  Organização "Barbearia VIP" já existe (id=${orgId})\n`);
    } else {
      const [result] = await conn.execute(
        `INSERT INTO organizations (name, slug, segment, ownerId, active, createdAt, updatedAt)
         VALUES ('Barbearia VIP', 'barbearia-vip', 'barbearia', ?, 1, NOW(), NOW())`,
        [ownerId]
      );
      orgId = result.insertId;
      console.log(`✅ Organização "Barbearia VIP" criada (id=${orgId})\n`);
    }

    // 3. Inserir unidades + module_configs
    let insertedUnits = 0;
    let skippedUnits = 0;
    let insertedConfigs = 0;

    for (const unit of UNITS) {
      const slug = toSlug(unit.nome);

      // Verificar se unidade já existe
      const [existingUnits] = await conn.execute(
        "SELECT id FROM units WHERE orgId = ? AND externalId = ? LIMIT 1",
        [orgId, unit.apiUnidadeId]
      );

      let unitId;
      if (existingUnits.length > 0) {
        unitId = existingUnits[0].id;
        skippedUnits++;
        process.stdout.write(`  ⏭  Pulada: ${unit.nome}\n`);
      } else {
        const [unitResult] = await conn.execute(
          `INSERT INTO units (orgId, name, slug, externalId, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
          [orgId, unit.nome, slug, unit.apiUnidadeId]
        );
        unitId = unitResult.insertId;
        insertedUnits++;
        console.log(`  ✅ Unidade criada: ${unit.nome} (id=${unitId}, externalId=${unit.apiUnidadeId})`);
      }

      // Inserir module_config para data_vip (apenas se tiver apiHash)
      if (unit.apiHash) {
        const [existingConfig] = await conn.execute(
          "SELECT id FROM module_configs WHERE unitId = ? AND module = 'data_vip' LIMIT 1",
          [unitId]
        );

        if (existingConfig.length === 0) {
          const config = JSON.stringify({
            apiUnidadeId: unit.apiUnidadeId,
            apiHash: unit.apiHash,
            tenantKey: unit.apiHash,
          });
          await conn.execute(
            `INSERT INTO module_configs (unitId, module, config, active, createdAt, updatedAt)
             VALUES (?, 'data_vip', ?, 1, NOW(), NOW())`,
            [unitId, config]
          );
          insertedConfigs++;
        }
      }
    }

    console.log("\n─────────────────────────────────────────────────");
    console.log("📊 Resumo da migração:");
    console.log(`   Organização: Barbearia VIP (id=${orgId})`);
    console.log(`   Unidades inseridas:  ${insertedUnits}`);
    console.log(`   Unidades puladas:    ${skippedUnits}`);
    console.log(`   Configs Data VIP:    ${insertedConfigs}`);
    console.log("─────────────────────────────────────────────────");
    console.log("✅ Migração concluída com sucesso!");

  } catch (err) {
    console.error("❌ Erro:", err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
