import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { orgsRouter } from "./routers/orgs";
import { dataVipRouter } from "./routers/dataVip";
import { dashboardRouter } from "./routers/dashboard";
import { gestaoTotalRouter } from "./routers/gestaoTotal";
import { vipCamRouter } from "./routers/vipCam";
import { reputacaoRouter } from "./routers/reputacao";
import { igConfigRouter, igDashboardRouter, igLogsRouter, igApprovalRouter, igStoriesRouter, igPromptsRouter } from "./routers/instagram";
import { initSchedulers } from "./igScheduler";

// Inicializar schedulers do Instagram ao subir o servidor
initSchedulers().catch(console.error);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  orgs: orgsRouter,
  dataVip: dataVipRouter,
  dashboard: dashboardRouter,
  gestaoTotal: gestaoTotalRouter,
  vipCam: vipCamRouter,
  reputacao: reputacaoRouter,
  ig: igConfigRouter,
  igDashboard: igDashboardRouter,
  igLogs: igLogsRouter,
  igApproval: igApprovalRouter,
  igStories: igStoriesRouter,
  igPrompts: igPromptsRouter,
});

export type AppRouter = typeof appRouter;
