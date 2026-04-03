import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = formData.get('password')

  if (password === process.env.DEMO_PASSWORD) {
    const response = NextResponse.redirect(new URL('/demo', request.url))
    response.cookies.set('demo_auth', 'true', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7
    })
    return response
  }

  return NextResponse.redirect(new URL('/?error=1', request.url))
}
