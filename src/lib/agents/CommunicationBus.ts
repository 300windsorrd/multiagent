import { EventEmitter } from 'events'
import { MessageBroker } from './MessageBroker'
import { MessageQueue } from './MessageQueue'
import { BaseAgent } from './BaseAgent'
import { AgentMessage, MessagePriority, MessageType } from './types'

export class CommunicationBus extends EventEmitter {
  private messageBroker: MessageBroker
  private messageQueue: MessageQueue
  private agents: Map<string, BaseAgent> = new Map()
  private subscriptions: Map<string, Set<string>> = new Map() // topic -> agentIds
  private isRunning: boolean = false

  constructor() {
    super()
    this.messageBroker = new MessageBroker()
    this.messageQueue = new MessageQueue()
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.messageBroker.on('message', this.handleBrokerMessage.bind(this))
    this.messageQueue.on('message', this.handleQueuedMessage.bind(this))
    this.messageQueue.on('error', this.handleQueueError.bind(this))
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    try {
      await this.messageBroker.start()
      await this.messageQueue.start()
      this.isRunning = true
      this.emit('started')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    try {
      await this.messageQueue.stop()
      await this.messageBroker.stop()
      this.isRunning = false
      this.emit('stopped')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  public registerAgent(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with ID ${agent.id} is already registered`)
    }

    this.agents.set(agent.id, agent)
    
    // Set up agent-specific message handler
    agent.on('message', this.handleAgentMessage.bind(this))
    
    this.emit('agentRegistered', agent)
  }

  public unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      return
    }

    // Remove agent from all subscriptions
    for (const [topic, subscribers] of this.subscriptions.entries()) {
      subscribers.delete(agentId)
      if (subscribers.size === 0) {
        this.subscriptions.delete(topic)
      }
    }

    // Remove agent from registry
    this.agents.delete(agentId)
    
    // Remove agent event listeners
    agent.removeAllListeners('message')
    
    this.emit('agentUnregistered', agentId)
  }

  public subscribe(agentId: string, topic: string): void {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is not registered`)
    }

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }

    this.subscriptions.get(topic)!.add(agentId)
    this.emit('subscribed', { agentId, topic })
  }

  public unsubscribe(agentId: string, topic: string): void {
    const subscribers = this.subscriptions.get(topic)
    if (subscribers) {
      subscribers.delete(agentId)
      if (subscribers.size === 0) {
        this.subscriptions.delete(topic)
      }
      this.emit('unsubscribed', { agentId, topic })
    }
  }

  public async sendMessage(
    fromAgentId: string,
    toAgentId: string,
    type: MessageType,
    payload: any,
    priority: MessagePriority = MessagePriority.NORMAL,
    options: {
      requireResponse?: boolean
      timeout?: number
      metadata?: Record<string, any>
    } = {}
  ): Promise<any> {
    if (!this.agents.has(fromAgentId)) {
      throw new Error(`Sender agent ${fromAgentId} is not registered`)
    }

    if (!this.agents.has(toAgentId)) {
      throw new Error(`Recipient agent ${toAgentId} is not registered`)
    }

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: fromAgentId,
      to: toAgentId,
      type,
      payload,
      priority,
      timestamp: new Date(),
      metadata: options.metadata || {},
      requireResponse: options.requireResponse || false,
      timeout: options.timeout || 30000 // 30 seconds default
    }

    try {
      if (priority === MessagePriority.HIGH) {
        // High priority messages are sent immediately
        await this.messageBroker.deliverMessage(message)
      } else {
        // Other messages are queued
        await this.messageQueue.enqueue(message)
      }

      this.emit('messageSent', message)

      if (message.requireResponse) {
        return await this.waitForResponse(message.id, message.timeout || 30000) // Default 30 seconds
      }

      return { success: true, messageId: message.id }
    } catch (error) {
      this.emit('messageError', { message, error })
      throw error
    }
  }

  public async broadcast(
    fromAgentId: string,
    topic: string,
    type: MessageType,
    payload: any,
    priority: MessagePriority = MessagePriority.NORMAL
  ): Promise<void> {
    if (!this.agents.has(fromAgentId)) {
      throw new Error(`Sender agent ${fromAgentId} is not registered`)
    }

    const subscribers = this.subscriptions.get(topic)
    if (!subscribers || subscribers.size === 0) {
      return
    }

    const promises: Promise<void>[] = []
    
    for (const toAgentId of subscribers) {
      if (toAgentId !== fromAgentId) {
        promises.push(
          this.sendMessage(fromAgentId, toAgentId, type, payload, priority)
        )
      }
    }

    await Promise.allSettled(promises)
    this.emit('broadcast', { fromAgentId, topic, type, payload })
  }

  public async publish(
    fromAgentId: string,
    topic: string,
    type: MessageType,
    payload: any
  ): Promise<void> {
    if (!this.agents.has(fromAgentId)) {
      throw new Error(`Sender agent ${fromAgentId} is not registered`)
    }

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: fromAgentId,
      to: 'broadcast',
      type,
      payload,
      priority: MessagePriority.NORMAL,
      timestamp: new Date(),
      metadata: { topic },
      requireResponse: false
    }

    await this.messageBroker.publish(topic, message)
    this.emit('published', { topic, message })
  }

  public getRegisteredAgents(): string[] {
    return Array.from(this.agents.keys())
  }

  public getSubscriptions(topic: string): string[] {
    const subscribers = this.subscriptions.get(topic)
    return subscribers ? Array.from(subscribers) : []
  }

  public getSystemStatus(): {
    isRunning: boolean
    registeredAgents: number
    activeSubscriptions: number
    queueSize: number
  } {
    return {
      isRunning: this.isRunning,
      registeredAgents: this.agents.size,
      activeSubscriptions: Array.from(this.subscriptions.values())
        .reduce((total, subs) => total + subs.size, 0),
      queueSize: this.messageQueue.getSize()
    }
  }

  private async handleBrokerMessage(message: AgentMessage): Promise<void> {
    if (message.to === 'broadcast') {
      await this.handleBroadcastMessage(message)
    } else {
      await this.handleDirectMessage(message)
    }
  }

  private async handleQueuedMessage(message: AgentMessage): Promise<void> {
    await this.handleDirectMessage(message)
  }

  private async handleDirectMessage(message: AgentMessage): Promise<void> {
    const recipient = this.agents.get(message.to)
    if (!recipient) {
      this.emit('messageError', { 
        message, 
        error: new Error(`Recipient agent ${message.to} not found`) 
      })
      return
    }

    try {
      await recipient.receiveMessage(message)
      this.emit('messageDelivered', message)
    } catch (error) {
      this.emit('messageError', { message, error })
    }
  }

  private async handleBroadcastMessage(message: AgentMessage): Promise<void> {
    const topic = message.metadata?.topic
    if (!topic) {
      return
    }

    const subscribers = this.subscriptions.get(topic)
    if (!subscribers) {
      return
    }

    const promises: Promise<void>[] = []
    
    for (const agentId of subscribers) {
      if (agentId !== message.from) {
        const recipient = this.agents.get(agentId)
        if (recipient) {
          promises.push(recipient.receiveMessage(message))
        }
      }
    }

    await Promise.allSettled(promises)
    this.emit('broadcastDelivered', { topic, message })
  }

  private handleAgentMessage(message: AgentMessage): void {
    // Handle messages sent from agents to the communication bus
    if (message.to === 'broadcast') {
      this.publish(message.from, message.metadata?.topic || 'general', message.type, message.payload)
    } else {
      this.messageQueue.enqueue(message)
    }
  }

  private handleQueueError(error: Error): void {
    this.emit('error', error)
  }

  private async waitForResponse(messageId: string, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(`response:${messageId}`, responseHandler)
        reject(new Error(`Response timeout for message ${messageId}`))
      }, timeout)

      const responseHandler = (response: any) => {
        clearTimeout(timer)
        this.removeListener(`response:${messageId}`, responseHandler)
        resolve(response)
      }

      this.once(`response:${messageId}`, responseHandler)
    })
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}