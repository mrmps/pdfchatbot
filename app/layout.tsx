import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ThemeProvider } from "@/components/theme-provider"
import PlausibleProvider from "next-plausible"

export const metadata: Metadata = {
  title: 'PDF Chat',
  description: 'Chat with your PDF documents using AI',
  icons: [
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      url: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      url: '/favicon-16x16.png',
    },
    {
      rel: 'apple-touch-icon',
      sizes: '180x180',
      url: '/apple-touch-icon.png',
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
          <PlausibleProvider domain="pdfgpt.dev">
            <div vaul-drawer-wrapper="" className="bg-background">
              <main className="min-h-screen bg-background">{children}</main>
            </div>
          </PlausibleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
