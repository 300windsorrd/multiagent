import { v4 as uuidv4 } from 'uuid'

export interface ICostEstimator {
  initialize(config: CostEstimatorConfig): Promise<void>
  estimateCost(request: CostEstimationRequest): Promise<CostEstimationResult>
  compareModels(requests: ModelComparisonRequest[]): Promise<ModelComparisonResult>
  getOptimalModel(request: OptimizationRequest): Promise<OptimizationResult>
  getCostBreakdown(request: CostBreakdownRequest): Promise<CostBreakdownResult>
  updatePricing(pricing: PricingUpdate): Promise<void>
  getPricingInfo(providerId: string, modelId: string): Promise<ModelPricing | null>
}

export interface CostEstimatorConfig {
  defaultProvider?: string
  enableCostOptimization?: boolean
  optimizationStrategy?: 'cost' | 'performance' | 'balanced'
  customPricing?: Record<string, ModelPricing>
  currency?: string
}

export interface CostEstimationRequest {
  providerId: string
  modelId: string
  inputTokens: number
  outputTokens?: number
  requestType: 'completion' | 'chat' | 'embedding'
  context?: any
}

export interface CostEstimationResult {
  providerId: string
  modelId: string
  estimatedCost: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  currency: string
  confidence: number
  breakdown: CostBreakdown
  alternatives?: AlternativeModel[]
}

export interface CostBreakdown {
  inputCost: number
  outputCost: number
  totalCost: number
  inputTokenPrice: number
  outputTokenPrice: number
  currency: string
}

export interface AlternativeModel {
  providerId: string
  modelId: string
  estimatedCost: number
  savings: number
  savingsPercentage: number
  tradeoffs: string[]
}

export interface ModelComparisonRequest {
  providerId: string
  modelId: string
  inputTokens: number
  outputTokens?: number
  requestType: 'completion' | 'chat' | 'embedding'
}

export interface ModelComparisonResult {
  comparisons: ModelComparison[]
  recommendation: ModelRecommendation
  totalSavings: number
  optimizationOpportunities: OptimizationOpportunity[]
}

export interface ModelComparison {
  providerId: string
  modelId: string
  estimatedCost: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  performance: ModelPerformance
  costEfficiency: number
  rank: number
}

export interface ModelPerformance {
  speed: number // 1-10 scale
  quality: number // 1-10 scale
  capabilities: string[]
  reliability: number // 1-10 scale
}

export interface ModelRecommendation {
  providerId: string
  modelId: string
  reason: string
  estimatedSavings: number
  confidence: number
}

export interface OptimizationOpportunity {
  type: 'model_switch' | 'token_reduction' | 'batching' | 'caching'
  description: string
  estimatedSavings: number
  implementation: string
  priority: 'low' | 'medium' | 'high'
}

export interface OptimizationRequest {
  requestType: 'completion' | 'chat' | 'embedding'
  inputTokens: number
  outputTokens?: number
  requirements: OptimizationRequirements
  constraints?: OptimizationConstraints
}

export interface OptimizationRequirements {
  quality?: 'low' | 'medium' | 'high' | 'critical'
  speed?: 'low' | 'medium' | 'high' | 'critical'
  capabilities?: string[]
}

export interface OptimizationConstraints {
  maxCost?: number
  maxLatency?: number
  preferredProviders?: string[]
  excludedModels?: string[]
}

export interface OptimizationResult {
  recommendedProvider: string
  recommendedModel: string
  estimatedCost: number
  estimatedSavings: number
  confidence: number
  alternatives: AlternativeModel[]
  reasoning: string[]
}

export interface CostBreakdownRequest {
  timeRange?: TimeRange
  providerId?: string
  modelId?: string
  requestType?: 'completion' | 'chat' | 'embedding'
}

export interface CostBreakdownResult {
  totalCost: number
  breakdown: CostBreakdownByCategory
  trends: CostTrend[]
  insights: CostInsight[]
  recommendations: string[]
}

export interface CostBreakdownByCategory {
  byProvider: Record<string, ProviderCostBreakdown>
  byModel: Record<string, ModelCostBreakdown>
  byRequestType: Record<string, RequestTypeCostBreakdown>
  byTime: TimeSeriesCostBreakdown[]
}

export interface ProviderCostBreakdown {
  totalCost: number
  requestCount: number
  averageCostPerRequest: number
  modelBreakdown: Record<string, ModelCostBreakdown>
}

export interface ModelCostBreakdown {
  totalCost: number
  requestCount: number
  averageCostPerRequest: number
  inputTokens: number
  outputTokens: number
  averageCostPerToken: number
}

export interface RequestTypeCostBreakdown {
  totalCost: number
  requestCount: number
  averageCostPerRequest: number
  tokenCount: number
}

export interface TimeSeriesCostBreakdown {
  timestamp: Date
  cost: number
  requestCount: number
  tokenCount: number
}

export interface CostTrend {
  period: 'daily' | 'weekly' | 'monthly'
  direction: 'increasing' | 'decreasing' | 'stable'
  changePercentage: number
  significance: 'low' | 'medium' | 'high'
}

export interface CostInsight {
  type: 'cost_spike' | 'efficiency_opportunity' | 'budget_alert' | 'usage_pattern'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  actionable: boolean
  recommendation?: string
}

export interface PricingUpdate {
  providerId: string
  modelId: string
  pricing: ModelPricing
  effectiveDate: Date
}

export interface ModelPricing {
  promptTokenPrice: number // Price per 1K tokens
  completionTokenPrice: number // Price per 1K tokens
  currency: string
  lastUpdated: Date
}

export interface TimeRange {
  start: Date
  end: Date
}

export class CostEstimator implements ICostEstimator {
  private config!: CostEstimatorConfig
  private pricingData: Map<string, ModelPricing> = new Map()
  private modelPerformance: Map<string, ModelPerformance> = new Map()
  private initialized = false

  async initialize(config: CostEstimatorConfig): Promise<void> {
    try {
      this.config = {
        enableCostOptimization: true,
        optimizationStrategy: 'balanced',
        currency: 'USD',
        ...config
      }

      // Initialize default pricing data
      await this.initializeDefaultPricing()
      
      // Initialize model performance data
      await this.initializeModelPerformance()

      // Apply custom pricing if provided
      if (config.customPricing) {
        for (const [modelKey, pricing] of Object.entries(config.customPricing)) {
          this.pricingData.set(modelKey, {
            ...pricing,
            lastUpdated: new Date()
          })
        }
      }

      this.initialized = true
      console.log('Cost estimator initialized successfully')
    } catch (error) {
      console.error('Failed to initialize cost estimator:', error)
      throw error
    }
  }

  async estimateCost(request: CostEstimationRequest): Promise<CostEstimationResult> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      const pricing = await this.getPricingInfo(request.providerId, request.modelId)
      if (!pricing) {
        throw new Error(`No pricing information available for ${request.providerId}:${request.modelId}`)
      }

      // Estimate output tokens if not provided
      const estimatedOutputTokens = request.outputTokens || this.estimateOutputTokens(request.inputTokens, request.requestType)

      // Calculate costs
      const inputCost = (request.inputTokens / 1000) * pricing.promptTokenPrice
      const outputCost = (estimatedOutputTokens / 1000) * pricing.completionTokenPrice
      const totalCost = inputCost + outputCost

      const breakdown: CostBreakdown = {
        inputCost,
        outputCost,
        totalCost,
        inputTokenPrice: pricing.promptTokenPrice,
        outputTokenPrice: pricing.completionTokenPrice,
        currency: pricing.currency
      }

      // Generate alternatives
      const alternatives = await this.generateAlternatives(request, totalCost)

      return {
        providerId: request.providerId,
        modelId: request.modelId,
        estimatedCost: totalCost,
        estimatedInputTokens: request.inputTokens,
        estimatedOutputTokens: estimatedOutputTokens,
        estimatedTotalTokens: request.inputTokens + estimatedOutputTokens,
        currency: pricing.currency,
        confidence: this.calculateConfidence(request),
        breakdown,
        alternatives
      }
    } catch (error) {
      console.error(`Failed to estimate cost for ${request.providerId}:${request.modelId}:`, error)
      throw error
    }
  }

  async compareModels(requests: ModelComparisonRequest[]): Promise<ModelComparisonResult> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      const comparisons: ModelComparison[] = []

      // Calculate cost and performance for each model
      for (const request of requests) {
        const costResult = await this.estimateCost({
          providerId: request.providerId,
          modelId: request.modelId,
          inputTokens: request.inputTokens,
          outputTokens: request.outputTokens,
          requestType: request.requestType
        })

        const performance = this.modelPerformance.get(`${request.providerId}:${request.modelId}`) || {
          speed: 5,
          quality: 5,
          capabilities: [],
          reliability: 5
        }

        const costEfficiency = this.calculateCostEfficiency(costResult.estimatedCost, performance)

        comparisons.push({
          providerId: request.providerId,
          modelId: request.modelId,
          estimatedCost: costResult.estimatedCost,
          estimatedInputTokens: costResult.estimatedInputTokens,
          estimatedOutputTokens: costResult.estimatedOutputTokens,
          estimatedTotalTokens: costResult.estimatedTotalTokens,
          performance,
          costEfficiency,
          rank: 0 // Will be set after sorting
        })
      }

      // Sort by cost efficiency (higher is better)
      comparisons.sort((a, b) => b.costEfficiency - a.costEfficiency)

      // Assign ranks
      comparisons.forEach((comparison, index) => {
        comparison.rank = index + 1
      })

      // Generate recommendation
      const bestOption = comparisons[0]
      const recommendation: ModelRecommendation = {
        providerId: bestOption.providerId,
        modelId: bestOption.modelId,
        reason: `Best cost-efficiency balance with ${bestOption.costEfficiency.toFixed(2)} score`,
        estimatedSavings: comparisons.length > 1 ? comparisons[1].estimatedCost - bestOption.estimatedCost : 0,
        confidence: 0.85
      }

      // Calculate total savings potential
      const totalSavings = comparisons.length > 1 ? 
        comparisons.reduce((sum, comp) => sum + comp.estimatedCost, 0) - 
        (bestOption.estimatedCost * comparisons.length) : 0

      // Identify optimization opportunities
      const optimizationOpportunities = this.identifyOptimizationOpportunities(comparisons)

      return {
        comparisons,
        recommendation,
        totalSavings,
        optimizationOpportunities
      }
    } catch (error) {
      console.error('Failed to compare models:', error)
      throw error
    }
  }

  async getOptimalModel(request: OptimizationRequest): Promise<OptimizationResult> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      // Get all available models
      const availableModels = this.getAvailableModels(request.requestType)
      
      // Filter based on constraints
      const candidateModels = availableModels.filter(model => {
        if (request.constraints?.excludedModels?.includes(model.modelId)) {
          return false
        }
        if (request.constraints?.preferredProviders && 
            !request.constraints.preferredProviders.includes(model.providerId)) {
          return false
        }
        return true
      })

      // Score each model based on requirements
      const scoredModels = await Promise.all(
        candidateModels.map(async model => {
          const costResult = await this.estimateCost({
            providerId: model.providerId,
            modelId: model.modelId,
            inputTokens: request.inputTokens,
            outputTokens: request.outputTokens,
            requestType: request.requestType
          })

          const performance = this.modelPerformance.get(`${model.providerId}:${model.modelId}`) || {
            speed: 5,
            quality: 5,
            capabilities: [],
            reliability: 5
          }

          const score = this.calculateOptimizationScore(
            costResult, 
            performance, 
            request.requirements,
            request.constraints
          )

          return {
            model,
            costResult,
            performance,
            score
          }
        })
      )

      // Sort by score (higher is better)
      scoredModels.sort((a, b) => b.score - a.score)

      if (scoredModels.length === 0) {
        throw new Error('No suitable models found for the given requirements')
      }

      const bestMatch = scoredModels[0]
      const secondBest = scoredModels[1]

      // Generate alternatives
      const alternatives: AlternativeModel[] = scoredModels.slice(1, 4).map((scored, index) => ({
        providerId: scored.model.providerId,
        modelId: scored.model.modelId,
        estimatedCost: scored.costResult.estimatedCost,
        savings: bestMatch.costResult.estimatedCost - scored.costResult.estimatedCost,
        savingsPercentage: ((bestMatch.costResult.estimatedCost - scored.costResult.estimatedCost) / bestMatch.costResult.estimatedCost) * 100,
        tradeoffs: this.generateTradeoffs(bestMatch, scored)
      }))

      return {
        recommendedProvider: bestMatch.model.providerId,
        recommendedModel: bestMatch.model.modelId,
        estimatedCost: bestMatch.costResult.estimatedCost,
        estimatedSavings: secondBest ? secondBest.costResult.estimatedCost - bestMatch.costResult.estimatedCost : 0,
        confidence: Math.min(bestMatch.score / 10, 1.0),
        alternatives,
        reasoning: this.generateOptimizationReasoning(bestMatch, request.requirements)
      }
    } catch (error) {
      console.error('Failed to get optimal model:', error)
      throw error
    }
  }

  async getCostBreakdown(request: CostBreakdownRequest): Promise<CostBreakdownResult> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    // This would typically query actual usage data
    // For now, we'll return a mock implementation
    return {
      totalCost: 0,
      breakdown: {
        byProvider: {},
        byModel: {},
        byRequestType: {},
        byTime: []
      },
      trends: [],
      insights: [],
      recommendations: []
    }
  }

  async updatePricing(pricing: PricingUpdate): Promise<void> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      const key = `${pricing.providerId}:${pricing.modelId}`
      this.pricingData.set(key, {
        ...pricing.pricing,
        lastUpdated: pricing.effectiveDate
      })

      console.log(`Pricing updated for ${pricing.providerId}:${pricing.modelId}`)
    } catch (error) {
      console.error(`Failed to update pricing for ${pricing.providerId}:${pricing.modelId}:`, error)
      throw error
    }
  }

  async getPricingInfo(providerId: string, modelId: string): Promise<ModelPricing | null> {
    const key = `${providerId}:${modelId}`
    return this.pricingData.get(key) || null
  }

  private async initializeDefaultPricing(): Promise<void> {
    // OpenAI pricing
    this.pricingData.set('openai:gpt-4', {
      promptTokenPrice: 0.03,
      completionTokenPrice: 0.06,
      currency: 'USD',
      lastUpdated: new Date()
    })

    this.pricingData.set('openai:gpt-4-turbo', {
      promptTokenPrice: 0.01,
      completionTokenPrice: 0.03,
      currency: 'USD',
      lastUpdated: new Date()
    })

    this.pricingData.set('openai:gpt-3.5-turbo', {
      promptTokenPrice: 0.0015,
      completionTokenPrice: 0.002,
      currency: 'USD',
      lastUpdated: new Date()
    })

    this.pricingData.set('openai:text-embedding-ada-002', {
      promptTokenPrice: 0.0001,
      completionTokenPrice: 0.0001,
      currency: 'USD',
      lastUpdated: new Date()
    })

    // Anthropic pricing
    this.pricingData.set('anthropic:claude-3-opus-20240229', {
      promptTokenPrice: 0.015,
      completionTokenPrice: 0.075,
      currency: 'USD',
      lastUpdated: new Date()
    })

    this.pricingData.set('anthropic:claude-3-sonnet-20240229', {
      promptTokenPrice: 0.003,
      completionTokenPrice: 0.015,
      currency: 'USD',
      lastUpdated: new Date()
    })

    this.pricingData.set('anthropic:claude-3-haiku-20240307', {
      promptTokenPrice: 0.00025,
      completionTokenPrice: 0.00125,
      currency: 'USD',
      lastUpdated: new Date()
    })
  }

  private async initializeModelPerformance(): Promise<void> {
    // OpenAI model performance
    this.modelPerformance.set('openai:gpt-4', {
      speed: 6,
      quality: 9,
      capabilities: ['reasoning', 'coding', 'creative', 'analysis'],
      reliability: 8
    })

    this.modelPerformance.set('openai:gpt-4-turbo', {
      speed: 7,
      quality: 9,
      capabilities: ['reasoning', 'coding', 'creative', 'analysis', 'vision'],
      reliability: 8
    })

    this.modelPerformance.set('openai:gpt-3.5-turbo', {
      speed: 9,
      quality: 7,
      capabilities: ['reasoning', 'coding', 'conversation'],
      reliability: 8
    })

    this.modelPerformance.set('openai:text-embedding-ada-002', {
      speed: 10,
      quality: 8,
      capabilities: ['embedding'],
      reliability: 9
    })

    // Anthropic model performance
    this.modelPerformance.set('anthropic:claude-3-opus-20240229', {
      speed: 6,
      quality: 10,
      capabilities: ['reasoning', 'coding', 'creative', 'analysis', 'vision'],
      reliability: 9
    })

    this.modelPerformance.set('anthropic:claude-3-sonnet-20240229', {
      speed: 8,
      quality: 9,
      capabilities: ['reasoning', 'coding', 'creative', 'analysis', 'vision'],
      reliability: 9
    })

    this.modelPerformance.set('anthropic:claude-3-haiku-20240307', {
      speed: 10,
      quality: 8,
      capabilities: ['reasoning', 'conversation', 'quick_tasks'],
      reliability: 9
    })
  }

  private estimateOutputTokens(inputTokens: number, requestType: 'completion' | 'chat' | 'embedding'): number {
    switch (requestType) {
      case 'completion':
        return Math.floor(inputTokens * 0.8)
      case 'chat':
        return Math.floor(inputTokens * 1.2)
      case 'embedding':
        return 0 // Embeddings don't have output tokens
      default:
        return Math.floor(inputTokens * 0.5)
    }
  }

  private calculateConfidence(request: CostEstimationRequest): number {
    // Simple confidence calculation based on request characteristics
    let confidence = 0.8 // Base confidence

    // Higher confidence for embedding requests (more predictable)
    if (request.requestType === 'embedding') {
      confidence += 0.15
    }

    // Lower confidence if output tokens are estimated
    if (!request.outputTokens) {
      confidence -= 0.1
    }

    return Math.max(0.1, Math.min(1.0, confidence))
  }

  private async generateAlternatives(request: CostEstimationRequest, currentCost: number): Promise<AlternativeModel[]> {
    const alternatives: AlternativeModel[] = []
    
    // Get all available models for the same request type
    const availableModels = this.getAvailableModels(request.requestType)
    
    for (const model of availableModels) {
      if (model.providerId === request.providerId && model.modelId === request.modelId) {
        continue // Skip the current model
      }

      try {
        const costResult = await this.estimateCost({
          providerId: model.providerId,
          modelId: model.modelId,
          inputTokens: request.inputTokens,
          outputTokens: request.outputTokens,
          requestType: request.requestType
        })

        const savings = currentCost - costResult.estimatedCost
        const savingsPercentage = (savings / currentCost) * 100

        if (savings > 0) {
          alternatives.push({
            providerId: model.providerId,
            modelId: model.modelId,
            estimatedCost: costResult.estimatedCost,
            savings,
            savingsPercentage,
            tradeoffs: this.getModelTradeoffs(request, model)
          })
        }
      } catch (error) {
        // Skip models that can't be estimated
        continue
      }
    }

    // Sort by savings (highest first)
    alternatives.sort((a, b) => b.savings - a.savings)

    // Return top 3 alternatives
    return alternatives.slice(0, 3)
  }

  private getAvailableModels(requestType: 'completion' | 'chat' | 'embedding'): Array<{providerId: string, modelId: string}> {
    const models: Array<{providerId: string, modelId: string}> = []

    for (const [key, pricing] of this.pricingData.entries()) {
      const [providerId, modelId] = key.split(':')
      
      // Filter by request type
      if (requestType === 'embedding' && !modelId.includes('embedding')) {
        continue
      }
      
      models.push({ providerId, modelId })
    }

    return models
  }

  private calculateCostEfficiency(cost: number, performance: ModelPerformance): number {
    // Calculate a cost efficiency score (higher is better)
    const performanceScore = (performance.speed + performance.quality + performance.reliability) / 3
    return performanceScore / (cost + 0.01) // Add small value to avoid division by zero
  }

  private identifyOptimizationOpportunities(comparisons: ModelComparison[]): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = []

    // Model switch opportunities
    if (comparisons.length > 1) {
      const best = comparisons[0]
      const worst = comparisons[comparisons.length - 1]
      
      if (worst.estimatedCost > best.estimatedCost * 1.5) {
        opportunities.push({
          type: 'model_switch',
          description: `Switch from ${worst.modelId} to ${best.modelId} for significant cost savings`,
          estimatedSavings: worst.estimatedCost - best.estimatedCost,
          implementation: `Update model selection from ${worst.modelId} to ${best.modelId}`,
          priority: 'high'
        })
      }
    }

    // Token reduction opportunities
    const avgTokens = comparisons.reduce((sum, comp) => sum + comp.estimatedTotalTokens, 0) / comparisons.length
    if (avgTokens > 4000) {
      opportunities.push({
        type: 'token_reduction',
        description: 'Optimize prompts to reduce token count',
        estimatedSavings: avgTokens * 0.00001, // Rough estimate
        implementation: 'Review and optimize prompts for conciseness',
        priority: 'medium'
      })
    }

    return opportunities
  }

  private calculateOptimizationScore(
    costResult: CostEstimationResult, 
    performance: ModelPerformance, 
    requirements: OptimizationRequirements,
    constraints?: OptimizationConstraints
  ): number {
    let score = 0

    // Cost factor (lower cost is better)
    const costScore = Math.max(0, 10 - (costResult.estimatedCost * 100))
    score += costScore * 0.3

    // Performance factors
    if (requirements.quality) {
      const qualityWeight = this.getQualityWeight(requirements.quality)
      score += performance.quality * qualityWeight
    }

    if (requirements.speed) {
      const speedWeight = this.getSpeedWeight(requirements.speed)
      score += performance.speed * speedWeight
    }

    // Capability matching
    if (requirements.capabilities && requirements.capabilities.length > 0) {
      const matchedCapabilities = requirements.capabilities.filter(cap => 
        performance.capabilities.includes(cap)
      ).length
      const capabilityScore = (matchedCapabilities / requirements.capabilities.length) * 10
      score += capabilityScore * 0.2
    }

    // Reliability
    score += performance.reliability * 0.1

    // Constraint penalties
    if (constraints?.maxCost && costResult.estimatedCost > constraints.maxCost) {
      score -= 5 // Heavy penalty for exceeding cost constraint
    }

    return Math.max(0, Math.min(10, score))
  }

  private getQualityWeight(quality: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (quality) {
      case 'low': return 0.1
      case 'medium': return 0.2
      case 'high': return 0.3
      case 'critical': return 0.4
      default: return 0.2
    }
  }

  private getSpeedWeight(speed: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (speed) {
      case 'low': return 0.1
      case 'medium': return 0.2
      case 'high': return 0.3
      case 'critical': return 0.4
      default: return 0.2
    }
  }

  private generateTradeoffs(
    bestMatch: {model: {providerId: string, modelId: string}, costResult: CostEstimationResult, performance: ModelPerformance},
    alternative: {model: {providerId: string, modelId: string}, costResult: CostEstimationResult, performance: ModelPerformance}
  ): string[] {
    const tradeoffs: string[] = []

    // Quality tradeoff
    if (bestMatch.performance.quality > alternative.performance.quality) {
      tradeoffs.push('Lower quality output')
    } else if (bestMatch.performance.quality < alternative.performance.quality) {
      tradeoffs.push('Higher quality output')
    }

    // Speed tradeoff
    if (bestMatch.performance.speed > alternative.performance.speed) {
      tradeoffs.push('Slower response time')
    } else if (bestMatch.performance.speed < alternative.performance.speed) {
      tradeoffs.push('Faster response time')
    }

    // Cost tradeoff
    if (bestMatch.costResult.estimatedCost < alternative.costResult.estimatedCost) {
      tradeoffs.push('Higher cost')
    } else if (bestMatch.costResult.estimatedCost > alternative.costResult.estimatedCost) {
      tradeoffs.push('Lower cost')
    }

    return tradeoffs
  }

  private generateOptimizationReasoning(
    bestMatch: {model: {providerId: string, modelId: string}, costResult: CostEstimationResult, performance: ModelPerformance},
    requirements: OptimizationRequirements
  ): string[] {
    const reasoning: string[] = []

    reasoning.push(`Selected ${bestMatch.model.providerId}:${bestMatch.model.modelId} as the optimal choice`)

    if (requirements.quality) {
      reasoning.push(`Quality requirement '${requirements.quality}' met with score ${bestMatch.performance.quality}/10`)
    }

    if (requirements.speed) {
      reasoning.push(`Speed requirement '${requirements.speed}' met with score ${bestMatch.performance.speed}/10`)
    }

    reasoning.push(`Estimated cost: $${bestMatch.costResult.estimatedCost.toFixed(4)}`)

    return reasoning
  }

  private getModelTradeoffs(request: CostEstimationRequest, alternativeModel: {providerId: string, modelId: string}): string[] {
    const tradeoffs: string[] = []
    
    const currentPerformance = this.modelPerformance.get(`${request.providerId}:${request.modelId}`)
    const alternativePerformance = this.modelPerformance.get(`${alternativeModel.providerId}:${alternativeModel.modelId}`)

    if (currentPerformance && alternativePerformance) {
      if (currentPerformance.quality > alternativePerformance.quality) {
        tradeoffs.push('Potentially lower quality output')
      }
      
      if (currentPerformance.speed > alternativePerformance.speed) {
        tradeoffs.push('Potentially slower response time')
      }
      
      if (currentPerformance.reliability > alternativePerformance.reliability) {
        tradeoffs.push('Potentially lower reliability')
      }
    }

    return tradeoffs
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): CostEstimatorConfig {
    return { ...this.config }
  }
}