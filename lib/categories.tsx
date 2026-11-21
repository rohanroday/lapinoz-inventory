import {
  Boxes, ChefHat, CookingPot, CupSoda, Cylinder, Drumstick, Droplets, GlassWater, Leaf, Megaphone,
  Microwave, Milk, Package, Shirt, Snowflake, Soup, SprayCan, Coffee, Wheat, type LucideIcon,
} from "lucide-react";

const META: Record<string, [LucideIcon, string]> = {
  CHEESE: [Milk, "#a97400"],
  "CHICKEN AND MEAT": [Drumstick, "#c2571a"],
  SAUCES: [Droplets, "#c8322f"],
  "PACKING MATERIAL": [Package, "#9a6a2f"],
  "T-SHIRTS, CAPS": [Shirt, "#0b7a50"],
  "NON FOOD MATERIAL": [SprayCan, "#2f6fd0"],
  "BEVERAGE - EQUIPMENTS": [CupSoda, "#7a4fd0"],
  "BEVERAGE - RAW MATERIAL": [GlassWater, "#c23a7a"],
  "BEVERAGE - PACKAGING MATERIAL": [Coffee, "#7b5136"],
  "TIN PRODUCT": [Cylinder, "#4a5fc9"],
  SEASONING: [Leaf, "#3f8a2e"],
  "PASTA, MACRONI AND QUESADILLAS": [CookingPot, "#b7791f"],
  "KITCHEN EQUIPMENTS": [ChefHat, "#0f7c85"],
  MACHINES: [Microwave, "#4b5f70"],
  FREEZERS: [Snowflake, "#1787b8"],
  MAIDA: [Wheat, "#a87415"],
  BRANDING: [Megaphone, "#d0442b"],
  "RICE BOWL": [Soup, "#16866a"],
};

export function CategoryTile({ category, size = 20 }: { category: string; size?: number }) {
  const [Icon, color] = META[category] ?? [Boxes, "#4b5f70"];
  return (
    <span className="tile" style={{ background: color }} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

const SMALL_WORDS = new Set(["and", "of"]);
export const prettyCategory = (category: string) =>
  category
    .toLowerCase()
    .replace("beverage - ", "Beverage: ")
    .replace(/[a-z]+/gi, (word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1),
    );
