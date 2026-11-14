import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resend } from "resend";

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const outbox = process.env.MAIL_OUTBOX_DIR;
if (outbox && process.env.NODE_ENV === "production")
  throw new Error("MAIL_OUTBOX_DIR is for development and tests only");

async function send(mail: Mail): Promise<void> {
  if (outbox) {
    await mkdir(outbox, { recursive: true });
    await writeFile(
      join(outbox, `${Date.now()}-${crypto.randomUUID()}.json`),
      JSON.stringify(mail),
    );
    return;
  }
  const from = process.env.MAIL_FROM;
  if (!process.env.RESEND_API_KEY || !from)
    throw new Error("RESEND_API_KEY and MAIL_FROM are required to send mail");
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from,
    ...mail,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function sendSignInLink(
  email: string,
  url: string,
  minutes: number,
): Promise<void> {
  const notice = `The link works once and expires in ${minutes} minutes. If you did not ask for it, ignore this email.`;
  return send({
    to: email,
    subject: "Sign in to YourWeek",
    text: `Open this link to sign in to YourWeek:\n\n${url}\n\n${notice}`,
    html: `<p>Open this link to sign in to YourWeek:</p><p><a href="${escapeHtml(url)}">Sign in</a></p><p>${notice}</p>`,
  });
}
