import { v4 as uuidv4 } from 'uuid'
import { ILLMProvider } from './ModelRouter'

export interface IAnthropicProvider extends ILLMProvider {
  generateCompletion(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse>
  generateMessage(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse>
  generateEmbeddings(request: AnthropicEmbeddingRequest): Promise<AnthropicEmbeddingResponse>
  getModelInfo(modelId: string): Promise<AnthropicModel | null>
  getUsageStats(): Promise<AnthropicUsageStats>
}

export interface AnthropicConfig {
  apiKey: string
  baseURL?: string
  timeout?: number
  maxRetries?: number
  defaultModel?: string
  defaultMaxTokens?: number
  defaultTemperature?: number
  version?: string
}

export interface AnthropicCompletionRequest {
  model?: string
  prompt: string
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  topP?: number
  topK?: number
  metadata?: any
  requestId?: string
}

export interface AnthropicCompletionResponse {
  id: string
  type: string
  completion: string
  stopReason: string | null
  model: string
  log_id: string
  usage: AnthropicTokenUsage
}

export interface AnthropicMessageRequest {
  model?: string
  messages: AnthropicMessage[]
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  topP?: number
  topK?: number
  metadata?: any
  requestId?: string
  stream?: boolean
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnthropicMessageResponse {
  id: string
  type: string
  role: 'assistant'
  content: AnthropicContent[]
  stopReason: string | null
  model: string
  log_id: string
  usage: AnthropicTokenUsage
}

export interface AnthropicContent {
  type: 'text'
  text: string
}

export interface AnthropicEmbeddingRequest {
  model?: string
  input: string | string[]
  requestId?: string
}

export interface AnthropicEmbeddingResponse {
  id: string
  type: string
  model: string
  embeddings: number[][]
  usage: AnthropicTokenUsage
}

export interface AnthropicTokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface AnthropicModel {
  id: string
  object: string
  created: number
  ownedBy: string
  permission: any[]
  root: string
  parent: string | null
  maxTokens: number
  capabilities: ModelCapabilities
}

export interface ModelCapabilities {
  streaming: boolean
  chat: boolean
  completion: boolean
  embeddings: boolean
  vision: boolean
}

export interface AnthropicUsageStats {
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  averageResponseTime: number
  errorRate: number
  modelUsage: Record<string, AnthropicModelUsage>
}

export interface AnthropicModelUsage {
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  averageResponseTime: number
  errors: number
}

export class AnthropicProvider implements IAnthropicProvider {
  private config: AnthropicConfig | null = null
  private initialized = false
  private usageStats: AnthropicUsageStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    averageResponseTime: 0,
    errorRate: 0,
    modelUsage: {}
  }
  private activeRequests: Map<string, AbortController> = new Map()

  async initialize(config: AnthropicConfig): Promise<void> {
    try {
      this.config = config
      
      // Validate configuration
      if (!config.apiKey) {
        throw new Error('Anthropic API key is required')
      }

      // Set default values
      this.config = {
        timeout: 30000,
        maxRetries: 3,
        defaultModel: 'claude-3-sonnet-20240229',
        defaultMaxTokens: 1000,
        defaultTemperature: 0.7,
        version: '2023-06-01',
        ...config
      }

      this.initialized = true
      console.log('Anthropic provider initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Anthropic provider:', error)
      throw error
    }
  }

  async generateCompletion(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('Anthropic provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: AnthropicCompletionRequest = {
        model: request.model || this.config.defaultModel,
        maxTokens: request.maxTokens ?? this.config.defaultMaxTokens,
        temperature: request.temperature ?? this.config.defaultTemperature,
        ...request
      }

      // Create abort controller for this request
      const abortController = new AbortController()
      this.activeRequests.set(requestId, abortController)

      // Make API request
      const response = await this.makeAPIRequest('/completions', finalRequest, abortController.signal)

      // Update usage stats
      const responseTime = Date.now() - startTime
      this.updateUsageStats(finalRequest.model || 'unknown', response, responseTime, true)

      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      this.updateUsageStats(request.model || 'unknown', null, responseTime, false)
      throw error
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  async generateMessage(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('Anthropic provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: AnthropicMessageRequest = {
        model: request.model || this.config.defaultModel,
        maxTokens: request.maxTokens ?? this.config.defaultMaxTokens,
        temperature: request.temperature ?? this.config.defaultTemperature,
        ...request
      }

      // Create abort controller for this request
      const abortController = new AbortController()
      this.activeRequests.set(requestId, abortController)

      // Make API request
      const response = await this.makeAPIRequest('/messages', finalRequest, abortController.signal)

      // Update usage stats
      const responseTime = Date.now() - startTime
      this.updateUsageStats(finalRequest.model || 'unknown', response, responseTime, true)

      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      this.updateUsageStats(request.model || 'unknown', null, responseTime, false)
      throw error
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  async generateEmbeddings(request: AnthropicEmbeddingRequest): Promise<AnthropicEmbeddingResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('Anthropic provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: AnthropicEmbeddingRequest = {
        model: request.model || 'claude-3-sonnet-20240229',
        ...request
      }

      // Create abort controller for this request
      const abortController = new AbortController()
      this.activeRequests.set(requestId, abortController)

      // Make API request
      const response = await this.makeAPIRequest('/embeddings', finalRequest, abortController.signal)

      // Update usage stats
      const responseTime = Date.now() - startTime
      this.updateUsageStats(finalRequest.model || 'unknown', response, responseTime, true)

      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      this.updateUsageStats(request.model || 'unknown', null, responseTime, false)
      throw error
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  async getModels(): Promise<AnthropicModel[]> {
    if (!this.initialized || !this.config) {
      throw new Error('Anthropic provider not initialized')
    }

    try {
      // For now, return hardcoded models as Anthropic doesn't have a models endpoint
      return [
        {
          id: 'claude-3-opus-20240229',
          object: 'model',
          created: 1677610602,
          ownedBy: 'anthropic',
          permission: [],
          root: 'claude-3-opus-20240229',
          parent: null,
          maxTokens: 200000,
          capabilities: {
            streaming: true,
            chat: true,
            completion: true,
            embeddings: false,
            vision: true
          }
        },
        {
          id: 'claude-3-sonnet-20240229',
          object: 'model',
          created: 1677610602,
          ownedBy: 'anthropic',
          permission: [],
          root: 'claude-3-sonnet-20240229',
          parent: null,
          maxTokens: 200000,
          capabilities: {
            streaming: true,
            chat: true,
            completion: true,
            embeddings: false,
            vision: true
          }
        },
        {
          id: 'claude-3-haiku-20240307',
          object: 'model',
          created: 1677610602,
          ownedBy: 'anthropic',
          permission: [],
          root: 'claude-3-haiku-20240307',
          parent: null,
          maxTokens: 200000,
          capabilities: {
            streaming: true,
            chat: true,
            completion: true,
            embeddings: false,
            vision: true
          }
        }
      ]
    } catch (error) {
      console.error('Failed to get models:', error)
      throw error
    }
  }

  async getModelInfo(modelId: string): Promise<AnthropicModel | null> {
    try {
      const models = await this.getModels()
      return models.find(model => model.id === modelId) || null
    } catch (error) {
      console.error(`Failed to get model info for ${modelId}:`, error)
      throw error
    }
  }

  async getUsageStats(): Promise<AnthropicUsageStats> {
    return { ...this.usageStats }
  }

  async cancelRequest(requestId: string): Promise<boolean> {
    try {
      const abortController = this.activeRequests.get(requestId)
      if (abortController) {
        abortController.abort()
        this.activeRequests.delete(requestId)
        return true
      }
      return false
    } catch (error) {
      console.error(`Failed to cancel request ${requestId}:`, error)
      return false
    }
  }

  private async makeAPIRequest(endpoint: string, data: any, signal: AbortSignal | null): Promise<any> {
    if (!this.config) {
      throw new Error('Anthropic provider not configured')
    }

    const baseURL = this.config.baseURL || 'https://api.anthropic.com/v1'
    const url = `${baseURL}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': this.config.version || '2023-06-01'
    }

    const options: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal
    }

    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`)
      }

      return await response.json()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request cancelled')
      }
      throw error
    }
  }

  private updateUsageStats(modelId: string, response: any, responseTime: number, success: boolean): void {
    this.usageStats.totalRequests++

    if (success && response && response.usage) {
      const usage = response.usage
      this.usageStats.totalTokens += usage.inputTokens + usage.outputTokens
      this.usageStats.totalInputTokens += usage.inputTokens
      this.usageStats.totalOutputTokens += usage.outputTokens

      // Update model-specific usage
      if (!this.usageStats.modelUsage[modelId]) {
        this.usageStats.modelUsage[modelId] = {
          requests: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          averageResponseTime: 0,
          errors: 0
        }
      }

      const modelUsage = this.usageStats.modelUsage[modelId]
      modelUsage.requests++
      modelUsage.tokens += usage.inputTokens + usage.outputTokens
      modelUsage.inputTokens += usage.inputTokens
      modelUsage.outputTokens += usage.outputTokens
      modelUsage.averageResponseTime = (modelUsage.averageResponseTime * (modelUsage.requests - 1) + responseTime) / modelUsage.requests
    } else if (!success) {
      // Update error stats
      if (!this.usageStats.modelUsage[modelId]) {
        this.usageStats.modelUsage[modelId] = {
          requests: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          averageResponseTime: 0,
          errors: 0
        }
      }

      this.usageStats.modelUsage[modelId].errors++
    }

    // Update overall average response time
    this.usageStats.averageResponseTime = (this.usageStats.averageResponseTime * (this.usageStats.totalRequests - 1) + responseTime) / this.usageStats.totalRequests

    // Update error rate
    const totalErrors = Object.values(this.usageStats.modelUsage).reduce((sum, usage) => sum + usage.errors, 0)
    this.usageStats.errorRate = (totalErrors / this.usageStats.totalRequests) * 100
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): AnthropicConfig | null {
    return this.config ? { ...this.config } : null
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size
  }

  resetUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      averageResponseTime: 0,
      errorRate: 0,
      modelUsage: {}
    }
  }
}