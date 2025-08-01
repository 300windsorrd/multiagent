import { v4 as uuidv4 } from 'uuid'

export interface IEmbeddingService {
  initialize(config: EmbeddingServiceConfig): Promise<void>
  generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]>
  generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<number[][]>
  generateEmbeddingBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingBatchResult>
  getEmbeddingModelInfo(): Promise<EmbeddingModelInfo>
  calculateSimilarity(embedding1: number[], embedding2: number[]): number
  findMostSimilar(queryEmbedding: number[], embeddings: number[][]): SimilarityResult[]
  validateEmbedding(embedding: number[]): boolean
  normalizeEmbedding(embedding: number[]): number[]
  cleanup(): Promise<void>
}

export interface EmbeddingServiceConfig {
  provider: 'openai' | 'anthropic' | 'cohere' | 'huggingface' | 'local'
  apiKey?: string
  model?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  batchSize?: number
  cacheSize?: number
  dimensions?: number
}

export interface EmbeddingOptions {
  model?: string
  dimensions?: number
  normalize?: boolean
  truncate?: boolean
  encodingFormat?: 'float' | 'base64'
  timeout?: number
  batchSize?: number
}

export interface EmbeddingBatchResult {
  embeddings: number[][]
  tokens: number[]
  processingTime: number
  model: string
  dimensions: number
  errors: EmbeddingError[]
}

export interface EmbeddingError {
  index: number
  text: string
  error: string
  retryable: boolean
}

export interface EmbeddingModelInfo {
  name: string
  dimensions: number
  maxTokens: number
  provider: string
  pricing: {
    input: number
    output: number
  }
  capabilities: {
    multilingual: boolean
    streaming: boolean
    batching: boolean
    customDimensions: boolean
  }
  languages: string[]
  createdAt: Date
  lastUpdated: Date
}

export interface SimilarityResult {
  index: number
  similarity: number
  distance: number
}

export class EmbeddingService implements IEmbeddingService {
  private config!: EmbeddingServiceConfig
  private initialized = false
  private modelInfo!: EmbeddingModelInfo
  private cache: Map<string, number[]> = new Map()
  private cacheTTL = 3600000 // 1 hour cache TTL

  constructor(config?: EmbeddingServiceConfig) {
    if (config) {
      this.config = config
    }
  }

  async initialize(config: EmbeddingServiceConfig): Promise<void> {
    try {
      this.config = {
        ...config,
        model: config.model || 'text-embedding-ada-002',
        timeout: config.timeout || 30000,
        maxRetries: config.maxRetries || 3,
        batchSize: config.batchSize || 100,
        cacheSize: config.cacheSize || 10000,
        dimensions: config.dimensions || 1536
      }

      // Initialize provider-specific client
      await this.initializeProvider()

      // Get model information
      this.modelInfo = await this.getModelInfo()

      this.initialized = true
      console.log(`Embedding service initialized with provider: ${this.config.provider}, model: ${this.config.model}`)
    } catch (error) {
      console.error('Failed to initialize embedding service:', error)
      throw error
    }
  }

  async generateEmbedding(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized')
    }

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(text, options)
      const cachedEmbedding = this.cache.get(cacheKey)
      if (cachedEmbedding) {
        return cachedEmbedding
      }

      // Generate embedding based on provider
      const embedding = await this.generateProviderEmbedding(text, options)

      // Apply normalization if requested
      const finalEmbedding = options.normalize !== false ? this.normalizeEmbedding(embedding) : embedding

      // Cache the result
      this.cache.set(cacheKey, finalEmbedding)

      return finalEmbedding
    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw error
    }
  }

  async generateEmbeddings(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized')
    }

    try {
      const embeddings: number[][] = []
      const batchSize = options.batchSize || this.config.batchSize || 100

      // Process in batches
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const batchEmbeddings = await this.generateEmbeddingBatch(batch, options)
        embeddings.push(...batchEmbeddings.embeddings)
      }

      return embeddings
    } catch (error) {
      console.error('Failed to generate embeddings:', error)
      throw error
    }
  }

  async generateEmbeddingBatch(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingBatchResult> {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized')
    }

    const startTime = Date.now()
    const embeddings: number[][] = []
    const tokens: number[] = []
    const errors: EmbeddingError[] = []

    try {
      // Check cache for each text
      const uncachedTexts: string[] = []
      const uncachedIndices: number[] = []

      texts.forEach((text, index) => {
        const cacheKey = this.generateCacheKey(text, options)
        const cachedEmbedding = this.cache.get(cacheKey)
        
        if (cachedEmbedding) {
          embeddings[index] = cachedEmbedding
          tokens[index] = this.estimateTokens(text)
        } else {
          uncachedTexts.push(text)
          uncachedIndices.push(index)
        }
      })

      // Generate embeddings for uncached texts
      if (uncachedTexts.length > 0) {
        const batchResult = await this.generateProviderEmbeddingBatch(uncachedTexts, options)
        
        // Place results in correct positions
        uncachedIndices.forEach((originalIndex, batchIndex) => {
          if (batchIndex < batchResult.embeddings.length) {
            const embedding = batchResult.embeddings[batchIndex]
            const finalEmbedding = options.normalize !== false ? this.normalizeEmbedding(embedding) : embedding
            
            embeddings[originalIndex] = finalEmbedding
            tokens[originalIndex] = batchResult.tokens[batchIndex]
            
            // Cache the result
            const cacheKey = this.generateCacheKey(uncachedTexts[batchIndex], options)
            this.cache.set(cacheKey, finalEmbedding)
          }
        })

        // Add any errors
        errors.push(...batchResult.errors.map((error, index) => ({
          index: uncachedIndices[index],
          text: uncachedTexts[index],
          error: error.error,
          retryable: error.retryable
        })))
      }

      const processingTime = Date.now() - startTime

      return {
        embeddings,
        tokens,
        processingTime,
        model: options.model || this.config.model || 'text-embedding-ada-002',
        dimensions: options.dimensions || this.config.dimensions || 1536,
        errors
      }
    } catch (error) {
      console.error('Failed to generate embedding batch:', error)
      throw error
    }
  }

  async getEmbeddingModelInfo(): Promise<EmbeddingModelInfo> {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized')
    }

    try {
      return { ...this.modelInfo }
    } catch (error) {
      console.error('Failed to get embedding model info:', error)
      throw error
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions')
    }

    // Calculate cosine similarity
    const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0)
    const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0))
    const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0))

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0
    }

    return dotProduct / (magnitude1 * magnitude2)
  }

  findMostSimilar(queryEmbedding: number[], embeddings: number[][]): SimilarityResult[] {
    const results: SimilarityResult[] = []

    embeddings.forEach((embedding, index) => {
      const similarity = this.calculateSimilarity(queryEmbedding, embedding)
      const distance = 1 - similarity // Convert similarity to distance

      results.push({
        index,
        similarity,
        distance
      })
    })

    // Sort by similarity (descending)
    return results.sort((a, b) => b.similarity - a.similarity)
  }

  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return false
    }

    // Check if all elements are numbers
    if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
      return false
    }

    // Check if embedding has the expected dimensions
    if (this.config.dimensions && embedding.length !== this.config.dimensions) {
      return false
    }

    return true
  }

  normalizeEmbedding(embedding: number[]): number[] {
    if (!this.validateEmbedding(embedding)) {
      throw new Error('Invalid embedding')
    }

    // Calculate magnitude
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))

    if (magnitude === 0) {
      return embedding
    }

    // Normalize by dividing by magnitude
    return embedding.map(val => val / magnitude)
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clear cache
      this.cache.clear()
      
      // Cleanup provider-specific resources
      await this.cleanupProvider()

      this.initialized = false
      console.log('Embedding service cleaned up successfully')
    } catch (error) {
      console.error('Failed to cleanup embedding service:', error)
      throw error
    }
  }

  private generateCacheKey(text: string, options: EmbeddingOptions): string {
    const model = options.model || this.config.model || 'text-embedding-ada-002'
    const dimensions = options.dimensions || this.config.dimensions || 1536
    const normalize = options.normalize !== false
    
    return `${model}:${dimensions}:${normalize}:${text}`
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (rough approximation)
    // In a real implementation, you would use a proper tokenizer
    return Math.ceil(text.length / 4)
  }

  // Provider-specific methods (to be implemented by provider-specific classes)
  private async initializeProvider(): Promise<void> {
    // This will be implemented by provider-specific classes
    console.log(`Initializing ${this.config.provider} embedding provider`)
  }

  private async generateProviderEmbedding(text: string, options: EmbeddingOptions): Promise<number[]> {
    // This will be implemented by provider-specific classes
    // For now, return a mock embedding
    const dimensions = options.dimensions || this.config.dimensions || 1536
    return Array.from({ length: dimensions }, () => Math.random() * 2 - 1)
  }

  private async generateProviderEmbeddingBatch(texts: string[], options: EmbeddingOptions): Promise<EmbeddingBatchResult> {
    // This will be implemented by provider-specific classes
    // For now, return mock results
    const dimensions = options.dimensions || this.config.dimensions || 1536
    const embeddings = texts.map(() => 
      Array.from({ length: dimensions }, () => Math.random() * 2 - 1)
    )
    const tokens = texts.map(text => this.estimateTokens(text))
    
    return {
      embeddings,
      tokens,
      processingTime: 100,
      model: options.model || this.config.model || 'text-embedding-ada-002',
      dimensions,
      errors: []
    }
  }

  private async getModelInfo(): Promise<EmbeddingModelInfo> {
    // This will be implemented by provider-specific classes
    // For now, return mock model info
    return {
      name: this.config.model || 'text-embedding-ada-002',
      dimensions: this.config.dimensions || 1536,
      maxTokens: 8192,
      provider: this.config.provider,
      pricing: {
        input: 0.0001,
        output: 0.0001
      },
      capabilities: {
        multilingual: true,
        streaming: false,
        batching: true,
        customDimensions: false
      },
      languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
      createdAt: new Date(),
      lastUpdated: new Date()
    }
  }

  private async cleanupProvider(): Promise<void> {
    // This will be implemented by provider-specific classes
    console.log('Cleaning up provider resources')
  }
}
