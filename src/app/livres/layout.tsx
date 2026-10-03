import { CustomFontsLink } from "@/components/book/custom-fonts-link";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BookLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <CustomFontsLink />
      {children}
    </>
  );
}
