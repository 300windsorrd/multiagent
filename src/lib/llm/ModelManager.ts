import { v4 as uuidv4 } from 'uuid'
import { IOpenAIProvider, Model as OpenAIModel } from './OpenAIProvider'
import { IAnthropicProvider, AnthropicModel } from './AnthropicProvider'

export interface IModelManager {
  initialize(config: ModelManagerConfig): Promise<void>
  registerProvider(providerId: string, provider: LLMProvider): Promise<void>
  unregisterProvider(providerId: string): Promise<void>
  getProviders(): Promise<ProviderInfo[]>
  getModels(providerId?: string): Promise<UnifiedModel[]>
  getModel(modelId: string): Promise<UnifiedModel | null>
  getBestModel(request: ModelSelectionRequest): Promise<UnifiedModel>
  getModelCapabilities(modelId: string): Promise<ModelCapabilities | null>
  compareModels(modelIds: string[]): Promise<ModelComparison>
  updateModelCapabilities(modelId: string, capabilities: Partial<ModelCapabilities>): Promise<void>
  getModelStats(modelId: string): Promise<ModelStats | null>
  optimizeModelSelection(): Promise<void>
}

export interface ModelManagerConfig {
  enableAutoOptimization?: boolean
  enablePerformanceTracking?: boolean
  enableCostOptimization?: boolean
  optimizationInterval?: number // in milliseconds
  performanceThreshold?: number
  costThreshold?: number
  defaultProvider?: string
  defaultModel?: string
}

export type LLMProvider = IOpenAIProvider | IAnthropicProvider

export interface ProviderInfo {
  id: string
  name: string
  type: 'openai' | 'anthropic'
  status: 'active' | 'inactive' | 'error'
  models: UnifiedModel[]
  capabilities: ProviderCapabilities
  stats: ProviderStats
  lastUpdated: Date
}

export interface ProviderCapabilities {
  streaming: boolean
  chat: boolean
  completion: boolean
  embeddings: boolean
  vision: boolean
  functionCalling: boolean
  jsonMode: boolean
}

export interface ProviderStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  totalTokens: number
  totalCost: number
  errorRate: number
}

export interface UnifiedModel {
  id: string
  name: string
  providerId: string
  providerType: 'openai' | 'anthropic'
  capabilities: ModelCapabilities
  pricing: ModelPricing
  performance: ModelPerformance
  stats: ModelStats
  metadata: any
  isActive: boolean
  lastUsed?: Date
}

export interface ModelCapabilities {
  maxTokens: number
  streaming: boolean
  chat: boolean
  completion: boolean
  embeddings: boolean
  vision: boolean
  functionCalling: boolean
  jsonMode: boolean
  contextWindow: number
  supportedLanguages: string[]
  specialFeatures: string[]
}

export interface ModelPricing {
  inputTokenPrice: number // Price per 1K tokens
  outputTokenPrice: number // Price per 1K tokens
  currency: string
  effectiveDate?: Date
}

export interface ModelPerformance {
  averageResponseTime: number
  successRate: number
  qualityScore: number // 0-1 scale
  reliabilityScore: number // 0-1 scale
  lastUpdated: Date
}

export interface ModelStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  totalCost: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
  lastUsed?: Date
}

export interface ModelSelectionRequest {
  taskType: 'chat' | 'completion' | 'embedding' | 'vision' | 'function_calling'
  inputTokens?: number
  expectedOutputTokens?: number
  requiredCapabilities?: string[]
  preferredProvider?: string
  excludedProviders?: string[]
  maxCost?: number
  maxLatency?: number
  priority?: 'speed' | 'cost' | 'quality' | 'balanced'
  context?: any
}

export interface ModelComparison {
  models: ModelComparisonItem[]
  criteria: ComparisonCriteria
  winner: string
  reasoning: string
}

export interface ModelComparisonItem {
  modelId: string
  scores: ComparisonScores
  rank: number
}

export interface ComparisonScores {
  speed: number // 0-1 scale
  cost: number // 0-1 scale (lower is better)
  quality: number // 0-1 scale
  reliability: number // 0-1 scale
  overall: number // 0-1 scale
}

export interface ComparisonCriteria {
  weights: {
    speed: number
    cost: number
    quality: number
    reliability: number
  }
  priority: 'speed' | 'cost' | 'quality' | 'balanced'
}

export class ModelManager implements IModelManager {
  private config!: ModelManagerConfig
  private providers: Map<string, LLMProvider> = new Map()
  private providerInfo: Map<string, ProviderInfo> = new Map()
  private models: Map<string, UnifiedModel> = new Map()
  private initialized = false
  private optimizationInterval?: NodeJS.Timeout

  async initialize(config: ModelManagerConfig): Promise<void> {
    try {
      this.config = {
        enableAutoOptimization: true,
        enablePerformanceTracking: true,
        enableCostOptimization: true,
        optimizationInterval: 300000, // 5 minutes
        performanceThreshold: 0.8,
        costThreshold: 0.1,
        ...config
      }

      // Start optimization interval if enabled
      if (this.config.enableAutoOptimization) {
        this.startOptimizationInterval()
      }

      this.initialized = true
      console.log('Model manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize model manager:', error)
      throw error
    }
  }

  async registerProvider(providerId: string, provider: LLMProvider): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      // Check if provider already exists
      if (this.providers.has(providerId)) {
        throw new Error(`Provider ${providerId} already exists`)
      }

      // Add provider
      this.providers.set(providerId, provider)

      // Get provider models
      const models = await this.getProviderModels(providerId, provider)

      // Create provider info
      const providerInfo: ProviderInfo = {
        id: providerId,
        name: providerId,
        type: this.getProviderType(provider),
        status: 'active',
        models,
        capabilities: this.inferProviderCapabilities(models),
        stats: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          totalTokens: 0,
          totalCost: 0,
          errorRate: 0
        },
        lastUpdated: new Date()
      }

      this.providerInfo.set(providerId, providerInfo)

      // Add models to unified model registry
      for (const model of models) {
        this.models.set(model.id, model)
      }

      console.log(`Provider ${providerId} registered successfully with ${models.length} models`)
    } catch (error) {
      console.error(`Failed to register provider ${providerId}:`, error)
      throw error
    }
  }

  async unregisterProvider(providerId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      // Remove provider
      this.providers.delete(providerId)
      this.providerInfo.delete(providerId)

      // Remove models from unified registry
      const modelsToRemove: string[] = []
      for (const [modelId, model] of this.models.entries()) {
        if (model.providerId === providerId) {
          modelsToRemove.push(modelId)
        }
      }

      for (const modelId of modelsToRemove) {
        this.models.delete(modelId)
      }

      console.log(`Provider ${providerId} unregistered successfully`)
    } catch (error) {
      console.error(`Failed to unregister provider ${providerId}:`, error)
      throw error
    }
  }

  async getProviders(): Promise<ProviderInfo[]> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return Array.from(this.providerInfo.values())
  }

  async getModels(providerId?: string): Promise<UnifiedModel[]> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    const models = Array.from(this.models.values())
    
    if (providerId) {
      return models.filter(model => model.providerId === providerId)
    }

    return models
  }

  async getModel(modelId: string): Promise<UnifiedModel | null> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return this.models.get(modelId) || null
  }

  async getBestModel(request: ModelSelectionRequest): Promise<UnifiedModel> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      // Filter models based on requirements
      let candidates = Array.from(this.models.values()).filter(model => {
        // Check if model is active
        if (!model.isActive) return false

        // Check provider exclusions
        if (request.excludedProviders?.includes(model.providerId)) return false

        // Check task type compatibility
        if (request.taskType === 'chat' && !model.capabilities.chat) return false
        if (request.taskType === 'completion' && !model.capabilities.completion) return false
        if (request.taskType === 'embedding' && !model.capabilities.embeddings) return false
        if (request.taskType === 'vision' && !model.capabilities.vision) return false
        if (request.taskType === 'function_calling' && !model.capabilities.functionCalling) return false

        // Check required capabilities
        if (request.requiredCapabilities) {
          for (const capability of request.requiredCapabilities) {
            if (!model.capabilities.specialFeatures.includes(capability)) return false
          }
        }

        // Check cost constraints
        if (request.maxCost) {
          const estimatedCost = this.estimateCost(model, request.inputTokens || 0, request.expectedOutputTokens || 0)
          if (estimatedCost > request.maxCost) return false
        }

        return true
      })

      // If no candidates found, throw error
      if (candidates.length === 0) {
        throw new Error('No suitable model found for the given requirements')
      }

      // Score and rank candidates
      const scoredCandidates = candidates.map(model => ({
        model,
        score: this.calculateModelScore(model, request)
      }))

      // Sort by score (descending)
      scoredCandidates.sort((a, b) => b.score - a.score)

      // Return best model
      return scoredCandidates[0].model
    } catch (error) {
      console.error('Failed to get best model:', error)
      throw error
    }
  }

  async getModelCapabilities(modelId: string): Promise<ModelCapabilities | null> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    const model = this.models.get(modelId)
    return model ? { ...model.capabilities } : null
  }

  async compareModels(modelIds: string[]): Promise<ModelComparison> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      // Get models
      const models = modelIds.map(id => this.models.get(id)).filter(Boolean) as UnifiedModel[]
      
      if (models.length < 2) {
        throw new Error('At least 2 models are required for comparison')
      }

      // Calculate comparison scores
      const comparisonItems: ModelComparisonItem[] = models.map(model => ({
        modelId: model.id,
        scores: this.calculateComparisonScores(model),
        rank: 0
      }))

      // Rank models
      comparisonItems.sort((a, b) => b.scores.overall - a.scores.overall)
      comparisonItems.forEach((item, index) => {
        item.rank = index + 1
      })

      // Determine winner and reasoning
      const winner = comparisonItems[0]
      const reasoning = this.generateComparisonReasoning(comparisonItems)

      return {
        models: comparisonItems,
        criteria: {
          weights: {
            speed: 0.25,
            cost: 0.25,
            quality: 0.25,
            reliability: 0.25
          },
          priority: 'balanced'
        },
        winner: winner.modelId,
        reasoning
      }
    } catch (error) {
      console.error('Failed to compare models:', error)
      throw error
    }
  }

  async updateModelCapabilities(modelId: string, capabilities: Partial<ModelCapabilities>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      const model = this.models.get(modelId)
      if (!model) {
        throw new Error(`Model ${modelId} not found`)
      }

      // Update capabilities
      model.capabilities = { ...model.capabilities, ...capabilities }
      model.metadata.lastUpdated = new Date()

      console.log(`Model ${modelId} capabilities updated successfully`)
    } catch (error) {
      console.error(`Failed to update model ${modelId} capabilities:`, error)
      throw error
    }
  }

  async getModelStats(modelId: string): Promise<ModelStats | null> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    const model = this.models.get(modelId)
    return model ? { ...model.stats } : null
  }

  async optimizeModelSelection(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      // Analyze model performance and update rankings
      for (const [modelId, model] of this.models.entries()) {
        // Update performance scores based on stats
        const successRate = model.stats.totalRequests > 0 
          ? model.stats.successfulRequests / model.stats.totalRequests 
          : 1

        model.performance.successRate = successRate
        model.performance.qualityScore = this.calculateQualityScore(model)
        model.performance.reliabilityScore = this.calculateReliabilityScore(model)
        model.performance.lastUpdated = new Date()

        // Update model active status based on performance
        model.isActive = successRate > (this.config.performanceThreshold || 0.8)
      }

      console.log('Model selection optimization completed')
    } catch (error) {
      console.error('Failed to optimize model selection:', error)
      throw error
    }
  }

  private async getProviderModels(providerId: string, provider: LLMProvider): Promise<UnifiedModel[]> {
    try {
      const models = await (provider as any).getModels()
      const providerType = this.getProviderType(provider)

      return models.map((model: any) => this.convertToUnifiedModel(model, providerId, providerType))
    } catch (error) {
      console.error(`Failed to get models for provider ${providerId}:`, error)
      throw error
    }
  }

  private getProviderType(provider: LLMProvider): 'openai' | 'anthropic' {
    // Simple type detection based on interface methods
    if ('generateChatCompletion' in provider) {
      return 'openai'
    } else if ('generateMessage' in provider) {
      return 'anthropic'
    }
    throw new Error('Unknown provider type')
  }

  private convertToUnifiedModel(model: OpenAIModel | AnthropicModel, providerId: string, providerType: 'openai' | 'anthropic'): UnifiedModel {
    const baseModel: UnifiedModel = {
      id: model.id,
      name: model.id,
      providerId,
      providerType,
      capabilities: {
        maxTokens: 0,
        streaming: false,
        chat: false,
        completion: false,
        embeddings: false,
        vision: false,
        functionCalling: false,
        jsonMode: false,
        contextWindow: 0,
        supportedLanguages: ['en'],
        specialFeatures: []
      },
      pricing: {
        inputTokenPrice: 0,
        outputTokenPrice: 0,
        currency: 'USD'
      },
      performance: {
        averageResponseTime: 0,
        successRate: 1,
        qualityScore: 0.5,
        reliabilityScore: 0.5,
        lastUpdated: new Date()
      },
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        averageTokensPerRequest: 0,
        averageCostPerRequest: 0
      },
      metadata: {
        created: model.created,
        ownedBy: model.ownedBy
      },
      isActive: true
    }

    // Set provider-specific capabilities and pricing
    if (providerType === 'openai') {
      const openaiModel = model as OpenAIModel
      baseModel.capabilities = this.getOpenAICapabilities(openaiModel.id)
      baseModel.pricing = this.getOpenAIPricing(openaiModel.id)
    } else if (providerType === 'anthropic') {
      const anthropicModel = model as AnthropicModel
      baseModel.capabilities = this.getAnthropicCapabilities(anthropicModel)
      baseModel.pricing = this.getAnthropicPricing(anthropicModel.id)
    }

    return baseModel
  }

  private getOpenAICapabilities(modelId: string): ModelCapabilities {
    const capabilities: ModelCapabilities = {
      maxTokens: 4096,
      streaming: true,
      chat: false,
      completion: true,
      embeddings: false,
      vision: false,
      functionCalling: false,
      jsonMode: false,
      contextWindow: 4096,
      supportedLanguages: ['en'],
      specialFeatures: []
    }

    // Set capabilities based on model
    if (modelId.includes('gpt-4')) {
      capabilities.maxTokens = 8192
      capabilities.contextWindow = 8192
      capabilities.chat = true
      capabilities.functionCalling = true
      capabilities.jsonMode = true
    }

    if (modelId.includes('gpt-3.5-turbo')) {
      capabilities.maxTokens = 4096
      capabilities.contextWindow = 4096
      capabilities.chat = true
    }

    if (modelId.includes('embedding')) {
      capabilities.embeddings = true
      capabilities.maxTokens = 8192
    }

    if (modelId.includes('vision') || modelId.includes('gpt-4-v')) {
      capabilities.vision = true
    }

    return capabilities
  }

  private getAnthropicCapabilities(model: AnthropicModel): ModelCapabilities {
    return {
      maxTokens: model.maxTokens,
      streaming: model.capabilities.streaming,
      chat: model.capabilities.chat,
      completion: model.capabilities.completion,
      embeddings: model.capabilities.embeddings,
      vision: model.capabilities.vision,
      functionCalling: false, // Anthropic doesn't have explicit function calling
      jsonMode: false,
      contextWindow: model.maxTokens,
      supportedLanguages: ['en'],
      specialFeatures: []
    }
  }

  private getOpenAIPricing(modelId: string): ModelPricing {
    const pricing: ModelPricing = {
      inputTokenPrice: 0.002,
      outputTokenPrice: 0.002,
      currency: 'USD'
    }

    // Set pricing based on model
    if (modelId.includes('gpt-4')) {
      pricing.inputTokenPrice = 0.03
      pricing.outputTokenPrice = 0.06
    }

    if (modelId.includes('gpt-3.5-turbo')) {
      pricing.inputTokenPrice = 0.0015
      pricing.outputTokenPrice = 0.002
    }

    if (modelId.includes('embedding')) {
      pricing.inputTokenPrice = 0.0004
      pricing.outputTokenPrice = 0.0004
    }

    return pricing
  }

  private getAnthropicPricing(modelId: string): ModelPricing {
    const pricing: ModelPricing = {
      inputTokenPrice: 0.015,
      outputTokenPrice: 0.075,
      currency: 'USD'
    }

    // Set pricing based on model
    if (modelId.includes('opus')) {
      pricing.inputTokenPrice = 0.015
      pricing.outputTokenPrice = 0.075
    }

    if (modelId.includes('sonnet')) {
      pricing.inputTokenPrice = 0.003
      pricing.outputTokenPrice = 0.015
    }

    if (modelId.includes('haiku')) {
      pricing.inputTokenPrice = 0.00025
      pricing.outputTokenPrice = 0.00125
    }

    return pricing
  }

  private inferProviderCapabilities(models: UnifiedModel[]): ProviderCapabilities {
    const capabilities: ProviderCapabilities = {
      streaming: false,
      chat: false,
      completion: false,
      embeddings: false,
      vision: false,
      functionCalling: false,
      jsonMode: false
    }

    for (const model of models) {
      capabilities.streaming = capabilities.streaming || model.capabilities.streaming
      capabilities.chat = capabilities.chat || model.capabilities.chat
      capabilities.completion = capabilities.completion || model.capabilities.completion
      capabilities.embeddings = capabilities.embeddings || model.capabilities.embeddings
      capabilities.vision = capabilities.vision || model.capabilities.vision
      capabilities.functionCalling = capabilities.functionCalling || model.capabilities.functionCalling
      capabilities.jsonMode = capabilities.jsonMode || model.capabilities.jsonMode
    }

    return capabilities
  }

  private calculateModelScore(model: UnifiedModel, request: ModelSelectionRequest): number {
    let score = 0

    // Base score from performance metrics
    const performanceScore = (model.performance.successRate + model.performance.qualityScore + model.performance.reliabilityScore) / 3
    score += performanceScore * 0.4

    // Cost score (lower is better, so we invert)
    const estimatedCost = this.estimateCost(model, request.inputTokens || 0, request.expectedOutputTokens || 0)
    const costScore = Math.max(0, 1 - (estimatedCost / 10)) // Normalize to 0-1
    score += costScore * 0.3

    // Speed score (lower response time is better)
    const speedScore = Math.max(0, 1 - (model.performance.averageResponseTime / 10000)) // Normalize to 0-1
    score += speedScore * 0.3

    // Priority adjustments
    if (request.priority === 'speed') {
      score = score * 0.7 + speedScore * 0.3
    } else if (request.priority === 'cost') {
      score = score * 0.7 + costScore * 0.3
    } else if (request.priority === 'quality') {
      score = score * 0.7 + model.performance.qualityScore * 0.3
    }

    // Provider preference
    if (request.preferredProvider === model.providerId) {
      score += 0.1
    }

    return Math.min(score, 1)
  }

  private estimateCost(model: UnifiedModel, inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1000) * model.pricing.inputTokenPrice + 
           (outputTokens / 1000) * model.pricing.outputTokenPrice
  }

  private calculateComparisonScores(model: UnifiedModel): ComparisonScores {
    const speed = Math.max(0, 1 - (model.performance.averageResponseTime / 10000))
    const cost = Math.max(0, 1 - (this.estimateCost(model, 1000, 500) / 10))
    const quality = model.performance.qualityScore
    const reliability = model.performance.reliabilityScore

    const overall = (speed + cost + quality + reliability) / 4

    return {
      speed,
      cost,
      quality,
      reliability,
      overall
    }
  }

  private generateComparisonReasoning(comparisonItems: ModelComparisonItem[]): string {
    const winner = comparisonItems[0]
    const runnerUp = comparisonItems[1]

    const reasons: string[] = []

    if (winner.scores.speed > runnerUp.scores.speed) {
      reasons.push('faster response time')
    }

    if (winner.scores.cost > runnerUp.scores.cost) {
      reasons.push('lower cost')
    }

    if (winner.scores.quality > runnerUp.scores.quality) {
      reasons.push('higher quality')
    }

    if (winner.scores.reliability > runnerUp.scores.reliability) {
      reasons.push('better reliability')
    }

    return `${winner.modelId} selected due to ${reasons.join(', ')}`
  }

  private calculateQualityScore(model: UnifiedModel): number {
    // Simple quality score based on model capabilities and performance
    let score = 0.5 // Base score

    // Boost score for advanced capabilities
    if (model.capabilities.functionCalling) score += 0.1
    if (model.capabilities.vision) score += 0.1
    if (model.capabilities.jsonMode) score += 0.1

    // Boost score for larger context window
    if (model.capabilities.contextWindow > 8000) score += 0.1
    if (model.capabilities.contextWindow > 16000) score += 0.1

    return Math.min(score, 1)
  }

  private calculateReliabilityScore(model: UnifiedModel): number {
    // Simple reliability score based on error rate and consistency
    const errorRate = model.stats.totalRequests > 0 
      ? model.stats.failedRequests / model.stats.totalRequests 
      : 0

    return Math.max(0, 1 - errorRate)
  }

  private startOptimizationInterval(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
    }

    this.optimizationInterval = setInterval(async () => {
      try {
        await this.optimizeModelSelection()
      } catch (error) {
        console.error('Error during model optimization:', error)
      }
    }, this.config.optimizationInterval)
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): ModelManagerConfig {
    return { ...this.config }
  }

  async cleanup(): Promise<void> {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
      this.optimizationInterval = undefined
    }

    this.providers.clear()
    this.providerInfo.clear()
    this.models.clear()
    this.initialized = false
  }
}