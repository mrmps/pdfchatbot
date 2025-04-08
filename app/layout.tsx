import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ThemeProvider } from "@/components/theme-provider"
import PlausibleProvider from "next-plausible"

export const metadata: Metadata = {
  title: "Free PDF Chat - Talk to Your Documents",
  description: "Chat with your PDFs for free. Upload documents and get instant answers using advanced AI technology.",
  keywords: ["pdf chat", "free pdf chat", "document chat", "ai pdf reader", "pdf assistant"],
  openGraph: {
    title: "Free PDF Chat - Talk to Your Documents",
    description: "Chat with your PDFs for free. Upload documents and get instant answers using advanced AI technology.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <PlausibleProvider domain="your-domain.com">
            <div vaul-drawer-wrapper="" className="bg-background">
              <main className="min-h-screen bg-background">{children}</main>
            </div>
          </PlausibleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
