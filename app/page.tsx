import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('demo_auth')
  if (auth?.value === 'true') {
    redirect('/demo')
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f5f3ee',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      fontFamily: 'Georgia, serif'
    }}>
      <div style={{
        padding: '6rem 3rem',
        borderRight: '1px solid rgba(14,14,13,0.12)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <p style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#0f6e56', marginBottom: '2.5rem' }}>
            — Independent Certification Infrastructure
          </p>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 400, lineHeight: 1.12, color: '#0e0e0d' }}>
            Measuring what<br />
            <em style={{ color: '#0f6e56' }}>actually</em> changed<br />
            on the grid.
          </h1>
          <p style={{ marginTop: '2.5rem', fontSize: '0.9rem', lineHeight: 1.7, color: '#4a4a44', maxWidth: '38ch', fontFamily: 'sans-serif', fontWeight: 300 }}>
            PicoVera provides verifiable CO₂ impact measurement for grid flexibility assets — BESS, EV fleets, and demand response — built for CSRD disclosure and institutional trust.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', paddingTop: '4rem' }}>
          <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>dMRV</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>Methodology</p></div>
          <div style={{ width: 1, height: 40, background: 'rgba(14,14,13,0.12)' }} />
          <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>ISO</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>14064 Aligned</p></div>
          <div style={{ width: 1, height: 40, background: 'rgba(14,14,13,0.12)' }} />
          <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>CSRD</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>Ready</p></div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 3rem' }}>
        <form action="/api/auth" method="POST" style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a8a82', marginBottom: '2rem' }}>Secure access</p>
          <input
            type="password"
            name="password"
            placeholder="Enter access password"
            style={{ width: '100%', padding: '0.8rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid rgba(14,14,13,0.12)', background: 'rgba(255,255,255,0.6)', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' }}
          />
          <button type="submit" style={{ width: '100%', padding: '0.9rem', background: '#0e0e0d', color: '#f5f3ee', fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}>
            Access Platform →
          </button>
          <p style={{ marginTop: '1.25rem', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: '0.1em', color: '#8a8a82', textAlign: 'center', textTransform: 'uppercase' }}>
            Credentials provided by invitation only
          </p>
        </form>
      </div>
    </main>
  )
}
