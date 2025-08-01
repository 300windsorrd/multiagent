import {
  IAgent,
  ILogger,
  IMonitoringService,
  IErrorHandler,
  IStateManager,
  IAgentRegistry
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface IAgentLifecycleManager {
  initializeAgent(agentId: string, config?: any): Promise<boolean>
  shutdownAgent(agentId: string): Promise<boolean>
  restartAgent(agentId: string, config?: any): Promise<boolean>
  getAgentState(agentId: string): Promise<any>
  getAgentLifecycle(agentId: string): Promise<any>
  getAllAgentStates(): Promise<Record<string, any>>
  getAllAgentLifecycles(): Promise<any[]>
  pauseAgent(agentId: string): Promise<boolean>
  resumeAgent(agentId: string): Promise<boolean>
  updateAgentMetrics(agentId: string, metrics: any): Promise<void>
}

export class AgentLifecycleManager extends EventEmitter implements IAgentLifecycleManager {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private stateManager: IStateManager
  private agentRegistry: IAgentRegistry
  private activeAgents: Map<string, IAgent> = new Map()
  private agentStates: Map<string, AgentState> = new Map()
  private agentLifecycles: Map<string, AgentLifecycle> = new Map()
  private initializationTimeout: number = 30000 // 30 seconds
  private shutdownTimeout: number = 10000 // 10 seconds

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler,
    stateManager: IStateManager,
    agentRegistry: IAgentRegistry
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
    this.stateManager = stateManager
    this.agentRegistry = agentRegistry
  }

  async initializeAgent(agentId: string, config?: any): Promise<boolean> {
    try {
      this.logger.info(`Initializing agent ${agentId}`, { agentId, config })

      // Check if agent is already initialized
      if (this.agentStates.get(agentId) === AgentState.RUNNING) {
        this.logger.warn(`Agent ${agentId} is already running`, { agentId })
        return true
      }

      // Update agent state
      this.agentStates.set(agentId, AgentState.INITIALIZING)

      // Get agent from registry
      const agent = this.agentRegistry.getAgent(agentId)
      if (!agent) {
        throw new Error(`Agent ${agentId} not found in registry`)
      }

      // Store agent
      this.activeAgents.set(agentId, agent)

      // Create lifecycle record
      const lifecycle: AgentLifecycle = {
        id: uuidv4(),
        agentId,
        state: AgentState.INITIALIZING,
        startTime: new Date(),
        config: config || {},
        metrics: {
          initializationTime: 0,
          uptime: 0,
          taskCount: 0,
          errorCount: 0
        }
      }
      this.agentLifecycles.set(agentId, lifecycle)

      // Set initialization timeout
      const initTimeout = setTimeout(() => {
        if (this.agentStates.get(agentId) === AgentState.INITIALIZING) {
          this.failInitialization(agentId, 'Initialization timeout')
        }
      }, this.initializationTimeout)

      try {
        // Initialize the agent
        // Initialize the agent (if it has an initialize method)
        if (typeof agent.initialize === 'function') {
          // Call initialize if it exists
          if (agent.initialize) {
            await agent.initialize()
          }
        }

        // Clear timeout
        clearTimeout(initTimeout)

        // Update state and lifecycle
        this.agentStates.set(agentId, AgentState.RUNNING)
        lifecycle.state = AgentState.RUNNING
        lifecycle.initializedAt = new Date()
        lifecycle.metrics.initializationTime = lifecycle.initializedAt.getTime() - lifecycle.startTime.getTime()

        // Record metric
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'LIFECYCLE' as any,
          name: 'initialization_time',
          value: lifecycle.metrics.initializationTime,
          unit: 'ms',
          timestamp: new Date(),
          metadata: {}
        })

        this.logger.info(`Agent ${agentId} initialized successfully`, {
          agentId,
          initializationTime: lifecycle.metrics.initializationTime
        })

        // Emit event
        this.emit('agentInitialized', { agentId, lifecycle })

        return true
      } catch (error) {
        clearTimeout(initTimeout)
        throw error
      }
    } catch (error) {
      await this.failInitialization(agentId, error instanceof Error ? error.message : String(error))
      return false
    }
  }

  async shutdownAgent(agentId: string): Promise<boolean> {
    try {
      this.logger.info(`Shutting down agent ${agentId}`, { agentId })

      const currentState = this.agentStates.get(agentId)
      if (currentState === AgentState.SHUTDOWN || currentState === AgentState.ERROR) {
        this.logger.warn(`Agent ${agentId} is already shut down`, { agentId })
        return true
      }

      // Update state
      this.agentStates.set(agentId, AgentState.SHUTTING_DOWN)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.SHUTTING_DOWN
        lifecycle.shutdownStartedAt = new Date()
      }

      const agent = this.activeAgents.get(agentId)
      if (!agent) {
        this.logger.warn(`Agent ${agentId} not found in active agents`, { agentId })
        this.agentStates.set(agentId, AgentState.SHUTDOWN)
        return true
      }

      // Set shutdown timeout
      const shutdownTimeout = setTimeout(() => {
        if (this.agentStates.get(agentId) === AgentState.SHUTTING_DOWN) {
          this.forceShutdown(agentId, 'Shutdown timeout')
        }
      }, this.shutdownTimeout)

      try {
        // Shutdown the agent
        // Shutdown the agent (if it has a shutdown method)
        // Call shutdown if it exists
        if ('shutdown' in agent && typeof (agent as any).shutdown === 'function') {
          await (agent as any).shutdown()
        }

        // Clear timeout
        clearTimeout(shutdownTimeout)

        // Update state and lifecycle
        this.agentStates.set(agentId, AgentState.SHUTDOWN)
        if (lifecycle) {
          lifecycle.state = AgentState.SHUTDOWN
          lifecycle.shutdownCompletedAt = new Date()
          lifecycle.metrics.uptime = lifecycle.shutdownCompletedAt.getTime() - lifecycle.initializedAt!.getTime()
        }

        // Record metric
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'LIFECYCLE' as any,
          name: 'uptime',
          value: lifecycle?.metrics.uptime || 0,
          unit: 'ms',
          timestamp: new Date(),
          metadata: {}
        })

        // Remove from active agents
        this.activeAgents.delete(agentId)

        this.logger.info(`Agent ${agentId} shut down successfully`, {
          agentId,
          uptime: lifecycle?.metrics.uptime
        })

        // Emit event
        this.emit('agentShutdown', { agentId, lifecycle })

        return true
      } catch (error) {
        clearTimeout(shutdownTimeout)
        throw error
      }
    } catch (error) {
      await this.failShutdown(agentId, error instanceof Error ? error.message : String(error))
      return false
    }
  }

  async restartAgent(agentId: string, config?: any): Promise<boolean> {
    try {
      this.logger.info(`Restarting agent ${agentId}`, { agentId, config })

      // Shutdown first
      const shutdownSuccess = await this.shutdownAgent(agentId)
      if (!shutdownSuccess) {
        this.logger.error(`Failed to shutdown agent ${agentId} for restart`, undefined, { agentId })
        return false
      }

      // Wait a bit before reinitializing
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Initialize again
      const initSuccess = await this.initializeAgent(agentId, config)
      if (!initSuccess) {
        this.logger.error(`Failed to initialize agent ${agentId} for restart`, undefined, { agentId })
        return false
      }

      this.logger.info(`Agent ${agentId} restarted successfully`, { agentId })
      return true
    } catch (error) {
      this.logger.error(`Failed to restart agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async getAgentState(agentId: string): Promise<AgentState> {
    return this.agentStates.get(agentId) || AgentState.UNKNOWN
  }

  async getAgentLifecycle(agentId: string): Promise<AgentLifecycle | null> {
    return this.agentLifecycles.get(agentId) || null
  }

  async getAllAgentStates(): Promise<Record<string, AgentState>> {
    const states: Record<string, AgentState> = {}
    for (const [agentId, state] of this.agentStates.entries()) {
      states[agentId] = state
    }
    return states
  }

  async getAllAgentLifecycles(): Promise<AgentLifecycle[]> {
    return Array.from(this.agentLifecycles.values())
  }

  async pauseAgent(agentId: string): Promise<boolean> {
    try {
      this.logger.info(`Pausing agent ${agentId}`, { agentId })

      const currentState = this.agentStates.get(agentId)
      if (currentState !== AgentState.RUNNING) {
        this.logger.warn(`Agent ${agentId} is not running`, { agentId })
        return false
      }

      const agent = this.activeAgents.get(agentId)
      if (!agent) {
        this.logger.warn(`Agent ${agentId} not found in active agents`, { agentId })
        return false
      }

      // Update state
      this.agentStates.set(agentId, AgentState.PAUSED)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.PAUSED
        lifecycle.pausedAt = new Date()
      }

      // Pause the agent if it has a pause method
      if (typeof agent.pause === 'function') {
        await agent.pause()
      }

      this.logger.info(`Agent ${agentId} paused successfully`, { agentId })

      // Emit event
      this.emit('agentPaused', { agentId, lifecycle })

      return true
    } catch (error) {
      this.logger.error(`Failed to pause agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async resumeAgent(agentId: string): Promise<boolean> {
    try {
      this.logger.info(`Resuming agent ${agentId}`, { agentId })

      const currentState = this.agentStates.get(agentId)
      if (currentState !== AgentState.PAUSED) {
        this.logger.warn(`Agent ${agentId} is not paused`, { agentId })
        return false
      }

      const agent = this.activeAgents.get(agentId)
      if (!agent) {
        this.logger.warn(`Agent ${agentId} not found in active agents`, { agentId })
        return false
      }

      // Update state
      this.agentStates.set(agentId, AgentState.RUNNING)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.RUNNING
        lifecycle.resumedAt = new Date()
      }

      // Resume the agent if it has a resume method
      if (typeof agent.resume === 'function') {
        await agent.resume()
      }

      this.logger.info(`Agent ${agentId} resumed successfully`, { agentId })

      // Emit event
      this.emit('agentResumed', { agentId, lifecycle })

      return true
    } catch (error) {
      this.logger.error(`Failed to resume agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async updateAgentMetrics(agentId: string, metrics: Partial<AgentLifecycle['metrics']>): Promise<void> {
    try {
      const lifecycle = this.agentLifecycles.get(agentId)
      if (!lifecycle) {
        this.logger.warn(`Lifecycle not found for agent ${agentId}`, { agentId })
        return
      }

      // Update metrics
      Object.assign(lifecycle.metrics, metrics)

      this.logger.debug(`Metrics updated for agent ${agentId}`, { agentId, metrics })
    } catch (error) {
      this.logger.error(`Failed to update metrics for agent ${agentId}`, error as Error, { agentId })
    }
  }

  private async failInitialization(agentId: string, reason: string): Promise<void> {
    try {
      this.logger.error(`Agent ${agentId} initialization failed`, undefined, { agentId, reason })

      // Update state
      this.agentStates.set(agentId, AgentState.ERROR)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.ERROR
        lifecycle.error = reason
        lifecycle.failedAt = new Date()
      }

      // Record error
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        name: 'initialization_failure',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { reason }
      })

      // Create alert
      await this.monitoringService.createAlert({
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        severity: 'HIGH' as any,
        message: `Agent initialization failed: ${reason}`,
        timestamp: new Date(),
        metadata: { reason },
        resolved: false
      })

      // Emit event
      this.emit('agentInitializationFailed', { agentId, lifecycle, reason })
    } catch (error) {
      this.logger.error(`Failed to handle initialization failure for agent ${agentId}`, error as Error, { agentId, reason })
    }
  }

  private async failShutdown(agentId: string, reason: string): Promise<void> {
    try {
      this.logger.error(`Agent ${agentId} shutdown failed`, undefined, { agentId, reason })

      // Update state
      this.agentStates.set(agentId, AgentState.ERROR)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.ERROR
        lifecycle.error = reason
        lifecycle.failedAt = new Date()
      }

      // Record error
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        name: 'shutdown_failure',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { reason }
      })

      // Create alert
      await this.monitoringService.createAlert({
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        severity: 'HIGH' as any,
        message: `Agent shutdown failed: ${reason}`,
        timestamp: new Date(),
        metadata: { reason },
        resolved: false
      })

      // Emit event
      this.emit('agentShutdownFailed', { agentId, lifecycle, reason })
    } catch (error) {
      this.logger.error(`Failed to handle shutdown failure for agent ${agentId}`, error as Error, { agentId, reason })
    }
  }

  private async forceShutdown(agentId: string, reason: string): Promise<void> {
    try {
      this.logger.error(`Force shutting down agent ${agentId}`, undefined, { agentId, reason })

      // Update state
      this.agentStates.set(agentId, AgentState.SHUTDOWN)

      const lifecycle = this.agentLifecycles.get(agentId)
      if (lifecycle) {
        lifecycle.state = AgentState.SHUTDOWN
        lifecycle.error = reason
        lifecycle.shutdownCompletedAt = new Date()
      }

      // Remove from active agents
      this.activeAgents.delete(agentId)

      // Record error
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        name: 'force_shutdown',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { reason }
      })

      // Emit event
      this.emit('agentForceShutdown', { agentId, lifecycle, reason })
    } catch (error) {
      this.logger.error(`Failed to force shutdown agent ${agentId}`, error as Error, { agentId, reason })
    }
  }

  // Utility methods
  getActiveAgents(): IAgent[] {
    return Array.from(this.activeAgents.values())
  }

  getActiveAgentIds(): string[] {
    return Array.from(this.activeAgents.keys())
  }

  isAgentActive(agentId: string): boolean {
    return this.activeAgents.has(agentId)
  }

  getAgentCount(): number {
    return this.activeAgents.size
  }

  getAgentCountByState(): Record<AgentState, number> {
    const counts: Record<AgentState, number> = {
      [AgentState.UNKNOWN]: 0,
      [AgentState.INITIALIZING]: 0,
      [AgentState.RUNNING]: 0,
      [AgentState.PAUSED]: 0,
      [AgentState.SHUTTING_DOWN]: 0,
      [AgentState.SHUTDOWN]: 0,
      [AgentState.ERROR]: 0
    }

    for (const state of this.agentStates.values()) {
      counts[state]++
    }

    return counts
  }
}

export enum AgentState {
  UNKNOWN = 'UNKNOWN',
  INITIALIZING = 'INITIALIZING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  SHUTDOWN = 'SHUTDOWN',
  ERROR = 'ERROR'
}

interface AgentLifecycle {
  id: string
  agentId: string
  state: AgentState
  startTime: Date
  initializedAt?: Date
  pausedAt?: Date
  resumedAt?: Date
  shutdownStartedAt?: Date
  shutdownCompletedAt?: Date
  failedAt?: Date
  config: any
  error?: string
  metrics: {
    initializationTime: number
    uptime: number
    taskCount: number
    errorCount: number
  }
}