/**
 * Generates a UUID v4 string with a fallback for non-HTTPS environments
 * where `crypto.randomUUID()` may be unavailable.
 */
export function generateId(prefix = 'node'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36).slice(-4);
  return `${prefix}_${timePart}${randomPart}`;
}
