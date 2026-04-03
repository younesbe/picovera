'use client'

import Link from 'next/link'

export function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-surface-border bg-surface-base/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-pv-green flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
            </svg>
          </div>
          <span className="font-display text-base tracking-tight text-zinc-100">
            Pico<span className="text-pv-green">Vera</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-500">
          <Link href="#demo" className="hover:text-zinc-200 transition-colors">Demo</Link>
          <Link href="#methodology" className="hover:text-zinc-200 transition-colors">Methodology</Link>
          <Link href="#contact" className="hover:text-zinc-200 transition-colors">Contact</Link>
        </nav>

        <a
          href="mailto:contact@picovera.com"
          className="btn-primary text-xs px-4 py-2"
        >
          Request pilot
        </a>
      </div>
    </header>
  )
}
