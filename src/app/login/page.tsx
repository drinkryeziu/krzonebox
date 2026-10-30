"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card pad" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="brand">
          <span className="brand-mark">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </span>
          KRZ OneBox
        </div>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Every message, one inbox</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            WhatsApp Business, Messenger, Viber and email in one place, with AI summaries, reply drafts and calendar adds.
          </p>
        </div>
        {state === "sent" ? (
          <div className="banner tag-ok">Check {email} for a sign-in link.</div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-dark" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {state === "error" && <p className="error" role="alert">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
