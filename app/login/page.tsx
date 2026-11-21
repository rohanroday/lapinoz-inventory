"use client";

import { useState } from "react";
import { Pizza } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setError((await res.json()).error ?? "Could not log in");
    } catch {
      setError("No connection. Check the internet and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="login-card form" onSubmit={submit}>
        <div>
          <span className="tile" aria-hidden="true"><Pizza size={27} /></span>
          <h1>La Pino&apos;z Inventory</h1>
          <p className="sub">Victoria Singtam</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn primary" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
      </form>
    </div>
  );
}
