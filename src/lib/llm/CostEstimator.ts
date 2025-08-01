import { v4 as uuidv4 } from 'uuid'

export interface ICostEstimator {
  initialize(config: CostEstimatorConfig): Promise<void>
  estimateCost(request: CostEstimationRequest): Promise<CostEstimationResult>
  estimateBatchCost(requests: CostEstimationRequest[]): Promise<BatchCostEstimation>
  getCostHistory(agentId?: string, timeRange?: TimeRange): Promise<CostHistory>
  getCostBreakdown(agentId?: string, timeRange?: TimeRange): Promise<CostBreakdown>
  getCostForecast(forecastPeriod: ForecastPeriod): Promise<CostForecast>
  getCostOptimizationSuggestions(): Promise<CostOptimizationSuggestion[]>
  setPricing(pricing: ModelPricing): Promise<void>
  getPricing(): Promise<ModelPricing>
  addCustomCostRule(rule: CustomCostRule): Promise<void>
  removeCustomCostRule(ruleId: string): Promise<void>
  getCustomCostRules(): Promise<CustomCostRule[]>
}

export interface CostEstimatorConfig {
  enableForecasting?: boolean
  enableOptimization?: boolean
  enableCustomRules?: boolean
  defaultCurrency?: string
  historicalDataDays?: number
  forecastAccuracy?: number
  optimizationThreshold?: number
}

export interface CostEstimationRequest {
  agentId: string
  model: string
  inputTokens: number
  outputTokens?: number
  requestType: 'chat' | 'completion' | 'embedding' | 'function_calling'
  metadata?: any
}

export interface CostEstimationResult {
  id: string
  requestId?: string
  agentId: string
  model: string
  inputCost: number
  outputCost: number
  totalCost: number
  currency: string
  confidence: number
  factors: CostFactor[]
  optimization: CostOptimization[]
  timestamp: Date
}

export interface CostFactor {
  name: string
  value: number
  impact: 'low' | 'medium' | 'high'
  description: string
}

export interface CostOptimization {
  type: 'model_switch' | 'token_reduction' | 'batching' | 'caching'
  description: string
  potentialSavings: number
  confidence: number
  implementation: string
}

export interface BatchCostEstimation {
  id: string
  requests: CostEstimationResult[]
  totalCost: number
  averageCost: number
  currency: string
  optimization: BatchOptimization[]
  timestamp: Date
}

export interface BatchOptimization {
  type: 'batch_processing' | 'model_selection' | 'request_grouping'
  description: string
  potentialSavings: number
  affectedRequests: string[]
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface CostHistory {
  period: TimeRange
  totalCost: number
  dailyCosts: DailyCost[]
  modelCosts: ModelCost[]
  agentCosts: AgentCost[]
  trends: CostTrend[]
}

export interface DailyCost {
  date: Date
  cost: number
  requests: number
  tokens: number
}

export interface ModelCost {
  model: string
  cost: number
  requests: number
  tokens: number
  averageCostPerRequest: number
  averageCostPerToken: number
}

export interface AgentCost {
  agentId: string
  cost: number
  requests: number
  tokens: number
  averageCostPerRequest: number
  averageCostPerToken: number
}

export interface CostTrend {
  metric: 'total_cost' | 'requests' | 'tokens' | 'cost_per_request' | 'cost_per_token'
  period: 'daily' | 'weekly' | 'monthly'
  direction: 'increasing' | 'decreasing' | 'stable'
  changePercentage: number
  data: TimeSeriesData[]
}

export interface TimeSeriesData {
  timestamp: Date
  value: number
}

export interface CostBreakdown {
  totalCost: number
  byModel: Record<string, number>
  byAgent: Record<string, number>
  byRequestType: Record<string, number>
  byTime: TimeSeriesData[]
  currency: string
}

export interface ForecastPeriod {
  start: Date
  end: Date
  granularity: 'daily' | 'weekly' | 'monthly'
}

export interface CostForecast {
  id: string
  period: ForecastPeriod
  forecast: ForecastData[]
  confidence: number
  factors: ForecastFactor[]
  recommendations: string[]
  timestamp: Date
}

export interface ForecastData {
  date: Date
  predictedCost: number
  lowerBound: number
  upperBound: number
  confidence: number
}

export interface ForecastFactor {
  name: string
  impact: 'positive' | 'negative' | 'neutral'
  magnitude: number
  description: string
}

export interface CostOptimizationSuggestion {
  id: string
  type: 'model_selection' | 'token_optimization' | 'batching' | 'caching' | 'scheduling'
  title: string
  description: string
  potentialSavings: number
  implementationDifficulty: 'low' | 'medium' | 'high'
  priority: 'low' | 'medium' | 'high'
  estimatedImplementationTime: string
  steps: string[]
  impact: OptimizationImpact
}

export interface OptimizationImpact {
  costReduction: number
  performanceChange: number
  qualityChange: number
  reliabilityChange: number
}

export interface ModelPricing {
  [model: string]: ModelPricingInfo
}

export interface ModelPricingInfo {
  inputTokenPrice: number
  outputTokenPrice: number
  currency: string
  effectiveDate?: Date
  minTokens?: number
  maxTokens?: number
  tieredPricing?: TieredPricing[]
}

export interface TieredPricing {
  minTokens: number
  maxTokens: number
  inputTokenPrice: number
  outputTokenPrice: number
}

export interface CustomCostRule {
  id: string
  name: string
  description: string
  condition: CostRuleCondition
  action: CostRuleAction
  priority: number
  enabled: boolean
  createdAt: Date
  lastModified: Date
}

export interface CostRuleCondition {
  agentId?: string
  model?: string
  requestType?: string
  minTokens?: number
  maxTokens?: number
  timeRange?: TimeRange
  customCondition?: (request: CostEstimationRequest) => Promise<boolean>
}

export interface CostRuleAction {
  type: 'multiplier' | 'fixed_cost' | 'discount' | 'surcharge'
  value: number
  description: string
}

export class CostEstimator implements ICostEstimator {
  private config!: CostEstimatorConfig
  private pricing: ModelPricing = {}
  private customRules: Map<string, CustomCostRule> = new Map()
  private costHistory: CostHistory[] = []
  private initialized = false

  async initialize(config: CostEstimatorConfig): Promise<void> {
    try {
      this.config = {
        enableForecasting: true,
        enableOptimization: true,
        enableCustomRules: true,
        defaultCurrency: 'USD',
        historicalDataDays: 30,
        forecastAccuracy: 0.85,
        optimizationThreshold: 0.1,
        ...config
      }

      // Initialize default pricing
      this.initializeDefaultPricing()

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
      // Get base pricing
      const modelPricing = this.pricing[request.model]
      if (!modelPricing) {
        throw new Error(`No pricing information available for model: ${request.model}`)
      }

      // Calculate base cost
      const inputCost = (request.inputTokens / 1000) * modelPricing.inputTokenPrice
      const outputCost = ((request.outputTokens || 0) / 1000) * modelPricing.outputTokenPrice
      let totalCost = inputCost + outputCost

      // Apply custom rules
      const ruleAdjustments = await this.applyCustomRules(request, totalCost)
      totalCost += ruleAdjustments

      // Calculate confidence
      const confidence = this.calculateConfidence(request, modelPricing)

      // Generate cost factors
      const factors = this.generateCostFactors(request, modelPricing)

      // Generate optimization suggestions
      const optimizations = this.generateOptimizations(request, modelPricing)

      return {
        id: uuidv4(),
        agentId: request.agentId,
        model: request.model,
        inputCost,
        outputCost,
        totalCost,
        currency: modelPricing.currency,
        confidence,
        factors,
        optimizations,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to estimate cost:', error)
      throw error
    }
  }

  async estimateBatchCost(requests: CostEstimationRequest[]): Promise<BatchCostEstimation> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      // Estimate individual costs
      const individualResults = await Promise.all(
        requests.map(request => this.estimateCost(request))
      )

      // Calculate total and average costs
      const totalCost = individualResults.reduce((sum, result) => sum + result.totalCost, 0)
      const averageCost = totalCost / individualResults.length

      // Generate batch optimizations
      const optimizations = this.generateBatchOptimizations(requests, individualResults)

      return {
        id: uuidv4(),
        requests: individualResults,
        totalCost,
        averageCost,
        currency: this.config.defaultCurrency!,
        optimizations,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to estimate batch cost:', error)
      throw error
    }
  }

  async getCostHistory(agentId?: string, timeRange?: TimeRange): Promise<CostHistory> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      // In a real implementation, this would query a database
      // For now, we'll return mock data
      const period = timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      }

      const dailyCosts = this.generateMockDailyCosts(period)
      const modelCosts = this.generateMockModelCosts()
      const agentCosts = this.generateMockAgentCosts()
      const trends = this.generateMockTrends()

      return {
        period,
        totalCost: dailyCosts.reduce((sum, day) => sum + day.cost, 0),
        dailyCosts,
        modelCosts,
        agentCosts,
        trends
      }
    } catch (error) {
      console.error('Failed to get cost history:', error)
      throw error
    }
  }

  async getCostBreakdown(agentId?: string, timeRange?: TimeRange): Promise<CostBreakdown> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      // Get cost history
      const history = await this.getCostHistory(agentId, timeRange)

      // Calculate breakdowns
      const byModel: Record<string, number> = {}
      const byAgent: Record<string, number> = {}
      const byRequestType: Record<string, number> = {}

      for (const modelCost of history.modelCosts) {
        byModel[modelCost.model] = modelCost.cost
      }

      for (const agentCost of history.agentCosts) {
        byAgent[agentCost.agentId] = agentCost.cost
      }

      // Mock request type breakdown
      byRequestType['chat'] = history.totalCost * 0.6
      byRequestType['completion'] = history.totalCost * 0.3
      byRequestType['embedding'] = history.totalCost * 0.1

      return {
        totalCost: history.totalCost,
        byModel,
        byAgent,
        byRequestType,
        byTime: history.dailyCosts.map(day => ({
          timestamp: day.date,
          value: day.cost
        })),
        currency: this.config.defaultCurrency!
      }
    } catch (error) {
      console.error('Failed to get cost breakdown:', error)
      throw error
    }
  }

  async getCostForecast(forecastPeriod: ForecastPeriod): Promise<CostForecast> {
    if (!this.initialized || !this.config.enableForecasting) {
      throw new Error('Cost forecasting not enabled')
    }

    try {
      // Get historical data
      const history = await this.getCostHistory(undefined, {
        start: new Date(Date.now() - this.config.historicalDataDays! * 24 * 60 * 60 * 1000),
        end: new Date()
      })

      // Generate forecast
      const forecast = this.generateForecast(history, forecastPeriod)

      // Generate forecast factors
      const factors = this.generateForecastFactors()

      // Generate recommendations
      const recommendations = this.generateForecastRecommendations({
        id: uuidv4(),
        period: forecastPeriod,
        forecast,
        confidence: this.config.forecastAccuracy!,
        factors: [],
        recommendations: [],
        timestamp: new Date()
      })

      return {
        id: uuidv4(),
        period: forecastPeriod,
        forecast,
        confidence: this.config.forecastAccuracy!,
        factors,
        recommendations,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to get cost forecast:', error)
      throw error
    }
  }

  async getCostOptimizationSuggestions(): Promise<CostOptimizationSuggestion[]> {
    if (!this.initialized || !this.config.enableOptimization) {
      throw new Error('Cost optimization not enabled')
    }

    try {
      const suggestions: CostOptimizationSuggestion[] = []

      // Model selection optimization
      suggestions.push({
        id: uuidv4(),
        type: 'model_selection',
        title: 'Optimize Model Selection',
        description: 'Switch to more cost-effective models for specific tasks',
        potentialSavings: 0.25, // 25% savings
        implementationDifficulty: 'medium',
        priority: 'high',
        estimatedImplementationTime: '1-2 weeks',
        steps: [
          'Analyze current model usage patterns',
          'Identify opportunities for model substitution',
          'Implement model selection logic',
          'Monitor and adjust based on performance'
        ],
        impact: {
          costReduction: 0.25,
          performanceChange: -0.05,
          qualityChange: -0.02,
          reliabilityChange: 0
        }
      })

      // Token optimization
      suggestions.push({
        id: uuidv4(),
        type: 'token_optimization',
        title: 'Optimize Token Usage',
        description: 'Reduce token consumption through prompt optimization and caching',
        potentialSavings: 0.15, // 15% savings
        implementationDifficulty: 'low',
        priority: 'medium',
        estimatedImplementationTime: '3-5 days',
        steps: [
          'Implement prompt optimization',
          'Add response caching',
          'Optimize context windows',
          'Monitor token usage patterns'
        ],
        impact: {
          costReduction: 0.15,
          performanceChange: 0.1,
          qualityChange: 0,
          reliabilityChange: 0.05
        }
      })

      // Batching optimization
      suggestions.push({
        id: uuidv4(),
        type: 'batching',
        title: 'Implement Request Batching',
        description: 'Batch similar requests to reduce API calls and costs',
        potentialSavings: 0.1, // 10% savings
        implementationDifficulty: 'medium',
        priority: 'medium',
        estimatedImplementationTime: '1 week',
        steps: [
          'Identify batchable request patterns',
          'Implement batching logic',
          'Add queue management',
          'Monitor batch performance'
        ],
        impact: {
          costReduction: 0.1,
          performanceChange: -0.1,
          qualityChange: 0,
          reliabilityChange: 0.02
        }
      })

      return suggestions.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
    } catch (error) {
      console.error('Failed to get cost optimization suggestions:', error)
      throw error
    }
  }

  async setPricing(pricing: ModelPricing): Promise<void> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      this.pricing = { ...pricing }
      console.log('Pricing updated successfully')
    } catch (error) {
      console.error('Failed to set pricing:', error)
      throw error
    }
  }

  async getPricing(): Promise<ModelPricing> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    return { ...this.pricing }
  }

  async addCustomCostRule(rule: CustomCostRule): Promise<void> {
    if (!this.initialized || !this.config.enableCustomRules) {
      throw new Error('Custom cost rules not enabled')
    }

    try {
      this.customRules.set(rule.id, rule)
      console.log(`Custom cost rule ${rule.name} added successfully`)
    } catch (error) {
      console.error('Failed to add custom cost rule:', error)
      throw error
    }
  }

  async removeCustomCostRule(ruleId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    try {
      const deleted = this.customRules.delete(ruleId)
      if (!deleted) {
        throw new Error(`Custom cost rule ${ruleId} not found`)
      }
      console.log(`Custom cost rule ${ruleId} removed successfully`)
    } catch (error) {
      console.error('Failed to remove custom cost rule:', error)
      throw error
    }
  }

  async getCustomCostRules(): Promise<CustomCostRule[]> {
    if (!this.initialized) {
      throw new Error('Cost estimator not initialized')
    }

    return Array.from(this.customRules.values())
  }

  private async applyCustomRules(request: CostEstimationRequest, baseCost: number): Promise<number> {
    if (!this.config.enableCustomRules) {
      return 0
    }

    let adjustment = 0

    for (const rule of this.customRules.values()) {
      if (!rule.enabled) continue

      if (await this.matchesRuleCondition(rule.condition, request)) {
        switch (rule.action.type) {
          case 'multiplier':
            adjustment += baseCost * rule.action.value
            break
          case 'fixed_cost':
            adjustment += rule.action.value
            break
          case 'discount':
            adjustment -= baseCost * rule.action.value
            break
          case 'surcharge':
            adjustment += baseCost * rule.action.value
            break
        }
      }
    }

    return adjustment
  }

  private async matchesRuleCondition(condition: CostRuleCondition, request: CostEstimationRequest): Promise<boolean> {
    // Check agent ID
    if (condition.agentId && condition.agentId !== request.agentId) {
      return false
    }

    // Check model
    if (condition.model && condition.model !== request.model) {
      return false
    }

    // Check request type
    if (condition.requestType && condition.requestType !== request.requestType) {
      return false
    }

    // Check token range
    const totalTokens = request.inputTokens + (request.outputTokens || 0)
    if (condition.minTokens && totalTokens < condition.minTokens) {
      return false
    }

    if (condition.maxTokens && totalTokens > condition.maxTokens) {
      return false
    }

    // Check time range
    if (condition.timeRange) {
      const now = new Date()
      if (now < condition.timeRange.start || now > condition.timeRange.end) {
        return false
      }
    }

    // Check custom condition
    if (condition.customCondition) {
      return await condition.customCondition(request)
    }

    return true
  }

  private calculateConfidence(request: CostEstimationRequest, pricing: ModelPricingInfo): number {
    let confidence = 0.9 // Base confidence

    // Reduce confidence for extreme token counts
    const totalTokens = request.inputTokens + (request.outputTokens || 0)
    if (totalTokens < 100 || totalTokens > 10000) {
      confidence -= 0.1
    }

    // Reduce confidence if output tokens are not provided
    if (!request.outputTokens) {
      confidence -= 0.1
    }

    // Adjust confidence based on pricing stability
    if (pricing.effectiveDate) {
      const daysSincePricingUpdate = (Date.now() - pricing.effectiveDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSincePricingUpdate > 30) {
        confidence -= 0.05
      }
    }

    return Math.max(0.1, Math.min(1, confidence))
  }

  private generateCostFactors(request: CostEstimationRequest, pricing: ModelPricingInfo): CostFactor[] {
    const factors: CostFactor[] = []

    // Input tokens factor
    factors.push({
      name: 'Input Tokens',
      value: request.inputTokens,
      impact: request.inputTokens > 1000 ? 'high' : 'medium',
      description: `${request.inputTokens} input tokens at $${pricing.inputTokenPrice.toFixed(4)} per 1K tokens`
    })

    // Output tokens factor
    if (request.outputTokens) {
      factors.push({
        name: 'Output Tokens',
        value: request.outputTokens,
        impact: request.outputTokens > 1000 ? 'high' : 'medium',
        description: `${request.outputTokens} output tokens at $${pricing.outputTokenPrice.toFixed(4)} per 1K tokens`
      })
    }

    // Model efficiency factor
    const totalTokens = request.inputTokens + (request.outputTokens || 0)
    const efficiency = totalTokens > 0 ? (request.outputTokens || 0) / totalTokens : 0
    factors.push({
      name: 'Model Efficiency',
      value: efficiency,
      impact: efficiency > 0.7 ? 'high' : 'medium',
      description: `Output-to-input ratio: ${(efficiency * 100).toFixed(1)}%`
    })

    return factors
  }

  private generateOptimizations(request: CostEstimationRequest, pricing: ModelPricingInfo): CostOptimization[] {
    const optimizations: CostOptimization[] = []

    // Model switching optimization
    if (request.model.includes('gpt-4') && request.inputTokens < 1000) {
      optimizations.push({
        type: 'model_switch',
        description: 'Consider using GPT-3.5-turbo for shorter requests',
        potentialSavings: 0.6, // 60% savings
        confidence: 0.8,
        implementation: 'Update model selection logic to use GPT-3.5-turbo for requests with < 1000 input tokens'
      })
    }

    // Token reduction optimization
    if (request.inputTokens > 2000) {
      optimizations.push({
        type: 'token_reduction',
        description: 'Optimize prompts to reduce input tokens',
        potentialSavings: 0.2, // 20% savings
        confidence: 0.7,
        implementation: 'Implement prompt optimization techniques to reduce token count while maintaining quality'
      })
    }

    return optimizations
  }

  private generateBatchOptimizations(requests: CostEstimationRequest[], results: CostEstimationResult[]): BatchOptimization[] {
    const optimizations: BatchOptimization[] = []

    // Batch processing optimization
    if (requests.length > 5) {
      optimizations.push({
        type: 'batch_processing',
        description: 'Process requests in batches to reduce API overhead',
        potentialSavings: 0.05, // 5% savings
        affectedRequests: requests.map(r => r.agentId)
      })
    }

    // Model selection optimization
    const modelUsage: Record<string, number> = {}
    results.forEach(result => {
      modelUsage[result.model] = (modelUsage[result.model] || 0) + 1
    })

    const mostUsedModel = Object.entries(modelUsage).sort((a, b) => b[1] - a[1])[0]
    if (mostUsedModel && mostUsedModel[1] > requests.length * 0.8) {
      optimizations.push({
        type: 'model_selection',
        description: `Standardize on ${mostUsedModel[0]} for consistent pricing`,
        potentialSavings: 0.03, // 3% savings
        affectedRequests: requests.map(r => r.agentId)
      })
    }

    return optimizations
  }

  private generateMockDailyCosts(period: TimeRange): DailyCost[] {
    const dailyCosts: DailyCost[] = []
    const current = new Date(period.start)

    while (current <= period.end) {
      const cost = Math.random() * 100 + 50 // Random cost between $50-$150
      const requests = Math.floor(Math.random() * 100) + 50
      const tokens = Math.floor(Math.random() * 50000) + 10000

      dailyCosts.push({
        date: new Date(current),
        cost,
        requests,
        tokens
      })

      current.setDate(current.getDate() + 1)
    }

    return dailyCosts
  }

  private generateMockModelCosts(): ModelCost[] {
    return [
      {
        model: 'gpt-4',
        cost: 1200,
        requests: 200,
        tokens: 150000,
        averageCostPerRequest: 6,
        averageCostPerToken: 0.008
      },
      {
        model: 'gpt-3.5-turbo',
        cost: 800,
        requests: 500,
        tokens: 300000,
        averageCostPerRequest: 1.6,
        averageCostPerToken: 0.0027
      },
      {
        model: 'text-embedding-ada-002',
        cost: 200,
        requests: 1000,
        tokens: 500000,
        averageCostPerRequest: 0.2,
        averageCostPerToken: 0.0004
      }
    ]
  }

  private generateMockAgentCosts(): AgentCost[] {
    return [
      {
        agentId: 'inbox-agent',
        cost: 1000,
        requests: 800,
        tokens: 400000,
        averageCostPerRequest: 1.25,
        averageCostPerToken: 0.0025
      },
      {
        agentId: 'calendar-agent',
        cost: 600,
        requests: 400,
        tokens: 200000,
        averageCostPerRequest: 1.5,
        averageCostPerToken: 0.003
      },
      {
        agentId: 'orchestrator',
        cost: 800,
        requests: 300,
        tokens: 250000,
        averageCostPerRequest: 2.67,
        averageCostPerToken: 0.0032
      }
    ]
  }

  private generateMockTrends(): CostTrend[] {
    return [
      {
        metric: 'total_cost',
        period: 'daily',
        direction: 'increasing',
        changePercentage: 5.2,
        data: []
      },
      {
        metric: 'requests',
        period: 'daily',
        direction: 'stable',
        changePercentage: 1.1,
        data: []
      },
      {
        metric: 'cost_per_request',
        period: 'daily',
        direction: 'decreasing',
        changePercentage: -3.5,
        data: []
      }
    ]
  }

  private generateForecast(history: CostHistory, period: ForecastPeriod): ForecastData[] {
    const forecast: ForecastData[] = []
    const current = new Date(period.start)
    const baseCost = history.totalCost / history.dailyCosts.length

    while (current <= period.end) {
      const trend = 1.02 // 2% daily growth
      const noise = 0.9 + Math.random() * 0.2 // Random noise
      const predictedCost = baseCost * trend * noise

      forecast.push({
        date: new Date(current),
        predictedCost,
        lowerBound: predictedCost * 0.8,
        upperBound: predictedCost * 1.2,
        confidence: this.config.forecastAccuracy!
      })

      if (period.granularity === 'daily') {
        current.setDate(current.getDate() + 1)
      } else if (period.granularity === 'weekly') {
        current.setDate(current.getDate() + 7)
      } else if (period.granularity === 'monthly') {
        current.setMonth(current.getMonth() + 1)
      }
    }

    return forecast
  }

  private generateForecastFactors(): ForecastFactor[] {
    return [
      {
        name: 'Historical Growth',
        impact: 'positive',
        magnitude: 0.05,
        description: '5% monthly growth based on historical data'
      },
      {
        name: 'Seasonal Variation',
        impact: 'neutral',
        magnitude: 0.02,
        description: 'Expected seasonal variation of ±2%'
      },
      {
        name: 'Model Updates',
        impact: 'negative',
        magnitude: 0.03,
        description: 'Potential cost reduction from new model releases'
      }
    ]
  }

  private generateForecastRecommendations(forecast: CostForecast): string[] {
    const recommendations: string[] = []

    const totalPredictedCost = forecast.forecast.reduce((sum, data) => sum + data.predictedCost, 0)
    
    if (totalPredictedCost > 10000) {
      recommendations.push('Consider implementing cost optimization measures to control projected spending')
    }

    if (forecast.forecast.some(data => data.predictedCost > 500)) {
      recommendations.push('Monitor daily costs and implement spending limits if necessary')
    }

    recommendations.push('Review and update pricing models regularly to ensure accurate forecasting')

    return recommendations
  }

  private initializeDefaultPricing(): void {
    this.pricing = {
      'gpt-4': {
        inputTokenPrice: 0.03,
        outputTokenPrice: 0.06,
        currency: 'USD'
      },
      'gpt-4-32k': {
        inputTokenPrice: 0.06,
        outputTokenPrice: 0.12,
        currency: 'USD'
      },
      'gpt-3.5-turbo': {
        inputTokenPrice: 0.0015,
        outputTokenPrice: 0.002,
        currency: 'USD'
      },
      'text-embedding-ada-002': {
        inputTokenPrice: 0.0004,
        outputTokenPrice: 0.0004,
        currency: 'USD'
      },
      'claude-3-opus-20240229': {
        inputTokenPrice: 0.015,
        outputTokenPrice: 0.075,
        currency: 'USD'
      },
      'claude-3-sonnet-20240229': {
        inputTokenPrice: 0.003,
        outputTokenPrice: 0.015,
        currency: 'USD'
      },
      'claude-3-haiku-20240307': {
        inputTokenPrice: 0.00025,
        outputTokenPrice: 0.00125,
        currency: 'USD'
      }
    }
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): CostEstimatorConfig {
    return { ...this.config }
  }

  resetData(): void {
    this.costHistory = []
    this.customRules.clear()
  }
}