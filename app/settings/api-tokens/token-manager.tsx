"use client";

import { useActionState, useState } from "react";
import type { ApiTokenInfo } from "../../../src/api-tokens";
import {
  createApiToken,
  revokeApiToken,
  type CreateTokenState,
  type RevokeTokenState,
} from "./actions";
import styles from "./api-tokens.module.css";

const idleCreate: CreateTokenState = { status: "idle" };
const idleRevoke: RevokeTokenState = { status: "idle" };

export function TokenManager({
  tokens,
}: {
  tokens: ApiTokenInfo[];
}): React.JSX.Element {
  const [created, create, creating] = useActionState(
    createApiToken,
    idleCreate,
  );
  const [revoked, revoke, revoking] = useActionState(
    revokeApiToken,
    idleRevoke,
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const secret =
    created.status === "created" && created.token !== dismissed
      ? created.token
      : null;

  return (
    <>
      <form action={create} className={styles.form}>
        <label className={styles.label} htmlFor="token-name">
          Token name
        </label>
        <input
          className={styles.input}
          id="token-name"
          name="name"
          maxLength={100}
          required
        />
        <button className={styles.submit} disabled={creating}>
          Create token
        </button>
      </form>

      {created.status === "error" && (
        <p className={styles.error} role="alert">
          {created.message}
        </p>
      )}

      {secret !== null && (
        <section className={styles.secret} aria-label="New API token">
          <p className={styles.warning}>
            Copy this token now. You won&apos;t be able to see it again.
          </p>
          <input
            className={styles.secretInput}
            aria-label="New API token"
            value={secret}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className={styles.secondary}
            type="button"
            onClick={() => setDismissed(secret)}
          >
            Hide token
          </button>
        </section>
      )}

      {tokens.length === 0 ? (
        <p className={styles.empty}>No API tokens yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Prefix</th>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
              <th scope="col">
                <span className={styles.hidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td data-label="Name">{token.name}</td>
                <td data-label="Prefix">
                  <code>{token.prefix}</code>
                </td>
                <td data-label="Created">
                  <time dateTime={token.createdAt}>
                    {token.createdAt.slice(0, 10)}
                  </time>
                </td>
                <td data-label="Last used">
                  {token.lastUsedAt === null ? (
                    "Never used"
                  ) : (
                    <time dateTime={token.lastUsedAt}>
                      {token.lastUsedAt.slice(0, 10)}
                    </time>
                  )}
                </td>
                <td>
                  <form action={revoke}>
                    <input type="hidden" name="id" value={token.id} />
                    <button
                      className={styles.revoke}
                      disabled={revoking}
                      aria-label={`Revoke ${token.name}`}
                    >
                      Revoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {revoked.status === "error" && (
        <p className={styles.error} role="alert">
          {revoked.message}
        </p>
      )}
    </>
  );
}
