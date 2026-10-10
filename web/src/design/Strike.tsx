import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface Segment {
  left: number;
  top: number;
  width: number;
  height: number;
}

function seeded(key: string): () => number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** An uneven stroke across a 100 x 10 box, a little below the middle where lowercase letters sit. */
function strokePath(random: () => number): string {
  let x = random() * 1.2;
  let drift = (random() - 0.5) * 0.6;
  const points = [`M${x.toFixed(1)} ${(5.8 + drift).toFixed(2)}`];
  while (x < 100) {
    x += 6 + random() * 6;
    drift = Math.max(-0.7, Math.min(0.7, drift + (random() - 0.5) * 0.4));
    points.push(`L${Math.min(x, 100).toFixed(1)} ${(5.8 + drift).toFixed(2)}`);
  }
  return points.join(" ");
}

/** One rect per line: an inline element can report several fragments on the same line. */
function lineSegments(rects: DOMRect[], base: DOMRect): Segment[] {
  const lines: Segment[] = [];
  for (const rect of rects) {
    if (rect.width < 1) continue;
    const top = rect.top - base.top;
    const line = lines.find((l) => Math.abs(l.top - top) < 2);
    if (line) {
      const right = Math.max(line.left + line.width, rect.right - base.left);
      line.left = Math.min(line.left, rect.left - base.left);
      line.width = right - line.left;
    } else {
      lines.push({ left: rect.left - base.left, top, width: rect.width, height: rect.height });
    }
  }
  return lines;
}

function sameSegments(a: Segment[], b: Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => ["left", "top", "width", "height"].every((k) => Math.abs(s[k as keyof Segment] - b[i]![k as keyof Segment]) < 0.5));
}

/**
 * Struck words stay on the page with a pen stroke through each line of them, ending where the words end, the
 * way you'd strike a clause on paper. The stroke is ink, never red.
 */
export function Struck({ seed, animate = false, children }: { seed: string; animate?: boolean; children: ReactNode }) {
  const words = useRef<HTMLSpanElement>(null);
  const origin = useRef<HTMLSpanElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]);

  useLayoutEffect(() => {
    const element = words.current;
    const anchor = origin.current;
    if (!element || !anchor) return;
    const measure = () => {
      const next = lineSegments([...element.getClientRects()], anchor.getBoundingClientRect());
      setSegments((previous) => (sameSegments(previous, next) ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", measure);
    document.fonts.ready.then(measure).catch((error: unknown) => console.warn("fonts did not load", error));
    // Words before the clause on the same line can change width without the paragraph resizing.
    const mutations = new MutationObserver(measure);
    if (element.parentElement) mutations.observe(element.parentElement, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const paths = useMemo(() => {
    const random = seeded(seed);
    return segments.map(() => strokePath(random));
  }, [seed, segments]);

  return (
    <span ref={words} className="relative text-ink-soft">
      <span ref={origin} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-0 w-0" />
      <span className="sr-only">Struck out: </span>
      {children}
      {segments.map((segment, i) => (
        <svg
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute overflow-visible ${animate ? "strike-draw" : ""}`}
          style={{ left: segment.left, top: segment.top, width: segment.width, height: segment.height, animationDelay: `${i * 70}ms` }}
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
        >
          <path
            d={paths[i]}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </span>
  );
}
