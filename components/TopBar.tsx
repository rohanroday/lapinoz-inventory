"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, ClipboardList, History, House, LogOut, Pizza } from "lucide-react";

export default function TopBar({ name, role, low }: { name: string; role: string; low: number }) {
  const path = usePathname();
  const links = [
    { href: "/", label: "Home", icon: House },
    ...(role === "owner" ? [{ href: "/count", label: "Setup", icon: ClipboardList }] : []),
    { href: "/history", label: "History", icon: History },
    ...(role === "owner" ? [{ href: "/alerts", label: "Low Stock", icon: BellRing, badge: low }] : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="top">
      <div className="top-in">
        <div className="brand">
          <span className="tile" aria-hidden="true"><Pizza size={21} /></span>
          <span>La Pino&apos;z Inventory<small>Victoria Singtam</small></span>
        </div>
        <nav className="tabs" aria-label="Main">
          {links.map(({ href, label, icon: Icon, badge }) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>
              <Icon size={20} aria-hidden="true" />
              {label}
              {!!badge && <span className="badge">{badge}</span>}
            </Link>
          ))}
        </nav>
        <span className="who">
          <span className="avatar" aria-hidden="true">{name.trim()[0]?.toUpperCase()}</span>
          <span>{name}<small className="meta">{role === "owner" ? "Owner" : "Employee"}</small></span>
        </span>
        <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
