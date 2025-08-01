import { v4 as uuidv4 } from 'uuid'
import { ModelRouter, IModelRouter, ModelRouterConfig, RoutingRequest, RoutingResult } from './ModelRouter'
import { OpenAIProvider, IOpenAIProvider, OpenAIConfig } from './OpenAIProvider'
import { AnthropicProvider, IAnthropicProvider, AnthropicConfig } from './AnthropicProvider'

export interface IModelManager {
  initialize(config: ModelManagerConfig): Promise<void>
  addOpenAIProvider(providerId: string, config: OpenAIConfig): Promise<void>
  addAnthropicProvider(providerId: string, config: AnthropicConfig): Promise<void>
  removeProvider(providerId: string): Promise<void>
  routeRequest(request: ModelManagerRequest): Promise<ModelManagerResponse>
  getProviders(): Promise<ProviderInfo[]>
  getRoutingStats(): Promise<any>
  updateRoutingRules(rules: any[]): Promise<void>
  optimizeRouting(): Promise<void>
}

export interface ModelManagerConfig {
  defaultProvider?: string
  enableLoadBalancing?: boolean
  enableCostOptimization?: boolean
  enablePerformanceOptimization?: boolean
  maxRetries?: number
  timeout?: number
  fallbackEnabled?: boolean
}

export interface ModelManagerRequest {
  type: 'completion' | 'chat' | 'embedding'
  provider?: 'openai' | 'anthropic' | 'auto'
  request: any
  priority?: 'low' | 'medium' | 'high' | 'critical'
  preferredProvider?: string
  preferredModel?: string
  constraints?: ModelManagerConstraints
  metadata?: any
}

export interface ModelManagerConstraints {
  maxCost?: number
  maxLatency?: number
  minQuality?: number
  requiredCapabilities?: string[]
  excludedProviders?: string[]
  excludedModels?: string[]
}

export interface ModelManagerResponse {
  providerId: string
  providerType: 'openai' | 'anthropic'
  model: string
  requestId: string
  result: any
  estimatedCost?: number
  estimatedLatency?: number
  actualCost?: number
  actualLatency?: number
  confidence: number
  fallbackOptions?: FallbackOption[]
}

export interface FallbackOption {
  providerId: string
  providerType: 'openai' | 'anthropic'
  model: string
  reason: string
  estimatedCost?: number
  estimatedLatency?: number
}

export interface ProviderInfo {
  id: string
  name: string
  type: 'openai' | 'anthropic'
  models: any[]
  capabilities: any[]
  status: 'active' | 'inactive' | 'error'
  lastUsed: Date
  usageStats: any
}

export class ModelManager implements IModelManager {
  private modelRouter: IModelRouter
  private openAIProviders: Map<string, IOpenAIProvider> = new Map()
  private anthropicProviders: Map<string, IAnthropicProvider> = new Map()
  private providerTypes: Map<string, 'openai' | 'anthropic'> = new Map()
  private initialized = false

  constructor() {
    this.modelRouter = new ModelRouter()
  }

  async initialize(config: ModelManagerConfig): Promise<void> {
    try {
      const routerConfig: ModelRouterConfig = {
        enableLoadBalancing: config.enableLoadBalancing,
        enableCostOptimization: config.enableCostOptimization,
        enablePerformanceOptimization: config.enablePerformanceOptimization,
        maxRetries: config.maxRetries,
        timeout: config.timeout,
        fallbackEnabled: config.fallbackEnabled,
        defaultProvider: config.defaultProvider
      }

      await this.modelRouter.initialize(routerConfig)
      this.initialized = true
      console.log('Model manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize model manager:', error)
      throw error
    }
  }

  async addOpenAIProvider(providerId: string, config: OpenAIConfig): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      const provider = new OpenAIProvider()
      await provider.initialize(config)
      
      this.openAIProviders.set(providerId, provider)
      this.providerTypes.set(providerId, 'openai')
      
      await this.modelRouter.addProvider(providerId, provider, 'openai')
      console.log(`OpenAI provider ${providerId} added successfully`)
    } catch (error) {
      console.error(`Failed to add OpenAI provider ${providerId}:`, error)
      throw error
    }
  }

  async addAnthropicProvider(providerId: string, config: AnthropicConfig): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      const provider = new AnthropicProvider()
      await provider.initialize(config)
      
      this.anthropicProviders.set(providerId, provider)
      this.providerTypes.set(providerId, 'anthropic')
      
      await this.modelRouter.addProvider(providerId, provider, 'anthropic')
      console.log(`Anthropic provider ${providerId} added successfully`)
    } catch (error) {
      console.error(`Failed to add Anthropic provider ${providerId}:`, error)
      throw error
    }
  }

  async removeProvider(providerId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    try {
      await this.modelRouter.removeProvider(providerId)
      
      if (this.openAIProviders.has(providerId)) {
        this.openAIProviders.delete(providerId)
      }
      
      if (this.anthropicProviders.has(providerId)) {
        this.anthropicProviders.delete(providerId)
      }
      
      this.providerTypes.delete(providerId)
      console.log(`Provider ${providerId} removed successfully`)
    } catch (error) {
      console.error(`Failed to remove provider ${providerId}:`, error)
      throw error
    }
  }

  async routeRequest(request: ModelManagerRequest): Promise<ModelManagerResponse> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    const startTime = Date.now()
    const requestId = uuidv4()

    try {
      // Convert manager request to router request
      const routingRequest: RoutingRequest = {
        type: request.type,
        request: request.request,
        priority: request.priority,
        preferredProvider: request.preferredProvider,
        preferredModel: request.preferredModel,
        constraints: request.constraints,
        metadata: request.metadata
      }

      // Get routing decision
      const routingResult = await this.modelRouter.routeRequest(routingRequest)
      
      // Execute the request with the selected provider
      const result = await this.executeRequest(routingResult, request)
      
      const actualLatency = Date.now() - startTime
      
      return {
        providerId: routingResult.providerId,
        providerType: this.providerTypes.get(routingResult.providerId)!,
        model: routingResult.model,
        requestId,
        result,
        estimatedCost: routingResult.estimatedCost,
        estimatedLatency: routingResult.estimatedLatency,
        actualLatency,
        confidence: routingResult.confidence,
        fallbackOptions: routingResult.fallbackOptions?.map(option => ({
          providerId: option.providerId,
          providerType: this.providerTypes.get(option.providerId)!,
          model: option.model,
          reason: option.reason,
          estimatedCost: option.estimatedCost,
          estimatedLatency: option.estimatedLatency
        }))
      }
    } catch (error) {
      console.error(`Failed to route request ${requestId}:`, error)
      throw error
    }
  }

  async getProviders(): Promise<ProviderInfo[]> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return this.modelRouter.getProviders()
  }

  async getRoutingStats(): Promise<any> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return this.modelRouter.getRoutingStats()
  }

  async updateRoutingRules(rules: any[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return this.modelRouter.updateRoutingRules(rules)
  }

  async optimizeRouting(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Model manager not initialized')
    }

    return this.modelRouter.optimizeRouting()
  }

  private async executeRequest(routingResult: RoutingResult, request: ModelManagerRequest): Promise<any> {
    const providerId = routingResult.providerId
    const providerType = this.providerTypes.get(providerId)
    
    if (!providerType) {
      throw new Error(`Unknown provider type for ${providerId}`)
    }

    if (providerType === 'openai') {
      const provider = this.openAIProviders.get(providerId)
      if (!provider) {
        throw new Error(`OpenAI provider ${providerId} not found`)
      }

      switch (request.type) {
        case 'completion':
          return provider.generateCompletion(request.request)
        case 'chat':
          return provider.generateChatCompletion(request.request)
        case 'embedding':
          return provider.generateEmbeddings(request.request)
        default:
          throw new Error(`Unsupported request type: ${request.type}`)
      }
    } else if (providerType === 'anthropic') {
      const provider = this.anthropicProviders.get(providerId)
      if (!provider) {
        throw new Error(`Anthropic provider ${providerId} not found`)
      }

      switch (request.type) {
        case 'completion':
          return provider.generateCompletion(request.request)
        case 'chat':
          return provider.generateMessage(request.request)
        case 'embedding':
          return provider.generateEmbeddings(request.request)
        default:
          throw new Error(`Unsupported request type: ${request.type}`)
      }
    }

    throw new Error(`Unsupported provider type: ${providerType}`)
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): ModelManagerConfig | null {
    if (!this.initialized) {
      return null
    }

    const routerConfig = this.modelRouter.getConfig()
    return {
      defaultProvider: routerConfig.defaultProvider,
      enableLoadBalancing: routerConfig.enableLoadBalancing,
      enableCostOptimization: routerConfig.enableCostOptimization,
      enablePerformanceOptimization: routerConfig.enablePerformanceOptimization,
      maxRetries: routerConfig.maxRetries,
      timeout: routerConfig.timeout,
      fallbackEnabled: routerConfig.fallbackEnabled
    }
  }
}