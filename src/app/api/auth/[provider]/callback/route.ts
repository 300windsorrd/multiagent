import { NextRequest, NextResponse } from 'next/server'
import { OAuthProviderManager } from '@/lib/oauth-providers'
import { AuthLogger } from '@/lib/auth-logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', { provider, error })
      await AuthLogger.logError('', `OAuth error for ${provider}: ${error}`, 'oauth_callback', { provider, error })
      
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/auth/signin?error=${encodeURIComponent(error)}`
      )
    }

    if (!code || !state) {
      const errorMessage = 'Missing required OAuth parameters'
      console.error(errorMessage, { provider, code: !!code, state: !!state })
      await AuthLogger.logError('', errorMessage, 'oauth_callback', { provider, hasCode: !!code, hasState: !!state })
      
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/auth/signin?error=${encodeURIComponent(errorMessage)}`
      )
    }

    // Validate state parameter to prevent CSRF
    // In a real implementation, you would store and validate the state
    // For now, we'll proceed with the callback

    // Exchange authorization code for tokens
    const oauthManager = OAuthProviderManager.getInstance()
    const tokenResponse = await oauthManager.exchangeCodeForToken(provider, code)

    if (!tokenResponse) {
      console.error('OAuth callback failed: Token exchange failed')
      await AuthLogger.logError('', `OAuth callback failed for ${provider}: Token exchange failed`, 'oauth_callback', { provider })
      
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/auth/signin?error=${encodeURIComponent('Authentication failed')}`
      )
    }

    // Get user info using the access token
    const userInfo = await oauthManager.getUserInfo(provider, tokenResponse.access_token)

    if (!userInfo) {
      console.error('OAuth callback failed: Failed to get user info')
      await AuthLogger.logError('', `OAuth callback failed for ${provider}: Failed to get user info`, 'oauth_callback', { provider })
      
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/auth/signin?error=${encodeURIComponent('Failed to get user information')}`
      )
    }

    // Log successful authentication
    // Note: In a real implementation, you would create a user session here
    // For now, we'll just log the authentication and redirect
    console.log('OAuth callback successful', { provider, userId: userInfo.id, email: userInfo.email })
    await AuthLogger.logLogin(userInfo.id, '', request.headers.get('user-agent') || undefined, {
      provider,
      method: 'oauth'
    })

    // Create session or redirect with success
    // In a real implementation, you would create a session here
    // For now, we'll redirect with a success message
    
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?auth=success&provider=${provider}&userId=${userInfo.id}`
    )

  } catch (error) {
    console.error('OAuth callback error:', error)
    await AuthLogger.logError('', `OAuth callback error for ${params.provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_callback', { 
      provider: params.provider,
      error: error instanceof Error ? error.message : String(error)
    })
    
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/auth/signin?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}