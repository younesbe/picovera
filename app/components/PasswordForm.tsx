'use client'

export function PasswordForm() {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/auth', { method: 'POST', body: fd })
    if (res.ok) {
      window.location.href = '/demo'
    } else {
      window.location.href = '/?error=1'
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360 }}>
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
  )
}
