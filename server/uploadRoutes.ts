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

// Helper para gerar chave única no S3
function genKey(prefix: string, originalname: string): string {
  const ext = originalname.split(".").pop() ?? "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${timestamp}-${random}.${ext}`;
}

export function registerUploadRoutes(app: Express) {
  /**
   * POST /api/upload-logo
   * Recebe a logo da organização e faz upload para o S3.
   * Resposta: { url: string, fileKey: string }
   */
  app.post("/api/upload-logo", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "Nenhum arquivo enviado." }); return; }
      const { buffer, mimetype, originalname } = req.file;
      const fileKey = genKey("brand-assets/logo", originalname);
      const { url } = await storagePut(fileKey, buffer, mimetype);
      res.json({ url, fileKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao fazer upload";
      console.error("[upload-logo]", message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/upload-image-bank
   * Recebe uma imagem para o banco de imagens e faz upload para o S3.
   * Resposta: { url: string, fileKey: string }
   */
  app.post("/api/upload-image-bank", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "Nenhum arquivo enviado." }); return; }
      const { buffer, mimetype, originalname } = req.file;
      const fileKey = genKey("image-bank", originalname);
      const { url } = await storagePut(fileKey, buffer, mimetype);
      res.json({ url, fileKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao fazer upload";
      console.error("[upload-image-bank]", message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/upload-art-image
   * Recebe um arquivo de imagem de referência para Criação de Arte,
   * faz upload para o S3 e retorna a URL pública.
   * Resposta: { url: string }
   */
  app.post("/api/upload-art-image", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "Nenhum arquivo enviado." }); return; }
      const { buffer, mimetype, originalname } = req.file;
      const key = genKey("art-references", originalname);
      const { url } = await storagePut(key, buffer, mimetype);
      res.json({ url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao fazer upload";
      console.error("[upload-art-image]", message);
      res.status(500).json({ error: message });
    }
  });
}
