import Link from "next/link";
import { ProfileMenu } from "./profile-menu";
import type { Channel } from "@/lib/types";

export const CHANNELS: Record<Channel, { label: string; fg: string; bg: string; dot: string }> = {
  whatsapp: { label: "WhatsApp", fg: "#0B6B34", bg: "#E3F5EA", dot: "#1FA855" },
  messenger: { label: "Messenger", fg: "#0650C7", bg: "#E4EEFF", dot: "#0866FF" },
  viber: { label: "Viber", fg: "#5240C9", bg: "#EEEBFF", dot: "#7360F2" },
  email: { label: "Email", fg: "#8A4B00", bg: "#FCEFD9", dot: "#E08A1E" },
};

export function ChannelChip({ channel }: { channel: Channel }) {
  const c = CHANNELS[channel];
  return (
    <span className="chip" style={{ background: c.bg, color: c.fg }}>
      {c.label}
    </span>
  );
}

export function Avatar({ name, channel, size = 40 }: { name: string; channel: Channel; size?: number }) {
  const c = CHANNELS[channel];
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <div className="avatar" aria-hidden="true" style={{ width: size, height: size, background: c.bg, color: c.fg }}>
      {initials}
    </div>
  );
}

export function TopBar({ active, children }: { active: "inbox" | "connections"; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/inbox" className="brand">
        <span className="brand-mark">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </span>
        KRZ OneBox
      </Link>
      {children}
      <nav className="topnav" aria-label="Main">
        <Link href="/inbox" aria-current={active === "inbox" ? "page" : undefined}>
          Inbox
        </Link>
        <ProfileMenu />
      </nav>
    </header>
  );
}

export const CalendarIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B45E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const SendIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12l16-8-6 16-2-7-8-1z" />
  </svg>
);
