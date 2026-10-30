"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, CalendarIcon, ChannelChip, CHANNELS, SendIcon, TopBar } from "@/components/ui";
import { EventWhen, RelTime } from "@/lib/time-format";
import type { Channel, Insight, SuggestedEvent } from "@/lib/types";

interface Item {
  id: string;
  channel: Channel;
  from: string;
  last_message_at: string;
  unread: boolean;
  summary: string;
  needs_reply: boolean;
  priority: number;
  event: SuggestedEvent | null;
  calendar_added: boolean;
}
interface Detail {
  conversation: { id: string; channel: Channel; from: string; participant: string | null; replied_at: string | null };
  messages: { id: string; direction: "in" | "out"; sender: string; body: string; sent_at: string }[];
  insight: (Insight & { analyzed_at: string }) | null;
  calendar: { html_link: string | null; title: string } | null;
}
type Filter = "all" | "reply" | Channel;
type Tone = "friendly" | "short" | "formal";

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
};

export default function InboxPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (withBrief = false) => {
    try {
      const r = await api<{ items: Item[]; brief: string | null }>(`/api/inbox${withBrief ? "?brief=1" : ""}`);
      setItems(r.items);
      if (withBrief) setBrief(r.brief);
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api("/api/me", { method: "PATCH", body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }).catch(() => {});
    load(true);
    const t = setInterval(() => load(false), 30_000); // chat webhooks land server-side; poll for them
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (filter === "reply" && !i.needs_reply) return false;
      if (filter !== "all" && filter !== "reply" && i.channel !== filter) return false;
      return !q || i.from.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  // Keep the right panel in step with the list: when the selection isn't in the
  // current filter (or nothing is selected), open the filter's first conversation.
  useEffect(() => {
    if (list.length && !list.some((i) => i.id === selId)) setSelId(list[0]!.id);
  }, [list, selId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, reply: 0, whatsapp: 0, messenger: 0, viber: 0, email: 0 };
    for (const i of items ?? []) {
      c.all++;
      c[i.channel]++;
      if (i.needs_reply) c.reply++;
    }
    return c;
  }, [items]);

  const weekAhead = Date.now() + 8 * 86_400_000;
  const dues = (items ?? [])
    .filter((i) => i.event && Date.parse(i.event.start) > Date.now() - 86_400_000 && Date.parse(i.event.start) < weekAhead)
    .sort((a, b) => Date.parse(a.event!.start) - Date.parse(b.event!.start));

  const filters: { key: Filter; label: string; dot: string }[] = [
    { key: "all", label: "All messages", dot: "#16181D" },
    { key: "reply", label: "Needs reply", dot: "#E0661E" },
    ...(["whatsapp", "messenger", "viber", "email"] as Channel[]).map((k) => ({ key: k as Filter, label: CHANNELS[k].label, dot: CHANNELS[k].dot })),
  ];

  const today = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      <TopBar active="inbox">
        <label className="search">
          <span className="sr-only">Search messages</span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input type="search" placeholder="Search people and summaries" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </TopBar>

      <div className="shell">
        <nav className="side" aria-label="Filters">
          <div className="eyebrow" style={{ padding: "4px 10px 8px" }}>Inbox</div>
          {filters.map((f) => (
            <button key={f.key} type="button" className="filter" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              <span className="dot" style={{ background: f.dot }} />
              {f.label}
              <span className="count">{counts[f.key]}</span>
            </button>
          ))}
        </nav>

        <main className="main">
          <section className="brief" aria-labelledby="brief-h">
            <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="eyebrow">AI brief · {today}</div>
              <h1 id="brief-h">
                {items === null
                  ? "Reading your messages…"
                  : counts.reply
                    ? `${counts.reply} conversation${counts.reply === 1 ? " is" : "s are"} waiting on you.`
                    : "You're all caught up."}
              </h1>
              {brief && <p>{brief}</p>}
            </div>
            <div className="stats">
              <div className="stat"><b>{counts.all}</b><span>Conversations</span></div>
              <div className="stat"><b style={{ color: "#FFB27A" }}>{counts.reply}</b><span>Need reply</span></div>
              <div className="stat"><b style={{ color: "#9EE6B8" }}>{dues.length}</b><span>Due this week</span></div>
            </div>
          </section>

          {loadError && <div className="banner tag-warn" role="alert">{loadError}</div>}

          {items?.length === 0 ? (
            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Connect your first account</h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Link Google for email and calendar, then add a WhatsApp Business number, a Facebook Page or a Viber bot.
              </p>
              <Link className="btn btn-dark" href="/connections">Add a connection</Link>
            </div>
          ) : (
            <div className="split">
              <section className="card list" aria-labelledby="list-h">
                <div className="list-head">
                  <h2 id="list-h">{filters.find((f) => f.key === filter)?.label}</h2>
                  <span className="note">By priority</span>
                </div>
                {list.length === 0 && <div className="empty">{items === null ? "Loading…" : "Nothing here."}</div>}
                {list.map((m) => (
                  <button key={m.id} type="button" className="row" aria-current={m.id === selId} onClick={() => setSelId(m.id)}>
                    <Avatar name={m.from} channel={m.channel} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {m.unread && <span className="unread-dot" aria-label="Unread" />}
                        <span className="who">{m.from}</span>
                        <ChannelChip channel={m.channel} />
                        <span className="when"><RelTime iso={m.last_message_at} /></span>
                      </div>
                      <div className="sum">{m.summary}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {m.needs_reply && <span className="chip tag-warn">Needs reply</span>}
                        {m.event && !m.calendar_added && <span className="chip tag-accent"><EventWhen ev={m.event} /></span>}
                        {m.calendar_added && <span className="chip tag-ok">In calendar</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </section>

              {selId && <ConversationPanel key={selId} id={selId} onChanged={() => load(false)} />}
            </div>
          )}

          {dues.length > 0 && (
            <section className="card pad" aria-labelledby="due-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 id="due-h" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Due this week</h2>
              <div className="due-grid">
                {dues.map((d) => (
                  <button key={d.id} type="button" className="due" style={{ textAlign: "left", background: "#fff", cursor: "pointer" }} onClick={() => setSelId(d.id)}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}><EventWhen ev={d.event!} /></span>
                      <ChannelChip channel={d.channel} />
                    </div>
                    <div style={{ fontWeight: 700 }}>{d.event!.title}</div>
                    <div className="note">{d.calendar_added ? "In your calendar" : `From ${d.from}`}</div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ConversationPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [tone, setTone] = useState<Tone>("friendly");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "cal" | "ai" | "archive">("");
  const [sent, setSent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evStart, setEvStart] = useState("");
  const [calLink, setCalLink] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const r = await api<Detail>(`/api/conversations/${id}`);
      setD(r);
      setText(r.insight?.replies?.friendly ?? "");
      setTone("friendly");
      if (r.insight?.event) {
        setEvTitle(r.insight.event.title);
        setEvStart(r.insight.event.all_day ? r.insight.event.start.slice(0, 10) : toLocalInput(r.insight.event.start));
      }
      setCalLink(r.calendar ? r.calendar.html_link ?? "" : null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (!d) return <section className="detail"><div className="card pad">{err || "Loading…"}</div></section>;
  const { conversation: c, insight } = d;
  const label = CHANNELS[c.channel].label;
  const canReply = !!insight?.needs_reply && !c.replied_at && !sent;

  async function run<T>(kind: typeof busy, fn: () => Promise<T>) {
    setBusy(kind);
    setErr("");
    try {
      return await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const send = () =>
    run("send", async () => {
      await api(`/api/conversations/${id}/reply`, { method: "POST", body: JSON.stringify({ text }) });
      setSent(true);
      onChanged();
      fetchDetail();
    });

  const addToCalendar = () =>
    run("cal", async () => {
      const ev = insight!.event!;
      const allDay = !!ev.all_day;
      const start = allDay ? `${evStart}T00:00:00Z` : new Date(evStart).toISOString();
      const r = await api<{ html_link: string }>(`/api/conversations/${id}/calendar`, {
        method: "POST",
        body: JSON.stringify({
          title: evTitle,
          start,
          all_day: allDay,
          location: ev.location,
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setCalLink(r.html_link);
      onChanged();
    });

  const reanalyze = () =>
    run("ai", async () => {
      await api(`/api/conversations/${id}/analyze`, { method: "POST" });
      await fetchDetail();
      onChanged();
    });

  const archive = () =>
    run("archive", async () => {
      await api(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      onChanged();
    });

  return (
    <section className="detail" aria-labelledby="detail-h">
      <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={c.from} channel={c.channel} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="detail-h" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{c.from}</h2>
            {c.participant && c.participant !== c.from && <div className="note">{c.participant}</div>}
          </div>
          <ChannelChip channel={c.channel} />
        </div>

        <div className="ai-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow">AI summary</span>
            <button type="button" className="pill" style={{ marginLeft: "auto", height: 28 }} onClick={reanalyze} disabled={busy === "ai"}>
              {busy === "ai" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {insight ? (
            <>
              <div>{insight.detail}</div>
              <div className="note">
                <strong style={{ color: "var(--ink)" }}>Do you need to respond?</strong> {sent || c.replied_at ? "You replied." : insight.verdict}
              </div>
            </>
          ) : (
            <div className="note">Not analyzed yet. Select Refresh.</div>
          )}
        </div>

        <div className="thread" aria-label="Messages">
          {d.messages.map((m) => (
            <div key={m.id} className={`bubble-wrap ${m.direction}`}>
              <div className="bubble">{m.body}</div>
              <div className="meta">{m.sender} · <RelTime iso={m.sent_at} /></div>
            </div>
          ))}
        </div>

        {insight?.event && (
          <div className="event">
            <CalendarIcon />
            {calLink === null ? (
              <>
                <label className="sr-only" htmlFor={`evt-${id}`}>Event title</label>
                <input id={`evt-${id}`} style={{ flex: "1 1 180px" }} value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
                <label className="sr-only" htmlFor={`evs-${id}`}>When</label>
                <input
                  id={`evs-${id}`}
                  type={insight.event.all_day ? "date" : "datetime-local"}
                  value={evStart}
                  onChange={(e) => setEvStart(e.target.value)}
                />
                <button type="button" className="btn btn-accent" onClick={addToCalendar} disabled={busy === "cal" || !evTitle || !evStart}>
                  {busy === "cal" ? "Adding…" : "Add to calendar"}
                </button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, fontWeight: 700 }}>{evTitle} is in your Google Calendar.</div>
                {calLink && <a href={calLink} target="_blank" rel="noreferrer">Open</a>}
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={archive} disabled={busy === "archive"}>Archive</button>
        </div>
      </div>

      {!sent && (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <label htmlFor={`reply-${id}`} style={{ fontWeight: 800, fontSize: 15, marginRight: "auto" }}>
              {canReply && insight?.replies ? "Suggested reply" : "Reply"}
            </label>
            {canReply && insight?.replies && <span className="note">Tone</span>}
            {canReply && insight?.replies && (["friendly", "short", "formal"] as Tone[]).map((t) => (
              <button
                key={t}
                type="button"
                className="pill"
                aria-pressed={tone === t}
                onClick={() => {
                  setTone(t);
                  setText(insight.replies![t]);
                }}
              >
                {t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <textarea id={`reply-${id}`} className="reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" className="btn btn-dark" onClick={send} disabled={busy === "send" || !text.trim()}>
              <SendIcon /> {busy === "send" ? "Sending…" : `Send via ${label}`}
            </button>
            <span className="note">Nothing is sent until you press Send.</span>
          </div>
        </div>
      )}

      {sent && <div className="banner tag-ok">Reply sent via {label}.</div>}
      {err && <div className="banner tag-warn" role="alert">{err}</div>}
    </section>
  );
}
