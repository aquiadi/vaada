import { formatInstantIst } from "../format/dates";
import type { Room } from "../lib/types";

/** formatInstantIst gives "12 Oct 2026, 14:03 IST"; the register sets the day and the time on separate lines. */
function dayAndTime(isoInstant: string): [string, string] {
  const formatted = formatInstantIst(isoInstant);
  const comma = formatted.lastIndexOf(", ");
  return [formatted.slice(0, comma), formatted.slice(comma + 2)];
}

/** Everything that happened on the deed, written into a hand-ruled register, oldest first. */
export function Register({ events }: { events: Room["events"] }) {
  return (
    <section id="register" aria-labelledby="register-heading" className="min-w-0 scroll-mt-6">
      <h2 id="register-heading" className="font-display text-h3 text-ink">
        The register
      </h2>
      <p className="m-0 mt-1 text-note text-ink-soft">Everything that has happened on this deed, in order.</p>
      {events.length === 0 ? (
        <p className="m-0 mt-4 text-note italic text-ink-soft">Nothing has been entered yet.</p>
      ) : (
        <ol className="m-0 mt-4 list-none border-t border-ink/40 p-0">
          {events.map((event, i) => {
            const [day, time] = dayAndTime(event.at);
            const previous = events[i - 1];
            const sameDay = previous !== undefined && dayAndTime(previous.at)[0] === day;
            return (
              <li key={`${event.at}-${event.kind}-${i}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] border-b hairline">
                <p className="figures m-0 border-r-[3px] border-double border-bahi py-2 pr-2 text-right font-ui text-micro leading-snug text-ink-soft">
                  <time dateTime={event.at}>
                    {sameDay ? (
                      <>
                        <span aria-hidden="true" className="block">
                          ″
                        </span>
                        <span className="sr-only">{day}, </span>
                      </>
                    ) : (
                      <span className="block">{day}</span>
                    )}
                    <span className="block">{time}</span>
                  </time>
                </p>
                <p className="m-0 py-2 pl-3 text-note text-ink">{event.summary}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
