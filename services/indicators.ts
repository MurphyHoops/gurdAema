
/**
 * Technical Indicator Utilities
 */

// Calculate EMA (Exponential Moving Average)
export function calculateEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];

  // Simple Moving Average (SMA) as the first EMA point
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let ema = sum / period;
  // Initialize the array with nulls or leading values to match price array length?
  // Standard approach: The first valid EMA value is at index `period-1`.
  // To keep alignment simple: we push the SMA as the first EMA value.
  // Note: This simplified version returns an array of valid EMA values. 
  // Calling function needs to handle alignment (offset by `period - 1`).
  emaArray.push(ema); 

  // Calculate subsequent EMAs
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
    emaArray.push(ema);
  }

  return emaArray;
}

// Get the latest EMA value from a price series
export function getLatestEMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const emas = calculateEMA(prices, period);
    return emas[emas.length - 1];
}

// Check for Divergence Pattern (Long: 10>20>30>40, Short: 10<20<30<40)
export function checkEmaDivergence(prices: number[], periods: number[]): 'LONG' | 'SHORT' | null {
    if (prices.length < Math.max(...periods)) return null;

    const emaValues = periods.map(p => getLatestEMA(prices, p));
    const [ema10, ema20, ema30, ema40] = emaValues;

    // Check Long: 10 > 20 > 30 > 40
    if (ema10 > ema20 && ema20 > ema30 && ema30 > ema40) {
        return 'LONG';
    }

    // Check Short: 10 < 20 < 30 < 40
    if (ema10 < ema20 && ema20 < ema30 && ema30 < ema40) {
        return 'SHORT';
    }

    return null;
}

/**
 * Checks for a "Fresh" Divergence Signal (The Crossover Event).
 * 
 * Logic:
 * 1. Current Candle: Must meet strict divergence (e.g. 10>20>30>40).
 * 2. Previous Candle: Must NOT meet strict divergence. 
 *    This ensures we catch the moment the lines "cross" or "fan out", 
 *    rather than entering in the middle of a trend.
 */
export function checkFreshDivergence(prices: number[], periods: number[]): 'LONG' | 'SHORT' | null {
    const maxPeriod = Math.max(...periods);
    if (prices.length < maxPeriod + 2) return null; // Need history for current + prev

    // 1. Calculate Full EMA Arrays
    const emaArrays = periods.map(p => calculateEMA(prices, p));
    
    // Helper to get EMA value at a specific PRICE index
    // calculateEMA output starts at index `period-1` of price array.
    const getVal = (emaIdx: number, priceIdx: number): number => {
        const period = periods[emaIdx];
        const offset = priceIdx - (period - 1);
        if (offset < 0 || offset >= emaArrays[emaIdx].length) return -1;
        return emaArrays[emaIdx][offset];
    };

    const currentIdx = prices.length - 1;
    const prevIdx = prices.length - 2;

    // --- Check Current Candle (T0) ---
    const curr10 = getVal(0, currentIdx);
    const curr20 = getVal(1, currentIdx);
    const curr30 = getVal(2, currentIdx);
    const curr40 = getVal(3, currentIdx);

    const isLongNow = curr10 > curr20 && curr20 > curr30 && curr30 > curr40;
    const isShortNow = curr10 < curr20 && curr20 < curr30 && curr30 < curr40;

    if (!isLongNow && !isShortNow) return null; // No divergence now

    // --- Check Previous Candle (T-1) ---
    const prev10 = getVal(0, prevIdx);
    const prev20 = getVal(1, prevIdx);
    const prev30 = getVal(2, prevIdx);
    const prev40 = getVal(3, prevIdx);

    // If strictly valid now, BUT was NOT strictly valid before -> CROSSOVER HAPPENED
    if (isLongNow) {
        const wasLongBefore = prev10 > prev20 && prev20 > prev30 && prev30 > prev40;
        if (!wasLongBefore) return 'LONG';
    }

    if (isShortNow) {
        const wasShortBefore = prev10 < prev20 && prev20 < prev30 && prev30 < prev40;
        if (!wasShortBefore) return 'SHORT';
    }

    return null;
}
