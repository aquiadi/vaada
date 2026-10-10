import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, useState } from "react";
import { ApiError } from "../lib/api";
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

/** Every money action passes through here: say what will happen, then let the person decide. */
export function ConfirmDialog({ trigger, title, effect, confirmLabel, tone = "primary", onConfirm, children, confirmDisabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't go through. Nothing has changed; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)]" />
        <Dialog.Content className="sheet grain fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sm p-6 focus:outline-none">
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
