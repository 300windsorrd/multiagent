import { v4 as uuidv4 } from 'uuid'
import { IVectorDB, QueryOptions, QueryResult } from './VectorDB'
import { IEmbeddingService, EmbeddingOptions } from './EmbeddingService'

export interface ISemanticSearch {
  initialize(config: SemanticSearchConfig): Promise<void>
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  searchWithFilters(query: string, filters: SearchFilter[], options?: SearchOptions): Promise<SearchResult[]>
  findSimilar(content: string, options?: SimilarityOptions): Promise<SearchResult[]>
  hybridSearch(query: string, options?: HybridSearchOptions): Promise<HybridSearchResult>
  getSearchStats(): Promise<SearchStats>
  buildIndex(documents: Document[]): Promise<void>
  addToIndex(document: Document): Promise<string>
  updateIndex(documentId: string, document: Document): Promise<void>
  removeFromIndex(documentId: string): Promise<void>
  optimizeIndex(): Promise<void>
  cleanup(): Promise<void>
}

export interface SemanticSearchConfig {
  vectorDB: IVectorDB
  embeddingService: IEmbeddingService
  indexName: string
  defaultTopK?: number
  defaultScoreThreshold?: number
  enableHybridSearch?: boolean
  enableQueryExpansion?: boolean
  enableResultReranking?: boolean
  enableCaching?: boolean
  cacheSize?: number
  cacheTTL?: number
  queryExpansionModel?: string
  rerankingModel?: string
}

export interface SearchOptions extends QueryOptions {
  topK?: number
  scoreThreshold?: number
  includeVectors?: boolean
  includeMetadata?: boolean
  filter?: SearchFilter[]
  useQueryExpansion?: boolean
  useReranking?: boolean
  searchStrategy?: 'vector' | 'keyword' | 'hybrid'
  boostFields?: Record<string, number>
}

export interface SearchFilter {
  field: string
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'not_in' | 'greater_than' | 'less_than'
  value: any
}

export interface SimilarityOptions {
  topK?: number
  scoreThreshold?: number
  includeVectors?: boolean
  includeMetadata?: boolean
  filter?: SearchFilter[]
}

export interface HybridSearchOptions extends SearchOptions {
  keywordWeight?: number
  vectorWeight?: number
  fusionStrategy?: 'rank_fusion' | 'score_fusion' | 'reciprocal_rank_fusion'
}

export interface SearchResult {
  id: string
  score: number
  relevanceScore?: number
  vector?: number[]
  metadata?: Record<string, any>
  content?: string
  documentId?: string
  position?: number
  rank: number
  searchType: 'vector' | 'keyword' | 'hybrid'
}

export interface HybridSearchResult {
  query: string
  results: SearchResult[]
  vectorResults: SearchResult[]
  keywordResults: SearchResult[]
  fusionMethod: string
  processingTime: number
  totalResults: number
}

export interface Document {
  id: string
  content: string
  metadata?: Record<string, any>
  embedding?: number[]
  chunks?: DocumentChunk[]
}

export interface DocumentChunk {
  id: string
  documentId: string
  content: string
  embedding?: number[]
  metadata?: Record<string, any>
  position: number
  tokenCount: number
}

export interface SearchStats {
  totalSearches: number
  averageSearchTime: number
  averageResultsPerSearch: number
  cacheHitRate: number
  vectorSearchCount: number
  keywordSearchCount: number
  hybridSearchCount: number
  averageQueryExpansionTerms: number
  averageRerankingImprovement: number
  lastUpdated: Date
}

export class SemanticSearch implements ISemanticSearch {
  private config!: SemanticSearchConfig
  private initialized = false
  private searchCache: Map<string, SearchResult[]> = new Map()
  private searchStats: SearchStats = {
    totalSearches: 0,
    averageSearchTime: 0,
    averageResultsPerSearch: 0,
    cacheHitRate: 0,
    vectorSearchCount: 0,
    keywordSearchCount: 0,
    hybridSearchCount: 0,
    averageQueryExpansionTerms: 0,
    averageRerankingImprovement: 0,
    lastUpdated: new Date()
  }

  constructor(config?: SemanticSearchConfig) {
    if (config) {
      this.config = config
    }
  }

  async initialize(config: SemanticSearchConfig): Promise<void> {
    try {
      this.config = {
        defaultTopK: 10,
        defaultScoreThreshold: 0.7,
        enableHybridSearch: true,
        enableQueryExpansion: false,
        enableResultReranking: false,
        enableCaching: true,
        cacheSize: 1000,
        cacheTTL: 300000, // 5 minutes
        ...config
      }

      this.initialized = true
      console.log('Semantic search initialized successfully')
    } catch (error) {
      console.error('Failed to initialize semantic search:', error)
      throw error
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    const startTime = Date.now()
    const cacheKey = this.generateCacheKey(query, options)

    try {
      // Check cache first
      if (this.config.enableCaching) {
        const cachedResults = this.searchCache.get(cacheKey)
        if (cachedResults) {
          this.updateSearchStats('cache', Date.now() - startTime, cachedResults.length)
          return cachedResults
        }
      }

      // Generate query embedding
      const queryEmbedding = await this.config.embeddingService.generateEmbedding(query)

      // Perform vector search
      const vectorResults = await this.config.vectorDB.query(
        this.config.indexName,
        queryEmbedding,
        {
          topK: options.topK || this.config.defaultTopK || 10,
          includeValues: options.includeVectors || false,
          includeMetadata: options.includeMetadata || true,
          filter: this.convertFilters(options.filter)
        }
      )

      // Convert to search results
      let results: SearchResult[] = vectorResults.map((result, index) => ({
        id: result.id,
        score: result.score,
        relevanceScore: result.score,
        vector: result.vector,
        metadata: result.metadata,
        content: result.metadata?.content,
        documentId: result.metadata?.documentId,
        position: result.metadata?.position,
        rank: index + 1,
        searchType: 'vector'
      }))

      // Apply score threshold
      const scoreThreshold = options.scoreThreshold || this.config.defaultScoreThreshold || 0.7
      results = results.filter(result => result.score >= scoreThreshold)

      // Apply filters
      if (options.filter && options.filter.length > 0) {
        results = this.applyMetadataFilters(results, options.filter)
      }

      // Query expansion if enabled
      if (this.config.enableQueryExpansion || options.useQueryExpansion) {
        results = await this.expandQuery(query, results, options)
      }

      // Re-ranking if enabled
      if (this.config.enableResultReranking || options.useReranking) {
        results = await this.rerankResults(query, results, options)
      }

      // Apply field boosting
      if (options.boostFields) {
        results = this.applyFieldBoosting(results, options.boostFields)
      }

      // Update search stats
      this.updateSearchStats('vector', Date.now() - startTime, results.length)

      // Cache results
      if (this.config.enableCaching) {
        this.searchCache.set(cacheKey, results)
      }

      return results
    } catch (error) {
      console.error('Failed to perform semantic search:', error)
      throw error
    }
  }

  async searchWithFilters(query: string, filters: SearchFilter[], options: SearchOptions = {}): Promise<SearchResult[]> {
    return this.search(query, {
      ...options,
      filter: filters
    })
  }

  async findSimilar(content: string, options: SimilarityOptions = {}): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      // Generate content embedding
      const contentEmbedding = await this.config.embeddingService.generateEmbedding(content)

      // Perform similarity search
      const similarResults = await this.config.vectorDB.query(
        this.config.indexName,
        contentEmbedding,
        {
          topK: options.topK || this.config.defaultTopK || 10,
          includeValues: options.includeVectors || false,
          includeMetadata: options.includeMetadata || true,
          filter: this.convertFilters(options.filter)
        }
      )

      // Convert to search results
      const results: SearchResult[] = similarResults.map((result, index) => ({
        id: result.id,
        score: result.score,
        relevanceScore: result.score,
        vector: result.vector,
        metadata: result.metadata,
        content: result.metadata?.content,
        documentId: result.metadata?.documentId,
        position: result.metadata?.position,
        rank: index + 1,
        searchType: 'vector'
      }))

      // Apply score threshold
      const scoreThreshold = options.scoreThreshold || this.config.defaultScoreThreshold || 0.7
      return results.filter(result => result.score >= scoreThreshold)
    } catch (error) {
      console.error('Failed to find similar content:', error)
      throw error
    }
  }

  async hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<HybridSearchResult> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    const startTime = Date.now()

    try {
      const keywordWeight = options.keywordWeight || 0.3
      const vectorWeight = options.vectorWeight || 0.7
      const fusionMethod = options.fusionStrategy || 'score_fusion'

      // Perform vector search
      const vectorResults = await this.search(query, {
        ...options,
        searchStrategy: 'vector'
      })

      // Perform keyword search (mock implementation)
      const keywordResults = await this.keywordSearch(query, options)

      // Fuse results
      let fusedResults: SearchResult[] = []
      
      switch (fusionMethod) {
        case 'rank_fusion':
          fusedResults = this.rankFusion(vectorResults, keywordResults, vectorWeight, keywordWeight)
          break
        case 'score_fusion':
          fusedResults = this.scoreFusion(vectorResults, keywordResults, vectorWeight, keywordWeight)
          break
        case 'reciprocal_rank_fusion':
          fusedResults = this.reciprocalRankFusion(vectorResults, keywordResults, vectorWeight, keywordWeight)
          break
        default:
          fusedResults = this.scoreFusion(vectorResults, keywordResults, vectorWeight, keywordWeight)
      }

      // Re-rank fused results
      if (this.config.enableResultReranking || options.useReranking) {
        fusedResults = await this.rerankResults(query, fusedResults, options)
      }

      const processingTime = Date.now() - startTime

      // Update search stats
      this.updateSearchStats('hybrid', processingTime, fusedResults.length)

      return {
        query,
        results: fusedResults,
        vectorResults,
        keywordResults,
        fusionMethod,
        processingTime,
        totalResults: fusedResults.length
      }
    } catch (error) {
      console.error('Failed to perform hybrid search:', error)
      throw error
    }
  }

  async getSearchStats(): Promise<SearchStats> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    return { ...this.searchStats }
  }

  async buildIndex(documents: Document[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      console.log(`Building index with ${documents.length} documents`)

      // Generate embeddings for all documents
      const allChunks: DocumentChunk[] = []
      
      for (const document of documents) {
        if (document.chunks) {
          allChunks.push(...document.chunks)
        } else {
          // Split document into chunks if not already chunked
          const chunks = this.chunkDocument(document)
          allChunks.push(...chunks)
        }
      }

      // Generate embeddings for chunks
      const chunkContents = allChunks.map(chunk => chunk.content)
      const embeddings = await this.config.embeddingService.generateEmbeddings(chunkContents)

      // Add embeddings to chunks
      allChunks.forEach((chunk, index) => {
        chunk.embedding = embeddings[index]
      })

      // Prepare vector data
      const vectorData = allChunks.map(chunk => ({
        id: chunk.id,
        vector: chunk.embedding!,
        metadata: {
          documentId: chunk.documentId,
          content: chunk.content,
          position: chunk.position,
          tokenCount: chunk.tokenCount,
          ...chunk.metadata
        }
      }))

      // Upsert to vector database
      await this.config.vectorDB.upsert(this.config.indexName, vectorData)

      console.log(`Index built successfully with ${allChunks.length} chunks`)
    } catch (error) {
      console.error('Failed to build index:', error)
      throw error
    }
  }

  async addToIndex(document: Document): Promise<string> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      const documentId = document.id || uuidv4()
      
      // Chunk document if not already chunked
      const chunks = document.chunks || this.chunkDocument(document)

      // Generate embeddings for chunks
      const chunkContents = chunks.map(chunk => chunk.content)
      const embeddings = await this.config.embeddingService.generateEmbeddings(chunkContents)

      // Add embeddings to chunks
      chunks.forEach((chunk, index) => {
        chunk.embedding = embeddings[index]
        chunk.documentId = documentId
      })

      // Prepare vector data
      const vectorData = chunks.map(chunk => ({
        id: chunk.id,
        vector: chunk.embedding!,
        metadata: {
          documentId,
          content: chunk.content,
          position: chunk.position,
          tokenCount: chunk.tokenCount,
          ...chunk.metadata
        }
      }))

      // Upsert to vector database
      await this.config.vectorDB.upsert(this.config.indexName, vectorData)

      // Clear cache
      this.searchCache.clear()

      console.log(`Document ${documentId} added to index with ${chunks.length} chunks`)
      return documentId
    } catch (error) {
      console.error('Failed to add document to index:', error)
      throw error
    }
  }

  async updateIndex(documentId: string, document: Document): Promise<void> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      // Remove old document
      await this.removeFromIndex(documentId)

      // Add updated document
      document.id = documentId
      await this.addToIndex(document)

      console.log(`Document ${documentId} updated in index`)
    } catch (error) {
      console.error(`Failed to update document ${documentId} in index:`, error)
      throw error
    }
  }

  async removeFromIndex(documentId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      // Get all chunks for this document (mock implementation)
      // In a real implementation, you would query the vector database for chunks with this documentId
      const chunkIds = [`${documentId}_chunk_1`, `${documentId}_chunk_2`] // Mock chunk IDs

      // Delete from vector database
      await this.config.vectorDB.delete(this.config.indexName, chunkIds)

      // Clear cache
      this.searchCache.clear()

      console.log(`Document ${documentId} removed from index`)
    } catch (error) {
      console.error(`Failed to remove document ${documentId} from index:`, error)
      throw error
    }
  }

  async optimizeIndex(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Semantic search not initialized')
    }

    try {
      // Clear cache
      this.searchCache.clear()

      // In a real implementation, you would perform index optimization
      // such as compaction, reindexing, etc.
      console.log('Index optimized successfully')
    } catch (error) {
      console.error('Failed to optimize index:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clear cache
      this.searchCache.clear()

      this.initialized = false
      console.log('Semantic search cleaned up successfully')
    } catch (error) {
      console.error('Failed to cleanup semantic search:', error)
      throw error
    }
  }

  private generateCacheKey(query: string, options: SearchOptions): string {
    const filterString = options.filter ? JSON.stringify(options.filter) : ''
    const boostString = options.boostFields ? JSON.stringify(options.boostFields) : ''
    return `${query}:${options.topK || 10}:${options.scoreThreshold || 0.7}:${filterString}:${boostString}`
  }

  private convertFilters(filters?: SearchFilter[]): any {
    if (!filters || filters.length === 0) {
      return undefined
    }

    // Convert search filters to vector database filter format
    // This is a mock implementation - in a real implementation, you would convert to the specific format required by your vector database
    const filter: any = {}
    
    for (const searchFilter of filters) {
      filter[searchFilter.field] = {
        operator: searchFilter.operator,
        value: searchFilter.value
      }
    }

    return filter
  }

  private applyMetadataFilters(results: SearchResult[], filters: SearchFilter[]): SearchResult[] {
    return results.filter(result => {
      if (!result.metadata) {
        return false
      }

      return filters.every(filter => this.applyFilter(result.metadata!, filter))
    })
  }

  private applyFilter(metadata: Record<string, any>, filter: SearchFilter): boolean {
    const value = this.getNestedValue(metadata, filter.field)
    
    switch (filter.operator) {
      case 'equals':
        return value === filter.value
      case 'contains':
        return typeof value === 'string' && value.includes(filter.value)
      case 'starts_with':
        return typeof value === 'string' && value.startsWith(filter.value)
      case 'ends_with':
        return typeof value === 'string' && value.endsWith(filter.value)
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value)
      case 'not_in':
        return Array.isArray(filter.value) && !filter.value.includes(value)
      case 'greater_than':
        return typeof value === 'number' && value > filter.value
      case 'less_than':
        return typeof value === 'number' && value < filter.value
      default:
        return true
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  private async expandQuery(query: string, results: SearchResult[], options: SearchOptions): Promise<SearchResult[]> {
    // Mock query expansion - in a real implementation, you would use an LLM to generate related terms
    const expansionTerms = this.generateExpansionTerms(query)
    
    if (expansionTerms.length === 0) {
      return results
    }

    // Perform additional searches with expansion terms
    const expandedResults: SearchResult[] = []
    
    for (const term of expansionTerms) {
      const termResults = await this.search(term, options)
      expandedResults.push(...termResults)
    }

    // Combine and deduplicate results
    const allResults = [...results, ...expandedResults]
    const uniqueResults = this.deduplicateResults(allResults)

    // Re-rank combined results
    return this.rerankResults(query, uniqueResults, options)
  }

  private generateExpansionTerms(query: string): string[] {
    // Mock expansion terms generation
    const words = query.toLowerCase().split(/\s+/)
    const synonyms: Record<string, string[]> = {
      'search': ['find', 'lookup', 'query'],
      'document': ['file', 'paper', 'article'],
      'information': ['data', 'details', 'facts'],
      'help': ['assist', 'support', 'aid']
    }

    const expansionTerms: string[] = []
    
    for (const word of words) {
      if (synonyms[word]) {
        expansionTerms.push(...synonyms[word])
      }
    }

    return expansionTerms
  }

  private async rerankResults(query: string, results: SearchResult[], options: SearchOptions): Promise<SearchResult[]> {
    // Mock re-ranking - in a real implementation, you would use a cross-encoder or other re-ranking model
    return results.map((result, index) => ({
      ...result,
      relevanceScore: result.score * (1 - index * 0.05), // Slight penalty for lower ranks
      rank: index + 1
    })).sort((a, b) => (b.relevanceScore || b.score) - (a.relevanceScore || a.score))
  }

  private applyFieldBoosting(results: SearchResult[], boostFields: Record<string, number>): SearchResult[] {
    return results.map(result => {
      let boost = 1.0
      
      for (const [field, boostValue] of Object.entries(boostFields)) {
        if (result.metadata && result.metadata[field]) {
          boost *= boostValue
        }
      }

      return {
        ...result,
        score: result.score * boost,
        relevanceScore: (result.relevanceScore || result.score) * boost
      }
    })
  }

  private async keywordSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Mock keyword search - in a real implementation, you would use a traditional search engine like Elasticsearch
    const mockResults: SearchResult[] = []
    const topK = options.topK || this.config.defaultTopK || 10

    for (let i = 0; i < Math.min(topK, 5); i++) {
      mockResults.push({
        id: `keyword-result-${i}`,
        score: 0.8 - (i * 0.1),
        relevanceScore: 0.8 - (i * 0.1),
        metadata: {
          content: `Mock keyword result ${i} for query: ${query}`,
          documentId: `doc-${i}`,
          position: i
        },
        rank: i + 1,
        searchType: 'keyword'
      })
    }

    return mockResults
  }

  private rankFusion(vectorResults: SearchResult[], keywordResults: SearchResult[], vectorWeight: number, keywordWeight: number): SearchResult[] {
    // Combine results based on rank
    const allResults = [...vectorResults, ...keywordResults]
    const uniqueResults = this.deduplicateResults(allResults)

    return uniqueResults.map(result => {
      const vectorRank = vectorResults.find(r => r.id === result.id)?.rank || 100
      const keywordRank = keywordResults.find(r => r.id === result.id)?.rank || 100
      
      const fusedScore = (vectorWeight / vectorRank) + (keywordWeight / keywordRank)
      
      return {
        ...result,
        score: fusedScore,
        relevanceScore: fusedScore,
        searchType: 'hybrid' as const
      }
    }).sort((a, b) => b.score - a.score)
  }

  private scoreFusion(vectorResults: SearchResult[], keywordResults: SearchResult[], vectorWeight: number, keywordWeight: number): SearchResult[] {
    // Combine results based on scores
    const allResults = [...vectorResults, ...keywordResults]
    const uniqueResults = this.deduplicateResults(allResults)

    return uniqueResults.map(result => {
      const vectorScore = vectorResults.find(r => r.id === result.id)?.score || 0
      const keywordScore = keywordResults.find(r => r.id === result.id)?.score || 0
      
      const fusedScore = (vectorScore * vectorWeight) + (keywordScore * keywordWeight)
      
      return {
        ...result,
        score: fusedScore,
        relevanceScore: fusedScore,
        searchType: 'hybrid' as const
      }
    }).sort((a, b) => b.score - a.score)
  }

  private reciprocalRankFusion(vectorResults: SearchResult[], keywordResults: SearchResult[], vectorWeight: number, keywordWeight: number): SearchResult[] {
    // Reciprocal rank fusion
    const allResults = [...vectorResults, ...keywordResults]
    const uniqueResults = this.deduplicateResults(allResults)

    return uniqueResults.map(result => {
      const vectorRank = vectorResults.find(r => r.id === result.id)?.rank || 100
      const keywordRank = keywordResults.find(r => r.id === result.id)?.rank || 100
      
      const rrfScore = (vectorWeight / (60 + vectorRank)) + (keywordWeight / (60 + keywordRank))
      
      return {
        ...result,
        score: rrfScore,
        relevanceScore: rrfScore,
        searchType: 'hybrid' as const
      }
    }).sort((a, b) => b.score - a.score)
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>()
    const uniqueResults: SearchResult[] = []

    for (const result of results) {
      if (!seen.has(result.id)) {
        seen.add(result.id)
        uniqueResults.push(result)
      }
    }

    return uniqueResults
  }

  private chunkDocument(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    const content = document.content
    const chunkSize = 1000
    const chunkOverlap = 200

    for (let i = 0; i < content.length; i += chunkSize - chunkOverlap) {
      const chunkContent = content.slice(i, i + chunkSize)
      const chunk: DocumentChunk = {
        id: uuidv4(),
        documentId: document.id,
        content: chunkContent,
        metadata: document.metadata,
        position: i,
        tokenCount: this.estimateTokens(chunkContent)
      }
      chunks.push(chunk)
    }

    return chunks
  }

  private estimateTokens(text: string): number {
    // Simple token estimation
    return Math.ceil(text.length / 4)
  }

  private updateSearchStats(searchType: 'vector' | 'keyword' | 'hybrid' | 'cache', searchTime: number, resultCount: number): void {
    this.searchStats.totalSearches++
    this.searchStats.lastUpdated = new Date()

    // Update average search time
    this.searchStats.averageSearchTime = 
      (this.searchStats.averageSearchTime * (this.searchStats.totalSearches - 1) + searchTime) / this.searchStats.totalSearches

    // Update average results per search
    this.searchStats.averageResultsPerSearch = 
      (this.searchStats.averageResultsPerSearch * (this.searchStats.totalSearches - 1) + resultCount) / this.searchStats.totalSearches

    // Update search type counts
    if (searchType === 'vector') {
      this.searchStats.vectorSearchCount++
    } else if (searchType === 'keyword') {
      this.searchStats.keywordSearchCount++
    } else if (searchType === 'hybrid') {
      this.searchStats.hybridSearchCount++
    }

    // Update cache hit rate (mock calculation)
    this.searchStats.cacheHitRate = 0.8
  }
}