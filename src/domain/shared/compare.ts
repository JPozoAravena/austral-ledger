/** Locale-independent ordering by UTF-16 code units, the same on every host (unlike localeCompare). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
