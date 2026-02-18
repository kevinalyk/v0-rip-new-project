"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { toast } from "sonner"
import { usePathname } from "next/navigation"

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

  useEffect(() => {
    async function fetchDomains() {
      try {
        setLoading(true)

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

        const userResponse = await fetch("/api/auth/me", { credentials: "include" })

        // If user is not authenticated (401), silently skip fetching domains
        if (userResponse.status === 401) {
          setLoading(false)
          return
        }

        if (!userResponse.ok) {
          throw new Error("Failed to fetch user data")
        }

        const userData = await userResponse.json()

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

        const userIsAdmin = userData.role === "super_admin"
        setIsAdmin(userIsAdmin)

        const domainsWithAll =
          domainsData.length > 0
            ? [{ id: "all", name: "All Campaigns", domain: "all", role: userData.role }, ...domainsData]
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
  }, [pathname]) // Re-fetch when pathname changes (client switch)

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
