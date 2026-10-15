import { useId } from "react";

interface Props {
  hash: string | null;
  caption?: string;
  size?: number;
  stamped?: boolean;
  animate?: boolean;
}

function ringText(hash: string | null): string {
  if (!hash) return "VAADA · वादा · VAADA · वादा · ";
  return `VAADA · वादा · ${hash.slice(0, 10)}…${hash.slice(-8)} · `;
}

/**
 * The notary's roundel in bahi red: "VAADA · वादा" and the deed hash set around the ring. It stamps once,
 * when Razorpay confirms the payment: a quick press and a faint spread of ink. That is the app's only
 * large animation.
 */
export function Seal({
  hash,
  caption = "Funded",
  size = 168,
  stamped = true,
  animate = false,
}: Props) {
  const id = useId().replace(/:/g, "");
  const r = 80;
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        stamped
          ? `Seal: ${caption}. Agreement hash ${hash ?? "pending"}.`
          : "Seal: not yet stamped."
      }
    >
      {stamped && (
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          aria-hidden="true"
          className={`absolute inset-0 ${animate ? "seal-spread" : ""}`}
        >
          <filter id={`bleed-${id}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves="2"
              seed="3"
            />
            <feDisplacementMap in="SourceGraphic" scale="9" />
          </filter>
          <circle
            cx="100"
            cy="100"
            r="86"
            fill="var(--bahi)"
            opacity="0.07"
            filter={`url(#bleed-${id})`}
          />
        </svg>
      )}
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className={stamped && animate ? "seal-press" : ""}
        style={{
          transform: "rotate(-4deg)",
          color: stamped
            ? "var(--bahi)"
            : "color-mix(in srgb, var(--ink) 22%, transparent)",
        }}
      >
        <defs>
          <path
            id={`ring-${id}`}
            d={`M100,100 m-${r - 9},0 a${r - 9},${r - 9} 0 1,1 ${2 * (r - 9)},0 a${r - 9},${r - 9} 0 1,1 -${2 * (r - 9)},0`}
          />
          <filter id={`ink-${id}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed="7"
            />
            <feDisplacementMap in="SourceGraphic" scale="1.6" />
          </filter>
        </defs>
        <g filter={`url(#ink-${id})`} fill="none" stroke="currentColor">
          <circle cx="100" cy="100" r={r} strokeWidth="3" />
          <circle cx="100" cy="100" r={r - 4} strokeWidth="0.8" />
          <circle cx="100" cy="100" r={r - 19} strokeWidth="1.2" />
          <circle cx="100" cy="100" r={r - 23} strokeWidth="0.6" />
          <text
            fill="currentColor"
            stroke="none"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="9.6"
            letterSpacing="1.1"
          >
            {/* Spread to the ring's full length, so the legend closes the circle the way a seal's does. */}
            <textPath
              href={`#ring-${id}`}
              startOffset="0"
              textLength={2 * Math.PI * (r - 9)}
              lengthAdjust="spacing"
            >
              {ringText(hash)}
            </textPath>
          </text>
          <text
            x="100"
            y="104"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontFamily="Tiro Devanagari Hindi, serif"
            fontSize="30"
          >
            वादा
          </text>
          {stamped ? (
            <text
              x="100"
              y="128"
              textAnchor="middle"
              fill="currentColor"
              stroke="none"
              fontFamily="Inter, sans-serif"
              fontSize="8.5"
              letterSpacing="2.2"
            >
              {caption.toUpperCase()}
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
