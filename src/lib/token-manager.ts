import { db } from "./db"
import { OAuthProvider, TokenType } from ".prisma/client"

export interface TokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string
  provider: OAuthProvider
}

export class TokenManager {
  static async storeToken(
    userId: string,
    tokenData: TokenData,
    metadata?: Record<string, any>
  ) {
    try {
      // Check if token already exists for this user and provider
      const existingToken = await db.oAuthToken.findFirst({
        where: {
          userId,
          provider: tokenData.provider,
          tokenType: TokenType.ACCESS,
        },
      })

      if (existingToken) {
        // Update existing token
        return await db.oAuthToken.update({
          where: { id: existingToken.id },
          data: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            scope: tokenData.scope,
            metadata: {
              ...existingToken.metadata,
              ...metadata,
              updatedAt: new Date().toISOString(),
            },
          },
        })
      } else {
        // Create new token
        return await db.oAuthToken.create({
          data: {
            userId,
            provider: tokenData.provider,
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            tokenType: TokenType.ACCESS,
            expiresAt: tokenData.expiresAt,
            scope: tokenData.scope,
            metadata: metadata || {},
          },
        })
      }
    } catch (error) {
      console.error("Error storing token:", error)
      throw new Error("Failed to store token")
    }
  }

  static async getToken(userId: string, provider: OAuthProvider): Promise<TokenData | null> {
    try {
      const token = await db.oAuthToken.findFirst({
        where: {
          userId,
          provider,
          tokenType: TokenType.ACCESS,
          isActive: true,
        },
      })

      if (!token) {
        return null
      }

      // Check if token is expired
      if (token.expiresAt && new Date() > token.expiresAt) {
        // Try to refresh the token
        const refreshedToken = await this.refreshToken(userId, provider)
        return refreshedToken
      }

      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken || undefined,
        expiresAt: token.expiresAt || undefined,
        scope: token.scope || undefined,
        provider: token.provider,
      }
    } catch (error) {
      console.error("Error getting token:", error)
      return null
    }
  }

  static async refreshToken(userId: string, provider: OAuthProvider): Promise<TokenData | null> {
    try {
      const token = await db.oAuthToken.findFirst({
        where: {
          userId,
          provider,
          tokenType: TokenType.ACCESS,
        },
      })

      if (!token || !token.refreshToken) {
        return null
      }

      // Provider-specific refresh logic
      let newTokenData: TokenData | null = null

      switch (provider) {
        case OAuthProvider.GOOGLE:
          newTokenData = await this.refreshGoogleToken(token.refreshToken)
          break
        case OAuthProvider.MICROSOFT:
          newTokenData = await this.refreshMicrosoftToken(token.refreshToken)
          break
        case OAuthProvider.GITHUB:
          newTokenData = await this.refreshGitHubToken(token.refreshToken)
          break
        case OAuthProvider.SLACK:
          newTokenData = await this.refreshSlackToken(token.refreshToken)
          break
        case OAuthProvider.DISCORD:
          newTokenData = await this.refreshDiscordToken(token.refreshToken)
          break
        default:
          console.warn(`Token refresh not implemented for provider: ${provider}`)
          return null
      }

      if (newTokenData) {
        await this.storeToken(userId, newTokenData)
        return newTokenData
      }

      return null
    } catch (error) {
      console.error("Error refreshing token:", error)
      return null
    }
  }

  static async revokeToken(userId: string, provider: OAuthProvider): Promise<boolean> {
    try {
      const token = await db.oAuthToken.findFirst({
        where: {
          userId,
          provider,
          tokenType: TokenType.ACCESS,
        },
      })

      if (!token) {
        return true
      }

      // Provider-specific revoke logic
      switch (provider) {
        case OAuthProvider.GOOGLE:
          await this.revokeGoogleToken(token.accessToken)
          break
        case OAuthProvider.MICROSOFT:
          await this.revokeMicrosoftToken(token.accessToken)
          break
        case OAuthProvider.GITHUB:
          await this.revokeGitHubToken(token.accessToken)
          break
        case OAuthProvider.SLACK:
          await this.revokeSlackToken(token.accessToken)
          break
        case OAuthProvider.DISCORD:
          await this.revokeDiscordToken(token.accessToken)
          break
        default:
          console.warn(`Token revoke not implemented for provider: ${provider}`)
      }

      // Mark token as inactive in database
      await db.oAuthToken.update({
        where: { id: token.id },
        data: { isActive: false },
      })

      return true
    } catch (error) {
      console.error("Error revoking token:", error)
      return false
    }
  }

  static async getUserProviders(userId: string): Promise<OAuthProvider[]> {
    try {
      const tokens = await db.oAuthToken.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          provider: true,
        },
      })

      return tokens.map(token => token.provider)
    } catch (error) {
      console.error("Error getting user providers:", error)
      return []
    }
  }

  // Provider-specific token refresh methods
  private static async refreshGoogleToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      })

      if (!response.ok) {
        throw new Error(`Google token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        provider: OAuthProvider.GOOGLE,
      }
    } catch (error) {
      console.error("Error refreshing Google token:", error)
      return null
    }
  }

  private static async refreshMicrosoftToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: "Mail.Read Calendar.Read Files.Read",
        }),
      })

      if (!response.ok) {
        throw new Error(`Microsoft token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        provider: OAuthProvider.MICROSOFT,
      }
    } catch (error) {
      console.error("Error refreshing Microsoft token:", error)
      return null
    }
  }

  private static async refreshGitHubToken(refreshToken: string): Promise<TokenData | null> {
    // GitHub tokens don't typically expire, but we'll implement this for completeness
    return null
  }

  private static async refreshSlackToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID!,
          client_secret: process.env.SLACK_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      })

      if (!response.ok) {
        throw new Error(`Slack token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`)
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        provider: OAuthProvider.SLACK,
      }
    } catch (error) {
      console.error("Error refreshing Slack token:", error)
      return null
    }
  }

  private static async refreshDiscordToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      })

      if (!response.ok) {
        throw new Error(`Discord token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        provider: OAuthProvider.DISCORD,
      }
    } catch (error) {
      console.error("Error refreshing Discord token:", error)
      return null
    }
  }

  // Provider-specific token revoke methods
  private static async revokeGoogleToken(accessToken: string): Promise<void> {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: accessToken,
        }),
      })
    } catch (error) {
      console.error("Error revoking Google token:", error)
    }
  }

  private static async revokeMicrosoftToken(accessToken: string): Promise<void> {
    // Microsoft doesn't provide a simple revoke endpoint
    // Token will expire naturally
  }

  private static async revokeGitHubToken(accessToken: string): Promise<void> {
    try {
      await fetch("https://api.github.com/applications/{client_id}/token", {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: JSON.stringify({
          access_token: accessToken,
        }),
      })
    } catch (error) {
      console.error("Error revoking GitHub token:", error)
    }
  }

  private static async revokeSlackToken(accessToken: string): Promise<void> {
    try {
      await fetch("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch (error) {
      console.error("Error revoking Slack token:", error)
    }
  }

  private static async revokeDiscordToken(accessToken: string): Promise<void> {
    try {
      await fetch("https://discord.com/api/oauth2/token/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
        }),
      })
    } catch (error) {
      console.error("Error revoking Discord token:", error)
    }
  }
}