import {
  ILogger
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface IMonitoringService {
  recordMetric(agentId: string, metric: any): Promise<void>
  getMetrics(agentId: string, filter?: any): Promise<any[]>
  createAlert(alert: any): Promise<void>
  getAlerts(agentId?: string): Promise<any[]>
  resolveAlert(alertId: string): Promise<boolean>
  addHealthCheck(agentId: string, healthCheck: any): Promise<void>
  removeHealthCheck(agentId: string, checkName: string): Promise<void>
  getHealthStatus(agentId?: string): Promise<any>
  recordPerformanceMetric(agentId: string, metric: any): Promise<void>
  getPerformanceMetrics(agentId?: string, timeRange?: any): Promise<any[]>
  getMonitoringStats(agentId?: string): Promise<any>
  addAlertThreshold(agentId: string, threshold: any): Promise<void>
  removeAlertThreshold(agentId: string, thresholdName: string): Promise<void>
}

export class MonitoringService extends EventEmitter implements IMonitoringService {
  private logger: ILogger
  private metrics: Map<string, Metric[]> = new Map()
  private alerts: Map<string, Alert[]> = new Map()
  private healthChecks: Map<string, HealthCheck[]> = new Map()
  private performanceMetrics: Map<string, PerformanceMetric[]> = new Map()
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

  async recordMetric(agentId: string, metric: Metric): Promise<void> {
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

  async getMetrics(agentId?: string, type?: string, timeRange?: TimeRange): Promise<Metric[]> {
    try {
      let metrics: Metric[] = []

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
      if (type) {
        metrics = metrics.filter(m => m.type === type)
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
      this.logger.error('Failed to get metrics', error as Error, { agentId, type, timeRange })
      throw error
    }
  }

  async createAlert(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Creating alert for agent ${alert.agentId}`, { alert })

      // Add timestamp if not provided
      if (!alert.timestamp) {
        alert.timestamp = new Date()
      }

      // Store alert
      if (!this.alerts.has(alert.agentId)) {
        this.alerts.set(alert.agentId, [])
      }

      const agentAlerts = this.alerts.get(alert.agentId)!
      agentAlerts.push(alert)

      // Keep only recent alerts
      if (agentAlerts.length > this.maxAlertsSize) {
        agentAlerts.splice(0, agentAlerts.length - this.maxAlertsSize)
      }

      this.logger.info(`Alert created successfully for agent ${alert.agentId}`, {
        agentId: alert.agentId,
        alertId: alert.id,
        severity: alert.severity
      })

      // Emit event
      this.emit('alertCreated', { alert })
    } catch (error) {
      this.logger.error(`Failed to create alert for agent ${alert.agentId}`, error as Error, { alert })
      throw error
    }
  }

  async getAlerts(agentId?: string, resolved?: boolean, severity?: string): Promise<Alert[]> {
    try {
      let alerts: Alert[] = []

      if (agentId) {
        // Get alerts for specific agent
        alerts = this.alerts.get(agentId) || []
      } else {
        // Get alerts for all agents
        for (const agentAlerts of this.alerts.values()) {
          alerts.push(...agentAlerts)
        }
      }

      // Filter by resolved status if specified
      if (resolved !== undefined) {
        alerts = alerts.filter(a => a.resolved === resolved)
      }

      // Filter by severity if specified
      if (severity) {
        alerts = alerts.filter(a => a.severity === severity)
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return alerts
    } catch (error) {
      this.logger.error('Failed to get alerts', error as Error, { agentId, resolved, severity })
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

  async addHealthCheck(agentId: string, healthCheck: HealthCheck): Promise<void> {
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

  async getHealthStatus(agentId?: string): Promise<HealthStatus> {
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

  async recordPerformanceMetric(agentId: string, metric: PerformanceMetric): Promise<void> {
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

  async getPerformanceMetrics(agentId?: string, timeRange?: TimeRange): Promise<PerformanceMetric[]> {
    try {
      let metrics: PerformanceMetric[] = []

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

  async getMonitoringStats(agentId?: string): Promise<MonitoringStats> {
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

  async addAlertThreshold(agentId: string, threshold: AlertThreshold): Promise<void> {
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

  private async checkAlertThresholds(agentId: string, metric: Metric): Promise<void> {
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

interface Metric {
  id: string
  agentId: string
  type: string
  name: string
  value: number
  unit: string
  timestamp: Date
  metadata?: any
}

interface Alert {
  id: string
  agentId: string
  type: string
  severity: string
  message: string
  timestamp: Date
  metadata?: any
  resolved: boolean
  resolvedAt?: Date
}

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

interface PerformanceMetric {
  id: string
  agentId: string
  name: string
  value: number
  unit: string
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

interface MonitoringStats {
  totalMetrics: number
  totalAlerts: number
  totalHealthChecks: number
  totalPerformanceMetrics: number
  resolvedAlerts: number
  unresolvedAlerts: number
}

type HealthStatusValue = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL'