import { v4 as uuidv4 } from 'uuid'
import { ICostEstimator, CostEstimationRequest, CostEstimationResult } from './CostEstimator'

export interface IBudgetManager {
  initialize(config: BudgetManagerConfig): Promise<void>
  createBudget(budget: BudgetConfig): Promise<Budget>
  updateBudget(budgetId: string, updates: Partial<BudgetConfig>): Promise<Budget>
  deleteBudget(budgetId: string): Promise<boolean>
  getBudget(budgetId: string): Promise<Budget | null>
  getBudgets(agentId?: string): Promise<Budget[]>
  checkBudgetAvailability(request: CostEstimationRequest): Promise<BudgetCheckResult>
  recordExpense(budgetId: string, expense: ExpenseRecord): Promise<void>
  getBudgetUtilization(budgetId: string): Promise<BudgetUtilization>
  getBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]>
  setBudgetAlert(budgetId: string, alert: BudgetAlertConfig): Promise<BudgetAlert>
  removeBudgetAlert(alertId: string): Promise<boolean>
  getBudgetForecast(budgetId: string, forecastPeriod: ForecastPeriod): Promise<BudgetForecast>
  getBudgetRecommendations(budgetId: string): Promise<BudgetRecommendation[]>
}

export interface BudgetManagerConfig {
  enableAlerts?: boolean
  enableForecasting?: boolean
  enableRecommendations?: boolean
  defaultCurrency?: string
  alertThresholds?: AlertThresholds
  forecastAccuracy?: number
}

export interface AlertThresholds {
  warningPercentage: number // e.g., 0.8 for 80%
  criticalPercentage: number // e.g., 0.95 for 95%
  dailySpendThreshold?: number
  weeklySpendThreshold?: number
}

export interface BudgetConfig {
  id?: string
  name: string
  description?: string
  agentId?: string
  totalAmount: number
  currency: string
  period: BudgetPeriod
  startDate: Date
  endDate: Date
  categories?: BudgetCategory[]
  alerts?: BudgetAlertConfig[]
  autoAdjust?: boolean
  maxDailySpend?: number
  maxWeeklySpend?: number
  metadata?: any
}

export interface BudgetPeriod {
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  startDate: Date
  endDate: Date
}

export interface BudgetCategory {
  id: string
  name: string
  description?: string
  allocatedAmount: number
  spentAmount: number
  models?: string[]
  requestTypes?: string[]
}

export interface BudgetAlertConfig {
  id?: string
  type: 'usage_threshold' | 'time_threshold' | 'spike_detection' | 'daily_limit' | 'weekly_limit'
  threshold: number
  enabled: boolean
  recipients?: string[]
  message?: string
  severity: 'info' | 'warning' | 'critical'
}

export interface Budget {
  id: string
  name: string
  description?: string
  agentId?: string
  totalAmount: number
  currency: string
  period: BudgetPeriod
  startDate: Date
  endDate: Date
  categories: BudgetCategory[]
  alerts: BudgetAlertConfig[]
  autoAdjust: boolean
  maxDailySpend?: number
  maxWeeklySpend?: number
  metadata: any
  createdAt: Date
  updatedAt: Date
  isActive: boolean
}

export interface ExpenseRecord {
  id: string
  budgetId: string
  agentId: string
  model: string
  requestType: string
  amount: number
  currency: string
  timestamp: Date
  description?: string
  metadata?: any
}

export interface BudgetCheckResult {
  allowed: boolean
  budgetId?: string
  remainingAmount: number
  currency: string
  utilizationPercentage: number
  warnings: string[]
  errors: string[]
  recommendations: string[]
}

export interface BudgetUtilization {
  budgetId: string
  totalAmount: number
  spentAmount: number
  remainingAmount: number
  utilizationPercentage: number
  currency: string
  dailyAverage: number
  projectedOverspend?: number
  daysRemaining: number
  categoryUtilization: CategoryUtilization[]
  timeSeriesData: TimeSeriesData[]
}

export interface CategoryUtilization {
  categoryId: string
  categoryName: string
  allocatedAmount: number
  spentAmount: number
  remainingAmount: number
  utilizationPercentage: number
}

export interface TimeSeriesData {
  timestamp: Date
  amount: number
  cumulativeAmount: number
}

export interface BudgetAlert {
  id: string
  budgetId: string
  type: 'usage_threshold' | 'time_threshold' | 'spike_detection' | 'daily_limit' | 'weekly_limit'
  severity: 'info' | 'warning' | 'critical'
  message: string
  threshold: number
  currentValue: number
  triggeredAt: Date
  acknowledged: boolean
  acknowledgedAt?: Date
  acknowledgedBy?: string
  metadata?: any
}

export interface ForecastPeriod {
  start: Date
  end: Date
  granularity: 'daily' | 'weekly' | 'monthly'
}

export interface BudgetForecast {
  id: string
  budgetId: string
  period: ForecastPeriod
  forecast: ForecastData[]
  projectedOverspend: boolean
  projectedOverspendAmount?: number
  confidence: number
  factors: ForecastFactor[]
  recommendations: string[]
  timestamp: Date
}

export interface ForecastData {
  date: Date
  projectedSpending: number
  cumulativeSpending: number
  remainingBudget: number
  confidence: number
}

export interface ForecastFactor {
  name: string
  impact: 'positive' | 'negative' | 'neutral'
  magnitude: number
  description: string
}

export interface BudgetRecommendation {
  id: string
  type: 'budget_increase' | 'budget_decrease' | 'category_reallocation' | 'spending_reduction' | 'alert_adjustment'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  potentialSavings?: number
  implementationDifficulty: 'low' | 'medium' | 'high'
  estimatedImpact: RecommendationImpact
  steps: string[]
}

export interface RecommendationImpact {
  budgetUtilizationChange: number
  costReduction?: number
  riskMitigation?: number
  efficiencyImprovement?: number
}

export class BudgetManager implements IBudgetManager {
  private config!: BudgetManagerConfig
  private budgets: Map<string, Budget> = new Map()
  private expenses: Map<string, ExpenseRecord[]> = new Map()
  private alerts: Map<string, BudgetAlert[]> = new Map()
  private costEstimator?: ICostEstimator
  private initialized = false

  constructor(costEstimator?: ICostEstimator) {
    this.costEstimator = costEstimator
  }

  async initialize(config: BudgetManagerConfig): Promise<void> {
    try {
      this.config = {
        enableAlerts: true,
        enableForecasting: true,
        enableRecommendations: true,
        defaultCurrency: 'USD',
        alertThresholds: {
          warningPercentage: 0.8,
          criticalPercentage: 0.95
        },
        forecastAccuracy: 0.85,
        ...config
      }

      this.initialized = true
      console.log('Budget manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize budget manager:', error)
      throw error
    }
  }

  async createBudget(budget: BudgetConfig): Promise<Budget> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      const budgetId = budget.id || uuidv4()
      const newBudget: Budget = {
        id: budgetId,
        name: budget.name,
        description: budget.description,
        agentId: budget.agentId,
        totalAmount: budget.totalAmount,
        currency: budget.currency,
        period: budget.period,
        startDate: budget.startDate,
        endDate: budget.endDate,
        categories: budget.categories || [],
        alerts: budget.alerts || [],
        autoAdjust: budget.autoAdjust || false,
        maxDailySpend: budget.maxDailySpend,
        maxWeeklySpend: budget.maxWeeklySpend,
        metadata: budget.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      }

      this.budgets.set(budgetId, newBudget)
      this.expenses.set(budgetId, [])

      console.log(`Budget ${budget.name} created successfully`)
      return newBudget
    } catch (error) {
      console.error('Failed to create budget:', error)
      throw error
    }
  }

  async updateBudget(budgetId: string, updates: Partial<BudgetConfig>): Promise<Budget> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      // Update budget fields
      if (updates.name !== undefined) budget.name = updates.name
      if (updates.description !== undefined) budget.description = updates.description
      if (updates.totalAmount !== undefined) budget.totalAmount = updates.totalAmount
      if (updates.categories !== undefined) budget.categories = updates.categories
      if (updates.alerts !== undefined) budget.alerts = updates.alerts
      if (updates.autoAdjust !== undefined) budget.autoAdjust = updates.autoAdjust
      if (updates.maxDailySpend !== undefined) budget.maxDailySpend = updates.maxDailySpend
      if (updates.maxWeeklySpend !== undefined) budget.maxWeeklySpend = updates.maxWeeklySpend
      if (updates.metadata !== undefined) budget.metadata = updates.metadata

      budget.updatedAt = new Date()

      this.budgets.set(budgetId, budget)
      console.log(`Budget ${budget.name} updated successfully`)
      return budget
    } catch (error) {
      console.error(`Failed to update budget ${budgetId}:`, error)
      throw error
    }
  }

  async deleteBudget(budgetId: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      const deleted = this.budgets.delete(budgetId)
      if (deleted) {
        this.expenses.delete(budgetId)
        this.alerts.delete(budgetId)
        console.log(`Budget ${budgetId} deleted successfully`)
      }
      return deleted
    } catch (error) {
      console.error(`Failed to delete budget ${budgetId}:`, error)
      throw error
    }
  }

  async getBudget(budgetId: string): Promise<Budget | null> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    const budget = this.budgets.get(budgetId)
    return budget ? { ...budget } : null
  }

  async getBudgets(agentId?: string): Promise<Budget[]> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    const budgets = Array.from(this.budgets.values())
    
    if (agentId) {
      return budgets.filter(budget => budget.agentId === agentId)
    }

    return budgets
  }

  async checkBudgetAvailability(request: CostEstimationRequest): Promise<BudgetCheckResult> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      // Find applicable budgets
      const applicableBudgets = Array.from(this.budgets.values()).filter(budget => {
        // Check if budget is active and within date range
        if (!budget.isActive) return false
        
        const now = new Date()
        if (now < budget.startDate || now > budget.endDate) return false
        
        // Check agent-specific budgets
        if (budget.agentId && budget.agentId !== request.agentId) return false
        
        return true
      })

      if (applicableBudgets.length === 0) {
        return {
          allowed: true,
          remainingAmount: 0,
          currency: this.config.defaultCurrency!,
          utilizationPercentage: 0,
          warnings: ['No applicable budget found'],
          errors: [],
          recommendations: []
        }
      }

      // Estimate cost
      let estimatedCost: number
      if (this.costEstimator) {
        const costResult = await this.costEstimator.estimateCost(request)
        estimatedCost = costResult.totalCost
      } else {
        // Simple estimation based on token count
        estimatedCost = (request.inputTokens + (request.outputTokens || 0)) * 0.001
      }

      // Check each applicable budget
      let bestResult: BudgetCheckResult | null = null
      const warnings: string[] = []
      const errors: string[] = []
      const recommendations: string[] = []

      for (const budget of applicableBudgets) {
        const utilization = await this.getBudgetUtilization(budget.id)
        
        if (utilization.remainingAmount >= estimatedCost) {
          // Budget has sufficient funds
          const result: BudgetCheckResult = {
            allowed: true,
            budgetId: budget.id,
            remainingAmount: utilization.remainingAmount - estimatedCost,
            currency: budget.currency,
            utilizationPercentage: utilization.utilizationPercentage,
            warnings: [],
            errors: [],
            recommendations: []
          }

          // Check for warnings
          if (utilization.utilizationPercentage > (this.config.alertThresholds?.warningPercentage || 0.8)) {
            warnings.push(`Budget utilization is high: ${(utilization.utilizationPercentage * 100).toFixed(1)}%`)
          }

          // Check daily/weekly limits
          if (budget.maxDailySpend) {
            const todaySpending = await this.getTodaySpending(budget.id)
            if (todaySpending + estimatedCost > budget.maxDailySpend) {
              errors.push(`Daily spending limit would be exceeded`)
              result.allowed = false
            }
          }

          if (budget.maxWeeklySpend) {
            const weekSpending = await this.getWeekSpending(budget.id)
            if (weekSpending + estimatedCost > budget.maxWeeklySpend) {
              errors.push(`Weekly spending limit would be exceeded`)
              result.allowed = false
            }
          }

          if (result.allowed && (!bestResult || utilization.remainingAmount > bestResult.remainingAmount)) {
            bestResult = result
          }
        } else {
          // Insufficient funds
          errors.push(`Insufficient budget in ${budget.name}`)
        }
      }

      if (!bestResult) {
        return {
          allowed: false,
          remainingAmount: 0,
          currency: this.config.defaultCurrency!,
          utilizationPercentage: 100,
          warnings,
          errors,
          recommendations: ['Consider increasing budget limits or optimizing usage']
        }
      }

      bestResult.warnings = warnings
      bestResult.recommendations = recommendations

      return bestResult
    } catch (error) {
      console.error('Failed to check budget availability:', error)
      throw error
    }
  }

  async recordExpense(budgetId: string, expense: ExpenseRecord): Promise<void> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      // Add expense record
      const expenseWithId: ExpenseRecord = {
        ...expense,
        id: expense.id || uuidv4(),
        budgetId
      }

      const expenses = this.expenses.get(budgetId) || []
      expenses.push(expenseWithId)
      this.expenses.set(budgetId, expenses)

      // Check for alerts
      if (this.config.enableAlerts) {
        await this.checkBudgetAlerts(budgetId)
      }

      console.log(`Expense recorded for budget ${budgetId}: ${expense.amount} ${expense.currency}`)
    } catch (error) {
      console.error(`Failed to record expense for budget ${budgetId}:`, error)
      throw error
    }
  }

  async getBudgetUtilization(budgetId: string): Promise<BudgetUtilization> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      const expenses = this.expenses.get(budgetId) || []
      const spentAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0)
      const remainingAmount = budget.totalAmount - spentAmount
      const utilizationPercentage = (spentAmount / budget.totalAmount) * 100

      // Calculate daily average
      const daysElapsed = Math.max(1, Math.floor((Date.now() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)))
      const dailyAverage = spentAmount / daysElapsed

      // Calculate projected overspend
      const totalDays = Math.floor((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24))
      const daysRemaining = Math.max(0, totalDays - daysElapsed)
      const projectedTotal = dailyAverage * totalDays
      const projectedOverspend = projectedTotal > budget.totalAmount ? projectedTotal - budget.totalAmount : undefined

      // Calculate category utilization
      const categoryUtilization = budget.categories.map(category => {
        const categoryExpenses = expenses.filter(expense => {
          // Check if expense belongs to this category
          if (category.models && !category.models.includes(expense.model)) return false
          if (category.requestTypes && !category.requestTypes.includes(expense.requestType)) return false
          return true
        })

        const categorySpent = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0)
        const categoryRemaining = category.allocatedAmount - categorySpent
        const categoryUtilization = (categorySpent / category.allocatedAmount) * 100

        return {
          categoryId: category.id,
          categoryName: category.name,
          allocatedAmount: category.allocatedAmount,
          spentAmount: categorySpent,
          remainingAmount: categoryRemaining,
          utilizationPercentage: categoryUtilization
        }
      })

      // Generate time series data
      const timeSeriesData = this.generateTimeSeriesData(expenses, budget.startDate, budget.endDate)

      return {
        budgetId,
        totalAmount: budget.totalAmount,
        spentAmount,
        remainingAmount,
        utilizationPercentage,
        currency: budget.currency,
        dailyAverage,
        projectedOverspend,
        daysRemaining,
        categoryUtilization,
        timeSeriesData
      }
    } catch (error) {
      console.error(`Failed to get budget utilization for ${budgetId}:`, error)
      throw error
    }
  }

  async getBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      if (budgetId) {
        return (this.alerts.get(budgetId) || []).slice()
      }

      // Return all alerts
      const allAlerts: BudgetAlert[] = []
      for (const alerts of this.alerts.values()) {
        allAlerts.push(...alerts)
      }
      return allAlerts
    } catch (error) {
      console.error('Failed to get budget alerts:', error)
      throw error
    }
  }

  async setBudgetAlert(budgetId: string, alert: BudgetAlertConfig): Promise<BudgetAlert> {
    if (!this.initialized || !this.config.enableAlerts) {
      throw new Error('Budget alerts not enabled')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      const alertId = alert.id || uuidv4()
      const newAlert: BudgetAlert = {
        id: alertId,
        budgetId,
        type: alert.type,
        severity: alert.severity,
        message: alert.message || `Budget alert: ${alert.type}`,
        threshold: alert.threshold,
        currentValue: 0,
        triggeredAt: new Date(),
        acknowledged: false,
        metadata: {}
      }

      const alerts = this.alerts.get(budgetId) || []
      alerts.push(newAlert)
      this.alerts.set(budgetId, alerts)

      console.log(`Budget alert created for budget ${budgetId}`)
      return newAlert
    } catch (error) {
      console.error(`Failed to set budget alert for ${budgetId}:`, error)
      throw error
    }
  }

  async removeBudgetAlert(alertId: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Budget manager not initialized')
    }

    try {
      for (const [budgetId, alerts] of this.alerts.entries()) {
        const index = alerts.findIndex(alert => alert.id === alertId)
        if (index !== -1) {
          alerts.splice(index, 1)
          this.alerts.set(budgetId, alerts)
          console.log(`Budget alert ${alertId} removed`)
          return true
        }
      }
      return false
    } catch (error) {
      console.error(`Failed to remove budget alert ${alertId}:`, error)
      throw error
    }
  }

  async getBudgetForecast(budgetId: string, forecastPeriod: ForecastPeriod): Promise<BudgetForecast> {
    if (!this.initialized || !this.config.enableForecasting) {
      throw new Error('Budget forecasting not enabled')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      const utilization = await this.getBudgetUtilization(budgetId)
      const expenses = this.expenses.get(budgetId) || []

      // Generate forecast
      const forecast = this.generateBudgetForecast(utilization, expenses, forecastPeriod)

      // Calculate projected overspend
      const finalProjectedSpending = forecast[forecast.length - 1]?.cumulativeSpending || 0
      const projectedOverspend = finalProjectedSpending > budget.totalAmount
      const projectedOverspendAmount = projectedOverspend ? finalProjectedSpending - budget.totalAmount : undefined

      // Generate forecast factors
      const factors = this.generateForecastFactors()

      // Generate recommendations
      const recommendations = this.generateForecastRecommendations(budget, forecast)

      return {
        id: uuidv4(),
        budgetId,
        period: forecastPeriod,
        forecast,
        projectedOverspend,
        projectedOverspendAmount,
        confidence: this.config.forecastAccuracy!,
        factors,
        recommendations,
        timestamp: new Date()
      }
    } catch (error) {
      console.error(`Failed to get budget forecast for ${budgetId}:`, error)
      throw error
    }
  }

  async getBudgetRecommendations(budgetId: string): Promise<BudgetRecommendation[]> {
    if (!this.initialized || !this.config.enableRecommendations) {
      throw new Error('Budget recommendations not enabled')
    }

    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`)
      }

      const utilization = await this.getBudgetUtilization(budgetId)
      const recommendations: BudgetRecommendation[] = []

      // High utilization recommendation
      if (utilization.utilizationPercentage > 90) {
        recommendations.push({
          id: uuidv4(),
          type: 'budget_increase',
          title: 'Consider Increasing Budget',
          description: `Budget utilization is at ${(utilization.utilizationPercentage).toFixed(1)}%. Consider increasing the budget to avoid service interruptions.`,
          priority: 'high',
          implementationDifficulty: 'low',
          estimatedImpact: {
            budgetUtilizationChange: -20,
            riskMitigation: 0.8
          },
          steps: [
            'Analyze spending patterns',
            'Determine required budget increase',
            'Update budget allocation',
            'Monitor utilization after change'
          ]
        })
      }

      // Low utilization recommendation
      if (utilization.utilizationPercentage < 30) {
        recommendations.push({
          id: uuidv4(),
          type: 'budget_decrease',
          title: 'Consider Decreasing Budget',
          description: `Budget utilization is only ${(utilization.utilizationPercentage).toFixed(1)}%. Consider reducing the budget to optimize resource allocation.`,
          priority: 'medium',
          potentialSavings: budget.totalAmount * 0.5,
          implementationDifficulty: 'low',
          estimatedImpact: {
            budgetUtilizationChange: 40,
            efficiencyImprovement: 0.6
          },
          steps: [
            'Review actual usage patterns',
            'Calculate optimal budget size',
            'Reduce budget allocation',
            'Reallocate excess funds'
          ]
        })
      }

      // Category reallocation recommendation
      const underutilizedCategories = utilization.categoryUtilization.filter(cat => cat.utilizationPercentage < 20)
      const overutilizedCategories = utilization.categoryUtilization.filter(cat => cat.utilizationPercentage > 80)

      if (underutilizedCategories.length > 0 && overutilizedCategories.length > 0) {
        recommendations.push({
          id: uuidv4(),
          type: 'category_reallocation',
          title: 'Reallocate Budget Between Categories',
          description: 'Some categories are underutilized while others are overutilized. Consider reallocating funds.',
          priority: 'medium',
          implementationDifficulty: 'medium',
          estimatedImpact: {
            budgetUtilizationChange: -15,
            efficiencyImprovement: 0.4
          },
          steps: [
            'Identify underutilized and overutilized categories',
            'Calculate optimal reallocation amounts',
            'Update category allocations',
            'Monitor category utilization after change'
          ]
        })
      }

      // Spending reduction recommendation
      if (utilization.projectedOverspend) {
        recommendations.push({
          id: uuidv4(),
          type: 'spending_reduction',
          title: 'Implement Cost Reduction Measures',
          description: `Projected overspend of $${utilization.projectedOverspend.toFixed(2)}. Implement cost reduction measures.`,
          priority: 'high',
          potentialSavings: utilization.projectedOverspend * 0.8,
          implementationDifficulty: 'medium',
          estimatedImpact: {
            budgetUtilizationChange: -25,
            costReduction: utilization.projectedOverspend * 0.8
          },
          steps: [
            'Analyze spending patterns',
            'Identify cost optimization opportunities',
            'Implement cost reduction measures',
            'Monitor spending after implementation'
          ]
        })
      }

      return recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
    } catch (error) {
      console.error(`Failed to get budget recommendations for ${budgetId}:`, error)
      throw error
    }
  }

  private async checkBudgetAlerts(budgetId: string): Promise<void> {
    try {
      const budget = this.budgets.get(budgetId)
      if (!budget) return

      const utilization = await this.getBudgetUtilization(budgetId)
      const alerts = this.alerts.get(budgetId) || []

      // Check usage threshold alerts
      for (const alertConfig of budget.alerts) {
        if (!alertConfig.enabled) continue

        let shouldTrigger = false
        let currentValue = 0

        switch (alertConfig.type) {
          case 'usage_threshold':
            currentValue = utilization.utilizationPercentage
            shouldTrigger = currentValue >= alertConfig.threshold
            break
          case 'time_threshold':
            const daysElapsed = Math.floor((Date.now() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24))
            const totalDays = Math.floor((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24))
            const timePercentage = (daysElapsed / totalDays) * 100
            currentValue = timePercentage
            shouldTrigger = timePercentage >= alertConfig.threshold && utilization.utilizationPercentage < alertConfig.threshold
            break
          case 'spike_detection':
            // Simple spike detection based on daily average
            const todaySpending = await this.getTodaySpending(budgetId)
            const dailyAverage = utilization.dailyAverage
            currentValue = todaySpending
            shouldTrigger = dailyAverage > 0 && (todaySpending / dailyAverage) >= alertConfig.threshold
            break
          case 'daily_limit':
            if (budget.maxDailySpend) {
              const todaySpending = await this.getTodaySpending(budgetId)
              currentValue = todaySpending
              shouldTrigger = todaySpending >= alertConfig.threshold
            }
            break
          case 'weekly_limit':
            if (budget.maxWeeklySpend) {
              const weekSpending = await this.getWeekSpending(budgetId)
              currentValue = weekSpending
              shouldTrigger = weekSpending >= alertConfig.threshold
            }
            break
        }

        if (shouldTrigger) {
          // Check if similar alert already exists and is not acknowledged
          const existingAlert = alerts.find(alert => 
            alert.type === alertConfig.type && 
            !alert.acknowledged &&
            (Date.now() - alert.triggeredAt.getTime()) < 24 * 60 * 60 * 1000 // 24 hours
          )

          if (!existingAlert) {
            const newAlert: BudgetAlert = {
              id: uuidv4(),
              budgetId,
              type: alertConfig.type,
              severity: alertConfig.severity,
              message: alertConfig.message || `Budget alert: ${alertConfig.type}`,
              threshold: alertConfig.threshold,
              currentValue,
              triggeredAt: new Date(),
              acknowledged: false,
              metadata: {}
            }

            alerts.push(newAlert)
            this.alerts.set(budgetId, alerts)
            console.log(`Budget alert triggered for budget ${budgetId}: ${newAlert.message}`)
          }
        }
      }
    } catch (error) {
      console.error(`Failed to check budget alerts for ${budgetId}:`, error)
    }
  }

  private async getTodaySpending(budgetId: string): Promise<number> {
    const expenses = this.expenses.get(budgetId) || []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return expenses
      .filter(expense => expense.timestamp >= today && expense.timestamp < tomorrow)
      .reduce((sum, expense) => sum + expense.amount, 0)
  }

  private async getWeekSpending(budgetId: string): Promise<number> {
    const expenses = this.expenses.get(budgetId) || []
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    weekStart.setHours(0, 0, 0, 0)

    return expenses
      .filter(expense => expense.timestamp >= weekStart)
      .reduce((sum, expense) => sum + expense.amount, 0)
  }

  private generateTimeSeriesData(expenses: ExpenseRecord[], startDate: Date, endDate: Date): TimeSeriesData[] {
    const timeSeriesData: TimeSeriesData[] = []
    const current = new Date(startDate)
    let cumulativeAmount = 0

    while (current <= endDate) {
      const dayExpenses = expenses.filter(expense => {
        const expenseDate = new Date(expense.timestamp)
        return expenseDate.toDateString() === current.toDateString()
      })

      const dayAmount = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0)
      cumulativeAmount += dayAmount

      timeSeriesData.push({
        timestamp: new Date(current),
        amount: dayAmount,
        cumulativeAmount
      })

      current.setDate(current.getDate() + 1)
    }

    return timeSeriesData
  }

  private generateBudgetForecast(utilization: BudgetUtilization, expenses: ExpenseRecord[], forecastPeriod: ForecastPeriod): ForecastData[] {
    const forecast: ForecastData[] = []
    const current = new Date(forecastPeriod.start)
    let cumulativeSpending = utilization.spentAmount

    // Calculate daily average from historical data
    const dailyAverage = utilization.dailyAverage

    while (current <= forecastPeriod.end) {
      // Add some randomness to simulate real-world variation
      const variation = 0.8 + Math.random() * 0.4 // 80% to 120% of average
      const projectedSpending = dailyAverage * variation
      cumulativeSpending += projectedSpending

      forecast.push({
        date: new Date(current),
        projectedSpending,
        cumulativeSpending,
        remainingBudget: Math.max(0, utilization.totalAmount - cumulativeSpending),
        confidence: this.config.forecastAccuracy!
      })

      if (forecastPeriod.granularity === 'daily') {
        current.setDate(current.getDate() + 1)
      } else if (forecastPeriod.granularity === 'weekly') {
        current.setDate(current.getDate() + 7)
      } else if (forecastPeriod.granularity === 'monthly') {
        current.setMonth(current.getMonth() + 1)
      }
    }

    return forecast
  }

  private generateForecastFactors(): ForecastFactor[] {
    return [
      {
        name: 'Historical Spending Patterns',
        impact: 'neutral',
        magnitude: 0.8,
        description: 'Based on historical spending patterns'
      },
      {
        name: 'Seasonal Variations',
        impact: 'neutral',
        magnitude: 0.1,
        description: 'Expected seasonal variations in spending'
      },
      {
        name: 'Growth Trends',
        impact: 'positive',
        magnitude: 0.1,
        description: 'Accounting for expected growth in usage'
      }
    ]
  }

  private generateForecastRecommendations(budget: Budget, forecast: ForecastData[]): string[] {
    const recommendations: string[] = []
    const finalProjectedSpending = forecast[forecast.length - 1]?.cumulativeSpending || 0

    if (finalProjectedSpending > budget.totalAmount) {
      const overspendPercentage = ((finalProjectedSpending - budget.totalAmount) / budget.totalAmount) * 100
      recommendations.push(`Projected to exceed budget by ${(overspendPercentage).toFixed(1)}%. Consider implementing cost controls.`)
    }

    if (finalProjectedSpending < budget.totalAmount * 0.5) {
      const underutilizationPercentage = ((budget.totalAmount - finalProjectedSpending) / budget.totalAmount) * 100
      recommendations.push(`Projected to underutilize budget by ${(underutilizationPercentage).toFixed(1)}%. Consider reallocating funds.`)
    }

    return recommendations
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): BudgetManagerConfig {
    return { ...this.config }
  }

  setCostEstimator(costEstimator: ICostEstimator): void {
    this.costEstimator = costEstimator
  }

  async cleanup(): Promise<void> {
    this.budgets.clear()
    this.expenses.clear()
    this.alerts.clear()
    this.initialized = false
  }
}