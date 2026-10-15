import { useLayoutEffect, useRef, useState } from "react";
import { deedNumber } from "../design/DeedSheet";
import { Seal } from "../design/Seal";
import { PublishedDeed } from "../deed/PublishedDeed";
import { SAMPLE_AGREEMENT, SAMPLE_HASH } from "../deed/sample";
import type { Acceptance } from "../lib/types";

const SAMPLE_ACCEPTANCE: Acceptance = { name: "Rahul Mehta", email_masked: "r•••@kilnlabs.in", at: "2026-10-09T09:12:00Z" };

/** The read deed's own width; the plate scales the whole page down from it, foot and seal included. */
const PAGE_WIDTH = 832;

function useSize<T extends HTMLElement>(read: (element: T) => number) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize(read(element));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [read]);
  return [ref, size] as const;
}

const widthOf = (element: HTMLElement) => element.clientWidth;
const heightOf = (element: HTMLElement) => element.offsetHeight;

/** A plate in a book: a whole finished deed, set small in a mount and captioned. On paper only the caption prints. */
export function DeedPlate() {
  const [windowRef, width] = useSize<HTMLDivElement>(widthOf);
  const [pageRef, height] = useSize<HTMLDivElement>(heightOf);
  // Until the mount is measured the deed lays out unscaled and hidden, so everything inside measures true from the start.
  const scale = width > 0 ? width / PAGE_WIDTH : 1;
  return (
    <figure className="m-0">
      <div className="border hairline bg-paper-deep p-3 print:hidden sm:p-5">
        <div ref={windowRef} className="overflow-hidden" style={{ height: width > 0 ? Math.round(height * scale) : 0 }}>
          <div
            ref={pageRef}
            inert
            style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left", visibility: width > 0 ? "visible" : "hidden" }}
          >
            <PublishedDeed
              agreement={SAMPLE_AGREEMENT}
              hash={SAMPLE_HASH}
              struck={["late_fee"]}
              accepted={SAMPLE_ACCEPTANCE}
              registry={[]}
              seal={<Seal hash={SAMPLE_HASH} size={140} />}
            />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-balance text-center text-note italic text-ink-soft">
        Deed No. {deedNumber(SAMPLE_AGREEMENT.deed_no)}, whole: {SAMPLE_AGREEMENT.maker.name} for {SAMPLE_AGREEMENT.client.organisation}, a
        logo and brand guidelines in two parts. Not stamped under the Indian Stamp Act.
      </figcaption>
    </figure>
  );
}
