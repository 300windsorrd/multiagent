/**
 * Pricing calculator utilities for LLM token costs
 */

export interface ModelPricing {
  promptTokenPrice: number // Price per 1K tokens
  completionTokenPrice: number // Price per 1K tokens
  currency: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CostCalculation {
  promptCost: number
  completionCost: number
  totalCost: number
  currency: string
}

/**
 * Calculate cost for token usage based on pricing
 */
export function calculateTokenCost(usage: TokenUsage, pricing: ModelPricing): CostCalculation {
  const promptCost = (usage.promptTokens / 1000) * pricing.promptTokenPrice
  const completionCost = (usage.completionTokens / 1000) * pricing.completionTokenPrice
  const totalCost = promptCost + completionCost

  return {
    promptCost: Number(promptCost.toFixed(6)),
    completionCost: Number(completionCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    currency: pricing.currency
  }
}

/**
 * Get OpenAI pricing for a model
 */
export function getOpenAIPricing(modelId: string, currency: string = 'USD'): ModelPricing {
  const pricingMap: Record<string, { prompt: number; completion: number }> = {
    'gpt-4': { prompt: 0.03, completion: 0.06 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-4-turbo-preview': { prompt: 0.01, completion: 0.03 },
    'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
    'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
    'text-davinci-003': { prompt: 0.02, completion: 0.02 },
    'text-curie-001': { prompt: 0.002, completion: 0.002 },
    'text-babbage-001': { prompt: 0.0005, completion: 0.0005 },
    'text-ada-001': { prompt: 0.0004, completion: 0.0004 }
  }

  const pricing = pricingMap[modelId]
  if (!pricing) {
    // Default fallback pricing
    return {
      promptTokenPrice: 0.002,
      completionTokenPrice: 0.002,
      currency
    }
  }

  return {
    promptTokenPrice: pricing.prompt,
    completionTokenPrice: pricing.completion,
    currency
  }
}

/**
 * Get Anthropic pricing for a model
 */
export function getAnthropicPricing(modelId: string, currency: string = 'USD'): ModelPricing {
  const pricingMap: Record<string, { prompt: number; completion: number }> = {
    'claude-3-opus-20240229': { prompt: 0.015, completion: 0.075 },
    'claude-3-sonnet-20240229': { prompt: 0.003, completion: 0.015 },
    'claude-3-haiku-20240307': { prompt: 0.00025, completion: 0.00125 },
    'claude-2.1': { prompt: 0.008, completion: 0.024 },
    'claude-2.0': { prompt: 0.008, completion: 0.024 },
    'claude-instant-1.2': { prompt: 0.0008, completion: 0.0024 }
  }

  const pricing = pricingMap[modelId]
  if (!pricing) {
    // Default fallback pricing
    return {
      promptTokenPrice: 0.002,
      completionTokenPrice: 0.002,
      currency
    }
  }

  return {
    promptTokenPrice: pricing.prompt,
    completionTokenPrice: pricing.completion,
    currency
  }
}

/**
 * Compare costs between different models
 */
export function compareModelCosts(
  usage: TokenUsage,
  models: Array<{ providerId: string; modelId: string }>
): Array<{ providerId: string; modelId: string; cost: CostCalculation; ranking: number }> {
  const results = models.map(model => {
    let pricing: ModelPricing
    
    if (model.providerId === 'openai') {
      pricing = getOpenAIPricing(model.modelId)
    } else if (model.providerId === 'anthropic') {
      pricing = getAnthropicPricing(model.modelId)
    } else {
      // Default pricing
      pricing = { promptTokenPrice: 0.002, completionTokenPrice: 0.002, currency: 'USD' }
    }

    const cost = calculateTokenCost(usage, pricing)
    
    return {
      providerId: model.providerId,
      modelId: model.modelId,
      cost,
      ranking: 0 // Will be set after sorting
    }
  })

  // Sort by total cost (ascending) and assign rankings
  results.sort((a, b) => a.cost.totalCost - b.cost.totalCost)
  results.forEach((result, index) => {
    result.ranking = index + 1
  })

  return results
}

/**
 * Estimate output tokens based on input tokens and request type
 */
export function estimateOutputTokens(inputTokens: number, requestType: 'completion' | 'chat' | 'embedding'): number {
  switch (requestType) {
    case 'completion':
      // For completions, output is typically 50-150% of input
      return Math.floor(inputTokens * 1.0)
    case 'chat':
      // For chat, responses are typically shorter relative to context
      return Math.floor(inputTokens * 0.3)
    case 'embedding':
      // Embeddings don't have completion tokens
      return 0
    default:
      return Math.floor(inputTokens * 0.5)
  }
}

/**
 * Calculate cost savings between two pricing options
 */
export function calculateCostSavings(
  usage: TokenUsage,
  originalPricing: ModelPricing,
  newPricing: ModelPricing
): { savings: number; savingsPercentage: number; currency: string } {
  const originalCost = calculateTokenCost(usage, originalPricing)
  const newCost = calculateTokenCost(usage, newPricing)
  
  const savings = originalCost.totalCost - newCost.totalCost
  const savingsPercentage = originalCost.totalCost > 0 
    ? (savings / originalCost.totalCost) * 100 
    : 0

  return {
    savings: Number(savings.toFixed(6)),
    savingsPercentage: Number(savingsPercentage.toFixed(2)),
    currency: originalPricing.currency
  }
}