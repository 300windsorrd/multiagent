import { db } from "./db"
import { PermissionType } from ".prisma/client"

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

      return true
    } catch (error) {
      console.error("Error granting permission:", error)
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

      return true
    } catch (error) {
      console.error("Error revoking permission:", error)
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
}