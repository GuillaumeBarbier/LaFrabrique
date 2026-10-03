import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAnyUser } from "@/server/auth/users";
import { AuthBand } from "../auth-band";
import styles from "../auth.module.css";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Installation" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasAnyUser()) redirect("/connexion");
  return (
    <main className={styles.page}>
      <AuthBand />
      <div className={styles.formSide}>
        <SetupForm needsToken={!!process.env.SETUP_TOKEN} />
      </div>
    </main>
  );
}
