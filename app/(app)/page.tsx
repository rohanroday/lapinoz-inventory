import StockBoard from "@/components/StockBoard";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIST } from "@/lib/day";
import { listOpenRequests } from "@/lib/requests";
import { getDayReport, listItems } from "@/lib/stock";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function StockPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const today = todayIST();
  const [items, people, dayReport, requests] = await Promise.all([
    listItems(),
    db.collection("movements").distinct("personName"),
    user.role === "owner" ? getDayReport(today) : Promise.resolve(null),
    listOpenRequests(),
  ]);
  return (
    <StockBoard
      items={items}
      role={user.role}
      people={people.filter((p: string) => p !== "Excel import")}
      defaultName={user.role === "owner" ? user.name : ""}
      greeting={greeting()}
      userName={user.name}
      dayReport={dayReport}
      today={today}
      requests={requests}
    />
  );
}
