import {
  ILogger,
  IErrorLog,
  ErrorContext,
  AlertSeverity
} from './types'
import { v4 as uuidv4 } from 'uuid'

export interface IErrorLogger {
  logError(error: Error, context: ErrorContext, severity: AlertSeverity): Promise<IErrorLog>
  getErrorLogs(agentId?: string, filter?: ErrorFilter): Promise<IErrorLog[]>
  resolveErrorLog(errorId: string): Promise<boolean>
  clearErrorLogs(agentId?: string): Promise<number>
  getErrorStats(agentId?: string): Promise<ErrorLoggerStats>
}

export interface ErrorFilter {
  severity?: AlertSeverity
  startTime?: Date
  endTime?: Date
  resolved?: boolean
}

export interface ErrorLoggerStats {
  totalErrors: number
  errorsBySeverity: Record<string, number>
  errorsByAgent: Record<string, number>
  resolvedErrors: number
  unresolvedErrors: number
  averageResolutionTime: number
}

export class ErrorLogger implements IErrorLogger {
  private logger: ILogger
  private errorLogs: Map<string, IErrorLog[]> = new Map()
  private maxLogsPerAgent: number = 1000
  private maxTotalLogs: number = 10000

  constructor(logger: ILogger) {
    this.logger = logger
  }

  async logError(error: Error, context: ErrorContext, severity: AlertSeverity): Promise<IErrorLog> {
    try {
      const errorId = uuidv4()
      const timestamp = new Date()

      const errorLog: IErrorLog = {
        id: errorId,
        agentId: context.agentId || 'system',
        taskId: context.taskId,
        message: error.message,
        stackTrace: error.stack,
        severity,
        context: {
          ...context,
          timestamp
        },
        timestamp,
        resolved: false
      }

      // Store error log
      const agentId = errorLog.agentId
      if (!this.errorLogs.has(agentId)) {
        this.errorLogs.set(agentId, [])
      }

      const logs = this.errorLogs.get(agentId)!
      logs.push(errorLog)

      // Keep only recent logs
      if (logs.length > this.maxLogsPerAgent) {
        logs.splice(0, logs.length - this.maxLogsPerAgent)
      }

      // Check total logs limit
      this.cleanupOldLogs()

      this.logger.info(`Error logged successfully`, {
        errorId,
        agentId,
        severity,
        message: error.message
      })

      return errorLog
    } catch (loggingError) {
      this.logger.error('Failed to log error', loggingError as Error, { 
        originalError: error, 
        context 
      })
      throw loggingError
    }
  }

  async getErrorLogs(agentId?: string, filter?: ErrorFilter): Promise<IErrorLog[]> {
    try {
      let logs: IErrorLog[] = []

      if (agentId) {
        // Get logs for specific agent
        logs = this.errorLogs.get(agentId) || []
      } else {
        // Get logs for all agents
        for (const agentLogs of this.errorLogs.values()) {
          logs.push(...agentLogs)
        }
      }

      // Apply filters
      if (filter) {
        if (filter.severity) {
          logs = logs.filter(log => log.severity === filter.severity)
        }

        if (filter.startTime) {
          logs = logs.filter(log => log.timestamp >= filter.startTime!)
        }

        if (filter.endTime) {
          logs = logs.filter(log => log.timestamp <= filter.endTime!)
        }

        if (filter.resolved !== undefined) {
          logs = logs.filter(log => log.resolved === filter.resolved)
        }
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return logs
    } catch (error) {
      this.logger.error('Failed to get error logs', error as Error, { agentId, filter })
      throw error
    }
  }

  async resolveErrorLog(errorId: string): Promise<boolean> {
    try {
      this.logger.info(`Resolving error log ${errorId}`, { errorId })

      // Find and resolve error log
      for (const [agentId, logs] of this.errorLogs.entries()) {
        const log = logs.find(l => l.id === errorId)
        if (log) {
          log.resolved = true
          log.resolvedAt = new Date()
          
          this.logger.info(`Error log resolved successfully`, { 
            errorId, 
            agentId 
          })
          
          return true
        }
      }

      this.logger.warn(`Error log not found`, { errorId })
      return false
    } catch (error) {
      this.logger.error(`Failed to resolve error log ${errorId}`, error as Error, { errorId })
      return false
    }
  }

  async clearErrorLogs(agentId?: string): Promise<number> {
    try {
      let clearedCount = 0

      if (agentId) {
        // Clear logs for specific agent
        const logs = this.errorLogs.get(agentId)
        if (logs) {
          clearedCount = logs.length
          this.errorLogs.delete(agentId)
        }
      } else {
        // Clear all logs
        for (const logs of this.errorLogs.values()) {
          clearedCount += logs.length
        }
        this.errorLogs.clear()
      }

      this.logger.info(`Error logs cleared successfully`, { 
        agentId, 
        clearedCount 
      })

      return clearedCount
    } catch (error) {
      this.logger.error('Failed to clear error logs', error as Error, { agentId })
      throw error
    }
  }

  async getErrorStats(agentId?: string): Promise<ErrorLoggerStats> {
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
      let totalResolutionTime = 0
      let resolvedCount = 0

      if (agentId) {
        // Get stats for specific agent
        const logs = this.errorLogs.get(agentId) || []
        totalErrors = logs.length
        
        for (const log of logs) {
          errorsBySeverity[log.severity]++
          
          if (log.resolved) {
            resolvedErrors++
            if (log.resolvedAt) {
              totalResolutionTime += log.resolvedAt.getTime() - log.timestamp.getTime()
              resolvedCount++
            }
          } else {
            unresolvedErrors++
          }
        }
        
        errorsByAgent[agentId] = totalErrors
      } else {
        // Get stats for all agents
        for (const [agentId, logs] of this.errorLogs.entries()) {
          totalErrors += logs.length
          
          for (const log of logs) {
            errorsBySeverity[log.severity]++
            
            if (log.resolved) {
              resolvedErrors++
              if (log.resolvedAt) {
                totalResolutionTime += log.resolvedAt.getTime() - log.timestamp.getTime()
                resolvedCount++
              }
            } else {
              unresolvedErrors++
            }
          }
          
          errorsByAgent[agentId] = logs.length
        }
      }

      const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0

      return {
        totalErrors,
        errorsBySeverity,
        errorsByAgent,
        resolvedErrors,
        unresolvedErrors,
        averageResolutionTime
      }
    } catch (error) {
      this.logger.error('Failed to get error stats', error as Error, { agentId })
      throw error
    }
  }

  private cleanupOldLogs(): void {
    try {
      let totalLogs = 0
      for (const logs of this.errorLogs.values()) {
        totalLogs += logs.length
      }

      if (totalLogs > this.maxTotalLogs) {
        // Sort all logs by timestamp and remove oldest
        const allLogs: IErrorLog[] = []
        for (const logs of this.errorLogs.values()) {
          allLogs.push(...logs)
        }

        allLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

        const logsToRemove = allLogs.slice(0, totalLogs - this.maxTotalLogs)
        
        for (const logToRemove of logsToRemove) {
          const agentLogs = this.errorLogs.get(logToRemove.agentId)
          if (agentLogs) {
            const index = agentLogs.findIndex(l => l.id === logToRemove.id)
            if (index !== -1) {
              agentLogs.splice(index, 1)
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error as Error)
    }
  }

  // Utility methods
  getLogCount(agentId?: string): number {
    if (agentId) {
      return this.errorLogs.get(agentId)?.length || 0
    } else {
      let count = 0
      for (const logs of this.errorLogs.values()) {
        count += logs.length
      }
      return count
    }
  }

  getAgentIds(): string[] {
    return Array.from(this.errorLogs.keys())
  }
}