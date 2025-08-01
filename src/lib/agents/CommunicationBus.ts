import {
  ILogger,
  IMonitoringService,
  IErrorHandler,
  IAgentRegistry
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface ICommunicationBus {
  sendMessage(message: any): Promise<string>
  broadcastMessage(message: any, excludeAgentId?: string): Promise<string[]>
  subscribe(agentId: string, messageType: string, handler: any): Promise<void>
  unsubscribe(agentId: string, messageType: string, handler?: any): Promise<void>
  addMessageFilter(agentId: string, filter: any): Promise<void>
  removeMessageFilter(agentId: string, filterId: string): Promise<void>
  getMessageHistory(agentId?: string, messageType?: string, limit?: number): Promise<any[]>
  getCommunicationStats(agentId?: string): Promise<any>
  createTopic(topicName: string): Promise<void>
  subscribeToTopic(topicName: string, agentId: string, handler: any): Promise<void>
  unsubscribeFromTopic(topicName: string, agentId: string): Promise<void>
  publishToTopic(topicName: string, message: any): Promise<string[]>
}

export class CommunicationBus extends EventEmitter implements ICommunicationBus {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private agentRegistry: IAgentRegistry
  private messageHandlers: Map<string, MessageHandler[]> = new Map()
  private messageHistory: Map<string, MessageHistoryEntry[]> = new Map()
  private subscriptions: Map<string, Subscription[]> = new Map()
  private messageFilters: Map<string, MessageFilter[]> = new Map()
  private maxHistorySize: number = 1000
  private messageTimeout: number = 30000 // 30 seconds

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
  }

  async sendMessage(message: Omit<IMessage, 'id' | 'timestamp'>): Promise<string> {
    try {
      this.logger.info(`Sending message from ${message.fromAgentId} to ${message.toAgentId}`, { message })

      // Create full message object
      const fullMessage: IMessage = {
        ...message,
        id: uuidv4(),
        timestamp: new Date()
      }

      // Add to history
      await this.addToHistory(fullMessage)

      // Process message
      await this.processMessage(fullMessage)

      this.logger.info(`Message sent successfully from ${message.fromAgentId} to ${message.toAgentId}`, {
        messageId: fullMessage.id,
        fromAgentId: message.fromAgentId,
        toAgentId: message.toAgentId,
        messageType: message.type
      })

      // Record metric
      await this.monitoringService.recordMetric(message.fromAgentId, {
        id: uuidv4(),
        agentId: message.fromAgentId,
        type: 'COMMUNICATION' as any,
        name: 'messages_sent',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { toAgentId: message.toAgentId, messageType: message.type }
      })

      // Emit event
      this.emit('messageSent', { message: fullMessage })

      return fullMessage.id
    } catch (error) {
      this.logger.error(`Failed to send message from ${message.fromAgentId} to ${message.toAgentId}`, error as Error, { message })
      throw error
    }
  }

  async broadcastMessage(message: Omit<IMessage, 'id' | 'timestamp' | 'toAgentId'>, excludeAgentId?: string): Promise<string[]> {
    try {
      this.logger.info(`Broadcasting message from ${message.fromAgentId}`, { message })

      const messageIds: string[] = []
      const agents = this.agentRegistry.getAllAgents()

      for (const [agentId, agent] of agents) {
        if (agentId === excludeAgentId) continue

        try {
          const messageId = await this.sendMessage({
            ...message,
            toAgentId: agentId
          })
          messageIds.push(messageId)
        } catch (error) {
          this.logger.error(`Failed to send broadcast message to agent ${agentId}`, error as Error, { agentId })
        }
      }

      this.logger.info(`Broadcast message sent from ${message.fromAgentId} to ${messageIds.length} agents`, {
        fromAgentId: message.fromAgentId,
        recipientCount: messageIds.length,
        messageType: message.type
      })

      return messageIds
    } catch (error) {
      this.logger.error(`Failed to broadcast message from ${message.fromAgentId}`, error as Error, { message })
      throw error
    }
  }

  async subscribe(agentId: string, messageType: string, handler: MessageHandler): Promise<void> {
    try {
      this.logger.info(`Agent ${agentId} subscribing to message type ${messageType}`, { agentId, messageType })

      const key = `${agentId}:${messageType}`
      if (!this.messageHandlers.has(key)) {
        this.messageHandlers.set(key, [])
      }

      const handlers = this.messageHandlers.get(key)!
      handlers.push(handler)

      this.logger.info(`Agent ${agentId} subscribed successfully to message type ${messageType}`, { agentId, messageType })
    } catch (error) {
      this.logger.error(`Failed to subscribe agent ${agentId} to message type ${messageType}`, error as Error, { agentId, messageType })
      throw error
    }
  }

  async unsubscribe(agentId: string, messageType: string, handler?: MessageHandler): Promise<void> {
    try {
      this.logger.info(`Agent ${agentId} unsubscribing from message type ${messageType}`, { agentId, messageType })

      const key = `${agentId}:${messageType}`
      const handlers = this.messageHandlers.get(key)

      if (handlers) {
        if (handler) {
          // Remove specific handler
          const index = handlers.indexOf(handler)
          if (index !== -1) {
            handlers.splice(index, 1)
          }
        } else {
          // Remove all handlers for this message type
          this.messageHandlers.delete(key)
        }

        this.logger.info(`Agent ${agentId} unsubscribed successfully from message type ${messageType}`, { agentId, messageType })
      } else {
        this.logger.warn(`No subscription found for agent ${agentId} to message type ${messageType}`, { agentId, messageType })
      }
    } catch (error) {
      this.logger.error(`Failed to unsubscribe agent ${agentId} from message type ${messageType}`, error as Error, { agentId, messageType })
      throw error
    }
  }

  async addMessageFilter(agentId: string, filter: MessageFilter): Promise<void> {
    try {
      this.logger.info(`Adding message filter for agent ${agentId}`, { agentId, filter })

      if (!this.messageFilters.has(agentId)) {
        this.messageFilters.set(agentId, [])
      }

      const filters = this.messageFilters.get(agentId)!
      filters.push(filter)

      this.logger.info(`Message filter added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add message filter for agent ${agentId}`, error as Error, { agentId, filter })
      throw error
    }
  }

  async removeMessageFilter(agentId: string, filterId: string): Promise<void> {
    try {
      this.logger.info(`Removing message filter for agent ${agentId}`, { agentId, filterId })

      const filters = this.messageFilters.get(agentId)
      if (filters) {
        const index = filters.findIndex(f => f.id === filterId)
        if (index !== -1) {
          filters.splice(index, 1)
          this.logger.info(`Message filter removed successfully for agent ${agentId}`, { agentId, filterId })
        } else {
          this.logger.warn(`Message filter not found for agent ${agentId}`, { agentId, filterId })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove message filter for agent ${agentId}`, error as Error, { agentId, filterId })
      throw error
    }
  }

  async getMessageHistory(agentId?: string, messageType?: string, limit?: number): Promise<IMessage[]> {
    try {
      let messages: IMessage[] = []

      if (agentId) {
        // Get history for specific agent
        const history = this.messageHistory.get(agentId)
        if (history) {
          messages = history.map(entry => entry.message)
        }
      } else {
        // Get history for all agents
        for (const history of this.messageHistory.values()) {
          messages.push(...history.map(entry => entry.message))
        }
      }

      // Filter by message type if specified
      if (messageType) {
        messages = messages.filter(msg => msg.type === messageType)
      }

      // Sort by timestamp (newest first)
      messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      // Apply limit
      if (limit && limit > 0) {
        messages = messages.slice(0, limit)
      }

      return messages
    } catch (error) {
      this.logger.error('Failed to get message history', error as Error, { agentId, messageType, limit })
      throw error
    }
  }

  async getCommunicationStats(agentId?: string): Promise<CommunicationStats> {
    try {
      let totalMessages = 0
      let messagesByType: Record<string, number> = {}
      let messagesByAgent: Record<string, number> = {}

      if (agentId) {
        // Get stats for specific agent
        const history = this.messageHistory.get(agentId)
        if (history) {
          totalMessages = history.length
          
          for (const entry of history) {
            const message = entry.message
            
            // Count by type
            messagesByType[message.type] = (messagesByType[message.type] || 0) + 1
            
            // Count by agent (from and to)
            messagesByAgent[message.fromAgentId] = (messagesByAgent[message.fromAgentId] || 0) + 1
            messagesByAgent[message.toAgentId] = (messagesByAgent[message.toAgentId] || 0) + 1
          }
        }
      } else {
        // Get stats for all agents
        for (const history of this.messageHistory.values()) {
          totalMessages += history.length
          
          for (const entry of history) {
            const message = entry.message
            
            // Count by type
            messagesByType[message.type] = (messagesByType[message.type] || 0) + 1
            
            // Count by agent (from and to)
            messagesByAgent[message.fromAgentId] = (messagesByAgent[message.fromAgentId] || 0) + 1
            messagesByAgent[message.toAgentId] = (messagesByAgent[message.toAgentId] || 0) + 1
          }
        }
      }

      return {
        totalMessages,
        messagesByType,
        messagesByAgent
      }
    } catch (error) {
      this.logger.error('Failed to get communication stats', error as Error, { agentId })
      throw error
    }
  }

  async createTopic(topicName: string): Promise<void> {
    try {
      this.logger.info(`Creating topic ${topicName}`, { topicName })

      if (this.subscriptions.has(topicName)) {
        this.logger.warn(`Topic ${topicName} already exists`, { topicName })
        return
      }

      this.subscriptions.set(topicName, [])

      this.logger.info(`Topic ${topicName} created successfully`, { topicName })
    } catch (error) {
      this.logger.error(`Failed to create topic ${topicName}`, error as Error, { topicName })
      throw error
    }
  }

  async subscribeToTopic(topicName: string, agentId: string, handler: MessageHandler): Promise<void> {
    try {
      this.logger.info(`Agent ${agentId} subscribing to topic ${topicName}`, { agentId, topicName })

      if (!this.subscriptions.has(topicName)) {
        await this.createTopic(topicName)
      }

      const subscriptions = this.subscriptions.get(topicName)!
      
      const subscription: Subscription = {
        id: uuidv4(),
        topicName,
        agentId,
        handler,
        subscribedAt: new Date()
      }
      
      subscriptions.push(subscription)

      this.logger.info(`Agent ${agentId} subscribed successfully to topic ${topicName}`, { agentId, topicName })
    } catch (error) {
      this.logger.error(`Failed to subscribe agent ${agentId} to topic ${topicName}`, error as Error, { agentId, topicName })
      throw error
    }
  }

  async unsubscribeFromTopic(topicName: string, agentId: string): Promise<void> {
    try {
      this.logger.info(`Agent ${agentId} unsubscribing from topic ${topicName}`, { agentId, topicName })

      const subscriptions = this.subscriptions.get(topicName)
      if (subscriptions) {
        const index = subscriptions.findIndex(sub => sub.agentId === agentId)
        if (index !== -1) {
          subscriptions.splice(index, 1)
          this.logger.info(`Agent ${agentId} unsubscribed successfully from topic ${topicName}`, { agentId, topicName })
        } else {
          this.logger.warn(`No subscription found for agent ${agentId} to topic ${topicName}`, { agentId, topicName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to unsubscribe agent ${agentId} from topic ${topicName}`, error as Error, { agentId, topicName })
      throw error
    }
  }

  async publishToTopic(topicName: string, message: Omit<IMessage, 'id' | 'timestamp' | 'toAgentId'>): Promise<string[]> {
    try {
      this.logger.info(`Publishing message to topic ${topicName}`, { topicName, message })

      const subscriptions = this.subscriptions.get(topicName)
      if (!subscriptions || subscriptions.length === 0) {
        this.logger.warn(`No subscriptions found for topic ${topicName}`, { topicName })
        return []
      }

      const messageIds: string[] = []

      for (const subscription of subscriptions) {
        try {
          const messageId = await this.sendMessage({
            ...message,
            toAgentId: subscription.agentId
          })
          messageIds.push(messageId)
        } catch (error) {
          this.logger.error(`Failed to publish message to agent ${subscription.agentId}`, error as Error, { agentId: subscription.agentId })
        }
      }

      this.logger.info(`Message published to topic ${topicName} for ${messageIds.length} agents`, {
        topicName,
        recipientCount: messageIds.length,
        messageType: message.type
      })

      return messageIds
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topicName}`, error as Error, { topicName, message })
      throw error
    }
  }

  private async processMessage(message: IMessage): Promise<void> {
    try {
      // Check if message should be filtered
      if (await this.shouldFilterMessage(message)) {
        this.logger.debug(`Message filtered for agent ${message.toAgentId}`, { messageId: message.id })
        return
      }

      // Get handlers for this message type and agent
      const key = `${message.toAgentId}:${message.type}`
      const handlers = this.messageHandlers.get(key)

      if (handlers && handlers.length > 0) {
        // Get the target agent
        const agent = this.agentRegistry.getAgent(message.toAgentId)
        if (!agent) {
          this.logger.warn(`Target agent ${message.toAgentId} not found`, { messageId: message.id })
          return
        }

        // Execute all handlers
        for (const handler of handlers) {
          try {
            await handler(message, agent)
          } catch (error) {
            this.logger.error(`Message handler failed for message ${message.id}`, error as Error, { messageId: message.id })
            
            // Record error
            await this.monitoringService.recordMetric(message.fromAgentId, {
              id: uuidv4(),
              agentId: message.fromAgentId,
              type: 'COMMUNICATION' as any,
              name: 'message_handler_errors',
              value: 1,
              unit: 'count',
              timestamp: new Date(),
              metadata: { messageId: message.id, toAgentId: message.toAgentId }
            })
          }
        }
      } else {
        this.logger.debug(`No handlers found for message type ${message.type} for agent ${message.toAgentId}`, {
          messageId: message.id,
          messageType: message.type,
          toAgentId: message.toAgentId
        })
      }

      // Record metric
      await this.monitoringService.recordMetric(message.toAgentId, {
        id: uuidv4(),
        agentId: message.toAgentId,
        type: 'COMMUNICATION' as any,
        name: 'messages_received',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { fromAgentId: message.fromAgentId, messageType: message.type }
      })

      // Emit event
      this.emit('messageReceived', { message })
    } catch (error) {
      this.logger.error(`Failed to process message ${message.id}`, error as Error, { messageId: message.id })
      throw error
    }
  }

  private async shouldFilterMessage(message: IMessage): Promise<boolean> {
    try {
      const filters = this.messageFilters.get(message.toAgentId)
      if (!filters || filters.length === 0) {
        return false
      }

      for (const filter of filters) {
        try {
          if (await filter.filter(message)) {
            return true
          }
        } catch (error) {
          this.logger.error(`Message filter failed for agent ${message.toAgentId}`, error as Error, { 
            agentId: message.toAgentId,
            filterId: filter.id,
            messageId: message.id
          })
        }
      }

      return false
    } catch (error) {
      this.logger.error(`Failed to check message filters for agent ${message.toAgentId}`, error as Error, { 
        agentId: message.toAgentId,
        messageId: message.id
      })
      return false
    }
  }

  private async addToHistory(message: IMessage): Promise<void> {
    try {
      if (!this.messageHistory.has(message.toAgentId)) {
        this.messageHistory.set(message.toAgentId, [])
      }
      
      const history = this.messageHistory.get(message.toAgentId)!
      
      const historyEntry: MessageHistoryEntry = {
        message,
        receivedAt: new Date(),
        processed: false
      }
      
      history.push(historyEntry)
      
      // Keep only recent history
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    } catch (error) {
      this.logger.error(`Failed to add message to history for agent ${message.toAgentId}`, error as Error, { 
        agentId: message.toAgentId,
        messageId: message.id
      })
    }
  }

  // Utility methods
  getActiveTopics(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  getTopicSubscriptions(topicName: string): Subscription[] {
    return this.subscriptions.get(topicName) || []
  }

  getAgentSubscriptions(agentId: string): string[] {
    const topics: string[] = []
    
    for (const [topicName, subscriptions] of this.subscriptions.entries()) {
      if (subscriptions.some(sub => sub.agentId === agentId)) {
        topics.push(topicName)
      }
    }
    
    return topics
  }

  getMessageHandlersCount(): number {
    let count = 0
    for (const handlers of this.messageHandlers.values()) {
      count += handlers.length
    }
    return count
  }

  getMessageFiltersCount(): number {
    let count = 0
    for (const filters of this.messageFilters.values()) {
      count += filters.length
    }
    return count
  }
}

interface IMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  type: string
  data: any
  priority?: number
  timeout?: number
  timestamp: Date
  metadata?: any
}

interface MessageHandler {
  (message: IMessage, agent: any): Promise<void>
}

interface MessageFilter {
  id: string
  name: string
  filter: (message: IMessage) => Promise<boolean>
}

interface MessageHistoryEntry {
  message: IMessage
  receivedAt: Date
  processed: boolean
}

interface Subscription {
  id: string
  topicName: string
  agentId: string
  handler: MessageHandler
  subscribedAt: Date
}

interface CommunicationStats {
  totalMessages: number
  messagesByType: Record<string, number>
  messagesByAgent: Record<string, number>
}