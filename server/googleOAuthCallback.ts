/**
 * Rota HTTP Express para o callback OAuth do Google Business Profile.
 * O Google redireciona para /api/google-oauth/callback após autorização.
 * Esta rota troca o code por tokens, salva no banco e redireciona para o frontend.
 */
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { repConexoes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { exchangeGoogleCode } from "./routers/reputacao";

export function registerGoogleOAuthCallback(app: Express) {
  app.get("/api/google-oauth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    // Erro de autorização (usuário cancelou, etc.)
    if (error) {
      return res.redirect(`/reputacao/integracoes?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect("/reputacao/integracoes?error=missing_params");
    }

    let unitId: number;
    let origin: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
      unitId = decoded.unitId;
      origin = decoded.origin || ""; // ex: https://xxx.manus.space
    } catch {
      return res.redirect("/reputacao/integracoes?error=invalid_state");
    }

    const db = await getDb();
    if (!db) return res.redirect("/reputacao/integracoes?error=db_error");

    try {
      // Buscar credenciais da conexão Google desta unidade
      const [conexao] = await db
        .select()
        .from(repConexoes)
        .where(and(eq(repConexoes.unitId, unitId), eq(repConexoes.plataforma, "google")))
        .limit(1);

      if (!conexao?.googleClientId || !conexao?.googleClientSecret) {
        return res.redirect(`${origin}/reputacao/integracoes?error=missing_credentials`);
      }

      const redirectUri = `${origin}/api/google-oauth/callback`;
      const tokenData = await exchangeGoogleCode(code, conexao.googleClientId, conexao.googleClientSecret, redirectUri);

      if (tokenData.error) {
        console.error("[Google OAuth] Token exchange error:", tokenData.error, tokenData.error_description);
        return res.redirect(`${origin}/reputacao/integracoes?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
      }

      const expiresIn = tokenData.expires_in || 3600;
      await db.update(repConexoes).set({
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token || conexao.googleRefreshToken, // preservar refresh_token existente
        googleTokenExpiry: new Date(Date.now() + expiresIn * 1000),
        isAtivo: true,
        updatedAt: new Date(),
      }).where(eq(repConexoes.id, conexao.id));

      // Redirecionar para o frontend com sucesso
      return res.redirect(`${origin}/reputacao/integracoes?google_connected=1&unit=${unitId}`);
    } catch (err) {
      console.error("[Google OAuth] Callback error:", err);
      return res.redirect(`${origin}/reputacao/integracoes?error=server_error`);
    }
  });
}
