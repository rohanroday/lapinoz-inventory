"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryTile, prettyCategory } from "@/lib/categories";
import { formatDay, shiftDay, type DayReportData } from "@/lib/day";
import { fmt } from "@/lib/qty";

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

export default function DayReport({ initial, today }: { initial: DayReportData; today: string }) {
  const [date, setDate] = useState(initial.date);
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(initial.date);

  // Keeps the open day current after stock is saved on this page.
  useEffect(() => {
    if (latest.current === initial.date) setReport(initial);
  }, [initial]);

  async function openDay(next: string) {
    if (!next || next > today) return;
    latest.current = next;
    setDate(next);
    setError("");
    if (next === initial.date) {
      setReport(initial);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/day?date=${next}`);
      if (res.status === 401) window.location.href = "/login";
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this day");
      if (latest.current === next) setReport(data);
    } catch (e) {
      if (latest.current === next) setError(e instanceof Error ? e.message : "Could not load this day");
    }
    if (latest.current === next) setLoading(false);
  }

  const shown = report.date === date && !error ? report : null;
  const groups = shown ? [...new Set(shown.items.map((i) => i.category))] : [];

  return (
    <section aria-label="Daily usage report">
      <div className="section-head">
        <h2>Daily usage</h2>
        {date !== today && <button className="see-all" onClick={() => openDay(today)}>Go to today</button>}
      </div>
      <div className="day-card">
        <div className="day-bar">
          <button className="icon-btn" aria-label="Previous day" onClick={() => openDay(shiftDay(date, -1))}><ChevronLeft size={19} /></button>
          <label className="day-pick">
            <span>{date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : "Selected day"}</span>
            <b>{formatDay(date)}</b>
            <input type="date" aria-label="Choose report date" value={date} max={today} onChange={(e) => openDay(e.target.value)} />
          </label>
          <button className="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => openDay(shiftDay(date, 1))}><ChevronRight size={19} /></button>
        </div>

        <div className="day-stats" aria-busy={loading}>
          <span><b>{shown?.items.length ?? "-"}</b> materials used</span>
          <span><b>{shown?.entries ?? "-"}</b> entries</span>
          <span><b>{shown?.people.length ?? "-"}</b> {shown?.people.length === 1 ? "person" : "people"}</span>
        </div>

        {loading && <p className="empty compact">Loading {formatDay(date)}...</p>}
        {!loading && error && (
          <div className="empty compact">
            <b>Could not load this day</b>
            <button className="text-btn" style={{ marginTop: 6 }} onClick={() => openDay(date)}>Try again</button>
          </div>
        )}
        {!loading && shown && !shown.items.length && (
          <p className="empty compact"><b>Nothing was used</b>No take-outs were recorded on {formatDay(date)}.</p>
        )}
        {!loading && shown && groups.map((group) => (
          <div key={group}>
            <p className="day-group">{prettyCategory(group)}</p>
            {shown.items.filter((i) => i.category === group).map((item) => (
              <details className="day-item" key={item.itemId}>
                <summary>
                  <CategoryTile category={item.category} />
                  <span className="row-main">
                    <span className="name">{item.name}</span>
                    <span className="meta">{[...new Set(item.uses.map((u) => u.person))].join(", ")}</span>
                  </span>
                  <span className="qty minus">{fmt(item.used)}<small>{item.uom}</small></span>
                  <ChevronDown className="day-chevron" size={16} aria-hidden="true" />
                </summary>
                <ul>
                  {item.uses.map((use, index) => (
                    <li key={`${use.at}-${index}`}>
                      <span><b>{use.person}</b> · {time.format(new Date(use.at))}{use.note ? ` · ${use.note}` : ""}</span>
                      <span className="qty">{fmt(use.qty)}<small>{item.uom}</small></span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
