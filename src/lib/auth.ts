import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { db } from "./db"
import GoogleProvider from "next-auth/providers/google"
import MicrosoftProvider from "next-auth/providers/azure-ad"
import GitHubProvider from "next-auth/providers/github"
import SlackProvider from "next-auth/providers/slack"
import DiscordProvider from "next-auth/providers/discord"
import { OAuthProvider, TokenType, AuditAction } from "@prisma/client"
import { OAuthProviderManager } from "./oauth-providers"
import { AuthLogger } from "./auth-logger"

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    accessToken?: string
    refreshToken?: string
    error?: string
    provider?: string
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: string
    provider?: string
    userId?: string
    user?: any
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    MicrosoftProvider({
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile Mail.Read Calendar.Read Files.Read",
          prompt: "consent",
        },
      },
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "user:email repo read:org",
        },
      },
    }),
    SlackProvider({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "users:read users:email channels:read chat:write",
        },
      },
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify email guilds.read",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        AuthLogger.logEvent({
          userId: user.id,
          action: AuditAction.LOGIN,
          resource: 'auth',
          context: { provider: account.provider, action: 'signin' },
          metadata: { provider: account.provider }
        })
        
        // Use OAuthProviderManager to handle provider-specific logic
        try {
          const providerManager = OAuthProviderManager.getInstance()
          await providerManager.saveOAuthToken(
            user.id,
            account.provider.toUpperCase() as OAuthProvider,
            {
              access_token: account.access_token!,
              refresh_token: account.refresh_token,
              token_type: account.token_type || 'Bearer',
              expires_in: account.expires_at ? Math.floor((account.expires_at * 1000 - Date.now()) / 1000) : undefined,
              scope: account.scope
            },
            { id: user.id, email: user.email!, name: user.name! }
          )
        } catch (error) {
          AuthLogger.logError(user.id, `Provider manager error: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider: account.provider })
        }
        
        return {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at! * 1000,
          provider: account.provider,
          userId: user.id,
          user,
        }
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token
      }

      // Access token has expired, try to update it
      AuthLogger.logEvent({
        userId: token.userId as string,
        action: AuditAction.UPDATE,
        resource: 'oauth_token',
        context: { provider: token.provider, action: 'token_refresh_attempt' },
        metadata: { provider: token.provider }
      })
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.user = token.user as any
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string
      session.error = token.error as string | undefined
      
      // Add provider info to session for UI display
      if (token.provider) {
        session.provider = token.provider as string
      }
      
      AuthLogger.logEvent({
        userId: token.userId as string,
        action: AuditAction.LOGIN,
        resource: 'auth',
        context: { action: 'session_created', hasAccessToken: !!token.accessToken },
        metadata: { hasAccessToken: !!token.accessToken }
      })
      return session
    },
    async signIn({ user, account, profile }) {
      if (account && account.provider) {
        AuthLogger.logEvent({
          userId: user.id,
          action: AuditAction.LOGIN,
          resource: 'auth',
          context: { provider: account.provider, action: 'signin_start' },
          metadata: { provider: account.provider }
        })
        
        // Store OAuth tokens in the database using OAuthProviderManager
        try {
          const providerManager = OAuthProviderManager.getInstance()
          await providerManager.saveOAuthToken(
            user.id,
            account.provider.toUpperCase() as OAuthProvider,
            {
              access_token: account.access_token!,
              refresh_token: account.refresh_token,
              token_type: account.token_type || 'Bearer',
              expires_in: account.expires_at ? Math.floor((account.expires_at * 1000 - Date.now()) / 1000) : undefined,
              scope: account.scope
            },
            { id: user.id, email: user.email!, name: user.name! }
          )
          
          AuthLogger.logEvent({
            userId: user.id,
            action: AuditAction.LOGIN,
            resource: 'auth',
            context: { provider: account.provider, action: 'signin_success' },
            metadata: { provider: account.provider }
          })
        } catch (error) {
          AuthLogger.logError(user.id, `Signin error: ${error instanceof Error ? error.message : String(error)}`, 'oauth_token', { provider: account.provider, userId: user.id })
          console.error("Error storing OAuth token:", error)
        }
      }
      return true
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },
  debug: process.env.NODE_ENV === "development",
}

async function refreshAccessToken(token: any) {
  try {
    // Extract the provider from the token
    const provider = token.provider?.toUpperCase()
    
    if (!provider || !token.userId) {
      console.error("Missing provider or user ID for token refresh")
      return {
        ...token,
        error: "RefreshAccessTokenError",
      }
    }

    // Import TokenManager dynamically to avoid circular dependencies
    const { TokenManager } = await import("./token-manager")
    
    // Use TokenManager to refresh the token
    const refreshedToken = await TokenManager.refreshToken(token.userId, provider as any)
    
    if (!refreshedToken) {
      console.error("Failed to refresh token")
      return {
        ...token,
        error: "RefreshAccessTokenError",
      }
    }

    // Return the updated token with new access token and expiration
    return {
      ...token,
      accessToken: refreshedToken.accessToken,
      refreshToken: refreshedToken.refreshToken || token.refreshToken,
      accessTokenExpires: refreshedToken.expiresAt?.getTime(),
    }
  } catch (error) {
    console.error("Error refreshing access token:", error)
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}