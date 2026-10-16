import { Dispatch, SetStateAction, useCallback, useState } from "react";

/**
 * Drop-in replacement for useState whose value is cached in a module-level store keyed
 * by `key`, so it survives the component unmounting and remounting (e.g. leaving a tab
 * and coming back). The cache lives for the app session; it is not persisted to disk.
 */
const store = new Map<string, unknown>();

export function usePersistentState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    store.has(key) ? (store.get(key) as T) : typeof initial === "function" ? (initial as () => T)() : initial,
  );
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (update) =>
      setValue((prev) => {
        const next = typeof update === "function" ? (update as (p: T) => T)(prev) : update;
        store.set(key, next);
        return next;
      }),
    [key],
  );
  return [value, set];
}

/** Forget every cached value whose key starts with `prefix` (e.g. to reset one screen). */
export function clearPersistentState(prefix: string): void {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
