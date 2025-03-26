import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "PDF Chat with KDB.AI",
  description: "Chat with your PDFs using KDB.AI vector database",
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
          <div vaul-drawer-wrapper="" className="bg-background">
            <main className="min-h-screen bg-background">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

