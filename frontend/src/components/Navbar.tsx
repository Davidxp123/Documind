'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, User, LogOut, ChevronDown } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const isWorkspace = pathname.startsWith('/workspace');

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setOpen(false);
    await signOut();
    router.push('/');
  };

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
          
          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/workspace"
                    className="liquid-glass-strong px-4 py-2 rounded-full text-white hover:bg-white/15 transition-all text-xs font-medium"
                  >
                    Launch Workspace
                  </Link>

                  {/* Account Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setUserMenuOpen((prev) => !prev)}
                      className="flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full text-xs text-white transition-all"
                    >
                      <div className="w-5 h-5 rounded-full bg-purple-500/30 flex items-center justify-center text-[10px] text-purple-200">
                        <User className="w-3 h-3" />
                      </div>
                      <span className="max-w-[120px] truncate">{user.email?.split('@')[0] || 'Account'}</span>
                      <ChevronDown className="w-3 h-3 text-white/50" />
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl p-2 shadow-2xl z-50">
                        <div className="px-3 py-2 border-b border-white/10 text-[11px] text-white/60 truncate">
                          {user.email}
                        </div>
                        <button
                          onClick={handleSignOut}
                          className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-white/10 hover:text-red-200 rounded-lg transition-colors text-left font-medium"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Log out</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    href="/login"
                    className="hover:text-white transition-colors text-sm font-medium"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/workspace"
                    className="liquid-glass-strong px-4 py-2 rounded-full text-white hover:bg-white/15 transition-all text-xs font-medium"
                  >
                    Launch
                  </Link>
                </div>
              )}
            </>
          )}
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
            
            {user ? (
              <div className="px-6 py-4 space-y-3">
                <div className="text-xs text-white/60 truncate">{user.email}</div>
                <Link
                  href="/workspace"
                  className="liquid-glass-strong block text-center rounded-full px-6 py-3 text-sm text-white"
                  onClick={() => setOpen(false)}
                >
                  Launch Workspace
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full text-center text-xs text-red-300 hover:text-red-200 py-2 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 space-y-3">
                <Link
                  href="/login"
                  className="block text-center rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  href="/workspace"
                  className="liquid-glass-strong block text-center rounded-full px-6 py-3 text-sm text-white"
                  onClick={() => setOpen(false)}
                >
                  Launch Workspace
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
