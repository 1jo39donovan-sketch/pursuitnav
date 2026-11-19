// Which screen the app opened on this launch. Session sends the operator on
// to Search when it's what the app opened on and the shift is already set
// up; it mustn't when the app reopened on Search or Pursuit (a reload, or a
// home-screen app coming back where it was) and Session is only being
// opened now, or the first tap on Session bounces back to Search (19 Nov).
let first: string | null = null;

/** Called by the tab layout with the screen it's showing; only the first call counts. */
export function noteFirstScreen(path: string): void {
  if (first === null) first = path;
}

/** Whether this launch opened on Session (the tabs' first screen, "/"). */
export function launchedOnSession(): boolean {
  return first === null || first === "/";
}
