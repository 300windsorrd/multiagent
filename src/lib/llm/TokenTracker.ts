import { v4 as uuidv4 } from 'uuid'

export interface ITokenTracker {
  initialize(config: TokenTrackerConfig): Promise<void>
  trackUsage(usage: TokenUsage): Promise<void>
  getUsageStats(agentId?: string, timeRange?: TimeRange): Promise<UsageStats>
  getCostEstimate(model: string, inputTokens: number, outputTokens?: number): Promise<CostEstimate>
  setBudget(budget: Budget): Promise<void>
  getBudgetStatus(): Promise<BudgetStatus>
  getAlerts(agentId?: string): Promise<TokenAlert[]>
  resolveAlert(alertId: string): Promise<boolean>
  generateReport(timeRange?: TimeRange): Promise<UsageReport>
  exportData(format: 'csv' | 'json' | 'xml', timeRange?: TimeRange): Promise<string>
}

export interface TokenTrackerConfig {
  enableCostTracking?: boolean
  enableBudgetMonitoring?: boolean
  enableAlerts?: boolean
  alertThresholds?: AlertThresholds
  pricing?: ModelPricing
  dataRetentionDays?: number
  maxRecordsPerAgent?: number
}

export interface TokenUsage {
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  timestamp: Date
  requestId?: string
  metadata?: any
}

export interface UsageStats {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  requestCount: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
  modelUsage: Record<string, ModelUsageStats>
  agentUsage: Record<string, AgentUsageStats>
  timeSeriesData: TimeSeriesData[]
}

export interface ModelUsageStats {
  model: string
  tokens: number
  inputTokens: number
  outputTokens: number
  cost: number
  requestCount: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
}

export interface AgentUsageStats {
  tokens: number
  inputTokens: number
  outputTokens: number
  cost: number
  requestCount: number
  averageTokensPerRequest: number
  averageCostPerRequest: number
  lastUsed: Date
}

export interface TimeSeriesData {
  timestamp: Date
  tokens: number
  cost: number
  requests: number
}

export interface CostEstimate {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: string
  model: string
  pricing: ModelPricingInfo
}

export interface Budget {
  id: string
  name: string
  amount: number
  currency: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  startDate: Date
  endDate?: Date
  alertThreshold?: number // Percentage (0-100)
  notifyEmails?: string[]
  notifyWebhooks?: string[]
}

export interface BudgetStatus {
  budget: Budget
  spent: number
  remaining: number
  percentageUsed: number
  daysRemaining?: number
  isOverBudget: boolean
  isNearLimit: boolean
  projectedOverspend?: number
}

export interface TokenAlert {
  id: string
  type: 'budget' | 'usage' | 'cost' | 'rate'
  severity: 'low' | 'medium' | 'high' | 'critical'
  agentId?: string
  message: string
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
  metadata: any
}

export interface AlertThresholds {
  budgetWarning?: number // Percentage (0-100)
  budgetCritical?: number // Percentage (0-100)
  dailyUsageWarning?: number // Number of tokens
  dailyUsageCritical?: number // Number of tokens
  costPerRequestWarning?: number // Currency amount
  rateLimitWarning?: number // Requests per minute
}

export interface ModelPricing {
  [model: string]: ModelPricingInfo
}

export interface ModelPricingInfo {
  inputTokenPrice: number // Price per 1K tokens
  outputTokenPrice: number // Price per 1K tokens
  currency: string
  effectiveDate?: Date
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface UsageReport {
  id: string
  generatedAt: Date
  timeRange: TimeRange
  summary: UsageStats
  topAgents: AgentUsageStats[]
  topModels: ModelUsageStats[]
  costBreakdown: CostBreakdown
  trends: TrendData[]
  recommendations: string[]
}

export interface CostBreakdown {
  byAgent: Record<string, number>
  byModel: Record<string, number>
  byTime: TimeSeriesData[]
}

export interface TrendData {
  metric: string
  period: 'daily' | 'weekly' | 'monthly'
  data: TimeSeriesData[]
  trend: 'increasing' | 'decreasing' | 'stable'
  changePercentage: number
}

export class TokenTracker implements ITokenTracker {
  private config!: TokenTrackerConfig
  private usageData: Map<string, TokenUsage[]> = new Map()
  private alerts: Map<string, TokenAlert[]> = new Map()
  private budget: Budget | null = null
  private pricing: ModelPricing = {}
  private initialized = false

  async initialize(config: TokenTrackerConfig): Promise<void> {
    try {
      this.config = {
        enableCostTracking: true,
        enableBudgetMonitoring: true,
        enableAlerts: true,
        dataRetentionDays: 90,
        maxRecordsPerAgent: 10000,
        alertThresholds: {
          budgetWarning: 70,
          budgetCritical: 90,
          dailyUsageWarning: 100000,
          dailyUsageCritical: 500000,
          costPerRequestWarning: 1.0,
          rateLimitWarning: 100
        },
        ...config
      }

      // Initialize default pricing
      this.initializeDefaultPricing()

      this.initialized = true
      console.log('Token tracker initialized successfully')
    } catch (error) {
      console.error('Failed to initialize token tracker:', error)
      throw error
    }
  }

  async trackUsage(usage: TokenUsage): Promise<void> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      // Add timestamp if not provided
      if (!usage.timestamp) {
        usage.timestamp = new Date()
      }

      // Store usage data
      const agentId = usage.agentId
      if (!this.usageData.has(agentId)) {
        this.usageData.set(agentId, [])
      }

      const agentUsage = this.usageData.get(agentId)!
      agentUsage.push(usage)

      // Enforce data retention limits
      this.enforceDataLimits(agentId)

      // Check for alerts
      if (this.config.enableAlerts) {
        await this.checkForAlerts(usage)
      }

      // Check budget status
      if (this.config.enableBudgetMonitoring && this.budget) {
        await this.checkBudgetStatus()
      }
    } catch (error) {
      console.error('Failed to track token usage:', error)
      throw error
    }
  }

  async getUsageStats(agentId?: string, timeRange?: TimeRange): Promise<UsageStats> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      let allUsage: TokenUsage[] = []

      // Collect usage data
      if (agentId) {
        allUsage = this.usageData.get(agentId) || []
      } else {
        for (const usage of this.usageData.values()) {
          allUsage.push(...usage)
        }
      }

      // Apply time range filter
      if (timeRange) {
        allUsage = allUsage.filter(usage => 
          usage.timestamp >= timeRange.start && usage.timestamp <= timeRange.end
        )
      }

      // Calculate statistics
      const stats = this.calculateUsageStats(allUsage)
      return stats
    } catch (error) {
      console.error('Failed to get usage stats:', error)
      throw error
    }
  }

  async getCostEstimate(model: string, inputTokens: number, outputTokens: number = 0): Promise<CostEstimate> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      const pricing = this.pricing[model]
      if (!pricing) {
        throw new Error(`No pricing information available for model: ${model}`)
      }

      const inputCost = (inputTokens / 1000) * pricing.inputTokenPrice
      const outputCost = (outputTokens / 1000) * pricing.outputTokenPrice
      const totalCost = inputCost + outputCost

      return {
        inputCost,
        outputCost,
        totalCost,
        currency: pricing.currency,
        model,
        pricing
      }
    } catch (error) {
      console.error('Failed to get cost estimate:', error)
      throw error
    }
  }

  async setBudget(budget: Budget): Promise<void> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      this.budget = budget
      console.log(`Budget set: ${budget.name} - ${budget.amount} ${budget.currency}`)
    } catch (error) {
      console.error('Failed to set budget:', error)
      throw error
    }
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      // Calculate total cost in budget period
      const timeRange = this.getBudgetTimeRange(this.budget)
      const usageStats = await this.getUsageStats(undefined, timeRange)
      
      const spent = usageStats.totalCost
      const remaining = this.budget.amount - spent
      const percentageUsed = (spent / this.budget.amount) * 100

      // Calculate days remaining
      const now = new Date()
      const daysRemaining = Math.ceil((this.budget.endDate?.getTime() || now.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      // Check if over budget or near limit
      const isOverBudget = spent > this.budget.amount
      const isNearLimit = percentageUsed > (this.budget.alertThreshold || 90)

      // Calculate projected overspend
      let projectedOverspend = 0
      if (daysRemaining > 0) {
        const dailyAverage = spent / (this.getBudgetPeriodDays(this.budget) - daysRemaining)
        projectedOverspend = Math.max(0, (dailyAverage * daysRemaining) - remaining)
      }

      return {
        budget: this.budget,
        spent,
        remaining,
        percentageUsed,
        daysRemaining,
        isOverBudget,
        isNearLimit,
        projectedOverspend
      }
    } catch (error) {
      console.error('Failed to get budget status:', error)
      throw error
    }
  }

  async getAlerts(agentId?: string): Promise<TokenAlert[]> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      let allAlerts: TokenAlert[] = []

      if (agentId) {
        allAlerts = this.alerts.get(agentId) || []
      } else {
        for (const alerts of this.alerts.values()) {
          allAlerts.push(...alerts)
        }
      }

      // Sort by timestamp (newest first)
      allAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return allAlerts
    } catch (error) {
      console.error('Failed to get alerts:', error)
      throw error
    }
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      // Find and resolve alert
      for (const [agentId, alerts] of this.alerts.entries()) {
        const alert = alerts.find(a => a.id === alertId)
        if (alert) {
          alert.resolved = true
          alert.resolvedAt = new Date()
          return true
        }
      }

      return false
    } catch (error) {
      console.error(`Failed to resolve alert ${alertId}:`, error)
      return false
    }
  }

  async generateReport(timeRange?: TimeRange): Promise<UsageReport> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      // Set default time range if not provided
      if (!timeRange) {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 30) // Last 30 days
        timeRange = { start, end }
      }

      // Get usage stats for the time range
      const usageStats = await this.getUsageStats(undefined, timeRange)

      // Get top agents and models
      const topAgents = this.getTopAgents(10)
      const topModels = this.getTopModels(10)

      // Generate cost breakdown
      const costBreakdown = await this.generateCostBreakdown(timeRange)

      // Analyze trends
      const trends = await this.analyzeTrends(timeRange)

      // Generate recommendations
      const recommendations = await this.generateRecommendations(usageStats, trends)

      return {
        id: uuidv4(),
        generatedAt: new Date(),
        timeRange,
        summary: usageStats,
        topAgents,
        topModels,
        costBreakdown,
        trends,
        recommendations
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
      throw error
    }
  }

  async exportData(format: 'csv' | 'json' | 'xml', timeRange?: TimeRange): Promise<string> {
    if (!this.initialized) {
      throw new Error('Token tracker not initialized')
    }

    try {
      // Get usage data for the time range
      let allUsage: TokenUsage[] = []
      for (const usage of this.usageData.values()) {
        allUsage.push(...usage)
      }

      if (timeRange) {
        allUsage = allUsage.filter(usage => 
          usage.timestamp >= timeRange.start && usage.timestamp <= timeRange.end
        )
      }

      // Export in requested format
      switch (format) {
        case 'csv':
          return this.exportToCSV(allUsage)
        case 'json':
          return JSON.stringify(allUsage, null, 2)
        case 'xml':
          return this.exportToXML(allUsage)
        default:
          throw new Error(`Unsupported export format: ${format}`)
      }
    } catch (error) {
      console.error(`Failed to export data as ${format}:`, error)
      throw error
    }
  }

  private calculateUsageStats(usageData: TokenUsage[]): UsageStats {
    const totalTokens = usageData.reduce((sum, usage) => sum + usage.inputTokens + usage.outputTokens, 0)
    const inputTokens = usageData.reduce((sum, usage) => sum + usage.inputTokens, 0)
    const outputTokens = usageData.reduce((sum, usage) => sum + usage.outputTokens, 0)
    const requestCount = usageData.length

    let totalCost = 0
    const modelUsage: Record<string, ModelUsageStats> = {}
    const agentUsage: Record<string, AgentUsageStats> = {}

    // Calculate model and agent usage
    for (const usage of usageData) {
      // Calculate cost
      const costEstimate = this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)
      totalCost += costEstimate

      // Update model usage
      if (!modelUsage[usage.model]) {
        modelUsage[usage.model] = {
          model: usage.model,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requestCount: 0,
          averageTokensPerRequest: 0,
          averageCostPerRequest: 0
        }
      }

      const modelStats = modelUsage[usage.model]
      modelStats.tokens += usage.inputTokens + usage.outputTokens
      modelStats.inputTokens += usage.inputTokens
      modelStats.outputTokens += usage.outputTokens
      modelStats.cost += costEstimate
      modelStats.requestCount++

      // Update agent usage
      if (!agentUsage[usage.agentId]) {
        agentUsage[usage.agentId] = {
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requestCount: 0,
          averageTokensPerRequest: 0,
          averageCostPerRequest: 0,
          lastUsed: usage.timestamp
        }
      }

      const agentStats = agentUsage[usage.agentId]
      agentStats.tokens += usage.inputTokens + usage.outputTokens
      agentStats.inputTokens += usage.inputTokens
      agentStats.outputTokens += usage.outputTokens
      agentStats.cost += costEstimate
      agentStats.requestCount++
      agentStats.lastUsed = new Date(Math.max(agentStats.lastUsed.getTime(), usage.timestamp.getTime()))
    }

    // Calculate averages
    for (const modelStats of Object.values(modelUsage)) {
      modelStats.averageTokensPerRequest = modelStats.tokens / modelStats.requestCount
      modelStats.averageCostPerRequest = modelStats.cost / modelStats.requestCount
    }

    for (const agentStats of Object.values(agentUsage)) {
      agentStats.averageTokensPerRequest = agentStats.tokens / agentStats.requestCount
      agentStats.averageCostPerRequest = agentStats.cost / agentStats.requestCount
    }

    // Generate time series data
    const timeSeriesData = this.generateTimeSeriesData(usageData)

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      totalCost,
      requestCount,
      averageTokensPerRequest: requestCount > 0 ? totalTokens / requestCount : 0,
      averageCostPerRequest: requestCount > 0 ? totalCost / requestCount : 0,
      modelUsage,
      agentUsage,
      timeSeriesData
    }
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.pricing[model]
    if (!pricing) {
      return 0
    }

    const inputCost = (inputTokens / 1000) * pricing.inputTokenPrice
    const outputCost = (outputTokens / 1000) * pricing.outputTokenPrice
    return inputCost + outputCost
  }

  private generateTimeSeriesData(usageData: TokenUsage[]): TimeSeriesData[] {
    const timeSeriesMap = new Map<string, TimeSeriesData>()

    for (const usage of usageData) {
      const dateKey = usage.timestamp.toISOString().split('T')[0] // Group by day
      
      if (!timeSeriesMap.has(dateKey)) {
        timeSeriesMap.set(dateKey, {
          timestamp: new Date(usage.timestamp),
          tokens: 0,
          cost: 0,
          requests: 0
        })
      }

      const timeSeries = timeSeriesMap.get(dateKey)!
      timeSeries.tokens += usage.inputTokens + usage.outputTokens
      timeSeries.cost += this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)
      timeSeries.requests++
    }

    return Array.from(timeSeriesMap.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  private async checkForAlerts(usage: TokenUsage): Promise<void> {
    const thresholds = this.config.alertThresholds!
    const agentId = usage.agentId

    // Check daily usage thresholds
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayUsage = await this.getUsageStats(agentId, { start: today, end: tomorrow })

    if (todayUsage.totalTokens > thresholds.dailyUsageCritical!) {
      await this.createAlert({
        type: 'usage',
        severity: 'critical',
        agentId,
        message: `Daily token usage (${todayUsage.totalTokens}) exceeds critical threshold (${thresholds.dailyUsageCritical})`,
        metadata: { usage: todayUsage, threshold: thresholds.dailyUsageCritical }
      })
    } else if (todayUsage.totalTokens > thresholds.dailyUsageWarning!) {
      await this.createAlert({
        type: 'usage',
        severity: 'medium',
        agentId,
        message: `Daily token usage (${todayUsage.totalTokens}) exceeds warning threshold (${thresholds.dailyUsageWarning})`,
        metadata: { usage: todayUsage, threshold: thresholds.dailyUsageWarning }
      })
    }

    // Check cost per request
    const cost = this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)
    if (cost > thresholds.costPerRequestWarning!) {
      await this.createAlert({
        type: 'cost',
        severity: 'medium',
        agentId,
        message: `Request cost (${cost}) exceeds warning threshold (${thresholds.costPerRequestWarning})`,
        metadata: { cost, threshold: thresholds.costPerRequestWarning, model: usage.model }
      })
    }
  }

  private async checkBudgetStatus(): Promise<void> {
    if (!this.budget) {
      return
    }

    try {
      const status = await this.getBudgetStatus()
      const thresholds = this.config.alertThresholds!

      if (status.isOverBudget) {
        await this.createAlert({
          type: 'budget',
          severity: 'critical',
          message: `Budget exceeded: ${status.percentageUsed.toFixed(1)}% used (${status.spent.toFixed(2)} ${status.budget.currency})`,
          metadata: { status }
        })
      } else if (status.isNearLimit) {
        await this.createAlert({
          type: 'budget',
          severity: 'high',
          message: `Budget limit approaching: ${status.percentageUsed.toFixed(1)}% used (${status.spent.toFixed(2)} ${status.budget.currency})`,
          metadata: { status }
        })
      }
    } catch (error) {
      console.error('Failed to check budget status:', error)
    }
  }

  private async createAlert(alert: Omit<TokenAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const fullAlert: TokenAlert = {
      ...alert,
      id: uuidv4(),
      timestamp: new Date(),
      resolved: false
    }

    const agentId = alert.agentId || 'system'
    if (!this.alerts.has(agentId)) {
      this.alerts.set(agentId, [])
    }

    const alerts = this.alerts.get(agentId)!
    alerts.push(fullAlert)

    // Keep only recent alerts
    if (alerts.length > 1000) {
      alerts.splice(0, alerts.length - 1000)
    }

    console.log(`Alert created: ${alert.message}`)
  }

  private getTopAgents(limit: number): AgentUsageStats[] {
    const allAgents: AgentUsageStats[] = []

    for (const [agentId, usageData] of this.usageData.entries()) {
      const stats = this.calculateUsageStats(usageData)
      if (stats.agentUsage[agentId]) {
        allAgents.push(stats.agentUsage[agentId])
      }
    }

    return allAgents
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit)
  }

  private getTopModels(limit: number): ModelUsageStats[] {
    const allModels: ModelUsageStats[] = []

    for (const usageData of this.usageData.values()) {
      const stats = this.calculateUsageStats(usageData)
      for (const [model, modelStats] of Object.entries(stats.modelUsage)) {
        const existing = allModels.find(m => m.model === model)
        if (existing) {
          existing.tokens += modelStats.tokens
          existing.cost += modelStats.cost
          existing.requestCount += modelStats.requestCount
        } else {
          allModels.push({ ...modelStats, model })
        }
      }
    }

    return allModels
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit)
  }

  private async generateCostBreakdown(timeRange: TimeRange): Promise<CostBreakdown> {
    const usageStats = await this.getUsageStats(undefined, timeRange)

    return {
      byAgent: Object.fromEntries(
        Object.entries(usageStats.agentUsage).map(([agentId, stats]) => [agentId, stats.cost])
      ),
      byModel: Object.fromEntries(
        Object.entries(usageStats.modelUsage).map(([model, stats]) => [model, stats.cost])
      ),
      byTime: usageStats.timeSeriesData
    }
  }

  private async analyzeTrends(timeRange: TimeRange): Promise<TrendData[]> {
    // Simple trend analysis - in reality, this would be more sophisticated
    const trends: TrendData[] = []

    // Token usage trend
    const usageStats = await this.getUsageStats(undefined, timeRange)
    const firstHalf = this.getTimeSeriesSubset(usageStats.timeSeriesData, 0, 0.5)
    const secondHalf = this.getTimeSeriesSubset(usageStats.timeSeriesData, 0.5, 1)

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstHalfAvg = firstHalf.reduce((sum, data) => sum + data.tokens, 0) / firstHalf.length
      const secondHalfAvg = secondHalf.reduce((sum, data) => sum + data.tokens, 0) / secondHalf.length

      const changePercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
      const trend = changePercentage > 5 ? 'increasing' : changePercentage < -5 ? 'decreasing' : 'stable'

      trends.push({
        metric: 'token_usage',
        period: 'daily',
        data: usageStats.timeSeriesData,
        trend,
        changePercentage
      })
    }

    return trends
  }

  private getTimeSeriesSubset(data: TimeSeriesData[], startFraction: number, endFraction: number): TimeSeriesData[] {
    const startIndex = Math.floor(data.length * startFraction)
    const endIndex = Math.floor(data.length * endFraction)
    return data.slice(startIndex, endIndex)
  }

  private async generateRecommendations(usageStats: UsageStats, trends: TrendData[]): Promise<string[]> {
    const recommendations: string[] = []

    // Cost optimization recommendations
    const expensiveModels = Object.entries(usageStats.modelUsage)
      .sort((a, b) => b[1].averageCostPerRequest - a[1].averageCostPerRequest)
      .slice(0, 3)

    if (expensiveModels.length > 0 && expensiveModels[0][1].averageCostPerRequest > 1.0) {
      recommendations.push(`Consider using more cost-effective models instead of ${expensiveModels[0][0]} which has an average cost of $${expensiveModels[0][1].averageCostPerRequest.toFixed(4)} per request`)
    }

    // Usage trend recommendations
    const usageTrend = trends.find(t => t.metric === 'token_usage')
    if (usageTrend && usageTrend.trend === 'increasing' && usageTrend.changePercentage > 20) {
      recommendations.push(`Token usage is increasing rapidly (${usageTrend.changePercentage.toFixed(1)}%). Consider implementing usage limits or optimization strategies.`)
    }

    // Budget recommendations
    if (this.budget) {
      const budgetStatus = await this.getBudgetStatus()
      if (budgetStatus.percentageUsed > 80) {
        recommendations.push(`Budget usage is at ${budgetStatus.percentageUsed.toFixed(1)}%. Consider reviewing usage patterns or increasing budget allocation.`)
      }
    }

    return recommendations
  }

  private getBudgetTimeRange(budget: Budget): TimeRange {
    const end = budget.endDate || new Date()
    let start = new Date(end)

    switch (budget.period) {
      case 'daily':
        start.setDate(start.getDate() - 1)
        break
      case 'weekly':
        start.setDate(start.getDate() - 7)
        break
      case 'monthly':
        start.setMonth(start.getMonth() - 1)
        break
      case 'yearly':
        start.setFullYear(start.getFullYear() - 1)
        break
    }

    return { start, end }
  }

  private getBudgetPeriodDays(budget: Budget): number {
    switch (budget.period) {
      case 'daily':
        return 1
      case 'weekly':
        return 7
      case 'monthly':
        return 30
      case 'yearly':
        return 365
      default:
        return 30
    }
  }

  private enforceDataLimits(agentId: string): void {
    const usage = this.usageData.get(agentId)
    if (!usage) {
      return
    }

    // Enforce max records per agent
    const maxRecords = this.config.maxRecordsPerAgent!
    if (usage.length > maxRecords) {
      usage.splice(0, usage.length - maxRecords)
    }

    // Enforce data retention
    const retentionDays = this.config.dataRetentionDays!
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    for (let i = usage.length - 1; i >= 0; i--) {
      if (usage[i].timestamp < cutoffDate) {
        usage.splice(i, 1)
      }
    }
  }

  private exportToCSV(usageData: TokenUsage[]): string {
    const headers = ['agentId', 'model', 'inputTokens', 'outputTokens', 'timestamp', 'requestId', 'cost']
    const rows = usageData.map(usage => [
      usage.agentId,
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.timestamp.toISOString(),
      usage.requestId || '',
      this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  private exportToXML(usageData: TokenUsage[]): string {
    const xmlItems = usageData.map(usage => `
      <usage>
        <agentId>${usage.agentId}</agentId>
        <model>${usage.model}</model>
        <inputTokens>${usage.inputTokens}</inputTokens>
        <outputTokens>${usage.outputTokens}</outputTokens>
        <timestamp>${usage.timestamp.toISOString()}</timestamp>
        <requestId>${usage.requestId || ''}</requestId>
        <cost>${this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)}</cost>
      </usage>
    `).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<usageData>
  ${xmlItems}
</usageData>`
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
      }
    }
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): TokenTrackerConfig {
    return { ...this.config }
  }

  getPricing(): ModelPricing {
    return { ...this.pricing }
  }

  updatePricing(pricing: ModelPricing): void {
    this.pricing = { ...pricing }
  }

  resetData(): void {
    this.usageData.clear()
    this.alerts.clear()
  }
}