import { 
  IAgent, 
  IAgentRegistry, 
  IAgentConfiguration, 
  ILogger,
  IStateManager,
  ICommunicationBus,
  IMonitoringService,
  IErrorHandler
} from './types'
import { v4 as uuidv4 } from 'uuid'

export class AgentRegistry implements IAgentRegistry {
  private agentTypes: Map<string, new (...args: any[]) => IAgent> = new Map()
  private agents: Map<string, IAgent> = new Map()
  private logger: ILogger
  private stateManager: IStateManager
  private communicationBus: ICommunicationBus
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler

  constructor(
    logger: ILogger,
    stateManager: IStateManager,
    communicationBus: ICommunicationBus,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler
  ) {
    this.logger = logger
    this.stateManager = stateManager
    this.communicationBus = communicationBus
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
  }

  registerAgentType(type: string, agentClass: new (...args: any[]) => IAgent): void {
    if (this.agentTypes.has(type)) {
      this.logger.warn(`Agent type ${type} is already registered`, { type })
      return
    }

    this.agentTypes.set(type, agentClass)
    this.logger.info(`Registered agent type ${type}`, { type })
  }

  getAgentType(type: string): new (...args: any[]) => IAgent | undefined {
    return this.agentTypes.get(type) || undefined
  }

  getAllAgentTypes(): Map<string, new (...args: any[]) => IAgent> {
    return new Map(this.agentTypes)
  }

  async createAgent(type: string, config: IAgentConfiguration): Promise<IAgent> {
    const AgentClass = this.agentTypes.get(type)
    if (!AgentClass) {
      throw new Error(`Agent type ${type} is not registered`)
    }

    // Generate ID if not provided
    if (!config.id) {
      config.id = uuidv4()
    }

    // Check if agent with same ID already exists
    if (this.agents.has(config.id)) {
      throw new Error(`Agent with ID ${config.id} already exists`)
    }

    try {
      this.logger.info(`Creating agent of type ${type}`, { 
        type, 
        agentId: config.id,
        config 
      })

      // Create agent instance
      const agent = new AgentClass(
        config,
        this.logger,
        this.stateManager,
        this.communicationBus,
        this.monitoringService,
        this.errorHandler
      )

      // Initialize the agent
      await agent.initialize()

      // Store the agent
      this.agents.set(config.id, agent)

      this.logger.info(`Agent created successfully`, { 
        type, 
        agentId: config.id 
      })

      return agent
    } catch (error) {
      this.logger.error(`Failed to create agent of type ${type}`, error as Error, { 
        type, 
        agentId: config.id 
      })
      throw error
    }
  }

  getAgent(id: string): IAgent | undefined {
    return this.agents.get(id)
  }

  getAllAgents(): Map<string, IAgent> {
    return new Map(this.agents)
  }

  async destroyAgent(id: string): Promise<boolean> {
    const agent = this.agents.get(id)
    if (!agent) {
      this.logger.warn(`Agent with ID ${id} not found`, { agentId: id })
      return false
    }

    try {
      this.logger.info(`Destroying agent ${id}`, { agentId: id })

      // Cleanup the agent
      await agent.cleanup()

      // Remove from registry
      this.agents.delete(id)

      this.logger.info(`Agent destroyed successfully`, { agentId: id })
      return true
    } catch (error) {
      this.logger.error(`Failed to destroy agent ${id}`, error as Error, { agentId: id })
      return false
    }
  }

  // Helper methods
  getAgentsByType(type: string): IAgent[] {
    return Array.from(this.agents.values()).filter(agent => agent.type === type)
  }

  getActiveAgents(): IAgent[] {
    return Array.from(this.agents.values()).filter(agent => agent.isActive)
  }

  getRunningAgents(): IAgent[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === 'RUNNING')
  }

  async startAllAgents(): Promise<void> {
    const startPromises = Array.from(this.agents.values()).map(agent => 
      agent.start().catch(error => {
        this.logger.error(`Failed to start agent ${agent.id}`, error, { agentId: agent.id })
      })
    )

    await Promise.all(startPromises)
  }

  async stopAllAgents(): Promise<void> {
    const stopPromises = Array.from(this.agents.values()).map(agent => 
      agent.stop().catch(error => {
        this.logger.error(`Failed to stop agent ${agent.id}`, error, { agentId: agent.id })
      })
    )

    await Promise.all(stopPromises)
  }

  async cleanupAllAgents(): Promise<void> {
    const cleanupPromises = Array.from(this.agents.entries()).map(([id, agent]) => 
      this.destroyAgent(id).catch(error => {
        this.logger.error(`Failed to cleanup agent ${id}`, error, { agentId: id })
      })
    )

    await Promise.all(cleanupPromises)
  }

  getAgentCount(): number {
    return this.agents.size
  }

  getAgentTypeCount(): number {
    return this.agentTypes.size
  }

  getAgentStats(): {
    total: number
    active: number
    running: number
    byType: Record<string, number>
  } {
    const agents = Array.from(this.agents.values())
    const byType: Record<string, number> = {}

    agents.forEach(agent => {
      byType[agent.type] = (byType[agent.type] || 0) + 1
    })

    return {
      total: agents.length,
      active: agents.filter(a => a.isActive).length,
      running: agents.filter(a => a.status === 'RUNNING').length,
      byType
    }
  }
}