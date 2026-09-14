/** Value of a key that must be present, with an explicit error instead of a non-null assertion. */
export function getOrThrow<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${what} for ${String(key)}`);
  }
  return value;
}
