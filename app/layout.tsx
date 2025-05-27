import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ThemeProvider } from "@/components/theme-provider"
import { Analytics } from "@vercel/analytics/react"

export const metadata: Metadata = {
  title: 'PDF Chat',
  description: 'Chat with your PDF documents using AI',
  icons: [
    {
      rel: 'icon',
      url: '/icon.ico',
    },
    {
      rel: 'shortcut icon',
      url: '/icon.ico',
    },
    {
      rel: 'apple-touch-icon',
      url: '/icon.ico',
    },
  ],
  openGraph: {
    title: 'PDF Chat',
    description: 'Chat with your PDF documents using AI',
    type: 'website',
    url: 'https://pdfgpt.dev',
    images: [
      {
        url: 'https://pdfgpt.dev/api/og',
        width: 1200,
        height: 630,
        alt: 'PDF Chat - Talk to your documents using AI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PDF Chat',
    description: 'Chat with your PDF documents using AI',
    images: ['https://pdfgpt.dev/api/og'],
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
          <div vaul-drawer-wrapper="" className="bg-background">
            <main className="min-h-screen bg-background">{children}</main>
          </div>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
