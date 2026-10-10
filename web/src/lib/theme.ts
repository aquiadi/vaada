export type Theme = "system" | "light" | "dark";

const KEY = "vaada.theme";

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : "system";
}

export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch (error) {
    console.warn("theme preference not saved", error);
  }
}
