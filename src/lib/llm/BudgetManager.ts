import { v4 as uuidv4 } from 'uuid'

export interface IBudgetManager {
  initialize(config: BudgetManagerConfig): Promise<void>
  setBudget(budget: Budget): Promise<void>
  getBudget(): Promise<Budget | null>
  trackExpense(expense: Expense): Promise<void>
  getBudgetStatus(): Promise<BudgetStatus>
  getSpendingForecast(timeRange: TimeRange): Promise<SpendingForecast>
  getBudgetAlerts(): Promise<BudgetAlert[]>
  getSpendingBreakdown(timeRange?: TimeRange): Promise<SpendingBreakdown>
  exportBudgetReport(timeRange?: TimeRange): Promise<BudgetReport>
  updateBudgetThresholds(thresholds: BudgetThresholds): Promise<void>
}

export interface BudgetManagerConfig {
  currency?: string
  enableAlerts?: boolean
  enableForecasting?: boolean
  enableOptimization?: boolean
  defaultThresholds?: BudgetThresholds
  notificationChannels?: NotificationChannel[]
}

export interface Budget {
  id: string
  name: string
  total: number
  currency: string
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project'
  startDate: Date
  endDate?: Date
  categories: BudgetCategory[]
  thresholds: BudgetThresholds
  createdAt: Date
  updatedAt: Date
}

export interface BudgetCategory {
  id: string
  name: string
  allocatedAmount: number
  spentAmount: number
  percentage: number
  provider?: string
  model?: string
  requestType?: 'completion' | 'chat' | 'embedding'
}

export interface BudgetThresholds {
  warning: number // Percentage (e.g., 0.8 for 80%)
  critical: number // Percentage (e.g., 0.95 for 95%)
  daily: number
  weekly: number
  monthly: number
}

export interface Expense {
  id: string
  amount: number
  currency: string
  description: string
  category: string
  provider: string
  model: string
  requestType: 'completion' | 'chat' | 'embedding'
  timestamp: Date
  metadata?: any
}

export interface BudgetStatus {
  totalBudget: number
  totalSpent: number
  totalRemaining: number
  percentageUsed: number
  status: 'healthy' | 'warning' | 'critical' | 'exceeded'
  categories: CategoryStatus[]
  periodProgress: number
  daysRemaining: number
  projectedOverspend?: number
}

export interface CategoryStatus {
  categoryId: string
  categoryName: string
  allocatedAmount: number
  spentAmount: number
  remainingAmount: number
  percentageUsed: number
  status: 'healthy' | 'warning' | 'critical' | 'exceeded'
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface SpendingForecast {
  projectedTotal: number
  projectedOverspend: number
  confidence: number
  dailyAverage: number
  trend: 'increasing' | 'decreasing' | 'stable'
  recommendations: string[]
  timeSeriesData: ForecastTimeSeriesPoint[]
}

export interface ForecastTimeSeriesPoint {
  date: Date
  projected: number
  actual?: number
  confidence: number
}

export interface BudgetAlert {
  id: string
  type: 'warning' | 'critical' | 'info'
  category: 'budget' | 'category' | 'forecast' | 'anomaly'
  title: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: Date
  acknowledged: boolean
  metadata?: any
}

export interface SpendingBreakdown {
  totalSpent: number
  byCategory: Record<string, CategorySpending>
  byProvider: Record<string, ProviderSpending>
  byModel: Record<string, ModelSpending>
  byRequestType: Record<string, RequestTypeSpending>
  byTime: TimeSeriesSpending[]
}

export interface CategorySpending {
  amount: number
  percentage: number
  transactionCount: number
  averagePerTransaction: number
}

export interface ProviderSpending {
  amount: number
  percentage: number
  transactionCount: number
  modelBreakdown: Record<string, ModelSpending>
}

export interface ModelSpending {
  amount: number
  percentage: number
  transactionCount: number
  averageCostPerRequest: number
  tokenCount: number
  averageCostPerToken: number
}

export interface RequestTypeSpending {
  amount: number
  percentage: number
  transactionCount: number
  averageCostPerRequest: number
}

export interface TimeSeriesSpending {
  date: Date
  amount: number
  transactionCount: number
}

export interface BudgetReport {
  generatedAt: Date
  timeRange: TimeRange
  budget: Budget
  status: BudgetStatus
  breakdown: SpendingBreakdown
  forecast: SpendingForecast
  alerts: BudgetAlert[]
  insights: BudgetInsight[]
  recommendations: string[]
}

export interface BudgetInsight {
  type: 'spending_pattern' | 'efficiency' | 'anomaly' | 'optimization'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  actionable: boolean
  data?: any
}

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'slack' | 'teams'
  config: any
  enabled: boolean
}

export class BudgetManager implements IBudgetManager {
  private config!: BudgetManagerConfig
  private budget: Budget | null = null
  private expenses: Expense[] = []
  private alerts: BudgetAlert[] = []
  private initialized = false

  async initialize(config: BudgetManagerConfig): Promise<void> {
    try {
      this.config = {
        currency: 'USD',
        enableAlerts: true,
        enableForecasting: true,
        enableOptimization: true,
        defaultThresholds: {
          warning: 0.8,
          critical: 0.95,
          daily: 100,
          weekly: 500,
          monthly: 2000
        },
        ...config
      }

      this.initialized = true
      console.log('Budget manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize budget manager:', error)
      throw error
    }
  }

  async setBudget(budget: Budget): Promise<void> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      // Validate budget
      if (budget.total <= 0) {
        throw new Error('Budget total must be greater than 0')
      }

      // Set default thresholds if not provided
      if (!budget.thresholds) {
        budget.thresholds = this.config.defaultThresholds!
      }

      // Calculate initial category percentages
      budget.categories = budget.categories.map(category => ({
        ...category,
        percentage: (category.allocatedAmount / budget.total) * 100
      }))

      budget.updatedAt = new Date()
      this.budget = budget

      // Check for immediate alerts
      if (this.config.enableAlerts) {
        await this.checkBudgetAlerts()
      }

      console.log(`Budget '${budget.name}' set successfully`)
    } catch (error) {
      console.error('Failed to set budget:', error)
      throw error
    }
  }

  async getBudget(): Promise<Budget | null> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    return this.budget ? { ...this.budget } : null
  }

  async trackExpense(expense: Expense): Promise<void> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      // Add expense
      this.expenses.push(expense)

      // Update category spending
      const category = this.budget.categories.find(cat => 
        cat.id === expense.category || 
        (cat.provider === expense.provider && cat.model === expense.model && cat.requestType === expense.requestType)
      )

      if (category) {
        category.spentAmount += expense.amount
        category.percentage = (category.spentAmount / category.allocatedAmount) * 100
      }

      // Check for alerts
      if (this.config.enableAlerts) {
        await this.checkBudgetAlerts()
      }

      console.log(`Expense tracked: ${expense.amount} ${expense.currency} for ${expense.description}`)
    } catch (error) {
      console.error('Failed to track expense:', error)
      throw error
    }
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      const totalSpent = this.budget.categories.reduce((sum, cat) => sum + cat.spentAmount, 0)
      const totalRemaining = this.budget.total - totalSpent
      const percentageUsed = (totalSpent / this.budget.total) * 100

      // Determine overall status
      let status: 'healthy' | 'warning' | 'critical' | 'exceeded' = 'healthy'
      if (percentageUsed >= 100) {
        status = 'exceeded'
      } else if (percentageUsed >= this.budget.thresholds.critical * 100) {
        status = 'critical'
      } else if (percentageUsed >= this.budget.thresholds.warning * 100) {
        status = 'warning'
      }

      // Calculate category statuses
      const categories: CategoryStatus[] = this.budget.categories.map(category => {
        const remainingAmount = category.allocatedAmount - category.spentAmount
        let categoryStatus: 'healthy' | 'warning' | 'critical' | 'exceeded' = 'healthy'
        
        if (category.percentage >= 100) {
          categoryStatus = 'exceeded'
        } else if (this.budget && category.percentage >= this.budget.thresholds.critical * 100) {
          categoryStatus = 'critical'
        } else if (this.budget && category.percentage >= this.budget.thresholds.warning * 100) {
          categoryStatus = 'warning'
        }

        return {
          categoryId: category.id,
          categoryName: category.name,
          allocatedAmount: category.allocatedAmount,
          spentAmount: category.spentAmount,
          remainingAmount,
          percentageUsed: category.percentage,
          status: categoryStatus
        }
      })

      // Calculate period progress
      const now = new Date()
      const periodStart = this.budget.startDate
      const periodEnd = this.budget.endDate || this.calculatePeriodEnd(periodStart, this.budget.period)
      const totalPeriodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
      const elapsedDays = Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
      const periodProgress = Math.min(100, (elapsedDays / totalPeriodDays) * 100)
      const daysRemaining = Math.max(0, totalPeriodDays - elapsedDays)

      // Calculate projected overspend
      const projectedOverspend = this.calculateProjectedOverspent(totalSpent, periodProgress, this.budget.total)

      return {
        totalBudget: this.budget.total,
        totalSpent,
        totalRemaining,
        percentageUsed,
        status,
        categories,
        periodProgress,
        daysRemaining,
        projectedOverspend
      }
    } catch (error) {
      console.error('Failed to get budget status:', error)
      throw error
    }
  }

  async getSpendingForecast(timeRange: TimeRange): Promise<SpendingForecast> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      // Get historical spending data
      const historicalExpenses = this.getExpensesInTimeRange(timeRange)
      
      if (historicalExpenses.length === 0) {
        return {
          projectedTotal: 0,
          projectedOverspend: 0,
          confidence: 0,
          dailyAverage: 0,
          trend: 'stable',
          recommendations: ['No historical data available for forecasting'],
          timeSeriesData: []
        }
      }

      // Calculate daily average
      const totalDays = Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24))
      const dailyAverage = historicalExpenses.reduce((sum, exp) => sum + exp.amount, 0) / totalDays

      // Project total spending
      const projectedTotal = dailyAverage * totalDays

      // Calculate trend
      const trend = this.calculateSpendingTrend(historicalExpenses)

      // Calculate confidence based on data consistency
      const confidence = this.calculateForecastConfidence(historicalExpenses)

      // Generate time series data
      const timeSeriesData = this.generateForecastTimeSeries(historicalExpenses, timeRange)

      // Calculate projected overspend
      const projectedOverspend = Math.max(0, projectedTotal - this.budget.total)

      // Generate recommendations
      const recommendations = this.generateForecastRecommendations(
        projectedTotal, 
        this.budget.total, 
        trend, 
        dailyAverage
      )

      return {
        projectedTotal,
        projectedOverspend,
        confidence,
        dailyAverage,
        trend,
        recommendations,
        timeSeriesData
      }
    } catch (error) {
      console.error('Failed to get spending forecast:', error)
      throw error
    }
  }

  async getBudgetAlerts(): Promise<BudgetAlert[]> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    return [...this.alerts]
  }

  async getSpendingBreakdown(timeRange?: TimeRange): Promise<SpendingBreakdown> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      // Get expenses in time range
      const expenses = timeRange ? this.getExpensesInTimeRange(timeRange) : this.expenses
      
      if (expenses.length === 0) {
        return {
          totalSpent: 0,
          byCategory: {},
          byProvider: {},
          byModel: {},
          byRequestType: {},
          byTime: []
        }
      }

      const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0)

      // Breakdown by category
      const byCategory: Record<string, CategorySpending> = {}
      const categoryGroups = this.groupExpensesBy(expenses, 'category')
      for (const [category, categoryExpenses] of categoryGroups.entries()) {
        const amount = categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        byCategory[category] = {
          amount,
          percentage: (amount / totalSpent) * 100,
          transactionCount: categoryExpenses.length,
          averagePerTransaction: amount / categoryExpenses.length
        }
      }

      // Breakdown by provider
      const byProvider: Record<string, ProviderSpending> = {}
      const providerGroups = this.groupExpensesBy(expenses, 'provider')
      for (const [provider, providerExpenses] of providerGroups.entries()) {
        const amount = providerExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        byProvider[provider] = {
          amount,
          percentage: (amount / totalSpent) * 100,
          transactionCount: providerExpenses.length,
          modelBreakdown: {}
        }

        // Model breakdown within provider
        const modelGroups = this.groupExpensesBy(providerExpenses, 'model')
        for (const [model, modelExpenses] of modelGroups.entries()) {
          const modelAmount = modelExpenses.reduce((sum, exp) => sum + exp.amount, 0)
          const tokenCount = modelExpenses.reduce((sum, exp) => sum + (exp.metadata?.tokens || 0), 0)
          byProvider[provider].modelBreakdown[model] = {
            amount: modelAmount,
            percentage: (modelAmount / amount) * 100,
            transactionCount: modelExpenses.length,
            averageCostPerRequest: modelAmount / modelExpenses.length,
            tokenCount,
            averageCostPerToken: tokenCount > 0 ? modelAmount / tokenCount : 0
          }
        }
      }

      // Breakdown by model
      const byModel: Record<string, ModelSpending> = {}
      const modelGroups = this.groupExpensesBy(expenses, 'model')
      for (const [model, modelExpenses] of modelGroups.entries()) {
        const amount = modelExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        const tokenCount = modelExpenses.reduce((sum, exp) => sum + (exp.metadata?.tokens || 0), 0)
        byModel[model] = {
          amount,
          percentage: (amount / totalSpent) * 100,
          transactionCount: modelExpenses.length,
          averageCostPerRequest: amount / modelExpenses.length,
          tokenCount,
          averageCostPerToken: tokenCount > 0 ? amount / tokenCount : 0
        }
      }

      // Breakdown by request type
      const byRequestType: Record<string, RequestTypeSpending> = {}
      const requestTypeGroups = this.groupExpensesBy(expenses, 'requestType')
      for (const [requestType, typeExpenses] of requestTypeGroups.entries()) {
        const amount = typeExpenses.reduce((sum, exp) => sum + exp.amount, 0)
        byRequestType[requestType] = {
          amount,
          percentage: (amount / totalSpent) * 100,
          transactionCount: typeExpenses.length,
          averageCostPerRequest: amount / typeExpenses.length
        }
      }

      // Time series breakdown
      const byTime = this.generateTimeSeriesSpending(expenses, timeRange)

      return {
        totalSpent,
        byCategory,
        byProvider,
        byModel,
        byRequestType,
        byTime
      }
    } catch (error) {
      console.error('Failed to get spending breakdown:', error)
      throw error
    }
  }

  async exportBudgetReport(timeRange?: TimeRange): Promise<BudgetReport> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      const status = await this.getBudgetStatus()
      const breakdown = await this.getSpendingBreakdown(timeRange)
      const forecast = await this.getSpendingForecast(timeRange || this.getCurrentPeriodRange())
      const alerts = await this.getBudgetAlerts()

      // Generate insights
      const insights = this.generateBudgetInsights(status, breakdown, forecast)

      // Generate recommendations
      const recommendations = this.generateBudgetRecommendations(status, breakdown, forecast)

      return {
        generatedAt: new Date(),
        timeRange: timeRange || this.getCurrentPeriodRange(),
        budget: { ...this.budget },
        status,
        breakdown,
        forecast,
        alerts,
        insights,
        recommendations
      }
    } catch (error) {
      console.error('Failed to export budget report:', error)
      throw error
    }
  }

  async updateBudgetThresholds(thresholds: BudgetThresholds): Promise<void> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    if (!this.budget) {
      throw new Error('No budget set')
    }

    try {
      this.budget.thresholds = { ...thresholds }
      this.budget.updatedAt = new Date()

      // Re-check alerts with new thresholds
      if (this.config.enableAlerts) {
        await this.checkBudgetAlerts()
      }

      console.log('Budget thresholds updated successfully')
    } catch (error) {
      console.error('Failed to update budget thresholds:', error)
      throw error
    }
  }

  private async checkBudgetAlerts(): Promise<void> {
    if (!this.budget) {
      return
    }

    this.alerts = []

    try {
      const status = await this.getBudgetStatus()

      // Check overall budget alerts
      if (status.percentageUsed >= this.budget.thresholds.critical * 100) {
        this.alerts.push({
          id: uuidv4(),
          type: 'critical',
          category: 'budget',
          title: 'Budget Critical Limit Reached',
          message: `Budget usage is at ${status.percentageUsed.toFixed(1)}%, exceeding critical threshold of ${(this.budget.thresholds.critical * 100).toFixed(1)}%`,
          severity: 'critical',
          timestamp: new Date(),
          acknowledged: false
        })
      } else if (status.percentageUsed >= this.budget.thresholds.warning * 100) {
        this.alerts.push({
          id: uuidv4(),
          type: 'warning',
          category: 'budget',
          title: 'Budget Warning Limit Reached',
          message: `Budget usage is at ${status.percentageUsed.toFixed(1)}%, exceeding warning threshold of ${(this.budget.thresholds.warning * 100).toFixed(1)}%`,
          severity: 'high',
          timestamp: new Date(),
          acknowledged: false
        })
      }

      // Check category alerts
      for (const category of status.categories) {
        if (category.percentageUsed >= this.budget.thresholds.critical * 100) {
          this.alerts.push({
            id: uuidv4(),
            type: 'critical',
            category: 'category',
            title: `Category Budget Critical: ${category.categoryName}`,
            message: `${category.categoryName} usage is at ${category.percentageUsed.toFixed(1)}%, exceeding critical threshold`,
            severity: 'critical',
            timestamp: new Date(),
            acknowledged: false,
            metadata: { categoryId: category.categoryId }
          })
        } else if (category.percentageUsed >= this.budget.thresholds.warning * 100) {
          this.alerts.push({
            id: uuidv4(),
            type: 'warning',
            category: 'category',
            title: `Category Budget Warning: ${category.categoryName}`,
            message: `${category.categoryName} usage is at ${category.percentageUsed.toFixed(1)}%, exceeding warning threshold`,
            severity: 'medium',
            timestamp: new Date(),
            acknowledged: false,
            metadata: { categoryId: category.categoryId }
          })
        }
      }

      // Check for projected overspend
      if (status.projectedOverspend && status.projectedOverspend > 0) {
        this.alerts.push({
          id: uuidv4(),
          type: 'warning',
          category: 'forecast',
          title: 'Projected Budget Overspend',
          message: `Current spending trend projects a ${this.budget.currency} ${status.projectedOverspend.toFixed(2)} overspend`,
          severity: 'high',
          timestamp: new Date(),
          acknowledged: false
        })
      }

      // Send notifications if enabled
      if (this.config.enableAlerts && this.config.notificationChannels) {
        await this.sendNotifications(this.alerts)
      }
    } catch (error) {
      console.error('Failed to check budget alerts:', error)
    }
  }

  private calculatePeriodEnd(startDate: Date, period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'project'): Date {
    const end = new Date(startDate)
    
    switch (period) {
      case 'daily':
        end.setDate(end.getDate() + 1)
        break
      case 'weekly':
        end.setDate(end.getDate() + 7)
        break
      case 'monthly':
        end.setMonth(end.getMonth() + 1)
        break
      case 'quarterly':
        end.setMonth(end.getMonth() + 3)
        break
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1)
        break
      case 'project':
        // For project budgets, end date should be explicitly set
        throw new Error('Project budgets must have an explicit end date')
    }
    
    return end
  }

  private calculateProjectedOverspent(totalSpent: number, periodProgress: number, totalBudget: number): number {
    if (periodProgress <= 0) return 0
    
    const projectedTotal = (totalSpent / periodProgress) * 100
    return Math.max(0, projectedTotal - totalBudget)
  }

  private getExpensesInTimeRange(timeRange: TimeRange): Expense[] {
    return this.expenses.filter(expense => 
      expense.timestamp >= timeRange.start && expense.timestamp <= timeRange.end
    )
  }

  private calculateSpendingTrend(expenses: Expense[]): 'increasing' | 'decreasing' | 'stable' {
    if (expenses.length < 2) return 'stable'

    // Sort expenses by timestamp
    const sortedExpenses = [...expenses].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    
    // Split into two halves
    const midPoint = Math.floor(sortedExpenses.length / 2)
    const firstHalf = sortedExpenses.slice(0, midPoint)
    const secondHalf = sortedExpenses.slice(midPoint)
    
    const firstHalfAvg = firstHalf.reduce((sum, exp) => sum + exp.amount, 0) / firstHalf.length
    const secondHalfAvg = secondHalf.reduce((sum, exp) => sum + exp.amount, 0) / secondHalf.length
    
    const changePercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
    
    if (changePercentage > 10) return 'increasing'
    if (changePercentage < -10) return 'decreasing'
    return 'stable'
  }

  private calculateForecastConfidence(expenses: Expense[]): number {
    if (expenses.length < 7) return 0.3 // Low confidence with limited data
    
    // Calculate variance in daily spending
    const dailySpending = this.groupExpensesByDay(expenses)
    const amounts = Array.from(dailySpending.values())
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length
    const standardDeviation = Math.sqrt(variance)
    
    // Lower variance = higher confidence
    const coefficientOfVariation = standardDeviation / mean
    
    if (coefficientOfVariation < 0.2) return 0.9
    if (coefficientOfVariation < 0.5) return 0.7
    if (coefficientOfVariation < 1.0) return 0.5
    return 0.3
  }

  private generateForecastTimeSeries(expenses: Expense[], timeRange: TimeRange): ForecastTimeSeriesPoint[] {
    const timeSeriesData: ForecastTimeSeriesPoint[] = []
    
    // Group expenses by day
    const dailyExpenses = this.groupExpensesByDay(expenses)
    
    // Calculate daily average
    const dailyAverage = Array.from(dailyExpenses.values()).reduce((sum, amount) => sum + amount, 0) / dailyExpenses.size
    
    // Generate forecast for each day in the time range
    const current = new Date(timeRange.start)
    while (current <= timeRange.end) {
      const dayKey = current.toISOString().split('T')[0]
      const actual = dailyExpenses.get(dayKey)
      
      timeSeriesData.push({
        date: new Date(current),
        projected: dailyAverage,
        actual,
        confidence: actual ? 1.0 : 0.7
      })
      
      current.setDate(current.getDate() + 1)
    }
    
    return timeSeriesData
  }

  private generateForecastRecommendations(
    projectedTotal: number, 
    budgetTotal: number, 
    trend: 'increasing' | 'decreasing' | 'stable',
    dailyAverage: number
  ): string[] {
    const recommendations: string[] = []
    
    if (projectedTotal > budgetTotal) {
      const overspendAmount = projectedTotal - budgetTotal
      recommendations.push(`Projected to exceed budget by ${overspendAmount.toFixed(2)}. Consider reducing daily spending by ${(overspendAmount / 30).toFixed(2)}.`)
    }
    
    if (trend === 'increasing') {
      recommendations.push('Spending trend is increasing. Monitor closely and consider cost optimization measures.')
    }
    
    if (dailyAverage > budgetTotal / 30) {
      recommendations.push('Daily spending exceeds budgeted daily average. Implement cost controls.')
    }
    
    return recommendations
  }

  private groupExpensesBy(expenses: Expense[], key: keyof Expense): Map<string, Expense[]> {
    const groups = new Map<string, Expense[]>()
    
    for (const expense of expenses) {
      const groupKey = String(expense[key])
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(expense)
    }
    
    return groups
  }

  private groupExpensesByDay(expenses: Expense[]): Map<string, number> {
    const dailyExpenses = new Map<string, number>()
    
    for (const expense of expenses) {
      const dayKey = expense.timestamp.toISOString().split('T')[0]
      const currentAmount = dailyExpenses.get(dayKey) || 0
      dailyExpenses.set(dayKey, currentAmount + expense.amount)
    }
    
    return dailyExpenses
  }

  private generateTimeSeriesSpending(expenses: Expense[], timeRange?: TimeRange): TimeSeriesSpending[] {
    const timeSeries: TimeSeriesSpending[] = []
    
    if (!timeRange || expenses.length === 0) {
      return timeSeries
    }
    
    // Group expenses by day
    const dailyExpenses = this.groupExpensesByDay(expenses)
    
    // Generate time series for each day in the range
    const current = new Date(timeRange.start)
    while (current <= timeRange.end) {
      const dayKey = current.toISOString().split('T')[0]
      const dayExpenses = expenses.filter(exp => 
        exp.timestamp.toISOString().split('T')[0] === dayKey
      )
      
      timeSeries.push({
        date: new Date(current),
        amount: dayExpenses.reduce((sum, exp) => sum + exp.amount, 0),
        transactionCount: dayExpenses.length
      })
      
      current.setDate(current.getDate() + 1)
    }
    
    return timeSeries
  }

  private getCurrentPeriodRange(): TimeRange {
    if (!this.budget) {
      const now = new Date()
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
      }
    }
    
    return {
      start: this.budget.startDate,
      end: this.budget.endDate || this.calculatePeriodEnd(this.budget.startDate, this.budget.period)
    }
  }

  private generateBudgetInsights(
    status: BudgetStatus, 
    breakdown: SpendingBreakdown, 
    forecast: SpendingForecast
  ): BudgetInsight[] {
    const insights: BudgetInsight[] = []
    
    // Spending pattern insights
    if (status.percentageUsed > status.periodProgress * 1.5) {
      insights.push({
        type: 'spending_pattern',
        title: 'Accelerated Spending',
        description: 'Spending is growing faster than time progression in the budget period',
        impact: 'high',
        actionable: true
      })
    }
    
    // Efficiency insights
    const topProvider = Object.entries(breakdown.byProvider)
      .sort((a, b) => b[1].amount - a[1].amount)[0]
    
    if (topProvider) {
      insights.push({
        type: 'efficiency',
        title: 'Primary Provider Identified',
        description: `${topProvider[0]} accounts for ${topProvider[1].percentage.toFixed(1)}% of total spending`,
        impact: 'medium',
        actionable: true,
        data: { provider: topProvider[0], percentage: topProvider[1].percentage }
      })
    }
    
    // Anomaly detection
    if (forecast.trend === 'increasing' && status.status === 'critical') {
      insights.push({
        type: 'anomaly',
        title: 'Critical Spending Trend',
        description: 'Spending is increasing while budget is already in critical state',
        impact: 'high',
        actionable: true
      })
    }
    
    return insights
  }

  private generateBudgetRecommendations(
    status: BudgetStatus, 
    breakdown: SpendingBreakdown, 
    forecast: SpendingForecast
  ): string[] {
    const recommendations: string[] = []
    
    // Budget status recommendations
    if (status.status === 'critical') {
      recommendations.push('Immediate spending freeze recommended. Review all ongoing activities.')
    } else if (status.status === 'warning') {
      recommendations.push('Implement spending controls and monitor daily expenses closely.')
    }
    
    // Forecast recommendations
    if (forecast.projectedOverspend > 0) {
      recommendations.push(`Reduce daily spending by ${(forecast.projectedOverspend / 30).toFixed(2)} to stay within budget.`)
    }
    
    // Provider optimization
    const providersByCost = Object.entries(breakdown.byProvider)
      .sort((a, b) => b[1].amount - a[1].amount)
    
    if (providersByCost.length > 1) {
      const mostExpensive = providersByCost[0]
      const leastExpensive = providersByCost[providersByCost.length - 1]
      
      // Calculate average cost per request for each provider
      const mostExpensiveAvgCost = mostExpensive[1].amount / mostExpensive[1].transactionCount
      const leastExpensiveAvgCost = leastExpensive[1].amount / leastExpensive[1].transactionCount
      
      if (mostExpensiveAvgCost > leastExpensiveAvgCost * 2) {
        recommendations.push(`Consider shifting workload from ${mostExpensive[0]} to ${leastExpensive[0]} for cost savings.`)
      }
    }
    
    return recommendations
  }

  private async sendNotifications(alerts: BudgetAlert[]): Promise<void> {
    // Implementation would depend on notification channels configured
    // This is a placeholder for actual notification logic
    console.log(`Sending ${alerts.length} budget alerts`)
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): BudgetManagerConfig {
    return { ...this.config }
  }
}