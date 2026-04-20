import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Adgro Hair Velachery - AI Hair Analysis',
  description: 'Get instant AI-powered hair analysis at Adgro Hair Velachery with expert-guided treatments, FDA-approved equipment, and trusted support across Tamil Nadu.',
  generator: 'v0.app',
  icons: {
    icon: '/logo-1.png',
    apple: '/logo-1.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="font-outfit antialiased">
  
        {children}
        <Analytics />
      </body>
    </html>
  )
}
