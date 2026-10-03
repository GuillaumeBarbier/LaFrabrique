import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { validateAuthorizationRequest } from "@/server/oauth/flow";
import { currentUser, pageOrigin } from "@/server/session";
import { AuthBand } from "../../(auth)/auth-band";
import styles from "../../(auth)/auth.module.css";
import { Consent } from "./consent";

export const metadata: Metadata = { title: "Autoriser un agent" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * OAuth authorization endpoint (ADR-0007). An untrusted client or redirect URI gets an error
 * page, never a redirect; the owner must be signed in; then they choose the agent's name and scope.
 */
export default async function AuthorizePage({ searchParams }: Props) {
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params[k] = v;

  const result = await validateAuthorizationRequest(params, await pageOrigin());
  if (!result.ok && result.redirect) redirect(result.redirect);

  if (result.ok && !(await currentUser())) {
    redirect(`/connexion?suivant=${encodeURIComponent(`/oauth/autoriser?${new URLSearchParams(params)}`)}`);
  }

  return (
    <main className={styles.page}>
      <AuthBand />
      <div className={styles.formSide}>
        {result.ok ? (
          <Consent
            params={params}
            clientName={result.client.name}
            redirectHost={new URL(result.request.redirectUri).host || new URL(result.request.redirectUri).protocol}
            loopbackOnly={result.client.redirectUris.every((u) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(u))}
            requestedScope={result.request.requestedScope}
          />
        ) : (
          <div className={styles.form}>
            <h1 className={styles.title}>Connexion impossible</h1>
            <p className={styles.error} role="alert">
              {result.description}
            </p>
            <p className={styles.sub}>Relancer la connexion depuis l&apos;application qui l&apos;a demandée.</p>
          </div>
        )}
      </div>
    </main>
  );
}
