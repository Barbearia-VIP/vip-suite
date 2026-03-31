import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";

/**
 * Loads the user's first organization and available units,
 * then syncs them into AppContext.
 */
export function useOrg() {
  const { setOrganization, setAvailableUnits, setUserRole, selectedUnit } = useApp();

  const orgsQuery = trpc.orgs.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const firstOrg = orgsQuery.data?.[0];

  const unitsQuery = trpc.orgs.units.useQuery(
    { orgId: firstOrg?.id ?? 0 },
    { enabled: !!firstOrg?.id, staleTime: 5 * 60 * 1000 }
  );

  const profileQuery = trpc.orgs.myProfile.useQuery(
    { orgId: firstOrg?.id ?? 0 },
    { enabled: !!firstOrg?.id }
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
