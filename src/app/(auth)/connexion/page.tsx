import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAnyUser } from "@/server/auth/users";
import { currentUser } from "@/server/session";
import { AuthBand } from "../auth-band";
import styles from "../auth.module.css";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasAnyUser()) redirect("/installation");
  if (await currentUser()) redirect("/");
  return (
    <main className={styles.page}>
      <AuthBand />
      <div className={styles.formSide}>
        <LoginForm />
      </div>
    </main>
  );
}
