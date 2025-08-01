import { db } from "./db"
import { PermissionType } from ".prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { AuthLogger } from "./auth-logger"

export interface PermissionCheck {
  resource: string
  action: string
  conditions?: Record<string, any>
}

export interface UserPermission {
  id: string
  name: string
  description: string
  type: PermissionType
  resource: string
  action: string
  granted: boolean
  conditions?: Record<string, any>
}

export class PermissionManager {
  static async getUserPermissions(userId: string): Promise<UserPermission[]> {
    try {
      const permissions = await db.userPermission.findMany({
        where: {
          userId,
          granted: true,
        },
        include: {
          permission: true,
        },
      })

      return permissions.map((up) => ({
        id: up.permission.id,
        name: up.permission.name,
        description: up.permission.description || "",
        type: up.permission.type,
        resource: up.permission.resource,
        action: up.permission.action,
        granted: up.granted,
        conditions: up.conditions as Record<string, any> || {},
      }))
    } catch (error) {
      console.error("Error getting user permissions:", error)
      await AuthLogger.logError(userId, `Error getting user permissions: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId })
      return []
    }
  }

  static async hasPermission(
    userId: string,
    check: PermissionCheck
  ): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId)

      // Find matching permission
      const matchingPermission = permissions.find(
        (p) =>
          p.resource === check.resource &&
          p.action === check.action &&
          p.granted
      )

      if (!matchingPermission) {
        return false
      }

      // Check conditions if they exist
      if (check.conditions && matchingPermission.conditions) {
        return this.evaluateConditions(
          check.conditions,
          matchingPermission.conditions
        )
      }

      return true
    } catch (error) {
      console.error("Error checking permission:", error)
      await AuthLogger.logError(userId, `Error checking permission: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, check })
      return false
    }
  }

  static async hasAnyPermission(
    userId: string,
    checks: PermissionCheck[]
  ): Promise<boolean> {
    try {
      for (const check of checks) {
        if (await this.hasPermission(userId, check)) {
          return true
        }
      }
      return false
    } catch (error) {
      console.error("Error checking permissions:", error)
      await AuthLogger.logError(userId, `Error checking any permission: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, checks })
      return false
    }
  }

  static async hasAllPermissions(
    userId: string,
    checks: PermissionCheck[]
  ): Promise<boolean> {
    try {
      for (const check of checks) {
        if (!(await this.hasPermission(userId, check))) {
          return false
        }
      }
      return true
    } catch (error) {
      console.error("Error checking permissions:", error)
      await AuthLogger.logError(userId, `Error checking all permissions: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, checks })
      return false
    }
  }

  static async grantPermission(
    userId: string,
    permissionName: string,
    conditions?: Record<string, any>
  ): Promise<boolean> {
    try {
      const permission = await db.permission.findUnique({
        where: { name: permissionName },
      })

      if (!permission) {
        return false
      }

      // Check if permission already exists
      const existing = await db.userPermission.findUnique({
        where: {
          userId_permissionId: {
            userId,
            permissionId: permission.id,
          },
        },
      })

      if (existing) {
        // Update existing permission
        await db.userPermission.update({
          where: { id: existing.id },
          data: {
            granted: true,
            conditions: conditions || {},
          },
        })
      } else {
        // Create new permission
        await db.userPermission.create({
          data: {
            userId,
            permissionId: permission.id,
            granted: true,
            conditions: conditions || {},
          },
        })
      }

      await AuthLogger.logEvent({
        userId,
        action: 'CREATE',
        resource: 'permission',
        context: { permissionName, conditions },
        metadata: { permissionName, conditions }
      })
      return true
    } catch (error) {
      console.error("Error granting permission:", error)
      await AuthLogger.logError(userId, `Error granting permission: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, permissionName, conditions })
      return false
    }
  }

  static async revokePermission(
    userId: string,
    permissionName: string
  ): Promise<boolean> {
    try {
      const permission = await db.permission.findUnique({
        where: { name: permissionName },
      })

      if (!permission) {
        return false
      }

      await db.userPermission.updateMany({
        where: {
          userId,
          permissionId: permission.id,
        },
        data: {
          granted: false,
        },
      })

      await AuthLogger.logEvent({
        userId,
        action: 'DELETE',
        resource: 'permission',
        context: { permissionName },
        metadata: { permissionName }
      })
      return true
    } catch (error) {
      console.error("Error revoking permission:", error)
      await AuthLogger.logError(userId, `Error revoking permission: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, permissionName })
      return false
    }
  }

  static async createPermission(
    name: string,
    description: string,
    type: PermissionType,
    resource: string,
    action: string,
    conditions?: Record<string, any>
  ): Promise<boolean> {
    try {
      await db.permission.create({
        data: {
          name,
          description,
          type,
          resource,
          action,
          conditions,
        },
      })

      return true
    } catch (error) {
      console.error("Error creating permission:", error)
      return false
    }
  }

  static async initializeDefaultPermissions(): Promise<void> {
    const defaultPermissions = [
      {
        name: "read:agents",
        description: "Read agent information",
        type: PermissionType.READ,
        resource: "agents",
        action: "read",
      },
      {
        name: "write:agents",
        description: "Create and modify agents",
        type: PermissionType.WRITE,
        resource: "agents",
        action: "write",
      },
      {
        name: "delete:agents",
        description: "Delete agents",
        type: PermissionType.DELETE,
        resource: "agents",
        action: "delete",
      },
      {
        name: "execute:agents",
        description: "Execute agent actions",
        type: PermissionType.EXECUTE,
        resource: "agents",
        action: "execute",
      },
      {
        name: "read:workflows",
        description: "Read workflow information",
        type: PermissionType.READ,
        resource: "workflows",
        action: "read",
      },
      {
        name: "write:workflows",
        description: "Create and modify workflows",
        type: PermissionType.WRITE,
        resource: "workflows",
        action: "write",
      },
      {
        name: "execute:workflows",
        description: "Execute workflows",
        type: PermissionType.EXECUTE,
        resource: "workflows",
        action: "execute",
      },
      {
        name: "read:oauth_tokens",
        description: "Read OAuth tokens",
        type: PermissionType.READ,
        resource: "oauth_tokens",
        action: "read",
      },
      {
        name: "write:oauth_tokens",
        description: "Create and modify OAuth tokens",
        type: PermissionType.WRITE,
        resource: "oauth_tokens",
        action: "write",
      },
      {
        name: "delete:oauth_tokens",
        description: "Delete OAuth tokens",
        type: PermissionType.DELETE,
        resource: "oauth_tokens",
        action: "delete",
      },
      {
        name: "admin:users",
        description: "Administer users",
        type: PermissionType.ADMIN,
        resource: "users",
        action: "admin",
      },
      {
        name: "admin:permissions",
        description: "Administer permissions",
        type: PermissionType.ADMIN,
        resource: "permissions",
        action: "admin",
      },
    ]

    for (const perm of defaultPermissions) {
      try {
        await db.permission.upsert({
          where: { name: perm.name },
          update: {},
          create: perm,
        })
      } catch (error) {
        console.error(`Error creating permission ${perm.name}:`, error)
      }
    }
  }

  private static evaluateConditions(
    userConditions: Record<string, any>,
    permissionConditions: Record<string, any>
  ): boolean {
    for (const [key, value] of Object.entries(permissionConditions)) {
      if (userConditions[key] !== value) {
        return false
      }
    }
    return true
  }

  // Helper functions for common permission checks
  static async canReadAgents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "agents",
      action: "read",
    })
  }

  static async canWriteAgents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "agents",
      action: "write",
    })
  }

  static async canExecuteAgents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "agents",
      action: "execute",
    })
  }

  static async canReadWorkflows(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "workflows",
      action: "read",
    })
  }

  static async canWriteWorkflows(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "workflows",
      action: "write",
    })
  }

  static async canExecuteWorkflows(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "workflows",
      action: "execute",
    })
  }

  static async canManageOAuth(userId: string): Promise<boolean> {
    return this.hasAnyPermission(userId, [
      { resource: "oauth_tokens", action: "read" },
      { resource: "oauth_tokens", action: "write" },
      { resource: "oauth_tokens", action: "delete" },
    ])
  }

  static async isAdmin(userId: string): Promise<boolean> {
    return this.hasPermission(userId, {
      resource: "users",
      action: "admin",
    })
  }

  // Role-based permission management
  static async getUserRoles(userId: string): Promise<any[]> {
    try {
      const userRoles = await db.userRole.findMany({
        where: { userId },
        include: { role: true },
      })
      return userRoles.map(ur => ur.role)
    } catch (error) {
      console.error("Error getting user roles:", error)
      await AuthLogger.logError(userId, `Error getting user roles: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId })
      return []
    }
  }

  static async assignRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const role = await db.role.findUnique({
        where: { name: roleName },
      })

      if (!role) {
        return false
      }

      await db.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: role.id,
        },
      })

      await AuthLogger.logEvent({
        userId,
        action: 'CREATE',
        resource: 'role',
        context: { roleName },
        metadata: { roleName }
      })
      return true
    } catch (error) {
      console.error("Error assigning role:", error)
      await AuthLogger.logError(userId, `Error assigning role: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, roleName })
      return false
    }
  }

  static async removeRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const role = await db.role.findUnique({
        where: { name: roleName },
      })

      if (!role) {
        return false
      }

      await db.userRole.deleteMany({
        where: {
          userId,
          roleId: role.id,
        },
      })

      await AuthLogger.logEvent({
        userId,
        action: 'DELETE',
        resource: 'role',
        context: { roleName },
        metadata: { roleName }
      })
      return true
    } catch (error) {
      console.error("Error removing role:", error)
      await AuthLogger.logError(userId, `Error removing role: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, roleName })
      return false
    }
  }

  static async hasRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const roles = await this.getUserRoles(userId)
      return roles.some(role => role.name === roleName)
    } catch (error) {
      console.error("Error checking role:", error)
      await AuthLogger.logError(userId, `Error checking role: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, roleName })
      return false
    }
  }

  static async hasAnyRole(userId: string, roleNames: string[]): Promise<boolean> {
    try {
      const roles = await this.getUserRoles(userId)
      return roles.some(role => roleNames.includes(role.name))
    } catch (error) {
      console.error("Error checking roles:", error)
      await AuthLogger.logError(userId, `Error checking any role: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, roleNames })
      return false
    }
  }

  static async hasAllRoles(userId: string, roleNames: string[]): Promise<boolean> {
    try {
      const roles = await this.getUserRoles(userId)
      return roleNames.every(roleName => roles.some(role => role.name === roleName))
    } catch (error) {
      console.error("Error checking roles:", error)
      await AuthLogger.logError(userId, `Error checking all roles: ${error instanceof Error ? error.message : String(error)}`, 'permission_manager', { userId, roleNames })
      return false
    }
  }

  // Initialize default roles and permissions
  static async initializeDefaultRoles(): Promise<void> {
    const defaultRoles = [
      {
        name: "ADMIN",
        description: "System administrator with full access",
        permissions: [
          "read:agents",
          "write:agents",
          "delete:agents",
          "execute:agents",
          "read:workflows",
          "write:workflows",
          "execute:workflows",
          "read:oauth_tokens",
          "write:oauth_tokens",
          "delete:oauth_tokens",
          "admin:users",
          "admin:permissions",
        ],
      },
      {
        name: "USER",
        description: "Regular user with basic access",
        permissions: [
          "read:agents",
          "write:agents",
          "execute:agents",
          "read:workflows",
          "write:workflows",
          "execute:workflows",
          "read:oauth_tokens",
          "write:oauth_tokens",
        ],
      },
      {
        name: "VIEWER",
        description: "Read-only access",
        permissions: [
          "read:agents",
          "read:workflows",
          "read:oauth_tokens",
        ],
      },
    ]

    for (const roleData of defaultRoles) {
      try {
        // Create or update role
        const role = await db.role.upsert({
          where: { name: roleData.name },
          update: { description: roleData.description },
          create: {
            name: roleData.name,
            description: roleData.description,
          },
        })

        // Assign permissions to role
        for (const permissionName of roleData.permissions) {
          const permission = await db.permission.findUnique({
            where: { name: permissionName },
          })

          if (permission) {
            await db.rolePermission.upsert({
              where: {
                roleId_permissionId: {
                  roleId: role.id,
                  permissionId: permission.id,
                },
              },
              update: {},
              create: {
                roleId: role.id,
                permissionId: permission.id,
              },
            })
          }
        }
      } catch (error) {
        console.error(`Error creating role ${roleData.name}:`, error)
      }
    }
  }

  // Get current user ID from session
  static async getCurrentUserId(): Promise<string | null> {
    try {
      const session = await getServerSession(authOptions)
      return (session?.user as any)?.id || null
    } catch (error) {
      console.error("Error getting current user ID:", error)
      return null
    }
  }

  // Check if current user has permission
  static async currentUserHasPermission(check: PermissionCheck): Promise<boolean> {
    const userId = await this.getCurrentUserId()
    if (!userId) return false
    return this.hasPermission(userId, check)
  }

  // Check if current user has role
  static async currentUserHasRole(roleName: string): Promise<boolean> {
    const userId = await this.getCurrentUserId()
    if (!userId) return false
    return this.hasRole(userId, roleName)
  }

  // Get all permissions for current user
  static async getCurrentUserPermissions(): Promise<UserPermission[]> {
    const userId = await this.getCurrentUserId()
    if (!userId) return []
    return this.getUserPermissions(userId)
  }

  // Resource-based permission checking with ownership
  static async canAccessResource(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<boolean> {
    try {
      // Check basic permission first
      const hasBasicPermission = await this.hasPermission(userId, {
        resource: resourceType,
        action,
      })

      if (!hasBasicPermission) {
        return false
      }

      // Check ownership for certain resource types
      if (resourceType === "agents" || resourceType === "workflows") {
        const resource = await db.agent.findUnique({
          where: { id: resourceId },
          select: { userId: true },
        })

        if (resource && resource.userId !== userId) {
          // Check if user has admin permission to access other users' resources
          return await this.isAdmin(userId)
        }
      }

      return true
    } catch (error) {
      console.error("Error checking resource access:", error)
      return false
    }
  }

  // Batch permission checking for optimization
  static async checkMultiplePermissions(
    userId: string,
    checks: PermissionCheck[]
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}
    
    // Get all user permissions once
    const userPermissions = await this.getUserPermissions(userId)
    
    for (const check of checks) {
      const key = `${check.resource}:${check.action}`
      results[key] = this.checkPermissionAgainstList(userPermissions, check)
    }
    
    return results
  }

  private static checkPermissionAgainstList(
    permissions: UserPermission[],
    check: PermissionCheck
  ): boolean {
    const matchingPermission = permissions.find(
      (p) =>
        p.resource === check.resource &&
        p.action === check.action &&
        p.granted
    )

    if (!matchingPermission) {
      return false
    }

    // Check conditions if they exist
    if (check.conditions && matchingPermission.conditions) {
      return this.evaluateConditions(
        check.conditions,
        matchingPermission.conditions
      )
    }

    return true
  }
}

// Export a convenience function for direct permission checking
export async function hasPermission(
  userId: string,
  action: string,
  resource: string,
  conditions?: Record<string, any>
): Promise<boolean> {
  return PermissionManager.hasPermission(userId, {
    action,
    resource,
    conditions,
  })
}