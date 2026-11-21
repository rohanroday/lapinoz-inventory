import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { CategoryTile, prettyCategory } from "@/lib/categories";
import { bringQty, fmt } from "@/lib/qty";
import { emailEnabled, listItems } from "@/lib/stock";

export default async function AlertsPage() {
  const user = await requirePageUser();
  if (user.role !== "owner") redirect("/");
  const items = await listItems();
  const low = items.filter((i) => i.low).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const finished = low.filter((i) => i.stock === 0).length;
  const noMin = items.filter((i) => i.min === null).length;

  return (
    <>
      <div className="head">
        <div>
          <h1>Low Stock</h1>
          <p className="sub">Items at or below their minimum level.</p>
        </div>
      </div>
      <section className="hero" aria-label="Low stock summary" style={{ marginBottom: 16 }}>
        <span className="hero-label">Need reordering</span>
        <b className="hero-num">{low.length}<small>{low.length === 1 ? "item" : "items"}</small></b>
        <div className="hero-foot" style={{ marginTop: 10 }}>
          <span>{finished} finished</span>
          <span>{noMin} without a minimum</span>
        </div>
      </section>
      {!emailEnabled() && <p className="note">Email alerts are off. Low stock still shows here and on the red badge.</p>}
      {noMin > 0 && <p className="note">{noMin} items have no minimum yet, so they cannot trigger an alert. Set them on the Setup page.</p>}
      {low.length > 0 ? (
        <div className="list">
          {low.map((item) => (
            <div className="row" key={item.id} style={{ cursor: "default" }}>
              <CategoryTile category={item.category} />
              <span className="row-main">
                <span className="name">{item.name}</span>
                <span className="meta">{prettyCategory(item.category)} · Minimum {fmt(item.min)}</span>
              </span>
              <span className="status"><span className="tag low">{item.stock === 0 ? "Finished" : `${fmt(item.stock)} left`}</span></span>
              <span className="qty alert">Bring {fmt(bringQty(item))}<small>{item.uom}</small></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="list"><p className="empty"><CircleCheck size={30} /><b>Nothing is low right now</b>Items will appear here as soon as they reach their minimum.</p></div>
      )}
    </>
  );
}
