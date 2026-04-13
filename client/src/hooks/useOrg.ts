import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSysUser } from "@/contexts/SysUserContext";

/**
 * Loads the user's first organization and available units,
 * then syncs them into AppContext.
 *
 * - OAuth (Master) users: uses protected orgs.list / orgs.units / orgs.myProfile
 * - SysUser (unit login): uses public sysUsers.getOrgById to populate org context
 */
export function useOrg() {
  const { setOrganization, setAvailableUnits, setUserRole, organization } = useApp();
  const { isAuthenticated } = useAuth();
  const { sysUser } = useSysUser();

  // Só executa queries OAuth se o usuário Master estiver autenticado
  const isOAuthUser = isAuthenticated && !sysUser;

  // ── OAuth path ────────────────────────────────────────────────────────────
  const orgsQuery = trpc.orgs.list.useQuery(undefined, {
    enabled: isOAuthUser,
    staleTime: 5 * 60 * 1000,
  });

  const firstOrg = orgsQuery.data?.[0];

  const unitsQuery = trpc.orgs.units.useQuery(
    { orgId: firstOrg?.id ?? 0 },
    { enabled: isOAuthUser && !!firstOrg?.id, staleTime: 5 * 60 * 1000 }
  );

  const profileQuery = trpc.orgs.myProfile.useQuery(
    { orgId: firstOrg?.id ?? 0 },
    { enabled: isOAuthUser && !!firstOrg?.id }
  );

  // ── SysUser path ──────────────────────────────────────────────────────────
  // Busca a organização pelo orgId do sysUser via endpoint público
  const sysOrgQuery = trpc.sysUsers.getOrgById.useQuery(
    { orgId: sysUser?.orgId ?? 0 },
    {
      enabled: !!sysUser && (sysUser.orgId ?? 0) > 0,
      staleTime: 10 * 60 * 1000,
    }
  );

  // ── Effects: OAuth ────────────────────────────────────────────────────────
  useEffect(() => {
    if (firstOrg) {
      setOrganization({
        id: firstOrg.id,
        name: firstOrg.name,
        slug: firstOrg.slug,
        logoUrl: firstOrg.logoUrl ?? undefined,
        primaryColor: firstOrg.primaryColor ?? undefined,
      });
    }
  }, [firstOrg]);

  useEffect(() => {
    if (unitsQuery.data) {
      setAvailableUnits(
        unitsQuery.data.map((u) => ({
          id: u.id,
          name: u.name,
          slug: u.slug,
          orgId: u.orgId,
          city: u.city ?? undefined,
          state: u.state ?? undefined,
        }))
      );
    }
  }, [unitsQuery.data]);

  useEffect(() => {
    if (profileQuery.data) {
      setUserRole(profileQuery.data.role);
    }
  }, [profileQuery.data]);

  // ── Effects: SysUser ──────────────────────────────────────────────────────
  useEffect(() => {
    if (sysUser && sysOrgQuery.data) {
      const o = sysOrgQuery.data;
      setOrganization({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logoUrl ?? undefined,
        primaryColor: o.primaryColor ?? undefined,
      });
      // Usuários de unidade têm papel de gestor de unidade
      setUserRole("unit_manager");
    }
  }, [sysUser, sysOrgQuery.data]);

  // ── Return ────────────────────────────────────────────────────────────────
  // Para sysUser: retorna o org do sysOrgQuery; para OAuth: retorna firstOrg
  const effectiveOrg = sysUser
    ? (sysOrgQuery.data ?? organization ?? undefined)
    : (firstOrg ?? organization ?? undefined);

  return {
    org: effectiveOrg,
    units: unitsQuery.data ?? [],
    profile: profileQuery.data,
    loading: sysUser
      ? sysOrgQuery.isLoading
      : (orgsQuery.isLoading || unitsQuery.isLoading),
  };
}
