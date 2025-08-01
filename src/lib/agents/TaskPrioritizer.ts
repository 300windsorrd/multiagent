import { ILogger, IMonitoringService, IErrorHandler } from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface ITaskPrioritizer {
  prioritizeTask(task: Task, context: PriorityContext): Promise<number>
  setPriorityRule(rule: PriorityRule): Promise<void>
  getPriorityRules(): Promise<PriorityRule[]>
  updatePriorityRule(ruleId: string, updates: Partial<PriorityRule>): Promise<boolean>
  deletePriorityRule(ruleId: string): Promise<boolean>
  configure(config: PrioritizerConfig): Promise<void>
  getTaskPriority(task: Task): Promise<number>
  reorderQueue(queue: Task[]): Promise<Task[]>
}

export interface Task {
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

export interface PriorityContext {
  agentId: string
  agentType: string
  agentStatus: string
  currentLoad: number
  systemLoad: number
  timeOfDay: Date
  userPreferences?: Record<string, any>
  businessRules?: Record<string, any>
}

export interface PriorityRule {
  id: string
  name: string
  description?: string
  condition: PriorityCondition
  action: PriorityAction
  priority: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PriorityCondition {
  taskType?: string | string[]
  agentType?: string | string[]
  agentStatus?: string | string[]
  timeRange?: {
    start: string // HH:MM format
    end: string // HH:MM format
  }
  dayOfWeek?: number[] // 0-6 (Sunday-Saturday)
  systemLoad?: {
    min?: number
    max?: number
  }
  agentLoad?: {
    min?: number
    max?: number
  }
  customCondition?: (task: Task, context: PriorityContext) => Promise<boolean>
}

export interface PriorityAction {
  priority: number
  reason?: string
  metadata?: Record<string, any>
}

export interface PrioritizerConfig {
  defaultPriority: number
  maxPriority: number
  minPriority: number
  enableDynamicPriority: boolean
  priorityDecayRate: number
  priorityBoostRate: number
}

export class TaskPrioritizer extends EventEmitter implements ITaskPrioritizer {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private priorityRules: Map<string, PriorityRule> = new Map()
  private taskPriorities: Map<string, number> = new Map()
  private taskPriorityHistory: Map<string, PriorityHistory[]> = new Map()
  private defaultPriority: number = 5
  private maxPriority: number = 10
  private minPriority: number = 1
  private enableDynamicPriority: boolean = true
  private priorityDecayRate: number = 0.1
  private priorityBoostRate: number = 0.2
  private maxHistorySize: number = 100

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

  async prioritizeTask(task: Task, context: PriorityContext): Promise<number> {
    try {
      this.logger.debug(`Prioritizing task ${task.id} for agent ${task.agentId}`, {
        taskId: task.id,
        agentId: task.agentId,
        taskType: task.type
      })

      let priority = this.defaultPriority

      // Apply priority rules
      for (const rule of this.priorityRules.values()) {
        if (!rule.isActive) {
          continue
        }

        if (await this.evaluateCondition(rule.condition, task, context)) {
          priority = rule.action.priority
          
          this.logger.debug(`Priority rule applied for task ${task.id}`, {
            taskId: task.id,
            ruleId: rule.id,
            ruleName: rule.name,
            priority
          })

          // Record metric
          await this.monitoringService.recordMetric(task.agentId, {
            id: uuidv4(),
            agentId: task.agentId,
            type: 'PRIORITIZER' as any,
            name: 'priority_rule_applied',
            value: 1,
            unit: 'count',
            timestamp: new Date(),
            metadata: { taskId: task.id, ruleId: rule.id, priority }
          })

          break
        }
      }

      // Apply dynamic priority adjustments
      if (this.enableDynamicPriority) {
        priority = await this.applyDynamicPriority(task, context, priority)
      }

      // Ensure priority is within bounds
      priority = Math.max(this.minPriority, Math.min(this.maxPriority, priority))

      // Store priority
      this.taskPriorities.set(task.id, priority)

      // Record priority history
      await this.recordPriorityHistory(task.id, priority, 'rule_based')

      this.logger.debug(`Task ${task.id} prioritized with priority ${priority}`, {
        taskId: task.id,
        agentId: task.agentId,
        priority
      })

      return priority
    } catch (error) {
      this.logger.error(`Failed to prioritize task ${task.id}`, error as Error, {
        taskId: task.id,
        agentId: task.agentId
      })
      throw error
    }
  }

  async setPriorityRule(rule: Omit<PriorityRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    try {
      this.logger.info(`Setting priority rule ${rule.name}`, { rule })

      const fullRule: PriorityRule = {
        ...rule,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.priorityRules.set(fullRule.id, fullRule)

      this.logger.info(`Priority rule set successfully`, {
        ruleId: fullRule.id,
        ruleName: rule.name
      })

      // Emit event
      this.emit('priorityRuleSet', { rule: fullRule })
    } catch (error) {
      this.logger.error(`Failed to set priority rule ${rule.name}`, error as Error, { rule })
      throw error
    }
  }

  async getPriorityRules(): Promise<PriorityRule[]> {
    try {
      return Array.from(this.priorityRules.values())
    } catch (error) {
      this.logger.error('Failed to get priority rules', error as Error)
      throw error
    }
  }

  async updatePriorityRule(ruleId: string, updates: Partial<PriorityRule>): Promise<boolean> {
    try {
      this.logger.info(`Updating priority rule ${ruleId}`, { ruleId, updates })

      const rule = this.priorityRules.get(ruleId)
      if (!rule) {
        this.logger.warn(`Priority rule not found for update`, { ruleId })
        return false
      }

      // Update rule
      Object.assign(rule, updates, { updatedAt: new Date() })

      this.logger.info(`Priority rule updated successfully`, { ruleId })

      // Emit event
      this.emit('priorityRuleUpdated', { rule })

      return true
    } catch (error) {
      this.logger.error(`Failed to update priority rule ${ruleId}`, error as Error, { ruleId, updates })
      return false
    }
  }

  async deletePriorityRule(ruleId: string): Promise<boolean> {
    try {
      this.logger.info(`Deleting priority rule ${ruleId}`, { ruleId })

      const rule = this.priorityRules.get(ruleId)
      if (!rule) {
        this.logger.warn(`Priority rule not found for deletion`, { ruleId })
        return false
      }

      this.priorityRules.delete(ruleId)

      this.logger.info(`Priority rule deleted successfully`, { ruleId })

      // Emit event
      this.emit('priorityRuleDeleted', { rule })

      return true
    } catch (error) {
      this.logger.error(`Failed to delete priority rule ${ruleId}`, error as Error, { ruleId })
      return false
    }
  }

  async configure(config: PrioritizerConfig): Promise<void> {
    try {
      this.logger.info('Configuring task prioritizer', { config })

      if (config.defaultPriority !== undefined) {
        this.defaultPriority = config.defaultPriority
      }

      if (config.maxPriority !== undefined) {
        this.maxPriority = config.maxPriority
      }

      if (config.minPriority !== undefined) {
        this.minPriority = config.minPriority
      }

      if (config.enableDynamicPriority !== undefined) {
        this.enableDynamicPriority = config.enableDynamicPriority
      }

      if (config.priorityDecayRate !== undefined) {
        this.priorityDecayRate = config.priorityDecayRate
      }

      if (config.priorityBoostRate !== undefined) {
        this.priorityBoostRate = config.priorityBoostRate
      }

      this.logger.info('Task prioritizer configured successfully', { config })
    } catch (error) {
      this.logger.error('Failed to configure task prioritizer', error as Error, { config })
      throw error
    }
  }

  async getTaskPriority(task: Task): Promise<number> {
    try {
      return this.taskPriorities.get(task.id) || this.defaultPriority
    } catch (error) {
      this.logger.error(`Failed to get task priority for task ${task.id}`, error as Error, { taskId: task.id })
      throw error
    }
  }

  async reorderQueue(queue: Task[]): Promise<Task[]> {
    try {
      this.logger.debug(`Reordering queue with ${queue.length} tasks`)

      // Create a copy of the queue to avoid modifying the original
      const reorderedQueue = [...queue]

      // Get priorities for all tasks
      const taskPriorities = await Promise.all(
        reorderedQueue.map(async (task) => ({
          task,
          priority: await this.getTaskPriority(task)
        }))
      )

      // Sort by priority (higher priority first)
      taskPriorities.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }

        // If priorities are equal, sort by creation time (older first)
        return a.task.createdAt.getTime() - b.task.createdAt.getTime()
      })

      // Extract sorted tasks
      const sortedTasks = taskPriorities.map(item => item.task)

      this.logger.debug(`Queue reordered successfully`)

      return sortedTasks
    } catch (error) {
      this.logger.error('Failed to reorder queue', error as Error)
      throw error
    }
  }

  private async evaluateCondition(condition: PriorityCondition, task: Task, context: PriorityContext): Promise<boolean> {
    try {
      // Check task type
      if (condition.taskType) {
        const taskTypes = Array.isArray(condition.taskType) ? condition.taskType : [condition.taskType]
        if (!taskTypes.includes(task.type)) {
          return false
        }
      }

      // Check agent type
      if (condition.agentType) {
        const agentTypes = Array.isArray(condition.agentType) ? condition.agentType : [condition.agentType]
        if (!agentTypes.includes(context.agentType)) {
          return false
        }
      }

      // Check agent status
      if (condition.agentStatus) {
        const agentStatuses = Array.isArray(condition.agentStatus) ? condition.agentStatus : [condition.agentStatus]
        if (!agentStatuses.includes(context.agentStatus)) {
          return false
        }
      }

      // Check time range
      if (condition.timeRange) {
        const currentTime = context.timeOfDay
        const currentHours = currentTime.getHours()
        const currentMinutes = currentTime.getMinutes()
        const currentTimeMinutes = currentHours * 60 + currentMinutes

        const [startHours, startMinutes] = condition.timeRange.start.split(':').map(Number)
        const [endHours, endMinutes] = condition.timeRange.end.split(':').map(Number)
        const startTimeMinutes = startHours * 60 + startMinutes
        const endTimeMinutes = endHours * 60 + endMinutes

        if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes > endTimeMinutes) {
          return false
        }
      }

      // Check day of week
      if (condition.dayOfWeek) {
        const currentDayOfWeek = context.timeOfDay.getDay()
        if (!condition.dayOfWeek.includes(currentDayOfWeek)) {
          return false
        }
      }

      // Check system load
      if (condition.systemLoad) {
        if (condition.systemLoad.min !== undefined && context.systemLoad < condition.systemLoad.min) {
          return false
        }
        if (condition.systemLoad.max !== undefined && context.systemLoad > condition.systemLoad.max) {
          return false
        }
      }

      // Check agent load
      if (condition.agentLoad) {
        if (condition.agentLoad.min !== undefined && context.currentLoad < condition.agentLoad.min) {
          return false
        }
        if (condition.agentLoad.max !== undefined && context.currentLoad > condition.agentLoad.max) {
          return false
        }
      }

      // Check custom condition
      if (condition.customCondition) {
        return await condition.customCondition(task, context)
      }

      return true
    } catch (error) {
      this.logger.error('Failed to evaluate priority condition', error as Error)
      return false
    }
  }

  private async applyDynamicPriority(task: Task, context: PriorityContext, basePriority: number): Promise<number> {
    try {
      let dynamicPriority = basePriority

      // Adjust based on agent load
      if (context.currentLoad > 0.8) {
        dynamicPriority -= this.priorityDecayRate
      } else if (context.currentLoad < 0.3) {
        dynamicPriority += this.priorityBoostRate
      }

      // Adjust based on system load
      if (context.systemLoad > 0.8) {
        dynamicPriority -= this.priorityDecayRate
      } else if (context.systemLoad < 0.3) {
        dynamicPriority += this.priorityBoostRate
      }

      // Adjust based on task age
      const taskAge = Date.now() - task.createdAt.getTime()
      const ageInMinutes = taskAge / (1000 * 60)
      if (ageInMinutes > 30) {
        dynamicPriority += this.priorityBoostRate * Math.floor(ageInMinutes / 30)
      }

      // Apply user preferences
      if (context.userPreferences && context.userPreferences.priorityAdjustments) {
        const adjustment = context.userPreferences.priorityAdjustments[task.type]
        if (adjustment !== undefined) {
          dynamicPriority += adjustment
        }
      }

      return dynamicPriority
    } catch (error) {
      this.logger.error('Failed to apply dynamic priority', error as Error)
      return basePriority
    }
  }

  private async recordPriorityHistory(taskId: string, priority: number, reason: string): Promise<void> {
    try {
      const history = this.taskPriorityHistory.get(taskId) || []
      
      const historyEntry: PriorityHistory = {
        taskId,
        priority,
        reason,
        timestamp: new Date()
      }

      history.push(historyEntry)

      // Keep only recent history
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }

      this.taskPriorityHistory.set(taskId, history)
    } catch (error) {
      this.logger.error(`Failed to record priority history for task ${taskId}`, error as Error, { taskId })
    }
  }
}

interface PriorityHistory {
  taskId: string
  priority: number
  reason: string
  timestamp: Date
}