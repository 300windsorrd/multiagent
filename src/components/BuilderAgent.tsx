'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { 
  Bot, 
  Shield, 
  Users, 
  Calendar, 
  Mail, 
  Brain, 
  Settings, 
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  BarChart3,
  Network,
  Zap
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  status: 'pending' | 'building' | 'active' | 'error'
  phase: 'mvp' | 'expansion' | 'full'
  description: string
  icon: React.ReactNode
  progress: number
}

interface AuthProvider {
  id: string
  name: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  scopes: string[]
  icon: React.ReactNode
}

interface Phase {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed'
  progress: number
  description: string
  duration: string
}

export default function BuilderAgent() {
  const { toast } = useToast()
  const [currentPhase, setCurrentPhase] = useState<'mvp' | 'expansion' | 'full'>('mvp')
  const [agents, setAgents] = useState<Agent[]>([])
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0, cost: 0 })
  const [complianceStatus, setComplianceStatus] = useState<'passed' | 'warning' | 'error'>('passed')

  useEffect(() => {
    initializeSystem()
  }, [])

  const initializeSystem = () => {
    // Initialize phases
    setPhases([
      {
        id: 'mvp',
        name: 'MVP Phase',
        status: 'active',
        progress: 25,
        description: 'Core agent framework and Orchestrator',
        duration: 'Weeks 1-4'
      },
      {
        id: 'expansion',
        name: 'Expansion Phase',
        status: 'pending',
        progress: 0,
        description: 'InsightAgent, PlannerAgent, EthicsAgent',
        duration: 'Weeks 5-8'
      },
      {
        id: 'full',
        name: 'Full Launch',
        status: 'pending',
        progress: 0,
        description: 'CurationAgent, collaboration, analytics',
        duration: 'Weeks 9-16'
      }
    ])

    // Initialize agents
    setAgents([
      {
        id: 'orchestrator',
        name: 'Orchestrator',
        status: 'active',
        phase: 'mvp',
        description: 'Master controller coordinating all agents',
        icon: <Network className="w-5 h-5" />,
        progress: 100
      },
      {
        id: 'inbox',
        name: 'InboxAgent',
        status: 'building',
        phase: 'mvp',
        description: 'Email triage and task extraction',
        icon: <Mail className="w-5 h-5" />,
        progress: 60
      },
      {
        id: 'calendar',
        name: 'CalendarAgent',
        status: 'pending',
        phase: 'mvp',
        description: 'Schedule management and conflict detection',
        icon: <Calendar className="w-5 h-5" />,
        progress: 0
      },
      {
        id: 'insight',
        name: 'InsightAgent',
        status: 'pending',
        phase: 'expansion',
        description: 'Content summarization and analysis',
        icon: <Brain className="w-5 h-5" />,
        progress: 0
      },
      {
        id: 'planner',
        name: 'PlannerAgent',
        status: 'pending',
        phase: 'expansion',
        description: 'Daily planning and task prioritization',
        icon: <BarChart3 className="w-5 h-5" />,
        progress: 0
      },
      {
        id: 'ethics',
        name: 'EthicsAgent',
        status: 'pending',
        phase: 'expansion',
        description: 'Compliance and ethical oversight',
        icon: <Shield className="w-5 h-5" />,
        progress: 0
      },
      {
        id: 'curation',
        name: 'CurationAgent',
        status: 'pending',
        phase: 'full',
        description: 'Content discovery and lead generation',
        icon: <Users className="w-5 h-5" />,
        progress: 0
      }
    ])

    // Initialize auth providers
    setAuthProviders([
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
        id: 'notion',
        name: 'Notion',
        status: 'disconnected',
        scopes: ['database', 'pages'],
        icon: <Brain className="w-5 h-5" />
      }
    ])

    // Initialize token usage (simulated)
    setTokenUsage({
      input: 125000,
      output: 45000,
      cost: 2.75
    })
  }

  const handleAuthConnect = (providerId: string) => {
    setAuthProviders(prev => prev.map(provider => 
      provider.id === providerId 
        ? { ...provider, status: 'connecting' }
        : provider
    ))

    // Simulate OAuth flow
    setTimeout(() => {
      setAuthProviders(prev => prev.map(provider => 
        provider.id === providerId 
          ? { ...provider, status: 'connected' }
          : provider
      ))
      toast({
        title: "Authentication Successful",
        description: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} connected successfully`,
      })
    }, 2000)
  }

  const handleBuildAgent = (agentId: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, status: 'building', progress: 0 }
        : agent
    ))

    // Simulate building process
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.id === agentId && agent.status === 'building') {
          const newProgress = Math.min(agent.progress + Math.random() * 20, 100)
          const status = newProgress >= 100 ? 'active' : 'building'
          return { ...agent, progress: newProgress, status }
        }
        return agent
      }))
    }, 500)

    setTimeout(() => {
      clearInterval(interval)
      toast({
        title: "Agent Built Successfully",
        description: `${agentId.charAt(0).toUpperCase() + agentId.slice(1)}Agent is now active`,
      })
    }, 3000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'building': return 'bg-blue-500'
      case 'pending': return 'bg-gray-500'
      case 'error': return 'bg-red-500'
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'disconnected': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'building':
      case 'connecting':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            BuilderAgent Orchestrator
          </h1>
          <p className="text-muted-foreground mt-2">
            Multi-Agent AI Automation Platform - Ethical, Transparent, Efficient
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={complianceStatus === 'passed' ? 'default' : 'destructive'}>
            <Shield className="w-3 h-3 mr-1" />
            {complianceStatus === 'passed' ? 'Compliant' : 'Compliance Issue'}
          </Badge>
          <Badge variant="outline">
            <DollarSign className="w-3 h-3 mr-1" />
            ${tokenUsage.cost.toFixed(2)}
          </Badge>
        </div>
      </div>

      {/* Phase Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Build Phases
          </CardTitle>
          <CardDescription>
            Track progress through MVP, Expansion, and Full Launch phases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {phases.map((phase) => (
              <div key={phase.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(phase.status)}
                    <span className="font-medium">{phase.name}</span>
                    <Badge variant="outline">{phase.duration}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{phase.progress}%</span>
                </div>
                <Progress value={phase.progress} className="h-2" />
                <p className="text-sm text-muted-foreground">{phase.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="auth">Authentication</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="workflow">Workflow Builder</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card key={agent.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {agent.icon}
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status)}
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {agent.phase.toUpperCase()}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-sm">
                    {agent.description}
                  </CardDescription>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span>{agent.progress.toFixed(0)}%</span>
                    </div>
                    <Progress value={agent.progress} className="h-2" />
                  </div>
                  {agent.status === 'pending' && (
                    <Button 
                      onClick={() => handleBuildAgent(agent.id)}
                      className="w-full"
                      size="sm"
                    >
                      Build Agent
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Authentication Tab */}
        <TabsContent value="auth" className="space-y-4">
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
                          onClick={() => handleAuthConnect(provider.id)}
                          className="w-full"
                          size="sm"
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
                        <Button variant="outline" className="w-full" size="sm">
                          Manage
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              All connections use OAuth 2.0 with minimal required scopes. Data is processed locally and never shared with third parties.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Token Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(tokenUsage.input + tokenUsage.output).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total tokens this session
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${tokenUsage.cost.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  Estimated LLM costs
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agents.filter(a => a.status === 'active').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Out of {agents.length} total agents
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {complianceStatus === 'passed' ? '100%' : '85%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ethical compliance score
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>
                Real-time monitoring of agent performance and system status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>API Rate Limits</span>
                  <Badge variant="outline">Healthy</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Vector Database</span>
                  <Badge variant="outline">Connected</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Model Router</span>
                  <Badge variant="outline">Optimal</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ethics Monitor</span>
                  <Badge variant="outline">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Builder Tab */}
        <TabsContent value="workflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Drag-and-Drop Workflow Builder</CardTitle>
              <CardDescription>
                Visually assemble agent workflows and data flows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Network className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Workflow Canvas</h3>
                <p className="text-muted-foreground mb-4">
                  Drag agents from the library and connect them to build workflows
                </p>
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Configure Workflow
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent Library</CardTitle>
              <CardDescription>
                Available agents for workflow construction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {agents.filter(a => a.status === 'active').map((agent) => (
                  <div
                    key={agent.id}
                    className="border rounded-lg p-3 cursor-move hover:bg-gray-50 transition-colors"
                    draggable
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {agent.icon}
                      <span className="font-medium text-sm">{agent.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{agent.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Compliance Footer */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Ethical Compliance:</strong> All agent actions are logged, require user consent for sensitive operations, 
          and follow Christian values of discernment, service, and wisdom. No irreversible actions without confirmation.
        </AlertDescription>
      </Alert>
    </div>
  )
}