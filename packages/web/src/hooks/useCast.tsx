import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  bootstrapDemo,
  castAct,
  getCast,
  getDemoEvents,
  normalizeRoles,
  type CastActResult,
  type CastRole,
  type CastSnapshot,
  type CastTx,
} from "../api";
import type { DemoEvent } from "../types/demo";

const RUN_KEY = "opera.demo.runId";
const ROLE_KEY = "opera.cast.role";

export const ROLE_LABELS: Record<string, string> = {
  owner: "Asset owner",
  energyOp: "Energy operator",
  maintOp: "Maintenance operator",
  replacement: "Replacement operator",
  investor: "Investor",
  regulator: "Regulator",
};

export const EXPLORER_TX = "https://testnet.monadvision.com/tx";

type CastContextValue = {
  runId: string | null;
  cast: CastSnapshot | null;
  events: DemoEvent[];
  selectedRole: string | null;
  selectedAddress: string | null;
  busy: string | null;
  lastResult: CastActResult | null;
  error: string | null;
  active: boolean;
  roles: CastRole[];
  recentTxs: CastTx[];
  setSelectedRole: (role: string | null) => void;
  refresh: () => Promise<void>;
  seedCast: () => Promise<CastActResult | null>;
  act: (action: string, args?: Record<string, unknown>, roleOverride?: string | null) => Promise<CastActResult>;
  clearCast: () => void;
  clearError: () => void;
};

const CastContext = createContext<CastContextValue | null>(null);

export function CastProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useState<string | null>(() => localStorage.getItem(RUN_KEY));
  const [cast, setCast] = useState<CastSnapshot | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [selectedRole, setSelectedRoleState] = useState<string | null>(
    () => localStorage.getItem(ROLE_KEY),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CastActResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setSelectedRole = useCallback((role: string | null) => {
    setSelectedRoleState(role);
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }, []);

  const refresh = useCallback(async () => {
    if (!runId) {
      setCast(null);
      setEvents([]);
      return;
    }
    try {
      const [snap, ev] = await Promise.all([getCast(runId), getDemoEvents(runId)]);
      setCast(snap);
      setEvents(ev.events ?? []);
      if (selectedRole && !snap.roles.some((r) => r.role === selectedRole)) {
        setSelectedRole(snap.roles[0]?.role ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runId, selectedRole, setSelectedRole]);

  useEffect(() => {
    if (!runId) return;
    localStorage.setItem(RUN_KEY, runId);
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [runId, refresh]);

  const seedCast = useCallback(async () => {
    setBusy("seed");
    setError(null);
    try {
      const boot = await bootstrapDemo({});
      setRunId(boot.runId);
      localStorage.setItem(RUN_KEY, boot.runId);
      const result = await castAct(boot.runId, { action: "seed" });
      setLastResult(result);
      const snap = await getCast(boot.runId);
      setCast(snap);
      setSelectedRole("owner");
      const ev = await getDemoEvents(boot.runId);
      setEvents(ev.events ?? []);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, [setSelectedRole]);

  const act = useCallback(
    async (action: string, args?: Record<string, unknown>, roleOverride?: string | null) => {
      if (!runId) throw new Error("Seed a cast first");
      const role = roleOverride === undefined ? selectedRole : roleOverride;
      setBusy(action);
      setError(null);
      try {
        const result = await castAct(runId, {
          action,
          role: role ?? undefined,
          args,
        });
        setLastResult(result);
        await refresh();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [runId, selectedRole, refresh],
  );

  const clearCast = useCallback(() => {
    localStorage.removeItem(RUN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setRunId(null);
    setCast(null);
    setEvents([]);
    setSelectedRoleState(null);
    setLastResult(null);
    setError(null);
  }, []);

  const roles = useMemo(() => {
    if (cast?.roles?.length) return cast.roles;
    return [];
  }, [cast]);

  const selectedAddress = useMemo(() => {
    if (!selectedRole) return null;
    return roles.find((r) => r.role === selectedRole)?.address ?? null;
  }, [roles, selectedRole]);

  const value: CastContextValue = {
    runId,
    cast,
    events,
    selectedRole,
    selectedAddress,
    busy,
    lastResult,
    error,
    active: !!runId,
    roles,
    recentTxs: cast?.recentTxs ?? lastResult?.txs ?? [],
    setSelectedRole,
    refresh,
    seedCast,
    act,
    clearCast,
    clearError: () => setError(null),
  };

  return <CastContext.Provider value={value}>{children}</CastContext.Provider>;
}

export function useCast() {
  const ctx = useContext(CastContext);
  if (!ctx) throw new Error("useCast must be used within CastProvider");
  return ctx;
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "No role";
  return ROLE_LABELS[role] ?? role;
}

/** Normalize bootstrap-style roles if cast snapshot missing */
export function castRolesFromRun(roles: unknown): CastRole[] {
  return normalizeRoles(roles as never).map((r) => ({
    role: r.role,
    address: r.address,
    label: r.label,
    customerId: r.customerId,
  }));
}
