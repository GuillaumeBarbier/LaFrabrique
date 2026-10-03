import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/theme";
import { Appearance } from "./appearance";

export const metadata: Metadata = { title: "Apparence" };

export default async function AppearancePage() {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  const theme: ThemeChoice = value === "light" || value === "dark" ? value : "auto";
  return <Appearance theme={theme} />;
}
