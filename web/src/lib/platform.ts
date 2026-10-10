const OVERRIDE_KEY = "vaada.flowShortcut";

interface NavigatorWithData extends Navigator {
  userAgentData?: { platform?: string; mobile?: boolean };
}

/** What to tell someone about their Wispr Flow key, based on the device they're on. */
export function flowHint(): string {
  try {
    const custom = localStorage.getItem(OVERRIDE_KEY);
    if (custom) return custom;
  } catch (error) {
    console.warn("flow shortcut preference unavailable", error);
  }
  const nav = navigator as NavigatorWithData;
  const ua = nav.userAgent;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  if (nav.userAgentData?.mobile || /iPhone|iPad|iPod|Android/i.test(ua)) return "Tap the Flow mic on your keyboard";
  if (/Mac/i.test(platform)) return "Hold Fn and speak";
  if (/Win/i.test(platform)) return "Hold Ctrl+Win and speak";
  return "Hold your Flow key and speak";
}

export function setFlowHint(text: string | null): void {
  try {
    if (text) localStorage.setItem(OVERRIDE_KEY, text);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch (error) {
    console.warn("flow shortcut preference not saved", error);
  }
}
