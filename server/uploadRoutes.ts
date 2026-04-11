/**
 * uploadRoutes.ts — Endpoints REST para upload de arquivos
 * Registra rotas de upload no app Express antes do tRPC middleware.
 */
import type { Express } from "express";
import multer from "multer";
import { storagePut } from "./storage";

// Multer com armazenamento em memória (sem disco) — limite de 16 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não suportado. Use JPEG, PNG, WEBP ou GIF."));
    }
  },
});

export function registerUploadRoutes(app: Express) {
  /**
   * POST /api/upload-art-image
   * Recebe um arquivo de imagem (campo "file"), faz upload para o S3
   * e retorna a URL pública.
   *
   * Resposta: { url: string }
   */
  app.post(
    "/api/upload-art-image",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Nenhum arquivo enviado." });
          return;
        }

        const { buffer, mimetype, originalname } = req.file;

        // Gera uma chave única para evitar colisões no S3
        const ext = originalname.split(".").pop() ?? "jpg";
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const key = `art-references/${timestamp}-${random}.${ext}`;

        const { url } = await storagePut(key, buffer, mimetype);

        res.json({ url });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao fazer upload";
        console.error("[upload-art-image]", message);
        res.status(500).json({ error: message });
      }
    }
  );
}
