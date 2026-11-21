"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  summary: string;
  people: string[];
  initial?: string;
  busy?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

// Asked at every save, so each entry records who actually did it even on a shared login.
export default function NameDialog({ summary, people, initial = "", busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (name.trim().length < 2) return setError("Enter your full name to save");
    onConfirm(name.trim());
  }

  return (
    <dialog ref={ref} onClose={onCancel} aria-label="Who is saving this?">
      <form className="form" onSubmit={submit}>
        <div>
          <h1 style={{ fontSize: 18 }}>Who is saving this?</h1>
          <p className="sub">{summary}</p>
        </div>
        <label>Your full name
          <input autoFocus list="saved-people" value={name} maxLength={60} autoComplete="off" onChange={(e) => { setName(e.target.value); setError(""); }} />
          <datalist id="saved-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Back</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving..." : "Confirm and save"}</button>
        </div>
      </form>
    </dialog>
  );
}
