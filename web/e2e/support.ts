import { expect, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

interface PersonaToken {
  access_token: string;
  name: string;
  email: string;
}

export async function personaToken(key: string): Promise<PersonaToken> {
  const response = await fetch(`${API_URL}/dev/personas/${key}/token`, { method: "POST" });
  if (!response.ok) throw new Error(`persona ${key}: ${response.status}; run make seed`);
  return (await response.json()) as PersonaToken;
}

/** Starts the page as a persona, the way the persona slip does, before any app code runs. */
export async function startAs(page: Page, key: string): Promise<void> {
  const persona = await personaToken(key);
  await page.addInitScript((value) => window.localStorage.setItem("vaada.persona", value), JSON.stringify({ token: persona.access_token, name: persona.name, email: persona.email }));
}

export async function apiAs<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const persona = await personaToken(key);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${persona.access_token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

interface MailpitSummary {
  ID: string;
  Created: string;
}

/** Reads the newest six-digit sign-in code sent to this address from the local mail catcher. */
export async function signInCode(email: string, after: Date): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
        const { messages } = (await search.json()) as { messages: MailpitSummary[] };
        const fresh = messages.filter((m) => new Date(m.Created) >= after);
        if (!fresh.length) return null;
        const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${fresh[0]!.ID}`)).json()) as { Text: string };
        code = /\b(\d{6})\b/.exec(message.Text)?.[1] ?? null;
        return code;
      },
      { message: `a sign-in code for ${email}`, timeout: 30_000 },
    )
    .not.toBeNull();
  return code!;
}
