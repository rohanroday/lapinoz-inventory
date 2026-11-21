import TopBar from "@/components/TopBar";
import { requirePageUser } from "@/lib/auth";
import { lowCount } from "@/lib/stock";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const low = await lowCount();
  return (
    <>
      <TopBar name={user.name} role={user.role} low={low} />
      <main>{children}</main>
    </>
  );
}
