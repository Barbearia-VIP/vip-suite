#!/usr/bin/env node
/**
 * Script executado no postbuild para garantir que o binário ffmpeg-static
 * está disponível. Se não estiver, executa o script de instalação.
 */
import { existsSync, statSync } from "fs";
import { createRequire } from "module";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);

try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath && existsSync(ffmpegPath) && statSync(ffmpegPath).size > 1000) {
    console.log(`[ensure-ffmpeg] ffmpeg já instalado: ${ffmpegPath}`);
    process.exit(0);
  }
  console.log("[ensure-ffmpeg] Binário ffmpeg não encontrado, instalando...");
} catch (e) {
  console.log("[ensure-ffmpeg] ffmpeg-static não encontrado, instalando...");
}

// Executar o script de instalação do ffmpeg-static
try {
  const installScript = resolve(
    dirname(require.resolve("ffmpeg-static/package.json")),
    "install.js"
  );
  console.log(`[ensure-ffmpeg] Executando: node ${installScript}`);
  execSync(`node "${installScript}"`, { stdio: "inherit" });
  console.log("[ensure-ffmpeg] ffmpeg instalado com sucesso!");
} catch (err) {
  console.error("[ensure-ffmpeg] Falha ao instalar ffmpeg:", err.message);
  // Não falhar o build — o fallback de polling será usado
  process.exit(0);
}
