/**
 * Hand-maintained festival dates for this year and next. Lunar festivals move every year and
 * regional calendars disagree by a day, so anything read from this table is always "inferred"
 * and the margin says so. A person checks these each January (see DECISIONS.md).
 */
export interface Festival {
  name: string;
  words: readonly string[];
  dates: readonly string[];
}

export const FESTIVALS: readonly Festival[] = [
  { name: "Diwali", words: ["diwali", "deepavali", "divali", "दिवाली", "दीवाली"], dates: ["2026-11-08", "2027-10-29"] },
  { name: "Holi", words: ["holi", "होली"], dates: ["2027-03-22"] },
  {
    name: "Eid",
    words: ["eid", "ईद", "eid ul fitr", "eid-ul-fitr", "ramzan eid", "meethi eid"],
    dates: ["2027-03-10"],
  },
  { name: "Bakrid", words: ["bakrid", "bakri eid", "eid ul adha", "eid-ul-adha", "बकरीद"], dates: ["2027-05-17"] },
  { name: "Christmas", words: ["christmas", "xmas", "क्रिसमस"], dates: ["2026-12-25", "2027-12-25"] },
];

export function findFestival(text: string): Festival | undefined {
  let best: { festival: Festival; length: number } | undefined;
  for (const festival of FESTIVALS) {
    for (const word of festival.words) {
      const pattern = /\p{Script=Devanagari}/u.test(word)
        ? new RegExp(`(?:^|\\s)${word}(?:$|\\s)`)
        : new RegExp(`\\b${word.replace(/-/g, "[- ]")}\\b`);
      if (pattern.test(text) && (!best || word.length > best.length)) best = { festival, length: word.length };
    }
  }
  return best?.festival;
}
