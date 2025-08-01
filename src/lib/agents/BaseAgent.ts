import {
  IAgent,
  IAgentConfiguration,
  IAgentState,
  ITask,
  ITaskResult,
  IMessage,
  ILogger,
  IStateManager,
  ICommunicationBus,
  IMonitoringService,
  IErrorHandler,
  MessageType
} from './types'
import { AgentType, AgentStatus, AgentExecutionStatus } from '.prisma/client'
import { v4 as uuidv4 } from 'uuid'

export abstract class BaseAgent implements IAgent {
  public id: string
  public name: string
  public description: string
  public type: AgentType
  public status: AgentStatus
  public version: string
  public config: Record<string, any>
  public metadata: Record<string, any>
  public isActive: boolean

  protected logger: ILogger
  protected stateManager: IStateManager
  protected communicationBus: ICommunicationBus
  protected monitoringService: IMonitoringService
  protected errorHandler: IErrorHandler

  protected isInitialized: boolean = false
  protected isRunning: boolean = false
  protected startTime?: Date

  constructor(
    config: IAgentConfiguration,
    logger: ILogger,
    stateManager: IStateManager,
    communicationBus: ICommunicationBus,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler
  ) {
    this.id = config.id
    this.name = config.name
    this.description = config.config.description || ''
    this.type = config.config.type as AgentType
    this.status = AgentStatus.IDLE
    this.version = config.version
    this.config = config.config
    this.metadata = config.config.metadata || {}
    this.isActive = config.isActive

    this.logger = logger
    this.stateManager = stateManager
    this.communicationBus = communicationBus
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
  }

  // Lifecycle methods
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn(`Agent ${this.id} is already initialized`, { agentId: this.id })
      return
    }

    try {
      this.logger.info(`Initializing agent ${this.name}`, { agentId: this.id, type: this.type })
      
      // Load previous state if exists
      const previousState = await this.stateManager.loadState(this.id)
      if (previousState) {
        this.logger.info(`Loaded previous state for agent ${this.id}`, { agentId: this.id })
      }

      // Perform agent-specific initialization
      await this.onInitialize()

      // Subscribe to communication bus
      this.communicationBus.subscribe(this.id, async (message: IMessage) => {
        await this.handleMessage(message)
      })

      this.isInitialized = true
      this.status = AgentStatus.IDLE
      this.logger.info(`Agent ${this.name} initialized successfully`, { agentId: this.id })

      // Record initialization metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'initialization_time',
        value: Date.now(),
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to initialize agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'initialize',
        metadata: { config: this.config }
      })
      throw error
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error(`Agent ${this.id} is not initialized`)
    }

    if (this.isRunning) {
      this.logger.warn(`Agent ${this.id} is already running`, { agentId: this.id })
      return
    }

    try {
      this.logger.info(`Starting agent ${this.name}`, { agentId: this.id })
      
      // Perform agent-specific start logic
      await this.onStart()

      this.isRunning = true
      this.startTime = new Date()
      this.status = AgentStatus.RUNNING
      this.logger.info(`Agent ${this.name} started successfully`, { agentId: this.id })

      // Record start metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'agent_start',
        value: 1,
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to start agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'start',
        metadata: {}
      })
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn(`Agent ${this.id} is not running`, { agentId: this.id })
      return
    }

    try {
      this.logger.info(`Stopping agent ${this.name}`, { agentId: this.id })
      
      // Perform agent-specific stop logic
      await this.onStop()

      this.isRunning = false
      this.status = AgentStatus.STOPPED
      this.logger.info(`Agent ${this.name} stopped successfully`, { agentId: this.id })

      // Record stop metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'agent_stop',
        value: 1,
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to stop agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'stop',
        metadata: {}
      })
      throw error
    }
  }

  async pause(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn(`Agent ${this.id} is not running`, { agentId: this.id })
      return
    }

    if (this.status === AgentStatus.PAUSED) {
      this.logger.warn(`Agent ${this.id} is already paused`, { agentId: this.id })
      return
    }

    try {
      this.logger.info(`Pausing agent ${this.name}`, { agentId: this.id })
      
      // Perform agent-specific pause logic
      await this.onPause()

      this.status = AgentStatus.PAUSED
      this.logger.info(`Agent ${this.name} paused successfully`, { agentId: this.id })

      // Record pause metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'agent_pause',
        value: 1,
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to pause agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'pause',
        metadata: {}
      })
      throw error
    }
  }

  async resume(): Promise<void> {
    if (this.status !== AgentStatus.PAUSED) {
      this.logger.warn(`Agent ${this.id} is not paused`, { agentId: this.id })
      return
    }

    try {
      this.logger.info(`Resuming agent ${this.name}`, { agentId: this.id })
      
      // Perform agent-specific resume logic
      await this.onResume()

      this.status = AgentStatus.RUNNING
      this.logger.info(`Agent ${this.name} resumed successfully`, { agentId: this.id })

      // Record resume metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'agent_resume',
        value: 1,
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to resume agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'resume',
        metadata: {}
      })
      throw error
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.logger.info(`Cleaning up agent ${this.name}`, { agentId: this.id })
      
      // Unsubscribe from communication bus
      this.communicationBus.unsubscribe(this.id)

      // Perform agent-specific cleanup
      await this.onCleanup()

      // Save final state
      const currentState = await this.getState()
      await this.stateManager.saveState(this.id, currentState)

      this.isInitialized = false
      this.isRunning = false
      this.status = AgentStatus.STOPPED
      this.logger.info(`Agent ${this.name} cleaned up successfully`, { agentId: this.id })

      // Record cleanup metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'custom' as any,
        name: 'agent_cleanup',
        value: 1,
        timestamp: new Date(),
        metadata: { status: 'success' }
      })
    } catch (error) {
      this.logger.error(`Failed to cleanup agent ${this.name}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'cleanup',
        metadata: {}
      })
      throw error
    }
  }

  // Core functionality
  async execute(task: ITask): Promise<ITaskResult> {
    if (!this.isInitialized || !this.isRunning) {
      throw new Error(`Agent ${this.id} is not ready to execute tasks`)
    }

    const startTime = Date.now()
    this.logger.info(`Executing task ${task.id}`, { agentId: this.id, taskId: task.id, taskType: task.type })

    try {
      // Execute task-specific logic
      const result = await this.onExecute(task)

      const duration = Date.now() - startTime
      this.logger.info(`Task ${task.id} completed successfully`, { 
        agentId: this.id, 
        taskId: task.id, 
        duration 
      })

      // Record execution metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'response_time' as any,
        name: 'task_execution_time',
        value: duration,
        unit: 'ms',
        timestamp: new Date(),
        metadata: { taskId: task.id, taskType: task.type, success: true }
      })

      return {
        taskId: task.id,
        success: true,
        output: result,
        duration,
        metadata: { agentId: this.id, taskType: task.type }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      this.logger.error(`Task ${task.id} failed`, error as Error, { agentId: this.id, taskId: task.id })

      // Record error metric
      await this.monitoringService.recordMetric(this.id, {
        id: uuidv4(),
        agentId: this.id,
        type: 'error_rate' as any,
        name: 'task_execution_error',
        value: 1,
        timestamp: new Date(),
        metadata: { taskId: task.id, taskType: task.type, error: (error as Error).message }
      })

      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        taskId: task.id,
        operation: 'execute',
        metadata: { task }
      })

      return {
        taskId: task.id,
        success: false,
        output: {},
        error: (error as Error).message,
        duration,
        metadata: { agentId: this.id, taskType: task.type }
      }
    }
  }

  async handleMessage(message: IMessage): Promise<IMessage | void> {
    if (!this.isInitialized) {
      this.logger.warn(`Agent ${this.id} received message but is not initialized`, { 
        agentId: this.id, 
        messageId: message.id 
      })
      return
    }

    this.logger.info(`Received message from ${message.from}`, { 
      agentId: this.id, 
      messageId: message.id, 
      messageType: message.type 
    })

    try {
      const response = await this.onHandleMessage(message)

      if (message.requiresResponse && response) {
        await this.communicationBus.send(response)
      }

      return response
    } catch (error) {
      this.logger.error(`Failed to handle message ${message.id}`, error as Error, { 
        agentId: this.id, 
        messageId: message.id 
      })

      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'handleMessage',
        metadata: { message }
      })

      if (message.requiresResponse) {
        const errorMessage: IMessage = {
          id: uuidv4(),
          type: MessageType.ERROR,
          from: this.id,
          to: message.from,
          subject: `Error: ${message.subject}`,
          content: { 
            error: (error as Error).message,
            originalMessageId: message.id 
          },
          timestamp: new Date(),
          priority: message.priority,
          requiresResponse: false,
          correlationId: message.correlationId,
          metadata: {}
        }

        await this.communicationBus.send(errorMessage)
        return errorMessage
      }
    }
  }

  async getState(): Promise<IAgentState> {
    const state: IAgentState = {
      id: uuidv4(),
      state: {
        isInitialized: this.isInitialized,
        isRunning: this.isRunning,
        status: this.status,
        startTime: this.startTime,
        config: this.config,
        metadata: this.metadata
      },
      context: await this.getAgentContext(),
      metadata: {
        version: this.version,
        type: this.type,
        lastUpdated: new Date()
      },
      lastUpdated: new Date()
    }

    return state
  }

  async setState(state: IAgentState): Promise<void> {
    this.logger.info(`Setting state for agent ${this.id}`, { agentId: this.id })

    try {
      this.isInitialized = state.state.isInitialized
      this.isRunning = state.state.isRunning
      this.status = state.state.status
      this.startTime = state.state.startTime
      this.config = state.state.config || this.config
      this.metadata = state.metadata || this.metadata

      await this.onSetState(state)
      this.logger.info(`State set successfully for agent ${this.id}`, { agentId: this.id })
    } catch (error) {
      this.logger.error(`Failed to set state for agent ${this.id}`, error as Error, { agentId: this.id })
      await this.errorHandler.handleError(error as Error, {
        agentId: this.id,
        operation: 'setState',
        metadata: { state }
      })
      throw error
    }
  }

  // Abstract methods to be implemented by specific agent types
  protected abstract onInitialize(): Promise<void>
  protected abstract onStart(): Promise<void>
  protected abstract onStop(): Promise<void>
  protected abstract onPause(): Promise<void>
  protected abstract onResume(): Promise<void>
  protected abstract onCleanup(): Promise<void>
  protected abstract onExecute(task: ITask): Promise<Record<string, any>>
  protected abstract onHandleMessage(message: IMessage): Promise<IMessage | void>
  protected abstract getAgentContext(): Promise<Record<string, any>>
  protected abstract onSetState(state: IAgentState): Promise<void>
}