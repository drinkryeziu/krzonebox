"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChannelChip, TopBar } from "@/components/ui";
import { RelTime } from "@/lib/time-format";
import type { Channel, Provider } from "@/lib/types";

interface Conn {
  id: string;
  provider: Provider;
  label: string;
  status: string;
  status_detail: string | null;
  last_synced_at: string | null;
  webhook_url: string | null;
  verify_token: string | null;
}

const channel = (p: Provider): Channel => (p === "google" ? "email" : p);

type FormProvider = "whatsapp" | "messenger" | "viber";
const FORMS: Record<FormProvider, { title: string; blurb: string; steps: string[]; fields: { name: string; label: string; hint: string; secret?: boolean }[] }> = {
  whatsapp: {
    title: "WhatsApp Business",
    blurb: "Messages to your WhatsApp Business number (Cloud API).",
    steps: [
      "In Meta for Developers, create an app with the WhatsApp product.",
      "Add your business number and copy its Phone number ID.",
      "Create a System User token with whatsapp_business_messaging permission.",
      "Copy the App secret from App settings › Basic.",
    ],
    fields: [
      { name: "phone_number_id", label: "Phone number ID", hint: "Numbers only, from WhatsApp › API setup" },
      { name: "access_token", label: "Access token", hint: "Permanent System User token", secret: true },
      { name: "app_secret", label: "App secret", hint: "Used to verify incoming webhooks", secret: true },
    ],
  },
  messenger: {
    title: "Messenger",
    blurb: "Messages to a Facebook Page you manage.",
    steps: [
      "In Meta for Developers, add the Messenger product to your app.",
      "Generate a Page access token for your Page (pages_messaging permission).",
      "Copy the Page ID and the App secret.",
    ],
    fields: [
      { name: "page_id", label: "Page ID", hint: "Numbers only" },
      { name: "page_access_token", label: "Page access token", hint: "Long-lived Page token", secret: true },
      { name: "app_secret", label: "App secret", hint: "Used to verify incoming webhooks", secret: true },
    ],
  },
  viber: {
    title: "Viber",
    blurb: "Messages to your Viber bot. KRZ OneBox sets the webhook for you.",
    steps: ["Create a bot at partners.viber.com.", "Copy the bot's authentication token."],
    fields: [{ name: "auth_token", label: "Bot auth token", hint: "From the Viber Partners console", secret: true }],
  },
};

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
};

function ConnectionsInner() {
  const params = useSearchParams();
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [open, setOpen] = useState<FormProvider | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(
    params.get("error")
      ? { kind: "warn", text: params.get("error")! }
      : params.get("connected")
        ? { kind: "ok", text: "Google connected. Your recent email is being summarized." }
        : null,
  );
  const [busy, setBusy] = useState<string>("");

  const load = useCallback(() => api<{ connections: Conn[] }>("/api/connections").then((r) => setConns(r.connections)), []);
  useEffect(() => {
    load().catch((e) => setNotice({ kind: "warn", text: e.message }));
  }, [load]);

  async function sync(c: Conn) {
    setBusy(c.id);
    try {
      const r = await api<{ count: number }>(`/api/connections/${c.id}/sync`, { method: "POST" });
      setNotice({ kind: "ok", text: `Synced ${r.count} recent emails.` });
      load();
    } catch (e) {
      setNotice({ kind: "warn", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function remove(c: Conn) {
    if (!confirm(`Disconnect ${c.label}? Its messages will be removed from KRZ OneBox.`)) return;
    setBusy(c.id);
    try {
      await api(`/api/connections/${c.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setNotice({ kind: "warn", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  const hasGoogle = conns?.some((c) => c.provider === "google");

  return (
    <>
      <TopBar active="connections" />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Connections</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Each account is yours: credentials are encrypted and only used to read and send your messages.
          </p>
        </div>
        {notice && <div className={`banner ${notice.kind === "ok" ? "tag-ok" : "tag-warn"}`} role="status">{notice.text}</div>}

        <section aria-labelledby="yours" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="yours" style={{ margin: 0, fontSize: 16 }}>Your accounts</h2>
          {conns === null ? (
            <div className="card pad">Loading…</div>
          ) : conns.length === 0 ? (
            <div className="card pad note">No accounts yet. Add one below.</div>
          ) : (
            <div className="conn-grid">
              {conns.map((c) => (
                <div key={c.id} className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChannelChip channel={channel(c.provider)} />
                    {c.provider === "google" && <span className="chip tag-accent">Calendar</span>}
                    <span className={`chip ${c.status === "active" ? "tag-ok" : "tag-warn"}`} style={{ marginLeft: "auto" }}>
                      {c.status === "active" ? "Connected" : "Needs attention"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{c.label}</div>
                  {c.status_detail && <div className="error">{c.status_detail}</div>}
                  {c.webhook_url && (c.provider === "whatsapp" || c.provider === "messenger") && (
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Webhook setup</summary>
                      <WebhookInfo conn={c} />
                    </details>
                  )}
                  {c.last_synced_at && <div className="note">Synced <RelTime iso={c.last_synced_at} /></div>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {c.provider === "google" && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => sync(c)} disabled={busy === c.id}>
                          {busy === c.id ? "Syncing…" : "Sync email"}
                        </button>
                        {c.status !== "active" && <a className="btn btn-ghost btn-sm" href="/api/connections/google/start">Reconnect</a>}
                      </>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(c)} disabled={busy === c.id}>
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="add" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="add" style={{ margin: 0, fontSize: 16 }}>Add an account</h2>
          <div className="conn-grid">
            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8 }}><ChannelChip channel="email" /><span className="chip tag-accent">Calendar</span></div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Google</div>
              <p style={{ margin: 0, color: "var(--muted)" }}>Gmail inbox with AI summaries and replies, plus adding events to Google Calendar.</p>
              <a className="btn btn-dark" href="/api/connections/google/start">{hasGoogle ? "Add another Google account" : "Connect Google"}</a>
            </div>
            {(Object.keys(FORMS) as FormProvider[]).map((p) => (
              <div key={p} className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><ChannelChip channel={p} /></div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{FORMS[p].title}</div>
                <p style={{ margin: 0, color: "var(--muted)" }}>{FORMS[p].blurb}</p>
                {open === p ? (
                  <ConnectForm provider={p} onCancel={() => setOpen(null)} onDone={(c) => { setOpen(null); setNotice({ kind: "ok", text: `${c.label} connected.` }); load(); }} />
                ) : (
                  <button className="btn btn-dark" onClick={() => setOpen(p)}>Connect {FORMS[p].title}</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function WebhookInfo({ conn }: { conn: Pick<Conn, "webhook_url" | "verify_token"> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <div className="note">In Meta for Developers › Webhooks, set the callback URL and verify token, then subscribe to <b>messages</b>.</div>
      <div className="note">Callback URL</div>
      <div className="code">{conn.webhook_url}</div>
      <div className="note">Verify token</div>
      <div className="code">{conn.verify_token}</div>
    </div>
  );
}

function ConnectForm({ provider, onCancel, onDone }: { provider: FormProvider; onCancel: () => void; onDone: (c: Conn) => void }) {
  const f = FORMS[provider];
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<Conn | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ connection: Conn }>("/api/connections", { method: "POST", body: JSON.stringify({ provider, ...values }) });
      if (provider === "viber") onDone(r.connection);
      else setCreated(r.connection); // WhatsApp/Messenger: show the webhook details to paste into Meta
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="banner tag-ok">Verified: {created.label}. One last step:</div>
        <WebhookInfo conn={created} />
        <button className="btn btn-dark" onClick={() => onDone(created)}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ol className="steps">{f.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      {f.fields.map((fl) => (
        <div className="field" key={fl.name}>
          <label htmlFor={`${provider}-${fl.name}`}>{fl.label}</label>
          <input
            id={`${provider}-${fl.name}`}
            type={fl.secret ? "password" : "text"}
            autoComplete="off"
            required
            value={values[fl.name] ?? ""}
            onChange={(e) => setValues({ ...values, [fl.name]: e.target.value.trim() })}
          />
          <span className="hint">{fl.hint}</span>
        </div>
      ))}
      {err && <p className="error" role="alert">{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-dark" disabled={busy}>{busy ? "Verifying…" : "Verify and connect"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsInner />
    </Suspense>
  );
}
