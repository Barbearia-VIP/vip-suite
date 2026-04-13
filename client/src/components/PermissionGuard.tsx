import React from "react";
import { useSysPermissions } from "@/hooks/useSysPermissions";

interface PermissionGuardProps {
  moduleKey: string;
  sectionKey: string;
  /** Se true, verifica canView em vez de canEdit */
  view?: boolean;
  children: React.ReactNode;
  /** Elemento alternativo quando sem permissão (padrão: null) */
  fallback?: React.ReactNode;
}

/**
 * Renderiza `children` apenas se o usuário tiver a permissão necessária.
 * - Usuário Master (OAuth, sem sysUser): sempre renderiza.
 * - Usuário de unidade: verifica canEdit (padrão) ou canView (se view=true).
 */
export function PermissionGuard({
  moduleKey,
  sectionKey,
  view = false,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { canView, canEdit } = useSysPermissions();
  const allowed = view ? canView(moduleKey, sectionKey) : canEdit(moduleKey, sectionKey);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
