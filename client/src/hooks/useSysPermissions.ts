import { useSysUser } from "@/contexts/SysUserContext";

/**
 * Mapeamento de rota (path prefix) → { moduleKey, sectionKey }
 * Usado para determinar se o usuário pode ver/editar um item de menu ou seção.
 */
export const ROUTE_PERMISSION_MAP: Record<string, { moduleKey: string; sectionKey: string }> = {
  // Dashboard
  "/dashboard": { moduleKey: "dashboard", sectionKey: "visao_geral" },

  // Data VIP
  "/data-vip/colaboradores": { moduleKey: "data_vip", sectionKey: "colaboradores" },
  "/data-vip/comissoes":     { moduleKey: "data_vip", sectionKey: "colaboradores" },
  "/data-vip/metas":         { moduleKey: "data_vip", sectionKey: "metas" },
  "/data-vip/servicos":      { moduleKey: "data_vip", sectionKey: "servicos" },
  "/data-vip/produtos":      { moduleKey: "data_vip", sectionKey: "produtos" },
  "/data-vip/sync":          { moduleKey: "data_vip", sectionKey: "sync" },
  "/data-vip":               { moduleKey: "data_vip", sectionKey: "faturamento" },

  // Gestão Total
  "/gestao-total/planejamento":           { moduleKey: "gestao_total", sectionKey: "planejamento" },
  "/gestao-total/processos":              { moduleKey: "gestao_total", sectionKey: "processos" },
  "/gestao-total/instrucoes":             { moduleKey: "gestao_total", sectionKey: "instrucoes" },
  "/gestao-total/tarefas":                { moduleKey: "gestao_total", sectionKey: "tarefas" },
  "/gestao-total/cargos":                 { moduleKey: "gestao_total", sectionKey: "pessoas" },
  "/gestao-total/colaboradores":          { moduleKey: "gestao_total", sectionKey: "pessoas" },
  "/gestao-total/indicadores":            { moduleKey: "gestao_total", sectionKey: "indicadores" },
  "/gestao-total/financeiro":             { moduleKey: "gestao_total", sectionKey: "financeiro" },
  "/gestao-total/configuracao-financeira":{ moduleKey: "gestao_total", sectionKey: "configuracao_financeira" },
  "/gestao-total/marketing":              { moduleKey: "gestao_total", sectionKey: "marketing" },
  "/gestao-total/documentos":             { moduleKey: "gestao_total", sectionKey: "documentos" },
  "/gestao-total/reunioes":               { moduleKey: "gestao_total", sectionKey: "reunioes" },
  "/gestao-total/ia":                     { moduleKey: "gestao_total", sectionKey: "ia_conselheiro" },
  "/gestao-total/configuracoes":          { moduleKey: "gestao_total", sectionKey: "configuracoes" },
  "/gestao-total/usuarios-sistema":       { moduleKey: "gestao_total", sectionKey: "privilegios" },
  "/gestao-total/privilegios":            { moduleKey: "gestao_total", sectionKey: "privilegios" },
  "/gestao-total":                        { moduleKey: "gestao_total", sectionKey: "dashboard" },

  // VIP Cam
  "/vip-cam/ao-vivo":       { moduleKey: "vip_cam", sectionKey: "ao_vivo" },
  "/vip-cam/clientes":      { moduleKey: "vip_cam", sectionKey: "clientes" },
  "/vip-cam/historico":     { moduleKey: "vip_cam", sectionKey: "historico" },
  "/vip-cam/relatorios":    { moduleKey: "vip_cam", sectionKey: "metricas" },
  "/vip-cam/configuracoes": { moduleKey: "vip_cam", sectionKey: "configuracoes" },
  "/vip-cam":               { moduleKey: "vip_cam", sectionKey: "dashboard" },

  // Reputação
  "/reputacao/avaliacoes":  { moduleKey: "reputacao", sectionKey: "avaliacoes" },
  "/reputacao/respostas":   { moduleKey: "reputacao", sectionKey: "respostas" },
  "/reputacao/analise":     { moduleKey: "reputacao", sectionKey: "analise" },
  "/reputacao/integracoes": { moduleKey: "reputacao", sectionKey: "integracoes" },
  "/reputacao/historico-ia":{ moduleKey: "reputacao", sectionKey: "analise" },
  "/reputacao/config-ia":   { moduleKey: "reputacao", sectionKey: "config_ia" },
  "/reputacao":             { moduleKey: "reputacao", sectionKey: "dashboard" },

  // Auto Instagram
  "/auto-instagram/prompts":    { moduleKey: "auto_instagram", sectionKey: "prompts" },
  "/auto-instagram/aprovacao":  { moduleKey: "auto_instagram", sectionKey: "aprovacao" },
  "/auto-instagram/logs":       { moduleKey: "auto_instagram", sectionKey: "logs" },
  "/auto-instagram/stories":    { moduleKey: "auto_instagram", sectionKey: "stories" },
  "/auto-instagram/diagnostico":{ moduleKey: "auto_instagram", sectionKey: "diagnostico" },
  "/auto-instagram":            { moduleKey: "auto_instagram", sectionKey: "dashboard" },

  // We Send
  "/we-send/campanhas":      { moduleKey: "we_send", sectionKey: "campanhas" },
  "/we-send/relatorios":     { moduleKey: "we_send", sectionKey: "relatorios" },
  "/we-send/configuracoes":  { moduleKey: "we_send", sectionKey: "configuracoes" },
  "/we-send":                { moduleKey: "we_send", sectionKey: "campanhas" },
};

/**
 * Resolve a chave de permissão para um path dado.
 * Usa match mais longo primeiro para evitar colisões (ex: /data-vip vs /data-vip/metas).
 */
export function resolvePermission(path: string): { moduleKey: string; sectionKey: string } | null {
  const sorted = Object.keys(ROUTE_PERMISSION_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return ROUTE_PERMISSION_MAP[prefix];
    }
  }
  return null;
}

/**
 * Hook principal de permissões.
 * - Se não há sysUser (usuário Master via OAuth), retorna canView/canEdit = true para tudo.
 * - Se há sysUser, delega para o contexto.
 */
export function useSysPermissions() {
  const { sysUser, canView, canEdit } = useSysUser();

  function canViewPath(path: string): boolean {
    if (!sysUser) return true;
    const perm = resolvePermission(path);
    if (!perm) return true; // rota não mapeada → visível por padrão
    return canView(perm.moduleKey, perm.sectionKey);
  }

  function canEditSection(moduleKey: string, sectionKey: string): boolean {
    if (!sysUser) return true;
    return canEdit(moduleKey, sectionKey);
  }

  return { sysUser, canViewPath, canEditSection, canView, canEdit };
}
