import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, useRef, useState } from "react";
import { explain } from "../lib/errors";
import { Button, Notice } from "./ui";

interface Props {
  trigger: ReactNode;
  title: string;
  /** The exact effect, in one or two plain sentences, shown before anything happens. */
  effect: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<unknown>;
  children?: ReactNode;
  confirmDisabled?: boolean;
}

const FAILED = "That didn't go through. Reload the page to see where things stand, then try again.";

function ancestorsOf(element: HTMLElement | null): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) chain.push(node);
  return chain;
}

/**
 * A confirmed action often removes its own button (a released milestone has nothing left to approve), so focus
 * goes to the nearest section of the page that outlived it; otherwise a keyboard user would land on the body.
 */
function focusSurvivor(ancestors: HTMLElement[]): void {
  const target = ancestors.find((element) => element.isConnected && element.matches("article, section, main"));
  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
}

/** Every money action passes through here: say what will happen, then let the person decide. */
export function ConfirmDialog({ trigger, title, effect, confirmLabel, tone = "primary", onConfirm, children, confirmDisabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerAncestors = useRef<HTMLElement[]>([]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(explain(caught, FAILED));
    } finally {
      setBusy(false);
    }
  }

  function changeOpen(next: boolean) {
    if (busy) return;
    if (next) {
      setError(null);
      triggerAncestors.current = ancestorsOf(triggerRef.current);
    }
    setOpen(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild ref={triggerRef}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)]" />
        <Dialog.Content
          className="sheet grain fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sm p-6 focus:outline-none"
          onCloseAutoFocus={(event) => {
            if (triggerRef.current?.isConnected) return;
            event.preventDefault();
            focusSurvivor(triggerAncestors.current);
          }}
        >
          <Dialog.Title className="font-display text-h3 text-ink">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-3 border-y border-gold py-3 text-body text-ink">{effect}</div>
          </Dialog.Description>
          {children ? <div className="mt-4">{children}</div> : null}
          {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button tone="quiet" disabled={busy}>
                Not now
              </Button>
            </Dialog.Close>
            <Button tone={tone} busy={busy} onClick={confirm} disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
