/**
 * Utility functions for mathematical calculations
 */

/**
 * Calculate percentage with optional decimal places
 */
export function calculatePercentage(value: number, total: number, decimals: number = 2): number {
  if (total === 0) return 0
  return Number(((value / total) * 100).toFixed(decimals))
}

/**
 * Calculate average of an array of numbers
 */
export function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0
  const sum = numbers.reduce((acc, num) => acc + num, 0)
  return sum / numbers.length
}

/**
 * Round number to specified decimal places
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  return Number(value.toFixed(decimals))
}

/**
 * Calculate cost per 1000 tokens
 */
export function calculateCostPerToken(totalCost: number, totalTokens: number): number {
  if (totalTokens === 0) return 0
  return (totalCost / totalTokens) * 1000
}

/**
 * Calculate savings percentage between two values
 */
export function calculateSavingsPercentage(originalCost: number, newCost: number): number {
  if (originalCost === 0) return 0
  return calculatePercentage(originalCost - newCost, originalCost)
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Check if a number is within a range (inclusive)
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

/**
 * Format currency with proper decimal places
 */
export function formatCurrency(amount: number, currency: string = 'USD', decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/**
 * Calculate compound growth rate
 */
export function calculateGrowthRate(initialValue: number, finalValue: number, periods: number): number {
  if (initialValue === 0 || periods === 0) return 0
  return Math.pow(finalValue / initialValue, 1 / periods) - 1
}

/**
 * Generate a range of numbers
 */
export function generateRange(start: number, end: number, step: number = 1): number[] {
  const range: number[] = []
  for (let i = start; i <= end; i += step) {
    range.push(i)
  }
  return range
}