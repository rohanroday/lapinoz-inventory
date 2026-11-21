import { redirect } from "next/navigation";
import CountSheet from "@/components/CountSheet";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listItems } from "@/lib/stock";

export default async function CountPage() {
  const user = await requirePageUser();
  if (user.role !== "owner") redirect("/");
  const db = await getDb();
  const [items, people] = await Promise.all([listItems(), db.collection("movements").distinct("personName")]);
  return <CountSheet items={items} people={people.filter((p: string) => p !== "Excel import")} defaultName={user.name} />;
}
