import { OAuthProvider, TokenType } from "@prisma/client"
import { db } from "./db"
import { AuthLogger } from "./auth-logger"

export interface OAuthProviderConfig {
  clientId: string
  clientSecret: string
  scopes: string[]
  redirectUri: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

export interface OAuthUserInfo {
  id: string
  email: string
  name: string
  picture?: string
  [key: string]: any
}

export class OAuthProviderManager {
  private static instance: OAuthProviderManager
  private providerConfigs: Map<string, OAuthProviderConfig> = new Map()

  private constructor() {
    this.initializeProviderConfigs()
  }

  static getInstance(): OAuthProviderManager {
    if (!OAuthProviderManager.instance) {
      OAuthProviderManager.instance = new OAuthProviderManager()
    }
    return OAuthProviderManager.instance
  }

  private initializeProviderConfigs() {
    // Google OAuth configuration
    this.providerConfigs.set('google', {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'],
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/google/callback`,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
    })

    // Microsoft OAuth configuration
    this.providerConfigs.set('microsoft', {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      scopes: ['openid', 'email', 'profile', 'Mail.Read', 'Calendars.Read'],
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/microsoft/callback`,
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me'
    })

    // GitHub OAuth configuration
    this.providerConfigs.set('github', {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      scopes: ['user:email', 'read:user'],
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/github/callback`,
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user'
    })

    // Slack OAuth configuration
    this.providerConfigs.set('slack', {
      clientId: process.env.SLACK_CLIENT_ID || '',
      clientSecret: process.env.SLACK_CLIENT_SECRET || '',
      scopes: ['users:read', 'users:email'],
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/slack/callback`,
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      userInfoUrl: 'https://slack.com/api/users.info'
    })

    // Discord OAuth configuration
    this.providerConfigs.set('discord', {
      clientId: process.env.DISCORD_CLIENT_ID || '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
      scopes: ['identify', 'email'],
      redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/discord/callback`,
      authorizationUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      userInfoUrl: 'https://discord.com/api/users/@me'
    })
  }

  getProviderConfig(provider: string): OAuthProviderConfig | null {
    return this.providerConfigs.get(provider) || null
  }

  getAuthorizationUrl(provider: string, state: string): string | null {
    const config = this.getProviderConfig(provider)
    if (!config) return null

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state
    })

    return `${config.authorizationUrl}?${params.toString()}`
  }

  async exchangeCodeForToken(provider: string, code: string): Promise<OAuthTokenResponse | null> {
    const config = this.getProviderConfig(provider)
    if (!config) return null

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri
        })
      })

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Token exchange error', { provider, error })
      await AuthLogger.logError('', `Token exchange error for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      return null
    }
  }

  async refreshAccessToken(provider: string, refreshToken: string): Promise<OAuthTokenResponse | null> {
    const config = this.getProviderConfig(provider)
    if (!config) return null

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret
        })
      })

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Token refresh error', { provider, error })
      await AuthLogger.logError('', `Token refresh error for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      return null
    }
  }

  async getUserInfo(provider: string, accessToken: string): Promise<OAuthUserInfo | null> {
    const config = this.getProviderConfig(provider)
    if (!config) return null

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }

      // Special handling for Slack which requires user ID
      if (provider === 'slack') {
        const userResponse = await fetch('https://slack.com/api/auth.test', { headers })
        const userData = await userResponse.json()
        if (userData.ok) {
          const userInfoResponse = await fetch(`${config.userInfoUrl}?user=${userData.user_id}`, { headers })
          const userInfoData = await userInfoResponse.json()
          return userInfoData.user
        }
        return null
      }

      const response = await fetch(config.userInfoUrl, { headers })
      if (!response.ok) {
        throw new Error(`User info fetch failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('User info fetch error', { provider, error })
      await AuthLogger.logError('', `User info fetch error for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      return null
    }
  }

  async saveOAuthToken(
    userId: string,
    provider: OAuthProvider,
    tokenResponse: OAuthTokenResponse,
    userInfo: OAuthUserInfo
  ): Promise<void> {
    try {
      const expiresAt = tokenResponse.expires_in 
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null

      await db.oAuthToken.create({
        data: {
          userId,
          provider,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenType: tokenResponse.token_type as TokenType,
          expiresAt,
          scope: tokenResponse.scope,
          metadata: {
            userInfo: JSON.parse(JSON.stringify(userInfo)),
            tokenType: tokenResponse.token_type
          }
        }
      })

      console.log('OAuth token saved', { userId, provider })
      await AuthLogger.logOAuthConnect(userId, provider, [])
    } catch (error) {
      console.error('Failed to save OAuth token', { userId, provider, error })
      await AuthLogger.logError(userId, `Failed to save OAuth token for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      throw error
    }
  }

  async getOAuthToken(userId: string, provider: OAuthProvider): Promise<OAuthTokenResponse | null> {
    try {
      const token = await db.oAuthToken.findFirst({
        where: {
          userId,
          provider,
          expiresAt: {
            gte: new Date()
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (!token) {
        // Try to refresh the token
        const expiredToken = await db.oAuthToken.findFirst({
          where: {
            userId,
            provider
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

        if (expiredToken?.refreshToken) {
          const newTokenResponse = await this.refreshAccessToken(provider, expiredToken.refreshToken)
          if (newTokenResponse) {
            const userInfo = await this.getUserInfo(provider, newTokenResponse.access_token)
            if (userInfo) {
              await this.saveOAuthToken(userId, provider, newTokenResponse, userInfo)
              return newTokenResponse
            }
          }
        }
        return null
      }

      return {
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        token_type: token.tokenType,
        expires_in: token.expiresAt ? Math.floor((token.expiresAt.getTime() - Date.now()) / 1000) : undefined,
        scope: token.scope || undefined
      }
    } catch (error) {
      console.error('Failed to get OAuth token', { userId, provider, error })
      await AuthLogger.logError(userId, `Failed to get OAuth token for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      return null
    }
  }

  async revokeOAuthToken(userId: string, provider: OAuthProvider): Promise<boolean> {
    try {
      await db.oAuthToken.deleteMany({
        where: {
          userId,
          provider
        }
      })

      console.log('OAuth token revoked', { userId, provider })
      await AuthLogger.logOAuthDisconnect(userId, provider)
      return true
    } catch (error) {
      console.error('Failed to revoke OAuth token', { userId, provider, error })
      await AuthLogger.logError(userId, `Failed to revoke OAuth token for ${provider}: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider })
      return false
    }
  }

  async getUserProviders(userId: string): Promise<OAuthProvider[]> {
    try {
      const tokens = await db.oAuthToken.findMany({
        where: {
          userId,
          expiresAt: {
            gte: new Date()
          }
        },
        select: {
          provider: true
        }
      })

      return tokens.map(token => token.provider)
    } catch (error) {
      console.error('Failed to get user providers', { userId, error })
      await AuthLogger.logError(userId, `Failed to get user providers: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token')
      return []
    }
  }
}

export const oauthProviderManager = OAuthProviderManager.getInstance()