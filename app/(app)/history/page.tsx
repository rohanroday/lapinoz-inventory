import Link from "next/link";
import type { Document, Filter } from "mongodb";
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, ClipboardCheck, History as HistoryIcon, PencilLine, RotateCcw, Search, Trash2 } from "lucide-react";
import HistoryDayPicker from "@/components/HistoryDayPicker";
import { requirePageUser } from "@/lib/auth";
import { formatDay, isValidDay, shiftDay, todayIST } from "@/lib/day";
import { getDb } from "@/lib/db";
import { fmt } from "@/lib/qty";

const PAGE_SIZE = 100;
const STRIP_DAYS = 14;
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
const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const hourOf = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", hourCycle: "h23" });
const chipDay = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short" });
const chipMonth = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short" });
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const partOfDay = (at: Date) => {
  const hour = Number(hourOf.format(at));
  return hour < 5 ? "Early morning" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
};
const dayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser();
  const raw = await searchParams;
  const get = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, 80) : "");
  const [item, person, typeParam, dateParam] = ["item", "person", "type", "date"].map(get);
  const today = todayIST();
  const date = isValidDay(dateParam) && dateParam <= today ? dateParam : today;
  const type = typeParam in LABELS ? (typeParam as MoveType) : "";
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);

  const dayRange = { $gte: dayStart(date), $lt: dayStart(shiftDay(date, 1)) };
  const filter: Filter<Document> = { at: dayRange };
  if (item) filter.itemName = { $regex: escapeRegex(item), $options: "i" };
  if (person) filter.personName = { $regex: `^${escapeRegex(person)}$`, $options: "i" };
  if (type) filter.type = type;

  const db = await getDb();
  const movements = db.collection("movements");
  const stripStart = shiftDay(today, -(STRIP_DAYS - 1));
  const [rows, total, typeCounts, dayPeople, activeDays] = await Promise.all([
    movements.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
    movements.countDocuments(filter),
    movements.aggregate<{ _id: MoveType; n: number }>([{ $match: { at: dayRange } }, { $group: { _id: "$type", n: { $sum: 1 } } }]).toArray(),
    movements.distinct("personName", { at: dayRange }),
    movements.aggregate<{ _id: string; n: number }>([
      { $match: { at: { $gte: dayStart(stripStart) } } },
      { $group: { _id: { $dateToString: { date: "$at", format: "%Y-%m-%d", timezone: IST } }, n: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const countOf = (key: MoveType) => typeCounts.find((c) => c._id === key)?.n ?? 0;
  const dayTotal = typeCounts.reduce((sum, c) => sum + c.n, 0);
  const activity = new Map(activeDays.map((d) => [d._id, d.n]));
  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDay(today, -i));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = Boolean(item || person || type);
  const yesterday = shiftDay(today, -1);
  const link = (changes: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries({ date, item, person, type, ...changes }).filter(([, v]) => v));
    return `/history?${query}`;
  };
  const dayLink = (day: string) => `/history?date=${day}`;

  const sections: { part: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    const part = partOfDay(row.at);
    const last = sections[sections.length - 1];
    if (last?.part === part) last.rows.push(row);
    else sections.push({ part, rows: [row] });
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>History</h1>
          <p className="sub">Who added or took out what, day by day.</p>
        </div>
      </div>

      <section className="hh-hero" aria-label="Selected day">
        <div className="hh-bar">
          <Link className="hh-nav" href={dayLink(shiftDay(date, -1))} aria-label="Previous day"><ChevronLeft size={20} /></Link>
          <HistoryDayPicker date={date} today={today} title={formatDay(date)} label={date === today ? "Today" : date === yesterday ? "Yesterday" : "Selected day"} />
          {date < today
            ? <Link className="hh-nav" href={dayLink(shiftDay(date, 1))} aria-label="Next day"><ChevronRight size={20} /></Link>
            : <span className="hh-nav off" aria-hidden="true"><ChevronRight size={20} /></span>}
        </div>
        <div className="hh-stats">
          <span><b>{countOf("in")}</b>Added</span>
          <span><b>{countOf("out")}</b>Taken out</span>
          <span><b>{dayTotal}</b>{dayTotal === 1 ? "Entry" : "Entries"}</span>
          <span><b>{dayPeople.length}</b>{dayPeople.length === 1 ? "Person" : "People"}</span>
        </div>
      </section>

      <nav className="hh-strip" aria-label="Recent days">
        {strip.map((day) => {
          const count = activity.get(day) ?? 0;
          return (
            <Link key={day} href={dayLink(day)} className={`hh-chip ${day === date ? "on" : ""}`} aria-current={day === date ? "date" : undefined}
              aria-label={`${formatDay(day)}, ${count} ${count === 1 ? "entry" : "entries"}`}>
              <small>{day === today ? "Today" : chipDay.format(new Date(`${day}T00:00:00Z`))}</small>
              <b>{Number(day.slice(8))}</b>
              <small>{chipMonth.format(new Date(`${day}T00:00:00Z`))}</small>
              <i className={count ? "has" : ""} />
            </Link>
          );
        })}
      </nav>

      <div className="pills hh-pills">
        <Link className={`pill ${!type ? "on" : ""}`} href={link({ type: "", page: "" })}>All <b>{dayTotal}</b></Link>
        {(Object.keys(LABELS) as MoveType[]).filter((key) => countOf(key) > 0 || type === key).map((key) => (
          <Link key={key} className={`pill ${type === key ? "on" : ""}`} href={link({ type: key, page: "" })}>{LABELS[key].label} <b>{countOf(key)}</b></Link>
        ))}
      </div>

      {dayTotal > 0 && (
        <form className="hh-filter">
          <input type="hidden" name="date" value={date} />
          {type && <input type="hidden" name="type" value={type} />}
          <span className="search hh-search">
            <Search size={18} aria-hidden="true" />
            <input name="item" aria-label="Search item" placeholder="Search item" defaultValue={item} />
          </span>
          <select name="person" aria-label="Filter by person" defaultValue={person}>
            <option value="">Everyone</option>
            {[...new Set([...dayPeople, ...(person ? [person] : [])])].sort().map((p: string) => <option key={p}>{p}</option>)}
          </select>
          <button className="btn primary">Apply</button>
        </form>
      )}

      {!rows.length && (
        <div className="hh-empty">
          <span className="hh-empty-ic"><HistoryIcon size={26} /></span>
          <b>{hasFilter && dayTotal ? "No entries match" : `No activity on ${formatDay(date)}`}</b>
          <p>{hasFilter && dayTotal ? "Try another item, person or action." : "Every add and take-out will appear here with the person's name and time."}</p>
          {hasFilter && dayTotal > 0 && <Link className="btn" href={dayLink(date)}>Clear filters</Link>}
        </div>
      )}

      {sections.map((section, index) => (
        <section key={`${section.part}-${index}`}>
          <h2>{section.part}</h2>
          <ol className="tl">
            {section.rows.map((row) => {
              const info = LABELS[row.type as MoveType];
              const change = row.changeMilli / 1000;
              return (
                <li className="tl-row" key={String(row._id)}>
                  <span className={`tile ${info.tile}`} aria-hidden="true"><info.Icon size={18} /></span>
                  <div className="row-main">
                    <span className="name">{row.itemName}</span>
                    <span className="tl-who">
                      <span className="tl-avatar" aria-hidden="true">{String(row.personName).trim()[0]?.toUpperCase()}</span>
                      <b>{row.personName}</b>
                    </span>
                    <span className="meta">{info.label} · {time.format(row.at)} · {row.accountRole === "owner" ? "Owner" : "Employee"} login</span>
                    {row.note && <span className="tl-note">{row.note}</span>}
                  </div>
                  <span className={`qty ${change > 0 ? "plus" : change < 0 ? "minus" : ""}`}>
                    {change > 0 ? "+" : ""}{fmt(change)}<small>{row.uom}</small>
                    <span className="meta">{fmt(row.afterMilli / 1000)} left</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {pages > 1 && (
        <div className="pager">
          {page > 1 ? <Link className="btn" href={link({ page: String(page - 1) })}>Newer</Link> : <span />}
          <span className="meta">Page {page} of {pages} · {total} entries</span>
          {page < pages ? <Link className="btn" href={link({ page: String(page + 1) })}>Older</Link> : <span />}
        </div>
      )}
    </>
  );
}
