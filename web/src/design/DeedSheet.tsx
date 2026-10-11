import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { frameGeometry, ringPaths } from "./guilloche";

interface Props {
  deedNo?: number | null;
  /** What the panel's second line says; a deed's number unless this sheet is something else, like a certificate. */
  title?: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ w: element.offsetWidth, h: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

export function deedNumber(deedNo: number | null | undefined): string {
  return deedNo ? String(deedNo).padStart(4, "0") : "····";
}

/**
 * A sheet of deed paper: grain, an engraved guilloche border in stamp green and a small panel at the head
 * that carries Vaada's own mark and the deed number. Nothing on it imitates government stamp paper.
 */
export function DeedSheet({ deedNo, title, children, compact = false, className = "" }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [markRef, mark] = useSize<HTMLDivElement>();
  const narrow = compact || w < 560;
  const band = narrow ? 11 : 18;
  const inset = narrow ? 8 : 14;
  const panelWidth = narrow ? 220 : 300;
  // Sized from the mark itself, so a larger default font or a fallback face still sits inside the double rule.
  const panelHeight = Math.max(band * 2.6, mark.h + 2 * PANEL_CLEARANCE);
  const geometry = useMemo(
    () => (w > 0 && h > 0 ? frameGeometry(w, h, { band, inset, panelWidth, panelHeight }) : null),
    [w, h, band, inset, panelWidth, panelHeight],
  );
  const rings = useMemo(
    () => (geometry?.panel ? ringPaths(w / 2, geometry.panel.y + geometry.panel.h / 2, geometry.panel.w / 2 - 8, geometry.panel.h / 2 - 3) : []),
    [geometry, w],
  );
  const pad = inset + band + (narrow ? 14 : 34);
  const panelBottom = geometry?.panel ? geometry.panel.y + geometry.panel.h : 0;
  const top = Math.max(pad, panelBottom) + (narrow ? 20 : 34);

  return (
    <div ref={ref} className={`sheet grain relative ${className}`}>
      {geometry && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full text-stamp"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ opacity: "var(--guilloche-opacity)" }}
        >
          <g fill="none" stroke="currentColor" strokeWidth={narrow ? 0.45 : 0.55}>
            {geometry.ropes.map((d, i) => (
              <path key={`r${i}`} d={d} />
            ))}
            {geometry.rosettes.map((d, i) => (
              <path key={`o${i}`} d={d} strokeWidth={0.4} />
            ))}
          </g>
          <g fill="none" stroke="currentColor">
            <rect {...rect(geometry.outer)} strokeWidth={0.9} />
            <rect {...rect(geometry.inner)} strokeWidth={0.9} />
            <rect {...rect(shrink(geometry.inner, 3))} strokeWidth={0.4} />
          </g>
          {geometry.panel && (
            <g>
              <rect {...rect(geometry.panel)} fill="var(--paper)" stroke="currentColor" strokeWidth={0.9} />
              <rect {...rect(shrink(geometry.panel, 3))} fill="none" stroke="currentColor" strokeWidth={0.4} />
              <g fill="none" stroke="currentColor" strokeWidth={0.35} opacity={0.6}>
                {rings.map((d, i) => (
                  <path key={`p${i}`} d={d} />
                ))}
              </g>
            </g>
          )}
        </svg>
      )}
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center text-center"
        style={{
          top: geometry?.panel?.y ?? 0,
          width: geometry?.panel?.w ?? panelWidth,
          height: panelHeight,
          visibility: geometry?.panel ? "visible" : "hidden",
        }}
      >
        <div ref={markRef} className="flex flex-col items-center whitespace-nowrap">
          <span className="label leading-[1.3]" style={{ color: "var(--stamp)", letterSpacing: "0.22em" }}>
            Vaada · <span className="deva normal-case tracking-normal">वादा</span>
          </span>
          <span className="figures font-serif font-semibold leading-[1.25] text-ink" style={{ fontSize: narrow ? 14 : 16, letterSpacing: "0.12em" }}>
            {title ?? `DEED No. ${deedNumber(deedNo)}`}
          </span>
        </div>
      </div>
      <div className="relative" style={{ padding: `${top}px ${pad}px ${pad}px` }}>
        {children}
      </div>
    </div>
  );
}

/** The panel's inner rule sits 3px inside its edge; the mark keeps a little clear of it. */
const PANEL_CLEARANCE = 7;

function rect(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x, y: r.y, width: Math.max(r.w, 0), height: Math.max(r.h, 0) };
}

function shrink(r: { x: number; y: number; w: number; h: number }, by: number) {
  return { x: r.x + by, y: r.y + by, w: r.w - 2 * by, h: r.h - 2 * by };
}
