export type MarketTab = "free" | "clubs" | "moves";

/** Search params reduced to one value each: the advanced market never repeats a param. */
export type SearchValues = Record<string, string | undefined>;

export function singleValues(params: Record<string, string | string[] | undefined>): SearchValues {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

/** URL of the advanced market with some params changed; an undefined or empty value removes the param. */
export function marketHref(saveId: string, values: SearchValues, changes: SearchValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...values, ...changes })) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return `/saves/${saveId}/transfers/advanced${query === "" ? "" : `?${query}`}`;
}
