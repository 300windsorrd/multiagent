import { ILogger, IMonitoringService } from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface IAlertManager {
  createAlert(alert: Alert): Promise<void>
  updateAlert(alertId: string, updates: Partial<Alert>): Promise<boolean>
  resolveAlert(alertId: string, resolution?: string): Promise<boolean>
  escalateAlert(alertId: string, escalationLevel: number): Promise<boolean>
  getAlerts(filter?: AlertFilter): Promise<Alert[]>
  getAlert(alertId: string): Promise<Alert | null>
  getAlertHistory(alertId: string): Promise<AlertHistory[]>
  addAlertRule(rule: AlertRule): Promise<void>
  removeAlertRule(ruleId: string): Promise<boolean>
  getAlertRules(): Promise<AlertRule[]>
  configure(config: AlertManagerConfig): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

export interface Alert {
  id: string
  agentId: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  timestamp: Date
  metadata?: any
  resolved: boolean
  resolvedAt?: Date
  resolvedBy?: string
  resolution?: string
  escalationLevel: number
  acknowledged: boolean
  acknowledgedAt?: Date
  acknowledgedBy?: string
  tags: string[]
}

export interface AlertHistory {
  id: string
  alertId: string
  action: AlertAction
  timestamp: Date
  userId?: string
  details?: any
}

export interface AlertRule {
  id: string
  name: string
  description: string
  condition: AlertCondition
  actions: AlertAction[]
  enabled: boolean
  cooldownPeriod: number
  lastTriggered?: Date
  metadata?: any
}

export interface AlertCondition {
  metricName: string
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne'
  value: number
  duration?: number
  agentId?: string
}

export interface AlertFilter {
  agentId?: string
  type?: AlertType
  severity?: AlertSeverity
  resolved?: boolean
  acknowledged?: boolean
  tags?: string[]
  timeRange?: {
    start: Date
    end: Date
  }
}

export interface AlertManagerConfig {
  maxAlerts: number
  retentionPeriod: number
  escalationRules: EscalationRule[]
  notificationChannels: NotificationChannel[]
  autoResolveTimeout: number
  enableAlertRules: boolean
}

export interface EscalationRule {
  severity: AlertSeverity
  levels: EscalationLevel[]
}

export interface EscalationLevel {
  level: number
  timeout: number
  actions: AlertAction[]
}

export interface NotificationChannel {
  id: string
  name: string
  type: 'email' | 'slack' | 'webhook' | 'sms'
  config: any
  enabled: boolean
}

export type AlertType = 'SYSTEM' | 'AGENT' | 'TASK' | 'PERFORMANCE' | 'SECURITY' | 'CUSTOM'
export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
export type AlertAction = 'NOTIFY' | 'ESCALATE' | 'RESOLVE' | 'ACKNOWLEDGE' | 'CREATE_TICKET'

export class AlertManager extends EventEmitter implements IAlertManager {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private alerts: Map<string, Alert> = new Map()
  private alertHistory: Map<string, AlertHistory[]> = new Map()
  private alertRules: Map<string, AlertRule> = new Map()
  private escalationTimer: NodeJS.Timeout | null = null
  private autoResolveTimer: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private config: AlertManagerConfig

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService,
    config: AlertManagerConfig
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
    this.config = config
  }

  async createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'escalationLevel' | 'acknowledged' | 'tags'>): Promise<void> {
    try {
      this.logger.info('Creating alert', { alert })

      const newAlert: Alert = {
        ...alert,
        id: uuidv4(),
        timestamp: new Date(),
        escalationLevel: 0,
        acknowledged: false,
        tags: []
      }

      // Store alert
      this.alerts.set(newAlert.id, newAlert)

      // Initialize alert history
      this.alertHistory.set(newAlert.id, [{
        id: uuidv4(),
        alertId: newAlert.id,
        action: 'NOTIFY',
        timestamp: new Date(),
        details: { message: 'Alert created' }
      }])

      // Record with monitoring service
      await this.monitoringService.createAlert({
        id: newAlert.id,
        agentId: newAlert.agentId,
        type: newAlert.type as any,
        severity: newAlert.severity as any,
        message: newAlert.message,
        timestamp: newAlert.timestamp,
        metadata: newAlert.metadata,
        resolved: newAlert.resolved
      })

      // Execute immediate actions
      await this.executeAlertActions(newAlert, ['NOTIFY'])

      // Emit event
      this.emit('alertCreated', { alert: newAlert })

      this.logger.info('Alert created successfully', { alertId: newAlert.id })
    } catch (error) {
      this.logger.error('Failed to create alert', error as Error, { alert })
      throw error
    }
  }

  async updateAlert(alertId: string, updates: Partial<Alert>): Promise<boolean> {
    try {
      this.logger.debug(`Updating alert ${alertId}`, { updates })

      const alert = this.alerts.get(alertId)
      if (!alert) {
        this.logger.warn(`Alert not found`, { alertId })
        return false
      }

      // Update alert
      Object.assign(alert, updates)

      // Add to history
      const history = this.alertHistory.get(alertId) || []
      history.push({
        id: uuidv4(),
        alertId,
        action: 'NOTIFY' as AlertAction,
        timestamp: new Date(),
        details: { updates }
      })

      // Emit event
      this.emit('alertUpdated', { alertId, updates })

      this.logger.debug(`Alert updated successfully`, { alertId })
      return true
    } catch (error) {
      this.logger.error(`Failed to update alert ${alertId}`, error as Error, { updates })
      return false
    }
  }

  async resolveAlert(alertId: string, resolution?: string): Promise<boolean> {
    try {
      this.logger.info(`Resolving alert ${alertId}`, { resolution })

      const alert = this.alerts.get(alertId)
      if (!alert) {
        this.logger.warn(`Alert not found`, { alertId })
        return false
      }

      if (alert.resolved) {
        this.logger.warn(`Alert already resolved`, { alertId })
        return true
      }

      // Update alert
      alert.resolved = true
      alert.resolvedAt = new Date()
      alert.resolution = resolution

      // Add to history
      const history = this.alertHistory.get(alertId) || []
      history.push({
        id: uuidv4(),
        alertId,
        action: 'RESOLVE',
        timestamp: new Date(),
        details: { resolution }
      })

      // Update monitoring service
      await this.monitoringService.resolveAlert(alertId)

      // Execute actions
      await this.executeAlertActions(alert, ['RESOLVE'])

      // Emit event
      this.emit('alertResolved', { alertId, resolution })

      this.logger.info(`Alert resolved successfully`, { alertId })
      return true
    } catch (error) {
      this.logger.error(`Failed to resolve alert ${alertId}`, error as Error, { resolution })
      return false
    }
  }

  async escalateAlert(alertId: string, escalationLevel: number): Promise<boolean> {
    try {
      this.logger.info(`Escalating alert ${alertId} to level ${escalationLevel}`)

      const alert = this.alerts.get(alertId)
      if (!alert) {
        this.logger.warn(`Alert not found`, { alertId })
        return false
      }

      if (alert.resolved) {
        this.logger.warn(`Cannot escalate resolved alert`, { alertId })
        return false
      }

      // Update alert
      alert.escalationLevel = escalationLevel

      // Add to history
      const history = this.alertHistory.get(alertId) || []
      history.push({
        id: uuidv4(),
        alertId,
        action: 'ESCALATE',
        timestamp: new Date(),
        details: { escalationLevel }
      })

      // Execute escalation actions
      await this.executeAlertActions(alert, ['ESCALATE'])

      // Emit event
      this.emit('alertEscalated', { alertId, escalationLevel })

      this.logger.info(`Alert escalated successfully`, { alertId, escalationLevel })
      return true
    } catch (error) {
      this.logger.error(`Failed to escalate alert ${alertId}`, error as Error, { escalationLevel })
      return false
    }
  }

  async getAlerts(filter?: AlertFilter): Promise<Alert[]> {
    try {
      this.logger.debug('Getting alerts', { filter })

      let alerts = Array.from(this.alerts.values())

      // Apply filters
      if (filter) {
        if (filter.agentId) {
          alerts = alerts.filter(a => a.agentId === filter.agentId)
        }
        if (filter.type) {
          alerts = alerts.filter(a => a.type === filter.type)
        }
        if (filter.severity) {
          alerts = alerts.filter(a => a.severity === filter.severity)
        }
        if (filter.resolved !== undefined) {
          alerts = alerts.filter(a => a.resolved === filter.resolved)
        }
        if (filter.acknowledged !== undefined) {
          alerts = alerts.filter(a => a.acknowledged === filter.acknowledged)
        }
        if (filter.tags && filter.tags.length > 0) {
          alerts = alerts.filter(a => filter.tags!.some(tag => a.tags.includes(tag)))
        }
        if (filter.timeRange) {
          alerts = alerts.filter(a => 
            a.timestamp >= filter.timeRange!.start && 
            a.timestamp <= filter.timeRange!.end
          )
        }
      }

      // Sort by timestamp (newest first)
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return alerts
    } catch (error) {
      this.logger.error('Failed to get alerts', error as Error, { filter })
      throw error
    }
  }

  async getAlert(alertId: string): Promise<Alert | null> {
    try {
      this.logger.debug(`Getting alert ${alertId}`)

      const alert = this.alerts.get(alertId)
      if (!alert) {
        this.logger.debug(`Alert not found`, { alertId })
        return null
      }

      return alert
    } catch (error) {
      this.logger.error(`Failed to get alert ${alertId}`, error as Error)
      throw error
    }
  }

  async getAlertHistory(alertId: string): Promise<AlertHistory[]> {
    try {
      this.logger.debug(`Getting alert history for alert ${alertId}`)

      const history = this.alertHistory.get(alertId) || []
      
      // Sort by timestamp (newest first)
      return [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    } catch (error) {
      this.logger.error(`Failed to get alert history for alert ${alertId}`, error as Error)
      throw error
    }
  }

  async addAlertRule(rule: AlertRule): Promise<void> {
    try {
      this.logger.info('Adding alert rule', { rule })

      this.alertRules.set(rule.id, rule)

      this.logger.info('Alert rule added successfully', { ruleId: rule.id })
    } catch (error) {
      this.logger.error('Failed to add alert rule', error as Error, { rule })
      throw error
    }
  }

  async removeAlertRule(ruleId: string): Promise<boolean> {
    try {
      this.logger.info(`Removing alert rule ${ruleId}`)

      const deleted = this.alertRules.delete(ruleId)
      
      if (deleted) {
        this.logger.info(`Alert rule removed successfully`, { ruleId })
      } else {
        this.logger.warn(`Alert rule not found`, { ruleId })
      }

      return deleted
    } catch (error) {
      this.logger.error(`Failed to remove alert rule ${ruleId}`, error as Error)
      return false
    }
  }

  async getAlertRules(): Promise<AlertRule[]> {
    try {
      this.logger.debug('Getting alert rules')

      return Array.from(this.alertRules.values())
    } catch (error) {
      this.logger.error('Failed to get alert rules', error as Error)
      throw error
    }
  }

  async configure(config: AlertManagerConfig): Promise<void> {
    try {
      this.logger.info('Configuring alert manager', { config })

      this.config = config

      // Restart timers if running
      if (this.isRunning) {
        this.stopTimers()
        this.startTimers()
      }

      this.logger.info('Alert manager configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure alert manager', error as Error, { config })
      throw error
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Alert manager is already running')
        return
      }

      this.logger.info('Starting alert manager')

      this.isRunning = true
      this.startTimers()

      this.logger.info('Alert manager started successfully')
    } catch (error) {
      this.logger.error('Failed to start alert manager', error as Error)
      throw error
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Alert manager is not running')
        return
      }

      this.logger.info('Stopping alert manager')

      this.isRunning = false
      this.stopTimers()

      this.logger.info('Alert manager stopped successfully')
    } catch (error) {
      this.logger.error('Failed to stop alert manager', error as Error)
      throw error
    }
  }

  private startTimers(): void {
    // Start escalation timer
    this.escalationTimer = setInterval(async () => {
      await this.checkEscalations()
    }, 60000) // Check every minute

    // Start auto-resolve timer
    this.autoResolveTimer = setInterval(async () => {
      await this.checkAutoResolve()
    }, 300000) // Check every 5 minutes
  }

  private stopTimers(): void {
    if (this.escalationTimer) {
      clearInterval(this.escalationTimer)
      this.escalationTimer = null
    }

    if (this.autoResolveTimer) {
      clearInterval(this.autoResolveTimer)
      this.autoResolveTimer = null
    }
  }

  private async checkEscalations(): Promise<void> {
    try {
      const now = new Date()
      
      for (const alert of this.alerts.values()) {
        if (alert.resolved || alert.acknowledged) {
          continue
        }

        // Check if alert needs escalation
        const escalationRule = this.config.escalationRules.find(r => r.severity === alert.severity)
        if (!escalationRule) {
          continue
        }

        const currentLevel = escalationRule.levels.find(l => l.level === alert.escalationLevel)
        if (!currentLevel) {
          continue
        }

        const timeSinceCreation = now.getTime() - alert.timestamp.getTime()
        if (timeSinceCreation >= currentLevel.timeout) {
          const nextLevel = escalationRule.levels.find(l => l.level === alert.escalationLevel + 1)
          if (nextLevel) {
            await this.escalateAlert(alert.id, nextLevel.level)
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to check escalations', error as Error)
    }
  }

  private async checkAutoResolve(): Promise<void> {
    try {
      const now = new Date()
      
      for (const alert of this.alerts.values()) {
        if (alert.resolved) {
          continue
        }

        const timeSinceCreation = now.getTime() - alert.timestamp.getTime()
        if (timeSinceCreation >= this.config.autoResolveTimeout) {
          await this.resolveAlert(alert.id, 'Auto-resolved due to timeout')
        }
      }
    } catch (error) {
      this.logger.error('Failed to check auto-resolve', error as Error)
    }
  }

  private async executeAlertActions(alert: Alert, actions: AlertAction[]): Promise<void> {
    try {
      for (const action of actions) {
        switch (action) {
          case 'NOTIFY':
            await this.sendNotification(alert)
            break
          case 'ESCALATE':
            await this.sendEscalationNotification(alert)
            break
          case 'RESOLVE':
            await this.sendResolutionNotification(alert)
            break
          case 'ACKNOWLEDGE':
            await this.sendAcknowledgementNotification(alert)
            break
          case 'CREATE_TICKET':
            await this.createTicket(alert)
            break
        }
      }
    } catch (error) {
      this.logger.error('Failed to execute alert actions', error as Error, { alertId: alert.id, actions })
    }
  }

  private async sendNotification(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Sending notification for alert ${alert.id}`)

      // This is a mock implementation
      // In production, you would integrate with actual notification services
      this.logger.info(`Notification sent for alert ${alert.id}`, {
        alertId: alert.id,
        severity: alert.severity,
        message: alert.message
      })

      // Emit event
      this.emit('notificationSent', { alert, action: 'NOTIFY' })
    } catch (error) {
      this.logger.error(`Failed to send notification for alert ${alert.id}`, error as Error)
    }
  }

  private async sendEscalationNotification(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Sending escalation notification for alert ${alert.id}`)

      // This is a mock implementation
      // In production, you would integrate with actual notification services
      this.logger.info(`Escalation notification sent for alert ${alert.id}`, {
        alertId: alert.id,
        escalationLevel: alert.escalationLevel,
        severity: alert.severity,
        message: alert.message
      })

      // Emit event
      this.emit('notificationSent', { alert, action: 'ESCALATE' })
    } catch (error) {
      this.logger.error(`Failed to send escalation notification for alert ${alert.id}`, error as Error)
    }
  }

  private async sendResolutionNotification(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Sending resolution notification for alert ${alert.id}`)

      // This is a mock implementation
      // In production, you would integrate with actual notification services
      this.logger.info(`Resolution notification sent for alert ${alert.id}`, {
        alertId: alert.id,
        resolution: alert.resolution
      })

      // Emit event
      this.emit('notificationSent', { alert, action: 'RESOLVE' })
    } catch (error) {
      this.logger.error(`Failed to send resolution notification for alert ${alert.id}`, error as Error)
    }
  }

  private async sendAcknowledgementNotification(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Sending acknowledgement notification for alert ${alert.id}`)

      // This is a mock implementation
      // In production, you would integrate with actual notification services
      this.logger.info(`Acknowledgement notification sent for alert ${alert.id}`, {
        alertId: alert.id,
        acknowledgedBy: alert.acknowledgedBy
      })

      // Emit event
      this.emit('notificationSent', { alert, action: 'ACKNOWLEDGE' })
    } catch (error) {
      this.logger.error(`Failed to send acknowledgement notification for alert ${alert.id}`, error as Error)
    }
  }

  private async createTicket(alert: Alert): Promise<void> {
    try {
      this.logger.info(`Creating ticket for alert ${alert.id}`)

      // This is a mock implementation
      // In production, you would integrate with actual ticketing systems
      const ticketId = `TICKET-${Date.now()}`
      
      this.logger.info(`Ticket created for alert ${alert.id}`, {
        alertId: alert.id,
        ticketId,
        severity: alert.severity,
        message: alert.message
      })

      // Add to alert metadata
      alert.metadata = {
        ...alert.metadata,
        ticketId
      }

      // Emit event
      this.emit('ticketCreated', { alert, ticketId })
    } catch (error) {
      this.logger.error(`Failed to create ticket for alert ${alert.id}`, error as Error)
    }
  }
}