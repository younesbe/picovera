import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PasswordForm } from './components/PasswordForm'

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
        <PasswordForm />
      </div>
    </main>
  )
}
