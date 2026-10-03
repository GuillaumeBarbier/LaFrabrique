import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { Account } from "./account";

export const metadata: Metadata = { title: "Compte" };

export default async function AccountPage() {
  const user = await requireUser();
  return <Account user={user} />;
}
