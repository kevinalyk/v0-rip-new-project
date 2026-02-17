"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Settings,
  Users,
  LogOut,
  Moon,
  Sun,
  UserCog,
  Shield,
  BarChart3,
  Lightbulb,
  CreditCard,
  Wrench,
  Building2,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Inbox,
  Building,
  Star,
} from "lucide-react"
import { Logo } from "@/components/logo"
import { useTheme } from "next-themes"
import { Separator } from "@/components/ui/separator"
import { useDomain } from "@/lib/domain-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Client {
  id: string
  name: string
  slug: string
}

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  isAdminView?: boolean
}

export function Sidebar({ collapsed, setCollapsed, isAdminView = false }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { domains, selectedDomain, setSelectedDomain, loading: domainsLoading } = useDomain()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [selectedClientSlug, setSelectedClientSlug] = useState<string>("")

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ci: false,
    inbox: false,
    admin: false,
    account: false,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })
        if (response.ok) {
          const user = await response.json()
          setUserRole(user.role)
        }
      } catch (error) {
        console.error("Error fetching user role:", error)
      }
    }
    fetchUserRole()
  }, [])

  useEffect(() => {
    const fetchClients = async () => {
      if (userRole !== "super_admin") return

      setLoadingClients(true)
      try {
        const response = await fetch("/api/clients", {
          credentials: "include",
        })
        if (response.ok) {
          const data = await response.json()
          setClients(data)
        }
      } catch (error) {
        console.error("Error fetching clients:", error)
      } finally {
        setLoadingClients(false)
      }
    }
    fetchClients()
  }, [userRole])

  useEffect(() => {
    const pathParts = pathname.split("/").filter(Boolean)
    if (pathParts.length > 0 && pathParts[0] !== "admin") {
      setSelectedClientSlug(pathParts[0])
    } else if (pathParts[0] === "admin") {
      setSelectedClientSlug("admin")
    }
  }, [pathname])

  // Auto-select RIP for super_admins on initial load
  useEffect(() => {
    if (userRole === "super_admin" && clients.length > 0 && !selectedClientSlug) {
      const ripClient = clients.find((client) => client.slug === "rip")
      if (ripClient) {
        setSelectedClientSlug("rip")
        // If we're not already on a client path, navigate to RIP's CI campaigns
        const pathParts = pathname.split("/").filter(Boolean)
        if (pathParts.length === 0 || pathParts[0] === "admin") {
          router.push("/rip/ci/campaigns")
        }
      }
    }
  }, [userRole, clients, selectedClientSlug, pathname, router])

  useEffect(() => {
    if (pathname.includes("/account/")) {
      setExpandedSections((prev) => ({ ...prev, account: true }))
    } else if (pathname.includes("/ci/")) {
      setExpandedSections((prev) => ({ ...prev, ci: true }))
    } else if (pathname.includes("/inbox/")) {
      setExpandedSections((prev) => ({ ...prev, inbox: true }))
    } else if (pathname.includes("/admin/")) {
      setExpandedSections((prev) => ({ ...prev, admin: true }))
    }
  }, [pathname])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      })
      router.push("/login")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const getClientSlug = () => {
    if (selectedClientSlug && selectedClientSlug !== "admin") {
      return selectedClientSlug
    }
    return isAdminView ? "admin" : selectedDomain?.client?.slug || "admin"
  }

  const navigate = (path: string) => {
    router.push(path)
  }

  const handleClientSwitch = (newClientSlug: string) => {
    const pathParts = pathname.split("/").filter(Boolean)

    // Preserve all admin paths when switching clients
    if (pathParts[0] === "admin") {
      // Preserve the path after /admin (e.g., /admin/inbox/campaigns -> /newClient/inbox/campaigns)
      const restOfPath = pathParts.slice(1).join("/")
      if (restOfPath) {
        router.push(`/${newClientSlug}/${restOfPath}`)
      } else {
        router.push(`/${newClientSlug}/ci/campaigns`)
      }
      return
    }

    // For regular client routes, just replace the clientSlug
    if (pathParts.length > 0) {
      pathParts[0] = newClientSlug
      const newPath = `/${pathParts.join("/")}`
      router.push(newPath)
    } else {
      router.push(`/${newClientSlug}/ci/campaigns`)
    }
  }

  return (
    <div
      className={cn(
        "fixed left-0 top-0 h-full bg-background border-r border-border transition-all duration-300 ease-in-out flex flex-col z-50",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex flex-col flex-grow">
        <div className="p-4 flex justify-between items-center">
          <div className="flex-1 flex justify-center">
            <Logo collapsed={collapsed} variant="icon" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
        </div>

        {userRole === "super_admin" && !collapsed && (
          <div className="px-4 mb-2">
            <Select value={selectedClientSlug} onValueChange={handleClientSwitch} disabled={loadingClients}>
              <SelectTrigger className="w-full bg-transparent">
                <div className="flex items-center gap-2">
                  <Building size={16} />
                  <SelectValue placeholder={loadingClients ? "Loading clients..." : "Select Client"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.slug}>
                    {client.name}
                  </SelectItem>
                ))}
                {clients.length === 0 && !loadingClients && (
                  <SelectItem value="none" disabled>
                    No clients available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex-1 py-4 overflow-y-auto">
          <nav className="space-y-1 px-2">
            <NavSection
              icon={<Lightbulb size={20} />}
              label="Competitive Intelligence"
              collapsed={collapsed}
              expanded={expandedSections.ci}
              onToggle={() => toggleSection("ci")}
            />
            {expandedSections.ci && !collapsed && (
              <div className="ml-4 space-y-1">
                <NavItem
                  icon={<LayoutDashboard size={18} />}
                  label="Feed"
                  active={pathname.includes("/ci/campaigns")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/campaigns`)}
                />
                <NavItem
                  icon={<Star size={18} />}
                  label="Following"
                  active={pathname.includes("/ci/subscriptions")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/subscriptions`)}
                />
                <NavItem
                  icon={<Mail size={18} />}
                  label="Personal"
                  active={pathname.includes("/ci/personal")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/personal`)}
                />
                <NavItem
                  icon={<Building2 size={18} />}
                  label="Directory"
                  active={pathname.includes("/ci/directory")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/directory`)}
                />
                <NavItem
                  icon={<BarChart3 size={18} />}
                  label="Reporting"
                  active={pathname.includes("/ci/reporting")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/reporting`)}
                />
              </div>
            )}

            {userRole === "super_admin" && (selectedClientSlug === "rip" || !selectedClientSlug) && (
              <>
                <NavSection
                  icon={<Inbox size={20} />}
                  label="Inbox Tools"
                  collapsed={collapsed}
                  expanded={expandedSections.inbox}
                  onToggle={() => toggleSection("inbox")}
                />
                {expandedSections.inbox && !collapsed && (
                  <div className="ml-4 space-y-1">
                    <NavItem
                      icon={<LayoutDashboard size={18} />}
                      label="Campaigns"
                      active={pathname.includes("/inbox/campaigns")}
                      collapsed={false}
                      onClick={() => navigate(`/${getClientSlug()}/inbox/campaigns`)}
                    />
                    <NavItem
                      icon={<BarChart3 size={18} />}
                      label="Reporting"
                      active={pathname.includes("/inbox/reporting")}
                      collapsed={false}
                      onClick={() => navigate(`/${getClientSlug()}/inbox/reporting`)}
                    />
                    <NavItem
                      icon={<Mail size={18} />}
                      label="Seed List"
                      active={pathname.includes("/inbox/seed-list")}
                      collapsed={false}
                      onClick={() => navigate(`/${getClientSlug()}/inbox/seed-list`)}
                    />
                  </div>
                )}
              </>
            )}

            {userRole === "super_admin" && (selectedClientSlug === "rip" || !selectedClientSlug) && (
              <>
                <NavSection
                  icon={<Shield size={20} />}
                  label="Admin"
                  collapsed={collapsed}
                  expanded={expandedSections.admin}
                  onToggle={() => toggleSection("admin")}
                />
                {expandedSections.admin && !collapsed && (
                  <div className="ml-4 space-y-1">
                    <NavItem
                      icon={<Settings size={18} />}
                      label="Admin Tools"
                      active={pathname === "/admin/tools"}
                      collapsed={false}
                      onClick={() => navigate("/admin/tools")}
                    />
                    <NavItem
                      icon={<Building2 size={18} />}
                      label="CI Entities"
                      active={pathname === "/admin/ci-entities"}
                      collapsed={false}
                      onClick={() => navigate("/admin/ci-entities")}
                    />
                    <NavItem
                      icon={<Shield size={18} />}
                      label="Blocked Domains"
                      active={pathname === "/admin/blocked-domains"}
                      collapsed={false}
                      onClick={() => navigate("/admin/blocked-domains")}
                    />
                  </div>
                )}
              </>
            )}

            <NavSection
              icon={<UserCog size={20} />}
              label="Account"
              collapsed={collapsed}
              expanded={expandedSections.account}
              onToggle={() => toggleSection("account")}
            />
            {expandedSections.account && !collapsed && (
              <div className="ml-4 space-y-1">
                <NavItem
                  icon={<Settings size={18} />}
                  label="Settings"
                  active={pathname.includes("/account/settings")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/settings`)}
                />
                <NavItem
                  icon={<Users size={18} />}
                  label="Users"
                  active={pathname.includes("/account/users")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/users`)}
                />
                <NavItem
                  icon={<CreditCard size={18} />}
                  label="Billing"
                  active={pathname.includes("/account/billing")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/billing`)}
                />
              </div>
            )}
          </nav>
        </div>
      </div>

      <div className="p-4 mt-auto">
        <Separator className="mb-4" />
        <div className="space-y-2">
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start gap-3 px-3", collapsed && "justify-center")}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start gap-3 px-3 text-rip-red hover:text-rip-red/90 hover:bg-rip-red/10",
              collapsed && "justify-center",
            )}
            onClick={handleLogout}
          >
            <LogOut size={20} />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface NavSectionProps {
  icon: React.ReactNode
  label: string
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
}

function NavSection({ icon, label, collapsed, expanded, onToggle }: NavSectionProps) {
  return (
    <Button
      variant="ghost"
      className={cn("w-full justify-start gap-3 px-3 font-medium", collapsed && "justify-center")}
      onClick={onToggle}
    >
      {icon}
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </>
      )}
    </Button>
  )
}

interface NavItemProps {
  icon: React.ReactNode
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function NavItem({ icon, label, active, collapsed, onClick }: NavItemProps) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "w-full justify-start gap-3 px-3",
        active && "bg-[#dc2a28]/10 hover:bg-[#dc2a28]/20 text-[#dc2a28]",
        collapsed && "justify-center",
      )}
      onClick={onClick}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Button>
  )
}
