import { v4 as uuidv4 } from 'uuid'

export interface IOpenAIProvider {
  initialize(config: OpenAIConfig): Promise<void>
  generateCompletion(request: CompletionRequest): Promise<CompletionResponse>
  generateChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
  generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>
  getModels(): Promise<Model[]>
  getModelInfo(modelId: string): Promise<Model | null>
  getUsageStats(): Promise<UsageStats>
  cancelRequest(requestId: string): Promise<boolean>
}

export interface OpenAIConfig {
  apiKey: string
  organization?: string
  baseURL?: string
  timeout?: number
  maxRetries?: number
  defaultModel?: string
  defaultTemperature?: number
  defaultMaxTokens?: number
}

export interface CompletionRequest {
  model?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string | string[]
  logitBias?: Record<string, number>
  user?: string
  requestId?: string
}

export interface CompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: CompletionChoice[]
  usage: TokenUsage
}

export interface CompletionChoice {
  text: string
  index: number
  logprobs: any | null
  finishReason: string
}

export interface ChatCompletionRequest {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string | string[]
  logitBias?: Record<string, number>
  user?: string
  requestId?: string
  stream?: boolean
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage: TokenUsage
}

export interface ChatCompletionChoice {
  index: number
  message: ChatMessage
  finishReason: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function'
  content: string
  name?: string
  functionCall?: any
}

export interface EmbeddingRequest {
  model?: string
  input: string | string[]
  user?: string
  requestId?: string
}

export interface EmbeddingResponse {
  id: string
  object: string
  model: string
  data: EmbeddingData[]
  usage: TokenUsage
}

export interface EmbeddingData {
  index: number
  object: string
  embedding: number[]
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface Model {
  id: string
  object: string
  created: number
  ownedBy: string
  permission: any[]
  root: string
  parent: string | null
}

export interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  averageResponseTime: number
  errorRate: number
  modelUsage: Record<string, ModelUsage>
}

export interface ModelUsage {
  requests: number
  tokens: number
  promptTokens: number
  completionTokens: number
  averageResponseTime: number
  errors: number
}

export class OpenAIProvider implements IOpenAIProvider {
  private config: OpenAIConfig | null = null
  private initialized = false
  private usageStats: UsageStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    averageResponseTime: 0,
    errorRate: 0,
    modelUsage: {}
  }
  private activeRequests: Map<string, AbortController> = new Map()

  async initialize(config: OpenAIConfig): Promise<void> {
    try {
      this.config = config
      
      // Validate configuration
      if (!config.apiKey) {
        throw new Error('OpenAI API key is required')
      }

      // Set default values
      this.config = {
        timeout: 30000,
        maxRetries: 3,
        defaultModel: 'gpt-3.5-turbo',
        defaultTemperature: 0.7,
        defaultMaxTokens: 1000,
        ...config
      }

      this.initialized = true
      console.log('OpenAI provider initialized successfully')
    } catch (error) {
      console.error('Failed to initialize OpenAI provider:', error)
      throw error
    }
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('OpenAI provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: CompletionRequest = {
        model: request.model || this.config.defaultModel,
        temperature: request.temperature ?? this.config.defaultTemperature,
        maxTokens: request.maxTokens ?? this.config.defaultMaxTokens,
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

  async generateChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('OpenAI provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: ChatCompletionRequest = {
        model: request.model || this.config.defaultModel,
        temperature: request.temperature ?? this.config.defaultTemperature,
        maxTokens: request.maxTokens ?? this.config.defaultMaxTokens,
        ...request
      }

      // Create abort controller for this request
      const abortController = new AbortController()
      this.activeRequests.set(requestId, abortController)

      // Make API request
      const response = await this.makeAPIRequest('/chat/completions', finalRequest, abortController.signal)

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

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.initialized || !this.config) {
      throw new Error('OpenAI provider not initialized')
    }

    const requestId = request.requestId || uuidv4()
    const startTime = Date.now()

    try {
      // Apply defaults
      const finalRequest: EmbeddingRequest = {
        model: request.model || 'text-embedding-ada-002',
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

  async getModels(): Promise<Model[]> {
    if (!this.initialized || !this.config) {
      throw new Error('OpenAI provider not initialized')
    }

    try {
      const response = await this.makeAPIRequest('/models', {}, null)
      return response.data
    } catch (error) {
      console.error('Failed to get models:', error)
      throw error
    }
  }

  async getModelInfo(modelId: string): Promise<Model | null> {
    try {
      const models = await this.getModels()
      return models.find(model => model.id === modelId) || null
    } catch (error) {
      console.error(`Failed to get model info for ${modelId}:`, error)
      throw error
    }
  }

  async getUsageStats(): Promise<UsageStats> {
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
      throw new Error('OpenAI provider not configured')
    }

    const baseURL = this.config.baseURL || 'https://api.openai.com/v1'
    const url = `${baseURL}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization
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
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`)
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
      this.usageStats.totalTokens += usage.totalTokens
      this.usageStats.totalPromptTokens += usage.promptTokens
      this.usageStats.totalCompletionTokens += usage.completionTokens

      // Update model-specific usage
      if (!this.usageStats.modelUsage[modelId]) {
        this.usageStats.modelUsage[modelId] = {
          requests: 0,
          tokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          averageResponseTime: 0,
          errors: 0
        }
      }

      const modelUsage = this.usageStats.modelUsage[modelId]
      modelUsage.requests++
      modelUsage.tokens += usage.totalTokens
      modelUsage.promptTokens += usage.promptTokens
      modelUsage.completionTokens += usage.completionTokens
      modelUsage.averageResponseTime = (modelUsage.averageResponseTime * (modelUsage.requests - 1) + responseTime) / modelUsage.requests
    } else if (!success) {
      // Update error stats
      if (!this.usageStats.modelUsage[modelId]) {
        this.usageStats.modelUsage[modelId] = {
          requests: 0,
          tokens: 0,
          promptTokens: 0,
          completionTokens: 0,
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

  getConfig(): OpenAIConfig | null {
    return this.config ? { ...this.config } : null
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size
  }

  resetUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      averageResponseTime: 0,
      errorRate: 0,
      modelUsage: {}
    }
  }
}