import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { PermissionManager } from "./lib/permissions"

// Paths that don't require authentication
const publicPaths = [
  "/api/auth",
  "/auth/signin",
  "/auth/error",
  "/",
  "/favicon.ico",
  "/_next",
  "/images",
  "/fonts",
]

// Paths that require admin access
const adminPaths = [
  "/api/admin",
  "/admin",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if the path is public
  const isPublicPath = publicPaths.some(path => 
    pathname.startsWith(path) || pathname === path
  )

  if (isPublicPath) {
    return NextResponse.next()
  }

  // Check for authentication token
  const token = await getToken({ 
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // If no token, redirect to sign in
  if (!token) {
    const url = new URL("/auth/signin", request.url)
    url.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(url)
  }

  // Check if user ID exists in token
  const userId = token.sub as string
  if (!userId) {
    return NextResponse.redirect(new URL("/auth/error", request.url))
  }

  // Check admin paths
  const isAdminPath = adminPaths.some(path => 
    pathname.startsWith(path) || pathname === path
  )

  if (isAdminPath) {
    const isAdmin = await PermissionManager.isAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }
  }

  // API route permission checking
  if (pathname.startsWith("/api/")) {
    // Extract resource and action from path
    const pathParts = pathname.split("/").filter(Boolean)
    if (pathParts.length >= 3) {
      const resource = pathParts[2] // e.g., "agents", "workflows", "oauth_tokens"
      const method = request.method.toLowerCase()
      
      // Map HTTP methods to actions
      let action = "read"
      if (["post", "put", "patch"].includes(method)) {
        action = "write"
      } else if (method === "delete") {
        action = "delete"
      }

      // Special cases for specific endpoints
      if (pathname.includes("/execute")) {
        action = "execute"
      }

      // Check permission
      const hasPermission = await PermissionManager.hasPermission(userId, {
        resource,
        action,
      })

      if (!hasPermission) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    }
  }

  // Add user info to request headers for downstream use
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-user-id", userId)
  requestHeaders.set("x-user-email", token.email || "")

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}