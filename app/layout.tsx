import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"
import { DomainProvider } from "@/lib/domain-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"),
  title: "Inbox.GOP",
  description: "Inbox.GOP — A tool dedicated to helping Republicans and conservatives inbox effectively.",
  icons: {
    icon: "/favicon.ico",
  },
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5715074898343065"
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <DomainProvider>
            {children}
            <Toaster />
          </DomainProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
