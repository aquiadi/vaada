import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { frameGeometry, ringPaths } from "./guilloche";

interface Props {
  deedNo?: number | null;
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
export function DeedSheet({ deedNo, children, compact = false, className = "" }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const narrow = compact || w < 560;
  const band = narrow ? 11 : 18;
  const inset = narrow ? 8 : 14;
  const panelWidth = narrow ? 220 : 300;
  const geometry = useMemo(
    () => (w > 0 && h > 0 ? frameGeometry(w, h, { band, inset, panelWidth }) : null),
    [w, h, band, inset, panelWidth],
  );
  const rings = useMemo(
    () => (geometry?.panel ? ringPaths(w / 2, geometry.panel.y + geometry.panel.h / 2, geometry.panel.w / 2 - 8, geometry.panel.h / 2 - 3) : []),
    [geometry, w],
  );
  const pad = inset + band + (narrow ? 14 : 34);

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
      {geometry?.panel && (
        <div
          className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center justify-center text-center"
          style={{ top: geometry.panel.y, width: geometry.panel.w, height: geometry.panel.h }}
        >
          <span className="label" style={{ color: "var(--stamp)", letterSpacing: "0.22em" }}>
            Vaada · <span className="deva normal-case tracking-normal">वादा</span>
          </span>
          <span className="figures font-display text-ink" style={{ fontSize: narrow ? 15 : 19, letterSpacing: "0.08em" }}>
            DEED No. {deedNumber(deedNo)}
          </span>
        </div>
      )}
      <div className="relative" style={{ padding: `${pad + (narrow ? 26 : 34)}px ${pad}px ${pad}px` }}>
        {children}
      </div>
    </div>
  );
}

function rect(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x, y: r.y, width: Math.max(r.w, 0), height: Math.max(r.h, 0) };
}

function shrink(r: { x: number; y: number; w: number; h: number }, by: number) {
  return { x: r.x + by, y: r.y + by, w: r.w - 2 * by, h: r.h - 2 * by };
}
