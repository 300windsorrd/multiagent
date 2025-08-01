import {
  ILogger,
  IMonitoringService,
  IMetric,
  IAlert,
  MetricFilter,
  IAgentStats,
  ISystemStats
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export class MonitoringService extends EventEmitter implements IMonitoringService {
  private logger: ILogger
  private metrics: Map<string, IMetric[]> = new Map()
  private alerts: Map<string, IAlert[]> = new Map()
  private healthChecks: Map<string, HealthCheck[]> = new Map()
  private performanceMetrics: Map<string, IMetric[]> = new Map()
  private maxMetricsSize: number = 10000
  private maxAlertsSize: number = 1000
  private maxHealthChecksSize: number = 1000
  private maxPerformanceMetricsSize: number = 10000
  private alertThresholds: Map<string, AlertThreshold[]> = new Map()
  private healthCheckInterval: number = 60000 // 1 minute
  private healthCheckTimer: NodeJS.Timeout | null = null

  constructor(logger: ILogger) {
    super()
    this.logger = logger
    this.startHealthChecks()
  }

  async recordMetric(agentId: string, metric: IMetric): Promise<void> {
    try {
      this.logger.debug(`Recording metric for agent ${agentId}`, { agentId, metric })

      // Add timestamp if not provided
      if (!metric.timestamp) {
        metric.timestamp = new Date()
      }

      // Store metric
      if (!this.metrics.has(agentId)) {
        this.metrics.set(agentId, [])
      }

      const agentMetrics = this.metrics.get(agentId)!
      agentMetrics.push(metric)

      // Keep only recent metrics
      if (agentMetrics.length > this.maxMetricsSize) {
        agentMetrics.splice(0, agentMetrics.length - this.maxMetricsSize)
      }

      // Check for alert thresholds
      await this.checkAlertThresholds(agentId, metric)

      // Emit event
      this.emit('metricRecorded', { agentId, metric })
    } catch (error) {
      this.logger.error(`Failed to record metric for agent ${agentId}`, error as Error, { agentId, metric })
    }
  }

  async getMetrics(agentId?: string, filter?: MetricFilter): Promise<IMetric[]> {
    try {
      let metrics: IMetric[] = []

      if (agentId) {
        // Get metrics for specific agent
        metrics = this.metrics.get(agentId) || []
      } else {
        // Get metrics for all agents
        for (const agentMetrics of this.metrics.values()) {
          metrics.push(...agentMetrics)
        }
      }

      // Filter by type if specified
      if (filter?.type) {
        metrics = metrics.filter(m => m.type === filter.type)
      }

      // Filter by time range if specified
      if (filter?.startTime && filter?.endTime) {
        metrics = metrics.filter(m => m.timestamp >= filter.startTime! && m.timestamp <= filter.endTime!)
      }

      // Sort by timestamp (newest first)
      metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return metrics
    } catch (error) {
      this.logger.error('Failed to get metrics', error as Error, { agentId, filter })
      throw error
    }
  }

  async getAgentStats(agentId: string): Promise<IAgentStats> {
    try {
      const metrics = this.metrics.get(agentId) || []
      const alerts = this.alerts.get(agentId) || []
      
      // Calculate stats
      const totalTasks = metrics.filter(m => m.name === 'task_count').reduce((sum, m) => sum + m.value, 0)
      const completedTasks = metrics.filter(m => m.name === 'completed_tasks').reduce((sum, m) => sum + m.value, 0)
      const failedTasks = metrics.filter(m => m.name === 'failed_tasks').reduce((sum, m) => sum + m.value, 0)
      const responseTimes = metrics.filter(m => m.name === 'response_time')
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, m) => sum + m.value, 0) / responseTimes.length
        : 0
      const errorRate = totalTasks > 0 ? (failedTasks / totalTasks) * 100 : 0
      const lastActivity = metrics.length > 0
        ? metrics.reduce((latest, m) => m.timestamp > latest ? m.timestamp : latest, new Date(0))
        : new Date()

      return {
        agentId,
        totalTasks,
        completedTasks,
        failedTasks,
        averageResponseTime,
        uptime: Date.now() - lastActivity.getTime(),
        errorRate,
        lastActivity
      }
    } catch (error) {
      this.logger.error(`Failed to get agent stats for ${agentId}`, error as Error)
      throw error
    }
  }

  async getSystemStats(): Promise<ISystemStats> {
    try {
      let totalTasks = 0
      let completedTasks = 0
      let failedTasks = 0
      let totalResponseTime = 0
      let responseTimeCount = 0
      let systemStartTime = Date.now()

      for (const [agentId, metrics] of this.metrics.entries()) {
        const agentTasks = metrics.filter(m => m.name === 'task_count').reduce((sum, m) => sum + m.value, 0)
        const agentCompleted = metrics.filter(m => m.name === 'completed_tasks').reduce((sum, m) => sum + m.value, 0)
        const agentFailed = metrics.filter(m => m.name === 'failed_tasks').reduce((sum, m) => sum + m.value, 0)
        const agentResponseTimes = metrics.filter(m => m.name === 'response_time')
        
        totalTasks += agentTasks
        completedTasks += agentCompleted
        failedTasks += agentFailed
        
        if (agentResponseTimes.length > 0) {
          totalResponseTime += agentResponseTimes.reduce((sum, m) => sum + m.value, 0)
          responseTimeCount += agentResponseTimes.length
        }

        // Find earliest activity
        const earliestActivity = metrics.reduce((earliest, m) =>
          m.timestamp < earliest ? m.timestamp : earliest, new Date())
        if (earliestActivity.getTime() < systemStartTime) {
          systemStartTime = earliestActivity.getTime()
        }
      }

      const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0
      const systemUptime = Date.now() - systemStartTime

      return {
        totalAgents: this.metrics.size,
        activeAgents: this.metrics.size, // Simplified - in reality would check actual activity
        totalTasks,
        completedTasks,
        failedTasks,
        averageResponseTime,
        systemUptime
      }
    } catch (error) {
      this.logger.error('Failed to get system stats', error as Error)
      throw error
    }
  }

  async createAlert(alert: IAlert): Promise<void> {
    try {
      this.logger.info(`Creating alert`, { alert })

      // Add timestamp if not provided
      if (!alert.timestamp) {
        alert.timestamp = new Date()
      }

      // Store alert
      const agentId = alert.agentId || 'system'
      if (!this.alerts.has(agentId)) {
        this.alerts.set(agentId, [])
      }

      const agentAlerts = this.alerts.get(agentId)!
      agentAlerts.push(alert)

      // Keep only recent alerts
      if (agentAlerts.length > this.maxAlertsSize) {
        agentAlerts.splice(0, agentAlerts.length - this.maxAlertsSize)
      }

      this.logger.info(`Alert created successfully`, {
        agentId,
        alertId: alert.id,
        severity: alert.severity
      })

      // Emit event
      this.emit('alertCreated', { alert })
    } catch (error) {
      this.logger.error(`Failed to create alert`, error as Error, { alert })
      throw error
    }
  }

  async getAlerts(agentId?: string): Promise<IAlert[]> {
    try {
      let alerts: IAlert[] = []

      if (agentId) {
        // Get alerts for specific agent
        alerts = this.alerts.get(agentId) || []
      } else {
        // Get alerts for all agents
        for (const agentAlerts of this.alerts.values()) {
          alerts.push(...agentAlerts)
        }
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return alerts
    } catch (error) {
      this.logger.error('Failed to get alerts', error as Error, { agentId })
      throw error
    }
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      this.logger.info(`Resolving alert ${alertId}`, { alertId })

      // Find and resolve alert
      for (const [agentId, alerts] of this.alerts.entries()) {
        const alert = alerts.find(a => a.id === alertId)
        if (alert) {
          alert.resolved = true
          alert.resolvedAt = new Date()
          
          this.logger.info(`Alert resolved successfully`, { alertId, agentId })
          
          // Emit event
          this.emit('alertResolved', { alert })
          
          return true
        }
      }

      this.logger.warn(`Alert not found`, { alertId })
      return false
    } catch (error) {
      this.logger.error(`Failed to resolve alert ${alertId}`, error as Error, { alertId })
      return false
    }
  }

  async addHealthCheck(agentId: string, healthCheck: any): Promise<void> {
    try {
      this.logger.info(`Adding health check for agent ${agentId}`, { agentId, healthCheck })

      if (!this.healthChecks.has(agentId)) {
        this.healthChecks.set(agentId, [])
      }

      const checks = this.healthChecks.get(agentId)!
      checks.push(healthCheck)

      this.logger.info(`Health check added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add health check for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeHealthCheck(agentId: string, checkName: string): Promise<void> {
    try {
      this.logger.info(`Removing health check for agent ${agentId}`, { agentId })

      const checks = this.healthChecks.get(agentId)
      if (checks) {
        const index = checks.findIndex(c => c.name === checkName)
        if (index !== -1) {
          checks.splice(index, 1)
          this.logger.info(`Health check removed successfully for agent ${agentId}`, { agentId })
        } else {
          this.logger.warn(`Health check not found for agent ${agentId}`, { agentId, checkName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove health check for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async getHealthStatus(agentId?: string): Promise<any> {
    try {
      let overallStatus: HealthStatusValue = 'HEALTHY'
      const agentStatuses: Record<string, HealthStatusValue> = {}
      const checkResults: HealthCheckResult[] = []

      if (agentId) {
        // Get health status for specific agent
        const checks = this.healthChecks.get(agentId) || []
        const agentOverallStatus = await this.runHealthChecks(agentId, checks)
        
        agentStatuses[agentId] = agentOverallStatus.status
        overallStatus = agentOverallStatus.status
        checkResults.push(...agentOverallStatus.results)
      } else {
        // Get health status for all agents
        for (const [agentId, checks] of this.healthChecks.entries()) {
          const agentOverallStatus = await this.runHealthChecks(agentId, checks)
          
          agentStatuses[agentId] = agentOverallStatus.status
          checkResults.push(...agentOverallStatus.results)
          
          // Update overall status
          if (agentOverallStatus.status === 'CRITICAL') {
            overallStatus = 'CRITICAL'
          } else if (agentOverallStatus.status === 'UNHEALTHY' && overallStatus !== 'CRITICAL') {
            overallStatus = 'UNHEALTHY'
          } else if (agentOverallStatus.status === 'DEGRADED' && overallStatus === 'HEALTHY') {
            overallStatus = 'DEGRADED'
          }
        }
      }

      return {
        overallStatus,
        agentStatuses,
        checkResults,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to get health status', error as Error, { agentId })
      throw error
    }
  }

  async recordPerformanceMetric(agentId: string, metric: IMetric): Promise<void> {
    try {
      this.logger.debug(`Recording performance metric for agent ${agentId}`, { agentId, metric })

      // Add timestamp if not provided
      if (!metric.timestamp) {
        metric.timestamp = new Date()
      }

      // Store performance metric
      if (!this.performanceMetrics.has(agentId)) {
        this.performanceMetrics.set(agentId, [])
      }

      const agentMetrics = this.performanceMetrics.get(agentId)!
      agentMetrics.push(metric)

      // Keep only recent metrics
      if (agentMetrics.length > this.maxPerformanceMetricsSize) {
        agentMetrics.splice(0, agentMetrics.length - this.maxPerformanceMetricsSize)
      }

      // Emit event
      this.emit('performanceMetricRecorded', { agentId, metric })
    } catch (error) {
      this.logger.error(`Failed to record performance metric for agent ${agentId}`, error as Error, { agentId, metric })
    }
  }

  async getPerformanceMetrics(agentId?: string, timeRange?: any): Promise<IMetric[]> {
    try {
      let metrics: IMetric[] = []

      if (agentId) {
        // Get performance metrics for specific agent
        metrics = this.performanceMetrics.get(agentId) || []
      } else {
        // Get performance metrics for all agents
        for (const agentMetrics of this.performanceMetrics.values()) {
          metrics.push(...agentMetrics)
        }
      }

      // Filter by time range if specified
      if (timeRange) {
        const now = new Date()
        const startTime = new Date(now.getTime() - timeRange.durationMs)
        metrics = metrics.filter(m => m.timestamp >= startTime)
      }

      // Sort by timestamp (newest first)
      metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return metrics
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error as Error, { agentId, timeRange })
      throw error
    }
  }

  async getMonitoringStats(agentId?: string): Promise<any> {
    try {
      let totalMetrics = 0
      let totalAlerts = 0
      let totalHealthChecks = 0
      let totalPerformanceMetrics = 0
      let resolvedAlerts = 0
      let unresolvedAlerts = 0

      if (agentId) {
        // Get stats for specific agent
        totalMetrics = this.metrics.get(agentId)?.length || 0
        totalAlerts = this.alerts.get(agentId)?.length || 0
        totalHealthChecks = this.healthChecks.get(agentId)?.length || 0
        totalPerformanceMetrics = this.performanceMetrics.get(agentId)?.length || 0
        
        const alerts = this.alerts.get(agentId) || []
        resolvedAlerts = alerts.filter(a => a.resolved).length
        unresolvedAlerts = alerts.filter(a => !a.resolved).length
      } else {
        // Get stats for all agents
        for (const metrics of this.metrics.values()) {
          totalMetrics += metrics.length
        }
        
        for (const alerts of this.alerts.values()) {
          totalAlerts += alerts.length
          resolvedAlerts += alerts.filter(a => a.resolved).length
          unresolvedAlerts += alerts.filter(a => !a.resolved).length
        }
        
        for (const checks of this.healthChecks.values()) {
          totalHealthChecks += checks.length
        }
        
        for (const metrics of this.performanceMetrics.values()) {
          totalPerformanceMetrics += metrics.length
        }
      }

      return {
        totalMetrics,
        totalAlerts,
        totalHealthChecks,
        totalPerformanceMetrics,
        resolvedAlerts,
        unresolvedAlerts
      }
    } catch (error) {
      this.logger.error('Failed to get monitoring stats', error as Error, { agentId })
      throw error
    }
  }

  async addAlertThreshold(agentId: string, threshold: any): Promise<void> {
    try {
      this.logger.info(`Adding alert threshold for agent ${agentId}`, { agentId, threshold })

      if (!this.alertThresholds.has(agentId)) {
        this.alertThresholds.set(agentId, [])
      }

      const thresholds = this.alertThresholds.get(agentId)!
      thresholds.push(threshold)

      this.logger.info(`Alert threshold added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add alert threshold for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeAlertThreshold(agentId: string, thresholdName: string): Promise<void> {
    try {
      this.logger.info(`Removing alert threshold for agent ${agentId}`, { agentId })

      const thresholds = this.alertThresholds.get(agentId)
      if (thresholds) {
        const index = thresholds.findIndex(t => t.name === thresholdName)
        if (index !== -1) {
          thresholds.splice(index, 1)
          this.logger.info(`Alert threshold removed successfully for agent ${agentId}`, { agentId })
        } else {
          this.logger.warn(`Alert threshold not found for agent ${agentId}`, { agentId, thresholdName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove alert threshold for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  private async checkAlertThresholds(agentId: string, metric: IMetric): Promise<void> {
    try {
      const thresholds = this.alertThresholds.get(agentId)
      if (!thresholds || thresholds.length === 0) {
        return
      }

      for (const threshold of thresholds) {
        if (threshold.metricName === metric.name) {
          let shouldAlert = false

          switch (threshold.operator) {
            case 'gt':
              shouldAlert = metric.value > threshold.value
              break
            case 'lt':
              shouldAlert = metric.value < threshold.value
              break
            case 'gte':
              shouldAlert = metric.value >= threshold.value
              break
            case 'lte':
              shouldAlert = metric.value <= threshold.value
              break
            case 'eq':
              shouldAlert = metric.value === threshold.value
              break
          }

          if (shouldAlert) {
            await this.createAlert({
              id: uuidv4(),
              agentId,
              type: 'THRESHOLD' as any,
              severity: threshold.severity as any,
              message: threshold.message || `Metric ${metric.name} exceeded threshold`,
              timestamp: new Date(),
              metadata: {
                metricName: metric.name,
                metricValue: metric.value,
                thresholdValue: threshold.value,
                operator: threshold.operator
              },
              resolved: false
            })
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to check alert thresholds for agent ${agentId}`, error as Error, { agentId })
    }
  }

  private async runHealthChecks(agentId: string, checks: HealthCheck[]): Promise<{
    status: HealthStatusValue
    results: HealthCheckResult[]
  }> {
    try {
      let overallStatus: HealthStatusValue = 'HEALTHY'
      const results: HealthCheckResult[] = []

      for (const check of checks) {
        try {
          const result = await check.execute()
          results.push(result)

          // Update overall status
          if (result.status === 'CRITICAL') {
            overallStatus = 'CRITICAL'
          } else if (result.status === 'UNHEALTHY' && overallStatus !== 'CRITICAL') {
            overallStatus = 'UNHEALTHY'
          } else if (result.status === 'DEGRADED' && overallStatus === 'HEALTHY') {
            overallStatus = 'DEGRADED'
          }
        } catch (error) {
          const errorResult: HealthCheckResult = {
            name: check.name,
            status: 'CRITICAL',
            message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date()
          }
          results.push(errorResult)
          overallStatus = 'CRITICAL'
        }
      }

      return { status: overallStatus, results }
    } catch (error) {
      this.logger.error(`Failed to run health checks for agent ${agentId}`, error as Error, { agentId })
      return {
        status: 'CRITICAL',
        results: [{
          name: 'system',
          status: 'CRITICAL',
          message: 'Health check system failed',
          timestamp: new Date()
        }]
      }
    }
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.runAllHealthChecks()
    }, this.healthCheckInterval)
  }

  private async runAllHealthChecks(): Promise<void> {
    try {
      this.logger.debug('Running health checks for all agents')

      for (const [agentId, checks] of this.healthChecks.entries()) {
        try {
          const { status, results } = await this.runHealthChecks(agentId, checks)
          
          // Create alert if critical
          if (status === 'CRITICAL') {
            await this.createAlert({
              id: uuidv4(),
              agentId,
              type: 'HEALTH' as any,
              severity: 'CRITICAL' as any,
              message: 'Critical health check failure',
              timestamp: new Date(),
              metadata: { status, results },
              resolved: false
            })
          }

          // Emit event
          this.emit('healthCheckCompleted', { agentId, status, results })
        } catch (error) {
          this.logger.error(`Failed to run health checks for agent ${agentId}`, error as Error, { agentId })
        }
      }
    } catch (error) {
      this.logger.error('Failed to run health checks', error as Error)
    }
  }

  // Cleanup
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  // Utility methods
  getAgentCount(): number {
    return this.metrics.size
  }

  getMetricCount(agentId?: string): number {
    if (agentId) {
      return this.metrics.get(agentId)?.length || 0
    }
    let count = 0
    for (const metrics of this.metrics.values()) {
      count += metrics.length
    }
    return count
  }

  getAlertCount(agentId?: string, resolved?: boolean): number {
    let count = 0
    for (const [aid, alerts] of this.alerts.entries()) {
      if (agentId && aid !== agentId) continue
      if (resolved !== undefined) {
        count += alerts.filter(a => a.resolved === resolved).length
      } else {
        count += alerts.length
      }
    }
    return count
  }
}

// Additional interfaces for internal use
interface HealthCheck {
  name: string
  execute: () => Promise<HealthCheckResult>
}

interface HealthCheckResult {
  name: string
  status: HealthStatusValue
  message: string
  timestamp: Date
  metadata?: any
}

interface AlertThreshold {
  name: string
  metricName: string
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq'
  value: number
  severity: string
  message?: string
}

interface TimeRange {
  durationMs: number
}

interface HealthStatus {
  overallStatus: HealthStatusValue
  agentStatuses: Record<string, HealthStatusValue>
  checkResults: HealthCheckResult[]
  timestamp: Date
}

type HealthStatusValue = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL'