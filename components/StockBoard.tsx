"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, ClipboardList, History, Minus, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import NameDialog from "@/components/NameDialog";
import { CategoryTile, prettyCategory } from "@/lib/categories";
import { bringQty, fmt, qtyError, UOMS, type Item } from "@/lib/qty";

type Filter = "all" | "low" | "pending" | "ok";
type Mode = "out" | "in" | "adjust" | "min";
type PendingDelete = { ids: string[]; title: string; detail: string; leaveCategory?: boolean };

const postJson = async (url: string, method: string, body: unknown) => {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? "Could not save");
  return data;
};

const newId = () => crypto.randomUUID();

type Props = { items: Item[]; role: string; people: string[]; defaultName: string; greeting: string; userName: string };

export default function StockBoard({ items, role, people, defaultName, greeting, userName }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const isOwner = role === "owner";
  const category = params.get("cat") ?? "";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<{ id: string; mode: Mode } | null>(null);
  const [picking, setPicking] = useState<"out" | "in" | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const selectedItem = items.find((item) => item.id === selected?.id) ?? null;

  const say = (text: string) => { setMessage(text); setUndoIds([]); };
  // Uses browser history so the phone's back button returns to the boxes.
  const openCategory = (name: string) => {
    say("");
    window.history.pushState(null, "", name ? `/?cat=${encodeURIComponent(name)}` : "/");
    window.scrollTo({ top: 0 });
  };
  const stopSelecting = () => { setSelecting(false); setChecked(new Set()); };

  const lowItems = items.filter((i) => i.low).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const noMin = items.filter((i) => i.min === null).length;
  const counts = {
    all: items.length,
    low: lowItems.length,
    pending: items.filter((i) => i.stock === null).length,
    ok: items.filter((i) => i.stock !== null && !i.low).length,
  };
  const counted = items.length - counts.pending;
  const percent = items.length ? Math.round((counted / items.length) * 100) : 0;

  const visible = items.filter((item) => {
    if (category && item.category !== category) return false;
    if (query && !item.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === "low") return item.low;
    if (filter === "pending") return item.stock === null;
    if (filter === "ok") return item.stock !== null && !item.low;
    return true;
  });
  const showBoxes = !category && filter === "all" && !query.trim() && !selecting;
  const groups = [...new Set(visible.map((item) => item.category))];
  const pills: [Filter, string][] = [["all", "All"], ["low", "Low stock"], ["pending", "Not counted"], ["ok", "In stock"]];
  const allVisibleChecked = visible.length > 0 && visible.every((i) => checked.has(i.id));

  const toggle = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setChecked((current) => {
    const next = new Set(current);
    visible.forEach((i) => (allVisibleChecked ? next.delete(i.id) : next.add(i.id)));
    return next;
  });

  async function confirmDelete() {
    if (!pendingDelete) return;
    const data = await postJson("/api/items/bulk", "POST", { action: "delete", ids: pendingDelete.ids });
    if (pendingDelete.leaveCategory) window.history.replaceState(null, "", "/");
    setPendingDelete(null);
    stopSelecting();
    setMessage(`Deleted ${data.deleted} ${data.deleted === 1 ? "item" : "items"}.`);
    setUndoIds(data.ids);
    router.refresh();
  }

  async function undoDelete() {
    try {
      const data = await postJson("/api/items/bulk", "POST", { action: "restore", ids: undoIds });
      say(`Restored ${data.restored} ${data.restored === 1 ? "item" : "items"}.`);
      router.refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : "Could not undo");
    }
  }

  const renderRow = (item: Item) => {
    const isChecked = checked.has(item.id);
    return (
      <button className={`row ${isChecked ? "picked" : ""}`} key={item.id} aria-pressed={selecting ? isChecked : undefined}
        onClick={() => { if (selecting) toggle(item.id); else { say(""); setSelected({ id: item.id, mode: "out" }); } }}>
        {selecting && <span className={`check ${isChecked ? "on" : ""}`} aria-hidden="true">{isChecked && <Check size={15} strokeWidth={3} />}</span>}
        <CategoryTile category={item.category} />
        <span className="row-main">
          <span className="name">{item.name}</span>
          <span className="meta">{item.min !== null ? `Minimum ${fmt(item.min)}` : isOwner ? "No minimum set" : item.uom}</span>
        </span>
        <span className="status">
          {item.stock === null ? <span className="tag wait">Not counted</span> : item.low ? <span className="tag low">Low</span> : <span className="tag">OK</span>}
        </span>
        <span className={`qty ${item.low ? "alert" : ""}`}>
          {item.stock === null ? "-" : fmt(item.stock)}<small>{item.uom}</small>
        </span>
      </button>
    );
  };

  return (
    <div className={selecting ? "has-savebar" : ""}>
      <div className="head">
        <div>
          <p className="greet">{greeting},</p>
          <h1>{userName}</h1>
        </div>
      </div>

      {message && (
        <p className="ok ok-row" role="status">
          <span>{message}</span>
          {undoIds.length > 0 && <button className="text-btn" onClick={undoDelete}>Undo</button>}
        </p>
      )}

      {!category && !selecting && (
        <>
          {isOwner ? (
            <section className="hero" aria-label="Low stock summary">
              <span className="hero-label">Need to bring</span>
              <b className="hero-num">{lowItems.length}<small>{lowItems.length === 1 ? "item" : "items"}</small></b>
              <div className="hero-foot" style={{ marginTop: 12 }}>
                <span>{lowItems.filter((i) => i.stock === 0).length} finished</span>
                <span>{counted} of {items.length} have stock</span>
              </div>
            </section>
          ) : (
            <section className="hero" aria-label="Stock summary">
              <span className="hero-label">Items counted</span>
              <b className="hero-num">{counted}<small>of {items.length}</small></b>
              <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Items counted">
                <i style={{ width: `${percent}%` }} />
              </div>
              <div className="hero-foot"><span>{percent}% counted</span><span>{counts.pending} not counted</span></div>
            </section>
          )}

          <div className={`quick ${isOwner ? "" : "three"}`}>
            <button className="warn" onClick={() => setPicking("out")}><span className="quick-ic"><Minus size={23} /></span>Take out</button>
            <button onClick={() => setPicking("in")}><span className="quick-ic"><Plus size={23} /></span>Add stock</button>
            {isOwner && <Link href="/count"><span className="quick-ic"><ClipboardList size={22} /></span>Setup</Link>}
            {isOwner
              ? <button onClick={() => setAdding(true)}><span className="quick-ic"><PackagePlus size={22} /></span>New item</button>
              : <Link href="/history"><span className="quick-ic"><History size={22} /></span>History</Link>}
          </div>

          {isOwner && (
            <section aria-label="What to bring">
              <div className="section-head">
                <h2>What to bring</h2>
                {lowItems.length > 5 && <Link className="see-all" href="/alerts">See all {lowItems.length} <ChevronRight size={15} /></Link>}
              </div>
              {lowItems.length > 0 ? (
                <div className="list">
                  {lowItems.slice(0, 5).map((item) => (
                    <button className="row" key={item.id} onClick={() => { say(""); setSelected({ id: item.id, mode: "in" }); }}>
                      <CategoryTile category={item.category} />
                      <span className="row-main">
                        <span className="name">{item.name}</span>
                        <span className="meta">{fmt(item.stock)} left · Minimum {fmt(item.min)}</span>
                      </span>
                      <span className="qty alert">Bring {fmt(bringQty(item))}<small>{item.uom}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="list"><p className="empty compact"><b>Nothing is low right now</b>{noMin > 0 ? "" : "Low items will appear here."}</p></div>
              )}
              {noMin > 0 && (
                <Link className="note note-link" href="/count">
                  <span>{noMin} items have no minimum, so they cannot warn you when low. Set minimums.</span>
                  <ChevronRight size={17} aria-hidden="true" />
                </Link>
              )}
            </section>
          )}
        </>
      )}

      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Search items" placeholder="Search any item" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="pills" role="group" aria-label="Filter by status">
        {pills.map(([key, label]) => (
          <button key={key} className={`pill ${filter === key ? "on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} <b>{counts[key]}</b>
          </button>
        ))}
      </div>

      {showBoxes ? (
        <>
          <div className="section-head">
            <h2>Categories</h2>
            {isOwner && <button className="see-all danger-text" onClick={() => setSelecting(true)}><Trash2 size={15} /> Delete items</button>}
          </div>
          <div className="cat-grid">
            {categories.map((name) => {
              const inCat = items.filter((i) => i.category === name);
              const done = inCat.filter((i) => i.stock !== null).length;
              const low = inCat.filter((i) => i.low).length;
              return (
                <button className="cat" key={name} onClick={() => openCategory(name)}>
                  <CategoryTile category={name} />
                  {low > 0 && <span className="tag low cat-flag">{low} low</span>}
                  <span className="cat-name">{prettyCategory(name)}</span>
                  <span className="cat-sub">{inCat.length} {inCat.length === 1 ? "item" : "items"} · {done} counted</span>
                  <span className="meter" aria-hidden="true"><i style={{ width: `${(done / inCat.length) * 100}%` }} /></span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {category && (
            <div className="back">
              <button className="icon-btn" aria-label="Back to categories" onClick={() => { stopSelecting(); window.history.back(); }}><ArrowLeft size={19} /></button>
              <CategoryTile category={category} />
              <h2>{prettyCategory(category)}</h2>
            </div>
          )}
          {isOwner && (
            <div className="tools">
              {selecting ? (
                <>
                  <button className="pill" onClick={toggleAll}>{allVisibleChecked ? "Clear shown" : `Select all ${visible.length}`}</button>
                  <button className="pill" onClick={stopSelecting}><X size={15} /> Cancel</button>
                </>
              ) : (
                <>
                  <button className="pill danger-text" onClick={() => setSelecting(true)}><Trash2 size={15} /> Delete items</button>
                  {category && (
                    <button className="pill danger-text" onClick={() => {
                      const ids = items.filter((i) => i.category === category).map((i) => i.id);
                      setPendingDelete({ ids, leaveCategory: true, title: `Delete ${prettyCategory(category)}?`, detail: `This removes the category and all ${ids.length} items in it.` });
                    }}><Trash2 size={15} /> Delete category</button>
                  )}
                </>
              )}
            </div>
          )}
          {!visible.length && (
            <div className="list" style={{ marginTop: 14 }}>
              <p className="empty"><b>No items match</b>Try another search or filter.</p>
            </div>
          )}
          {groups.map((group) => (
            <section key={group}>
              {!category && <h2>{prettyCategory(group)}</h2>}
              <div className="list" style={category ? { marginTop: 4 } : undefined}>
                {visible.filter((item) => item.category === group).map(renderRow)}
              </div>
            </section>
          ))}
        </>
      )}

      {selecting && (
        <div className="savebar">
          <div>
            <span>{checked.size} selected</span>
            <button className="btn danger" disabled={!checked.size} onClick={() => {
              const ids = [...checked];
              setPendingDelete({ ids, title: `Delete ${ids.length} ${ids.length === 1 ? "item" : "items"}?`, detail: "They will be removed from the stock list. Past history stays." });
            }}><Trash2 size={17} /> Delete</button>
          </div>
        </div>
      )}

      {picking && (
        <PickDialog items={items} mode={picking}
          onPick={(id) => { const mode = picking; setPicking(null); say(""); setSelected({ id, mode }); }}
          onClose={() => setPicking(null)} />
      )}
      {selectedItem && selected && (
        <ItemDialog key={selectedItem.id} item={selectedItem} initialMode={selected.mode} role={role} people={people} defaultName={defaultName}
          onClose={(text) => { setSelected(null); if (text) say(text); }} />
      )}
      {adding && <AddItemDialog categories={categories} onClose={(text) => { setAdding(false); if (text) say(text); }} />}
      {pendingDelete && <ConfirmDelete info={pendingDelete} onConfirm={confirmDelete} onClose={() => setPendingDelete(null)} />}
    </div>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function ConfirmDelete({ info, onConfirm, onClose }: { info: PendingDelete; onConfirm: () => Promise<void>; onClose: () => void }) {
  const ref = useModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <dialog ref={ref} onClose={onClose} aria-label={info.title}>
      <div className="form">
        <div>
          <h1 style={{ fontSize: 18 }}>{info.title}</h1>
          <p className="sub">{info.detail}</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Keep</button>
          <button className="btn danger" disabled={busy} onClick={async () => {
            setBusy(true);
            setError("");
            try { await onConfirm(); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); setBusy(false); }
          }}>{busy ? "Deleting..." : "Delete"}</button>
        </div>
      </div>
    </dialog>
  );
}

function PickDialog({ items, mode, onPick, onClose }: { items: Item[]; mode: "out" | "in"; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useModal();
  const [text, setText] = useState("");
  const shown = items.filter((i) => i.name.toLowerCase().includes(text.trim().toLowerCase()));
  const title = mode === "out" ? "Take out stock" : "Add stock";
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}>
      <div className="form">
        <h1 style={{ fontSize: 18 }}>{title}</h1>
        <input autoFocus type="search" aria-label="Find item" placeholder="Type item name" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="pick-list">
          {shown.map((item) => (
            <button className="row" key={item.id} onClick={() => onPick(item.id)}>
              <CategoryTile category={item.category} />
              <span className="row-main"><span className="name">{item.name}</span><span className="meta">{prettyCategory(item.category)}</span></span>
              <span className="qty">{item.stock === null ? "-" : fmt(item.stock)}<small>{item.uom}</small></span>
            </button>
          ))}
          {!shown.length && <p className="empty">No item found.</p>}
        </div>
        <div className="actions"><button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button></div>
      </div>
    </dialog>
  );
}

function ItemDialog({ item, initialMode, role, people, defaultName, onClose }: { item: Item; initialMode: Mode; role: string; people: string[]; defaultName: string; onClose: (text?: string) => void }) {
  const ref = useModal();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const requestId = useRef(newId());

  const modes: [Mode, string][] = [["out", "Take out"], ["in", "Add"], ...(role === "owner" ? ([["adjust", "Correct"], ["min", "Minimum"]] as [Mode, string][]) : [])];
  const blocked = item.stock === null && mode === "out";
  const verb = mode === "in" ? "Added" : mode === "out" ? "Took out" : mode === "adjust" ? "Corrected to" : "Minimum set to";
  const askVerb = mode === "in" ? "Adding" : mode === "out" ? "Taking out" : "Correcting to";

  async function save(personName: string) {
    setBusy(true);
    setError("");
    try {
      if (mode === "min") {
        await postJson(`/api/items/${item.id}`, "PATCH", { min: qty });
      } else {
        await postJson("/api/movements", "POST", { itemId: item.id, type: mode, qty, personName, note, requestId: requestId.current });
      }
      router.refresh();
      onClose(`${verb} ${fmt(Number(qty))} ${item.uom}: ${item.name}${personName ? ` (by ${personName})` : ""}`);
    } catch (e) {
      setAsking(false);
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = qtyError(qty, item.uom);
    if (problem) return setError(problem);
    if (mode === "adjust" && !note.trim()) return setError("Write the reason for this correction");
    setError("");
    if (mode === "min") save("");
    else setAsking(true);
  }

  return (
    <>
      <dialog ref={ref} onClose={() => onClose()} aria-label={item.name}>
        <form className="form" onSubmit={submit}>
          <div className="sheet-head">
            <CategoryTile category={item.category} />
            <div>
              <h1>{item.name}</h1>
              <p className="sub" style={{ marginTop: 1 }}>In stock: <b>{item.stock === null ? "Not counted" : `${fmt(item.stock)} ${item.uom}`}</b>{item.min !== null ? ` · Minimum ${fmt(item.min)}` : ""}</p>
            </div>
          </div>
          <div className="seg">
            {modes.map(([key, label]) => (
              <button type="button" key={key} className={mode === key ? "on" : ""} aria-pressed={mode === key}
                onClick={() => { setMode(key); setError(""); setQty(""); requestId.current = newId(); }}>{label}</button>
            ))}
          </div>
          {blocked ? (
            <p className="note" style={{ marginBottom: 0 }}>No stock is recorded for this item yet. Use Add first.</p>
          ) : (
            <>
              <label>{mode === "adjust" ? "Actual count" : mode === "min" ? "Alert when stock reaches" : "Quantity"} ({item.uom})
                <input autoFocus inputMode={item.uom === "KG" ? "decimal" : "numeric"} value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              {mode !== "min" && (
                <label>{mode === "adjust" ? "Reason" : "Note (optional)"}<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
              )}
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
            {!blocked && <button className={`btn ${mode === "out" ? "danger" : "primary"}`} disabled={busy}>{busy ? "Saving..." : "Save"}</button>}
          </div>
        </form>
      </dialog>
      {asking && (
        <NameDialog summary={`${askVerb} ${fmt(Number(qty))} ${item.uom} of ${item.name}`} people={people} initial={defaultName} busy={busy}
          onConfirm={save} onCancel={() => setAsking(false)} />
      )}
    </>
  );
}

function AddItemDialog({ categories, onClose }: { categories: string[]; onClose: (text?: string) => void }) {
  const ref = useModal();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await postJson("/api/items", "POST", Object.fromEntries(form));
      router.refresh();
      onClose(`Added new item: ${form.get("name")}. Use Add to enter its quantity.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={() => onClose()} aria-label="Add new item">
      <form className="form" onSubmit={submit}>
        <h1 style={{ fontSize: 18 }}>Add new item</h1>
        <label>Item name<input name="name" required minLength={2} maxLength={100} /></label>
        <label>Category (pick one or type a new one)
          <input name="category" list="category-list" required minLength={2} maxLength={60} autoComplete="off" />
          <datalist id="category-list">{categories.map((c) => <option key={c} value={c}>{prettyCategory(c)}</option>)}</datalist>
        </label>
        <label>Unit<select name="uom">{UOMS.map((u) => <option key={u}>{u}</option>)}</select></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving..." : "Add item"}</button>
        </div>
      </form>
    </dialog>
  );
}
