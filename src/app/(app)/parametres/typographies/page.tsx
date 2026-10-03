import type { Metadata } from "next";
import { listCustomFonts } from "@/server/services/fonts";
import { Typographies } from "./typographies";

export const metadata: Metadata = { title: "Typographies" };
export const dynamic = "force-dynamic";

export default function TypographiesPage() {
  return <Typographies custom={listCustomFonts()} />;
}
