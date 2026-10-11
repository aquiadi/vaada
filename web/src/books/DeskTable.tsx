import { type ReactNode, useId } from "react";
import { SectionMark } from "../components/ui";

export const CELL = "border-b hairline py-2 pr-3 align-top text-left";
export const FIGURE_CELL = "border-b hairline py-2 pr-3 align-top text-right figures whitespace-nowrap";

interface Column {
  label: string;
  figures?: boolean;
}

/** One part of the desk: a numbered heading, then the table, or a plain line when there is nothing to do. */
export function DeskSection({
  n,
  id,
  title,
  count,
  nothing,
  notice,
  children,
}: {
  n: number;
  id: string;
  title: string;
  count: number;
  nothing: string;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8 first:mt-0">
      <SectionMark n={n} id={id} title={count ? `${title} (${count})` : title} />
      {notice}
      {count ? children : <p className="m-0 text-note italic text-ink-soft">{nothing}</p>}
    </section>
  );
}

/**
 * A dense table that scrolls inside its own frame on a phone, so the page itself never does. The explanation sits above
 * the frame, where a narrow screen can wrap it, and names the scrolling region.
 */
export function DeskTable({ caption, columns, children }: { caption: string; columns: Column[]; children: ReactNode }) {
  const captionId = useId();
  return (
    <>
      <p id={captionId} className="m-0 pb-2 text-note italic text-ink-soft">
        {caption}
      </p>
      <div role="region" aria-labelledby={captionId} tabIndex={0} className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-note text-ink">
          <thead>
            <tr className="border-b border-ink">
              {columns.map((column) => (
                <th key={column.label} scope="col" className={`label pb-1.5 pr-3 align-bottom font-medium ${column.figures ? "text-right" : "text-left"}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}
