import { db } from "./db"
import { AuditAction } from ".prisma/client"

export interface AuthLogEvent {
  userId?: string
  action: AuditAction
  resource: string
  resourceId?: string
  changes?: Record<string, any>
  context?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export class AuthLogger {
  static async logEvent(event: AuthLogEvent): Promise<void> {
    try {
      await db.auditLog.create({
        data: {
          userId: event.userId,
          action: event.action,
          resource: event.resource,
          resourceId: event.resourceId,
          changes: event.changes,
          context: event.context,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadata,
        },
      })
    } catch (error) {
      console.error("Error logging auth event:", error)
    }
  }

  static async logLogin(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.LOGIN,
      resource: "auth",
      context: {
        method: "oauth",
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
      metadata,
    })
  }

  static async logLogout(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.LOGOUT,
      resource: "auth",
      context: {
        method: "oauth",
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
      metadata,
    })
  }

  static async logOAuthConnect(
    userId: string,
    provider: string,
    scopes: string[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.CREATE,
      resource: "oauth_token",
      context: {
        provider,
        scopes,
        action: "connect",
      },
      ipAddress,
      userAgent,
      metadata: {
        provider,
        scopeCount: scopes.length,
      },
    })
  }

  static async logOAuthDisconnect(
    userId: string,
    provider: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.DELETE,
      resource: "oauth_token",
      context: {
        provider,
        action: "disconnect",
      },
      ipAddress,
      userAgent,
      metadata: {
        provider,
      },
    })
  }

  static async logTokenRefresh(
    userId: string,
    provider: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.UPDATE,
      resource: "oauth_token",
      context: {
        provider,
        action: "refresh",
        success,
      },
      ipAddress,
      userAgent,
      metadata: {
        provider,
        success,
      },
    })
  }

  static async logPermissionChange(
    userId: string,
    targetUserId: string,
    permissionName: string,
    granted: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.UPDATE,
      resource: "user_permission",
      resourceId: targetUserId,
      changes: {
        permission: permissionName,
        granted,
      },
      context: {
        action: granted ? "grant" : "revoke",
      },
      ipAddress,
      userAgent,
      metadata: {
        targetUserId,
        permissionName,
        granted,
      },
    })
  }

  static async logServiceConnectionCreate(
    userId: string,
    connectionName: string,
    connectionType: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.CREATE,
      resource: "service_connection",
      context: {
        action: "create",
        connectionType,
      },
      ipAddress,
      userAgent,
      metadata: {
        connectionName,
        connectionType,
      },
    })
  }

  static async logServiceConnectionUpdate(
    userId: string,
    connectionId: string,
    changes: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.UPDATE,
      resource: "service_connection",
      resourceId: connectionId,
      changes,
      context: {
        action: "update",
      },
      ipAddress,
      userAgent,
      metadata: {
        connectionId,
        changeKeys: Object.keys(changes),
      },
    })
  }

  static async logServiceConnectionDelete(
    userId: string,
    connectionId: string,
    connectionName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.DELETE,
      resource: "service_connection",
      resourceId: connectionId,
      context: {
        action: "delete",
        connectionName,
      },
      ipAddress,
      userAgent,
      metadata: {
        connectionId,
        connectionName,
      },
    })
  }

  static async logError(
    userId: string,
    error: string,
    resource: string,
    context?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: AuditAction.ERROR,
      resource,
      context: {
        error,
        ...context,
      },
      ipAddress,
      userAgent,
      metadata: {
        error,
        timestamp: new Date().toISOString(),
      },
    })
  }

  static async getAuthEvents(
    userId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    try {
      const where = userId ? { userId } : {}
      
      const events = await db.auditLog.findMany({
        where,
        orderBy: {
          timestamp: "desc",
        },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return events
    } catch (error) {
      console.error("Error getting auth events:", error)
      return []
    }
  }

  static async getSecurityReport(userId: string): Promise<{
    totalLogins: number
    uniqueProviders: number
    activeConnections: number
    recentEvents: any[]
  }> {
    try {
      const [totalLogins, uniqueProviders, activeConnections, recentEvents] = await Promise.all([
        db.auditLog.count({
          where: {
            userId,
            action: AuditAction.LOGIN,
          },
        }),
        db.oAuthToken.count({
          where: {
            userId,
            isActive: true,
          },
        }),
        db.serviceConnection.count({
          where: {
            userId,
            isActive: true,
          },
        }),
        db.auditLog.findMany({
          where: {
            userId,
          },
          orderBy: {
            timestamp: "desc",
          },
          take: 10,
        }),
      ])

      return {
        totalLogins,
        uniqueProviders,
        activeConnections,
        recentEvents,
      }
    } catch (error) {
      console.error("Error getting security report:", error)
      return {
        totalLogins: 0,
        uniqueProviders: 0,
        activeConnections: 0,
        recentEvents: [],
      }
    }
  }

  static async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const result = await db.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      })

      return result.count
    } catch (error) {
      console.error("Error cleaning up old logs:", error)
      return 0
    }
  }
}