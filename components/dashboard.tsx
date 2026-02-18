"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { MainContent } from "@/components/main-content"

interface DashboardProps {
  clientSlug?: string
  isAdminView?: boolean
}

export function Dashboard({ clientSlug, isAdminView = false }: DashboardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState("campaigns")

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminView={isAdminView}
      />
      <MainContent collapsed={collapsed} activeTab={activeTab} clientSlug={clientSlug} isAdminView={isAdminView} />
    </div>
  )
}
