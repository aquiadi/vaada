import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { Link, type LinkProps } from "react-router";
import { formatRupees } from "../format/money";

type Tone = "primary" | "quiet" | "danger" | "plain";

const TONES: Record<Tone, string> = {
  primary: "bg-ink text-paper border border-ink hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--paper))]",
  plain: "bg-paper text-ink border hairline hover:border-ink",
  danger: "bg-paper text-bahi border border-bahi hover:bg-[color-mix(in_srgb,var(--bahi)_8%,var(--paper))]",
  quiet: "bg-transparent text-ink border border-transparent underline decoration-[color-mix(in_srgb,var(--ink)_35%,transparent)] hover:decoration-ink",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; busy?: boolean }>(
  function Button({ tone = "primary", busy = false, className = "", children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={`smallcaps inline-flex min-h-10 items-center justify-center gap-2 rounded-sm px-4 py-2 text-ui transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 ${TONES[tone]} ${className}`}
      >
        {busy ? <span aria-hidden="true">…</span> : null}
        {children}
      </button>
    );
  },
);

export function ButtonLink({ tone = "primary", className = "", ...rest }: LinkProps & { tone?: Tone }) {
  return (
    <Link
      {...rest}
      className={`smallcaps inline-flex min-h-10 items-center justify-center rounded-sm px-4 py-2 text-ui no-underline transition-colors duration-150 ease-out ${TONES[tone]} ${className}`}
    />
  );
}

/** Lining, tabular figures with Indian grouping: ₹1,25,000. */
export function Rupees({ paise, className = "" }: { paise: number; className?: string }) {
  return <span className={`figures whitespace-nowrap ${className}`}>{formatRupees(paise)}</span>;
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.8125rem] tracking-tight break-all ${className}`}>{children}</span>;
}

/** Something to say, beside a rule: bahi red marks an error, stamp green a success, gold a plain note. Text stays ink. */
export function Notice({ tone = "note", children, className = "" }: { tone?: "error" | "note" | "ok"; children: ReactNode; className?: string }) {
  const color = tone === "error" ? "border-bahi text-ink" : tone === "ok" ? "border-stamp text-ink" : "border-gold text-ink-soft";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`border-l-2 py-1 pl-3 text-note ${color} ${className}`}>
      {children}
    </div>
  );
}

/** A field on a paper form: label in small caps, the input as a ruled line. */
export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }>(
  function Field({ label, hint, error, className = "", id, ...rest }, ref) {
    const generated = useId();
    const inputId = id ?? generated;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <label htmlFor={inputId} className="label">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
          className={`w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 font-serif text-body text-ink outline-none transition-colors duration-150 placeholder:text-ink-soft/70 focus:border-bahi focus-visible:outline-none ${error ? "border-bahi" : "border-[color-mix(in_srgb,var(--ink)_35%,transparent)]"}`}
        />
        {error ? (
          <p id={`${inputId}-error`} className="m-0 border-l-2 border-bahi pl-2 text-note text-ink">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="m-0 text-note text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

export function SectionMark({ n, title, id }: { n: number | string; title: string; id?: string }) {
  return (
    <h2 id={id} className="mb-3 mt-8 font-serif text-[1.0625rem] font-semibold tracking-[0.02em] text-ink first:mt-0">
      <span className="mr-2 font-display text-[1.375rem] font-medium text-gold" aria-hidden="true">
        §
      </span>
      <span className="figures">{n}.</span> {title}
    </h2>
  );
}

/** A page that reads like a document: a heading set in Cormorant, a lede, then a measure of text. */
export function PageHeader({ kicker, title, lede }: { kicker?: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="mb-8">
      {kicker ? <p className="label m-0 mb-2">{kicker}</p> : null}
      <h1 className="font-display text-h2 leading-tight text-ink sm:text-h1">{title}</h1>
      {lede ? <p className="measure mt-3 text-lede text-ink-soft">{lede}</p> : null}
    </header>
  );
}

export function Waiting({ children = "One moment." }: { children?: ReactNode }) {
  return (
    <p className="py-12 text-center italic text-ink-soft" role="status">
      {children}
    </p>
  );
}

export function DoubleRule({ className = "" }: { className?: string }) {
  return <hr className={`rule-double ${className}`} />;
}
