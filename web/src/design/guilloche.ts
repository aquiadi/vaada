/**
 * Guilloche, generated in code: interlaced sine "ropes" along each edge of the sheet and hypotrochoid
 * rosettes at the corners, the way engraved certificates are ruled. Everything is deterministic.
 */

type Point = readonly [number, number];

function pathFrom(points: Point[], close = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const head = `M${first![0].toFixed(2)} ${first![1].toFixed(2)}`;
  return head + rest.map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`).join("") + (close ? "Z" : "");
}

/** Interlaced waves running from a to b, displaced along the edge's normal. */
function ropePaths(a: Point, b: Point, width: number, strands = 7, step = 1.6): string[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 4) return [];
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const half = width / 2;
  // Two periods that don't divide each other give the moiré of an engraved rope.
  const l1 = Math.max(10, width * 0.95);
  const l2 = l1 * 2.618;
  const out: string[] = [];
  for (let i = 0; i < strands; i++) {
    const phase = (2 * Math.PI * i) / strands;
    const points: Point[] = [];
    for (let s = 0; s <= length; s += step) {
      const d = half * (0.58 * Math.sin((2 * Math.PI * s) / l1 + phase) + 0.42 * Math.sin((2 * Math.PI * s) / l2 - phase));
      points.push([a[0] + ux * s + nx * d, a[1] + uy * s + ny * d]);
    }
    out.push(pathFrom(points));
  }
  return out;
}

/** A rosette: several hypotrochoids, each turned a little, centred on (cx, cy). */
function rosettePaths(cx: number, cy: number, radius: number, copies = 6, lobes = 9): string[] {
  const out: string[] = [];
  const R = 1;
  const r = R / lobes;
  const d = r * 2.6;
  const scale = radius / (R - r + d);
  for (let k = 0; k < copies; k++) {
    const turn = (2 * Math.PI * k) / (copies * lobes);
    const points: Point[] = [];
    const steps = 240;
    for (let j = 0; j <= steps; j++) {
      const t = (2 * Math.PI * j) / steps;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      const xr = x * Math.cos(turn) - y * Math.sin(turn);
      const yr = x * Math.sin(turn) + y * Math.cos(turn);
      points.push([cx + xr * scale, cy + yr * scale]);
    }
    out.push(pathFrom(points, true));
  }
  return out;
}

/** Concentric wavy rings, for the field behind the denomination panel. */
export function ringPaths(cx: number, cy: number, rx: number, ry: number, rings = 5, waves = 36): string[] {
  const out: string[] = [];
  for (let k = 0; k < rings; k++) {
    const f = 1 - k * 0.16;
    const points: Point[] = [];
    const steps = 360;
    for (let j = 0; j <= steps; j++) {
      const t = (2 * Math.PI * j) / steps;
      const wobble = 1 + 0.045 * Math.sin(waves * t + k * 0.9);
      points.push([cx + Math.cos(t) * rx * f * wobble, cy + Math.sin(t) * ry * f * wobble]);
    }
    out.push(pathFrom(points, true));
  }
  return out;
}

export interface FrameGeometry {
  ropes: string[];
  rosettes: string[];
  inner: { x: number; y: number; w: number; h: number };
  outer: { x: number; y: number; w: number; h: number };
  panel: { x: number; y: number; w: number; h: number } | null;
}

/**
 * The whole border for a sheet of w × h. The top edge leaves a gap for the denomination panel, which is as tall as
 * the sheet says its two lines of type need.
 */
export function frameGeometry(
  w: number,
  h: number,
  options: { band: number; inset: number; panelWidth: number; panelHeight: number },
): FrameGeometry {
  const { band, inset, panelWidth, panelHeight } = options;
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const mid = band / 2;
  const top = y0 + mid;
  const bottom = y1 - mid;
  const left = x0 + mid;
  const right = x1 - mid;
  const corner = band * 1.1;
  const panelW = Math.min(panelWidth, w - 2 * (inset + band * 3));
  const panel = panelW > 120 ? { x: (w - panelW) / 2, y: inset - 2, w: panelW, h: panelHeight } : null;

  const ropes: string[] = [];
  if (panel) {
    ropes.push(...ropePaths([left + corner, top], [panel.x - 6, top], band));
    ropes.push(...ropePaths([panel.x + panel.w + 6, top], [right - corner, top], band));
  } else {
    ropes.push(...ropePaths([left + corner, top], [right - corner, top], band));
  }
  ropes.push(...ropePaths([right, top + corner], [right, bottom - corner], band));
  ropes.push(...ropePaths([right - corner, bottom], [left + corner, bottom], band));
  ropes.push(...ropePaths([left, bottom - corner], [left, top + corner], band));

  const rosettes = [
    ...rosettePaths(left, top, corner * 0.95),
    ...rosettePaths(right, top, corner * 0.95),
    ...rosettePaths(right, bottom, corner * 0.95),
    ...rosettePaths(left, bottom, corner * 0.95),
  ];
  return {
    ropes,
    rosettes,
    outer: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    inner: { x: x0 + band, y: y0 + band, w: x1 - x0 - 2 * band, h: y1 - y0 - 2 * band },
    panel,
  };
}
