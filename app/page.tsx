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
      fontFamily: 'Georgia, serif'
    }}>
      <style>{`
        .landing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .landing-left {
          padding: 6rem 3rem;
          border-right: 1px solid rgba(14,14,13,0.12);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .landing-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4rem 3rem;
        }
        .landing-h1 {
          font-size: 3.5rem;
        }
        @media (max-width: 768px) {
          .landing-grid {
            grid-template-columns: 1fr;
          }
          .landing-left {
            padding: 3rem 1.5rem;
            border-right: none;
            border-bottom: 1px solid rgba(14,14,13,0.12);
          }
          .landing-right {
            padding: 2.5rem 1.5rem;
          }
          .landing-h1 {
            font-size: 2.2rem;
          }
        }
      `}</style>

      <div className="landing-grid">
        <div className="landing-left">
          <div>
            <p style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#0f6e56', marginBottom: '2.5rem' }}>
              — Independent Certification Infrastructure
            </p>
            <h1 className="landing-h1" style={{ fontWeight: 400, lineHeight: 1.12, color: '#0e0e0d' }}>
              Measuring what<br />
              <em style={{ color: '#0f6e56' }}>actually</em> changed<br />
              on the grid.
            </h1>
            <p style={{ marginTop: '2.5rem', fontSize: '0.9rem', lineHeight: 1.7, color: '#4a4a44', maxWidth: '38ch', fontFamily: 'sans-serif', fontWeight: 300 }}>
              PicoVera provides verifiable CO₂ impact measurement for grid flexibility assets — BESS, EV fleets, and demand response — built for CSRD disclosure and institutional trust.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', paddingTop: '4rem', flexWrap: 'wrap' }}>
            <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>dMRV</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>Methodology</p></div>
            <div style={{ width: 1, height: 40, background: 'rgba(14,14,13,0.12)' }} />
            <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>ISO</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>14064 Aligned</p></div>
            <div style={{ width: 1, height: 40, background: 'rgba(14,14,13,0.12)' }} />
            <div><p style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>CSRD</p><p style={{ fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8a82' }}>Ready</p></div>
          </div>
        </div>
        <div className="landing-right">
          <PasswordForm />
        </div>
      </div>
    </main>
  )
}
