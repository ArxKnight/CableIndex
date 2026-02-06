export function normalizeUsername(username: string): string {
  return String(username ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}
