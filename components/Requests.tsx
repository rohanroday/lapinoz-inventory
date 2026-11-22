"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { CategoryTile } from "@/lib/categories";
import { fmt, qtyError, type Item, type StockRequest } from "@/lib/qty";

const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? "Could not save");
  return data;
}

export function RequestDialog({ item, people, onDone, onClose }: { item: Item; people: string[]; onDone: (text: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [person, setPerson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = qty.trim();
    if (amount) {
      const problem = qtyError(amount, item.uom) || (Number(amount) === 0 ? "Quantity must be more than 0" : null);
      if (problem) return setError(problem);
    }
    if (person.trim().length < 2) return setError("Enter your full name to send this request");
    setBusy(true);
    setError("");
    try {
      await send("/api/requests", "POST", { itemId: item.id, qty: amount, note, personName: person.trim() });
      onDone(`Requested ${item.name}. The owner can see it on the dashboard.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-label={`Request ${item.name}`}>
      <form className="form" onSubmit={submit}>
        <div className="sheet-head">
          <CategoryTile category={item.category} />
          <div>
            <h1>Request {item.name}</h1>
            <p className="sub" style={{ marginTop: 1 }}>In stock: <b>{item.stock === null ? "Not counted" : `${fmt(item.stock)} ${item.uom}`}</b></p>
          </div>
        </div>
        <label>How much is needed? ({item.uom}, optional)
          <input autoFocus inputMode={item.uom === "KG" ? "decimal" : "numeric"} value={qty} onChange={(e) => { setQty(e.target.value); setError(""); }} />
        </label>
        <label>Note (optional)
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label>Your full name
          <input list="request-people" value={person} maxLength={60} autoComplete="off" onChange={(e) => { setPerson(e.target.value); setError(""); }} />
          <datalist id="request-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Sending..." : "Send request"}</button>
        </div>
      </form>
    </dialog>
  );
}

export function RequestsPanel({ requests, onBrought, onDismissed }: { requests: StockRequest[]; onBrought: (request: StockRequest) => void; onDismissed: (request: StockRequest) => void }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function close(request: StockRequest, status: "brought" | "dismissed") {
    if (status === "dismissed" && !window.confirm(`Dismiss the request for ${request.name}?`)) return;
    setBusyId(request.id);
    setError("");
    try {
      await send(`/api/requests/${request.id}`, "PATCH", { status });
      if (status === "brought") onBrought(request);
      else onDismissed(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
    setBusyId("");
  }

  return (
    <section aria-label="Requested by staff">
      <div className="section-head">
        <h2>Requested by staff</h2>
        {requests.length > 0 && <span className="badge">{requests.length}</span>}
      </div>
      {error && <p className="error" role="alert" style={{ marginBottom: 8 }}>{error}</p>}
      {requests.length ? (
        <div className="list">
          {requests.map((request) => (
            <div className="req-row" key={request.id}>
              <CategoryTile category={request.category} />
              <div className="row-main">
                <span className="name">{request.name}</span>
                <span className="meta"><b>{request.person}</b> · {when.format(new Date(request.at))}</span>
                {request.note && <span className="meta">{request.note}</span>}
              </div>
              <span className="qty">{request.qty === null ? <small>Qty not given</small> : <>{fmt(request.qty)}<small>{request.uom}</small></>}</span>
              <div className="req-actions">
                <button className="mini-btn" disabled={busyId === request.id} onClick={() => close(request, "dismissed")}><X size={14} /> Dismiss</button>
                <button className="mini-btn solid" disabled={busyId === request.id} onClick={() => close(request, "brought")}><Check size={14} /> Mark brought</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="list"><p className="empty compact"><b>No requests right now</b>Items your staff ask for will appear here.</p></div>
      )}
    </section>
  );
}
