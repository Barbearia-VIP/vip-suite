import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ModuleId =
  | "dashboard"
  | "data_vip"
  | "gestao_total"
  | "vip_cam"
  | "reputacao"
  | "auto_instagram"
  | "we_send";

export type UserRole = "master" | "org_admin" | "unit_manager" | "team_lead" | "colaborador";

export interface Unit {
  id: number;
  name: string;
  slug: string;
  orgId: number;
  city?: string;
  state?: string;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
}

interface AppContextValue {
  // Active module
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;

  // Selected unit (null = all units / master view)
  selectedUnit: Unit | null;
  setSelectedUnit: (unit: Unit | null) => void;

  // Available units for current user
  availableUnits: Unit[];
  setAvailableUnits: (units: Unit[]) => void;

  // Current organization
  organization: Organization | null;
  setOrganization: (org: Organization | null) => void;

  // Current user role in context
  userRole: UserRole | null;
  setUserRole: (role: UserRole | null) => void;

  // Sidebar collapsed state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Persist selected unit across page reloads
  useEffect(() => {
    const stored = localStorage.getItem("vip_selected_unit");
    if (stored) {
      try {
        setSelectedUnit(JSON.parse(stored));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (selectedUnit) {
      localStorage.setItem("vip_selected_unit", JSON.stringify(selectedUnit));
    } else {
      localStorage.removeItem("vip_selected_unit");
    }
  }, [selectedUnit]);

  return (
    <AppContext.Provider
      value={{
        activeModule,
        setActiveModule,
        selectedUnit,
        setSelectedUnit,
        availableUnits,
        setAvailableUnits,
        organization,
        setOrganization,
        userRole,
        setUserRole,
        sidebarCollapsed,
        setSidebarCollapsed,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
