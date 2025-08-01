import { v4 as uuidv4 } from 'uuid'

export interface ITokenTracker {
  initialize(config: TokenTrackerConfig): Promise<void>
  trackUsage(providerId: string, modelId: string, usage: TokenUsage): Promise<void>
  getUsageStats(providerId?: string, modelId?: string, timeRange?: TimeRange): Promise<UsageStats>
  getCostEstimate(providerId: string, modelId: string, estimatedTokens: number): Promise<number>
  getBudgetAlerts(): Promise<BudgetAlert[]>
  setBudgetLimit(budgetLimit: BudgetLimit): Promise<void>
  getCostBreakdown(timeRange?: TimeRange): Promise<CostBreakdown>
  exportUsageReport(timeRange?: TimeRange): Promise<UsageReport>
}

export interface TokenTrackerConfig {
  enableBudgetTracking?: boolean
  enableCostOptimization?: boolean
  budgetLimit?: BudgetLimit
  alertThreshold?: number
  currency?: string
  pricingProvider?: 'openai' | 'anthropic' | 'custom'
  customPricing?: Record<string, ModelPricing>
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  averageTokensPerRequest: number
  totalCost: number
  averageCostPerRequest: number
  averageCostPerToken: number
  timeRange: TimeRange
  providerStats: Record<string, ProviderStats>
  modelStats: Record<string, ModelStats>
}

export interface ProviderStats {
  totalRequests: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCost: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
  averageCostPerToken: number
}

export interface ModelStats {
  totalRequests: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCost: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
  averageCostPerToken: number
}

export interface BudgetAlert {
  id: string
  type: 'warning' | 'critical'
  message: string
  currentUsage: number
  budgetLimit: number
  percentage: number
  timestamp: Date
}

export interface BudgetLimit {
  daily?: number
  weekly?: number
  monthly?: number
  total?: number
}

export interface ModelPricing {
  promptTokenPrice: number // Price per 1K tokens
  completionTokenPrice: number // Price per 1K tokens
  currency: string
}

export interface CostBreakdown {
  totalCost: number
  providerBreakdown: Record<string, ProviderCostBreakdown>
  modelBreakdown: Record<string, ModelCostBreakdown>
  timeSeriesData: CostTimeSeriesPoint[]
}

export interface ProviderCostBreakdown {
  totalCost: number
  totalTokens: number
  averageCostPerToken: number
  modelBreakdown: Record<string, ModelCostBreakdown>
}

export interface ModelCostBreakdown {
  totalCost: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageCostPerToken: number
  requestCount: number
}

export interface CostTimeSeriesPoint {
  timestamp: Date
  cost: number
  tokens: number
  requests: number
}

export interface UsageReport {
  generatedAt: Date
  timeRange: TimeRange
  summary: UsageStats
  costBreakdown: CostBreakdown
  recommendations: string[]
  budgetAlerts: BudgetAlert[]
}

export class TokenTracker implements ITokenTracker {
  private config!: TokenTrackerConfig
  private usageData: Map<string, UsageRecord[]> = new Map()
  private budgetLimit: BudgetLimit = {}
  private alerts: BudgetAlert[] = []
  private initialized = false

  async initialize(config: TokenTrackerConfig): Promise<void> {
    try {
      this.config = {
        enableBudgetTracking: true,
        enableCostOptimization: true,
        alertThreshold: 0.8, // 80% of budget limit
        currency: 'USD',
        pricingProvider: 'openai',
        ...config
      }

      if (config.budgetLimit) {
        this.budgetLimit = config.budgetLimit
      }

      this.initialized = true
      console.log('Token tracker initialized successfully')
    } catch (error) {
      console.error('Failed to initialize token tracker:', error)
      throw error
    }
  }

  async trackUsage(providerId: string, modelId: string, usage: TokenUsage): Promise<void> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      const record: UsageRecord = {
        id: uuidv4(),
        providerId,
        modelId,
        usage,
        timestamp: new Date(),
        cost: await this.calculateCost(providerId, modelId, usage)
      }

      const key = `${providerId}:${modelId}`
      const records = this.usageData.get(key) || []
      records.push(record)
      this.usageData.set(key, records)

      // Check budget alerts if enabled
      if (this.config.enableBudgetTracking) {
        await this.checkBudgetAlerts()
      }
    } catch (error) {
      console.error(`Failed to track usage for ${providerId}:${modelId}:`, error)
      throw error
    }
  }

  async getUsageStats(providerId?: string, modelId?: string, timeRange?: TimeRange): Promise<UsageStats> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    const allRecords = this.getAllRecords(providerId, modelId, timeRange)
    
    if (allRecords.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        averageTokensPerRequest: 0,
        totalCost: 0,
        averageCostPerRequest: 0,
        averageCostPerToken: 0,
        timeRange: timeRange || { start: new Date(), end: new Date() },
        providerStats: {},
        modelStats: {}
      }
    }

    const totalRequests = allRecords.length
    const totalTokens = allRecords.reduce((sum, record) => sum + record.usage.totalTokens, 0)
    const totalPromptTokens = allRecords.reduce((sum, record) => sum + record.usage.promptTokens, 0)
    const totalCompletionTokens = allRecords.reduce((sum, record) => sum + record.usage.completionTokens, 0)
    const totalCost = allRecords.reduce((sum, record) => sum + record.cost, 0)

    const providerStats: Record<string, ProviderStats> = {}
    const modelStats: Record<string, ModelStats> = {}

    // Calculate provider stats
    const providerGroups = this.groupBy(allRecords, 'providerId')
    for (const [pid, records] of providerGroups.entries()) {
      const pTotalTokens = records.reduce((sum, r) => sum + r.usage.totalTokens, 0)
      const pTotalCost = records.reduce((sum, r) => sum + r.cost, 0)
      
      providerStats[pid] = {
        totalRequests: records.length,
        totalTokens: pTotalTokens,
        totalPromptTokens: records.reduce((sum, r) => sum + r.usage.promptTokens, 0),
        totalCompletionTokens: records.reduce((sum, r) => sum + r.usage.completionTokens, 0),
        totalCost: pTotalCost,
        averageTokensPerRequest: pTotalTokens / records.length,
        averageCostPerRequest: pTotalCost / records.length,
        averageCostPerToken: pTotalCost / pTotalTokens
      }
    }

    // Calculate model stats
    const modelGroups = this.groupBy(allRecords, 'modelId')
    for (const [mid, records] of modelGroups.entries()) {
      const mTotalTokens = records.reduce((sum, r) => sum + r.usage.totalTokens, 0)
      const mTotalCost = records.reduce((sum, r) => sum + r.cost, 0)
      
      modelStats[mid] = {
        totalRequests: records.length,
        totalTokens: mTotalTokens,
        totalPromptTokens: records.reduce((sum, r) => sum + r.usage.promptTokens, 0),
        totalCompletionTokens: records.reduce((sum, r) => sum + r.usage.completionTokens, 0),
        totalCost: mTotalCost,
        averageTokensPerRequest: mTotalTokens / records.length,
        averageCostPerRequest: mTotalCost / records.length,
        averageCostPerToken: mTotalCost / mTotalTokens
      }
    }

    return {
      totalRequests,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      averageTokensPerRequest: totalTokens / totalRequests,
      totalCost,
      averageCostPerRequest: totalCost / totalRequests,
      averageCostPerToken: totalCost / totalTokens,
      timeRange: timeRange || this.getTimeRange(allRecords),
      providerStats,
      modelStats
    }
  }

  async getCostEstimate(providerId: string, modelId: string, estimatedTokens: number): Promise<number> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    // Simple estimation - assume 60% prompt tokens, 40% completion tokens
    const estimatedPromptTokens = Math.floor(estimatedTokens * 0.6)
    const estimatedCompletionTokens = estimatedTokens - estimatedPromptTokens

    const pricing = await this.getModelPricing(providerId, modelId)
    const promptCost = (estimatedPromptTokens / 1000) * pricing.promptTokenPrice
    const completionCost = (estimatedCompletionTokens / 1000) * pricing.completionTokenPrice

    return promptCost + completionCost
  }

  async getBudgetAlerts(): Promise<BudgetAlert[]> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    return [...this.alerts]
  }

  async setBudgetLimit(budgetLimit: BudgetLimit): Promise<void> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    this.budgetLimit = budgetLimit
    await this.checkBudgetAlerts()
  }

  async getCostBreakdown(timeRange?: TimeRange): Promise<CostBreakdown> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    const allRecords = this.getAllRecords(undefined, undefined, timeRange)
    
    if (allRecords.length === 0) {
      return {
        totalCost: 0,
        providerBreakdown: {},
        modelBreakdown: {},
        timeSeriesData: []
      }
    }

    const totalCost = allRecords.reduce((sum, record) => sum + record.cost, 0)

    // Provider breakdown
    const providerBreakdown: Record<string, ProviderCostBreakdown> = {}
    const providerGroups = this.groupBy(allRecords, 'providerId')
    for (const [pid, records] of providerGroups.entries()) {
      const pTotalCost = records.reduce((sum, r) => sum + r.cost, 0)
      const pTotalTokens = records.reduce((sum, r) => sum + r.usage.totalTokens, 0)
      
      providerBreakdown[pid] = {
        totalCost: pTotalCost,
        totalTokens: pTotalTokens,
        averageCostPerToken: pTotalCost / pTotalTokens,
        modelBreakdown: {}
      }

      // Model breakdown within provider
      const modelGroups = this.groupBy(records, 'modelId')
      for (const [mid, mRecords] of modelGroups.entries()) {
        const mTotalCost = mRecords.reduce((sum, r) => sum + r.cost, 0)
        const mTotalTokens = mRecords.reduce((sum, r) => sum + r.usage.totalTokens, 0)
        
        providerBreakdown[pid].modelBreakdown[mid] = {
          totalCost: mTotalCost,
          totalTokens: mTotalTokens,
          promptTokens: mRecords.reduce((sum, r) => sum + r.usage.promptTokens, 0),
          completionTokens: mRecords.reduce((sum, r) => sum + r.usage.completionTokens, 0),
          averageCostPerToken: mTotalCost / mTotalTokens,
          requestCount: mRecords.length
        }
      }
    }

    // Model breakdown
    const modelBreakdown: Record<string, ModelCostBreakdown> = {}
    const modelGroups = this.groupBy(allRecords, 'modelId')
    for (const [mid, records] of modelGroups.entries()) {
      const mTotalCost = records.reduce((sum, r) => sum + r.cost, 0)
      const mTotalTokens = records.reduce((sum, r) => sum + r.usage.totalTokens, 0)
      
      modelBreakdown[mid] = {
        totalCost: mTotalCost,
        totalTokens: mTotalTokens,
        promptTokens: records.reduce((sum, r) => sum + r.usage.promptTokens, 0),
        completionTokens: records.reduce((sum, r) => sum + r.usage.completionTokens, 0),
        averageCostPerToken: mTotalCost / mTotalTokens,
        requestCount: records.length
      }
    }

    // Time series data (hourly buckets)
    const timeSeriesData = this.generateTimeSeriesData(allRecords, timeRange)

    return {
      totalCost,
      providerBreakdown,
      modelBreakdown,
      timeSeriesData
    }
  }

  async exportUsageReport(timeRange?: TimeRange): Promise<UsageReport> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    const summary = await this.getUsageStats(undefined, undefined, timeRange)
    const costBreakdown = await this.getCostBreakdown(timeRange)
    const budgetAlerts = await this.getBudgetAlerts()

    const recommendations = this.generateRecommendations(summary, costBreakdown)

    return {
      generatedAt: new Date(),
      timeRange: timeRange || { start: new Date(), end: new Date() },
      summary,
      costBreakdown,
      recommendations,
      budgetAlerts
    }
  }

  private async calculateCost(providerId: string, modelId: string, usage: TokenUsage): Promise<number> {
    const pricing = await this.getModelPricing(providerId, modelId)
    const promptCost = (usage.promptTokens / 1000) * pricing.promptTokenPrice
    const completionCost = (usage.completionTokens / 1000) * pricing.completionTokenPrice
    return promptCost + completionCost
  }

  private async getModelPricing(providerId: string, modelId: string): Promise<ModelPricing> {
    if (this.config.customPricing && this.config.customPricing[modelId]) {
      return this.config.customPricing[modelId]
    }

    // Default pricing based on provider
    if (this.config.pricingProvider === 'openai') {
      return this.getOpenAIPricing(modelId)
    } else if (this.config.pricingProvider === 'anthropic') {
      return this.getAnthropicPricing(modelId)
    }

    // Default fallback pricing
    return {
      promptTokenPrice: 0.002,
      completionTokenPrice: 0.002,
      currency: this.config.currency || 'USD'
    }
  }

  private getOpenAIPricing(modelId: string): ModelPricing {
    // Simplified OpenAI pricing
    if (modelId.includes('gpt-4')) {
      return {
        promptTokenPrice: 0.03,
        completionTokenPrice: 0.06,
        currency: this.config.currency || 'USD'
      }
    } else if (modelId.includes('gpt-3.5')) {
      return {
        promptTokenPrice: 0.0015,
        completionTokenPrice: 0.002,
        currency: this.config.currency || 'USD'
      }
    }
    
    return {
      promptTokenPrice: 0.002,
      completionTokenPrice: 0.002,
      currency: this.config.currency || 'USD'
    }
  }

  private getAnthropicPricing(modelId: string): ModelPricing {
    // Simplified Anthropic pricing
    if (modelId.includes('opus')) {
      return {
        promptTokenPrice: 0.015,
        completionTokenPrice: 0.075,
        currency: this.config.currency || 'USD'
      }
    } else if (modelId.includes('sonnet')) {
      return {
        promptTokenPrice: 0.003,
        completionTokenPrice: 0.015,
        currency: this.config.currency || 'USD'
      }
    } else if (modelId.includes('haiku')) {
      return {
        promptTokenPrice: 0.00025,
        completionTokenPrice: 0.00125,
        currency: this.config.currency || 'USD'
      }
    }
    
    return {
      promptTokenPrice: 0.002,
      completionTokenPrice: 0.002,
      currency: this.config.currency || 'USD'
    }
  }

  private getAllRecords(providerId?: string, modelId?: string, timeRange?: TimeRange): UsageRecord[] {
    const allRecords: UsageRecord[] = []
    
    for (const [key, records] of this.usageData.entries()) {
      const [pid, mid] = key.split(':')
      
      if (providerId && pid !== providerId) continue
      if (modelId && mid !== modelId) continue
      
      for (const record of records) {
        if (timeRange) {
          if (record.timestamp < timeRange.start || record.timestamp > timeRange.end) {
            continue
          }
        }
        
        allRecords.push(record)
      }
    }
    
    return allRecords
  }

  private groupBy(records: UsageRecord[], key: 'providerId' | 'modelId'): Map<string, UsageRecord[]> {
    const groups = new Map<string, UsageRecord[]>()
    
    for (const record of records) {
      const groupKey = record[key]
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(record)
    }
    
    return groups
  }

  private getTimeRange(records: UsageRecord[]): TimeRange {
    if (records.length === 0) {
      const now = new Date()
      return { start: now, end: now }
    }
    
    const timestamps = records.map(r => r.timestamp.getTime())
    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps))
    }
  }

  private generateTimeSeriesData(records: UsageRecord[], timeRange?: TimeRange): CostTimeSeriesPoint[] {
    const timeSeriesData: CostTimeSeriesPoint[] = []
    
    if (records.length === 0) {
      return timeSeriesData
    }
    
    const start = timeRange?.start || new Date(Math.min(...records.map(r => r.timestamp.getTime())))
    const end = timeRange?.end || new Date(Math.max(...records.map(r => r.timestamp.getTime())))
    
    // Create hourly buckets
    const current = new Date(start)
    current.setMinutes(0, 0, 0)
    
    while (current <= end) {
      const nextHour = new Date(current)
      nextHour.setHours(nextHour.getHours() + 1)
      
      const hourRecords = records.filter(r => 
        r.timestamp >= current && r.timestamp < nextHour
      )
      
      const hourCost = hourRecords.reduce((sum, r) => sum + r.cost, 0)
      const hourTokens = hourRecords.reduce((sum, r) => sum + r.usage.totalTokens, 0)
      
      timeSeriesData.push({
        timestamp: new Date(current),
        cost: hourCost,
        tokens: hourTokens,
        requests: hourRecords.length
      })
      
      current.setHours(current.getHours() + 1)
    }
    
    return timeSeriesData
  }

  private async checkBudgetAlerts(): Promise<void> {
    this.alerts = []
    
    if (!this.config.enableBudgetTracking) {
      return
    }
    
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    
    // Check daily budget
    if (this.budgetLimit.daily) {
      const dailyUsage = await this.getUsageStats(undefined, undefined, { start: today, end: now })
      const dailyPercentage = dailyUsage.totalCost / this.budgetLimit.daily
      
      if (dailyPercentage >= this.config.alertThreshold!) {
        this.alerts.push({
          id: uuidv4(),
          type: dailyPercentage >= 0.95 ? 'critical' : 'warning',
          message: `Daily budget usage is at ${(dailyPercentage * 100).toFixed(1)}%`,
          currentUsage: dailyUsage.totalCost,
          budgetLimit: this.budgetLimit.daily,
          percentage: dailyPercentage,
          timestamp: new Date()
        })
      }
    }
    
    // Check weekly budget
    if (this.budgetLimit.weekly) {
      const weeklyUsage = await this.getUsageStats(undefined, undefined, { start: weekStart, end: now })
      const weeklyPercentage = weeklyUsage.totalCost / this.budgetLimit.weekly
      
      if (weeklyPercentage >= this.config.alertThreshold!) {
        this.alerts.push({
          id: uuidv4(),
          type: weeklyPercentage >= 0.95 ? 'critical' : 'warning',
          message: `Weekly budget usage is at ${(weeklyPercentage * 100).toFixed(1)}%`,
          currentUsage: weeklyUsage.totalCost,
          budgetLimit: this.budgetLimit.weekly,
          percentage: weeklyPercentage,
          timestamp: new Date()
        })
      }
    }
    
    // Check monthly budget
    if (this.budgetLimit.monthly) {
      const monthlyUsage = await this.getUsageStats(undefined, undefined, { start: monthStart, end: now })
      const monthlyPercentage = monthlyUsage.totalCost / this.budgetLimit.monthly
      
      if (monthlyPercentage >= this.config.alertThreshold!) {
        this.alerts.push({
          id: uuidv4(),
          type: monthlyPercentage >= 0.95 ? 'critical' : 'warning',
          message: `Monthly budget usage is at ${(monthlyPercentage * 100).toFixed(1)}%`,
          currentUsage: monthlyUsage.totalCost,
          budgetLimit: this.budgetLimit.monthly,
          percentage: monthlyPercentage,
          timestamp: new Date()
        })
      }
    }
  }

  private generateRecommendations(summary: UsageStats, costBreakdown: CostBreakdown): string[] {
    const recommendations: string[] = []
    
    // Cost optimization recommendations
    if (summary.averageCostPerToken > 0.01) {
      recommendations.push('Consider using more cost-efficient models for high-volume tasks')
    }
    
    // Model usage recommendations
    const modelCosts = Object.entries(costBreakdown.modelBreakdown)
      .sort((a, b) => b[1].totalCost - a[1].totalCost)
    
    if (modelCosts.length > 1) {
      const mostExpensive = modelCosts[0]
      const leastExpensive = modelCosts[modelCosts.length - 1]
      
      if (mostExpensive[1].averageCostPerToken > leastExpensive[1].averageCostPerToken * 2) {
        recommendations.push(`Consider shifting some workload from ${mostExpensive[0]} to ${leastExpensive[0]} for cost savings`)
      }
    }
    
    // Usage pattern recommendations
    if (summary.averageTokensPerRequest > 4000) {
      recommendations.push('Consider breaking down large requests into smaller chunks to reduce costs')
    }
    
    return recommendations
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): TokenTrackerConfig {
    return { ...this.config }
  }
}

interface UsageRecord {
  id: string
  providerId: string
  modelId: string
  usage: TokenUsage
  timestamp: Date
  cost: number
}