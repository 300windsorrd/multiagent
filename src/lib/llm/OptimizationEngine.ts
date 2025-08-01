import { v4 as uuidv4 } from 'uuid'
import { ICostEstimator, CostEstimationRequest, CostEstimationResult, ModelPricing } from './CostEstimator'
import { IBudgetManager, Budget, BudgetUtilization } from './BudgetManager'

export interface ModelCapabilities {
  maxTokens: number
  streaming: boolean
  chat: boolean
  completion: boolean
  embeddings: boolean
  vision: boolean
  functionCalling: boolean
  jsonMode: boolean
  contextWindow: number
  supportedLanguages: string[]
  specialFeatures: string[]
}

export interface IOptimizationEngine {
  initialize(config: OptimizationEngineConfig): Promise<void>
  optimizeRequest(request: CostEstimationRequest): Promise<OptimizationResult>
  optimizeBatch(requests: CostEstimationRequest[]): Promise<BatchOptimizationResult>
  optimizeModelSelection(requests: CostEstimationRequest[]): Promise<ModelSelectionOptimization>
  optimizeTokenUsage(requests: CostEstimationRequest[]): Promise<TokenOptimizationResult>
  optimizeBudgetAllocation(budgets: Budget[]): Promise<BudgetOptimizationResult>
  getOptimizationInsights(timeRange?: TimeRange): Promise<OptimizationInsight[]>
  getOptimizationRecommendations(): Promise<OptimizationRecommendation[]>
  applyOptimization(optimizationId: string): Promise<OptimizationApplicationResult>
  getOptimizationHistory(): Promise<OptimizationRecord[]>
  setOptimizationRule(rule: OptimizationRule): Promise<void>
  removeOptimizationRule(ruleId: string): Promise<void>
  getOptimizationRules(): Promise<OptimizationRule[]>
}

export interface OptimizationEngineConfig {
  enableAutoOptimization?: boolean
  enableModelSelection?: boolean
  enableTokenOptimization?: boolean
  enableBudgetOptimization?: boolean
  optimizationInterval?: number
  confidenceThreshold?: number
  savingsThreshold?: number
  maxOptimizationImpact?: number
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface OptimizationResult {
  id: string
  originalRequest: CostEstimationRequest
  optimizedRequest: CostEstimationRequest
  originalCost: number
  optimizedCost: number
  savings: number
  savingsPercentage: number
  confidence: number
  optimizations: OptimizationStep[]
  impact: OptimizationImpact
  timestamp: Date
}

export interface OptimizationStep {
  type: 'model_switch' | 'token_reduction' | 'prompt_optimization' | 'batching' | 'caching'
  description: string
  impact: number
  confidence: number
  implementation: string
  metadata?: any
}

export interface OptimizationImpact {
  costReduction: number
  performanceChange: number
  qualityChange: number
  reliabilityChange: number
}

export interface BatchOptimizationResult {
  id: string
  originalRequests: CostEstimationRequest[]
  optimizedRequests: CostEstimationRequest[]
  originalTotalCost: number
  optimizedTotalCost: number
  totalSavings: number
  savingsPercentage: number
  optimizations: BatchOptimizationStep[]
  timestamp: Date
}

export interface BatchOptimizationStep {
  type: 'batch_processing' | 'model_standardization' | 'request_grouping' | 'parallel_processing'
  description: string
  affectedRequests: string[]
  savings: number
  confidence: number
  implementation: string
}

export interface ModelSelectionOptimization {
  id: string
  requests: CostEstimationRequest[]
  modelAssignments: ModelAssignment[]
  originalCost: number
  optimizedCost: number
  savings: number
  savingsPercentage: number
  confidence: number
  timestamp: Date
}

export interface ModelAssignment {
  requestId: string
  originalModel: string
  recommendedModel: string
  reason: string
  expectedSavings: number
  confidence: number
}

export interface TokenOptimizationResult {
  id: string
  requests: CostEstimationRequest[]
  tokenOptimizations: TokenOptimization[]
  originalTotalTokens: number
  optimizedTotalTokens: number
  tokenReduction: number
  reductionPercentage: number
  estimatedCostSavings: number
  timestamp: Date
}

export interface TokenOptimization {
  requestId: string
  type: 'prompt_compression' | 'context_optimization' | 'response_caching' | 'output_truncation'
  description: string
  originalTokens: number
  optimizedTokens: number
  tokenReduction: number
  estimatedSavings: number
  confidence: number
}

export interface BudgetOptimizationResult {
  id: string
  originalBudgets: Budget[]
  optimizedBudgets: Budget[]
  totalReallocation: number
  optimizationSteps: BudgetOptimizationStep[]
  expectedEfficiencyImprovement: number
  timestamp: Date
}

export interface BudgetOptimizationStep {
  type: 'budget_increase' | 'budget_decrease' | 'category_reallocation' | 'period_adjustment'
  budgetId: string
  description: string
  amount: number
  reason: string
  expectedImpact: number
}

export interface OptimizationInsight {
  id: string
  type: 'cost_pattern' | 'usage_anomaly' | 'efficiency_opportunity' | 'budget_mismatch'
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  data: any
  timestamp: Date
  recommendations: string[]
}

export interface OptimizationRecommendation {
  id: string
  type: 'model_selection' | 'token_optimization' | 'budget_adjustment' | 'scheduling' | 'caching'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  estimatedSavings: number
  implementationDifficulty: 'low' | 'medium' | 'high'
  estimatedImpact: OptimizationImpact
  steps: string[]
  prerequisites: string[]
  risks: string[]
  timestamp: Date
}

export interface OptimizationApplicationResult {
  id: string
  optimizationId: string
  success: boolean
  appliedSteps: string[]
  failedSteps: string[]
  actualSavings: number
  actualImpact: OptimizationImpact
  errors: string[]
  warnings: string[]
  timestamp: Date
}

export interface OptimizationRecord {
  id: string
  type: string
  description: string
  originalState: any
  optimizedState: any
  savings: number
  impact: OptimizationImpact
  success: boolean
  timestamp: Date
  appliedBy: string
}

export interface OptimizationRule {
  id: string
  name: string
  description: string
  type: 'model_selection' | 'token_optimization' | 'budget_optimization' | 'scheduling'
  condition: OptimizationCondition
  action: OptimizationAction
  priority: number
  enabled: boolean
  autoApply: boolean
  createdAt: Date
  lastModified: Date
  lastApplied?: Date
  applicationCount: number
  totalSavings: number
}

export interface OptimizationCondition {
  model?: string
  requestType?: string
  minTokens?: number
  maxTokens?: number
  minCost?: number
  maxCost?: number
  timeRange?: TimeRange
  customCondition?: (request: CostEstimationRequest) => Promise<boolean>
}

export interface OptimizationAction {
  type: 'switch_model' | 'reduce_tokens' | 'adjust_budget' | 'schedule_request'
  target: string
  parameters: any
  description: string
}

export class OptimizationEngine implements IOptimizationEngine {
  private config!: OptimizationEngineConfig
  private costEstimator?: ICostEstimator
  private budgetManager?: IBudgetManager
  private optimizationRules: Map<string, OptimizationRule> = new Map()
  private optimizationHistory: OptimizationRecord[] = []
  private modelCapabilities: Map<string, ModelCapabilities> = new Map()
  private initialized = false
  private optimizationInterval?: NodeJS.Timeout

  constructor(costEstimator?: ICostEstimator, budgetManager?: IBudgetManager) {
    this.costEstimator = costEstimator
    this.budgetManager = budgetManager
  }

  async initialize(config: OptimizationEngineConfig): Promise<void> {
    try {
      this.config = {
        enableAutoOptimization: true,
        enableModelSelection: true,
        enableTokenOptimization: true,
        enableBudgetOptimization: true,
        optimizationInterval: 300000, // 5 minutes
        confidenceThreshold: 0.7,
        savingsThreshold: 0.05, // 5% savings threshold
        maxOptimizationImpact: 0.3, // Maximum 30% impact on any metric
        ...config
      }

      // Initialize model capabilities
      await this.initializeModelCapabilities()

      // Start auto-optimization if enabled
      if (this.config.enableAutoOptimization) {
        this.startAutoOptimization()
      }

      this.initialized = true
      console.log('Optimization engine initialized successfully')
    } catch (error) {
      console.error('Failed to initialize optimization engine:', error)
      throw error
    }
  }

  async optimizeRequest(request: CostEstimationRequest): Promise<OptimizationResult> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      // Get original cost
      const originalCost = this.costEstimator 
        ? (await this.costEstimator.estimateCost(request)).totalCost
        : this.estimateSimpleCost(request)

      const optimizations: OptimizationStep[] = []
      let optimizedRequest = { ...request }
      let totalSavings = 0
      let totalImpact: OptimizationImpact = {
        costReduction: 0,
        performanceChange: 0,
        qualityChange: 0,
        reliabilityChange: 0
      }

      // Apply optimization rules
      for (const rule of this.optimizationRules.values()) {
        if (!rule.enabled) continue

        if (await this.matchesOptimizationCondition(rule.condition, request)) {
          const optimizationResult = await this.applyOptimizationRule(rule, request)
          if (optimizationResult.savings > 0) {
            optimizations.push(optimizationResult.step)
            optimizedRequest = optimizationResult.request
            totalSavings += optimizationResult.savings
            totalImpact = this.combineOptimizationImpacts(totalImpact, optimizationResult.impact)
          }
        }
      }

      // Model selection optimization
      if (this.config.enableModelSelection) {
        const modelOptimization = await this.optimizeModelForRequest(optimizedRequest)
        if (modelOptimization.savings > 0) {
          optimizations.push(modelOptimization.step)
          optimizedRequest.model = modelOptimization.recommendedModel
          totalSavings += modelOptimization.savings
          totalImpact = this.combineOptimizationImpacts(totalImpact, modelOptimization.impact)
        }
      }

      // Token optimization
      if (this.config.enableTokenOptimization) {
        const tokenOptimization = await this.optimizeTokensForRequest(optimizedRequest)
        if (tokenOptimization.savings > 0) {
          optimizations.push(tokenOptimization.step)
          optimizedRequest.inputTokens = tokenOptimization.optimizedInputTokens
          if (tokenOptimization.optimizedOutputTokens) {
            optimizedRequest.outputTokens = tokenOptimization.optimizedOutputTokens
          }
          totalSavings += tokenOptimization.savings
          totalImpact = this.combineOptimizationImpacts(totalImpact, tokenOptimization.impact)
        }
      }

      // Calculate optimized cost
      const optimizedCost = this.costEstimator
        ? (await this.costEstimator.estimateCost(optimizedRequest)).totalCost
        : this.estimateSimpleCost(optimizedRequest)

      // Calculate confidence
      const confidence = this.calculateConfidence(optimizations)

      return {
        id: uuidv4(),
        originalRequest: request,
        optimizedRequest,
        originalCost,
        optimizedCost,
        savings: originalCost - optimizedCost,
        savingsPercentage: originalCost > 0 ? ((originalCost - optimizedCost) / originalCost) * 100 : 0,
        confidence,
        optimizations,
        impact: totalImpact,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to optimize request:', error)
      throw error
    }
  }

  async optimizeBatch(requests: CostEstimationRequest[]): Promise<BatchOptimizationResult> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      // Get original total cost
      const originalCosts = await Promise.all(
        requests.map(request => 
          this.costEstimator 
            ? this.costEstimator!.estimateCost(request)
            : Promise.resolve({ totalCost: this.estimateSimpleCost(request) })
        )
      )
      const originalTotalCost = originalCosts.reduce((sum, cost) => sum + cost.totalCost, 0)

      const optimizations: BatchOptimizationStep[] = []
      let optimizedRequests = [...requests]
      let totalSavings = 0

      // Batch processing optimization
      if (requests.length > 5) {
        const batchOptimization = await this.optimizeBatchProcessing(optimizedRequests)
        if (batchOptimization.savings > 0) {
          optimizations.push(batchOptimization.step)
          totalSavings += batchOptimization.savings
        }
      }

      // Model standardization optimization
      if (this.config.enableModelSelection) {
        const modelStandardization = await this.standardizeModels(optimizedRequests)
        if (modelStandardization.savings > 0) {
          optimizations.push(modelStandardization.step)
          optimizedRequests = modelStandardization.requests
          totalSavings += modelStandardization.savings
        }
      }

      // Request grouping optimization
      const requestGrouping = await this.groupSimilarRequests(optimizedRequests)
      if (requestGrouping.savings > 0) {
        optimizations.push(requestGrouping.step)
        optimizedRequests = requestGrouping.requests
        totalSavings += requestGrouping.savings
      }

      // Calculate optimized total cost
      const optimizedCosts = await Promise.all(
        optimizedRequests.map(request => 
          this.costEstimator 
            ? this.costEstimator!.estimateCost(request)
            : Promise.resolve({ totalCost: this.estimateSimpleCost(request) })
        )
      )
      const optimizedTotalCost = optimizedCosts.reduce((sum, cost) => sum + cost.totalCost, 0)

      return {
        id: uuidv4(),
        originalRequests: requests,
        optimizedRequests,
        originalTotalCost,
        optimizedTotalCost,
        totalSavings: originalTotalCost - optimizedTotalCost,
        savingsPercentage: originalTotalCost > 0 ? ((originalTotalCost - optimizedTotalCost) / originalTotalCost) * 100 : 0,
        optimizations,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to optimize batch:', error)
      throw error
    }
  }

  async optimizeModelSelection(requests: CostEstimationRequest[]): Promise<ModelSelectionOptimization> {
    if (!this.initialized || !this.config.enableModelSelection) {
      throw new Error('Model selection optimization not enabled')
    }

    try {
      const modelAssignments: ModelAssignment[] = []
      let totalSavings = 0

      // Get original costs
      const originalCosts = await Promise.all(
        requests.map(request => 
          this.costEstimator 
            ? this.costEstimator!.estimateCost(request)
            : Promise.resolve({ totalCost: this.estimateSimpleCost(request) })
        )
      )
      const originalTotalCost = originalCosts.reduce((sum, cost) => sum + cost.totalCost, 0)

      // Analyze each request
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i]
        const originalCost = originalCosts[i].totalCost

        // Find optimal model for this request
        const optimalModel = await this.findOptimalModel(request)
        
        if (optimalModel.model !== request.model && optimalModel.savings > 0) {
          const optimizedRequest = { ...request, model: optimalModel.model }
          const optimizedCost = this.costEstimator
            ? (await this.costEstimator!.estimateCost(optimizedRequest)).totalCost
            : this.estimateSimpleCost(optimizedRequest)

          modelAssignments.push({
            requestId: request.agentId,
            originalModel: request.model,
            recommendedModel: optimalModel.model,
            reason: optimalModel.reason,
            expectedSavings: originalCost - optimizedCost,
            confidence: optimalModel.confidence
          })

          totalSavings += originalCost - optimizedCost
        }
      }

      // Calculate optimized total cost
      const optimizedTotalCost = originalTotalCost - totalSavings

      return {
        id: uuidv4(),
        requests,
        modelAssignments,
        originalCost: originalTotalCost,
        optimizedCost: optimizedTotalCost,
        savings: totalSavings,
        savingsPercentage: originalTotalCost > 0 ? (totalSavings / originalTotalCost) * 100 : 0,
        confidence: this.calculateModelConfidence(modelAssignments),
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to optimize model selection:', error)
      throw error
    }
  }

  async optimizeTokenUsage(requests: CostEstimationRequest[]): Promise<TokenOptimizationResult> {
    if (!this.initialized || !this.config.enableTokenOptimization) {
      throw new Error('Token optimization not enabled')
    }

    try {
      const tokenOptimizations: TokenOptimization[] = []
      let totalTokenReduction = 0
      let estimatedCostSavings = 0

      const originalTotalTokens = requests.reduce((sum, request) => 
        sum + request.inputTokens + (request.outputTokens || 0), 0)

      // Analyze each request
      for (const request of requests) {
        const originalTokens = request.inputTokens + (request.outputTokens || 0)
        
        // Prompt compression optimization
        if (request.inputTokens > 1000) {
          const compressionRatio = 0.85 // 15% compression
          const optimizedInputTokens = Math.floor(request.inputTokens * compressionRatio)
          const tokenReduction = request.inputTokens - optimizedInputTokens
          
          if (tokenReduction > 50) { // Only if significant reduction
            const estimatedSavings = this.estimateTokenSavings(request.model, tokenReduction, 0)
            
            tokenOptimizations.push({
              requestId: request.agentId,
              type: 'prompt_compression',
              description: 'Compress prompt to reduce token count',
              originalTokens: request.inputTokens,
              optimizedTokens: optimizedInputTokens,
              tokenReduction,
              estimatedSavings,
              confidence: 0.8
            })

            totalTokenReduction += tokenReduction
            estimatedCostSavings += estimatedSavings
          }
        }

        // Context optimization
        if (request.inputTokens > 2000) {
          const contextReduction = Math.floor(request.inputTokens * 0.1) // 10% reduction
          const optimizedInputTokens = request.inputTokens - contextReduction
          
          const estimatedSavings = this.estimateTokenSavings(request.model, contextReduction, 0)
          
          tokenOptimizations.push({
            requestId: request.agentId,
            type: 'context_optimization',
            description: 'Optimize context window to reduce token count',
            originalTokens: request.inputTokens,
            optimizedTokens: optimizedInputTokens,
            tokenReduction: contextReduction,
            estimatedSavings,
            confidence: 0.7
          })

          totalTokenReduction += contextReduction
          estimatedCostSavings += estimatedSavings
        }

        // Output truncation for long responses
        if (request.outputTokens && request.outputTokens > 1000) {
          const outputReduction = Math.floor(request.outputTokens * 0.05) // 5% reduction
          const optimizedOutputTokens = request.outputTokens - outputReduction
          
          const estimatedSavings = this.estimateTokenSavings(request.model, 0, outputReduction)
          
          tokenOptimizations.push({
            requestId: request.agentId,
            type: 'output_truncation',
            description: 'Truncate output to reduce token count',
            originalTokens: request.outputTokens,
            optimizedTokens: optimizedOutputTokens,
            tokenReduction: outputReduction,
            estimatedSavings,
            confidence: 0.6
          })

          totalTokenReduction += outputReduction
          estimatedCostSavings += estimatedSavings
        }
      }

      const optimizedTotalTokens = originalTotalTokens - totalTokenReduction
      const reductionPercentage = originalTotalTokens > 0 ? (totalTokenReduction / originalTotalTokens) * 100 : 0

      return {
        id: uuidv4(),
        requests,
        tokenOptimizations,
        originalTotalTokens,
        optimizedTotalTokens,
        tokenReduction: totalTokenReduction,
        reductionPercentage,
        estimatedCostSavings,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to optimize token usage:', error)
      throw error
    }
  }

  async optimizeBudgetAllocation(budgets: Budget[]): Promise<BudgetOptimizationResult> {
    if (!this.initialized || !this.config.enableBudgetOptimization) {
      throw new Error('Budget optimization not enabled')
    }

    try {
      const optimizationSteps: BudgetOptimizationStep[] = []
      let totalReallocation = 0
      let expectedEfficiencyImprovement = 0

      // Analyze budget utilization
      const budgetUtilizations = await Promise.all(
        budgets.map(async budget => {
          if (this.budgetManager) {
            return await this.budgetManager.getBudgetUtilization(budget.id)
          }
          return this.generateMockUtilization(budget)
        })
      )

      // Identify underutilized and overutilized budgets
      const underutilizedBudgets = budgetUtilizations.filter(util => util.utilizationPercentage < 30)
      const overutilizedBudgets = budgetUtilizations.filter(util => util.utilizationPercentage > 80)

      // Reallocate funds from underutilized to overutilized budgets
      for (const underutilized of underutilizedBudgets) {
        const underutilizedBudget = budgets.find(b => b.id === underutilized.budgetId)!
        const reallocationAmount = underutilizedBudget.totalAmount * 0.2 // Reallocate 20%

        for (const overutilized of overutilizedBudgets) {
          const overutilizedBudget = budgets.find(b => b.id === overutilized.budgetId)!
          
          optimizationSteps.push({
            type: 'category_reallocation',
            budgetId: underutilizedBudget.id,
            description: `Reallocate funds from underutilized budget to overutilized budget`,
            amount: -reallocationAmount,
            reason: `Budget utilization at ${underutilized.utilizationPercentage.toFixed(1)}%`,
            expectedImpact: 0.15
          })

          optimizationSteps.push({
            type: 'category_reallocation',
            budgetId: overutilizedBudget.id,
            description: `Receive additional funds from underutilized budget`,
            amount: reallocationAmount,
            reason: `Budget utilization at ${overutilized.utilizationPercentage.toFixed(1)}%`,
            expectedImpact: 0.15
          })

          totalReallocation += reallocationAmount
          expectedEfficiencyImprovement += 0.15
          break // Only reallocate to one overutilized budget per underutilized budget
        }
      }

      // Adjust budgets with projected overspend
      for (const utilization of budgetUtilizations) {
        if (utilization.projectedOverspend) {
          const budget = budgets.find(b => b.id === utilization.budgetId)!
          const increaseAmount = utilization.projectedOverspend * 1.2 // 20% buffer

          optimizationSteps.push({
            type: 'budget_increase',
            budgetId: budget.id,
            description: `Increase budget to prevent projected overspend`,
            amount: increaseAmount,
            reason: `Projected overspend of $${utilization.projectedOverspend.toFixed(2)}`,
            expectedImpact: 0.25
          })

          totalReallocation += increaseAmount
          expectedEfficiencyImprovement += 0.25
        }
      }

      // Create optimized budgets (in a real implementation, this would update the actual budgets)
      const optimizedBudgets = budgets.map(budget => {
        const budgetChanges = optimizationSteps.filter(step => step.budgetId === budget.id)
        const totalChange = budgetChanges.reduce((sum, step) => sum + step.amount, 0)
        
        return {
          ...budget,
          totalAmount: budget.totalAmount + totalChange
        }
      })

      return {
        id: uuidv4(),
        originalBudgets: budgets,
        optimizedBudgets,
        totalReallocation,
        optimizationSteps,
        expectedEfficiencyImprovement,
        timestamp: new Date()
      }
    } catch (error) {
      console.error('Failed to optimize budget allocation:', error)
      throw error
    }
  }

  async getOptimizationInsights(timeRange?: TimeRange): Promise<OptimizationInsight[]> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      const insights: OptimizationInsight[] = []

      // In a real implementation, this would analyze actual usage data
      // For now, we'll generate mock insights

      // Cost pattern insight
      insights.push({
        id: uuidv4(),
        type: 'cost_pattern',
        title: 'Weekend Cost Spike',
        description: 'Costs increase by 40% on weekends compared to weekdays',
        severity: 'medium',
        data: {
          weekdayAverage: 75,
          weekendAverage: 105,
          increasePercentage: 40
        },
        timestamp: new Date(),
        recommendations: [
          'Implement weekend-specific cost controls',
          'Consider batching non-urgent requests for weekdays',
          'Review weekend usage patterns'
        ]
      })

      // Usage anomaly insight
      insights.push({
        id: uuidv4(),
        type: 'usage_anomaly',
        title: 'Unusual Model Usage',
        description: 'GPT-4 usage increased by 200% in the last week',
        severity: 'high',
        data: {
          model: 'gpt-4',
          previousWeekUsage: 100,
          currentWeekUsage: 300,
          increasePercentage: 200
        },
        timestamp: new Date(),
        recommendations: [
          'Investigate cause of increased GPT-4 usage',
          'Consider switching to GPT-3.5 for suitable tasks',
          'Implement model usage monitoring'
        ]
      })

      // Efficiency opportunity insight
      insights.push({
        id: uuidv4(),
        type: 'efficiency_opportunity',
        title: 'Token Optimization Opportunity',
        description: '20% of requests have excessive token usage',
        severity: 'medium',
        data: {
          totalRequests: 1000,
          excessiveTokenRequests: 200,
          percentage: 20,
          potentialSavings: 0.15
        },
        timestamp: new Date(),
        recommendations: [
          'Implement prompt optimization for high-token requests',
          'Add token usage alerts',
          'Provide token optimization guidelines'
        ]
      })

      return insights.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 }
        return severityOrder[b.severity] - severityOrder[a.severity]
      })
    } catch (error) {
      console.error('Failed to get optimization insights:', error)
      throw error
    }
  }

  async getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      const recommendations: OptimizationRecommendation[] = []

      // Model selection recommendation
      recommendations.push({
        id: uuidv4(),
        type: 'model_selection',
        title: 'Optimize Model Selection',
        description: 'Switch to more cost-effective models for specific task types',
        priority: 'high',
        estimatedSavings: 0.25,
        implementationDifficulty: 'medium',
        estimatedImpact: {
          costReduction: 0.25,
          performanceChange: -0.05,
          qualityChange: -0.02,
          reliabilityChange: 0
        },
        steps: [
          'Analyze current model usage patterns',
          'Identify opportunities for model substitution',
          'Implement model selection logic',
          'Monitor and adjust based on performance'
        ],
        prerequisites: [
          'Model performance data',
          'Cost analysis capabilities'
        ],
        risks: [
          'Potential quality degradation',
          'Implementation complexity'
        ],
        timestamp: new Date()
      })

      // Token optimization recommendation
      recommendations.push({
        id: uuidv4(),
        type: 'token_optimization',
        title: 'Implement Token Optimization',
        description: 'Reduce token consumption through prompt optimization and caching',
        priority: 'medium',
        estimatedSavings: 0.15,
        implementationDifficulty: 'low',
        estimatedImpact: {
          costReduction: 0.15,
          performanceChange: 0.1,
          qualityChange: 0,
          reliabilityChange: 0.05
        },
        steps: [
          'Implement prompt compression',
          'Add response caching',
          'Optimize context windows',
          'Monitor token usage patterns'
        ],
        prerequisites: [
          'Caching infrastructure',
          'Token analysis tools'
        ],
        risks: [
          'Cache management complexity',
          'Potential information loss'
        ],
        timestamp: new Date()
      })

      // Budget adjustment recommendation
      recommendations.push({
        id: uuidv4(),
        type: 'budget_adjustment',
        title: 'Optimize Budget Allocation',
        description: 'Reallocate budget from underutilized to overutilized services',
        priority: 'medium',
        estimatedSavings: 0.1,
        implementationDifficulty: 'medium',
        estimatedImpact: {
          costReduction: 0.1,
          performanceChange: 0,
          qualityChange: 0,
          reliabilityChange: 0.1
        },
        steps: [
          'Analyze budget utilization patterns',
          'Identify underutilized and overutilized services',
          'Calculate optimal reallocation amounts',
          'Implement budget adjustments',
          'Monitor post-adjustment performance'
        ],
        prerequisites: [
          'Budget utilization data',
          'Cost analysis capabilities'
        ],
        risks: [
          'Service disruption during reallocation',
          'Inaccurate utilization projections'
        ],
        timestamp: new Date()
      })

      return recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
    } catch (error) {
      console.error('Failed to get optimization recommendations:', error)
      throw error
    }
  }

  async applyOptimization(optimizationId: string): Promise<OptimizationApplicationResult> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      // Find optimization in history
      const optimization = this.optimizationHistory.find(opt => opt.id === optimizationId)
      if (!optimization) {
        throw new Error(`Optimization ${optimizationId} not found`)
      }

      const appliedSteps: string[] = []
      const failedSteps: string[] = []
      const errors: string[] = []
      const warnings: string[] = []

      // Apply optimization steps
      // In a real implementation, this would apply the actual optimization
      // For now, we'll simulate the application

      try {
        // Simulate optimization application
        appliedSteps.push('Applied model selection optimization')
        appliedSteps.push('Applied token optimization')
        
        // Add some warnings
        warnings.push('Monitor performance after optimization')
        warnings.push('Review optimization effectiveness after 1 week')
      } catch (error) {
        failedSteps.push('Failed to apply optimization')
        errors.push((error as Error).message)
      }

      // Record optimization application
      const applicationResult: OptimizationApplicationResult = {
        id: uuidv4(),
        optimizationId,
        success: failedSteps.length === 0,
        appliedSteps,
        failedSteps,
        actualSavings: optimization.savings * 0.9, // Assume 90% of projected savings
        actualImpact: optimization.impact,
        errors,
        warnings,
        timestamp: new Date()
      }

      // Update optimization record
      optimization.success = applicationResult.success
      optimization.appliedBy = 'system'
      this.optimizationHistory.push(optimization)

      return applicationResult
    } catch (error) {
      console.error(`Failed to apply optimization ${optimizationId}:`, error)
      throw error
    }
  }

  async getOptimizationHistory(): Promise<OptimizationRecord[]> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    return [...this.optimizationHistory].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }

  async setOptimizationRule(rule: OptimizationRule): Promise<void> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      const ruleWithDefaults: OptimizationRule = {
        ...rule,
        applicationCount: 0,
        totalSavings: 0,
        createdAt: new Date(),
        lastModified: new Date()
      }

      this.optimizationRules.set(rule.id, ruleWithDefaults)
      console.log(`Optimization rule ${rule.name} set successfully`)
    } catch (error) {
      console.error('Failed to set optimization rule:', error)
      throw error
    }
  }

  async removeOptimizationRule(ruleId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    try {
      const deleted = this.optimizationRules.delete(ruleId)
      if (!deleted) {
        throw new Error(`Optimization rule ${ruleId} not found`)
      }
      console.log(`Optimization rule ${ruleId} removed successfully`)
    } catch (error) {
      console.error(`Failed to remove optimization rule ${ruleId}:`, error)
      throw error
    }
  }

  async getOptimizationRules(): Promise<OptimizationRule[]> {
    if (!this.initialized) {
      throw new Error('Optimization engine not initialized')
    }

    return Array.from(this.optimizationRules.values())
  }

  private async initializeModelCapabilities(): Promise<void> {
    // Initialize model capabilities
    this.modelCapabilities.set('gpt-4', {
      maxTokens: 8192,
      streaming: true,
      chat: true,
      completion: true,
      embeddings: false,
      vision: false,
      functionCalling: true,
      jsonMode: true,
      contextWindow: 8192,
      supportedLanguages: ['en'],
      specialFeatures: ['function_calling', 'json_mode']
    })

    this.modelCapabilities.set('gpt-3.5-turbo', {
      maxTokens: 4096,
      streaming: true,
      chat: true,
      completion: true,
      embeddings: false,
      vision: false,
      functionCalling: true,
      jsonMode: true,
      contextWindow: 4096,
      supportedLanguages: ['en'],
      specialFeatures: ['function_calling', 'json_mode']
    })

    this.modelCapabilities.set('claude-3-opus-20240229', {
      maxTokens: 200000,
      streaming: true,
      chat: true,
      completion: true,
      embeddings: false,
      vision: true,
      functionCalling: false,
      jsonMode: false,
      contextWindow: 200000,
      supportedLanguages: ['en'],
      specialFeatures: ['vision', 'large_context']
    })

    this.modelCapabilities.set('claude-3-sonnet-20240229', {
      maxTokens: 200000,
      streaming: true,
      chat: true,
      completion: true,
      embeddings: false,
      vision: true,
      functionCalling: false,
      jsonMode: false,
      contextWindow: 200000,
      supportedLanguages: ['en'],
      specialFeatures: ['vision', 'large_context']
    })

    this.modelCapabilities.set('claude-3-haiku-20240307', {
      maxTokens: 200000,
      streaming: true,
      chat: true,
      completion: true,
      embeddings: false,
      vision: true,
      functionCalling: false,
      jsonMode: false,
      contextWindow: 200000,
      supportedLanguages: ['en'],
      specialFeatures: ['vision', 'large_context', 'fast_response']
    })
  }

  private async matchesOptimizationCondition(condition: OptimizationCondition, request: CostEstimationRequest): Promise<boolean> {
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

    // Check cost range
    const estimatedCost = this.estimateSimpleCost(request)
    if (condition.minCost && estimatedCost < condition.minCost) {
      return false
    }

    if (condition.maxCost && estimatedCost > condition.maxCost) {
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

  private async applyOptimizationRule(rule: OptimizationRule, request: CostEstimationRequest): Promise<{
    request: CostEstimationRequest
    savings: number
    impact: OptimizationImpact
    step: OptimizationStep
  }> {
    const originalCost = this.estimateSimpleCost(request)
    let optimizedRequest = { ...request }
    let savings = 0
    let impact: OptimizationImpact = {
      costReduction: 0,
      performanceChange: 0,
      qualityChange: 0,
      reliabilityChange: 0
    }

    switch (rule.action.type) {
      case 'switch_model':
        optimizedRequest.model = rule.action.target
        const optimizedCost = this.estimateSimpleCost(optimizedRequest)
        savings = originalCost - optimizedCost
        impact = {
          costReduction: savings / originalCost,
          performanceChange: -0.05, // Slight performance impact
          qualityChange: -0.02, // Slight quality impact
          reliabilityChange: 0
        }
        break

      case 'reduce_tokens':
        const tokenReduction = rule.action.parameters.tokenReduction || 0
        optimizedRequest.inputTokens = Math.max(1, request.inputTokens - tokenReduction)
        if (request.outputTokens) {
          optimizedRequest.outputTokens = Math.max(1, request.outputTokens - (rule.action.parameters.outputTokenReduction || 0))
        }
        savings = this.estimateTokenSavings(request.model, tokenReduction, rule.action.parameters.outputTokenReduction || 0)
        impact = {
          costReduction: savings / originalCost,
          performanceChange: 0.1, // Performance improvement
          qualityChange: -0.05, // Slight quality impact
          reliabilityChange: 0.05
        }
        break
    }

    const step: OptimizationStep = {
      type: rule.action.type === 'switch_model' ? 'model_switch' : 'token_reduction',
      description: rule.action.description,
      impact: savings / originalCost,
      confidence: 0.8,
      implementation: rule.action.parameters.implementation || 'Apply optimization rule'
    }

    return {
      request: optimizedRequest,
      savings,
      impact,
      step
    }
  }

  private async optimizeModelForRequest(request: CostEstimationRequest): Promise<{
    recommendedModel: string
    savings: number
    impact: OptimizationImpact
    step: OptimizationStep
  }> {
    const originalCost = this.estimateSimpleCost(request)
    const optimalModel = await this.findOptimalModel(request)

    if (optimalModel.model === request.model) {
      return {
        recommendedModel: request.model,
        savings: 0,
        impact: {
          costReduction: 0,
          performanceChange: 0,
          qualityChange: 0,
          reliabilityChange: 0
        },
        step: {
          type: 'model_switch',
          description: 'No model change needed',
          impact: 0,
          confidence: 1,
          implementation: 'Keep current model'
        }
      }
    }

    const optimizedCost = this.estimateSimpleCost({ ...request, model: optimalModel.model })
    const savings = originalCost - optimizedCost

    return {
      recommendedModel: optimalModel.model,
      savings,
      impact: {
        costReduction: savings / originalCost,
        performanceChange: optimalModel.performanceImpact,
        qualityChange: optimalModel.qualityImpact,
        reliabilityChange: optimalModel.reliabilityImpact
      },
      step: {
        type: 'model_switch',
        description: `Switch from ${request.model} to ${optimalModel.model}`,
        impact: savings / originalCost,
        confidence: optimalModel.confidence,
        implementation: `Update model selection to use ${optimalModel.model} for this request type`
      }
    }
  }

  private async findOptimalModel(request: CostEstimationRequest): Promise<{
    model: string
    reason: string
    savings: number
    confidence: number
    performanceImpact: number
    qualityImpact: number
    reliabilityImpact: number
  }> {
    const availableModels = Array.from(this.modelCapabilities.keys())
    const originalCost = this.estimateSimpleCost(request)
    let bestModel = request.model
    let bestSavings = 0
    let bestReason = 'Current model is optimal'
    let bestConfidence = 0.5
    let bestPerformanceImpact = 0
    let bestQualityImpact = 0
    let bestReliabilityImpact = 0

    for (const model of availableModels) {
      if (model === request.model) continue

      const modelCapabilities = this.modelCapabilities.get(model)!
      
      // Check if model supports the request type
      if (request.requestType === 'chat' && !modelCapabilities.chat) continue
      if (request.requestType === 'completion' && !modelCapabilities.completion) continue
      if (request.requestType === 'embedding' && !modelCapabilities.embeddings) continue

      // Check token limits
      const totalTokens = request.inputTokens + (request.outputTokens || 0)
      if (totalTokens > modelCapabilities.maxTokens) continue

      // Calculate cost
      const optimizedCost = this.estimateSimpleCost({ ...request, model })
      const savings = originalCost - optimizedCost

      if (savings > bestSavings && savings > originalCost * this.config.savingsThreshold!) {
        bestModel = model
        bestSavings = savings
        bestReason = `Cost savings of $${savings.toFixed(4)} (${((savings / originalCost) * 100).toFixed(1)}%)`
        bestConfidence = 0.8
        bestPerformanceImpact = model === 'gpt-3.5-turbo' ? 0.1 : -0.05
        bestQualityImpact = model === 'gpt-4' ? 0.1 : -0.05
        bestReliabilityImpact = 0
      }
    }

    return {
      model: bestModel,
      reason: bestReason,
      savings: bestSavings,
      confidence: bestConfidence,
      performanceImpact: bestPerformanceImpact,
      qualityImpact: bestQualityImpact,
      reliabilityImpact: bestReliabilityImpact
    }
  }

  private async optimizeTokensForRequest(request: CostEstimationRequest): Promise<{
    optimizedInputTokens: number
    optimizedOutputTokens?: number
    savings: number
    impact: OptimizationImpact
    step: OptimizationStep
  }> {
    let optimizedInputTokens = request.inputTokens
    let optimizedOutputTokens = request.outputTokens
    let totalSavings = 0

    // Prompt compression
    if (request.inputTokens > 1000) {
      const compressionRatio = 0.9 // 10% compression
      const compressedTokens = Math.floor(request.inputTokens * compressionRatio)
      const tokenReduction = request.inputTokens - compressedTokens
      const savings = this.estimateTokenSavings(request.model, tokenReduction, 0)
      
      if (savings > 0) {
        optimizedInputTokens = compressedTokens
        totalSavings += savings
      }
    }

    // Output optimization
    if (request.outputTokens && request.outputTokens > 500) {
      const outputReduction = Math.floor(request.outputTokens * 0.05) // 5% reduction
      const savings = this.estimateTokenSavings(request.model, 0, outputReduction)
      
      if (savings > 0) {
        optimizedOutputTokens = request.outputTokens - outputReduction
        totalSavings += savings
      }
    }

    const impact: OptimizationImpact = {
      costReduction: totalSavings / this.estimateSimpleCost(request),
      performanceChange: 0.1,
      qualityChange: -0.05,
      reliabilityChange: 0.05
    }

    const step: OptimizationStep = {
      type: 'token_reduction',
      description: 'Optimize token usage through compression and truncation',
      impact: totalSavings / this.estimateSimpleCost(request),
      confidence: 0.7,
      implementation: 'Apply token optimization techniques'
    }

    return {
      optimizedInputTokens,
      optimizedOutputTokens,
      savings: totalSavings,
      impact,
      step
    }
  }

  private async optimizeBatchProcessing(requests: CostEstimationRequest[]): Promise<{
    savings: number
    step: BatchOptimizationStep
  }> {
    // Simple batch processing optimization
    const originalCosts = requests.map(request => this.estimateSimpleCost(request))
    const originalTotalCost = originalCosts.reduce((sum, cost) => sum + cost, 0)
    
    // Assume 5% savings from batch processing
    const savings = originalTotalCost * 0.05

    return {
      savings,
      step: {
        type: 'batch_processing',
        description: 'Process requests in batches to reduce API overhead',
        affectedRequests: requests.map(r => r.agentId),
        savings,
        confidence: 0.8,
        implementation: 'Implement batch processing for similar requests'
      }
    }
  }

  private async standardizeModels(requests: CostEstimationRequest[]): Promise<{
    requests: CostEstimationRequest[]
    savings: number
    step: BatchOptimizationStep
  }> {
    // Find most commonly used model
    const modelUsage: Record<string, number> = {}
    requests.forEach(request => {
      modelUsage[request.model] = (modelUsage[request.model] || 0) + 1
    })

    const mostUsedModel = Object.entries(modelUsage).sort((a, b) => b[1] - a[1])[0][0]
    
    // Standardize on most used model where appropriate
    const standardizedRequests = requests.map(request => {
      // Only standardize if the model is suitable for the request type
      const modelCapabilities = this.modelCapabilities.get(mostUsedModel)!
      if (
        (request.requestType === 'chat' && modelCapabilities.chat) ||
        (request.requestType === 'completion' && modelCapabilities.completion) ||
        (request.requestType === 'embedding' && modelCapabilities.embeddings)
      ) {
        return { ...request, model: mostUsedModel }
      }
      return request
    })

    // Calculate savings
    const originalCosts = requests.map(request => this.estimateSimpleCost(request))
    const optimizedCosts = standardizedRequests.map(request => this.estimateSimpleCost(request))
    const originalTotalCost = originalCosts.reduce((sum, cost) => sum + cost, 0)
    const optimizedTotalCost = optimizedCosts.reduce((sum, cost) => sum + cost, 0)
    const savings = originalTotalCost - optimizedTotalCost

    return {
      requests: standardizedRequests,
      savings,
      step: {
        type: 'model_standardization',
        description: `Standardize on ${mostUsedModel} for consistent pricing`,
        affectedRequests: requests.map(r => r.agentId),
        savings,
        confidence: 0.7,
        implementation: 'Update model selection to use standardized model'
      }
    }
  }

  private async groupSimilarRequests(requests: CostEstimationRequest[]): Promise<{
    requests: CostEstimationRequest[]
    savings: number
    step: BatchOptimizationStep
  }> {
    // Simple grouping by request type
    const groupedRequests: Record<string, CostEstimationRequest[]> = {}
    requests.forEach(request => {
      if (!groupedRequests[request.requestType]) {
        groupedRequests[request.requestType] = []
      }
      groupedRequests[request.requestType].push(request)
    })

    // Assume 3% savings from grouping
    const originalCosts = requests.map(request => this.estimateSimpleCost(request))
    const originalTotalCost = originalCosts.reduce((sum, cost) => sum + cost, 0)
    const savings = originalTotalCost * 0.03

    return {
      requests,
      savings,
      step: {
        type: 'request_grouping',
        description: 'Group similar requests for processing efficiency',
        affectedRequests: requests.map(r => r.agentId),
        savings,
        confidence: 0.6,
        implementation: 'Implement request grouping by type'
      }
    }
  }

  private estimateSimpleCost(request: CostEstimationRequest): number {
    // Simple cost estimation based on model and token count
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    }

    const modelPricing = pricing[request.model] || { input: 0.01, output: 0.02 }
    const inputCost = (request.inputTokens / 1000) * modelPricing.input
    const outputCost = ((request.outputTokens || 0) / 1000) * modelPricing.output

    return inputCost + outputCost
  }
private startAutoOptimization(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
    }

    this.optimizationInterval = setInterval(async () => {
      try {
        // Perform automatic optimization checks
        console.log('Running automatic optimization check')
        // In a real implementation, this would analyze usage patterns and apply optimizations
      } catch (error) {
        console.error('Error in automatic optimization:', error)
      }
    }, this.config.optimizationInterval!)
  }

  private combineOptimizationImpacts(impact1: OptimizationImpact, impact2: OptimizationImpact): OptimizationImpact {
    return {
      costReduction: Math.max(impact1.costReduction, impact2.costReduction),
      performanceChange: impact1.performanceChange + impact2.performanceChange,
      qualityChange: impact1.qualityChange + impact2.qualityChange,
      reliabilityChange: impact1.reliabilityChange + impact2.reliabilityChange
    }
  }

  private calculateConfidence(optimizations: OptimizationStep[]): number {
    if (optimizations.length === 0) return 1.0

    const totalConfidence = optimizations.reduce((sum, opt) => sum + opt.confidence, 0)
    return Math.min(1.0, totalConfidence / optimizations.length)
  }

  private calculateModelConfidence(modelAssignments: ModelAssignment[]): number {
    if (modelAssignments.length === 0) return 1.0

    const totalConfidence = modelAssignments.reduce((sum, assignment) => sum + assignment.confidence, 0)
    return Math.min(1.0, totalConfidence / modelAssignments.length)
  }

  private generateMockUtilization(budget: Budget): BudgetUtilization {
    const spentAmount = budget.totalAmount * (0.3 + Math.random() * 0.6) // 30-90% utilization
    const remainingAmount = budget.totalAmount - spentAmount
    const utilizationPercentage = (spentAmount / budget.totalAmount) * 100

    return {
      budgetId: budget.id,
      totalAmount: budget.totalAmount,
      spentAmount,
      remainingAmount,
      utilizationPercentage,
      currency: budget.currency,
      dailyAverage: spentAmount / 30,
      daysRemaining: 15,
      categoryUtilization: [],
      timeSeriesData: []
    }
  }

  private estimateTokenSavings(model: string, inputTokenReduction: number, outputTokenReduction: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    }

    const modelPricing = pricing[model] || { input: 0.01, output: 0.02 }
    const inputCost = (inputTokenReduction / 1000) * modelPricing.input
    const outputCost = (outputTokenReduction / 1000) * modelPricing.output

    return inputCost + outputCost
}
  }