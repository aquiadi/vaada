import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, ButtonLink, Field, Notice } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useMe } from "../lib/session";
import type { Room } from "../lib/types";
import { email as normalizeEmail } from "../normalize";
import { DraftNotSaved } from "./useAutosave";

function firstName(name: string | null | undefined): string {
  return (name ?? "").split(/\s+/)[0] ?? "";
}

export function whatsappLink(room: Room, link: string): string {
  const client = firstName(room.client.name);
  const maker = firstName(room.maker.name);
  const work = room.agreement?.work.description ?? room.title;
  const text =
    `${client ? `Hello ${client}, h` : "H"}ere's the deed for ${work}, as we discussed: ${link}\n` +
    `You can read it, accept it and pay through Razorpay there. The money is held until the work is approved.` +
    (maker ? `\n${maker}` : "");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function deedLink(slug: string): string {
  return `${window.location.origin}/a/${slug}`;
}

export function SentPanel({ room }: { room: Room }) {
  const link = deedLink(room.slug);
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="sent-heading" className="mt-8 border-t-2 border-double border-gold pt-6">
      <h2 id="sent-heading" className="font-display text-h3 text-ink">
        Sent to {room.client.email_masked ?? "your client"}.
      </h2>
      <p className="measure mt-2 text-body text-ink-soft">
        Its terms are frozen now. Most deals like this started on WhatsApp, so you may want to send the link there too.
      </p>
      <p className="mt-3 break-all font-mono text-ui text-ink">{link}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={whatsappLink(room, link)} target="_blank" rel="noreferrer" className="smallcaps inline-flex min-h-10 items-center rounded-sm border border-ink bg-ink px-4 py-2 text-ui text-paper no-underline">
          Share on WhatsApp
        </a>
        <Button
          tone="plain"
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => setCopied(true))
              .catch((error: unknown) => console.warn("clipboard unavailable", error))
          }
        >
          {copied ? "Copied" : "Copy the link"}
        </Button>
        <ButtonLink to={`/d/${room.id}`} tone="quiet">
          Open the deal room
        </ButtonLink>
      </div>
    </section>
  );
}

interface Props {
  dealId: string;
  saveFirst(): Promise<void>;
  onProblems(problems: Record<string, string>): void;
  onSent(room: Room): void;
  ready: boolean;
}

export function SendPanel({ dealId, saveFirst, onProblems, onSent, ready }: Props) {
  const { data: me } = useMe();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payoutsReady = me?.payout?.status === "activated";
  const queries = useQueryClient();

  // Payout status comes from the cached /me; while Razorpay is still activating the account, look again every few
  // seconds so Send opens the moment it's ready.
  useEffect(() => {
    if (payoutsReady) return;
    void queries.invalidateQueries({ queryKey: ["me"] });
    const timer = window.setInterval(() => void queries.invalidateQueries({ queryKey: ["me"] }), 5_000);
    return () => window.clearInterval(timer);
  }, [payoutsReady, queries]);

  async function send() {
    setError(null);
    const checked = normalizeEmail(address);
    if (checked.confidence === "failed" || typeof checked.value !== "string") {
      setError(checked.note ?? "Add the client's email address.");
      return;
    }
    setBusy(true);
    try {
      await saveFirst();
      const room = await api.post<Room>(`/deals/${dealId}/publish`, { client_email: checked.value });
      onSent(room);
    } catch (caught) {
      if (caught instanceof ApiError && caught.problems.length) {
        onProblems(Object.fromEntries(caught.problems.map((p) => [p.blank, p.message])));
        setError(`${caught.message} They're marked in the margin.`);
      } else if (caught instanceof DraftNotSaved) {
        setError("Your latest changes haven't saved, so nothing was sent. Check your connection and try again.");
      } else {
        setError(caught instanceof ApiError ? caught.message : "That didn't go out. Nothing was sent; try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="send-heading" className="mt-8 border-t-2 border-double border-gold pt-6">
      <h2 id="send-heading" className="font-display text-h3 text-ink">
        Send to client
      </h2>
      {!payoutsReady ? (
        <Notice className="mt-3">
          Before this deed can go out, Razorpay has to activate your payout account, so the money has somewhere to go.{" "}
          <Link to="/payouts">Set up payouts</Link>.
        </Notice>
      ) : null}
      <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Client's email"
          type="email"
          autoComplete="off"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          hint="They get a link to read the deed, accept it and pay."
        />
        <Button onClick={() => void send()} busy={busy} disabled={!payoutsReady}>
          Send the deed
        </Button>
      </div>
      {!ready ? <p className="mt-3 text-note italic text-ink-soft">Blanks still to fill are noted in the margin.</p> : null}
      {error ? (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      ) : null}
    </section>
  );
}
