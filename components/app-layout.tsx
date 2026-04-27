"use client"

import type React from "react"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"

interface AppLayoutProps {
  children: React.ReactNode
  clientSlug?: string
  isAdminView?: boolean
  defaultCollapsed?: boolean
}

function AppLayout({ children, clientSlug, isAdminView = false, defaultCollapsed = false }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* ── Desktop sidebar — hidden on mobile ─────────────────────── */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} clientSlug={clientSlug} isAdminView={isAdminView} />
      </div>

      {/* ── Mobile overlay drawer ───────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed top-0 left-0 h-full z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          collapsed={false}
          setCollapsed={() => {}}
          clientSlug={clientSlug}
          isAdminView={isAdminView}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      {/* ── Main content area ───────────────────────────────────────── */}
      <div
        className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300 md:${collapsed ? "pl-16" : "pl-64"}`}
      >
        {/* Mobile top bar */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-30">
          <Logo collapsed={false} variant="icon" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default AppLayout
export { AppLayout }
