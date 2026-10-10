import { useLayoutEffect, useRef, useState } from "react";
import { deedNumber } from "../design/DeedSheet";
import { PublishedDeed } from "../deed/PublishedDeed";
import { SAMPLE_AGREEMENT, SAMPLE_HASH } from "../deed/sample";
import type { Acceptance } from "../lib/types";

const SAMPLE_ACCEPTANCE: Acceptance = { name: "Rahul Mehta", email_masked: "r•••@kilnlabs.in", at: "2026-10-09T09:12:00Z" };

/**
 * The deed is laid out at the width it has in a deal room, margin column included, and scaled down whole, so it
 * reads as a page and not as a squeezed column.
 */
const FULL = { width: 980, shown: 700, compact: false };
const NARROW = { width: 520, shown: 560, compact: true };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A plate in a book: the head of a finished deed, framed in a mount and captioned. */
export function DeedPlate() {
  const [windowRef, width] = useWidth<HTMLDivElement>();
  const page = width >= 440 ? FULL : NARROW;
  const scale = width > 0 ? width / page.width : 0;
  return (
    <figure className="m-0">
      <div className="border hairline bg-paper-deep p-3 sm:p-5">
        <div ref={windowRef} className="overflow-hidden" style={{ height: Math.round(page.shown * scale) }}>
          {scale > 0 ? (
            <div inert style={{ width: page.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PublishedDeed
                agreement={SAMPLE_AGREEMENT}
                hash={SAMPLE_HASH}
                struck={["late_fee"]}
                accepted={SAMPLE_ACCEPTANCE}
                registry={[]}
                compact={page.compact}
              />
            </div>
          ) : null}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-note italic text-ink-soft">
        The head of Deed No. {deedNumber(SAMPLE_AGREEMENT.deed_no)}: {SAMPLE_AGREEMENT.maker.name} for{" "}
        {SAMPLE_AGREEMENT.client.organisation}, a logo and brand guidelines in two parts.
      </figcaption>
    </figure>
  );
}
