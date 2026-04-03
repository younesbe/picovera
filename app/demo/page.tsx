import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Demo() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('demo_auth')
  if (auth?.value !== 'true') {
    redirect('/')
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f5f3ee',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#0f6e56', marginBottom: '1rem' }}>PicoVera Platform</p>
        <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#0e0e0d', fontFamily: 'Georgia, serif' }}>Demo coming soon.</h1>
        <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8a8a82' }}>The methodology engine is being prepared.</p>
      </div>
    </main>
  )
}
