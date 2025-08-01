import {
  ILogger,
  IAgentState,
  IStateManager
} from './types'
import { v4 as uuidv4 } from 'uuid'

export interface IErrorRecovery {
  recover(agentId: string, stateManager: IStateManager): Promise<boolean>
  addRecoveryStrategy(agentId: string, strategy: RecoveryStrategy): Promise<void>
  removeRecoveryStrategy(agentId: string, strategyName: string): Promise<void>
  getRecoveryHistory(agentId?: string): Promise<RecoveryAttempt[]>
  getRecoveryStats(agentId?: string): Promise<RecoveryStats>
  configure(config: RecoveryConfig): Promise<void>
}

export interface RecoveryStrategy {
  name: string
  description: string
  canRecover: (error: Error, context: RecoveryContext) => Promise<boolean>
  recover: (error: Error, context: RecoveryContext) => Promise<RecoveryResult>
  priority: number // Higher number = higher priority
}

export interface RecoveryContext {
  agentId: string
  taskId?: string
  operation?: string
  error: Error
  timestamp: Date
  metadata?: any
}

export interface RecoveryResult {
  success: boolean
  message: string
  actionTaken?: string
  newState?: IAgentState
  retryPossible?: boolean
}

export interface RecoveryAttempt {
  id: string
  agentId: string
  strategyName: string
  error: Error
  context: RecoveryContext
  result: RecoveryResult
  timestamp: Date
  duration: number
}

export interface RecoveryStats {
  totalAttempts: number
  successfulAttempts: number
  failedAttempts: number
  successRate: number
  averageRecoveryTime: number
  strategiesBySuccess: Record<string, number>
  errorsByRecovery: Record<string, number>
}

export interface RecoveryConfig {
  maxAttempts?: number
  retryDelay?: number
  timeout?: number
  enableAutoRecovery?: boolean
  logRecoveryAttempts?: boolean
}

export class ErrorRecovery implements IErrorRecovery {
  private logger: ILogger
  private recoveryStrategies: Map<string, RecoveryStrategy[]> = new Map()
  private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map()
  private config: RecoveryConfig = {
    maxAttempts: 3,
    retryDelay: 5000,
    timeout: 30000,
    enableAutoRecovery: true,
    logRecoveryAttempts: true
  }

  constructor(logger: ILogger) {
    this.logger = logger
  }

  async recover(agentId: string, stateManager: IStateManager): Promise<boolean> {
    try {
      this.logger.info(`Attempting recovery for agent ${agentId}`, { agentId })

      // Get agent's current state
      const currentState = await stateManager.getState(agentId)
      if (!currentState) {
        this.logger.warn(`No state found for agent ${agentId}`, { agentId })
        return false
      }

      // Get recovery strategies for this agent
      const strategies = this.recoveryStrategies.get(agentId) || []
      if (strategies.length === 0) {
        this.logger.warn(`No recovery strategies found for agent ${agentId}`, { agentId })
        return false
      }

      // Sort strategies by priority (highest first)
      strategies.sort((a, b) => b.priority - a.priority)

      let recoverySuccessful = false
      let lastResult: RecoveryResult | null = null

      for (const strategy of strategies) {
        try {
          const startTime = Date.now()
          
          // Create recovery context
          const context: RecoveryContext = {
            agentId,
            timestamp: new Date(),
            error: new Error('Agent recovery needed'),
            metadata: { currentState }
          }

          // Check if strategy can recover
          if (await strategy.canRecover(context.error, context)) {
            this.logger.info(`Attempting recovery with strategy ${strategy.name}`, { 
              agentId, 
              strategyName: strategy.name 
            })

            // Execute recovery
            const result = await strategy.recover(context.error, context)
            const duration = Date.now() - startTime

            // Record attempt
            const attempt: RecoveryAttempt = {
              id: uuidv4(),
              agentId,
              strategyName: strategy.name,
              error: context.error,
              context,
              result,
              timestamp: new Date(),
              duration
            }

            await this.recordRecoveryAttempt(attempt)

            if (result.success) {
              recoverySuccessful = true
              lastResult = result

              // Update agent state if new state provided
              if (result.newState) {
                await stateManager.setState(agentId, result.newState, `Recovery using ${strategy.name}`)
              }

              this.logger.info(`Recovery successful for agent ${agentId}`, { 
                agentId, 
                strategyName: strategy.name,
                duration 
              })

              break
            } else {
              this.logger.warn(`Recovery failed for agent ${agentId}`, { 
                agentId, 
                strategyName: strategy.name,
                result: result.message 
              })
            }
          }
        } catch (strategyError) {
          this.logger.error(`Recovery strategy failed for agent ${agentId}`, strategyError as Error, { 
            agentId, 
            strategyName: strategy.name 
          })
        }
      }

      return recoverySuccessful
    } catch (error) {
      this.logger.error(`Failed to recover agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async addRecoveryStrategy(agentId: string, strategy: RecoveryStrategy): Promise<void> {
    try {
      this.logger.info(`Adding recovery strategy for agent ${agentId}`, { 
        agentId, 
        strategyName: strategy.name 
      })

      if (!this.recoveryStrategies.has(agentId)) {
        this.recoveryStrategies.set(agentId, [])
      }

      const strategies = this.recoveryStrategies.get(agentId)!
      
      // Check if strategy already exists
      const existingIndex = strategies.findIndex(s => s.name === strategy.name)
      if (existingIndex !== -1) {
        strategies[existingIndex] = strategy
      } else {
        strategies.push(strategy)
      }

      this.logger.info(`Recovery strategy added successfully for agent ${agentId}`, { 
        agentId, 
        strategyName: strategy.name 
      })
    } catch (error) {
      this.logger.error(`Failed to add recovery strategy for agent ${agentId}`, error as Error, { 
        agentId, 
        strategyName: strategy.name 
      })
      throw error
    }
  }

  async removeRecoveryStrategy(agentId: string, strategyName: string): Promise<void> {
    try {
      this.logger.info(`Removing recovery strategy for agent ${agentId}`, { 
        agentId, 
        strategyName 
      })

      const strategies = this.recoveryStrategies.get(agentId)
      if (strategies) {
        const index = strategies.findIndex(s => s.name === strategyName)
        if (index !== -1) {
          strategies.splice(index, 1)
          this.logger.info(`Recovery strategy removed successfully for agent ${agentId}`, { 
            agentId, 
            strategyName 
          })
        } else {
          this.logger.warn(`Recovery strategy not found for agent ${agentId}`, { 
            agentId, 
            strategyName 
          })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove recovery strategy for agent ${agentId}`, error as Error, { 
        agentId, 
        strategyName 
      })
      throw error
    }
  }

  async getRecoveryHistory(agentId?: string): Promise<RecoveryAttempt[]> {
    try {
      let history: RecoveryAttempt[] = []

      if (agentId) {
        // Get history for specific agent
        history = this.recoveryHistory.get(agentId) || []
      } else {
        // Get history for all agents
        for (const agentHistory of this.recoveryHistory.values()) {
          history.push(...agentHistory)
        }
      }

      // Sort by timestamp (newest first)
      history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return history
    } catch (error) {
      this.logger.error('Failed to get recovery history', error as Error, { agentId })
      throw error
    }
  }

  async getRecoveryStats(agentId?: string): Promise<RecoveryStats> {
    try {
      let totalAttempts = 0
      let successfulAttempts = 0
      let failedAttempts = 0
      let totalRecoveryTime = 0
      let strategiesBySuccess: Record<string, number> = {}
      let errorsByRecovery: Record<string, number> = {}

      if (agentId) {
        // Get stats for specific agent
        const history = this.recoveryHistory.get(agentId) || []
        totalAttempts = history.length
        
        for (const attempt of history) {
          if (attempt.result.success) {
            successfulAttempts++
            strategiesBySuccess[attempt.strategyName] = (strategiesBySuccess[attempt.strategyName] || 0) + 1
          } else {
            failedAttempts++
          }
          
          totalRecoveryTime += attempt.duration
          errorsByRecovery[attempt.error.name] = (errorsByRecovery[attempt.error.name] || 0) + 1
        }
      } else {
        // Get stats for all agents
        for (const [agentId, history] of this.recoveryHistory.entries()) {
          totalAttempts += history.length
          
          for (const attempt of history) {
            if (attempt.result.success) {
              successfulAttempts++
              strategiesBySuccess[attempt.strategyName] = (strategiesBySuccess[attempt.strategyName] || 0) + 1
            } else {
              failedAttempts++
            }
            
            totalRecoveryTime += attempt.duration
            errorsByRecovery[attempt.error.name] = (errorsByRecovery[attempt.error.name] || 0) + 1
          }
        }
      }

      const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0
      const averageRecoveryTime = totalAttempts > 0 ? totalRecoveryTime / totalAttempts : 0

      return {
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        successRate,
        averageRecoveryTime,
        strategiesBySuccess,
        errorsByRecovery
      }
    } catch (error) {
      this.logger.error('Failed to get recovery stats', error as Error, { agentId })
      throw error
    }
  }

  async configure(config: RecoveryConfig): Promise<void> {
    try {
      this.logger.info('Configuring error recovery', { config })

      if (config.maxAttempts !== undefined) {
        this.config.maxAttempts = config.maxAttempts
      }

      if (config.retryDelay !== undefined) {
        this.config.retryDelay = config.retryDelay
      }

      if (config.timeout !== undefined) {
        this.config.timeout = config.timeout
      }

      if (config.enableAutoRecovery !== undefined) {
        this.config.enableAutoRecovery = config.enableAutoRecovery
      }

      if (config.logRecoveryAttempts !== undefined) {
        this.config.logRecoveryAttempts = config.logRecoveryAttempts
      }

      this.logger.info('Error recovery configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure error recovery', error as Error, { config })
      throw error
    }
  }

  private async recordRecoveryAttempt(attempt: RecoveryAttempt): Promise<void> {
    try {
      if (!this.config.logRecoveryAttempts) {
        return
      }

      const agentId = attempt.agentId
      if (!this.recoveryHistory.has(agentId)) {
        this.recoveryHistory.set(agentId, [])
      }

      const history = this.recoveryHistory.get(agentId)!
      history.push(attempt)

      // Keep only recent history (last 100 attempts per agent)
      if (history.length > 100) {
        history.splice(0, history.length - 100)
      }
    } catch (error) {
      this.logger.error('Failed to record recovery attempt', error as Error, { attempt })
    }
  }

  // Utility methods
  getStrategyCount(agentId?: string): number {
    if (agentId) {
      return this.recoveryStrategies.get(agentId)?.length || 0
    } else {
      let count = 0
      for (const strategies of this.recoveryStrategies.values()) {
        count += strategies.length
      }
      return count
    }
  }

  getAgentIds(): string[] {
    return Array.from(this.recoveryStrategies.keys())
  }

  // Built-in recovery strategies
  static createRestartStrategy(): RecoveryStrategy {
    return {
      name: 'restart',
      description: 'Restart the agent',
      priority: 10,
      canRecover: async (error: Error, context: RecoveryContext) => {
        // Can recover from most errors except critical ones
        return !context.metadata?.critical
      },
      recover: async (error: Error, context: RecoveryContext) => {
        try {
          // Simulate restart by resetting state
          const newState: IAgentState = {
            id: uuidv4(),
            state: {
              isInitialized: false,
              isRunning: false,
              status: 'IDLE' as any,
              startTime: undefined,
              config: context.metadata?.currentState?.state?.config || {},
              metadata: {}
            },
            context: {},
            metadata: {
              version: '1.0.0',
              type: context.metadata?.currentState?.metadata?.type || 'UNKNOWN',
              lastUpdated: new Date()
            },
            lastUpdated: new Date()
          }

          return {
            success: true,
            message: 'Agent restarted successfully',
            actionTaken: 'restart',
            newState,
            retryPossible: true
          }
        } catch (restartError) {
          return {
            success: false,
            message: `Failed to restart agent: ${(restartError as Error).message}`,
            retryPossible: false
          }
        }
      }
    }
  }

  static createResetStrategy(): RecoveryStrategy {
    return {
      name: 'reset',
      description: 'Reset agent to initial state',
      priority: 5,
      canRecover: async (error: Error, context: RecoveryContext) => {
        // Can recover from state-related errors
        return error.message.includes('state') || error.message.includes('memory')
      },
      recover: async (error: Error, context: RecoveryContext) => {
        try {
          // Simulate reset by clearing state
          const newState: IAgentState = {
            id: uuidv4(),
            state: {
              isInitialized: true,
              isRunning: false,
              status: 'IDLE' as any,
              startTime: undefined,
              config: context.metadata?.currentState?.state?.config || {},
              metadata: {}
            },
            context: {},
            metadata: {
              version: context.metadata?.currentState?.metadata?.version || '1.0.0',
              type: context.metadata?.currentState?.metadata?.type || 'UNKNOWN',
              lastUpdated: new Date()
            },
            lastUpdated: new Date()
          }

          return {
            success: true,
            message: 'Agent reset successfully',
            actionTaken: 'reset',
            newState,
            retryPossible: true
          }
        } catch (resetError) {
          return {
            success: false,
            message: `Failed to reset agent: ${(resetError as Error).message}`,
            retryPossible: false
          }
        }
      }
    }
  }

  static createRetryStrategy(maxRetries: number = 3): RecoveryStrategy {
    return {
      name: 'retry',
      description: 'Retry the failed operation',
      priority: 1,
      canRecover: async (error: Error, context: RecoveryContext) => {
        // Can retry transient errors
        return error.message.includes('timeout') || 
               error.message.includes('network') ||
               error.message.includes('temporary')
      },
      recover: async (error: Error, context: RecoveryContext) => {
        try {
          // Simulate retry by just returning success
          // In a real implementation, this would retry the actual operation
          return {
            success: true,
            message: 'Operation retried successfully',
            actionTaken: 'retry',
            retryPossible: true
          }
        } catch (retryError) {
          return {
            success: false,
            message: `Retry failed: ${(retryError as Error).message}`,
            retryPossible: maxRetries > 1
          }
        }
      }
    }
  }
}