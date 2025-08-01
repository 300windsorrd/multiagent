import {
  ILogger,
  IMonitoringService,
  IErrorHandler,
  IAgentRegistry
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface ITaskQueue {
  enqueueTask(task: any): Promise<string>
  dequeueTask(agentId: string): Promise<any>
  getTask(taskId: string): Promise<any>
  getQueue(agentId: string): Promise<any[]>
  getActiveTasks(agentId?: string): Promise<any[]>
  getCompletedTasks(agentId?: string, limit?: number): Promise<any[]>
  cancelTask(taskId: string): Promise<boolean>
  setTaskPriority(taskType: string, priority: number): Promise<void>
  getTaskStats(agentId?: string): Promise<any>
  configure(config: any): Promise<void>
}

export class TaskQueue extends EventEmitter implements ITaskQueue {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private agentRegistry: IAgentRegistry
  private queues: Map<string, TaskQueueEntry[]> = new Map()
  private activeTasks: Map<string, TaskExecution> = new Map()
  private completedTasks: Map<string, TaskExecution[]> = new Map()
  private taskPriorities: Map<string, number> = new Map()
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private maxQueueSize: number = 1000
  private maxCompletedTasks: number = 1000
  private defaultTimeout: number = 300000 // 5 minutes
  private processingInterval: number = 1000 // 1 second
  private processingTimer: NodeJS.Timeout | null = null
  private isProcessing: boolean = false

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler,
    agentRegistry: IAgentRegistry
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
    this.agentRegistry = agentRegistry
    this.startProcessing()
  }

  async enqueueTask(task: Omit<Task, 'id' | 'createdAt' | 'status'>): Promise<string> {
    try {
      this.logger.info(`Enqueuing task for agent ${task.agentId}`, { task })

      // Create full task object
      const fullTask: Task = {
        ...task,
        id: uuidv4(),
        createdAt: new Date(),
        status: 'PENDING'
      }

      // Get or create queue for agent
      if (!this.queues.has(task.agentId)) {
        this.queues.set(task.agentId, [])
      }

      const queue = this.queues.get(task.agentId)!

      // Check queue size
      if (queue.length >= this.maxQueueSize) {
        throw new Error(`Queue size exceeded for agent ${task.agentId}`)
      }

      // Add to queue
      queue.push({ task: fullTask, enqueuedAt: new Date() })

      // Sort by priority
      queue.sort((a, b) => {
        const priorityA = this.taskPriorities.get(a.task.type) || 0
        const priorityB = this.taskPriorities.get(b.task.type) || 0
        return priorityB - priorityA
      })

      this.logger.info(`Task enqueued successfully for agent ${task.agentId}`, {
        taskId: fullTask.id,
        agentId: task.agentId,
        queuePosition: queue.length
      })

      // Record metric
      await this.monitoringService.recordMetric(task.agentId, {
        id: uuidv4(),
        agentId: task.agentId,
        type: 'TASK' as any,
        name: 'tasks_enqueued',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: fullTask.id, taskType: task.type }
      })

      // Emit event
      this.emit('taskEnqueued', { task: fullTask })

      return fullTask.id
    } catch (error) {
      this.logger.error(`Failed to enqueue task for agent ${task.agentId}`, error as Error, { task })
      throw error
    }
  }

  async dequeueTask(agentId: string): Promise<Task | null> {
    try {
      const queue = this.queues.get(agentId)
      if (!queue || queue.length === 0) {
        return null
      }

      const taskEntry = queue.shift()!
      const task = taskEntry.task
      
      this.logger.debug(`Task dequeued for agent ${agentId}`, {
        taskId: task.id,
        agentId
      })

      return task
    } catch (error) {
      this.logger.error(`Failed to dequeue task for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      // Check active tasks
      for (const execution of this.activeTasks.values()) {
        if (execution.task.id === taskId) {
          return execution.task
        }
      }

      // Check queues
      for (const queue of this.queues.values()) {
        const taskEntry = queue.find(t => t.task.id === taskId)
        if (taskEntry) {
          return taskEntry.task
        }
      }

      // Check completed tasks
      for (const tasks of this.completedTasks.values()) {
        const execution = tasks.find(e => e.task.id === taskId)
        if (execution) {
          return execution.task
        }
      }

      return null
    } catch (error) {
      this.logger.error(`Failed to get task ${taskId}`, error as Error, { taskId })
      throw error
    }
  }

  async getQueue(agentId: string): Promise<Task[]> {
    try {
      const queue = this.queues.get(agentId) || []
      return queue.map(entry => entry.task)
    } catch (error) {
      this.logger.error(`Failed to get queue for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async getActiveTasks(agentId?: string): Promise<TaskExecution[]> {
    try {
      const executions: TaskExecution[] = []

      for (const execution of this.activeTasks.values()) {
        if (!agentId || execution.task.agentId === agentId) {
          executions.push(execution)
        }
      }

      return executions
    } catch (error) {
      this.logger.error('Failed to get active tasks', error as Error, { agentId })
      throw error
    }
  }

  async getCompletedTasks(agentId?: string, limit?: number): Promise<TaskExecution[]> {
    try {
      let executions: TaskExecution[] = []

      if (agentId) {
        executions = this.completedTasks.get(agentId) || []
      } else {
        for (const tasks of this.completedTasks.values()) {
          executions.push(...tasks)
        }
      }

      // Sort by completion time (newest first)
      executions.sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())

      // Apply limit
      if (limit && limit > 0) {
        executions = executions.slice(0, limit)
      }

      return executions
    } catch (error) {
      this.logger.error('Failed to get completed tasks', error as Error, { agentId })
      throw error
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    try {
      this.logger.info(`Canceling task ${taskId}`, { taskId })

      // Check if task is in queue
      for (const [agentId, queue] of this.queues.entries()) {
        const index = queue.findIndex(t => t.task.id === taskId)
        if (index !== -1) {
          const taskEntry = queue.splice(index, 1)[0]
          
          this.logger.info(`Task canceled successfully`, { taskId, agentId })
          
          // Emit event
          this.emit('taskCanceled', { task: taskEntry.task })
          
          return true
        }
      }

      // Check if task is active
      for (const [executionId, execution] of this.activeTasks.entries()) {
        if (execution.task.id === taskId) {
          // Cancel timeout
          const timeout = this.taskTimeouts.get(executionId)
          if (timeout) {
            clearTimeout(timeout)
            this.taskTimeouts.delete(executionId)
          }

          // Remove from active tasks
          this.activeTasks.delete(executionId)

          this.logger.info(`Active task canceled successfully`, { taskId, executionId })
          
          // Emit event
          this.emit('taskCanceled', { task: execution.task })
          
          return true
        }
      }

      this.logger.warn(`Task not found for cancellation`, { taskId })
      return false
    } catch (error) {
      this.logger.error(`Failed to cancel task ${taskId}`, error as Error, { taskId })
      return false
    }
  }

  async setTaskPriority(taskType: string, priority: number): Promise<void> {
    try {
      this.logger.info(`Setting priority for task type ${taskType}`, { taskType, priority })

      this.taskPriorities.set(taskType, priority)

      // Re-sort all queues
      for (const queue of this.queues.values()) {
        queue.sort((a, b) => {
          const priorityA = this.taskPriorities.get(a.task.type) || 0
          const priorityB = this.taskPriorities.get(b.task.type) || 0
          return priorityB - priorityA
        })
      }

      this.logger.info(`Priority set successfully for task type ${taskType}`, { taskType, priority })
    } catch (error) {
      this.logger.error(`Failed to set priority for task type ${taskType}`, error as Error, { taskType, priority })
      throw error
    }
  }

  async getTaskStats(agentId?: string): Promise<TaskStats> {
    try {
      let totalQueued = 0
      let totalActive = 0
      let totalCompleted = 0
      let tasksByType: Record<string, number> = {}
      let tasksByAgent: Record<string, number> = {}

      if (agentId) {
        // Get stats for specific agent
        totalQueued = this.queues.get(agentId)?.length || 0
        totalActive = Array.from(this.activeTasks.values()).filter(e => e.task.agentId === agentId).length
        totalCompleted = this.completedTasks.get(agentId)?.length || 0
        tasksByAgent[agentId] = totalQueued + totalActive + totalCompleted
      } else {
        // Get stats for all agents
        for (const queue of this.queues.values()) {
          totalQueued += queue.length
          
          for (const taskEntry of queue) {
            tasksByType[taskEntry.task.type] = (tasksByType[taskEntry.task.type] || 0) + 1
            tasksByAgent[taskEntry.task.agentId] = (tasksByAgent[taskEntry.task.agentId] || 0) + 1
          }
        }
        
        for (const execution of this.activeTasks.values()) {
          totalActive++
          tasksByType[execution.task.type] = (tasksByType[execution.task.type] || 0) + 1
          tasksByAgent[execution.task.agentId] = (tasksByAgent[execution.task.agentId] || 0) + 1
        }
        
        for (const tasks of this.completedTasks.values()) {
          totalCompleted += tasks.length
          
          for (const execution of tasks) {
            tasksByType[execution.task.type] = (tasksByType[execution.task.type] || 0) + 1
            tasksByAgent[execution.task.agentId] = (tasksByAgent[execution.task.agentId] || 0) + 1
          }
        }
      }

      return {
        totalQueued,
        totalActive,
        totalCompleted,
        tasksByType,
        tasksByAgent
      }
    } catch (error) {
      this.logger.error('Failed to get task stats', error as Error, { agentId })
      throw error
    }
  }

  async configure(config: TaskQueueConfig): Promise<void> {
    try {
      this.logger.info('Configuring task queue', { config })

      if (config.maxQueueSize !== undefined) {
        this.maxQueueSize = config.maxQueueSize
      }

      if (config.maxCompletedTasks !== undefined) {
        this.maxCompletedTasks = config.maxCompletedTasks
      }

      if (config.defaultTimeout !== undefined) {
        this.defaultTimeout = config.defaultTimeout
      }

      if (config.processingInterval !== undefined) {
        this.processingInterval = config.processingInterval
        
        // Restart processing timer
        if (this.processingTimer) {
          clearInterval(this.processingTimer)
        }
        this.startProcessing()
      }

      this.logger.info('Task queue configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure task queue', error as Error, { config })
      throw error
    }
  }

  private startProcessing(): void {
    this.processingTimer = setInterval(async () => {
      await this.processQueues()
    }, this.processingInterval)
  }

  private async processQueues(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      // Process each agent's queue
      for (const [agentId, queue] of this.queues.entries()) {
        if (queue.length === 0) {
          continue
        }

        // Get agent
        const agent = this.agentRegistry.getAgent(agentId)
        if (!agent) {
          this.logger.warn(`Agent not found for queue processing`, { agentId })
          continue
        }

        // Check if agent can handle more tasks
        const activeTasks = Array.from(this.activeTasks.values()).filter(e => e.task.agentId === agentId)
        if (activeTasks.length >= 1) {
          continue
        }

        // Dequeue task
        const task = await this.dequeueTask(agentId)
        if (!task) {
          continue
        }

        // Execute task
        await this.executeTask(task, agent)
      }
    } catch (error) {
      this.logger.error('Failed to process queues', error as Error)
    } finally {
      this.isProcessing = false
    }
  }

  private async executeTask(task: Task, agent: any): Promise<void> {
    try {
      const executionId = uuidv4()
      const startTime = new Date()

      // Create execution record
      const execution: TaskExecution = {
        id: executionId,
        task,
        agentId: agent.id,
        startTime,
        status: 'RUNNING',
        progress: 0
      }

      // Add to active tasks
      this.activeTasks.set(executionId, execution)

      this.logger.info(`Executing task for agent ${agent.id}`, {
        taskId: task.id,
        executionId,
        taskType: task.type
      })

      // Record metric
      await this.monitoringService.recordMetric(agent.id, {
        id: uuidv4(),
        agentId: agent.id,
        type: 'TASK' as any,
        name: 'tasks_started',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: task.id, executionId }
      })

      // Set timeout
      const timeout = setTimeout(async () => {
        await this.handleTaskTimeout(executionId)
      }, task.timeout || this.defaultTimeout)

      this.taskTimeouts.set(executionId, timeout)

      // Emit event
      this.emit('taskStarted', { execution })

      try {
        // Execute task
        const result = await agent.executeTask(task)

        // Clear timeout
        clearTimeout(timeout)
        this.taskTimeouts.delete(executionId)

        // Update execution
        execution.status = 'COMPLETED'
        execution.completedAt = new Date()
        execution.result = result
        execution.progress = 100

        // Remove from active tasks
        this.activeTasks.delete(executionId)

        // Add to completed tasks
        if (!this.completedTasks.has(agent.id)) {
          this.completedTasks.set(agent.id, [])
        }
        
        const completedTasks = this.completedTasks.get(agent.id)!
        completedTasks.push(execution)

        // Keep only recent completed tasks
        if (completedTasks.length > this.maxCompletedTasks) {
          completedTasks.splice(0, completedTasks.length - this.maxCompletedTasks)
        }

        this.logger.info(`Task completed successfully for agent ${agent.id}`, {
          taskId: task.id,
          executionId,
          duration: execution.completedAt.getTime() - execution.startTime.getTime()
        })

        // Record metric
        await this.monitoringService.recordMetric(agent.id, {
          id: uuidv4(),
          agentId: agent.id,
          type: 'TASK' as any,
          name: 'tasks_completed',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { taskId: task.id, executionId, duration: execution.completedAt.getTime() - execution.startTime.getTime() }
        })

        // Emit event
        this.emit('taskCompleted', { execution, result })
      } catch (error) {
        // Clear timeout
        clearTimeout(timeout)
        this.taskTimeouts.delete(executionId)

        // Handle error
        await this.handleTaskError(executionId, error as Error)
      }
    } catch (error) {
      this.logger.error(`Failed to execute task for agent ${agent.id}`, error as Error, { task })
      throw error
    }
  }

  private async handleTaskTimeout(executionId: string): Promise<void> {
    try {
      const execution = this.activeTasks.get(executionId)
      if (!execution) {
        return
      }

      this.logger.warn(`Task timeout for agent ${execution.agentId}`, {
        taskId: execution.task.id,
        executionId
      })

      // Update execution
      execution.status = 'TIMEOUT'
      execution.completedAt = new Date()
      execution.error = 'Task timeout'

      // Remove from active tasks
      this.activeTasks.delete(executionId)

      // Add to completed tasks
      if (!this.completedTasks.has(execution.agentId)) {
        this.completedTasks.set(execution.agentId, [])
      }
      
      const completedTasks = this.completedTasks.get(execution.agentId)!
      completedTasks.push(execution)

      // Record metric
      await this.monitoringService.recordMetric(execution.agentId, {
        id: uuidv4(),
        agentId: execution.agentId,
        type: 'TASK' as any,
        name: 'tasks_timeout',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: execution.task.id, executionId }
      })

      // Emit event
      this.emit('taskTimeout', { execution })

      // Handle error
      await this.errorHandler.handleError(new Error('Task timeout'), {
        agentId: execution.agentId,
        component: 'task_queue',
        operation: 'execute_task',
        metadata: { taskId: execution.task.id, executionId }
      })
    } catch (error) {
      this.logger.error(`Failed to handle task timeout for execution ${executionId}`, error as Error, { executionId })
    }
  }

  private async handleTaskError(executionId: string, error: Error): Promise<void> {
    try {
      const execution = this.activeTasks.get(executionId)
      if (!execution) {
        return
      }

      this.logger.error(`Task error for agent ${execution.agentId}`, error, {
        taskId: execution.task.id,
        executionId
      })

      // Update execution
      execution.status = 'FAILED'
      execution.completedAt = new Date()
      execution.error = error.message

      // Remove from active tasks
      this.activeTasks.delete(executionId)

      // Add to completed tasks
      if (!this.completedTasks.has(execution.agentId)) {
        this.completedTasks.set(execution.agentId, [])
      }
      
      const completedTasks = this.completedTasks.get(execution.agentId)!
      completedTasks.push(execution)

      // Record metric
      await this.monitoringService.recordMetric(execution.agentId, {
        id: uuidv4(),
        agentId: execution.agentId,
        type: 'TASK' as any,
        name: 'tasks_failed',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { taskId: execution.task.id, executionId, error: error.message }
      })

      // Emit event
      this.emit('taskFailed', { execution, error })

      // Handle error
      await this.errorHandler.handleError(error, {
        agentId: execution.agentId,
        component: 'task_queue',
        operation: 'execute_task',
        metadata: { taskId: execution.task.id, executionId }
      })
    } catch (handlingError) {
      this.logger.error(`Failed to handle task error for execution ${executionId}`, handlingError as Error, { executionId })
    }
  }

  // Cleanup
  destroy(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = null
    }

    // Clear all timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.taskTimeouts.clear()
  }

  // Utility methods
  getQueueCount(agentId?: string): number {
    if (agentId) {
      return this.queues.get(agentId)?.length || 0
    }
    
    let count = 0
    for (const queue of this.queues.values()) {
      count += queue.length
    }
    return count
  }

  getActiveTaskCount(agentId?: string): number {
    let count = 0
    for (const execution of this.activeTasks.values()) {
      if (!agentId || execution.task.agentId === agentId) {
        count++
      }
    }
    return count
  }

  getCompletedTaskCount(agentId?: string): number {
    if (agentId) {
      return this.completedTasks.get(agentId)?.length || 0
    }
    
    let count = 0
    for (const tasks of this.completedTasks.values()) {
      count += tasks.length
    }
    return count
  }
}

interface Task {
  id: string
  agentId: string
  type: string
  data: any
  priority?: number
  timeout?: number
  metadata?: any
  createdAt: Date
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELED'
}

interface TaskExecution {
  id: string
  task: Task
  agentId: string
  startTime: Date
  completedAt?: Date
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT'
  progress: number
  result?: any
  error?: string
}

interface TaskQueueEntry {
  task: Task
  enqueuedAt: Date
}

interface TaskStats {
  totalQueued: number
  totalActive: number
  totalCompleted: number
  tasksByType: Record<string, number>
  tasksByAgent: Record<string, number>
}

interface TaskQueueConfig {
  maxQueueSize?: number
  maxCompletedTasks?: number
  defaultTimeout?: number
  processingInterval?: number
}