import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { setSysUserGlobalState } from "@/lib/sysUserState";

export type SysUserPermission = {
  moduleKey: string;
  sectionKey: string;
  canView: number;
  canEdit: number;
};

export type SysUser = {
  id: number;
  name: string;
  email: string;
  orgId: number;
  roleId: number | null;
  allowedUnitIds: number[];
  permissions: SysUserPermission[];
};

type SysUserContextType = {
  sysUser: SysUser | null;
  isLoading: boolean;
  refetch: () => void;
  canView: (moduleKey: string, sectionKey: string) => boolean;
  canEdit: (moduleKey: string, sectionKey: string) => boolean;
};

const SysUserContext = createContext<SysUserContextType>({
  sysUser: null,
  isLoading: true,
  refetch: () => {},
  canView: () => true,
  canEdit: () => true,
});

export function SysUserProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = trpc.sysUsers.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const sysUser = (data as SysUser | null | undefined) ?? null;

  // Sincroniza o estado global (acessível fora do React) quando sysUser muda
  useEffect(() => {
    if (!isLoading) {
      setSysUserGlobalState(!!sysUser);
    }
  }, [sysUser, isLoading]);

  function canView(moduleKey: string, sectionKey: string): boolean {
    if (!sysUser) return true; // Master (OAuth) vê tudo
    const perm = sysUser.permissions.find(
      p => p.moduleKey === moduleKey && p.sectionKey === sectionKey
    );
    return perm ? perm.canView === 1 : false;
  }

  function canEdit(moduleKey: string, sectionKey: string): boolean {
    if (!sysUser) return true; // Master vê e edita tudo
    const perm = sysUser.permissions.find(
      p => p.moduleKey === moduleKey && p.sectionKey === sectionKey
    );
    return perm ? perm.canEdit === 1 : false;
  }

  return (
    <SysUserContext.Provider value={{ sysUser, isLoading, refetch, canView, canEdit }}>
      {children}
    </SysUserContext.Provider>
  );
}

export function useSysUser() {
  return useContext(SysUserContext);
}
