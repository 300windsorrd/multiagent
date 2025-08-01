import { v4 as uuidv4 } from 'uuid'
import { DocumentResult, ChunkResult } from './RAGSystem'

export interface IContextManager {
  initialize(config: ContextManagerConfig): Promise<void>
  buildContext(query: string, documents: DocumentResult[], chunks: ChunkResult[], options?: ContextOptions): Promise<Context>
  addContextItem(item: ContextItem): Promise<string>
  removeContextItem(itemId: string): Promise<void>
  getContext(contextId: string): Promise<Context | null>
  updateContext(contextId: string, updates: Partial<Context>): Promise<void>
  clearContext(): Promise<void>
  getContextStats(): Promise<ContextStats>
  cleanup(): Promise<void>
}

export interface ContextManagerConfig {
  maxContextLength?: number
  maxDocuments?: number
  maxChunksPerDocument?: number
  relevanceThreshold?: number
  enableCompression?: boolean
  compressionRatio?: number
  enableDeduplication?: boolean
  enableRanking?: boolean
  rankingStrategy?: 'relevance' | 'recency' | 'diversity' | 'hybrid'
}

export interface ContextOptions {
  maxTokens?: number
  maxDocuments?: number
  maxChunksPerDocument?: number
  includeMetadata?: boolean
  compressionStrategy?: 'none' | 'truncate' | 'summarize' | 'extractive'
  deduplicationStrategy?: 'none' | 'exact' | 'semantic'
  rankingStrategy?: 'relevance' | 'recency' | 'diversity' | 'hybrid'
  customFilters?: ContextFilter[]
}

export interface ContextFilter {
  type: 'document' | 'chunk' | 'metadata'
  field: string
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than'
  value: any
}

export interface Context {
  id: string
  query: string
  items: ContextItem[]
  documents: ContextDocument[]
  chunks: ContextChunk[]
  metadata: ContextMetadata
  stats: ContextStats
  createdAt: Date
  updatedAt: Date
}

export interface ContextItem {
  id: string
  type: 'document' | 'chunk' | 'metadata'
  content: string
  metadata?: any
  relevanceScore: number
  position: number
  tokenCount: number
  sourceId?: string
}

export interface ContextDocument {
  id: string
  title: string
  content: string
  metadata?: any
  relevanceScore: number
  chunks: ContextChunk[]
  tokenCount: number
}

export interface ContextChunk {
  id: string
  documentId: string
  content: string
  metadata?: any
  relevanceScore: number
  position: number
  tokenCount: number
}

export interface ContextMetadata {
  totalTokens: number
  totalDocuments: number
  totalChunks: number
  compressionRatio: number
  deduplicationCount: number
  rankingStrategy: string
  filters: ContextFilter[]
  processingTime: number
}

export interface ContextStats {
  totalContexts: number
  averageContextSize: number
  averageTokensPerContext: number
  averageDocumentsPerContext: number
  averageChunksPerContext: number
  compressionRate: number
  deduplicationRate: number
  cacheHitRate: number
  lastUpdated: Date
}

export class ContextManager implements IContextManager {
  private config!: ContextManagerConfig
  private initialized = false
  private contexts: Map<string, Context> = new Map()
  private cache: Map<string, Context> = new Map()
  private cacheTTL = 300000 // 5 minutes cache TTL

  constructor(config?: ContextManagerConfig) {
    if (config) {
      this.config = config
    }
  }

  async initialize(config: ContextManagerConfig): Promise<void> {
    try {
      this.config = {
        maxContextLength: 4000,
        maxDocuments: 10,
        maxChunksPerDocument: 5,
        relevanceThreshold: 0.5,
        enableCompression: true,
        compressionRatio: 0.8,
        enableDeduplication: true,
        enableRanking: true,
        rankingStrategy: 'hybrid',
        ...config
      }

      this.initialized = true
      console.log('Context manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize context manager:', error)
      throw error
    }
  }

  async buildContext(query: string, documents: DocumentResult[], chunks: ChunkResult[], options: ContextOptions = {}): Promise<Context> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    const startTime = Date.now()
    const contextId = uuidv4()

    try {
      // Apply options
      const maxDocuments = options.maxDocuments || this.config.maxDocuments || 10
      const maxChunksPerDocument = options.maxChunksPerDocument || this.config.maxChunksPerDocument || 5
      const maxTokens = options.maxTokens || this.config.maxContextLength || 4000

      // Filter and rank documents
      let filteredDocuments = this.filterDocumentsByRelevance(documents, this.config.relevanceThreshold || 0.5)
      filteredDocuments = this.rankDocuments(filteredDocuments, options.rankingStrategy || this.config.rankingStrategy || 'hybrid')
      filteredDocuments = filteredDocuments.slice(0, maxDocuments)

      // Filter and rank chunks
      let filteredChunks = this.filterChunksByRelevance(chunks, this.config.relevanceThreshold || 0.5)
      filteredChunks = this.rankChunks(filteredChunks, options.rankingStrategy || this.config.rankingStrategy || 'hybrid')

      // Apply custom filters
      if (options.customFilters) {
        filteredDocuments = this.applyCustomFilters(filteredDocuments, options.customFilters)
        filteredChunks = this.applyCustomFiltersToChunks(filteredChunks, options.customFilters)
      }

      // Group chunks by document
      const chunksByDocument = new Map<string, ChunkResult[]>()
      for (const chunk of filteredChunks) {
        const documentId = chunk.document.id!
        if (!chunksByDocument.has(documentId)) {
          chunksByDocument.set(documentId, [])
        }
        chunksByDocument.get(documentId)!.push(chunk)
      }

      // Limit chunks per document
      for (const [documentId, docChunks] of chunksByDocument.entries()) {
        chunksByDocument.set(documentId, docChunks.slice(0, maxChunksPerDocument))
      }

      // Build context items
      const items: ContextItem[] = []
      const contextDocuments: ContextDocument[] = []
      const contextChunks: ContextChunk[] = []

      // Add documents to context
      for (const docResult of filteredDocuments) {
        const docChunks = chunksByDocument.get(docResult.document.id!) || []
        
        const contextDoc: ContextDocument = {
          id: docResult.document.id!,
          title: docResult.document.title,
          content: docResult.document.content,
          metadata: docResult.document.metadata,
          relevanceScore: docResult.relevanceScore,
          chunks: [],
          tokenCount: this.estimateTokens(docResult.document.content)
        }

        // Add chunks to context
        for (const chunkResult of docChunks) {
          const contextChunk: ContextChunk = {
            id: chunkResult.chunk.id,
            documentId: chunkResult.document.id!,
            content: chunkResult.chunk.content,
            metadata: chunkResult.chunk.metadata,
            relevanceScore: chunkResult.relevanceScore,
            position: chunkResult.position,
            tokenCount: this.estimateTokens(chunkResult.chunk.content)
          }

          contextChunks.push(contextChunk)
          contextDoc.chunks.push(contextChunk)

          items.push({
            id: uuidv4(),
            type: 'chunk',
            content: chunkResult.chunk.content,
            metadata: chunkResult.chunk.metadata,
            relevanceScore: chunkResult.relevanceScore,
            position: chunkResult.position,
            tokenCount: this.estimateTokens(chunkResult.chunk.content),
            sourceId: chunkResult.chunk.id
          })
        }

        contextDocuments.push(contextDoc)

        items.push({
          id: uuidv4(),
          type: 'document',
          content: docResult.document.content,
          metadata: docResult.document.metadata,
          relevanceScore: docResult.relevanceScore,
          position: 0,
          tokenCount: this.estimateTokens(docResult.document.content),
          sourceId: docResult.document.id
        })
      }

      // Apply deduplication if enabled
      let deduplicationCount = 0
      if (this.config.enableDeduplication || options.deduplicationStrategy !== 'none') {
        const deduplicationResult = this.deduplicateItems(items, options.deduplicationStrategy || 'semantic')
        items.length = 0
        items.push(...deduplicationResult.items)
        deduplicationCount = deduplicationResult.removedCount
      }

      // Apply compression if enabled
      let compressionRatio = 1.0
      if (this.config.enableCompression || options.compressionStrategy !== 'none') {
        const compressionResult = this.compressItems(items, options.compressionStrategy || 'truncate', maxTokens)
        items.length = 0
        items.push(...compressionResult.items)
        compressionRatio = compressionResult.ratio
      }

      // Calculate total tokens
      const totalTokens = items.reduce((sum, item) => sum + item.tokenCount, 0)

      // Build context metadata
      const metadata: ContextMetadata = {
        totalTokens,
        totalDocuments: contextDocuments.length,
        totalChunks: contextChunks.length,
        compressionRatio,
        deduplicationCount,
        rankingStrategy: options.rankingStrategy || this.config.rankingStrategy || 'hybrid',
        filters: options.customFilters || [],
        processingTime: Date.now() - startTime
      }

      // Build context stats
      const stats: ContextStats = {
        totalContexts: this.contexts.size + 1,
        averageContextSize: totalTokens,
        averageTokensPerContext: totalTokens,
        averageDocumentsPerContext: contextDocuments.length,
        averageChunksPerContext: contextChunks.length,
        compressionRate: 1 - compressionRatio,
        deduplicationRate: deduplicationCount / (items.length + deduplicationCount),
        cacheHitRate: 0.8, // Mock value
        lastUpdated: new Date()
      }

      // Create context
      const context: Context = {
        id: contextId,
        query,
        items,
        documents: contextDocuments,
        chunks: contextChunks,
        metadata,
        stats,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Store context
      this.contexts.set(contextId, context)

      // Cache context
      this.cache.set(contextId, context)

      console.log(`Context built successfully with ${totalTokens} tokens`)
      return context
    } catch (error) {
      console.error('Failed to build context:', error)
      throw error
    }
  }

  async addContextItem(item: ContextItem): Promise<string> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      const itemId = uuidv4()
      item.id = itemId

      // In a real implementation, you would add this item to an existing context
      // For now, we'll just return the item ID
      console.log(`Context item added with ID: ${itemId}`)
      return itemId
    } catch (error) {
      console.error('Failed to add context item:', error)
      throw error
    }
  }

  async removeContextItem(itemId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      // In a real implementation, you would remove this item from its context
      // For now, we'll just log the action
      console.log(`Context item removed with ID: ${itemId}`)
    } catch (error) {
      console.error('Failed to remove context item:', error)
      throw error
    }
  }

  async getContext(contextId: string): Promise<Context | null> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      // Check cache first
      const cachedContext = this.cache.get(contextId)
      if (cachedContext) {
        return cachedContext
      }

      // Get from storage
      const context = this.contexts.get(contextId)
      if (context) {
        this.cache.set(contextId, context)
        return context
      }

      return null
    } catch (error) {
      console.error(`Failed to get context ${contextId}:`, error)
      throw error
    }
  }

  async updateContext(contextId: string, updates: Partial<Context>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      const context = await this.getContext(contextId)
      if (!context) {
        throw new Error(`Context ${contextId} not found`)
      }

      // Update context
      Object.assign(context, updates, { updatedAt: new Date() })

      // Update cache
      this.cache.set(contextId, context)

      console.log(`Context ${contextId} updated successfully`)
    } catch (error) {
      console.error(`Failed to update context ${contextId}:`, error)
      throw error
    }
  }

  async clearContext(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      // Clear all contexts
      this.contexts.clear()
      this.cache.clear()

      console.log('All contexts cleared successfully')
    } catch (error) {
      console.error('Failed to clear contexts:', error)
      throw error
    }
  }

  async getContextStats(): Promise<ContextStats> {
    if (!this.initialized) {
      throw new Error('Context manager not initialized')
    }

    try {
      const totalContexts = this.contexts.size
      const totalTokens = Array.from(this.contexts.values())
        .reduce((sum, context) => sum + context.metadata.totalTokens, 0)
      const totalDocuments = Array.from(this.contexts.values())
        .reduce((sum, context) => sum + context.metadata.totalDocuments, 0)
      const totalChunks = Array.from(this.contexts.values())
        .reduce((sum, context) => sum + context.metadata.totalChunks, 0)

      return {
        totalContexts,
        averageContextSize: totalContexts > 0 ? totalTokens / totalContexts : 0,
        averageTokensPerContext: totalContexts > 0 ? totalTokens / totalContexts : 0,
        averageDocumentsPerContext: totalContexts > 0 ? totalDocuments / totalContexts : 0,
        averageChunksPerContext: totalContexts > 0 ? totalChunks / totalContexts : 0,
        compressionRate: 0.2, // Mock value
        deduplicationRate: 0.1, // Mock value
        cacheHitRate: 0.8, // Mock value
        lastUpdated: new Date()
      }
    } catch (error) {
      console.error('Failed to get context stats:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clear all data
      this.contexts.clear()
      this.cache.clear()

      this.initialized = false
      console.log('Context manager cleaned up successfully')
    } catch (error) {
      console.error('Failed to cleanup context manager:', error)
      throw error
    }
  }

  private filterDocumentsByRelevance(documents: DocumentResult[], threshold: number): DocumentResult[] {
    return documents.filter(doc => doc.relevanceScore >= threshold)
  }

  private filterChunksByRelevance(chunks: ChunkResult[], threshold: number): ChunkResult[] {
    return chunks.filter(chunk => chunk.relevanceScore >= threshold)
  }

  private rankDocuments(documents: DocumentResult[], strategy: string): DocumentResult[] {
    const sorted = [...documents]

    switch (strategy) {
      case 'relevance':
        return sorted.sort((a, b) => b.relevanceScore - a.relevanceScore)
      case 'recency':
        return sorted.sort((a, b) => {
          const aDate = a.document.updatedAt || a.document.createdAt || new Date(0)
          const bDate = b.document.updatedAt || b.document.createdAt || new Date(0)
          return bDate.getTime() - aDate.getTime()
        })
      case 'diversity':
        return this.diversityRank(sorted)
      case 'hybrid':
      default:
        return this.hybridRank(sorted)
    }
  }

  private rankChunks(chunks: ChunkResult[], strategy: string): ChunkResult[] {
    const sorted = [...chunks]

    switch (strategy) {
      case 'relevance':
        return sorted.sort((a, b) => b.relevanceScore - a.relevanceScore)
      case 'recency':
        return sorted.sort((a, b) => b.position - a.position)
      case 'diversity':
        return this.diversityRankChunks(sorted)
      case 'hybrid':
      default:
        return this.hybridRankChunks(sorted)
    }
  }

  private diversityRank(documents: DocumentResult[]): DocumentResult[] {
    // Simple diversity ranking - maximize content diversity
    const ranked: DocumentResult[] = []
    const remaining = [...documents]

    while (remaining.length > 0) {
      // Select the document with highest relevance
      const best = remaining.reduce((max, doc) => 
        doc.relevanceScore > max.relevanceScore ? doc : max
      )
      ranked.push(best)
      remaining.splice(remaining.indexOf(best), 1)

      // Remove similar documents
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (this.calculateSimilarity(best.document.content, remaining[i].document.content) > 0.8) {
          remaining.splice(i, 1)
        }
      }
    }

    return ranked
  }

  private diversityRankChunks(chunks: ChunkResult[]): ChunkResult[] {
    // Simple diversity ranking for chunks
    const ranked: ChunkResult[] = []
    const remaining = [...chunks]

    while (remaining.length > 0) {
      // Select the chunk with highest relevance
      const best = remaining.reduce((max, chunk) => 
        chunk.relevanceScore > max.relevanceScore ? chunk : max
      )
      ranked.push(best)
      remaining.splice(remaining.indexOf(best), 1)

      // Remove similar chunks
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (this.calculateSimilarity(best.chunk.content, remaining[i].chunk.content) > 0.8) {
          remaining.splice(i, 1)
        }
      }
    }

    return ranked
  }

  private hybridRank(documents: DocumentResult[]): DocumentResult[] {
    // Hybrid ranking combining relevance, recency, and diversity
    return documents.map(doc => ({
      ...doc,
      relevanceScore: doc.relevanceScore * 0.6 + this.getRecencyScore(doc) * 0.3 + this.getDiversityScore(doc, documents) * 0.1
    })).sort((a, b) => b.relevanceScore - a.relevanceScore)
  }

  private hybridRankChunks(chunks: ChunkResult[]): ChunkResult[] {
    // Hybrid ranking for chunks
    return chunks.map(chunk => ({
      ...chunk,
      relevanceScore: chunk.relevanceScore * 0.7 + this.getPositionScore(chunk) * 0.3
    })).sort((a, b) => b.relevanceScore - a.relevanceScore)
  }

  private getRecencyScore(doc: DocumentResult): number {
    const date = doc.document.updatedAt || doc.document.createdAt || new Date(0)
    const daysSinceUpdate = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, 1 - daysSinceUpdate / 365) // Decay over a year
  }

  private getPositionScore(chunk: ChunkResult): number {
    // Earlier positions get higher scores
    return Math.max(0, 1 - chunk.position / 1000)
  }

  private getDiversityScore(doc: DocumentResult, allDocuments: DocumentResult[]): number {
    // Calculate how different this document is from others
    const similarities = allDocuments
      .filter(other => other.document.id !== doc.document.id)
      .map(other => this.calculateSimilarity(doc.document.content, other.document.content))
    
    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
    return 1 - avgSimilarity
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation based on word overlap
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(word => words2.has(word)))
    const union = new Set([...words1, ...words2])
    
    return intersection.size / union.size
  }

  private applyCustomFilters(documents: DocumentResult[], filters: ContextFilter[]): DocumentResult[] {
    return documents.filter(doc => {
      return filters.every(filter => this.applyFilter(doc.document, filter))
    })
  }

  private applyCustomFiltersToChunks(chunks: ChunkResult[], filters: ContextFilter[]): ChunkResult[] {
    return chunks.filter(chunk => {
      return filters.every(filter => this.applyFilter(chunk.chunk, filter))
    })
  }

  private applyFilter(item: any, filter: ContextFilter): boolean {
    const value = this.getNestedValue(item, filter.field)
    
    switch (filter.operator) {
      case 'equals':
        return value === filter.value
      case 'contains':
        return typeof value === 'string' && value.includes(filter.value)
      case 'starts_with':
        return typeof value === 'string' && value.startsWith(filter.value)
      case 'ends_with':
        return typeof value === 'string' && value.endsWith(filter.value)
      case 'greater_than':
        return typeof value === 'number' && value > filter.value
      case 'less_than':
        return typeof value === 'number' && value < filter.value
      default:
        return true
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  private deduplicateItems(items: ContextItem[], strategy: string): { items: ContextItem[], removedCount: number } {
    if (strategy === 'none') {
      return { items, removedCount: 0 }
    }

    const uniqueItems: ContextItem[] = []
    const seen = new Set<string>()
    let removedCount = 0

    for (const item of items) {
      const key = strategy === 'exact' ? item.content : this.generateSemanticKey(item.content)
      
      if (!seen.has(key)) {
        seen.add(key)
        uniqueItems.push(item)
      } else {
        removedCount++
      }
    }

    return { items: uniqueItems, removedCount }
  }

  private generateSemanticKey(text: string): string {
    // Simple semantic key generation (in real implementation, use embeddings)
    return text.toLowerCase().replace(/\s+/g, ' ').trim()
  }

  private compressItems(items: ContextItem[], strategy: string, maxTokens: number): { items: ContextItem[], ratio: number } {
    if (strategy === 'none') {
      return { items, ratio: 1.0 }
    }

    const totalTokens = items.reduce((sum, item) => sum + item.tokenCount, 0)
    
    if (totalTokens <= maxTokens) {
      return { items, ratio: 1.0 }
    }

    switch (strategy) {
      case 'truncate':
        return this.truncateItems(items, maxTokens)
      case 'summarize':
        return this.summarizeItems(items, maxTokens)
      case 'extractive':
        return this.extractiveCompressItems(items, maxTokens)
      default:
        return this.truncateItems(items, maxTokens)
    }
  }

  private truncateItems(items: ContextItem[], maxTokens: number): { items: ContextItem[], ratio: number } {
    const result: ContextItem[] = []
    let currentTokens = 0

    for (const item of items) {
      if (currentTokens + item.tokenCount <= maxTokens) {
        result.push(item)
        currentTokens += item.tokenCount
      } else {
        // Truncate the last item
        const remainingTokens = maxTokens - currentTokens
        if (remainingTokens > 0) {
          const truncatedContent = this.truncateText(item.content, remainingTokens)
          result.push({
            ...item,
            content: truncatedContent,
            tokenCount: remainingTokens
          })
        }
        break
      }
    }

    const originalTokens = items.reduce((sum, item) => sum + item.tokenCount, 0)
    const ratio = result.reduce((sum, item) => sum + item.tokenCount, 0) / originalTokens

    return { items: result, ratio }
  }

  private summarizeItems(items: ContextItem[], maxTokens: number): { items: ContextItem[], ratio: number } {
    // Mock summarization - in real implementation, use LLM
    const result: ContextItem[] = []
    let currentTokens = 0

    for (const item of items) {
      if (currentTokens >= maxTokens) break

      const targetTokens = Math.min(item.tokenCount, maxTokens - currentTokens)
      const summaryLength = Math.floor(targetTokens * 0.7) // Summarize to 70% of original
      
      const summary = this.generateSummary(item.content, summaryLength)
      const summaryItem: ContextItem = {
        ...item,
        content: summary,
        tokenCount: this.estimateTokens(summary)
      }

      result.push(summaryItem)
      currentTokens += summaryItem.tokenCount
    }

    const originalTokens = items.reduce((sum, item) => sum + item.tokenCount, 0)
    const ratio = result.reduce((sum, item) => sum + item.tokenCount, 0) / originalTokens

    return { items: result, ratio }
  }

  private extractiveCompressItems(items: ContextItem[], maxTokens: number): { items: ContextItem[], ratio: number } {
    // Mock extractive compression - in real implementation, use more sophisticated methods
    const result: ContextItem[] = []
    let currentTokens = 0

    for (const item of items) {
      if (currentTokens >= maxTokens) break

      const sentences = item.content.split('. ')
      const importantSentences = sentences.slice(0, Math.ceil(sentences.length * 0.6)) // Keep 60% of sentences
      
      const compressedContent = importantSentences.join('. ') + (sentences.length > importantSentences.length ? '.' : '')
      const compressedItem: ContextItem = {
        ...item,
        content: compressedContent,
        tokenCount: this.estimateTokens(compressedContent)
      }

      if (currentTokens + compressedItem.tokenCount <= maxTokens) {
        result.push(compressedItem)
        currentTokens += compressedItem.tokenCount
      } else {
        // Truncate if needed
        const remainingTokens = maxTokens - currentTokens
        if (remainingTokens > 0) {
          const truncatedContent = this.truncateText(compressedContent, remainingTokens)
          result.push({
            ...compressedItem,
            content: truncatedContent,
            tokenCount: remainingTokens
          })
        }
        break
      }
    }

    const originalTokens = items.reduce((sum, item) => sum + item.tokenCount, 0)
    const ratio = result.reduce((sum, item) => sum + item.tokenCount, 0) / originalTokens

    return { items: result, ratio }
  }

  private truncateText(text: string, maxTokens: number): string {
    const words = text.split(' ')
    const truncatedWords = words.slice(0, maxTokens)
    return truncatedWords.join(' ')
  }

  private generateSummary(text: string, targetTokens: number): string {
    // Mock summary generation
    const sentences = text.split('. ')
    const summaryLength = Math.ceil(sentences.length * 0.7)
    const summary = sentences.slice(0, summaryLength).join('. ') + (sentences.length > summaryLength ? '.' : '')
    return summary
  }

  private estimateTokens(text: string): number {
    // Simple token estimation
    return Math.ceil(text.length / 4)
  }
}