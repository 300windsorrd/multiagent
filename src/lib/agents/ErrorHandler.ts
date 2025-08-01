import {
  ILogger,
  IMonitoringService
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface IErrorHandler {
  handleError(error: Error, context: any): Promise<any>
  addErrorHandler(agentId: string, handler: any): Promise<void>
  removeErrorHandler(agentId: string, handler?: any): Promise<void>
  addErrorRecoveryStrategy(agentId: string, strategy: any): Promise<void>
  removeErrorRecoveryStrategy(agentId: string, strategyName: string): Promise<void>
  getErrorHistory(agentId?: string, limit?: number): Promise<any[]>
  getErrorAlerts(agentId?: string, resolved?: boolean): Promise<any[]>
  resolveErrorAlert(alertId: string): Promise<boolean>
  getErrorStats(agentId?: string): Promise<any>
  configure(config: any): Promise<void>
}

export class ErrorHandler extends EventEmitter implements IErrorHandler {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHistory: Map<string, ErrorHistoryEntry[]> = new Map()
  private errorHandlers: Map<string, ErrorHandlerCallback[]> = new Map()
  private errorRecoveryStrategies: Map<string, ErrorRecoveryStrategy[]> = new Map()
  private errorAlerts: Map<string, ErrorAlert[]> = new Map()
  private maxHistorySize: number = 1000
  private maxAlerts: number = 100
  private autoRetryEnabled: boolean = true
  private maxRetries: number = 3
  private retryDelay: number = 5000 // 5 seconds

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
  }

  async handleError(error: Error, context: ErrorContext): Promise<ErrorResult> {
    try {
      this.logger.error(`Handling error: ${error.message}`, error, context)

      const errorId = uuidv4()
      const timestamp = new Date()

      // Create error entry
      const errorEntry: ErrorHistoryEntry = {
        id: errorId,
        error,
        context,
        timestamp,
        handled: false,
        resolved: false
      }

      // Add to history
      await this.addToHistory(context.agentId || 'system', errorEntry)

      // Determine error severity
      const severity = this.determineErrorSeverity(error, context)

      // Create alert if necessary
      if (severity !== 'LOW') {
        await this.createAlert(errorEntry, severity)
      }

      // Execute error handlers
      const handlerResult = await this.executeErrorHandlers(errorEntry, severity)

      // Try recovery if enabled
      let recoveryResult: RecoveryResult | null = null
      if (this.autoRetryEnabled && this.shouldAttemptRecovery(error, context)) {
        recoveryResult = await this.attemptRecovery(errorEntry)
      }

      // Mark as handled
      errorEntry.handled = true

      // Record metrics
      await this.recordErrorMetrics(errorEntry, severity, handlerResult, recoveryResult)

      // Create result
      const result: ErrorResult = {
        errorId,
        success: handlerResult.success || (recoveryResult?.success || false),
        severity,
        message: error.message,
        handled: true,
        recoveryAttempted: recoveryResult !== null,
        recoverySuccess: recoveryResult?.success || false,
        timestamp
      }

      this.logger.info(`Error handled successfully`, {
        errorId,
        severity,
        success: result.success,
        recoveryAttempted: result.recoveryAttempted
      })

      // Emit event
      this.emit('errorHandled', { errorEntry, result, severity, handlerResult, recoveryResult })

      return result
    } catch (handlingError) {
      this.logger.error('Failed to handle error', handlingError as Error, { originalError: error, context })
      
      // Return basic result even if handling fails
      return {
        errorId: uuidv4(),
        success: false,
        severity: 'HIGH',
        message: error.message,
        handled: false,
        recoveryAttempted: false,
        recoverySuccess: false,
        timestamp: new Date()
      }
    }
  }

  async addErrorHandler(agentId: string, handler: ErrorHandlerCallback): Promise<void> {
    try {
      this.logger.info(`Adding error handler for agent ${agentId}`, { agentId })

      if (!this.errorHandlers.has(agentId)) {
        this.errorHandlers.set(agentId, [])
      }

      const handlers = this.errorHandlers.get(agentId)!
      handlers.push(handler)

      this.logger.info(`Error handler added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add error handler for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeErrorHandler(agentId: string, handler?: ErrorHandlerCallback): Promise<void> {
    try {
      this.logger.info(`Removing error handler for agent ${agentId}`, { agentId })

      const handlers = this.errorHandlers.get(agentId)
      if (handlers) {
        if (handler) {
          // Remove specific handler
          const index = handlers.indexOf(handler)
          if (index !== -1) {
            handlers.splice(index, 1)
          }
        } else {
          // Remove all handlers
          this.errorHandlers.delete(agentId)
        }

        this.logger.info(`Error handler removed successfully for agent ${agentId}`, { agentId })
      }
    } catch (error) {
      this.logger.error(`Failed to remove error handler for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async addErrorRecoveryStrategy(agentId: string, strategy: ErrorRecoveryStrategy): Promise<void> {
    try {
      this.logger.info(`Adding error recovery strategy for agent ${agentId}`, { agentId })

      if (!this.errorRecoveryStrategies.has(agentId)) {
        this.errorRecoveryStrategies.set(agentId, [])
      }

      const strategies = this.errorRecoveryStrategies.get(agentId)!
      strategies.push(strategy)

      this.logger.info(`Error recovery strategy added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add error recovery strategy for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeErrorRecoveryStrategy(agentId: string, strategyName: string): Promise<void> {
    try {
      this.logger.info(`Removing error recovery strategy for agent ${agentId}`, { agentId })

      const strategies = this.errorRecoveryStrategies.get(agentId)
      if (strategies) {
        const index = strategies.findIndex(s => s.name === strategyName)
        if (index !== -1) {
          strategies.splice(index, 1)
          this.logger.info(`Error recovery strategy removed successfully for agent ${agentId}`, { agentId })
        } else {
          this.logger.warn(`Error recovery strategy not found for agent ${agentId}`, { agentId, strategyName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove error recovery strategy for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async getErrorHistory(agentId?: string, limit?: number): Promise<ErrorHistoryEntry[]> {
    try {
      let history: ErrorHistoryEntry[] = []

      if (agentId) {
        // Get history for specific agent
        history = this.errorHistory.get(agentId) || []
      } else {
        // Get history for all agents
        for (const agentHistory of this.errorHistory.values()) {
          history.push(...agentHistory)
        }
      }

      // Sort by timestamp (newest first)
      history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      // Apply limit
      if (limit && limit > 0) {
        history = history.slice(0, limit)
      }

      return history
    } catch (error) {
      this.logger.error('Failed to get error history', error as Error, { agentId, limit })
      throw error
    }
  }

  async getErrorAlerts(agentId?: string, resolved?: boolean): Promise<ErrorAlert[]> {
    try {
      let alerts: ErrorAlert[] = []

      if (agentId) {
        // Get alerts for specific agent
        alerts = this.errorAlerts.get(agentId) || []
      } else {
        // Get alerts for all agents
        for (const agentAlerts of this.errorAlerts.values()) {
          alerts.push(...agentAlerts)
        }
      }

      // Filter by resolved status if specified
      if (resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === resolved)
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return alerts
    } catch (error) {
      this.logger.error('Failed to get error alerts', error as Error, { agentId, resolved })
      throw error
    }
  }

  async resolveErrorAlert(alertId: string): Promise<boolean> {
    try {
      this.logger.info(`Resolving error alert ${alertId}`, { alertId })

      // Find and resolve alert
      for (const [agentId, alerts] of this.errorAlerts.entries()) {
        const alert = alerts.find(a => a.id === alertId)
        if (alert) {
          alert.resolved = true
          alert.resolvedAt = new Date()
          
          this.logger.info(`Error alert resolved successfully`, { alertId, agentId })
          
          // Emit event
          this.emit('alertResolved', { alert })
          
          return true
        }
      }

      this.logger.warn(`Error alert not found`, { alertId })
      return false
    } catch (error) {
      this.logger.error(`Failed to resolve error alert ${alertId}`, error as Error, { alertId })
      return false
    }
  }

  async getErrorStats(agentId?: string): Promise<ErrorStats> {
    try {
      let totalErrors = 0
      let errorsBySeverity: Record<string, number> = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0
      }
      let errorsByAgent: Record<string, number> = {}
      let resolvedErrors = 0
      let unresolvedErrors = 0

      if (agentId) {
        // Get stats for specific agent
        const history = this.errorHistory.get(agentId) || []
        totalErrors = history.length
        
        for (const entry of history) {
          const severity = this.determineErrorSeverity(entry.error, entry.context)
          errorsBySeverity[severity]++
          
          if (entry.resolved) {
            resolvedErrors++
          } else {
            unresolvedErrors++
          }
        }
        
        errorsByAgent[agentId] = totalErrors
      } else {
        // Get stats for all agents
        for (const [agentId, history] of this.errorHistory.entries()) {
          totalErrors += history.length
          
          for (const entry of history) {
            const severity = this.determineErrorSeverity(entry.error, entry.context)
            errorsBySeverity[severity]++
            
            if (entry.resolved) {
              resolvedErrors++
            } else {
              unresolvedErrors++
            }
          }
          
          errorsByAgent[agentId] = history.length
        }
      }

      return {
        totalErrors,
        errorsBySeverity,
        errorsByAgent,
        resolvedErrors,
        unresolvedErrors
      }
    } catch (error) {
      this.logger.error('Failed to get error stats', error as Error, { agentId })
      throw error
    }
  }

  async configure(config: ErrorHandlerConfig): Promise<void> {
    try {
      this.logger.info('Configuring error handler', { config })

      if (config.maxHistorySize !== undefined) {
        this.maxHistorySize = config.maxHistorySize
      }

      if (config.maxAlerts !== undefined) {
        this.maxAlerts = config.maxAlerts
      }

      if (config.autoRetryEnabled !== undefined) {
        this.autoRetryEnabled = config.autoRetryEnabled
      }

      if (config.maxRetries !== undefined) {
        this.maxRetries = config.maxRetries
      }

      if (config.retryDelay !== undefined) {
        this.retryDelay = config.retryDelay
      }

      this.logger.info('Error handler configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure error handler', error as Error, { config })
      throw error
    }
  }

  private async addToHistory(agentId: string, errorEntry: ErrorHistoryEntry): Promise<void> {
    try {
      if (!this.errorHistory.has(agentId)) {
        this.errorHistory.set(agentId, [])
      }
      
      const history = this.errorHistory.get(agentId)!
      history.push(errorEntry)
      
      // Keep only recent history
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    } catch (error) {
      this.logger.error(`Failed to add error to history for agent ${agentId}`, error as Error, { agentId })
    }
  }

  private determineErrorSeverity(error: Error, context: ErrorContext): ErrorSeverity {
    // Default severity
    let severity: ErrorSeverity = 'MEDIUM'

    // Determine based on error type
    if (error instanceof TypeError) {
      severity = 'HIGH'
    } else if (error instanceof ReferenceError) {
      severity = 'HIGH'
    } else if (error instanceof SyntaxError) {
      severity = 'CRITICAL'
    } else if (error.name === 'TimeoutError') {
      severity = 'MEDIUM'
    } else if (error.name === 'NetworkError') {
      severity = 'MEDIUM'
    }

    // Adjust based on context
    if (context.critical) {
      severity = 'CRITICAL'
    } else if (context.component === 'lifecycle') {
      severity = 'HIGH'
    } else if (context.component === 'communication') {
      severity = 'MEDIUM'
    }

    return severity
  }

  private async createAlert(errorEntry: ErrorHistoryEntry, severity: ErrorSeverity): Promise<void> {
    try {
      const agentId = errorEntry.context.agentId || 'system'
      
      if (!this.errorAlerts.has(agentId)) {
        this.errorAlerts.set(agentId, [])
      }
      
      const alerts = this.errorAlerts.get(agentId)!
      
      const alert: ErrorAlert = {
        id: uuidv4(),
        errorId: errorEntry.id,
        agentId,
        message: errorEntry.error.message,
        severity,
        timestamp: errorEntry.timestamp,
        resolved: false,
        context: errorEntry.context
      }
      
      alerts.push(alert)
      
      // Keep only recent alerts
      if (alerts.length > this.maxAlerts) {
        alerts.splice(0, alerts.length - this.maxAlerts)
      }

      // Create monitoring alert
      await this.monitoringService.createAlert({
        id: alert.id,
        agentId,
        type: 'ERROR' as any,
        severity: severity as any,
        message: alert.message,
        timestamp: alert.timestamp,
        metadata: { errorId: errorEntry.id, context: errorEntry.context },
        resolved: false
      })

      // Emit event
      this.emit('alertCreated', { alert })
    } catch (error) {
      this.logger.error('Failed to create error alert', error as Error, { errorEntry })
    }
  }

  private async executeErrorHandlers(errorEntry: ErrorHistoryEntry, severity: ErrorSeverity): Promise<HandlerResult> {
    try {
      const agentId = errorEntry.context.agentId
      if (!agentId) {
        return { success: false, message: 'No agent ID in context' }
      }

      const handlers = this.errorHandlers.get(agentId) || []
      if (handlers.length === 0) {
        return { success: false, message: 'No error handlers found' }
      }

      let lastResult: HandlerResult = { success: false, message: 'No handlers executed' }

      for (const handler of handlers) {
        try {
          const result = await handler(errorEntry.error, errorEntry.context, severity)
          if (result.success) {
            lastResult = result
            break
          }
        } catch (handlerError) {
          this.logger.error('Error handler failed', handlerError as Error, { 
            agentId, 
            errorId: errorEntry.id 
          })
        }
      }

      return lastResult
    } catch (error) {
      this.logger.error('Failed to execute error handlers', error as Error, { errorEntry })
      return { success: false, message: 'Handler execution failed' }
    }
  }

  private shouldAttemptRecovery(error: Error, context: ErrorContext): boolean {
    // Don't attempt recovery for critical errors
    if (context.critical) {
      return false
    }

    // Don't attempt recovery for certain error types
    if (error instanceof SyntaxError) {
      return false
    }

    // Don't attempt recovery if no agent ID
    if (!context.agentId) {
      return false
    }

    return true
  }

  private async attemptRecovery(errorEntry: ErrorHistoryEntry): Promise<RecoveryResult> {
    try {
      const agentId = errorEntry.context.agentId
      if (!agentId) {
        return { success: false, message: 'No agent ID in context' }
      }

      const strategies = this.errorRecoveryStrategies.get(agentId) || []
      if (strategies.length === 0) {
        return { success: false, message: 'No recovery strategies found' }
      }

      let lastResult: RecoveryResult = { success: false, message: 'No strategies executed' }

      for (const strategy of strategies) {
        try {
          if (await strategy.canRecover(errorEntry.error, errorEntry.context)) {
            const result = await strategy.recover(errorEntry.error, errorEntry.context)
            if (result.success) {
              lastResult = result
              break
            }
          }
        } catch (strategyError) {
          this.logger.error('Error recovery strategy failed', strategyError as Error, { 
            agentId, 
            errorId: errorEntry.id 
          })
        }
      }

      return lastResult
    } catch (error) {
      this.logger.error('Failed to attempt recovery', error as Error, { errorEntry })
      return { success: false, message: 'Recovery attempt failed' }
    }
  }

  private async recordErrorMetrics(
    errorEntry: ErrorHistoryEntry, 
    severity: ErrorSeverity,
    handlerResult: HandlerResult,
    recoveryResult: RecoveryResult | null
  ): Promise<void> {
    try {
      const agentId = errorEntry.context.agentId || 'system'

      // Record error count
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        name: 'errors_occurred',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { severity, errorId: errorEntry.id }
      })

      // Record handler success/failure
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'ERROR' as any,
        name: handlerResult.success ? 'error_handlers_success' : 'error_handlers_failure',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { errorId: errorEntry.id }
      })

      // Record recovery attempt if applicable
      if (recoveryResult) {
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'ERROR' as any,
          name: 'error_recovery_attempts',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { errorId: errorEntry.id, success: recoveryResult.success }
        })
      }
    } catch (error) {
      this.logger.error('Failed to record error metrics', error as Error, { errorEntry })
    }
  }

  // Utility methods
  getErrorHandlerCount(): number {
    let count = 0
    for (const handlers of this.errorHandlers.values()) {
      count += handlers.length
    }
    return count
  }

  getRecoveryStrategyCount(): number {
    let count = 0
    for (const strategies of this.errorRecoveryStrategies.values()) {
      count += strategies.length
    }
    return count
  }

  getAlertCount(resolved?: boolean): number {
    let count = 0
    for (const alerts of this.errorAlerts.values()) {
      if (resolved === undefined) {
        count += alerts.length
      } else {
        count += alerts.filter(a => a.resolved === resolved).length
      }
    }
    return count
  }
}

interface ErrorContext {
  agentId?: string
  component?: string
  operation?: string
  critical?: boolean
  metadata?: any
}

interface ErrorResult {
  errorId: string
  success: boolean
  severity: ErrorSeverity
  message: string
  handled: boolean
  recoveryAttempted: boolean
  recoverySuccess: boolean
  timestamp: Date
}

interface ErrorHistoryEntry {
  id: string
  error: Error
  context: ErrorContext
  timestamp: Date
  handled: boolean
  resolved: boolean
}

interface ErrorAlert {
  id: string
  errorId: string
  agentId: string
  message: string
  severity: ErrorSeverity
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
  context: ErrorContext
}

interface ErrorStats {
  totalErrors: number
  errorsBySeverity: Record<string, number>
  errorsByAgent: Record<string, number>
  resolvedErrors: number
  unresolvedErrors: number
}

interface ErrorHandlerConfig {
  maxHistorySize?: number
  maxAlerts?: number
  autoRetryEnabled?: boolean
  maxRetries?: number
  retryDelay?: number
}

interface HandlerResult {
  success: boolean
  message: string
}

interface RecoveryResult {
  success: boolean
  message: string
}

interface ErrorRecoveryStrategy {
  name: string
  canRecover: (error: Error, context: ErrorContext) => Promise<boolean>
  recover: (error: Error, context: ErrorContext) => Promise<RecoveryResult>
}

type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type ErrorHandlerCallback = (
  error: Error,
  context: ErrorContext,
  severity: ErrorSeverity
) => Promise<HandlerResult>