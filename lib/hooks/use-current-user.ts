"use client"

import useSWR from "swr"

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => (res.ok ? res.json() : null))

/**
 * Shared client-side cache for the logged-in user (`GET /api/auth/me`).
 *
 * Several layout-level components (sidebar, main content shell, domain
 * switcher, trial banner) all mount together on every authenticated page
 * and each used to fire its own `/api/auth/me` request. Using the same SWR
 * key here means those simultaneous mounts share one in-flight request and
 * one cached result instead of hitting the endpoint 3-4x per page load.
 */
export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR<any>("/api/auth/me", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  return { user: data ?? null, loading: isLoading, error, refresh: mutate }
}
