const temporaryDrafts = new Map<string, unknown>();
export const readStorage = <T>(key: string): T | undefined => {
  if (temporaryDrafts.has(key))
    return temporaryDrafts.get(key) as T | undefined;
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};
export const writeStorage = (key: string, value: unknown) => {
  try {
    if (value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
    temporaryDrafts.delete(key);
  } catch {
    // Retain drafts across reconnects even when browser storage is unavailable.
    temporaryDrafts.set(key, value);
  }
};
