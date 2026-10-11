interface NavigatorWithData extends Navigator {
  userAgentData?: { platform?: string; mobile?: boolean };
}

/** What to tell someone about their Wispr Flow key, based on the device they're on. */
export function flowHint(): string {
  const nav = navigator as NavigatorWithData;
  const ua = nav.userAgent;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  if (nav.userAgentData?.mobile || /iPhone|iPad|iPod|Android/i.test(ua)) return "Tap the Flow mic on your keyboard";
  if (/Mac/i.test(platform)) return "Hold Fn and speak";
  if (/Win/i.test(platform)) return "Hold Ctrl+Win and speak";
  return "Hold your Flow key and speak";
}
