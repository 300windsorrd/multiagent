import {
  calculatePercentage,
  calculateAverage,
  roundToDecimals,
  calculateCostPerToken,
  calculateSavingsPercentage,
  clamp,
  isInRange,
  formatCurrency,
  calculateGrowthRate,
  generateRange
} from '../../lib/math-utils'

describe('math-utils', () => {
  describe('calculatePercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(calculatePercentage(25, 100)).toBe(25)
      expect(calculatePercentage(1, 3)).toBe(33.33)
      expect(calculatePercentage(2, 3, 1)).toBe(66.7)
    })

    it('should handle zero total', () => {
      expect(calculatePercentage(10, 0)).toBe(0)
    })

    it('should handle zero value', () => {
      expect(calculatePercentage(0, 100)).toBe(0)
    })

    it('should handle decimal places', () => {
      expect(calculatePercentage(1, 3, 0)).toBe(33)
      expect(calculatePercentage(1, 3, 4)).toBe(33.3333)
    })
  })

  describe('calculateAverage', () => {
    it('should calculate average correctly', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3)
      expect(calculateAverage([10, 20, 30])).toBe(20)
      expect(calculateAverage([2.5, 3.5, 4.5])).toBe(3.5)
    })

    it('should handle empty array', () => {
      expect(calculateAverage([])).toBe(0)
    })

    it('should handle single element', () => {
      expect(calculateAverage([42])).toBe(42)
    })

    it('should handle negative numbers', () => {
      expect(calculateAverage([-1, -2, -3])).toBe(-2)
      expect(calculateAverage([-5, 0, 5])).toBe(0)
    })
  })

  describe('roundToDecimals', () => {
    it('should round to specified decimal places', () => {
      expect(roundToDecimals(3.14159, 2)).toBe(3.14)
      expect(roundToDecimals(3.14159, 4)).toBe(3.1416)
      expect(roundToDecimals(3.14159, 0)).toBe(3)
    })

    it('should handle default decimal places', () => {
      expect(roundToDecimals(3.14159)).toBe(3.14)
    })

    it('should handle whole numbers', () => {
      expect(roundToDecimals(5, 2)).toBe(5)
    })
  })

  describe('calculateCostPerToken', () => {
    it('should calculate cost per 1000 tokens correctly', () => {
      expect(calculateCostPerToken(0.01, 1000)).toBe(0.01) // (0.01/1000) * 1000 = 0.01
      expect(calculateCostPerToken(0.005, 500)).toBe(0.01) // (0.005/500) * 1000 = 0.01  
      expect(calculateCostPerToken(0.02, 2000)).toBe(0.01) // (0.02/2000) * 1000 = 0.01
    })

    it('should handle zero tokens', () => {
      expect(calculateCostPerToken(0.01, 0)).toBe(0)
    })

    it('should handle zero cost', () => {
      expect(calculateCostPerToken(0, 1000)).toBe(0)
    })

    it('should handle fractional results', () => {
      expect(calculateCostPerToken(0.003, 1000)).toBe(0.003) // (0.003/1000) * 1000 = 0.003
      expect(calculateCostPerToken(0.0015, 1000)).toBe(0.0015) // (0.0015/1000) * 1000 = 0.0015
    })
  })

  describe('calculateSavingsPercentage', () => {
    it('should calculate savings percentage correctly', () => {
      expect(calculateSavingsPercentage(100, 80)).toBe(20)
      expect(calculateSavingsPercentage(50, 25)).toBe(50)
      expect(calculateSavingsPercentage(10, 9)).toBe(10)
    })

    it('should handle zero original cost', () => {
      expect(calculateSavingsPercentage(0, 10)).toBe(0)
    })

    it('should handle same costs (no savings)', () => {
      expect(calculateSavingsPercentage(100, 100)).toBe(0)
    })

    it('should handle negative savings (cost increase)', () => {
      expect(calculateSavingsPercentage(100, 120)).toBe(-20)
    })
  })

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0)
      expect(clamp(10, 0, 10)).toBe(10)
    })

    it('should handle negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5)
      expect(clamp(-15, -10, -1)).toBe(-10)
      expect(clamp(0, -10, -1)).toBe(-1)
    })
  })

  describe('isInRange', () => {
    it('should check if value is in range', () => {
      expect(isInRange(5, 0, 10)).toBe(true)
      expect(isInRange(0, 0, 10)).toBe(true)
      expect(isInRange(10, 0, 10)).toBe(true)
      expect(isInRange(-1, 0, 10)).toBe(false)
      expect(isInRange(11, 0, 10)).toBe(false)
    })

    it('should handle negative ranges', () => {
      expect(isInRange(-5, -10, -1)).toBe(true)
      expect(isInRange(-10, -10, -1)).toBe(true)
      expect(isInRange(-1, -10, -1)).toBe(true)
      expect(isInRange(-11, -10, -1)).toBe(false)
      expect(isInRange(0, -10, -1)).toBe(false)
    })
  })

  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(formatCurrency(123.45)).toBe('$123.45')
      expect(formatCurrency(1000)).toBe('$1,000.00')
      expect(formatCurrency(0.99)).toBe('$0.99')
    })

    it('should handle different currencies', () => {
      expect(formatCurrency(123.45, 'EUR')).toBe('€123.45')
      expect(formatCurrency(123.45, 'GBP')).toBe('£123.45')
    })

    it('should handle different decimal places', () => {
      expect(formatCurrency(123.456, 'USD', 3)).toBe('$123.456')
      expect(formatCurrency(123.456, 'USD', 0)).toBe('$123')
    })

    it('should handle zero amount', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })
  })

  describe('calculateGrowthRate', () => {
    it('should calculate growth rate correctly', () => {
      expect(calculateGrowthRate(100, 110, 1)).toBeCloseTo(0.1, 5)
      expect(calculateGrowthRate(100, 121, 2)).toBeCloseTo(0.1, 5)
      expect(calculateGrowthRate(1000, 1331, 3)).toBeCloseTo(0.1, 5)
    })

    it('should handle zero initial value', () => {
      expect(calculateGrowthRate(0, 100, 1)).toBe(0)
    })

    it('should handle zero periods', () => {
      expect(calculateGrowthRate(100, 110, 0)).toBe(0)
    })

    it('should handle negative growth', () => {
      expect(calculateGrowthRate(100, 90, 1)).toBeCloseTo(-0.1, 5)
    })

    it('should handle no growth', () => {
      expect(calculateGrowthRate(100, 100, 1)).toBe(0)
    })
  })

  describe('generateRange', () => {
    it('should generate range with default step', () => {
      expect(generateRange(1, 5)).toEqual([1, 2, 3, 4, 5])
      expect(generateRange(0, 3)).toEqual([0, 1, 2, 3])
    })

    it('should generate range with custom step', () => {
      expect(generateRange(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10])
      expect(generateRange(1, 10, 3)).toEqual([1, 4, 7, 10])
    })

    it('should handle single value range', () => {
      expect(generateRange(5, 5)).toEqual([5])
    })

    it('should handle decimal steps', () => {
      expect(generateRange(0, 1, 0.5)).toEqual([0, 0.5, 1])
    })

    it('should handle empty range when start > end', () => {
      expect(generateRange(5, 1)).toEqual([])
    })
  })
})