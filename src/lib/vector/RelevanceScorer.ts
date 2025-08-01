import { v4 as uuidv4 } from 'uuid'
import { SearchResult } from './SemanticSearch'
import { ContextItem, ContextDocument, ContextChunk } from './ContextManager'

export interface IRelevanceScorer {
  initialize(config: RelevanceScorerConfig): Promise<void>
  scoreQueryDocument(query: string, document: string, options?: ScoringOptions): Promise<RelevanceScore>
  scoreQueryChunk(query: string, chunk: string, options?: ScoringOptions): Promise<RelevanceScore>
  scoreQueryContext(query: string, contextItems: ContextItem[], options?: ScoringOptions): Promise<ContextRelevanceScore>
  scoreSearchResults(query: string, results: SearchResult[], options?: ScoringOptions): Promise<SearchResult[]>
  rankDocuments(query: string, documents: string[], options?: ScoringOptions): Promise<RankedDocument[]>
  rankChunks(query: string, chunks: string[], options?: ScoringOptions): Promise<RankedChunk[]>
  getScoringStats(): Promise<ScoringStats>
  optimizeScoringModel(trainingData: TrainingData[]): Promise<void>
  cleanup(): Promise<void>
}

export interface RelevanceScorerConfig {
  scoringMethod?: 'cosine' | 'bm25' | 'tfidf' | 'hybrid' | 'ml'
  enableMLScoring?: boolean
  mlModelPath?: string
  enableSemanticScoring?: boolean
  semanticWeight?: number
  keywordWeight?: number
  enablePersonalization?: boolean
  personalizationWeight?: number
  enableFreshnessScoring?: boolean
  freshnessWeight?: number
  enableAuthorityScoring?: boolean
  authorityWeight?: number
  enableDiversityScoring?: boolean
  diversityWeight?: number
  enableQueryExpansion?: boolean
  expansionTerms?: number
  enableSynonymMatching?: boolean
  enableStemming?: boolean
  enableStopWordFiltering?: boolean
  customWeights?: Record<string, number>
  threshold?: number
  normalizeScores?: boolean
}

export interface ScoringOptions {
  method?: 'cosine' | 'bm25' | 'tfidf' | 'hybrid' | 'ml'
  weights?: Record<string, number>
  threshold?: number
  normalize?: boolean
  includeDetails?: boolean
  includeExplanation?: boolean
  customFeatures?: Record<string, any>
  userId?: string
  sessionId?: string
  context?: Record<string, any>
}

export interface RelevanceScore {
  score: number
  normalizedScore: number
  confidence: number
  details: ScoreDetails
  explanation?: string
  features: ScoreFeatures
  timestamp: Date
}

export interface ScoreDetails {
  semanticScore?: number
  keywordScore?: number
  personalizationScore?: number
  freshnessScore?: number
  authorityScore?: number
  diversityScore?: number
  queryExpansionScore?: number
  synonymScore?: number
  customScores?: Record<string, number>
}

export interface ScoreFeatures {
  queryLength: number
  documentLength: number
  overlapTerms: number
  uniqueTerms: number
  termFrequency: number
  inverseDocumentFrequency?: number
  cosineSimilarity?: number
  bm25Score?: number
  tfidfScore?: number
  mlScore?: number
  freshness: number
  authority: number
  diversity: number
  personalization: number
}

export interface ContextRelevanceScore {
  overallScore: number
  itemScores: RelevanceScore[]
  diversityScore: number
  coverageScore: number
  coherenceScore: number
  timestamp: Date
}

export interface RankedDocument {
  document: string
  score: number
  rank: number
  relevanceScore: RelevanceScore
}

export interface RankedChunk {
  chunk: string
  score: number
  rank: number
  relevanceScore: RelevanceScore
}

export interface ScoringStats {
  totalScores: number
  averageScore: number
  averageConfidence: number
  averageScoringTime: number
  methodUsage: Record<string, number>
  lastOptimized: Date
  modelVersion: string
  timestamp: Date
}

export interface TrainingData {
  query: string
  document: string
  relevanceScore: number
  features: ScoreFeatures
  timestamp: Date
}

export class RelevanceScorer implements IRelevanceScorer {
  private config!: RelevanceScorerConfig
  private initialized = false
  private stats: ScoringStats = {
    totalScores: 0,
    averageScore: 0,
    averageConfidence: 0,
    averageScoringTime: 0,
    methodUsage: {},
    lastOptimized: new Date(),
    modelVersion: '1.0.0',
    timestamp: new Date()
  }
  private documentFrequency: Map<string, number> = new Map()
  private totalDocuments = 0
  private userPreferences: Map<string, Record<string, number>> = new Map()
  private authorityScores: Map<string, number> = new Map()

  constructor(config?: RelevanceScorerConfig) {
    if (config) {
      this.config = config
    }
  }

  async initialize(config: RelevanceScorerConfig): Promise<void> {
    try {
      this.config = {
        scoringMethod: 'hybrid',
        enableMLScoring: false,
        enableSemanticScoring: true,
        semanticWeight: 0.6,
        keywordWeight: 0.4,
        enablePersonalization: false,
        personalizationWeight: 0.1,
        enableFreshnessScoring: true,
        freshnessWeight: 0.1,
        enableAuthorityScoring: true,
        authorityWeight: 0.1,
        enableDiversityScoring: true,
        diversityWeight: 0.1,
        enableQueryExpansion: false,
        expansionTerms: 5,
        enableSynonymMatching: true,
        enableStemming: true,
        enableStopWordFiltering: true,
        threshold: 0.5,
        normalizeScores: true,
        ...config
      }

      this.initialized = true
      console.log('Relevance scorer initialized successfully')
    } catch (error) {
      console.error('Failed to initialize relevance scorer:', error)
      throw error
    }
  }

  async scoreQueryDocument(query: string, document: string, options: ScoringOptions = {}): Promise<RelevanceScore> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    const startTime = Date.now()
    const method = options.method || this.config.scoringMethod || 'hybrid'

    try {
      // Preprocess query and document
      const processedQuery = this.preprocessText(query)
      const processedDocument = this.preprocessText(document)

      // Calculate scores
      const semanticScore = this.config.enableSemanticScoring ? this.calculateSemanticScore(processedQuery, processedDocument) : 0
      const keywordScore = this.calculateKeywordScore(processedQuery, processedDocument)
      const freshnessScore = this.config.enableFreshnessScoring ? this.calculateFreshnessScore(document) : 0
      const authorityScore = this.config.enableAuthorityScoring ? this.calculateAuthorityScore(document) : 0
      const personalizationScore = this.config.enablePersonalization && options.userId ? 
        this.calculatePersonalizationScore(processedQuery, processedDocument, options.userId) : 0

      // Calculate final score
      const weights = options.weights || this.getWeights(method)
      const score = this.calculateFinalScore({
        semanticScore,
        keywordScore,
        freshnessScore,
        authorityScore,
        personalizationScore
      }, weights)

      // Normalize score if requested
      const normalizedScore = options.normalize !== false ? this.normalizeScore(score) : score

      // Calculate confidence
      const confidence = this.calculateConfidence({
        semanticScore,
        keywordScore,
        freshnessScore,
        authorityScore,
        personalizationScore
      })

      // Generate explanation if requested
      const explanation = options.includeExplanation ? this.generateExplanation({
        semanticScore,
        keywordScore,
        freshnessScore,
        authorityScore,
        personalizationScore,
        score,
        normalizedScore,
        confidence
      }) : undefined

      // Extract features
      const features = this.extractFeatures(processedQuery, processedDocument, document)

      // Build score details
      const details: ScoreDetails = {
        semanticScore: this.config.enableSemanticScoring ? semanticScore : undefined,
        keywordScore,
        freshnessScore: this.config.enableFreshnessScoring ? freshnessScore : undefined,
        authorityScore: this.config.enableAuthorityScoring ? authorityScore : undefined,
        personalizationScore: this.config.enablePersonalization && options.userId ? personalizationScore : undefined,
        customScores: options.customFeatures
      }

      const relevanceScore: RelevanceScore = {
        score,
        normalizedScore,
        confidence,
        details,
        explanation,
        features,
        timestamp: new Date()
      }

      // Update stats
      this.updateStats(method, Date.now() - startTime, score, confidence)

      return relevanceScore
    } catch (error) {
      console.error('Failed to score query-document pair:', error)
      throw error
    }
  }

  async scoreQueryChunk(query: string, chunk: string, options: ScoringOptions = {}): Promise<RelevanceScore> {
    // For chunks, we use the same scoring logic as documents but with adjusted weights
    const chunkOptions: ScoringOptions = {
      ...options,
      weights: {
        ...options.weights,
        semantic: (options.weights?.semantic || 0.6) * 1.2, // Boost semantic scoring for chunks
        keyword: (options.weights?.keyword || 0.4) * 0.8, // Reduce keyword scoring for chunks
      }
    }

    return this.scoreQueryDocument(query, chunk, chunkOptions)
  }

  async scoreQueryContext(query: string, contextItems: ContextItem[], options: ScoringOptions = {}): Promise<ContextRelevanceScore> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    try {
      // Score each context item
      const itemScores: RelevanceScore[] = []
      for (const item of contextItems) {
        const score = await this.scoreQueryChunk(query, item.content, options)
        itemScores.push(score)
      }

      // Calculate overall score
      const overallScore = itemScores.reduce((sum, score) => sum + score.normalizedScore, 0) / itemScores.length

      // Calculate diversity score
      const diversityScore = this.calculateDiversityScore(contextItems)

      // Calculate coverage score
      const coverageScore = this.calculateCoverageScore(query, contextItems)

      // Calculate coherence score
      const coherenceScore = this.calculateCoherenceScore(contextItems)

      return {
        overallScore,
        itemScores,
        diversityScore,
        coverageScore,
        coherenceScore,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to score query-context pair:', error)
      throw error
    }
  }

  async scoreSearchResults(query: string, results: SearchResult[], options: ScoringOptions = {}): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    try {
      // Score each result
      const scoredResults: SearchResult[] = []
      for (const result of results) {
        if (result.content) {
          const relevanceScore = await this.scoreQueryDocument(query, result.content, options)
          
          scoredResults.push({
            ...result,
            score: relevanceScore.normalizedScore,
            relevanceScore: relevanceScore.normalizedScore
          })
        } else {
          scoredResults.push(result)
        }
      }

      // Sort by score
      return scoredResults.sort((a, b) => (b.relevanceScore || b.score) - (a.relevanceScore || a.score))
    } catch (error) {
      console.error('Failed to score search results:', error)
      throw error
    }
  }

  async rankDocuments(query: string, documents: string[], options: ScoringOptions = {}): Promise<RankedDocument[]> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    try {
      const rankedDocuments: RankedDocument[] = []

      // Score each document
      for (let i = 0; i < documents.length; i++) {
        const relevanceScore = await this.scoreQueryDocument(query, documents[i], options)
        
        rankedDocuments.push({
          document: documents[i],
          score: relevanceScore.normalizedScore,
          rank: 0, // Will be set after sorting
          relevanceScore
        })
      }

      // Sort by score and assign ranks
      rankedDocuments.sort((a, b) => b.score - a.score)
      rankedDocuments.forEach((doc, index) => {
        doc.rank = index + 1
      })

      return rankedDocuments
    } catch (error) {
      console.error('Failed to rank documents:', error)
      throw error
    }
  }

  async rankChunks(query: string, chunks: string[], options: ScoringOptions = {}): Promise<RankedChunk[]> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    try {
      const rankedChunks: RankedChunk[] = []

      // Score each chunk
      for (let i = 0; i < chunks.length; i++) {
        const relevanceScore = await this.scoreQueryChunk(query, chunks[i], options)
        
        rankedChunks.push({
          chunk: chunks[i],
          score: relevanceScore.normalizedScore,
          rank: 0, // Will be set after sorting
          relevanceScore
        })
      }

      // Sort by score and assign ranks
      rankedChunks.sort((a, b) => b.score - a.score)
      rankedChunks.forEach((chunk, index) => {
        chunk.rank = index + 1
      })

      return rankedChunks
    } catch (error) {
      console.error('Failed to rank chunks:', error)
      throw error
    }
  }

  async getScoringStats(): Promise<ScoringStats> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    return { ...this.stats }
  }

  async optimizeScoringModel(trainingData: TrainingData[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('Relevance scorer not initialized')
    }

    try {
      console.log(`Optimizing scoring model with ${trainingData.length} training examples`)
      
      // Mock model optimization - in a real implementation, you would train a machine learning model
      // For now, we'll just update some basic statistics
      
      // Update document frequencies for better IDF calculation
      for (const data of trainingData) {
        const terms = this.preprocessText(data.document).split(/\s+/)
        const uniqueTerms = new Set(terms)
        
        for (const term of uniqueTerms) {
          this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1)
        }
      }
      
      this.totalDocuments = trainingData.length
      
      // Update stats
      this.stats.lastOptimized = new Date()
      this.stats.modelVersion = '1.0.1'
      
      console.log('Scoring model optimized successfully')
    } catch (error) {
      console.error('Failed to optimize scoring model:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clear data structures
      this.documentFrequency.clear()
      this.userPreferences.clear()
      this.authorityScores.clear()

      this.initialized = false
      console.log('Relevance scorer cleaned up successfully')
    } catch (error) {
      console.error('Failed to cleanup relevance scorer:', error)
      throw error
    }
  }

  private preprocessText(text: string): string {
    let processed = text.toLowerCase()
    
    // Remove punctuation
    processed = processed.replace(/[^\w\s]/g, ' ')
    
    // Apply stemming if enabled
    if (this.config.enableStemming) {
      processed = this.applyStemming(processed)
    }
    
    // Remove stop words if enabled
    if (this.config.enableStopWordFiltering) {
      processed = this.removeStopWords(processed)
    }
    
    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim()
    
    return processed
  }

  private applyStemming(text: string): string {
    // Simple stemming implementation - in a real implementation, use a proper stemmer like Porter
    const words = text.split(' ')
    const stemmedWords = words.map(word => {
      // Simple rules for English
      if (word.endsWith('ing')) {
        return word.slice(0, -3)
      } else if (word.endsWith('ed')) {
        return word.slice(0, -2)
      } else if (word.endsWith('s')) {
        return word.slice(0, -1)
      } else if (word.endsWith('es')) {
        return word.slice(0, -2)
      }
      return word
    })
    
    return stemmedWords.join(' ')
  }

  private removeStopWords(text: string): string {
    // Common English stop words
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
      'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
      'will', 'with', 'i', 'you', 'your', 'they', 'this', 'that', 'these', 'those'
    ])
    
    const words = text.split(' ')
    const filteredWords = words.filter(word => !stopWords.has(word))
    
    return filteredWords.join(' ')
  }

  private calculateSemanticScore(query: string, document: string): number {
    // Mock semantic scoring - in a real implementation, use embeddings or a semantic model
    const queryTerms = new Set(query.split(/\s+/))
    const documentTerms = new Set(document.split(/\s+/))
    
    const intersection = new Set([...queryTerms].filter(term => documentTerms.has(term)))
    const union = new Set([...queryTerms, ...documentTerms])
    
    return intersection.size / union.size // Jaccard similarity
  }

  private calculateKeywordScore(query: string, document: string): number {
    const queryTerms = query.split(/\s+/)
    const documentTerms = document.split(/\s+/)
    
    let score = 0
    for (const queryTerm of queryTerms) {
      const termFrequency = documentTerms.filter(term => term === queryTerm).length
      const inverseDocumentFrequency = Math.log((this.totalDocuments + 1) / (this.documentFrequency.get(queryTerm) || 0) + 1)
      score += termFrequency * inverseDocumentFrequency
    }
    
    return score
  }

  private calculateFreshnessScore(document: string): number {
    // Mock freshness scoring - in a real implementation, use document timestamps
    // For now, return a random score between 0 and 1
    return Math.random()
  }

  private calculateAuthorityScore(document: string): number {
    // Mock authority scoring - in a real implementation, use domain authority, backlinks, etc.
    // For now, return a random score between 0 and 1
    return Math.random()
  }

  private calculatePersonalizationScore(query: string, document: string, userId: string): number {
    // Mock personalization scoring - in a real implementation, use user preferences, history, etc.
    const userPrefs = this.userPreferences.get(userId) || {}
    
    let score = 0
    const documentTerms = document.split(/\s+/)
    
    for (const [term, weight] of Object.entries(userPrefs)) {
      if (documentTerms.includes(term)) {
        score += weight
      }
    }
    
    return Math.min(score, 1) // Cap at 1
  }

  private calculateFinalScore(scores: Record<string, number>, weights: Record<string, number>): number {
    let finalScore = 0
    
    for (const [key, score] of Object.entries(scores)) {
      const weight = weights[key] || 0
      finalScore += score * weight
    }
    
    return finalScore
  }

  private getWeights(method: string): Record<string, number> {
    switch (method) {
      case 'cosine':
        return { semantic: 1.0 }
      case 'bm25':
        return { keyword: 1.0 }
      case 'tfidf':
        return { keyword: 1.0 }
      case 'hybrid':
        return {
          semantic: this.config.semanticWeight || 0.6,
          keyword: this.config.keywordWeight || 0.4,
          freshness: this.config.freshnessWeight || 0.1,
          authority: this.config.authorityWeight || 0.1,
          personalization: this.config.personalizationWeight || 0.1
        }
      case 'ml':
        return { ml: 1.0 }
      default:
        return { semantic: 0.6, keyword: 0.4 }
    }
  }

  private normalizeScore(score: number): number {
    // Simple normalization to [0, 1] range
    return Math.min(Math.max(score, 0), 1)
  }

  private calculateConfidence(scores: Record<string, number>): number {
    // Calculate confidence based on the variance of scores
    const scoreValues = Object.values(scores).filter(s => s > 0)
    if (scoreValues.length === 0) return 0
    
    const mean = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
    const variance = scoreValues.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scoreValues.length
    
    // Higher variance means lower confidence
    return Math.max(0, 1 - Math.sqrt(variance))
  }

  private generateExplanation(scores: Record<string, number>): string {
    const explanations: string[] = []
    
    if (scores.semanticScore && scores.semanticScore > 0.5) {
      explanations.push(`High semantic similarity (${scores.semanticScore.toFixed(2)})`)
    }
    
    if (scores.keywordScore && scores.keywordScore > 0.5) {
      explanations.push(`Strong keyword match (${scores.keywordScore.toFixed(2)})`)
    }
    
    if (scores.freshnessScore && scores.freshnessScore > 0.7) {
      explanations.push(`Recent content (${scores.freshnessScore.toFixed(2)})`)
    }
    
    if (scores.authorityScore && scores.authorityScore > 0.7) {
      explanations.push(`High authority source (${scores.authorityScore.toFixed(2)})`)
    }
    
    if (scores.personalizationScore && scores.personalizationScore > 0.5) {
      explanations.push(`Matches user preferences (${scores.personalizationScore.toFixed(2)})`)
    }
    
    if (explanations.length === 0) {
      return 'Moderate relevance based on multiple factors'
    }
    
    return `Relevance based on: ${explanations.join(', ')}`
  }

  private extractFeatures(query: string, document: string, originalDocument: string): ScoreFeatures {
    const queryTerms = query.split(/\s+/)
    const documentTerms = document.split(/\s+/)
    
    const overlapTerms = queryTerms.filter(term => documentTerms.includes(term))
    const uniqueTerms = new Set([...queryTerms, ...documentTerms])
    
    const termFrequency = overlapTerms.length / documentTerms.length
    const inverseDocumentFrequency = queryTerms.reduce((sum, term) => {
      return sum + Math.log((this.totalDocuments + 1) / (this.documentFrequency.get(term) || 0) + 1)
    }, 0) / queryTerms.length
    
    return {
      queryLength: queryTerms.length,
      documentLength: documentTerms.length,
      overlapTerms: overlapTerms.length,
      uniqueTerms: uniqueTerms.size,
      termFrequency,
      inverseDocumentFrequency,
      cosineSimilarity: this.calculateSemanticScore(query, document),
      bm25Score: this.calculateKeywordScore(query, document),
      tfidfScore: termFrequency * inverseDocumentFrequency,
      freshness: this.calculateFreshnessScore(originalDocument),
      authority: this.calculateAuthorityScore(originalDocument),
      diversity: Math.random(), // Mock diversity score
      personalization: Math.random() // Mock personalization score
    }
  }

  private calculateDiversityScore(contextItems: ContextItem[]): number {
    // Calculate diversity based on content similarity between items
    if (contextItems.length <= 1) return 1.0
    
    let totalSimilarity = 0
    let comparisons = 0
    
    for (let i = 0; i < contextItems.length; i++) {
      for (let j = i + 1; j < contextItems.length; j++) {
        const similarity = this.calculateSemanticScore(
          this.preprocessText(contextItems[i].content),
          this.preprocessText(contextItems[j].content)
        )
        totalSimilarity += similarity
        comparisons++
      }
    }
    
    const averageSimilarity = totalSimilarity / comparisons
    return 1 - averageSimilarity // Higher diversity = lower similarity
  }

  private calculateCoverageScore(query: string, contextItems: ContextItem[]): number {
    // Calculate how well the context covers the query terms
    const queryTerms = new Set(this.preprocessText(query).split(/\s+/))
    const coveredTerms = new Set<string>()
    
    for (const item of contextItems) {
      const itemTerms = this.preprocessText(item.content).split(/\s+/)
      for (const term of itemTerms) {
        if (queryTerms.has(term)) {
          coveredTerms.add(term)
        }
      }
    }
    
    return coveredTerms.size / queryTerms.size
  }

  private calculateCoherenceScore(contextItems: ContextItem[]): number {
    // Calculate coherence based on how well the context items flow together
    if (contextItems.length <= 1) return 1.0
    
    let totalCoherence = 0
    
    for (let i = 0; i < contextItems.length - 1; i++) {
      const current = this.preprocessText(contextItems[i].content)
      const next = this.preprocessText(contextItems[i + 1].content)
      
      // Simple coherence based on term overlap
      const currentTerms = new Set(current.split(/\s+/))
      const nextTerms = new Set(next.split(/\s+/))
      
      const intersection = new Set([...currentTerms].filter(term => nextTerms.has(term)))
      const union = new Set([...currentTerms, ...nextTerms])
      
      const coherence = intersection.size / union.size
      totalCoherence += coherence
    }
    
    return totalCoherence / (contextItems.length - 1)
  }

  private updateStats(method: string, scoringTime: number, score: number, confidence: number): void {
    this.stats.totalScores++
    this.stats.averageScore = (this.stats.averageScore * (this.stats.totalScores - 1) + score) / this.stats.totalScores
    this.stats.averageConfidence = (this.stats.averageConfidence * (this.stats.totalScores - 1) + confidence) / this.stats.totalScores
    this.stats.averageScoringTime = (this.stats.averageScoringTime * (this.stats.totalScores - 1) + scoringTime) / this.stats.totalScores
    
    this.stats.methodUsage[method] = (this.stats.methodUsage[method] || 0) + 1
    this.stats.timestamp = new Date()
  }
}