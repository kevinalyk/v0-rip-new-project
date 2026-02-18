"use client"

import type React from "react"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"

interface AppLayoutProps {
  children: React.ReactNode
  clientSlug?: string
  isAdminView?: boolean
}

function AppLayout({ children, clientSlug, isAdminView = false }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} clientSlug={clientSlug} isAdminView={isAdminView} />
      <main className={`flex-1 overflow-auto transition-all duration-300 ${collapsed ? "pl-16" : "pl-64"}`}>
        {children}
      </main>
    </div>
  )
}

export default AppLayout
export { AppLayout }
