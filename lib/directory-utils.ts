// Pure utility functions for the directory — no server-only dependencies.
// Safe to import in both client and server components.

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}
