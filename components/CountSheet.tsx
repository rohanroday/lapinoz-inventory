"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheck, Search } from "lucide-react";
import NameDialog from "@/components/NameDialog";
import { CategoryTile, prettyCategory } from "@/lib/categories";
import { fmt, qtyError, type Item } from "@/lib/qty";

type Draft = Record<string, { stock?: string; min?: string }>;
const DRAFT_KEY = "inventory_count_draft";
const needsEntry = (item: Item) => item.stock === null || item.min === null;

export default function CountSheet({ items: allItems, people, defaultName }: { items: Item[]; people: string[]; defaultName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get("cat") ?? "";
  const items = useMemo(() => allItems.filter(needsEntry), [allItems]);
  const categories = useMemo(() => [...new Set(allItems.map((i) => i.category))], [allItems]);
  const [draft, setDraft] = useState<Draft>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A long entry session survives a dropped connection or a closed tab.
  useEffect(() => {
    try { setDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}")); } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [draft, loaded]);

  const entries = useMemo(
    () => items
      .map((item) => ({ item, stock: item.stock === null ? draft[item.id]?.stock?.trim() ?? "" : "", min: item.min === null ? draft[item.id]?.min?.trim() ?? "" : "" }))
      .filter((e) => e.stock !== "" || e.min !== ""),
    [items, draft],
  );

  const searching = query.trim().length > 0;
  const visible = items.filter((i) => (!category || i.category === category) && i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(visible.map((i) => i.category))];
  const withMin = allItems.filter((i) => i.min !== null).length;
  const percent = allItems.length ? Math.round((withMin / allItems.length) * 100) : 0;
  const edit = (id: string, key: "stock" | "min", value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  const openCategory = (name: string) => {
    setMessage("");
    window.history.pushState(null, "", `/count?cat=${encodeURIComponent(name)}`);
    window.scrollTo({ top: 0 });
  };

  function startSave() {
    setError("");
    setMessage("");
    for (const { item, stock, min } of entries) {
      const problem = (stock !== "" && qtyError(stock, item.uom)) || (min !== "" && qtyError(min, item.uom));
      if (problem) return setError(`${item.name}: ${problem}`);
    }
    setAsking(true);
  }

  async function save(personName: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, entries: entries.map((e) => ({ itemId: e.item.id, stock: e.stock, min: e.min })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setDraft((d) => {
        const next = { ...d };
        entries.forEach((e) => delete next[e.item.id]);
        return next;
      });
      setMessage(`Saved ${data.saved} ${data.saved === 1 ? "item" : "items"} by ${personName}.${data.skipped ? ` ${data.skipped} were already filled and left unchanged.` : ""}`);
      router.refresh();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Could not save"}. Your entries are still here.`);
    }
    setAsking(false);
    setBusy(false);
  }

  return (
    <div className={items.length ? "has-savebar" : ""}>
      <div className="head">
        <div>
          <h1>Stock Setup</h1>
          <p className="sub">Set the minimum level for each item, and fill any missing stock.</p>
        </div>
      </div>

      {message && <p className="ok" role="status">{message}</p>}

      {!category && (
        <section className="hero" aria-label="Setup progress">
          <span className="hero-label">Minimums set</span>
          <b className="hero-num">{withMin}<small>of {allItems.length}</small></b>
          <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Minimums set">
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className="hero-foot">
            <span>{percent}% done</span>
            <span>{allItems.filter((i) => i.stock === null).length} without stock</span>
          </div>
        </section>
      )}

      {!items.length ? (
        <div className="list" style={{ marginTop: 16 }}>
          <p className="empty"><CircleCheck size={30} /><b>Setup complete</b>Every item has stock and a minimum.</p>
        </div>
      ) : (
        <>
          <div className="search">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Find item" placeholder="Find item" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {!category && !searching ? (
            <>
              <h2>Choose a category</h2>
              <div className="cat-grid">
                {categories.map((name) => {
                  const inCat = allItems.filter((i) => i.category === name);
                  const open = inCat.filter(needsEntry);
                  const done = inCat.length - open.length;
                  const typed = entries.filter((e) => e.item.category === name).length;
                  return (
                    <button className="cat" key={name} onClick={() => openCategory(name)}>
                      <CategoryTile category={name} />
                      {!open.length
                        ? <span className="tag cat-flag">Done</span>
                        : typed > 0 && <span className="tag wait cat-flag">{typed} unsaved</span>}
                      <span className="cat-name">{prettyCategory(name)}</span>
                      <span className="cat-sub">{open.length ? `${open.length} left of ${inCat.length}` : `All ${inCat.length} done`}</span>
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
                  <button className="icon-btn" aria-label="Back to categories" onClick={() => window.history.back()}><ArrowLeft size={19} /></button>
                  <CategoryTile category={category} />
                  <h2>{prettyCategory(category)}</h2>
                </div>
              )}
              {!visible.length && (
                <div className="list">
                  <p className="empty">
                    {category && !searching ? <><CircleCheck size={28} /><b>This category is done</b>Go back and choose the next one.</> : <><b>No items match</b>Try another name.</>}
                  </p>
                </div>
              )}
              {groups.map((group) => (
                <section key={group}>
                  {!category && <h2>{prettyCategory(group)}</h2>}
                  <div className="list">
                    <div className="count-row count-head"><span>Item</span><span>Stock</span><span>Minimum</span></div>
                    {visible.filter((i) => i.category === group).map((item) => (
                      <div className="count-row" key={item.id}>
                        <div>
                          <span className="name">{item.name}</span>
                          <span className="meta">{item.uom}</span>
                        </div>
                        {item.stock === null
                          ? <input aria-label={`${item.name} stock`} inputMode={item.uom === "KG" ? "decimal" : "numeric"} value={draft[item.id]?.stock ?? ""} onChange={(e) => edit(item.id, "stock", e.target.value)} />
                          : <span className="qty">{fmt(item.stock)}</span>}
                        {item.min === null
                          ? <input aria-label={`${item.name} minimum`} inputMode={item.uom === "KG" ? "decimal" : "numeric"} value={draft[item.id]?.min ?? ""} onChange={(e) => edit(item.id, "min", e.target.value)} />
                          : <span className="qty">{fmt(item.min)}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}

          <div className="savebar">
            {error && <p className="error" role="alert" style={{ maxWidth: 1088, margin: "0 auto 8px" }}>{error}</p>}
            <div>
              <span>{entries.length} entered, not saved yet</span>
              <button className="btn primary" disabled={busy || !entries.length} onClick={startSave}>{busy ? "Saving..." : "Save"}</button>
            </div>
          </div>
          {asking && (
            <NameDialog summary={`Saving ${entries.length} ${entries.length === 1 ? "item" : "items"}`} people={people} initial={defaultName} busy={busy}
              onConfirm={save} onCancel={() => setAsking(false)} />
          )}
        </>
      )}
    </div>
  );
}
