import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listApiTokens } from "../../../src/api-tokens";
import { auth } from "../../../src/auth";
import { TokenManager } from "./token-manager";
import styles from "./api-tokens.module.css";

export default async function ApiTokensPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const tokens = await listApiTokens(session.user.id);
  return (
    <main className={styles.page}>
      <nav className={styles.links}>
        <Link href="/">Back to week</Link>
        <a href="/api/v1/openapi.json">OpenAPI</a>
      </nav>
      <h1 className={styles.title}>API tokens</h1>
      <TokenManager tokens={tokens} />
    </main>
  );
}
