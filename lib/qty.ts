// Quantities are stored as whole thousandths so KG maths never drifts (0.1 + 0.2).
export const UOMS = ["PCS", "NOS", "PKT", "KG", "CASE", "TIN", "BAG"];

export type Item = {
  id: string;
  name: string;
  category: string;
  uom: string;
  orderedQty: number | null;
  stock: number | null;
  min: number | null;
  low: boolean;
};

export function qtyError(value: unknown, uom: string): string | null {
  if (value === "" || value === null || value === undefined) return "Enter a quantity";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "Quantity must be 0 or more";
  if (n > 10_000_000) return "Quantity is too large";
  if (uom === "KG") {
    if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return "Use up to 3 decimals for KG";
  } else if (!Number.isInteger(n)) {
    return `${uom} must be a whole number`;
  }
  return null;
}

export const toMilli = (value: unknown) => Math.round(Number(value) * 1000);
export const fromMilli = (value: number | null | undefined) =>
  value === null || value === undefined ? null : value / 1000;

// Smallest purchase that brings an item back above its minimum level.
export const bringQty = (item: Pick<Item, "stock" | "min">) =>
  (Math.max(toMilli(item.min ?? 0) - toMilli(item.stock ?? 0), 0) + 1000) / 1000;

export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
