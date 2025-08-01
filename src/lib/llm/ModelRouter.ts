import { v4 as uuidv4 } from 'uuid'
import { IOpenAIProvider, Model, CompletionRequest, ChatCompletionRequest, EmbeddingRequest } from './OpenAIProvider'

export interface IModelRouter {
  initialize(config: ModelRouterConfig): Promise<void>
  routeRequest(request: RoutingRequest): Promise<RoutingResult>
  addProvider(providerId: string, provider: IOpenAIProvider): Promise<void>
  removeProvider(providerId: string): Promise<void>
  getProviders(): Promise<ProviderInfo[]>
  getRoutingStats(): Promise<RoutingStats>
  updateRoutingRules(rules: RoutingRule[]): Promise<void>
  optimizeRouting(): Promise<void>
}

export interface ModelRouterConfig {
  defaultProvider?: string
  enableLoadBalancing?: boolean
  enableCostOptimization?: boolean
  enablePerformanceOptimization?: boolean
  maxRetries?: number
  timeout?: number
  fallbackEnabled?: boolean
}

export interface RoutingRequest {
  type: 'completion' | 'chat' | 'embedding'
  request: CompletionRequest | ChatCompletionRequest | EmbeddingRequest
  priority?: 'low' | 'medium' | 'high' | 'critical'
  preferredProvider?: string
  preferredModel?: string
  constraints?: RoutingConstraints
  metadata?: any
}

export interface RoutingConstraints {
  maxCost?: number
  maxLatency?: number
  minQuality?: number
  requiredCapabilities?: string[]
  excludedProviders?: string[]
  excludedModels?: string[]
}

export interface RoutingResult {
  providerId: string
  model: string
  requestId: string
  estimatedCost?: number
  estimatedLatency?: number
  confidence: number
  fallbackOptions?: FallbackOption[]
}

export interface FallbackOption {
  providerId: string
  model: string
  reason: string
  estimatedCost?: number
  estimatedLatency?: number
}

export interface ProviderInfo {
  id: string
  name: string
  models: Model[]
  capabilities: ProviderCapability[]
  status: 'active' | 'inactive' | 'error'
  lastUsed: Date
  usageStats: ProviderUsageStats
}

export interface ProviderCapability {
  name: string
  version: string
  supported: boolean
  parameters: Record<string, any>
}

export interface ProviderUsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  totalTokens: number
  totalCost: number
  errorRate: number
}

export interface RoutingStats {
  totalRequests: number
  successfulRoutings: number
  failedRoutings: number
  averageRoutingTime: number
  providerUsage: Record<string, number>
  modelUsage: Record<string, number>
  costSavings: number
  performanceImprovements: number
}

export interface RoutingRule {
  id: string
  name: string
  description: string
  condition: RoutingCondition
  action: RoutingAction
  priority: number
  enabled: boolean
}

export interface RoutingCondition {
  requestType?: 'completion' | 'chat' | 'embedding'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  estimatedTokens?: {
    min?: number
    max?: number
  }
  requiredCapabilities?: string[]
  customCondition?: (request: RoutingRequest) => Promise<boolean>
}

export interface RoutingAction {
  providerId?: string
  model?: string
  weight?: number
  parameters?: Record<string, any>
}

export class ModelRouter implements IModelRouter {
  private config!: ModelRouterConfig
  private providers: Map<string, IOpenAIProvider> = new Map()
  private providerInfo: Map<string, ProviderInfo> = new Map()
  private routingRules: RoutingRule[] = []
  private routingStats: RoutingStats = {
    totalRequests: 0,
    successfulRoutings: 0,
    failedRoutings: 0,
    averageRoutingTime: 0,
    providerUsage: {},
    modelUsage: {},
    costSavings: 0,
    performanceImprovements: 0
  }
  private initialized = false

  async initialize(config: ModelRouterConfig): Promise<void> {
    try {
      this.config = {
        enableLoadBalancing: true,
        enableCostOptimization: true,
        enablePerformanceOptimization: true,
        maxRetries: 3,
        timeout: 30000,
        fallbackEnabled: true,
        ...config
      }

      // Initialize default routing rules
      this.initializeDefaultRules()

      this.initialized = true
      console.log('Model router initialized successfully')
    } catch (error) {
      console.error('Failed to initialize model router:', error)
      throw error
    }
  }

  async routeRequest(request: RoutingRequest): Promise<RoutingResult> {
    if (!this.initialized) {
      throw new Error('Model router not initialized')
    }

    const startTime = Date.now()
    const requestId = uuidv4()

    try {
      // Apply routing rules
      const ruleResult = await this.applyRoutingRules(request)
      if (ruleResult) {
        return ruleResult
      }

      // Find best provider and model
      const routingDecision = await this.findBestRouting(request)

      // Update stats
      const routingTime = Date.now() - startTime
      this.updateRoutingStats(routingDecision, routingTime, true)

      return routingDecision
    } catch (error) {
      const routingTime = Date.now() - startTime
      this.updateRoutingStats(null, routingTime, false)
      throw error
    }
  }

  async addProvider(providerId: string, provider: IOpenAIProvider): Promise<void> {
    try {
      // Check if provider already exists
      if (this.providers.has(providerId)) {
        throw new Error(`Provider ${providerId} already exists`)
      }

      // Add provider
      this.providers.set(providerId, provider)

      // Get provider info
      const models = await provider.getModels()
      const providerInfo: ProviderInfo = {
        id: providerId,
        name: providerId,
        models,
        capabilities: this.inferCapabilities(models),
        status: 'active',
        lastUsed: new Date(),
        usageStats: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          totalTokens: 0,
          totalCost: 0,
          errorRate: 0
        }
      }

      this.providerInfo.set(providerId, providerInfo)
      console.log(`Provider ${providerId} added successfully`)
    } catch (error) {
      console.error(`Failed to add provider ${providerId}:`, error)
      throw error
    }
  }

  async removeProvider(providerId: string): Promise<void> {
    try {
      // Remove provider
      this.providers.delete(providerId)
      this.providerInfo.delete(providerId)

      // Update stats
      delete this.routingStats.providerUsage[providerId]

      console.log(`Provider ${providerId} removed successfully`)
    } catch (error) {
      console.error(`Failed to remove provider ${providerId}:`, error)
      throw error
    }
  }

  async getProviders(): Promise<ProviderInfo[]> {
    return Array.from(this.providerInfo.values())
  }

  async getRoutingStats(): Promise<RoutingStats> {
    return { ...this.routingStats }
  }

  async updateRoutingRules(rules: RoutingRule[]): Promise<void> {
    try {
      this.routingRules = rules.sort((a, b) => b.priority - a.priority)
      console.log('Routing rules updated successfully')
    } catch (error) {
      console.error('Failed to update routing rules:', error)
      throw error
    }
  }

  async optimizeRouting(): Promise<void> {
    try {
      // Analyze routing patterns and optimize
      const providerStats = await this.getProviderPerformanceStats()
      
      // Update routing rules based on performance
      for (const [providerId, stats] of Object.entries(providerStats)) {
        if (stats.errorRate > 0.1) { // 10% error rate threshold
          // Reduce weight for high-error providers
          await this.adjustProviderWeight(providerId, 0.5)
        } else if (stats.averageResponseTime > 10000) { // 10 second threshold
          // Reduce weight for slow providers
          await this.adjustProviderWeight(providerId, 0.7)
        }
      }

      console.log('Routing optimization completed')
    } catch (error) {
      console.error('Failed to optimize routing:', error)
      throw error
    }
  }

  private async applyRoutingRules(request: RoutingRequest): Promise<RoutingResult | null> {
    for (const rule of this.routingRules) {
      if (!rule.enabled) continue

      if (await this.matchesCondition(rule.condition, request)) {
        const providerId = rule.action.providerId || this.config.defaultProvider
        if (!providerId || !this.providers.has(providerId)) {
          continue
        }

        const model = rule.action.model || await this.getDefaultModel(providerId, request.type)
        if (!model) {
          continue
        }

        return {
          providerId,
          model,
          requestId: uuidv4(),
          confidence: rule.priority / 100,
          estimatedCost: await this.estimateCost(providerId, model, request),
          estimatedLatency: await this.estimateLatency(providerId, model, request)
        }
      }
    }

    return null
  }

  private async matchesCondition(condition: RoutingCondition, request: RoutingRequest): Promise<boolean> {
    // Check request type
    if (condition.requestType && condition.requestType !== request.type) {
      return false
    }

    // Check priority
    if (condition.priority && condition.priority !== request.priority) {
      return false
    }

    // Check custom condition
    if (condition.customCondition) {
      return await condition.customCondition(request)
    }

    return true
  }

  private async findBestRouting(request: RoutingRequest): Promise<RoutingResult> {
    const candidates: RoutingResult[] = []

    // Generate routing candidates
    for (const [providerId, provider] of this.providers.entries()) {
      const providerInfo = this.providerInfo.get(providerId)
      if (!providerInfo || providerInfo.status !== 'active') {
        continue
      }

      // Check provider constraints
      if (request.constraints?.excludedProviders?.includes(providerId)) {
        continue
      }

      // Find suitable models
      const suitableModels = await this.findSuitableModels(providerId, request)
      for (const model of suitableModels) {
        // Check model constraints
        if (request.constraints?.excludedModels?.includes(model)) {
          continue
        }

        const result: RoutingResult = {
          providerId,
          model,
          requestId: uuidv4(),
          estimatedCost: await this.estimateCost(providerId, model, request),
          estimatedLatency: await this.estimateLatency(providerId, model, request),
          confidence: await this.calculateConfidence(providerId, model, request)
        }

        candidates.push(result)
      }
    }

    // Sort candidates by confidence
    candidates.sort((a, b) => b.confidence - a.confidence)

    if (candidates.length === 0) {
      throw new Error('No suitable provider/model found for request')
    }

    const bestCandidate = candidates[0]

    // Generate fallback options if enabled
    if (this.config.fallbackEnabled && candidates.length > 1) {
      bestCandidate.fallbackOptions = candidates.slice(1, 3).map(candidate => ({
        providerId: candidate.providerId,
        model: candidate.model,
        reason: 'Alternative provider/model',
        estimatedCost: candidate.estimatedCost,
        estimatedLatency: candidate.estimatedLatency
      }))
    }

    return bestCandidate
  }

  private async findSuitableModels(providerId: string, request: RoutingRequest): Promise<string[]> {
    const providerInfo = this.providerInfo.get(providerId)
    if (!providerInfo) {
      return []
    }

    const suitableModels: string[] = []

    for (const model of providerInfo.models) {
      // Check model capabilities
      if (request.type === 'chat' && !model.id.includes('gpt')) {
        continue
      }

      if (request.type === 'embedding' && !model.id.includes('embedding')) {
        continue
      }

      // Check preferred model
      if (request.preferredModel && model.id !== request.preferredModel) {
        continue
      }

      suitableModels.push(model.id)
    }

    return suitableModels
  }

  private async getDefaultModel(providerId: string, requestType: string): Promise<string | null> {
    const providerInfo = this.providerInfo.get(providerId)
    if (!providerInfo) {
      return null
    }

    // Return first suitable model
    for (const model of providerInfo.models) {
      if (requestType === 'chat' && model.id.includes('gpt')) {
        return model.id
      }

      if (requestType === 'embedding' && model.id.includes('embedding')) {
        return model.id
      }

      if (requestType === 'completion') {
        return model.id
      }
    }

    return null
  }

  private async estimateCost(providerId: string, model: string, request: RoutingRequest): Promise<number> {
    // Simple cost estimation - in reality, this would be more sophisticated
    const baseCost = 0.002 // $0.002 per 1K tokens
    const estimatedTokens = this.estimateTokens(request)
    return (baseCost * estimatedTokens) / 1000
  }

  private async estimateLatency(providerId: string, model: string, request: RoutingRequest): Promise<number> {
    // Simple latency estimation - in reality, this would be based on historical data
    const baseLatency = 1000 // 1 second base latency
    const estimatedTokens = this.estimateTokens(request)
    return baseLatency + (estimatedTokens / 1000) * 100 // Add 100ms per 1K tokens
  }

  private async calculateConfidence(providerId: string, model: string, request: RoutingRequest): Promise<number> {
    const providerInfo = this.providerInfo.get(providerId)
    if (!providerInfo) {
      return 0
    }

    let confidence = 0.5 // Base confidence

    // Boost confidence based on provider performance
    const errorRate = providerInfo.usageStats.errorRate
    confidence += (1 - errorRate) * 0.3

    // Boost confidence based on model suitability
    if (request.preferredModel === model) {
      confidence += 0.2
    }

    return Math.min(confidence, 1.0)
  }

  private estimateTokens(request: RoutingRequest): number {
    // Simple token estimation - in reality, this would use a tokenizer
    if (request.type === 'chat') {
      const chatRequest = request.request as ChatCompletionRequest
      return chatRequest.messages.reduce((sum, msg) => sum + msg.content.length / 4, 0)
    } else if (request.type === 'completion') {
      const completionRequest = request.request as CompletionRequest
      return completionRequest.prompt.length / 4
    } else {
      const embeddingRequest = request.request as EmbeddingRequest
      const input = typeof embeddingRequest.input === 'string' ? embeddingRequest.input : embeddingRequest.input.join(' ')
      return input.length / 4
    }
  }

  private inferCapabilities(models: Model[]): ProviderCapability[] {
    const capabilities: ProviderCapability[] = []

    const hasChatModels = models.some(m => m.id.includes('gpt'))
    const hasEmbeddingModels = models.some(m => m.id.includes('embedding'))

    if (hasChatModels) {
      capabilities.push({
        name: 'chat',
        version: '1.0',
        supported: true,
        parameters: {}
      })
    }

    if (hasEmbeddingModels) {
      capabilities.push({
        name: 'embedding',
        version: '1.0',
        supported: true,
        parameters: {}
      })
    }

    return capabilities
  }

  private async getProviderPerformanceStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {}

    for (const [providerId, providerInfo] of this.providerInfo.entries()) {
      stats[providerId] = {
        errorRate: providerInfo.usageStats.errorRate,
        averageResponseTime: providerInfo.usageStats.averageResponseTime,
        totalRequests: providerInfo.usageStats.totalRequests
      }
    }

    return stats
  }

  private async adjustProviderWeight(providerId: string, factor: number): Promise<void> {
    // Find and adjust routing rules for this provider
    for (const rule of this.routingRules) {
      if (rule.action.providerId === providerId) {
        rule.action.weight = (rule.action.weight || 1) * factor
      }
    }
  }

  private updateRoutingStats(result: RoutingResult | null, routingTime: number, success: boolean): void {
    this.routingStats.totalRequests++

    if (success && result) {
      this.routingStats.successfulRoutings++
      this.routingStats.providerUsage[result.providerId] = (this.routingStats.providerUsage[result.providerId] || 0) + 1
      this.routingStats.modelUsage[result.model] = (this.routingStats.modelUsage[result.model] || 0) + 1
    } else {
      this.routingStats.failedRoutings++
    }

    this.routingStats.averageRoutingTime = (this.routingStats.averageRoutingTime * (this.routingStats.totalRequests - 1) + routingTime) / this.routingStats.totalRequests
  }

  private initializeDefaultRules(): void {
    this.routingRules = [
      {
        id: 'default-chat',
        name: 'Default Chat Routing',
        description: 'Route chat requests to default provider',
        condition: {
          requestType: 'chat'
        },
        action: {
          providerId: this.config.defaultProvider
        },
        priority: 1,
        enabled: true
      },
      {
        id: 'default-embedding',
        name: 'Default Embedding Routing',
        description: 'Route embedding requests to default provider',
        condition: {
          requestType: 'embedding'
        },
        action: {
          providerId: this.config.defaultProvider
        },
        priority: 1,
        enabled: true
      }
    ]
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): ModelRouterConfig {
    return { ...this.config }
  }

  getRoutingRules(): RoutingRule[] {
    return [...this.routingRules]
  }
}