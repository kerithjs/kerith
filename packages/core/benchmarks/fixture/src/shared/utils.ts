export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseJson<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}