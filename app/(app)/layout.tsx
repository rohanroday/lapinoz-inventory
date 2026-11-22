import TopBar from "@/components/TopBar";
import { requirePageUser } from "@/lib/auth";
import { countOpenRequests } from "@/lib/requests";
import { lowCount } from "@/lib/stock";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [low, requests] = await Promise.all([lowCount(), user.role === "owner" ? countOpenRequests() : Promise.resolve(0)]);
  return (
    <>
      <TopBar name={user.name} role={user.role} low={low} requests={requests} />
      <main>{children}</main>
    </>
  );
}
