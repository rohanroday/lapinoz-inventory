"use client";

import { useRouter } from "next/navigation";

export default function HistoryDayPicker({ date, today, label, title }: { date: string; today: string; label: string; title: string }) {
  const router = useRouter();
  return (
    <label className="hh-pick">
      <span>{label}</span>
      <b>{title}</b>
      <input
        type="date"
        aria-label="Choose history date"
        value={date}
        max={today}
        onChange={(e) => { if (e.target.value && e.target.value <= today) router.push(`/history?date=${e.target.value}`); }}
      />
    </label>
  );
}
