import {
  calculateTokenCost,
  getOpenAIPricing,
  getAnthropicPricing,
  compareModelCosts,
  estimateOutputTokens,
  calculateCostSavings,
  ModelPricing,
  TokenUsage
} from '../../lib/pricing-calculator'

describe('pricing-calculator', () => {
  const mockUsage: TokenUsage = {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500
  }

  const mockPricing: ModelPricing = {
    promptTokenPrice: 0.01,
    completionTokenPrice: 0.02,
    currency: 'USD'
  }

  describe('calculateTokenCost', () => {
    it('should calculate token costs correctly', () => {
      const result = calculateTokenCost(mockUsage, mockPricing)
      
      expect(result.promptCost).toBe(0.01) // (1000/1000) * 0.01
      expect(result.completionCost).toBe(0.01) // (500/1000) * 0.02
      expect(result.totalCost).toBe(0.02)
      expect(result.currency).toBe('USD')
    })

    it('should handle zero tokens', () => {
      const zeroUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
      
      const result = calculateTokenCost(zeroUsage, mockPricing)
      
      expect(result.promptCost).toBe(0)
      expect(result.completionCost).toBe(0)
      expect(result.totalCost).toBe(0)
    })

    it('should handle fractional token costs', () => {
      const smallUsage: TokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
      
      const result = calculateTokenCost(smallUsage, mockPricing)
      
      expect(result.promptCost).toBe(0.001) // (100/1000) * 0.01
      expect(result.completionCost).toBe(0.001) // (50/1000) * 0.02
      expect(result.totalCost).toBe(0.002)
    })

    it('should round to 6 decimal places', () => {
      const preciseUsage: TokenUsage = {
        promptTokens: 333,
        completionTokens: 167,
        totalTokens: 500
      }
      
      const precisePricing: ModelPricing = {
        promptTokenPrice: 0.003,
        completionTokenPrice: 0.006,
        currency: 'USD'
      }
      
      const result = calculateTokenCost(preciseUsage, precisePricing)
      
      expect(result.promptCost).toBe(0.000999) // (333/1000) * 0.003
      expect(result.completionCost).toBe(0.001002) // (167/1000) * 0.006
      expect(result.totalCost).toBe(0.002001)
    })
  })

  describe('getOpenAIPricing', () => {
    it('should return correct pricing for GPT-4', () => {
      const pricing = getOpenAIPricing('gpt-4')
      
      expect(pricing.promptTokenPrice).toBe(0.03)
      expect(pricing.completionTokenPrice).toBe(0.06)
      expect(pricing.currency).toBe('USD')
    })

    it('should return correct pricing for GPT-3.5-turbo', () => {
      const pricing = getOpenAIPricing('gpt-3.5-turbo')
      
      expect(pricing.promptTokenPrice).toBe(0.0015)
      expect(pricing.completionTokenPrice).toBe(0.002)
      expect(pricing.currency).toBe('USD')
    })

    it('should return default pricing for unknown model', () => {
      const pricing = getOpenAIPricing('unknown-model')
      
      expect(pricing.promptTokenPrice).toBe(0.002)
      expect(pricing.completionTokenPrice).toBe(0.002)
      expect(pricing.currency).toBe('USD')
    })

    it('should handle custom currency', () => {
      const pricing = getOpenAIPricing('gpt-4', 'EUR')
      
      expect(pricing.currency).toBe('EUR')
    })
  })

  describe('getAnthropicPricing', () => {
    it('should return correct pricing for Claude-3 Opus', () => {
      const pricing = getAnthropicPricing('claude-3-opus-20240229')
      
      expect(pricing.promptTokenPrice).toBe(0.015)
      expect(pricing.completionTokenPrice).toBe(0.075)
      expect(pricing.currency).toBe('USD')
    })

    it('should return correct pricing for Claude-3 Haiku', () => {
      const pricing = getAnthropicPricing('claude-3-haiku-20240307')
      
      expect(pricing.promptTokenPrice).toBe(0.00025)
      expect(pricing.completionTokenPrice).toBe(0.00125)
      expect(pricing.currency).toBe('USD')
    })

    it('should return default pricing for unknown model', () => {
      const pricing = getAnthropicPricing('unknown-claude-model')
      
      expect(pricing.promptTokenPrice).toBe(0.002)
      expect(pricing.completionTokenPrice).toBe(0.002)
      expect(pricing.currency).toBe('USD')
    })

    it('should handle custom currency', () => {
      const pricing = getAnthropicPricing('claude-3-sonnet-20240229', 'EUR')
      
      expect(pricing.currency).toBe('EUR')
    })
  })

  describe('compareModelCosts', () => {
    it('should compare costs and rank models correctly', () => {
      const models = [
        { providerId: 'openai', modelId: 'gpt-4' },
        { providerId: 'openai', modelId: 'gpt-3.5-turbo' },
        { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' }
      ]
      
      const results = compareModelCosts(mockUsage, models)
      
      expect(results).toHaveLength(3)
      expect(results[0].ranking).toBe(1) // Cheapest should be ranked 1
      expect(results[1].ranking).toBe(2)
      expect(results[2].ranking).toBe(3)
      
      // Verify costs are in ascending order
      expect(results[0].cost.totalCost).toBeLessThanOrEqual(results[1].cost.totalCost)
      expect(results[1].cost.totalCost).toBeLessThanOrEqual(results[2].cost.totalCost)
    })

    it('should handle unknown providers with default pricing', () => {
      const models = [
        { providerId: 'unknown', modelId: 'unknown-model' }
      ]
      
      const results = compareModelCosts(mockUsage, models)
      
      expect(results).toHaveLength(1)
      expect(results[0].cost.totalCost).toBe(0.003) // (1000+500)/1000 * 0.002
      expect(results[0].ranking).toBe(1)
    })

    it('should handle empty models array', () => {
      const results = compareModelCosts(mockUsage, [])
      
      expect(results).toHaveLength(0)
    })
  })

  describe('estimateOutputTokens', () => {
    it('should estimate output tokens for completion requests', () => {
      const result = estimateOutputTokens(1000, 'completion')
      expect(result).toBe(1000) // 100% of input
    })

    it('should estimate output tokens for chat requests', () => {
      const result = estimateOutputTokens(1000, 'chat')
      expect(result).toBe(300) // 30% of input
    })

    it('should estimate output tokens for embedding requests', () => {
      const result = estimateOutputTokens(1000, 'embedding')
      expect(result).toBe(0) // No completion tokens for embeddings
    })

    it('should handle zero input tokens', () => {
      expect(estimateOutputTokens(0, 'completion')).toBe(0)
      expect(estimateOutputTokens(0, 'chat')).toBe(0)
      expect(estimateOutputTokens(0, 'embedding')).toBe(0)
    })

    it('should handle fractional results by flooring', () => {
      const result = estimateOutputTokens(333, 'chat')
      expect(result).toBe(99) // floor(333 * 0.3)
    })
  })

  describe('calculateCostSavings', () => {
    const expensivePricing: ModelPricing = {
      promptTokenPrice: 0.03,
      completionTokenPrice: 0.06,
      currency: 'USD'
    }

    const cheapPricing: ModelPricing = {
      promptTokenPrice: 0.001,
      completionTokenPrice: 0.002,
      currency: 'USD'
    }

    it('should calculate cost savings correctly', () => {
      const result = calculateCostSavings(mockUsage, expensivePricing, cheapPricing)
      
      const originalCost = (1000/1000) * 0.03 + (500/1000) * 0.06 // 0.03 + 0.03 = 0.06
      const newCost = (1000/1000) * 0.001 + (500/1000) * 0.002 // 0.001 + 0.001 = 0.002
      const expectedSavings = originalCost - newCost // 0.06 - 0.002 = 0.058
      const expectedPercentage = (expectedSavings / originalCost) * 100 // (0.058 / 0.06) * 100 = 96.67
      
      expect(result.savings).toBeCloseTo(0.058, 6)
      expect(result.savingsPercentage).toBeCloseTo(96.67, 2)
      expect(result.currency).toBe('USD')
    })

    it('should handle no savings (same pricing)', () => {
      const result = calculateCostSavings(mockUsage, mockPricing, mockPricing)
      
      expect(result.savings).toBe(0)
      expect(result.savingsPercentage).toBe(0)
      expect(result.currency).toBe('USD')
    })

    it('should handle negative savings (cost increase)', () => {
      const result = calculateCostSavings(mockUsage, cheapPricing, expensivePricing)
      
      expect(result.savings).toBeLessThan(0)
      expect(result.savingsPercentage).toBeLessThan(0)
    })

    it('should handle zero original cost', () => {
      const zeroPricing: ModelPricing = {
        promptTokenPrice: 0,
        completionTokenPrice: 0,
        currency: 'USD'
      }
      
      const result = calculateCostSavings(mockUsage, zeroPricing, cheapPricing)
      
      expect(result.savings).toBeLessThan(0) // Negative because new cost > 0
      expect(result.savingsPercentage).toBe(0) // Can't calculate percentage from zero
    })
  })
})