import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSysUser } from "@/contexts/SysUserContext";

/**
 * Loads the user's first organization and available units,
 * then syncs them into AppContext.
 *
 * Queries are only enabled for OAuth (Master) users.
 * Unit users (sysUser) do not use these OAuth-protected endpoints.
 */
export function useOrg() {
  const { setOrganization, setAvailableUnits, setUserRole, selectedUnit } = useApp();
  const { isAuthenticated } = useAuth();
  const { sysUser } = useSysUser();

  // Só executa queries OAuth se o usuário Master estiver autenticado
  // Usuários de unidade (sysUser) não têm acesso a essas rotas protegidas
  const isOAuthUser = isAuthenticated && !sysUser;

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

  return {
    org: firstOrg,
    units: unitsQuery.data ?? [],
    profile: profileQuery.data,
    loading: orgsQuery.isLoading || unitsQuery.isLoading,
  };
}
