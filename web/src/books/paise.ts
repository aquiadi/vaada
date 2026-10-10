export type ParsedRupees = { ok: true; paise: number } | { ok: false; message: string };

const CURRENCY = /^(₹|rs\.?|inr)\s*/i;
const RUPEES = /^(\d+(?:,\d+)*)(?:\.(\d*))?$/;

/**
 * Rupees as typed on the desk, "5000" or "₹5,000.50", into integer paise. The digits are read as strings
 * and combined as integers, because a float would turn 5000.10 into 500009.99… paise.
 */
export function parseRupees(text: string): ParsedRupees {
  const typed = text.trim().replace(CURRENCY, "").replace(/\s+/g, "");
  if (!typed) return { ok: false, message: "Write the amount in rupees, like 5000 or 5,000.50." };
  const match = RUPEES.exec(typed);
  if (!match) return { ok: false, message: "Use only digits, commas and one decimal point, like 5,000.50." };
  const whole = match[1]!.replace(/,/g, "");
  const fraction = match[2] ?? "";
  if (fraction.length > 2) return { ok: false, message: "Paise go to two places at most, like 5,000.50." };
  const rupees = Number(whole);
  const paise = rupees * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return { ok: false, message: "That amount is too large to be right. Check the zeros." };
  return { ok: true, paise };
}
