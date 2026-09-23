"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { toast } from "sonner"
import { usePathname } from "next/navigation"
import { useCurrentUser } from "@/lib/hooks/use-current-user"

type Domain = {
  id: string
  name: string
  domain: string
  role?: string
}

type DomainContextType = {
  domains: Domain[]
  selectedDomain: Domain | null
  setSelectedDomain: (domain: Domain) => void
  loading: boolean
  isAdmin: boolean
}

const DomainContext = createContext<DomainContextType | undefined>(undefined)

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const pathname = usePathname()
  // Shared with sidebar/main-content/trial-banner via a common SWR key, so this
  // provider's mount doesn't add its own extra /api/auth/me request on top of theirs.
  const { user, loading: userLoading } = useCurrentUser()

  useEffect(() => {
    async function fetchDomains() {
      // Wait for the shared user fetch to settle before deciding whether to fetch domains
      if (userLoading) return

      try {
        setLoading(true)

        // If user is not authenticated, silently skip fetching domains
        if (!user) {
          setLoading(false)
          return
        }

        // Special routes to exclude: /login, /reset-password, /debug
        const specialRoutes = ["/login", "/reset-password", "/debug", "/"]
        let clientSlug: string | null = null

        if (pathname && !specialRoutes.includes(pathname)) {
          // Extract first segment after /
          const segments = pathname.split("/").filter(Boolean)
          if (segments.length > 0) {
            clientSlug = segments[0]
          }
        }

        // Fetch domains
        const domainsUrl = clientSlug ? `/api/domains?clientSlug=${clientSlug}` : "/api/domains"

        const domainsResponse = await fetch(domainsUrl, { credentials: "include" })

        if (domainsResponse.status === 401) {
          setLoading(false)
          return
        }

        if (!domainsResponse.ok) {
          throw new Error("Failed to fetch domains")
        }

        const domainsData = await domainsResponse.json()

        const userIsAdmin = user.role === "super_admin"
        setIsAdmin(userIsAdmin)

        const domainsWithAll =
          domainsData.length > 0
            ? [{ id: "all", name: "All Campaigns", domain: "all", role: user.role }, ...domainsData]
            : domainsData

        setDomains(domainsWithAll)

        // Set the selected domain from localStorage or use the first domain
        const savedDomainId = localStorage.getItem("selectedDomainId")
        if (savedDomainId) {
          const savedDomain = domainsWithAll.find((d: Domain) => d.id === savedDomainId)
          if (savedDomain) {
            setSelectedDomain(savedDomain)
          } else if (domainsWithAll.length > 0) {
            setSelectedDomain(domainsWithAll[0])
            localStorage.setItem("selectedDomainId", domainsWithAll[0].id)
          }
        } else if (domainsWithAll.length > 0) {
          setSelectedDomain(domainsWithAll[0])
          localStorage.setItem("selectedDomainId", domainsWithAll[0].id)
        }
      } catch (error) {
        console.error("Error fetching domains:", error)
        toast.error("Failed to fetch domains")
      } finally {
        setLoading(false)
      }
    }

    fetchDomains()
    // Re-fetch when pathname changes (client switch) or once the shared user fetch settles
  }, [pathname, userLoading, !!user, user?.role])

  const handleSetSelectedDomain = (domain: Domain) => {
    setSelectedDomain(domain)
    localStorage.setItem("selectedDomainId", domain.id)
  }

  return (
    <DomainContext.Provider
      value={{
        domains,
        selectedDomain,
        setSelectedDomain: handleSetSelectedDomain,
        loading,
        isAdmin,
      }}
    >
      {children}
    </DomainContext.Provider>
  )
}

export function useDomain() {
  const context = useContext(DomainContext)
  if (context === undefined) {
    throw new Error("useDomain must be used within a DomainProvider")
  }
  return context
}
