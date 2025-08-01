import { ILogger, IMonitoringService, IErrorHandler } from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface ITaskScheduler {
  scheduleTask(task: ScheduledTask): Promise<string>
  cancelScheduledTask(taskId: string): Promise<boolean>
  getScheduledTasks(agentId?: string): Promise<ScheduledTask[]>
  getTaskSchedule(taskId: string): Promise<ScheduledTask | null>
  updateTaskSchedule(taskId: string, updates: Partial<ScheduledTask>): Promise<boolean>
  configure(config: SchedulerConfig): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

export interface ScheduledTask {
  id: string
  agentId: string
  type: string
  data: any
  schedule: TaskSchedule
  priority?: number
  timeout?: number
  metadata?: any
  status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED'
  createdAt: Date
  scheduledAt: Date
  lastRunAt?: Date
  nextRunAt?: Date
  runCount: number
  maxRuns?: number
}

export interface TaskSchedule {
  type: 'ONCE' | 'RECURRING' | 'CRON'
  once?: {
    at: Date
  }
  recurring?: {
    interval: number // in milliseconds
    times?: number // number of times to run
  }
  cron?: {
    expression: string // cron expression
  }
}

export interface SchedulerConfig {
  maxScheduledTasks?: number
  defaultTimeout?: number
  processingInterval?: number
  timezone?: string
}

export class TaskScheduler extends EventEmitter implements ITaskScheduler {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private scheduledTasks: Map<string, ScheduledTask> = new Map()
  private taskTimers: Map<string, NodeJS.Timeout> = new Map()
  private isRunning: boolean = false
  private processingTimer: NodeJS.Timeout | null = null
  private maxScheduledTasks: number = 1000
  private defaultTimeout: number = 300000 // 5 minutes
  private processingInterval: number = 60000 // 1 minute
  private timezone: string = 'UTC'

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
  }

  async scheduleTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'status' | 'runCount'>): Promise<string> {
    try {
      this.logger.info(`Scheduling task for agent ${task.agentId}`, { task })

      // Check max scheduled tasks
      if (this.scheduledTasks.size >= this.maxScheduledTasks) {
        throw new Error('Maximum number of scheduled tasks reached')
      }

      // Create full scheduled task
      const scheduledTask: ScheduledTask = {
        ...task,
        id: uuidv4(),
        createdAt: new Date(),
        status: 'SCHEDULED',
        runCount: 0
      }

      // Calculate next run time
      scheduledTask.nextRunAt = this.calculateNextRunTime(scheduledTask)

      // Store task
      this.scheduledTasks.set(scheduledTask.id, scheduledTask)

      // Schedule the task
      if (this.isRunning) {
        await this.scheduleTaskExecution(scheduledTask)
      }

      this.logger.info(`Task scheduled successfully for agent ${task.agentId}`, {
        taskId: scheduledTask.id,
        agentId: task.agentId,
        nextRunAt: scheduledTask.nextRunAt
      })

      // Record metric
      await this.monitoringService.recordMetric(task.agentId, {
        id: uuidv4(),
        agentId: task.agentId,
        type: 'SCHEDULER' as any,
        name: 'tasks_scheduled',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: scheduledTask.id, taskType: task.type }
      })

      // Emit event
      this.emit('taskScheduled', { task: scheduledTask })

      return scheduledTask.id
    } catch (error) {
      this.logger.error(`Failed to schedule task for agent ${task.agentId}`, error as Error, { task })
      throw error
    }
  }

  async cancelScheduledTask(taskId: string): Promise<boolean> {
    try {
      this.logger.info(`Canceling scheduled task ${taskId}`, { taskId })

      const task = this.scheduledTasks.get(taskId)
      if (!task) {
        this.logger.warn(`Scheduled task not found for cancellation`, { taskId })
        return false
      }

      // Cancel timer
      const timer = this.taskTimers.get(taskId)
      if (timer) {
        clearTimeout(timer)
        this.taskTimers.delete(taskId)
      }

      // Update task status
      task.status = 'CANCELED'
      task.nextRunAt = undefined

      this.logger.info(`Scheduled task canceled successfully`, { taskId })

      // Record metric
      await this.monitoringService.recordMetric(task.agentId, {
        id: uuidv4(),
        agentId: task.agentId,
        type: 'SCHEDULER' as any,
        name: 'tasks_canceled',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId }
      })

      // Emit event
      this.emit('taskCanceled', { task })

      return true
    } catch (error) {
      this.logger.error(`Failed to cancel scheduled task ${taskId}`, error as Error, { taskId })
      return false
    }
  }

  async getScheduledTasks(agentId?: string): Promise<ScheduledTask[]> {
    try {
      const tasks: ScheduledTask[] = []

      for (const task of this.scheduledTasks.values()) {
        if (!agentId || task.agentId === agentId) {
          tasks.push(task)
        }
      }

      // Sort by next run time
      tasks.sort((a, b) => {
        if (!a.nextRunAt) return 1
        if (!b.nextRunAt) return -1
        return a.nextRunAt.getTime() - b.nextRunAt.getTime()
      })

      return tasks
    } catch (error) {
      this.logger.error('Failed to get scheduled tasks', error as Error, { agentId })
      throw error
    }
  }

  async getTaskSchedule(taskId: string): Promise<ScheduledTask | null> {
    try {
      return this.scheduledTasks.get(taskId) || null
    } catch (error) {
      this.logger.error(`Failed to get task schedule for task ${taskId}`, error as Error, { taskId })
      throw error
    }
  }

  async updateTaskSchedule(taskId: string, updates: Partial<ScheduledTask>): Promise<boolean> {
    try {
      this.logger.info(`Updating task schedule for task ${taskId}`, { taskId, updates })

      const task = this.scheduledTasks.get(taskId)
      if (!task) {
        this.logger.warn(`Scheduled task not found for update`, { taskId })
        return false
      }

      // Update task
      Object.assign(task, updates)

      // Recalculate next run time if schedule changed
      if (updates.schedule) {
        task.nextRunAt = this.calculateNextRunTime(task)
        
        // Reschedule if running
        if (this.isRunning) {
          const timer = this.taskTimers.get(taskId)
          if (timer) {
            clearTimeout(timer)
            this.taskTimers.delete(taskId)
          }
          await this.scheduleTaskExecution(task)
        }
      }

      this.logger.info(`Task schedule updated successfully for task ${taskId}`, { taskId })

      // Emit event
      this.emit('taskScheduleUpdated', { task })

      return true
    } catch (error) {
      this.logger.error(`Failed to update task schedule for task ${taskId}`, error as Error, { taskId, updates })
      return false
    }
  }

  async configure(config: SchedulerConfig): Promise<void> {
    try {
      this.logger.info('Configuring task scheduler', { config })

      if (config.maxScheduledTasks !== undefined) {
        this.maxScheduledTasks = config.maxScheduledTasks
      }

      if (config.defaultTimeout !== undefined) {
        this.defaultTimeout = config.defaultTimeout
      }

      if (config.processingInterval !== undefined) {
        this.processingInterval = config.processingInterval
        
        // Restart processing timer if running
        if (this.isRunning && this.processingTimer) {
          clearInterval(this.processingTimer)
          this.startProcessing()
        }
      }

      if (config.timezone !== undefined) {
        this.timezone = config.timezone
      }

      this.logger.info('Task scheduler configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure task scheduler', error as Error, { config })
      throw error
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Task scheduler is already running')
        return
      }

      this.logger.info('Starting task scheduler')

      this.isRunning = true
      this.startProcessing()

      // Schedule all existing tasks
      for (const task of this.scheduledTasks.values()) {
        if (task.status === 'SCHEDULED') {
          await this.scheduleTaskExecution(task)
        }
      }

      this.logger.info('Task scheduler started successfully')
    } catch (error) {
      this.logger.error('Failed to start task scheduler', error as Error)
      throw error
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Task scheduler is not running')
        return
      }

      this.logger.info('Stopping task scheduler')

      this.isRunning = false

      // Stop processing timer
      if (this.processingTimer) {
        clearInterval(this.processingTimer)
        this.processingTimer = null
      }

      // Clear all task timers
      for (const timer of this.taskTimers.values()) {
        clearTimeout(timer)
      }
      this.taskTimers.clear()

      this.logger.info('Task scheduler stopped successfully')
    } catch (error) {
      this.logger.error('Failed to stop task scheduler', error as Error)
      throw error
    }
  }

  private startProcessing(): void {
    this.processingTimer = setInterval(async () => {
      await this.processScheduledTasks()
    }, this.processingInterval)
  }

  private async processScheduledTasks(): Promise<void> {
    try {
      const now = new Date()
      
      for (const task of this.scheduledTasks.values()) {
        if (task.status !== 'SCHEDULED' || !task.nextRunAt) {
          continue
        }

        if (task.nextRunAt <= now) {
          await this.executeScheduledTask(task)
        }
      }
    } catch (error) {
      this.logger.error('Failed to process scheduled tasks', error as Error)
    }
  }

  private async scheduleTaskExecution(task: ScheduledTask): Promise<void> {
    if (!task.nextRunAt) {
      return
    }

    const now = new Date()
    const delay = task.nextRunAt.getTime() - now.getTime()

    if (delay <= 0) {
      // Task should run immediately
      await this.executeScheduledTask(task)
      return
    }

    const timer = setTimeout(async () => {
      await this.executeScheduledTask(task)
    }, delay)

    this.taskTimers.set(task.id, timer)
  }

  private async executeScheduledTask(task: ScheduledTask): Promise<void> {
    try {
      this.logger.info(`Executing scheduled task for agent ${task.agentId}`, {
        taskId: task.id,
        agentId: task.agentId,
        taskType: task.type
      })

      // Update task status
      task.status = 'RUNNING'
      task.lastRunAt = new Date()
      task.runCount++

      // Clear timer
      this.taskTimers.delete(task.id)

      // Record metric
      await this.monitoringService.recordMetric(task.agentId, {
        id: uuidv4(),
        agentId: task.agentId,
        type: 'SCHEDULER' as any,
        name: 'scheduled_tasks_started',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: task.id, runCount: task.runCount }
      })

      // Emit event
      this.emit('scheduledTaskStarted', { task })

      try {
        // Execute task (this would be handled by the task queue)
        // For now, we'll just mark it as completed
        task.status = 'COMPLETED'

        // Calculate next run time
        task.nextRunAt = this.calculateNextRunTime(task)

        // Reschedule if needed
        if (task.nextRunAt && task.status === 'SCHEDULED') {
          await this.scheduleTaskExecution(task)
        }

        this.logger.info(`Scheduled task completed successfully for agent ${task.agentId}`, {
          taskId: task.id,
          agentId: task.agentId,
          runCount: task.runCount
        })

        // Record metric
        await this.monitoringService.recordMetric(task.agentId, {
          id: uuidv4(),
          agentId: task.agentId,
          type: 'SCHEDULER' as any,
          name: 'scheduled_tasks_completed',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { taskId: task.id, runCount: task.runCount }
        })

        // Emit event
        this.emit('scheduledTaskCompleted', { task })
      } catch (error) {
        task.status = 'FAILED'

        this.logger.error(`Scheduled task failed for agent ${task.agentId}`, error as Error, {
          taskId: task.id,
          agentId: task.agentId
        })

        // Record metric
        await this.monitoringService.recordMetric(task.agentId, {
          id: uuidv4(),
          agentId: task.agentId,
          type: 'SCHEDULER' as any,
          name: 'scheduled_tasks_failed',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { taskId: task.id, error: (error as Error).message }
        })

        // Emit event
        this.emit('scheduledTaskFailed', { task, error })

        // Handle error
        await this.errorHandler.handleError(error as Error, {
          agentId: task.agentId,
          component: 'task_scheduler',
          operation: 'execute_scheduled_task',
          metadata: { taskId: task.id }
        })
      }
    } catch (error) {
      this.logger.error(`Failed to execute scheduled task for agent ${task.agentId}`, error as Error, { task })
    }
  }

  private calculateNextRunTime(task: ScheduledTask): Date | undefined {
    const now = new Date()

    switch (task.schedule.type) {
      case 'ONCE':
        if (task.schedule.once) {
          return task.schedule.once.at
        }
        break

      case 'RECURRING':
        if (task.schedule.recurring) {
          const { interval, times } = task.schedule.recurring
          
          // Check max runs
          if (times && task.runCount >= times) {
            return undefined
          }

          // Calculate next run time
          const baseTime = task.lastRunAt || now
          return new Date(baseTime.getTime() + interval)
        }
        break

      case 'CRON':
        // For now, we'll use a simple implementation
        // In production, use a proper cron library
        if (task.schedule.cron) {
          // This is a placeholder - implement proper cron parsing
          const interval = 60000 // 1 minute as default
          const baseTime = task.lastRunAt || now
          return new Date(baseTime.getTime() + interval)
        }
        break
    }

    return undefined
  }
}