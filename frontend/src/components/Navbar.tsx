'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-40 py-4 bg-transparent">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl font-heading italic text-white/90" onClick={() => setOpen(false)}>
          DocuMind
        </Link>

        {/* Desktop nav — hidden below md */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
          <Link href="/product" className="hover:text-white transition-colors">Product</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
          <Link href="/workspace/demo" className="liquid-glass-strong px-4 py-2 rounded-full text-white">
            Launch
          </Link>
        </nav>

        {/* Hamburger — visible below md */}
        <button
          id="hamburger-toggle"
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-white/80 hover:text-white transition-colors"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay — glass-morphic dropdown */}
      {open && (
        <div
          id="mobile-menu"
          className="md:hidden absolute top-full left-0 right-0 z-50 mx-4 mt-2 rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden"
        >
          <nav className="flex flex-col divide-y divide-white/10">
            <Link
              href="/product"
              className="px-6 py-4 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setOpen(false)}
            >
              Product
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-4 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="px-6 py-4 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setOpen(false)}
            >
              About
            </Link>
            <div className="px-6 py-4">
              <Link
                href="/workspace/demo"
                className="liquid-glass-strong block text-center rounded-full px-6 py-3 text-sm text-white"
                onClick={() => setOpen(false)}
              >
                Launch Workspace
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
