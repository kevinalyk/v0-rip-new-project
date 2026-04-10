import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Inbox.GOP Directory",
  description: "Search and explore political candidates tracked by Inbox.GOP",
  openGraph: {
    title: "Inbox.GOP Directory",
    description: "Search and explore political candidates tracked by Inbox.GOP",
    type: "website",
    url: "https://app.rip-tool.com/directory",
    images: [
      {
        url: "https://app.rip-tool.com/og-candidate-directory.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inbox.GOP Directory",
    description: "Search and explore political candidates tracked by Inbox.GOP",
    images: ["https://app.rip-tool.com/og-candidate-directory.png"],
  },
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
