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
        url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-NfWjmrBARpThJtdxGKQnSXfC9a1fps.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inbox.GOP Directory",
    description: "Search and explore political candidates tracked by Inbox.GOP",
    images: ["https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-NfWjmrBARpThJtdxGKQnSXfC9a1fps.png"],
  },
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
