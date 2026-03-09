"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

type TimerSession = {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  cost: number;
};

type StoredTimerState = {
  elapsedTime: number;
  isRunning: boolean;
  startTime: string | null;
  sessionStartTime: string | null;
};

type TimerData = {
  settings: {
    pricePerHour: number;
  };
  currentTimerState: StoredTimerState;
  history: TimerSession[];
};

type LegacyTimerUser = {
  username: string;
  password: string;
  settings: {
    pricePerHour: number;
  };
  currentTimerState: StoredTimerState;
  history: TimerSession[];
};

type LegacyAppData = {
  users: LegacyTimerUser[];
  currentUser: string | null;
};

type ViewMode = "timer" | "config" | "history";

const STORAGE_PREFIX = "costTimerAppDataByUser";
const LEGACY_STORAGE_KEY = "costTimerAppData";
const DEFAULT_PRICE_PER_HOUR = 100;

const DEFAULT_TIMER_STATE: StoredTimerState = {
  elapsedTime: 0,
  isRunning: false,
  startTime: null,
  sessionStartTime: null,
};

const DEFAULT_TIMER_DATA: TimerData = {
  settings: {
    pricePerHour: DEFAULT_PRICE_PER_HOUR,
  },
  currentTimerState: DEFAULT_TIMER_STATE,
  history: [],
};

function asFiniteNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStoredTimerState(
  elapsedTime: number,
  isRunning: boolean,
  startMs: number | null,
  sessionStartMs: number | null,
): StoredTimerState {
  return {
    elapsedTime: Math.max(0, Math.floor(elapsedTime)),
    isRunning,
    startTime: startMs !== null ? new Date(startMs).toISOString() : null,
    sessionStartTime: sessionStartMs !== null ? new Date(sessionStartMs).toISOString() : null,
  };
}

function normalizeTimerData(raw: unknown): TimerData {
  if (!raw || typeof raw !== "object") return DEFAULT_TIMER_DATA;
  const maybe = raw as Partial<TimerData>;
  const rawTimer =
    maybe.currentTimerState && typeof maybe.currentTimerState === "object"
      ? maybe.currentTimerState
      : DEFAULT_TIMER_STATE;

  const normalizedTimer: StoredTimerState = {
    elapsedTime: Math.max(0, Math.floor(asFiniteNumber(rawTimer.elapsedTime, 0))),
    isRunning: Boolean(rawTimer.isRunning) && Boolean(rawTimer.startTime),
    startTime: typeof rawTimer.startTime === "string" ? rawTimer.startTime : null,
    sessionStartTime:
      typeof rawTimer.sessionStartTime === "string" ? rawTimer.sessionStartTime : null,
  };

  const rawHistory = Array.isArray(maybe.history) ? maybe.history : [];
  const history: TimerSession[] = rawHistory
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const session = entry as Partial<TimerSession>;
      const start = typeof session.startTime === "string" ? session.startTime : null;
      const end = typeof session.endTime === "string" ? session.endTime : null;
      if (!start || !end) return null;
      return {
        id:
          typeof session.id === "string" && session.id.trim()
            ? session.id
            : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        startTime: start,
        endTime: end,
        duration: Math.max(0, asFiniteNumber(session.duration, 0)),
        cost: Math.max(0, asFiniteNumber(session.cost, 0)),
      };
    })
    .filter((value): value is TimerSession => value !== null);

  return {
    settings: {
      pricePerHour: Math.max(
        0,
        asFiniteNumber(maybe.settings?.pricePerHour, DEFAULT_PRICE_PER_HOUR),
      ),
    },
    currentTimerState: normalizedTimer,
    history,
  };
}

function normalizeLegacyAppData(raw: unknown): LegacyAppData {
  if (!raw || typeof raw !== "object") return { users: [], currentUser: null };
  const maybe = raw as Partial<LegacyAppData>;
  const users = Array.isArray(maybe.users) ? maybe.users : [];

  const normalizedUsers: LegacyTimerUser[] = users
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const user = entry as Partial<LegacyTimerUser>;
      if (typeof user.username !== "string" || !user.username.trim()) return null;

      const normalized = normalizeTimerData({
        settings: user.settings,
        currentTimerState: user.currentTimerState,
        history: user.history,
      });

      return {
        username: user.username.trim(),
        password: typeof user.password === "string" ? user.password : "",
        settings: normalized.settings,
        currentTimerState: normalized.currentTimerState,
        history: normalized.history,
      };
    })
    .filter((value): value is LegacyTimerUser => value !== null);

  const currentUser =
    typeof maybe.currentUser === "string" && maybe.currentUser.trim() ? maybe.currentUser.trim() : null;

  return {
    users: normalizedUsers.sort((a, b) => {
      if (a.username === currentUser) return -1;
      if (b.username === currentUser) return 1;
      return 0;
    }),
    currentUser:
      currentUser && normalizedUsers.some((user) => user.username === currentUser)
        ? currentUser
        : null,
  };
}

function buildUserKey(user: unknown): string | null {
  const record = asRecord(user);
  if (!record) return null;

  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (id) return id;

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (email) return email;

  const name = typeof record.name === "string" ? record.name.trim().toLowerCase() : "";
  if (name) return name;

  return null;
}

function buildDisplayName(user: unknown, fallback: string): string {
  const record = asRecord(user);
  if (!record) return fallback;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) return name;

  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (email) return email;

  return fallback;
}

function getStorageKey(userKey: string): string {
  return `${STORAGE_PREFIX}:${userKey}`;
}

function migrateLegacyTimerData(raw: unknown): TimerData | null {
  const legacyData = normalizeLegacyAppData(raw);
  if (legacyData.users.length === 0) return null;

  const preferred =
    (legacyData.currentUser
      ? legacyData.users.find((user) => user.username === legacyData.currentUser)
      : undefined) ?? legacyData.users[0];

  if (!preferred) return null;

  return normalizeTimerData({
    settings: preferred.settings,
    currentTimerState: preferred.currentTimerState,
    history: preferred.history,
  });
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Fecha invalida";
  return new Date(parsed).toLocaleString("es-MX");
}

export function CronometerApp() {
  const router = useRouter();
  const { data: sessionData, isPending: isSessionPending } = authClient.useSession();
  const authUser = sessionData?.user ?? null;
  const userKey = useMemo(() => buildUserKey(authUser), [authUser]);
  const displayName = useMemo(() => buildDisplayName(authUser, "Usuario"), [authUser]);
  const storageKey = useMemo(() => (userKey ? getStorageKey(userKey) : null), [userKey]);

  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewMode>("timer");
  const [timerData, setTimerData] = useState<TimerData>(DEFAULT_TIMER_DATA);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timerStartMs, setTimerStartMs] = useState<number | null>(null);
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);

  const [pricePerHourInput, setPricePerHourInput] = useState(String(DEFAULT_PRICE_PER_HOUR));
  const [configError, setConfigError] = useState("");

  const history = useMemo(() => {
    return [...timerData.history].sort((a, b) => {
      const aTs = Date.parse(a.startTime);
      const bTs = Date.parse(b.startTime);
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });
  }, [timerData.history]);

  const pricePerHour = timerData.settings.pricePerHour;
  const currentCost = (elapsedTime / 3600000) * pricePerHour;

  const applyTimerSnapshot = useCallback((data: TimerData) => {
    const nextElapsed = Math.max(0, data.currentTimerState.elapsedTime);
    const parsedStart = asTimestamp(data.currentTimerState.startTime);
    const parsedSession = asTimestamp(data.currentTimerState.sessionStartTime);

    setElapsedTime(nextElapsed);
    setTimerStartMs(parsedStart);
    setSessionStartMs(parsedSession);
    setIsRunning(Boolean(data.currentTimerState.isRunning && parsedStart !== null));
    setPricePerHourInput(String(data.settings.pricePerHour));
  }, []);

  const updateTimerData = useCallback(
    (updater: (prev: TimerData) => TimerData) => {
      setTimerData((prev) => {
        const next = normalizeTimerData(updater(prev));
        if (typeof window !== "undefined" && storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(next));
        }
        return next;
      });
    },
    [storageKey],
  );

  const persistTimerState = useCallback(
    (
      nextElapsed: number,
      nextRunning: boolean,
      nextStartMs: number | null,
      nextSessionStartMs: number | null,
    ) => {
      updateTimerData((prev) => ({
        ...prev,
        currentTimerState: toStoredTimerState(
          nextElapsed,
          nextRunning,
          nextStartMs,
          nextSessionStartMs,
        ),
      }));
    },
    [updateTimerData],
  );

  useEffect(() => {
    if (isSessionPending) return;
    if (typeof window === "undefined") return;

    if (!storageKey) {
      setTimerData(DEFAULT_TIMER_DATA);
      applyTimerSnapshot(DEFAULT_TIMER_DATA);
      setReady(true);
      return;
    }

    setReady(false);

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized = normalizeTimerData(parsed);
        setTimerData(normalized);
        applyTimerSnapshot(normalized);
      } else {
        let seedData = DEFAULT_TIMER_DATA;

        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const migrated = migrateLegacyTimerData(JSON.parse(legacyRaw));
          if (migrated) {
            seedData = migrated;
          }
        }

        localStorage.setItem(storageKey, JSON.stringify(seedData));
        setTimerData(seedData);
        applyTimerSnapshot(seedData);
      }
    } catch {
      setTimerData(DEFAULT_TIMER_DATA);
      applyTimerSnapshot(DEFAULT_TIMER_DATA);
    } finally {
      setView("timer");
      setConfigError("");
      setReady(true);
    }
  }, [applyTimerSnapshot, isSessionPending, storageKey]);

  useEffect(() => {
    if (!isRunning || timerStartMs === null) return;

    const tick = () => {
      setElapsedTime(Math.max(0, Date.now() - timerStartMs));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [isRunning, timerStartMs]);

  useEffect(() => {
    if (isSessionPending) return;
    if (authUser && storageKey) return;
    router.replace("/login?next=%2Fcronometer");
  }, [authUser, isSessionPending, router, storageKey]);

  const handleStart = () => {
    if (isRunning) return;
    const now = Date.now();
    const safeElapsed = Math.max(0, elapsedTime);
    const nextSessionStart = safeElapsed === 0 ? now : sessionStartMs ?? now - safeElapsed;
    const nextStart = now - safeElapsed;

    setSessionStartMs(nextSessionStart);
    setTimerStartMs(nextStart);
    setIsRunning(true);
    persistTimerState(safeElapsed, true, nextStart, nextSessionStart);
  };

  const handlePause = () => {
    if (!isRunning) return;
    const nextElapsed = timerStartMs !== null ? Math.max(0, Date.now() - timerStartMs) : elapsedTime;

    setElapsedTime(nextElapsed);
    setIsRunning(false);
    setTimerStartMs(null);
    persistTimerState(nextElapsed, false, null, sessionStartMs);
  };

  const handleStop = () => {
    const now = Date.now();
    const finalElapsed =
      isRunning && timerStartMs !== null ? Math.max(0, Date.now() - timerStartMs) : elapsedTime;
    const finalCost = (finalElapsed / 3600000) * pricePerHour;
    const safeStart = sessionStartMs ?? now - finalElapsed;

    updateTimerData((prev) => {
      return {
        ...prev,
        history:
          finalElapsed > 0
            ? [
                {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                  startTime: new Date(safeStart).toISOString(),
                  endTime: new Date(now).toISOString(),
                  duration: finalElapsed,
                  cost: finalCost,
                },
                ...prev.history,
              ]
            : prev.history,
        currentTimerState: DEFAULT_TIMER_STATE,
      };
    });

    setElapsedTime(0);
    setIsRunning(false);
    setTimerStartMs(null);
    setSessionStartMs(null);
  };

  const handleSaveConfig = (event: FormEvent) => {
    event.preventDefault();

    const parsed = Number(pricePerHourInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setConfigError("Ingresa un precio valido, mayor o igual a 0.");
      return;
    }

    updateTimerData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        pricePerHour: parsed,
      },
    }));

    setConfigError("");
    setView("timer");
  };

  if (isSessionPending || !ready || !authUser || !storageKey) {
    return (
      <section className="container mx-auto px-4 py-8 md:px-6">
        <Card className="mx-auto max-w-3xl rounded-2xl bg-card/80 p-8 shadow-xl backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">Redirigiendo...</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-8 md:px-6">
      <Card className="mx-auto w-full max-w-3xl rounded-2xl bg-card/80 p-6 shadow-xl backdrop-blur-sm md:p-8">
        <h1 className="text-2xl font-bold md:text-3xl">Cronometro con costo</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Usuario activo: <span className="font-semibold text-foreground">{displayName}</span>
          </span>
          <Badge variant={isRunning ? "default" : "secondary"}>{isRunning ? "En curso" : "Pausado"}</Badge>
          <Badge variant="outline">RD$ {pricePerHour.toFixed(2)}/hora</Badge>
        </div>

        {view === "timer" ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border bg-background/80 p-5 text-center">
              <p className="text-5xl font-mono font-bold tracking-wide">{formatTimer(elapsedTime)}</p>
              <p className="mt-3 text-xl">
                Costo acumulado: <span className="font-semibold">RD$ {currentCost.toFixed(2)}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" onClick={handleStart} disabled={isRunning} className="font-semibold">
                Iniciar
              </Button>
              <Button
                type="button"
                onClick={handlePause}
                disabled={!isRunning}
                variant="secondary"
                className="font-semibold"
              >
                Pausar
              </Button>
              <Button
                type="button"
                onClick={handleStop}
                disabled={elapsedTime === 0}
                variant="destructive"
                className="font-semibold"
              >
                Detener y guardar
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPricePerHourInput(String(pricePerHour));
                  setConfigError("");
                  setView("config");
                }}
              >
                Configuracion
              </Button>
              <Button type="button" variant="outline" onClick={() => setView("history")}>
                Historial de sesiones
              </Button>
            </div>
          </div>
        ) : null}

        {view === "config" ? (
          <form className="mt-6 space-y-4" onSubmit={handleSaveConfig}>
            <h2 className="text-lg font-semibold">Configuracion</h2>
            <div className="space-y-1.5">
              <Label htmlFor="price-per-hour">Precio por hora (RD$)</Label>
              <Input
                id="price-per-hour"
                type="number"
                min={0}
                step="0.01"
                value={pricePerHourInput}
                onChange={(event) => setPricePerHourInput(event.target.value)}
              />
            </div>
            {configError ? <p className="text-sm text-destructive">{configError}</p> : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="submit">Guardar configuracion</Button>
              <Button type="button" variant="outline" onClick={() => setView("timer")}>
                Volver al cronometro
              </Button>
            </div>
          </form>
        ) : null}

        {view === "history" ? (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Historial de sesiones</h2>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-background/80 p-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay historial disponible.</p>
              ) : null}
              {history.map((session) => (
                <div key={session.id} className="rounded-md border bg-card p-3">
                  <p className="text-sm">
                    <span className="font-semibold">Inicio:</span> {formatDate(session.startTime)}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold">Fin:</span> {formatDate(session.endTime)}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold">Duracion:</span> {formatTimer(session.duration)}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold">Costo:</span> RD$ {session.cost.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setView("timer")}>
              Volver al cronometro
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
