"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** How the signed-in user wants times shown. Saved on their account; each user has their own. */
export type TimeFormat = "12" | "24";
export const TIME_FORMATS: { value: TimeFormat; label: string; example: string }[] = [
  { value: "12", label: "12-hour", example: "2:30 PM" },
  { value: "24", label: "24-hour", example: "14:30" },
];
export const isTimeFormat = (v: unknown): v is TimeFormat => v === "12" || v === "24";

interface Me {
  id: string;
  email: string | null;
  name: string | null;
  time_format: TimeFormat;
}
interface Ctx {
  me: Me | null;
  format: TimeFormat;
  setFormat: (f: TimeFormat) => Promise<void>;
}

const TimeFormatContext = createContext<Ctx>({ me: null, format: "24", setFormat: async () => {} });
const cacheKey = (uid: string) => `krz-time-format:${uid}`;

/**
 * Loads the user's saved format from their account. A per-user browser cache only
 * avoids a flash of the wrong format before the account answers; the account wins.
 */
export function TimeFormatProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [format, setLocal] = useState<TimeFormat>("24");

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { me?: Me } | null) => {
        if (!alive || !j?.me) return;
        try {
          const cached = localStorage.getItem(cacheKey(j.me.id));
          if (isTimeFormat(cached) && cached !== j.me.time_format) setLocal(cached);
        } catch {}
        setMe(j.me);
        setLocal(j.me.time_format);
        try {
          localStorage.setItem(cacheKey(j.me.id), j.me.time_format);
        } catch {}
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setFormat = useCallback(
    async (f: TimeFormat) => {
      const prev = format;
      setLocal(f);
      if (me) {
        try {
          localStorage.setItem(cacheKey(me.id), f);
        } catch {}
      }
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_format: f }),
      });
      if (!r.ok) {
        setLocal(prev); // keep the screen honest if the save failed
        throw new Error("Couldn't save your time format. Try again.");
      }
      setMe((m) => (m ? { ...m, time_format: f } : m));
    },
    [format, me],
  );

  const value = useMemo(() => ({ me, format, setFormat }), [me, format, setFormat]);
  return <TimeFormatContext.Provider value={value}>{children}</TimeFormatContext.Provider>;
}

export const useTimeFormat = () => useContext(TimeFormatContext);

// ---------- formatting ----------

/** "2:30 PM" or "14:30". */
export function clockText(d: Date, f: TimeFormat): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: f !== "24", ...(f === "24" ? { hourCycle: "h23" as const } : {}) });
}

/** Short label for a message timestamp: "now", "5m", a clock time today, a weekday this week, else a date. */
export function relParts(iso: string): { kind: "text"; text: string } | { kind: "time"; date: Date } {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return { kind: "text", text: "now" };
  if (diff < 3_600_000) return { kind: "text", text: `${Math.floor(diff / 60_000)}m` };
  if (new Date().toDateString() === d.toDateString()) return { kind: "time", date: d };
  if (diff < 6 * 86_400_000) return { kind: "text", text: d.toLocaleDateString([], { weekday: "short" }) };
  return { kind: "text", text: d.toLocaleDateString([], { month: "short", day: "numeric" }) };
}

// ---------- components ----------

/** A clock time in the user's format. */
export function Clock({ date }: { date: Date }) {
  const { format } = useTimeFormat();
  return <>{clockText(date, format)}</>;
}

/** Message timestamps ("5m", "Tue", or today's clock time in the user's format). */
export function RelTime({ iso }: { iso: string }) {
  const p = relParts(iso);
  return p.kind === "text" ? <>{p.text}</> : <Clock date={p.date} />;
}

/** Event / due dates: "Sat, Oct 31 · 13:00" or "Sat, Oct 31 · 1:00 PM". */
export function EventWhen({ ev }: { ev: { start: string; all_day?: boolean } }) {
  const d = new Date(ev.start);
  if (ev.all_day) return <>{d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</>;
  return (
    <span className="when-inline">
      {d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · <Clock date={d} />
    </span>
  );
}
