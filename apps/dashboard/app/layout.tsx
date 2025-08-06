import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Navigation from '@/components/Navigation'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Rusty Butter Dashboard',
  description: 'Multi-agent system control dashboard',
}

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0d1117] text-[#e6edf3] antialiased`}>
        <Navigation />
        {children}
      </body>
    </html>
  )
}