export const DEMO_ACCESS_SESSION_KEY = "fluxview-demo-access-v1";
export const DEMO_ACCESS_PASSWORD = "dialog2013";

export function hasDemoAccess() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_ACCESS_SESSION_KEY) === "granted";
}

export function grantDemoAccess() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEMO_ACCESS_SESSION_KEY, "granted");
}

export function clearDemoAccess() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DEMO_ACCESS_SESSION_KEY);
}
