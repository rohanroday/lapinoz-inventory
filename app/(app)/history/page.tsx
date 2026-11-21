import Link from "next/link";
import type { Filter, Document } from "mongodb";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, PencilLine, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fmt } from "@/lib/qty";

const PAGE_SIZE = 50;
const LABELS = {
  in: { label: "Added", tile: "in", Icon: ArrowDownToLine },
  out: { label: "Taken out", tile: "take", Icon: ArrowUpFromLine },
  opening: { label: "Opening count", tile: "opening", Icon: ClipboardCheck },
  adjust: { label: "Corrected", tile: "adjust", Icon: PencilLine },
  deleted: { label: "Deleted", tile: "take", Icon: Trash2 },
  restored: { label: "Restored", tile: "in", Icon: RotateCcw },
} as const;
type MoveType = keyof typeof LABELS;

const IST = "Asia/Kolkata";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const dayName = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00+05:30`));

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser();
  const raw = await searchParams;
  const get = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, 80) : "");
  const [item, person, type, from, to] = ["item", "person", "type", "from", "to"].map(get);
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);

  const filter: Filter<Document> = {};
  if (item) filter.itemName = { $regex: escapeRegex(item), $options: "i" };
  if (person) filter.personName = { $regex: `^${escapeRegex(person)}$`, $options: "i" };
  if (type in LABELS) filter.type = type;
  const at: Record<string, Date> = {};
  if (validDate(from)) at.$gte = new Date(`${from}T00:00:00+05:30`);
  if (validDate(to)) at.$lte = new Date(`${to}T23:59:59.999+05:30`);
  if (Object.keys(at).length) filter.at = at;

  const db = await getDb();
  const movements = db.collection("movements");
  const [rows, total, people] = await Promise.all([
    movements.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
    movements.countDocuments(filter),
    movements.distinct("personName"),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (changes: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries({ item, person, type, from, to, ...changes }).filter(([, v]) => v));
    const text = query.toString();
    return text ? `/history?${text}` : "/history";
  };

  const now = new Date();
  const today = dayKey.format(now);
  const yesterday = dayKey.format(new Date(now.getTime() - 86_400_000));
  const days = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = dayKey.format(row.at);
    days.set(key, [...(days.get(key) ?? []), row]);
  }
  const dayLabel = (key: string, sample: Date) => (key === today ? "Today" : key === yesterday ? "Yesterday" : dayName.format(sample));
  const hasDetailFilter = Boolean(item || person || from || to);

  return (
    <>
      <div className="head">
        <div>
          <h1>History</h1>
          <p className="sub">Who added or took out what, and when.</p>
        </div>
      </div>

      <div className="pills" style={{ marginTop: 0, marginBottom: 8 }}>
        <Link className={`pill ${!type ? "on" : ""}`} href={link({ type: "", page: "" })}>All</Link>
        {(Object.keys(LABELS) as MoveType[]).map((key) => (
          <Link key={key} className={`pill ${type === key ? "on" : ""}`} href={link({ type: key, page: "" })}>{LABELS[key].label}</Link>
        ))}
      </div>

      <details className="filter-box" open={hasDetailFilter}>
        <summary><SlidersHorizontal size={16} aria-hidden="true" /> Filter by item, person or date</summary>
        <form className="hist-filters">
          {type && <input type="hidden" name="type" value={type} />}
          <label>Item<input name="item" defaultValue={item} /></label>
          <label>Person
            <select name="person" defaultValue={person}>
              <option value="">Everyone</option>
              {people.sort().map((p: string) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>From<input type="date" name="from" defaultValue={from} /></label>
          <label>To<input type="date" name="to" defaultValue={to} /></label>
          <button className="btn primary">Apply</button>
        </form>
      </details>

      {!rows.length && (
        <div className="list" style={{ marginTop: 14 }}>
          <p className="empty"><b>No entries yet</b>Every count, add and take-out will appear here with the person&apos;s name.</p>
        </div>
      )}

      {[...days.entries()].map(([key, dayRows]) => (
        <section key={key}>
          <h2>{dayLabel(key, dayRows[0].at)}</h2>
          <div className="list">
            {dayRows.map((row) => {
              const info = LABELS[row.type as MoveType];
              const change = row.changeMilli / 1000;
              return (
                <div className="row" key={String(row._id)} style={{ cursor: "default" }}>
                  <span className={`tile ${info.tile}`} aria-hidden="true"><info.Icon size={19} /></span>
                  <span className="row-main">
                    <span className="name">{row.itemName}</span>
                    <span className="meta"><b style={{ color: "var(--ink)" }}>{row.personName}</b> · {info.label} · {time.format(row.at)}</span>
                    <span className="meta">{row.accountRole === "owner" ? "Owner login" : "Employee login"}{row.note ? ` · ${row.note}` : ""}</span>
                  </span>
                  <span className={`qty ${change > 0 ? "plus" : change < 0 ? "minus" : ""}`}>
                    {change > 0 ? "+" : ""}{fmt(change)}<small>{row.uom}</small>
                    <span className="meta">{fmt(row.afterMilli / 1000)} left</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {total > 0 && (
        <div className="pager">
          {page > 1 ? <Link className="btn" href={link({ page: String(page - 1) })}>Newer</Link> : <span />}
          <span className="meta">Page {page} of {pages} · {total} entries</span>
          {page < pages ? <Link className="btn" href={link({ page: String(page + 1) })}>Older</Link> : <span />}
        </div>
      )}
    </>
  );
}
