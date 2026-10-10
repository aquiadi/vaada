import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";

const PERSONA_KEY = "vaada.persona";

export interface PersonaSession {
  token: string;
  name: string;
  email: string;
}

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= loadConfig().then((config) =>
    createClient(config.supabase_url, config.supabase_anon_key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "vaada.auth" },
    }),
  );
  return client;
}

export function personaSession(): PersonaSession | null {
  try {
    const raw = localStorage.getItem(PERSONA_KEY);
    return raw ? (JSON.parse(raw) as PersonaSession) : null;
  } catch (error) {
    console.warn("persona session unreadable", error);
    return null;
  }
}

export function setPersonaSession(session: PersonaSession | null): void {
  try {
    if (session) localStorage.setItem(PERSONA_KEY, JSON.stringify(session));
    else localStorage.removeItem(PERSONA_KEY);
  } catch (error) {
    console.warn("persona session not saved", error);
  }
  window.dispatchEvent(new Event("vaada:auth"));
}

/** A dev or demo persona wins over a real session, so switching people is one click. */
export async function accessToken(): Promise<string | null> {
  const persona = personaSession();
  if (persona) return persona.token;
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  setPersonaSession(null);
  await (await supabase()).auth.signOut();
  window.dispatchEvent(new Event("vaada:auth"));
}
