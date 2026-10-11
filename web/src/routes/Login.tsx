import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Button, Field, focusOnMount, Notice, PageHeader, Waiting } from "../components/ui";
import { api } from "../lib/api";
import { setPersonaSession, supabase } from "../lib/auth";
import { useConfig } from "../lib/config";
import { explain } from "../lib/errors";
import { useMe } from "../lib/session";
import type { Me } from "../lib/types";
import { signInProblem } from "../pages/signInProblem";

const DEFAULT_NEXT = "/deeds";

/** Only paths on this site, so a crafted link can't bounce someone to another domain after signing in. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return DEFAULT_NEXT;
  return raw;
}

function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/** A form slip: ruled paper with a double margin rule down its left side. */
function Slip({ children }: { children: ReactNode }) {
  return (
    <div className="sheet grain relative rounded-sm py-7 pr-5 pl-12 sm:py-9 sm:pr-10 sm:pl-16">
      <span aria-hidden="true" className="absolute inset-y-0 left-7 w-[3px] border-x border-bahi sm:left-10" />
      {children}
    </div>
  );
}

interface EmailStepProps {
  next: string;
  googleEnabled: boolean;
  /** Set when the person came back from the code step, whose form has just gone. */
  takeFocus: boolean;
  onSent: (email: string) => void;
}

function EmailStep({ next, googleEnabled, takeFocus, onSent }: EmailStepProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setError("Write the email address you’d like to sign in with, like name@example.com.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await (await supabase()).auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
      if (failed) setError(signInProblem(failed, "send"));
      else onSent(address);
    } catch (caught) {
      setError(signInProblem(caught, "send"));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setGoogleError(null);
    try {
      const { error: failed } = await (
        await supabase()
      ).auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}` },
      });
      if (failed) setGoogleError(signInProblem(failed, "google"));
    } catch (caught) {
      setGoogleError(signInProblem(caught, "google"));
    }
  }

  return (
    <>
      <form onSubmit={send} noValidate>
        <Field
          ref={takeFocus ? focusOnMount : undefined}
          id="login-email"
          label="Email address"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          hint="Deeds, receipts and payment notices go to this address."
        />
        <Button type="submit" busy={busy} className="mt-6">
          Email me a code
        </Button>
      </form>
      {googleEnabled ? (
        <div className="mt-8">
          <p className="smallcaps m-0 mb-4 flex items-center gap-3 text-micro text-ink-soft">
            <span aria-hidden="true" className="h-px flex-1 bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]" />
            or
            <span aria-hidden="true" className="h-px flex-1 bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]" />
          </p>
          <Button tone="plain" onClick={() => void google()}>
            Continue with Google
          </Button>
          {googleError ? (
            <Notice tone="error" className="mt-4">
              {googleError}
            </Notice>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CodeStep({ email, onSignedIn, onStartOver }: { email: string; onSignedIn: () => Promise<void>; onStartOver: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resent, setResent] = useState<string | null>(null);

  async function checkCode(): Promise<boolean> {
    try {
      const { error: failed } = await (await supabase()).auth.verifyOtp({ email, token: code, type: "email" });
      if (failed) setError(signInProblem(failed, "verify"));
      return !failed;
    } catch (caught) {
      setError(signInProblem(caught, "verify"));
      return false;
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!verified && !/^\d{6}$/.test(code)) {
      setError("The code is six digits. Type all six from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // A code works once, so after it is accepted a second press only retries opening the account.
      if (!verified && !(await checkCode())) return;
      setVerified(true);
      await onSignedIn();
    } catch (caught) {
      setError(explain(caught, "The code was right, but we couldn’t open your account just now. Press Sign in again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResent(null);
    setError(null);
    try {
      const { error: failed } = await (await supabase()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (failed) setError(signInProblem(failed, "send"));
      else setResent("A new code is on its way. Use the newest one; the earlier code no longer works.");
    } catch (caught) {
      setError(signInProblem(caught, "send"));
    }
  }

  return (
    <form onSubmit={verify} noValidate>
      <Field
        ref={focusOnMount}
        id="login-code"
        label="Sign-in code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        error={error}
        hint="Six digits, from the email we just sent."
        style={{ fontVariantNumeric: "lining-nums tabular-nums", letterSpacing: "0.3em" }}
      />
      {resent ? (
        <Notice tone="ok" className="mt-4">
          {resent}
        </Notice>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
        <Button tone="quiet" onClick={() => void resend()} disabled={busy}>
          Send a new code
        </Button>
        <Button tone="quiet" onClick={onStartOver} disabled={busy}>
          Use a different email
        </Button>
      </div>
    </form>
  );
}

function NameStep({ takeFocus, onNamed }: { takeFocus: boolean; onNamed: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length < 2) {
      setError("Write the name your clients know you by.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onNamed(trimmed);
    } catch (caught) {
      setError(explain(caught, "We couldn’t tell whether your name was saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Field
        ref={takeFocus ? focusOnMount : undefined}
        id="login-name"
        label="Your name"
        autoComplete="name"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
        hint="Your full name, as you’d sign a letter. You can change it later."
      />
      <Button type="submit" busy={busy} className="mt-6">
        Save and continue
      </Button>
    </form>
  );
}

/** `returned` and an explicit name step mean the person moved here from another step, so focus follows them. */
type Stage = { step: "email"; returned?: boolean } | { step: "code"; email: string } | { step: "name" };

const HEADINGS = {
  email: { title: "Sign in", lede: "We’ll email you a six-digit code. There is no password to remember." },
  name: {
    title: "What should deeds call you?",
    lede: "This name is written into every deed you draw up or accept, so use the one your clients know you by.",
  },
};

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14";

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const oauthError = params.get("error_description");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const me = useMe();
  const [stage, setStage] = useState<Stage>({ step: "email" });

  if (me.isPending) {
    return (
      <>
        <title>Sign in · Vaada</title>
        <Waiting />
      </>
    );
  }
  if (me.isError && !me.data) {
    return (
      <div className={PAGE}>
        <title>Sign in · Vaada</title>
        <PageHeader kicker="Your account" title="Sign in" />
        <Notice tone="error">{explain(me.error, "We couldn’t check whether you’re already signed in.")}</Notice>
        <Button tone="plain" className="mt-4" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const signedIn = me.data ?? null;
  if (signedIn?.display_name && stage.step !== "name") return <Navigate to={next} replace />;
  const current: Stage = signedIn && !signedIn.display_name ? { step: "name" } : stage;

  async function afterSignIn() {
    // A real sign-in should win over a dev persona left in this browser.
    setPersonaSession(null);
    const person = await api.get<Me>("/me");
    queryClient.setQueryData(["me"], person);
    if (person.display_name) navigate(next, { replace: true });
    else setStage({ step: "name" });
  }

  async function saveName(displayName: string) {
    await api.patch<{ display_name: string }>("/me", { display_name: displayName });
    queryClient.setQueryData<Me | null>(["me"], (old) => (old ? { ...old, display_name: displayName } : old));
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate(next, { replace: true });
  }

  const heading =
    current.step === "code"
      ? {
          title: "Check your email",
          lede: `We’ve sent a six-digit code to ${current.email}. It can take a minute to arrive; look in spam if it doesn’t.`,
        }
      : HEADINGS[current.step];

  return (
    <div className={PAGE}>
      <title>{`${current.step === "name" ? "Your name" : heading.title} · Vaada`}</title>
      <PageHeader kicker={current.step === "name" ? "One last thing" : "Your account"} title={heading.title} lede={heading.lede} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,36rem)_minmax(0,19rem)] lg:gap-16">
        <div>
          {oauthError && current.step === "email" ? (
            <Notice tone="error" className="mb-6">
              Google sign-in didn’t finish. Try again, or use your email instead.
            </Notice>
          ) : null}
          <Slip>
            {current.step === "email" ? (
              <EmailStep
                next={next}
                googleEnabled={config?.google_signin_enabled ?? false}
                takeFocus={current.returned ?? false}
                onSent={(email) => setStage({ step: "code", email })}
              />
            ) : current.step === "code" ? (
              <CodeStep email={current.email} onSignedIn={afterSignIn} onStartOver={() => setStage({ step: "email", returned: true })} />
            ) : (
              <NameStep takeFocus={stage.step === "name"} onNamed={saveName} />
            )}
          </Slip>
        </div>
        {current.step === "name" ? null : (
          <aside aria-label="About signing in" className="border-t hairline pt-6 lg:border-t-0 lg:border-l lg:pt-1 lg:pl-6">
            <ul className="m-0 list-none space-y-4 p-0 text-note text-ink-soft">
              <li>Each code works once. If you sign in on another device, we send a new one.</li>
              <li>New here? The same code opens your account. Nothing is drawn up or charged until you choose to.</li>
              {config?.persona_switcher ? (
                <li>
                  This is a {config.demo ? "demo" : "development"} copy of Vaada. The Personas slip in the bottom corner signs you in as one
                  of the sample people without any email.
                </li>
              ) : null}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
