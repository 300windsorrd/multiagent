import { ILogger, IMonitoringService } from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface IMetricsCollector {
  collectSystemMetrics(): Promise<SystemMetrics>
  collectAgentMetrics(agentId: string): Promise<AgentMetrics>
  collectTaskMetrics(agentId: string): Promise<TaskMetrics>
  collectPerformanceMetrics(agentId: string): Promise<PerformanceMetrics>
  collectCustomMetrics(agentId: string, metrics: CustomMetric[]): Promise<void>
  getMetricsHistory(agentId?: string, timeRange?: TimeRange): Promise<MetricsHistory>
  configure(config: MetricsCollectorConfig): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

export interface SystemMetrics {
  timestamp: Date
  cpu: {
    usage: number
    cores: number
    loadAverage: number[]
  }
  memory: {
    total: number
    used: number
    free: number
    usage: number
  }
  disk: {
    total: number
    used: number
    free: number
    usage: number
  }
  network: {
    bytesReceived: number
    bytesSent: number
    packetsReceived: number
    packetsSent: number
  }
  uptime: number
  processes: number
}

export interface AgentMetrics {
  agentId: string
  timestamp: Date
  status: string
  uptime: number
  memoryUsage: number
  cpuUsage: number
  tasksExecuted: number
  tasksFailed: number
  tasksCompleted: number
  averageTaskDuration: number
  lastActivity: Date
  activeConnections: number
}

export interface TaskMetrics {
  agentId: string
  timestamp: Date
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  queuedTasks: number
  averageExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
  tasksByType: Record<string, number>
  tasksByStatus: Record<string, number>
}

export interface PerformanceMetrics {
  agentId: string
  timestamp: Date
  responseTime: number
  throughput: number
  errorRate: number
  successRate: number
  latency: {
    p50: number
    p90: number
    p95: number
    p99: number
  }
  resourceUsage: {
    cpu: number
    memory: number
    disk: number
    network: number
  }
}

export interface CustomMetric {
  name: string
  value: number
  unit: string
  tags?: Record<string, string>
  metadata?: any
}

export interface MetricsHistory {
  systemMetrics: SystemMetrics[]
  agentMetrics: AgentMetrics[]
  taskMetrics: TaskMetrics[]
  performanceMetrics: PerformanceMetrics[]
  customMetrics: Record<string, CustomMetric[]>
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface MetricsCollectorConfig {
  collectionInterval: number
  retentionPeriod: number
  maxHistorySize: number
  enableSystemMetrics: boolean
  enableAgentMetrics: boolean
  enableTaskMetrics: boolean
  enablePerformanceMetrics: boolean
  customMetricsEnabled: boolean
}

export class MetricsCollector extends EventEmitter implements IMetricsCollector {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private systemMetricsHistory: SystemMetrics[] = []
  private agentMetricsHistory: Map<string, AgentMetrics[]> = new Map()
  private taskMetricsHistory: Map<string, TaskMetrics[]> = new Map()
  private performanceMetricsHistory: Map<string, PerformanceMetrics[]> = new Map()
  private customMetricsHistory: Map<string, Record<string, CustomMetric[]>> = new Map()
  private collectionTimer: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private collectionInterval: number = 60000 // 1 minute
  private retentionPeriod: number = 24 * 60 * 60 * 1000 // 24 hours
  private maxHistorySize: number = 1000
  private enableSystemMetrics: boolean = true
  private enableAgentMetrics: boolean = true
  private enableTaskMetrics: boolean = true
  private enablePerformanceMetrics: boolean = true
  private customMetricsEnabled: boolean = true

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
  }

  async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      this.logger.debug('Collecting system metrics')

      // This is a mock implementation
      // In production, you would use actual system monitoring libraries
      const metrics: SystemMetrics = {
        timestamp: new Date(),
        cpu: {
          usage: Math.random() * 100,
          cores: 4,
          loadAverage: [Math.random() * 2, Math.random() * 2, Math.random() * 2]
        },
        memory: {
          total: 16 * 1024 * 1024 * 1024, // 16GB
          used: Math.random() * 16 * 1024 * 1024 * 1024,
          free: Math.random() * 16 * 1024 * 1024 * 1024,
          usage: Math.random() * 100
        },
        disk: {
          total: 500 * 1024 * 1024 * 1024, // 500GB
          used: Math.random() * 500 * 1024 * 1024 * 1024,
          free: Math.random() * 500 * 1024 * 1024 * 1024,
          usage: Math.random() * 100
        },
        network: {
          bytesReceived: Math.random() * 1000000,
          bytesSent: Math.random() * 1000000,
          packetsReceived: Math.random() * 10000,
          packetsSent: Math.random() * 10000
        },
        uptime: process.uptime(),
        processes: Math.floor(Math.random() * 500)
      }

      // Store in history
      this.systemMetricsHistory.push(metrics)
      this.cleanupHistory(this.systemMetricsHistory)

      // Record with monitoring service
      await this.monitoringService.recordMetric('system', {
        id: uuidv4(),
        agentId: 'system',
        type: 'SYSTEM' as any,
        name: 'cpu_usage',
        value: metrics.cpu.usage,
        unit: 'percent',
        timestamp: metrics.timestamp,
        metadata: { cores: metrics.cpu.cores, loadAverage: metrics.cpu.loadAverage }
      })

      await this.monitoringService.recordMetric('system', {
        id: uuidv4(),
        agentId: 'system',
        type: 'SYSTEM' as any,
        name: 'memory_usage',
        value: metrics.memory.usage,
        unit: 'percent',
        timestamp: metrics.timestamp,
        metadata: { total: metrics.memory.total, used: metrics.memory.used }
      })

      this.logger.debug('System metrics collected successfully')

      return metrics
    } catch (error) {
      this.logger.error('Failed to collect system metrics', error as Error)
      throw error
    }
  }

  async collectAgentMetrics(agentId: string): Promise<AgentMetrics> {
    try {
      this.logger.debug(`Collecting agent metrics for agent ${agentId}`)

      // This is a mock implementation
      // In production, you would collect actual agent metrics
      const metrics: AgentMetrics = {
        agentId,
        timestamp: new Date(),
        status: 'RUNNING',
        uptime: Math.random() * 86400000, // Up to 24 hours
        memoryUsage: Math.random() * 100,
        cpuUsage: Math.random() * 100,
        tasksExecuted: Math.floor(Math.random() * 1000),
        tasksFailed: Math.floor(Math.random() * 100),
        tasksCompleted: Math.floor(Math.random() * 900),
        averageTaskDuration: Math.random() * 5000,
        lastActivity: new Date(),
        activeConnections: Math.floor(Math.random() * 10)
      }

      // Store in history
      if (!this.agentMetricsHistory.has(agentId)) {
        this.agentMetricsHistory.set(agentId, [])
      }
      const history = this.agentMetricsHistory.get(agentId)!
      history.push(metrics)
      this.cleanupHistory(history)

      // Record with monitoring service
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'AGENT' as any,
        name: 'memory_usage',
        value: metrics.memoryUsage,
        unit: 'percent',
        timestamp: metrics.timestamp,
        metadata: {}
      })

      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'AGENT' as any,
        name: 'cpu_usage',
        value: metrics.cpuUsage,
        unit: 'percent',
        timestamp: metrics.timestamp,
        metadata: {}
      })

      this.logger.debug(`Agent metrics collected successfully for agent ${agentId}`)

      return metrics
    } catch (error) {
      this.logger.error(`Failed to collect agent metrics for agent ${agentId}`, error as Error)
      throw error
    }
  }

  async collectTaskMetrics(agentId: string): Promise<TaskMetrics> {
    try {
      this.logger.debug(`Collecting task metrics for agent ${agentId}`)

      // This is a mock implementation
      // In production, you would collect actual task metrics
      const metrics: TaskMetrics = {
        agentId,
        timestamp: new Date(),
        totalTasks: Math.floor(Math.random() * 1000),
        completedTasks: Math.floor(Math.random() * 900),
        failedTasks: Math.floor(Math.random() * 100),
        runningTasks: Math.floor(Math.random() * 10),
        queuedTasks: Math.floor(Math.random() * 50),
        averageExecutionTime: Math.random() * 5000,
        minExecutionTime: Math.random() * 1000,
        maxExecutionTime: Math.random() * 10000,
        tasksByType: {
          'PROCESSING': Math.floor(Math.random() * 500),
          'ANALYSIS': Math.floor(Math.random() * 300),
          'COMMUNICATION': Math.floor(Math.random() * 200)
        },
        tasksByStatus: {
          'COMPLETED': Math.floor(Math.random() * 900),
          'FAILED': Math.floor(Math.random() * 100),
          'RUNNING': Math.floor(Math.random() * 10),
          'QUEUED': Math.floor(Math.random() * 50)
        }
      }

      // Store in history
      if (!this.taskMetricsHistory.has(agentId)) {
        this.taskMetricsHistory.set(agentId, [])
      }
      const history = this.taskMetricsHistory.get(agentId)!
      history.push(metrics)
      this.cleanupHistory(history)

      // Record with monitoring service
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'TASK' as any,
        name: 'task_completion_rate',
        value: metrics.completedTasks / metrics.totalTasks * 100,
        unit: 'percent',
        timestamp: metrics.timestamp,
        metadata: { total: metrics.totalTasks, completed: metrics.completedTasks }
      })

      this.logger.debug(`Task metrics collected successfully for agent ${agentId}`)

      return metrics
    } catch (error) {
      this.logger.error(`Failed to collect task metrics for agent ${agentId}`, error as Error)
      throw error
    }
  }

  async collectPerformanceMetrics(agentId: string): Promise<PerformanceMetrics> {
    try {
      this.logger.debug(`Collecting performance metrics for agent ${agentId}`)

      // This is a mock implementation
      // In production, you would collect actual performance metrics
      const metrics: PerformanceMetrics = {
        agentId,
        timestamp: new Date(),
        responseTime: Math.random() * 1000,
        throughput: Math.random() * 100,
        errorRate: Math.random() * 5,
        successRate: 95 + Math.random() * 5,
        latency: {
          p50: Math.random() * 100,
          p90: Math.random() * 200,
          p95: Math.random() * 300,
          p99: Math.random() * 500
        },
        resourceUsage: {
          cpu: Math.random() * 100,
          memory: Math.random() * 100,
          disk: Math.random() * 100,
          network: Math.random() * 100
        }
      }

      // Store in history
      if (!this.performanceMetricsHistory.has(agentId)) {
        this.performanceMetricsHistory.set(agentId, [])
      }
      const history = this.performanceMetricsHistory.get(agentId)!
      history.push(metrics)
      this.cleanupHistory(history)

      // Record with monitoring service
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'PERFORMANCE' as any,
        name: 'response_time',
        value: metrics.responseTime,
        unit: 'ms',
        timestamp: metrics.timestamp,
        metadata: {}
      })

      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'PERFORMANCE' as any,
        name: 'throughput',
        value: metrics.throughput,
        unit: 'requests_per_second',
        timestamp: metrics.timestamp,
        metadata: {}
      })

      this.logger.debug(`Performance metrics collected successfully for agent ${agentId}`)

      return metrics
    } catch (error) {
      this.logger.error(`Failed to collect performance metrics for agent ${agentId}`, error as Error)
      throw error
    }
  }

  async collectCustomMetrics(agentId: string, metrics: CustomMetric[]): Promise<void> {
    try {
      this.logger.debug(`Collecting custom metrics for agent ${agentId}`, { metrics })

      if (!this.customMetricsHistory.has(agentId)) {
        this.customMetricsHistory.set(agentId, {})
      }

      const agentMetrics = this.customMetricsHistory.get(agentId)!

      for (const metric of metrics) {
        if (!agentMetrics[metric.name]) {
          agentMetrics[metric.name] = []
        }

        const metricWithTimestamp: CustomMetric = {
          ...metric,
          metadata: {
            ...metric.metadata,
            timestamp: new Date()
          }
        }

        agentMetrics[metric.name].push(metricWithTimestamp)
        this.cleanupHistory(agentMetrics[metric.name] as any)

        // Record with monitoring service
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'CUSTOM' as any,
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          timestamp: new Date(),
          metadata: { tags: metric.tags, ...metric.metadata }
        })
      }

      this.logger.debug(`Custom metrics collected successfully for agent ${agentId}`)
    } catch (error) {
      this.logger.error(`Failed to collect custom metrics for agent ${agentId}`, error as Error)
      throw error
    }
  }

  async getMetricsHistory(agentId?: string, timeRange?: TimeRange): Promise<MetricsHistory> {
    try {
      this.logger.debug('Getting metrics history', { agentId, timeRange })

      const result: MetricsHistory = {
        systemMetrics: [],
        agentMetrics: [],
        taskMetrics: [],
        performanceMetrics: [],
        customMetrics: {}
      }

      // Filter system metrics
      if (this.enableSystemMetrics) {
        result.systemMetrics = this.filterByTimeRange(this.systemMetricsHistory, timeRange)
      }

      // Filter agent metrics
      if (agentId && this.enableAgentMetrics) {
        result.agentMetrics = this.filterByTimeRange(
          this.agentMetricsHistory.get(agentId) || [],
          timeRange
        )
      } else if (this.enableAgentMetrics) {
        for (const metrics of this.agentMetricsHistory.values()) {
          result.agentMetrics.push(...this.filterByTimeRange(metrics, timeRange))
        }
      }

      // Filter task metrics
      if (agentId && this.enableTaskMetrics) {
        result.taskMetrics = this.filterByTimeRange(
          this.taskMetricsHistory.get(agentId) || [],
          timeRange
        )
      } else if (this.enableTaskMetrics) {
        for (const metrics of this.taskMetricsHistory.values()) {
          result.taskMetrics.push(...this.filterByTimeRange(metrics, timeRange))
        }
      }

      // Filter performance metrics
      if (agentId && this.enablePerformanceMetrics) {
        result.performanceMetrics = this.filterByTimeRange(
          this.performanceMetricsHistory.get(agentId) || [],
          timeRange
        )
      } else if (this.enablePerformanceMetrics) {
        for (const metrics of this.performanceMetricsHistory.values()) {
          result.performanceMetrics.push(...this.filterByTimeRange(metrics, timeRange))
        }
      }

      // Filter custom metrics
      if (agentId && this.customMetricsEnabled) {
        const agentCustomMetrics = this.customMetricsHistory.get(agentId) || {}
        for (const [name, metrics] of Object.entries(agentCustomMetrics)) {
          result.customMetrics[name] = this.filterByTimeRange(metrics as any, timeRange) as unknown as CustomMetric[]
        }
      } else if (this.customMetricsEnabled) {
        for (const agentMetrics of this.customMetricsHistory.values()) {
          for (const [name, metrics] of Object.entries(agentMetrics)) {
            if (!result.customMetrics[name]) {
              result.customMetrics[name] = []
            }
            result.customMetrics[name].push(...(this.filterByTimeRange(metrics as any, timeRange) as unknown as CustomMetric[]))
          }
        }
      }

      return result
    } catch (error) {
      this.logger.error('Failed to get metrics history', error as Error)
      throw error
    }
  }

  async configure(config: MetricsCollectorConfig): Promise<void> {
    try {
      this.logger.info('Configuring metrics collector', { config })

      if (config.collectionInterval !== undefined) {
        this.collectionInterval = config.collectionInterval
        
        // Restart collection timer if running
        if (this.isRunning && this.collectionTimer) {
          clearInterval(this.collectionTimer)
          this.startCollection()
        }
      }

      if (config.retentionPeriod !== undefined) {
        this.retentionPeriod = config.retentionPeriod
      }

      if (config.maxHistorySize !== undefined) {
        this.maxHistorySize = config.maxHistorySize
      }

      if (config.enableSystemMetrics !== undefined) {
        this.enableSystemMetrics = config.enableSystemMetrics
      }

      if (config.enableAgentMetrics !== undefined) {
        this.enableAgentMetrics = config.enableAgentMetrics
      }

      if (config.enableTaskMetrics !== undefined) {
        this.enableTaskMetrics = config.enableTaskMetrics
      }

      if (config.enablePerformanceMetrics !== undefined) {
        this.enablePerformanceMetrics = config.enablePerformanceMetrics
      }

      if (config.customMetricsEnabled !== undefined) {
        this.customMetricsEnabled = config.customMetricsEnabled
      }

      this.logger.info('Metrics collector configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure metrics collector', error as Error, { config })
      throw error
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Metrics collector is already running')
        return
      }

      this.logger.info('Starting metrics collector')

      this.isRunning = true
      this.startCollection()

      this.logger.info('Metrics collector started successfully')
    } catch (error) {
      this.logger.error('Failed to start metrics collector', error as Error)
      throw error
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Metrics collector is not running')
        return
      }

      this.logger.info('Stopping metrics collector')

      this.isRunning = false

      if (this.collectionTimer) {
        clearInterval(this.collectionTimer)
        this.collectionTimer = null
      }

      this.logger.info('Metrics collector stopped successfully')
    } catch (error) {
      this.logger.error('Failed to stop metrics collector', error as Error)
      throw error
    }
  }

  private startCollection(): void {
    this.collectionTimer = setInterval(async () => {
      await this.collectAllMetrics()
    }, this.collectionInterval)
  }

  private async collectAllMetrics(): Promise<void> {
    try {
      // Collect system metrics
      if (this.enableSystemMetrics) {
        await this.collectSystemMetrics()
      }

      // Collect metrics for all agents
      const agentIds = Array.from(this.agentMetricsHistory.keys())
      
      for (const agentId of agentIds) {
        try {
          if (this.enableAgentMetrics) {
            await this.collectAgentMetrics(agentId)
          }
          
          if (this.enableTaskMetrics) {
            await this.collectTaskMetrics(agentId)
          }
          
          if (this.enablePerformanceMetrics) {
            await this.collectPerformanceMetrics(agentId)
          }
        } catch (error) {
          this.logger.error(`Failed to collect metrics for agent ${agentId}`, error as Error)
        }
      }

      // Emit event
      this.emit('metricsCollected', { timestamp: new Date() })
    } catch (error) {
      this.logger.error('Failed to collect metrics', error as Error)
    }
  }

  private cleanupHistory<T extends { timestamp: Date }>(history: T[]): void {
    const now = new Date()
    const cutoffTime = new Date(now.getTime() - this.retentionPeriod)

    // Remove old entries
    while (history.length > 0 && history[0].timestamp < cutoffTime) {
      history.shift()
    }

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize)
    }
  }

  private filterByTimeRange<T extends { timestamp: Date }>(
    history: T[],
    timeRange?: TimeRange
  ): T[] {
    if (!timeRange) {
      return [...history]
    }

    return history.filter(item => 
      item.timestamp >= timeRange.start && item.timestamp <= timeRange.end
    )
  }
}