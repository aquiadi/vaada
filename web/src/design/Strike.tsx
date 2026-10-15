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
/**
 * One rect per line: an inline element can report several fragments on the same line. Client rects are in screen
 * pixels, so a deed shown scaled down (the home page's plate) is measured back in its own layout pixels.
 */
function lineSegments(rects: DOMRect[], base: DOMRect, scale: number): Segment[] {
  const lines: Segment[] = [];
  for (const screenRect of rects) {
    const rect = {
      left: (screenRect.left - base.left) / scale,
      top: (screenRect.top - base.top) / scale,
      width: screenRect.width / scale,
      height: screenRect.height / scale,
    };
    if (rect.width < 1) continue;
    const line = lines.find((l) => Math.abs(l.top - rect.top) < 2);
    if (line) {
      const right = Math.max(line.left + line.width, rect.left + rect.width);
      line.left = Math.min(line.left, rect.left);
      line.width = right - line.left;
    } else {
      lines.push(rect);
    }
  }
  return lines;
}

function sameSegments(a: Segment[], b: Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => ["left", "top", "width", "height"].every((k) => Math.abs(s[k as keyof Segment] - b[i]![k as keyof Segment]) < 0.5));
}

/**
 * Struck words stay on the page with a pen stroke through each line of them, ending where the words end, the
 * way you'd strike a clause on paper. The stroke is ink, never red. The strokes are measured from the screen's line
 * boxes, so print hides them and strikes `.struck-words` with a text line that follows the reflowed text.
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
      const box = element.parentElement;
      const scale = box && box.offsetWidth > 0 ? box.getBoundingClientRect().width / box.offsetWidth : 1;
      if (scale < 0.01) return;
      const next = lineSegments([...element.getClientRects()], anchor.getBoundingClientRect(), scale);
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
    <span ref={words} className="struck-words relative text-ink-soft">
      <span ref={origin} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-0 w-0" />
      <span className="sr-only">Struck out: </span>
      {children}
      {segments.map((segment, i) => (
        <svg
          key={i}
          aria-hidden="true"
          className={`strike-strokes pointer-events-none absolute overflow-visible ${animate ? "strike-draw" : ""}`}
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
