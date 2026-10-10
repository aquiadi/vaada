import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { api } from "../lib/api";
import { personaSession, setPersonaSession, signOut } from "../lib/auth";
import { useConfig } from "../lib/config";
import { useAuthVersion, useMe } from "../lib/session";
import { applyTheme, currentTheme, type Theme } from "../lib/theme";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-baseline gap-2 text-ink">
      <span className={`font-display font-medium tracking-[0.01em] ${large ? "text-mark" : "text-[1.75rem] leading-none"}`}>Vaada</span>
      <span className={`deva ${large ? "text-h2" : "text-[1.125rem]"} text-bahi`} lang="hi">
        वादा
      </span>
    </span>
  );
}

/** Plain, impossible to miss, not decorative. */
function DemoBand() {
  return (
    <div className="no-print border-b border-bahi bg-paper-deep px-4 py-2 text-center">
      <p className="smallcaps m-0 text-ui text-ink">Demo. No real money moves here.</p>
    </div>
  );
}

function Masthead() {
  const { data: me } = useMe();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `smallcaps text-ui no-underline py-1 border-b ${isActive ? "border-bahi text-ink" : "border-transparent text-ink-soft hover:text-ink"}`;
  return (
    <header className="no-print border-b hairline bg-paper-deep">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link to="/" className="no-underline" aria-label="Vaada, home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {me ? (
            <>
              <NavLink to="/deeds" className={navClass}>
                Deeds
              </NavLink>
              <NavLink to="/ledger" className={navClass}>
                Ledger
              </NavLink>
              <NavLink to="/payouts" className={navClass}>
                Payouts
              </NavLink>
              {me.is_admin ? (
                <NavLink to="/admin" className={navClass}>
                  Desk
                </NavLink>
              ) : null}
              <button type="button" onClick={() => void signOut()} className="smallcaps cursor-pointer border-0 bg-transparent p-0 text-ui text-ink-soft hover:text-ink">
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={navClass}>
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const choices: Theme[] = ["system", "light", "dark"];
  return (
    <fieldset className="m-0 flex items-center gap-3 border-0 p-0">
      <legend className="sr-only">Theme</legend>
      {choices.map((choice) => (
        <label key={choice} className="smallcaps flex cursor-pointer items-center gap-1 text-micro text-ink-soft">
          <input
            type="radio"
            name="theme"
            value={choice}
            checked={theme === choice}
            onChange={() => {
              applyTheme(choice);
              setTheme(choice);
            }}
            className="accent-[var(--bahi)]"
          />
          {choice === "system" ? "Match device" : choice}
        </label>
      ))}
    </fieldset>
  );
}

function Colophon() {
  const legal: Array<[string, string]> = [
    ["/legal/terms", "Terms"],
    ["/legal/privacy", "Privacy"],
    ["/legal/refunds", "Refunds"],
    ["/legal/delivery", "Delivery"],
    ["/legal/contact", "Contact"],
    ["/pricing", "Pricing"],
  ];
  return (
    <footer className="no-print mt-16 border-t hairline bg-paper-deep">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
        <nav aria-label="Policies" className="flex flex-wrap gap-x-5 gap-y-2">
          {legal.map(([to, label]) => (
            <Link key={to} to={to} className="smallcaps text-ui text-ink-soft no-underline hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="m-0 text-note italic text-ink-soft">Set in Cormorant &amp; Source Serif. Dictated with Wispr Flow.</p>
          <ThemeToggle />
        </div>
        <p className="m-0 max-w-[68ch] text-micro text-ink-soft">
          Vaada helps people write down what they agreed and isn't a lawyer. Money is held and paid out by Razorpay, never by Vaada.
        </p>
      </div>
    </footer>
  );
}

interface Persona {
  key: string;
  name: string;
  email: string;
  about: string;
}

/** Dev and demo only: a slip of paper in the corner for being someone else. */
function PersonaSlip({ devTools }: { devTools: boolean }) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const current = personaSession();
  useEffect(() => {
    if (!open || personas.length) return;
    api
      .get<{ personas: Persona[] }>("/dev/personas")
      .then((r) => setPersonas(r.personas))
      .catch(() => setError("Personas aren't available. Run make seed."));
  }, [open, personas.length]);

  async function become(persona: Persona | null) {
    setError(null);
    if (!persona) {
      setPersonaSession(null);
    } else {
      try {
        const session = await api.post<{ access_token: string; name: string; email: string }>(`/dev/personas/${persona.key}/token`);
        setPersonaSession({ token: session.access_token, name: session.name, email: session.email });
      } catch {
        setError("That persona isn't seeded yet. Run make seed.");
        return;
      }
    }
    await client.invalidateQueries();
    setOpen(false);
  }

  async function advance(days: number) {
    await api.post("/dev/clock/advance", { days });
    await api.post("/dev/tick");
    await client.invalidateQueries();
  }

  return (
    <aside className="no-print fixed bottom-3 left-3 z-30 max-w-[calc(100vw-1.5rem)]" aria-label="Dev personas">
      {open ? (
        <div className="sheet w-72 rounded-sm p-3 text-note">
          <p className="label m-0 mb-2">Be someone else</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {personas.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => void become(p)} className="w-full cursor-pointer border-0 bg-transparent p-1 text-left hover:bg-paper-deep" aria-current={current?.email === p.email}>
                  <span className={current?.email === p.email ? "text-bahi" : "text-ink"}>{p.name}</span>
                  <span className="block text-micro text-ink-soft">{p.about}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => void become(null)} className="w-full cursor-pointer border-0 bg-transparent p-1 text-left text-ink-soft hover:bg-paper-deep">
                Your own account
              </button>
            </li>
          </ul>
          {devTools ? (
            <div className="mt-3 border-t hairline pt-2">
              <p className="label m-0 mb-1">Let time pass</p>
              <div className="flex gap-2">
                {[1, 6].map((d) => (
                  <button key={d} type="button" onClick={() => void advance(d)} className="smallcaps cursor-pointer border hairline bg-paper px-2 py-1 text-micro">
                    +{d} {d === 1 ? "day" : "days"}
                  </button>
                ))}
                <Link to="/dev/outbox" className="smallcaps px-2 py-1 text-micro">
                  Outbox
                </Link>
              </div>
            </div>
          ) : null}
          {error ? <p className="m-0 mt-2 text-micro text-bahi">{error}</p> : null}
          <button type="button" onClick={() => setOpen(false)} className="smallcaps mt-2 cursor-pointer border-0 bg-transparent p-0 text-micro text-ink-soft">
            Close
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="sheet smallcaps cursor-pointer rounded-sm px-3 py-2 text-micro text-ink">
          {current ? `As ${current.name}` : "Personas"}
        </button>
      )}
    </aside>
  );
}

export function Shell() {
  const { data: config } = useConfig();
  useAuthVersion();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-paper focus:p-2">
        Skip to the page
      </a>
      {config?.demo ? <DemoBand /> : null}
      <Masthead />
      <main id="main" className="grain flex-1">
        <Outlet />
      </main>
      <Colophon />
      {config?.persona_switcher ? <PersonaSlip devTools={config.dev_tools} /> : null}
    </div>
  );
}
