import { NextRequest, NextResponse } from "next/server"
import { PermissionManager } from "@/lib/permissions"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PermissionType } from "@prisma/client"

// GET /api/permissions - Get permissions for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Get user ID from session - need to handle the case where user might not have an ID
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    switch (action) {
      case "user":
        // Get all permissions for current user
        const userPermissions = await PermissionManager.getCurrentUserPermissions()
        return NextResponse.json({ permissions: userPermissions })

      case "roles":
        // Get all roles for current user
        const userRoles = await PermissionManager.getUserRoles(userId)
        return NextResponse.json({ roles: userRoles })

      case "all":
        // Get all available permissions (admin only)
        const hasAdminPermission = await PermissionManager.currentUserHasPermission({
          resource: "permissions",
          action: "admin"
        })

        if (!hasAdminPermission) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
        }

        const allPermissions = await getAllPermissions()
        return NextResponse.json({ permissions: allPermissions })

      case "all-roles":
        // Get all available roles (admin only)
        const hasRoleAdminPermission = await PermissionManager.currentUserHasPermission({
          resource: "permissions",
          action: "admin"
        })

        if (!hasRoleAdminPermission) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
        }

        const allRoles = await getAllRoles()
        return NextResponse.json({ roles: allRoles })

      case "check":
        // Check specific permission
        const resource = searchParams.get("resource")
        const actionParam = searchParams.get("action")
        
        if (!resource || !actionParam) {
          return NextResponse.json({ error: "Resource and action are required" }, { status: 400 })
        }

        const hasPermission = await PermissionManager.currentUserHasPermission({
          resource,
          action: actionParam
        })

        return NextResponse.json({ hasPermission })

      case "check-multiple":
        // Check multiple permissions
        const checksParam = searchParams.get("checks")
        
        if (!checksParam) {
          return NextResponse.json({ error: "Checks parameter is required" }, { status: 400 })
        }

        try {
          const checks = JSON.parse(checksParam)
          const results = await PermissionManager.checkMultiplePermissions(userId, checks)
          return NextResponse.json({ results })
        } catch (error) {
          return NextResponse.json({ error: "Invalid checks format" }, { status: 400 })
        }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in permissions GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/permissions - Grant permissions or assign roles
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body

    // Check if user has permission to manage permissions
    const hasManagePermission = await PermissionManager.currentUserHasPermission({
      resource: "permissions",
      action: "admin"
    })

    if (!hasManagePermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    switch (action) {
      case "grant-permission":
        // Grant permission to user
        const { userId, permissionName, conditions: grantConditions } = data
        
        if (!userId || !permissionName) {
          return NextResponse.json({ error: "User ID and permission name are required" }, { status: 400 })
        }

        const granted = await PermissionManager.grantPermission(userId, permissionName, grantConditions)
        
        if (granted) {
          return NextResponse.json({ success: true, message: "Permission granted successfully" })
        } else {
          return NextResponse.json({ error: "Failed to grant permission" }, { status: 400 })
        }

      case "revoke-permission":
        // Revoke permission from user
        const { userId: revokeUserId, permissionName: revokePermissionName } = data
        
        if (!revokeUserId || !revokePermissionName) {
          return NextResponse.json({ error: "User ID and permission name are required" }, { status: 400 })
        }

        const revoked = await PermissionManager.revokePermission(revokeUserId, revokePermissionName)
        
        if (revoked) {
          return NextResponse.json({ success: true, message: "Permission revoked successfully" })
        } else {
          return NextResponse.json({ error: "Failed to revoke permission" }, { status: 400 })
        }

      case "assign-role":
        // Assign role to user
        const { userId: assignUserId, roleName } = data
        
        if (!assignUserId || !roleName) {
          return NextResponse.json({ error: "User ID and role name are required" }, { status: 400 })
        }

        const assigned = await PermissionManager.assignRole(assignUserId, roleName)
        
        if (assigned) {
          return NextResponse.json({ success: true, message: "Role assigned successfully" })
        } else {
          return NextResponse.json({ error: "Failed to assign role" }, { status: 400 })
        }

      case "remove-role":
        // Remove role from user
        const { userId: removeUserId, roleName: removeRoleName } = data
        
        if (!removeUserId || !removeRoleName) {
          return NextResponse.json({ error: "User ID and role name are required" }, { status: 400 })
        }

        const removed = await PermissionManager.removeRole(removeUserId, removeRoleName)
        
        if (removed) {
          return NextResponse.json({ success: true, message: "Role removed successfully" })
        } else {
          return NextResponse.json({ error: "Failed to remove role" }, { status: 400 })
        }

      case "create-permission":
        // Create new permission
        const { name, description, type, resource, action, conditions: createConditions } = data
        
        if (!name || !type || !resource || !action) {
          return NextResponse.json({ error: "Name, type, resource, and action are required" }, { status: 400 })
        }

        const created = await PermissionManager.createPermission(
          name,
          description || "",
          type as PermissionType,
          resource,
          action,
          createConditions
        )
        
        if (created) {
          return NextResponse.json({ success: true, message: "Permission created successfully" })
        } else {
          return NextResponse.json({ error: "Failed to create permission" }, { status: 400 })
        }

      case "initialize-defaults":
        // Initialize default permissions and roles
        await PermissionManager.initializeDefaultPermissions()
        await PermissionManager.initializeDefaultRoles()
        
        return NextResponse.json({ success: true, message: "Default permissions and roles initialized" })

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in permissions POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT /api/permissions - Update permissions or roles
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body

    // Check if user has permission to manage permissions
    const hasManagePermission = await PermissionManager.currentUserHasPermission({
      resource: "permissions",
      action: "admin"
    })

    if (!hasManagePermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    switch (action) {
      case "update-permission":
        // Update permission conditions
        const { userId: updateUserId, permissionName: updatePermissionName, conditions: updateConditions } = data
        
        if (!updateUserId || !updatePermissionName) {
          return NextResponse.json({ error: "User ID and permission name are required" }, { status: 400 })
        }

        const updated = await PermissionManager.grantPermission(updateUserId, updatePermissionName, updateConditions)
        
        if (updated) {
          return NextResponse.json({ success: true, message: "Permission updated successfully" })
        } else {
          return NextResponse.json({ error: "Failed to update permission" }, { status: 400 })
        }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in permissions PUT:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/permissions - Delete permissions or roles
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    // Check if user has permission to manage permissions
    const hasManagePermission = await PermissionManager.currentUserHasPermission({
      resource: "permissions",
      action: "admin"
    })

    if (!hasManagePermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    switch (action) {
      case "revoke-permission":
        // Revoke permission from user
        const userId = searchParams.get("userId")
        const permissionName = searchParams.get("permissionName")
        
        if (!userId || !permissionName) {
          return NextResponse.json({ error: "User ID and permission name are required" }, { status: 400 })
        }

        const revoked = await PermissionManager.revokePermission(userId, permissionName)
        
        if (revoked) {
          return NextResponse.json({ success: true, message: "Permission revoked successfully" })
        } else {
          return NextResponse.json({ error: "Failed to revoke permission" }, { status: 400 })
        }

      case "remove-role":
        // Remove role from user
        const removeUserId = searchParams.get("userId")
        const roleName = searchParams.get("roleName")
        
        if (!removeUserId || !roleName) {
          return NextResponse.json({ error: "User ID and role name are required" }, { status: 400 })
        }

        const removed = await PermissionManager.removeRole(removeUserId, roleName)
        
        if (removed) {
          return NextResponse.json({ success: true, message: "Role removed successfully" })
        } else {
          return NextResponse.json({ error: "Failed to remove role" }, { status: 400 })
        }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in permissions DELETE:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper functions
async function getAllPermissions() {
  const { db } = await import("@/lib/db")
  return await db.permission.findMany({
    where: {},
    orderBy: { resource: "asc" }
  })
}

async function getAllRoles() {
  const { db } = await import("@/lib/db")
  return await db.role.findMany({
    where: {},
    include: {
      rolePermissions: {
        include: {
          permission: true
        }
      }
    },
    orderBy: { name: "asc" }
  })
}