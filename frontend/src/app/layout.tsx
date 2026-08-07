import './globals.css';
import BackgroundVideo from '@/components/Background/BackgroundVideo';
import Link from 'next/link';

export const metadata = {
  title: 'DocuMind – Enterprise RAG Workspace',
  description: 'DocuMind is a professional RAG workspace for document intelligence and AI-assisted workflows.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="relative text-white min-h-screen overflow-x-hidden">
        <BackgroundVideo />
        <header className="relative z-40 py-4 bg-transparent">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <Link href="/" className="text-xl font-heading italic text-white/90">
              DocuMind
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
              <Link href="/product" className="hover:text-white transition-colors">Product</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
              <Link href="/workspace/demo" className="liquid-glass-strong px-4 py-2 rounded-full">Launch</Link>
            </nav>
          </div>
        </header>

        <main className="min-h-screen relative z-20 pb-12">
          <div className="max-w-7xl mx-auto px-6">{children}</div>
        </main>
      </body>
    </html>
  )
}
