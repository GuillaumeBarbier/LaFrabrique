import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "./book-fonts";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "La Fabrique", template: "%s · La Fabrique" },
  description: "Atelier de livres pour enfants.",
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang="fr"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
