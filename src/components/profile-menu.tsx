"use client";
import Link from "next/link";
import { useState } from "react";
import { TIME_FORMATS, useTimeFormat, type TimeFormat } from "@/lib/time-format";

/** The name button in the header, with Settings (time format), Connections and Sign out. */
export function ProfileMenu() {
  const { me, format, setFormat } = useTimeFormat();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const name = me?.name || me?.email?.split("@")[0] || "Account";
  const initials =
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";

  async function choose(f: TimeFormat) {
    setError("");
    try {
      await setFormat(f);
      setOpen(false); // the new format shows at once; keep the menu open only if saving failed
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="profile">
      <button type="button" className="profile-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <span>{name}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          {/* Clicking anywhere outside closes the menu. */}
          <button type="button" tabIndex={-1} aria-label="Close menu" className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu" aria-label="Profile">
            <div className="menu-who">
              <span className="profile-avatar" aria-hidden="true">{initials}</span>
              <span>
                <b>{name}</b>
                {me?.email && <span className="note" style={{ display: "block" }}>{me.email}</span>}
              </span>
            </div>
            <div className="menu-sep" />
            <div className="menu-eyebrow">Settings</div>
            <fieldset className="menu-fieldset">
              <legend>Time format</legend>
              {TIME_FORMATS.map((o) => (
                <label key={o.value} className="menu-radio" data-checked={format === o.value || undefined}>
                  <input type="radio" name="time-format" value={o.value} checked={format === o.value} onChange={() => choose(o.value)} />
                  <span className="menu-radio-label">{o.label}</span>
                  <span className="note">{o.example}</span>
                </label>
              ))}
              {error && <p className="error" role="alert">{error}</p>}
            </fieldset>
            <div className="menu-sep" />
            <Link href="/connections" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
              Manage connections
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" role="menuitem" className="menu-item">Sign out</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
