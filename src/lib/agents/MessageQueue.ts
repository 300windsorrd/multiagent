import { AgentMessage, MessageType, MessagePriority } from './types'

export interface QueuedMessage extends AgentMessage {
  queueId: string
  enqueuedAt: Date
  attempts: number
  maxAttempts: number
  delayUntil?: Date
}

export class MessageQueue {
  private queues: Map<string, QueuedMessage[]> = new Map()
  private processing: Set<string> = new Set()
  private isRunning: boolean = false
  private intervalId?: NodeJS.Timeout

  constructor() {
    this.queues.set('high', [])
    this.queues.set('normal', [])
    this.queues.set('low', [])
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.intervalId = setInterval(() => this.processQueue(), 100) // Process every 100ms
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  public async enqueue(message: AgentMessage, priority: MessagePriority = MessagePriority.NORMAL): Promise<string> {
    const queueId = this.generateQueueId()
    const queuedMessage: QueuedMessage = {
      ...message,
      queueId,
      enqueuedAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      delayUntil: undefined
    }

    const queueName = this.getQueueName(priority)
    const queue = this.queues.get(queueName)!
    queue.push(queuedMessage)

    return queueId
  }

  public async dequeue(): Promise<QueuedMessage | null> {
    if (!this.isRunning) {
      return null
    }

    // Check queues in priority order
    for (const queueName of ['high', 'normal', 'low']) {
      const queue = this.queues.get(queueName)!
      if (queue.length > 0) {
        const message = queue.shift()!
        
        // Check if message is ready for processing
        if (message.delayUntil && message.delayUntil > new Date()) {
          // Put it back in the queue
          queue.unshift(message)
          continue
        }

        this.processing.add(message.queueId)
        return message
      }
    }

    return null
  }

  public async complete(queueId: string): Promise<void> {
    this.processing.delete(queueId)
  }

  public async retry(queueId: string, delayMs: number = 1000): Promise<void> {
    const message = this.findMessage(queueId)
    if (!message) {
      return
    }

    message.attempts++
    message.delayUntil = new Date(Date.now() + delayMs)
    this.processing.delete(queueId)

    // Re-enqueue with same priority
    const queueName = this.getQueueName(message.priority)
    const queue = this.queues.get(queueName)!
    queue.push(message)
  }

  public async fail(queueId: string): Promise<void> {
    this.processing.delete(queueId)
    // Remove from all queues
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(msg => msg.queueId === queueId)
      if (index !== -1) {
        queue.splice(index, 1)
      }
    }
  }

  public async getQueueStatus(): Promise<{
    total: number
    processing: number
    byPriority: Record<string, number>
  }> {
    const byPriority: Record<string, number> = {}
    let total = 0

    for (const [name, queue] of this.queues) {
      byPriority[name] = queue.length
      total += queue.length
    }

    return {
      total,
      processing: this.processing.size,
      byPriority
    }
  }

  public async getMessage(queueId: string): Promise<QueuedMessage | null> {
    return this.findMessage(queueId)
  }

  public async clear(): Promise<void> {
    for (const queue of this.queues.values()) {
      queue.length = 0
    }
    this.processing.clear()
  }

  private async processQueue(): Promise<void> {
    // This method is called periodically to process delayed messages
    // Actual dequeuing is done by the dequeue() method
  }

  private findMessage(queueId: string): QueuedMessage | null {
    for (const queue of this.queues.values()) {
      const message = queue.find(msg => msg.queueId === queueId)
      if (message) {
        return message
      }
    }
    return null
  }

  private getQueueName(priority: MessagePriority): string {
    switch (priority) {
      case MessagePriority.HIGH:
      case MessagePriority.URGENT:
        return 'high'
      case MessagePriority.NORMAL:
        return 'normal'
      case MessagePriority.LOW:
        return 'low'
      default:
        return 'normal'
    }
  }

  private generateQueueId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}