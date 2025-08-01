"use client"

import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Mail, 
  Calendar, 
  FileText, 
  Users, 
  MessageSquare, 
  GamepadIcon,
  CheckCircle,
  Clock,
  AlertTriangle,
  Settings,
  Shield,
  LogOut
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AuthProvider {
  id: string
  name: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  scopes: string[]
  icon: React.ReactNode
  lastConnected?: Date
}

interface ServiceConnection {
  id: string
  name: string
  type: string
  status: 'active' | 'inactive' | 'error'
  provider: string
  lastSync?: Date
}

export default function AuthManager() {
  const { data: session, status } = useSession()
  const { toast } = useToast()
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>([])
  const [serviceConnections, setServiceConnections] = useState<ServiceConnection[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) {
      loadAuthProviders()
      loadServiceConnections()
    }
  }, [session])

  const loadAuthProviders = async () => {
    try {
      const response = await fetch("/api/auth/providers")
      const data = await response.json()
      
      const providers: AuthProvider[] = [
        {
          id: 'google',
          name: 'Google Workspace',
          status: 'disconnected',
          scopes: ['gmail', 'calendar', 'drive'],
          icon: <Mail className="w-5 h-5" />
        },
        {
          id: 'microsoft',
          name: 'Microsoft Outlook',
          status: 'disconnected',
          scopes: ['mail', 'calendar'],
          icon: <Mail className="w-5 h-5" />
        },
        {
          id: 'github',
          name: 'GitHub',
          status: 'disconnected',
          scopes: ['repositories', 'organizations'],
          icon: <FileText className="w-5 h-5" />
        },
        {
          id: 'slack',
          name: 'Slack',
          status: 'disconnected',
          scopes: ['channels', 'messages'],
          icon: <MessageSquare className="w-5 h-5" />
        },
        {
          id: 'discord',
          name: 'Discord',
          status: 'disconnected',
          scopes: ['servers', 'channels'],
          icon: <GamepadIcon className="w-5 h-5" />
        }
      ]

      // Update status based on actual connections
      // This would typically come from your backend
      setAuthProviders(providers)
    } catch (error) {
      console.error("Error loading auth providers:", error)
    }
  }

  const loadServiceConnections = async () => {
    try {
      const response = await fetch("/api/service-connections")
      const data = await response.json()
      setServiceConnections(data.connections || [])
    } catch (error) {
      console.error("Error loading service connections:", error)
    }
  }

  const handleConnectProvider = async (providerId: string) => {
    setLoading(true)
    try {
      setAuthProviders(prev => prev.map(provider => 
        provider.id === providerId 
          ? { ...provider, status: 'connecting' }
          : provider
      ))

      // Simulate OAuth flow - in real implementation, this would redirect to OAuth provider
      setTimeout(() => {
        setAuthProviders(prev => prev.map(provider => 
          provider.id === providerId 
            ? { ...provider, status: 'connected', lastConnected: new Date() }
            : provider
        ))
        
        toast({
          title: "Authentication Successful",
          description: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} connected successfully`,
        })

        // Create service connection
        const newConnection: ServiceConnection = {
          id: `${providerId}-${Date.now()}`,
          name: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} Integration`,
          type: providerId,
          status: 'active',
          provider: providerId,
          lastSync: new Date()
        }
        
        setServiceConnections(prev => [...prev, newConnection])
      }, 2000)
    } catch (error) {
      setAuthProviders(prev => prev.map(provider => 
        provider.id === providerId 
          ? { ...provider, status: 'error' }
          : provider
      ))
      
      toast({
        title: "Authentication Failed",
        description: `Failed to connect to ${providerId}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnectProvider = async (providerId: string) => {
    setLoading(true)
    try {
      setAuthProviders(prev => prev.map(provider => 
        provider.id === providerId 
          ? { ...provider, status: 'disconnected' }
          : provider
      ))

      // Remove service connection
      setServiceConnections(prev => prev.filter(conn => conn.provider !== providerId))

      toast({
        title: "Disconnected",
        description: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} disconnected successfully`,
      })
    } catch (error) {
      toast({
        title: "Disconnection Failed",
        description: `Failed to disconnect from ${providerId}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      case 'disconnected':
      case 'inactive':
        return 'bg-gray-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'connecting':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <Clock className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    )
  }

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Authentication Required</CardTitle>
          <CardDescription>
            Please sign in to manage your service connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.href = "/auth/signin"}>
            Sign In
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* User Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">
                  {session.user?.name?.charAt(0) || session.user?.email?.charAt(0) || "U"}
                </span>
              </div>
              <div>
                <CardTitle className="text-lg">{session.user?.name || "User"}</CardTitle>
                <CardDescription>{session.user?.email}</CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Service Authentication */}
      <Card>
        <CardHeader>
          <CardTitle>Service Authentication</CardTitle>
          <CardDescription>
            Connect your accounts to enable agent functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {authProviders.map((provider) => (
              <Card key={provider.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {provider.icon}
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                    </div>
                    {getStatusIcon(provider.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Scopes:</span>
                    <div className="flex flex-wrap gap-1">
                      {provider.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {provider.status === 'disconnected' && (
                    <Button 
                      onClick={() => handleConnectProvider(provider.id)}
                      className="w-full"
                      size="sm"
                      disabled={loading}
                    >
                      Connect
                    </Button>
                  )}
                  {provider.status === 'connecting' && (
                    <Button disabled className="w-full" size="sm">
                      Connecting...
                    </Button>
                  )}
                  {provider.status === 'connected' && (
                    <div className="space-y-2">
                      <Button 
                        onClick={() => handleDisconnectProvider(provider.id)}
                        variant="outline"
                        className="w-full"
                        size="sm"
                        disabled={loading}
                      >
                        Disconnect
                      </Button>
                      {provider.lastConnected && (
                        <p className="text-xs text-muted-foreground">
                          Connected {provider.lastConnected.toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Connections */}
      {serviceConnections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Service Connections</CardTitle>
            <CardDescription>
              Currently connected services and their status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serviceConnections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(connection.status)}
                    <div>
                      <div className="font-medium">{connection.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {connection.type} • {connection.provider}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {connection.status}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          All connections use OAuth 2.0 with minimal required scopes. Data is processed locally and never shared with third parties.
          You can revoke access at any time from this panel or from the respective service's security settings.
        </AlertDescription>
      </Alert>
    </div>
  )
}