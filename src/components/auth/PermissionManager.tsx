"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, Users, Key, AlertTriangle, CheckCircle, XCircle } from "lucide-react"
import { PermissionManager as PermissionService, type UserPermission } from "@/lib/permissions"

interface User {
  id: string
  email: string
  name?: string
  roles: string[]
  permissions: UserPermission[]
}

interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
}

export default function PermissionManager() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newRole, setNewRole] = useState({ name: "", description: "" })
  const [newPermission, setNewPermission] = useState({
    name: "",
    description: "",
    type: "READ" as const,
    resource: "",
    action: "",
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load users with their roles and permissions
      const usersResponse = await fetch("/api/users")
      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        setUsers(usersData)
      }

      // Load roles
      const rolesResponse = await fetch("/api/roles")
      if (rolesResponse.ok) {
        const rolesData = await rolesResponse.json()
        setRoles(rolesData)
      }
    } catch (err) {
      setError("Failed to load permission data")
      console.error("Error loading permission data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleGrantPermission = async (userId: string, permissionName: string) => {
    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, permissionName, action: "grant" }),
      })

      if (response.ok) {
        setSuccess("Permission granted successfully")
        loadData()
      } else {
        setError("Failed to grant permission")
      }
    } catch (err) {
      setError("Error granting permission")
      console.error("Error granting permission:", err)
    }
  }

  const handleRevokePermission = async (userId: string, permissionName: string) => {
    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, permissionName, action: "revoke" }),
      })

      if (response.ok) {
        setSuccess("Permission revoked successfully")
        loadData()
      } else {
        setError("Failed to revoke permission")
      }
    } catch (err) {
      setError("Error revoking permission")
      console.error("Error revoking permission:", err)
    }
  }

  const handleAssignRole = async (userId: string, roleName: string) => {
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, roleName, action: "assign" }),
      })

      if (response.ok) {
        setSuccess("Role assigned successfully")
        loadData()
      } else {
        setError("Failed to assign role")
      }
    } catch (err) {
      setError("Error assigning role")
      console.error("Error assigning role:", err)
    }
  }

  const handleRemoveRole = async (userId: string, roleName: string) => {
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, roleName, action: "remove" }),
      })

      if (response.ok) {
        setSuccess("Role removed successfully")
        loadData()
      } else {
        setError("Failed to remove role")
      }
    } catch (err) {
      setError("Error removing role")
      console.error("Error removing role:", err)
    }
  }

  const handleCreateRole = async () => {
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newRole, action: "create" }),
      })

      if (response.ok) {
        setSuccess("Role created successfully")
        setNewRole({ name: "", description: "" })
        loadData()
      } else {
        setError("Failed to create role")
      }
    } catch (err) {
      setError("Error creating role")
      console.error("Error creating role:", err)
    }
  }

  const handleCreatePermission = async () => {
    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPermission, action: "create" }),
      })

      if (response.ok) {
        setSuccess("Permission created successfully")
        setNewPermission({
          name: "",
          description: "",
          type: "READ",
          resource: "",
          action: "",
        })
        loadData()
      } else {
        setError("Failed to create permission")
      }
    } catch (err) {
      setError("Error creating permission")
      console.error("Error creating permission:", err)
    }
  }

  const getPermissionColor = (type: string) => {
    switch (type) {
      case "READ": return "bg-green-100 text-green-800"
      case "WRITE": return "bg-blue-100 text-blue-800"
      case "DELETE": return "bg-red-100 text-red-800"
      case "EXECUTE": return "bg-purple-100 text-purple-800"
      case "ADMIN": return "bg-orange-100 text-orange-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getRoleColor = (roleName: string) => {
    switch (roleName) {
      case "ADMIN": return "bg-red-100 text-red-800"
      case "USER": return "bg-blue-100 text-blue-800"
      case "VIEWER": return "bg-green-100 text-green-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-8 w-8 mx-auto mb-4 text-blue-600 animate-pulse" />
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2 mb-6">
        <Shield className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Permission Management</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>User Permissions</span>
              </CardTitle>
              <CardDescription>
                Manage user roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="user-select">Select User:</Label>
                  <Select onValueChange={setSelectedUser}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Choose a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email} {user.name && `(${user.name})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedUser && (
                  <div className="space-y-4">
                    {(() => {
                      const user = users.find(u => u.id === selectedUser)
                      if (!user) return null

                      return (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-lg font-semibold">Roles</h3>
                            <div className="flex flex-wrap gap-2">
                              {user.roles.map((role) => (
                                <Badge key={role} className={getRoleColor(role)}>
                                  {role}
                                  <button
                                    onClick={() => handleRemoveRole(user.id, role)}
                                    className="ml-2 text-red-600 hover:text-red-800"
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Select onValueChange={(roleName) => handleAssignRole(user.id, roleName)}>
                                <SelectTrigger className="w-48">
                                  <SelectValue placeholder="Assign role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {roles
                                    .filter(role => !user.roles.includes(role.name))
                                    .map((role) => (
                                      <SelectItem key={role.id} value={role.name}>
                                        {role.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h3 className="text-lg font-semibold">Permissions</h3>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Permission</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Resource</TableHead>
                                  <TableHead>Action</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {user.permissions.map((permission) => (
                                  <TableRow key={permission.id}>
                                    <TableCell>{permission.name}</TableCell>
                                    <TableCell>
                                      <Badge className={getPermissionColor(permission.type)}>
                                        {permission.type}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{permission.resource}</TableCell>
                                    <TableCell>{permission.action}</TableCell>
                                    <TableCell>
                                      {permission.granted ? (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-600" />
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {permission.granted ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRevokePermission(user.id, permission.name)}
                                        >
                                          Revoke
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleGrantPermission(user.id, permission.name)}
                                        >
                                          Grant
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Role Management</span>
              </CardTitle>
              <CardDescription>
                View and manage system roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>
                        <Badge className={getRoleColor(role.name)}>
                          {role.name}
                        </Badge>
                      </TableCell>
                      <TableCell>{role.description}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.map((permission) => (
                            <Badge key={permission} variant="outline" className="text-xs">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {users.filter(u => u.roles.includes(role.name)).length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Key className="h-5 w-5" />
                <span>System Permissions</span>
              </CardTitle>
              <CardDescription>
                View all available permissions in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(
                    new Set(
                      users.flatMap(u => u.permissions.map(p => p.name))
                    )
                  ).map((permissionName) => {
                    const permission = users
                      .flatMap(u => u.permissions)
                      .find(p => p.name === permissionName)
                    return permission ? (
                      <TableRow key={permission.id}>
                        <TableCell>{permission.name}</TableCell>
                        <TableCell>
                          <Badge className={getPermissionColor(permission.type)}>
                            {permission.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{permission.resource}</TableCell>
                        <TableCell>{permission.action}</TableCell>
                        <TableCell>{permission.description}</TableCell>
                      </TableRow>
                    ) : null
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Role</CardTitle>
                <CardDescription>
                  Define a new role with specific permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="role-name">Role Name</Label>
                  <Input
                    id="role-name"
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder="e.g., MODERATOR"
                  />
                </div>
                <div>
                  <Label htmlFor="role-description">Description</Label>
                  <Textarea
                    id="role-description"
                    value={newRole.description}
                    onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                    placeholder="Role description..."
                  />
                </div>
                <Button onClick={handleCreateRole} className="w-full">
                  Create Role
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create New Permission</CardTitle>
                <CardDescription>
                  Define a new permission for access control
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="permission-name">Permission Name</Label>
                  <Input
                    id="permission-name"
                    value={newPermission.name}
                    onChange={(e) => setNewPermission({ ...newPermission, name: e.target.value })}
                    placeholder="e.g., read:agents"
                  />
                </div>
                <div>
                  <Label htmlFor="permission-type">Type</Label>
                  <Select
                    value={newPermission.type}
                    onValueChange={(value: any) => setNewPermission({ ...newPermission, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="READ">Read</SelectItem>
                      <SelectItem value="WRITE">Write</SelectItem>
                      <SelectItem value="DELETE">Delete</SelectItem>
                      <SelectItem value="EXECUTE">Execute</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="permission-resource">Resource</Label>
                  <Input
                    id="permission-resource"
                    value={newPermission.resource}
                    onChange={(e) => setNewPermission({ ...newPermission, resource: e.target.value })}
                    placeholder="e.g., agents"
                  />
                </div>
                <div>
                  <Label htmlFor="permission-action">Action</Label>
                  <Input
                    id="permission-action"
                    value={newPermission.action}
                    onChange={(e) => setNewPermission({ ...newPermission, action: e.target.value })}
                    placeholder="e.g., read"
                  />
                </div>
                <div>
                  <Label htmlFor="permission-description">Description</Label>
                  <Textarea
                    id="permission-description"
                    value={newPermission.description}
                    onChange={(e) => setNewPermission({ ...newPermission, description: e.target.value })}
                    placeholder="Permission description..."
                  />
                </div>
                <Button onClick={handleCreatePermission} className="w-full">
                  Create Permission
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}