import { EventEmitter } from 'events'
import { AgentMessage, MessageType } from './types'

export class MessageBroker extends EventEmitter {
  private topics: Map<string, Set<string>> = new Map() // topic -> subscriberIds
  private isRunning: boolean = false

  constructor() {
    super()
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.emit('started')
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.emit('stopped')
  }

  public async deliverMessage(message: AgentMessage): Promise<void> {
    if (!this.isRunning) {
      throw new Error('MessageBroker is not running')
    }

    // For direct messages, emit immediately
    this.emit('message', message)
  }

  public async publish(topic: string, message: AgentMessage): Promise<void> {
    if (!this.isRunning) {
      throw new Error('MessageBroker is not running')
    }

    const subscribers = this.topics.get(topic)
    if (!subscribers || subscribers.size === 0) {
      return
    }

    // Add topic to message metadata if not already present
    if (!message.metadata) {
      message.metadata = {}
    }
    message.metadata.topic = topic

    // Emit the message for the CommunicationBus to handle
    this.emit('message', message)
  }

  public subscribe(topic: string, subscriberId: string): void {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set())
    }

    this.topics.get(topic)!.add(subscriberId)
    this.emit('subscribed', { topic, subscriberId })
  }

  public unsubscribe(topic: string, subscriberId: string): void {
    const subscribers = this.topics.get(topic)
    if (subscribers) {
      subscribers.delete(subscriberId)
      if (subscribers.size === 0) {
        this.topics.delete(topic)
      }
      this.emit('unsubscribed', { topic, subscriberId })
    }
  }

  public getTopics(): string[] {
    return Array.from(this.topics.keys())
  }

  public getSubscribers(topic: string): string[] {
    const subscribers = this.topics.get(topic)
    return subscribers ? Array.from(subscribers) : []
  }

  public getSubscriptionCount(): number {
    return Array.from(this.topics.values())
      .reduce((total, subs) => total + subs.size, 0)
  }

  public clear(): void {
    this.topics.clear()
    this.emit('cleared')
  }
}