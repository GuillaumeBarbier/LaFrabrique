import { CustomFontsLink } from "@/components/book/custom-fonts-link";
import { listOpenRequests } from "@/server/services/comments";
import { requireUser } from "@/server/session";
import styles from "./shell.module.css";
import { Sidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className={styles.shell}>
      <CustomFontsLink />
      <Sidebar userName={user.name} waitingForHuman={listOpenRequests("human").length} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
