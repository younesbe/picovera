'use client'

export function Hero() {
  return (
    <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8 opacity-0 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-pv-green animate-pulse-green" />
        <span className="section-label">GIGO v1 — now in pilot</span>
      </div>

      <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-zinc-100 leading-[1.1] tracking-tight max-w-3xl mb-6 opacity-0 animate-fade-up animate-delay-100" style={{ animationFillMode: 'forwards' }}>
        The certification layer for<br />
        <span className="text-gradient-green italic">grid flexibility</span>
      </h1>

      {/* Confirmed CTA copy */}
      <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl mb-10 opacity-0 animate-fade-up animate-delay-200" style={{ animationFillMode: 'forwards' }}>
        PicoVera certifies the net CO₂ reduction from grid flexibility assets
        using real marginal emissions data and a methodology aligned with{' '}
        <span className="text-zinc-300">GHG Protocol Scope 2</span> and{' '}
        <span className="text-zinc-300">ISO 14064</span>.
      </p>

      <div className="flex flex-wrap items-center gap-4 opacity-0 animate-fade-up animate-delay-300" style={{ animationFillMode: 'forwards' }}>
        <a href="#demo" className="btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
          Run a simulation
        </a>
        <a href="mailto:contact@picovera.com" className="btn-ghost">
          Request pilot access
        </a>
      </div>

      <div className="mt-16 pt-8 border-t border-surface-border grid grid-cols-2 md:grid-cols-4 gap-6 opacity-0 animate-fade-up animate-delay-400" style={{ animationFillMode: 'forwards' }}>
        {[
          { label: 'Methodology',       value: 'GIGO v1' },
          { label: 'Standards',         value: 'GHG Protocol · ISO 14064' },
          { label: 'Data source',       value: 'RTE eCO₂mix · ODRÉ' },
          { label: 'Verification path', value: 'Bureau Veritas · DNV' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="section-label mb-1">{label}</div>
            <div className="text-sm text-zinc-300 font-medium">{value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
