import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const outbox = "test-results/outbox";

interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function signInLinkFor(email: string): Promise<string> {
  let link = "";
  await expect(async () => {
    const files = (await readdir(outbox)).sort().reverse();
    for (const file of files) {
      const mail: Mail = JSON.parse(await readFile(join(outbox, file), "utf8"));
      if (mail.to !== email) continue;
      link = mail.text.match(/https?:\/\/\S+/)![0];
      return;
    }
    throw new Error(`No email to ${email}`);
  }).toPass({ timeout: 5_000 });
  return link;
}

export function uniqueEmail(): string {
  return `user-${crypto.randomUUID()}@example.com`;
}

export async function signIn(page: Page, email = uniqueEmail()): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.goto(await signInLinkFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}
