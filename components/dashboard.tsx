"use client"

import { useState } from "react"
import Image from "next/image"
import { Menu, X } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { MainContent } from "@/components/main-content"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"

interface DashboardProps {
  clientSlug?: string
  isAdminView?: boolean
}

export function Dashboard({ clientSlug, isAdminView = false }: DashboardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState("campaigns")
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile via root className */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminView={isAdminView}
        className="hidden md:flex"
      />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <Sidebar
        collapsed={false}
        setCollapsed={() => {}}
        activeTab={activeTab}
        setActiveTab={(t) => {
          setActiveTab(t)
          setMobileOpen(false)
        }}
        isAdminView={isAdminView}
        onNavigate={() => setMobileOpen(false)}
        className={`md:hidden transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-30">
          <Logo collapsed={false} variant="icon" />
          <div className="flex-1 flex items-center justify-center min-w-0">
            <Image
              src="/images/rip-wordmark.png"
              alt="Republican Inboxing Protocol"
              width={420}
              height={84}
              priority
              className="h-8 w-auto max-w-full object-contain"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>
        </header>

        <MainContent collapsed={collapsed} activeTab={activeTab} clientSlug={clientSlug} isAdminView={isAdminView} />
      </div>
    </div>
  )
}
