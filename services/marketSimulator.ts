import { 
  AccountData, Position, PositionSide, AppSettings, LogEntry, 
  HedgeRecord, TradeLog, SystemEvent
} from '../types';
import { audioService } from './audioService';

type UpdateCallback = (
  account: AccountData, 
  positions: Position[], 
  logs: LogEntry[], 
  hedgeRecord?: HedgeRecord,
  tradeLogs?: TradeLog[],
  systemEvents?: SystemEvent[],
  notification?: { title: string, message: string }
) => void;

export class MarketSimulator {
  private account: AccountData;
  private positions: Position[];
  private settings: AppSettings;
  private updateCallback: UpdateCallback;
  private tradeLogs: TradeLog[];
  private systemEvents: SystemEvent[];
  private logs: LogEntry[];
  private realPrices: Record<string, number> = {};

  // For Strategy 4.3 Callback Tracking
  private hedgeMaxProfitMap: Record<string, number> = {}; 

  constructor(
      account: AccountData,
      positions: Position[],
      settings: AppSettings,
      callback: UpdateCallback,
      tradeLogs: TradeLog[],
      systemEvents: SystemEvent[],
      logs: LogEntry[]
  ) {
      this.account = account;
      this.positions = positions;
      this.settings = settings;
      this.updateCallback = callback;
      this.tradeLogs = tradeLogs;
      this.systemEvents = systemEvents;
      this.logs = logs;
  }

  public updateSettings(settings: AppSettings) {
      this.settings = settings;
  }

  public updateRealPrices(prices: Record<string, number>) {
      this.realPrices = prices;
  }

  private emitUpdate(notification?: { title: string, message: string }) {
      this.updateCallback(
          { ...this.account }, 
          [ ...this.positions ], 
          [ ...this.logs ], 
          undefined, 
          [ ...this.tradeLogs ],
          [ ...this.systemEvents ],
          notification
      );
  }

  private addLog(type: LogEntry['type'], message: string) {
      const log: LogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date(),
          type,
          message
      };
      this.logs = [log, ...this.logs].slice(0, 200); 
  }

  public tick() {
      let stateChanged = false;

      // 1. Update Prices & PnL
      this.positions.forEach(p => {
          const currentPrice = this.realPrices[p.symbol] || p.markPrice;
          
          // --- SAFETY: PRICE DEVIATION GUARD ---
          // If price deviates > 10% from previous tick, assume it's a data glitch/error
          // Exception: If previous price was 0 or uninitialized
          if (p.markPrice > 0 && Math.abs((currentPrice - p.markPrice) / p.markPrice) > 0.1) {
              // Log warning only once to avoid spam (conceptually)
              // For now we just return and SKIP this specific update for this position
              // This effectively "freezes" the position state until a reasonable price comes in
              return; 
          }

          if (p.markPrice !== currentPrice) {
              p.markPrice = currentPrice;
              
              const priceDiff = p.side === PositionSide.LONG 
                  ? currentPrice - p.entryPrice 
                  : p.entryPrice - currentPrice;
              
              p.unrealizedPnL = priceDiff * p.amount;
              
              // STRICT RULE: PnL Percentage = (Price Diff / Entry Price) * 100%
              if (p.entryPrice > 0) {
                  p.unrealizedPnLPercentage = (priceDiff / p.entryPrice) * 100;
              } else {
                  p.unrealizedPnLPercentage = 0;
              }
              
              stateChanged = true;
          }
      });

      // 2. Check Strategies (Hedging, TP, SL)
      if (this.checkStrategies()) {
          stateChanged = true;
      }

      // 3. Update Account & Emit
      if (stateChanged) {
          this.updateAccountStats();
          this.emitUpdate();
      }
  }

  private checkStrategies(): boolean {
      let actionTaken = false;
      const { hedging, profit, stopLoss } = this.settings;

      // Iterate active positions
      // Use a snapshot to avoid issues if we modify array during iteration
      const activePositions = [...this.positions];

      activePositions.forEach(p => {
          // Skip if already closed (just in case)
          if (!this.positions.includes(p)) return;

          const pnlPct = p.unrealizedPnLPercentage; 
          const positionValue = p.amount * p.entryPrice;

          // --- CRITICAL GUARD: MODULE 4 TAKEOVER PRINCIPLE (防爆接管原则) ---
          // Rule: If any Module 4 strategy (1, 2, or 3) is enabled, AND the coin has entered the "Explosion-proof" lifecycle.
          // "Explosion-proof Lifecycle" means:
          // 1. Currently Hedged (isHedged = true) - Active defense
          // 2. OR Has Debt (cumulativeHedgeLoss > 0) - Failed hedge, now in debt recovery mode
          //
          // If strictly managed by Module 4, DISABLE Module 2 (Conventional TP/SL) AND Simulation TP.
          
          const isModule4StrategyActive = (
              stopLoss.originalProfitClear ||  // Function 1: Original Profit Clear
              stopLoss.hedgeProfitClear ||     // Function 2: Hedge Profit Clear
              stopLoss.callbackProfitClear     // Function 3: Callback Profit Clear
          );
          
          const isInExplosionProofLifecycle = p.isHedged || (p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0);
          
          // The Guard Variable
          const isManagedByModule4 = isModule4StrategyActive && isInExplosionProofLifecycle;


          // --- 0. SIMULATION SPECIFIC TP (Priority) ---
          // FIXED: Now checks !isManagedByModule4.
          // Before this fix, Sim TP would close positions with debt (unhedged but recovering) prematurely.
          if (p.simTpPercent && p.simTpPercent > 0 && !p.isHedged && !isManagedByModule4) {
              if (pnlPct >= p.simTpPercent) {
                  this.closePosition(p.symbol, p.side, 'SIM_PROFIT'); 
                  actionTaken = true;
                  return; // Exit loop for this position
              }
          }

          // --- MODULE 4: HEDGE EXIT STRATEGIES (Process Hedged Pairs) ---
          // Priority: Check if we can exit a hedged pair with profit BEFORE we open new hedges or SL
          if (p.isHedged && !p.mainPositionId) {
             // This is an Original Position that is Hedged. Check exit conditions.
             if (this.checkHedgeExit(p)) {
                 actionTaken = true;
                 return;
             }
          }

          // --- MODULE 4.2 Scenario 2: Debt Recovery (Unhedged with Debt) ---
          // 情况二：原仓盈利 > (历史对冲总亏损 ) * (1 + 5%)
          // Applies when hedge is already stopped out (leaving debt), and original position recovers.
          if (!p.isHedged && p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0 && stopLoss.hedgeProfitClear) {
              const bufferMultiplier = 1 + (stopLoss.hedgeCoverPercent / 100);
              const targetProfit = p.cumulativeHedgeLoss * bufferMultiplier;
              
              if (p.unrealizedPnL > targetProfit) {
                  this.closePosition(p.symbol, p.side, 'PATH_B_DEBT_RECOVERY');
                  this.addLog('SUCCESS', `Strategy 4.2 (Case 2): Orig Win (${p.unrealizedPnL.toFixed(2)}) covered History Debt (${p.cumulativeHedgeLoss.toFixed(2)}).`);
                  actionTaken = true;
                  return;
              } else {
                  // Optional: Log 'Holding' status occasionally or if requested
                  // console.log(`Holding ${p.symbol} for Debt Recovery. Current: ${p.unrealizedPnL.toFixed(2)} / Target: ${targetProfit.toFixed(2)}`);
              }
          }

          // --- 1. MODULE 3: EXPLOSION-PROOF HEDGE (Entry) ---
          if (hedging.enabled && !p.isHedged && !p.mainPositionId) {
             // Check if position meets size threshold
             if (positionValue >= hedging.minPosition) {
                 // Check if PnL is below loss threshold (e.g. -1% <= -1%)
                 if (pnlPct <= -Math.abs(hedging.triggerLossPercent)) {
                     this.executeHedge(p);
                     actionTaken = true;
                     return; // Skip other checks for this position this tick
                 }
             }
          }

          // --- 2. MODULE 2: STOP LOSS ---
          // Guard: Do not execute if managed by Module 4 (Takeover Principle)
          if (profit.stopLoss.enabled && !p.isHedged && !isManagedByModule4) {
              if (positionValue >= profit.stopLoss.minPosition) {
                  if (pnlPct <= -Math.abs(profit.stopLoss.lossPercent)) {
                      const closeRatio = profit.stopLoss.closePercent / 100;
                      if (closeRatio >= 0.99) {
                          this.closePosition(p.symbol, p.side, 'STOP_LOSS');
                      } else {
                          const closeAmount = p.amount * closeRatio;
                          this.closePositionPartially(p, closeAmount, 'STOP_LOSS');
                      }
                      actionTaken = true;
                      return;
                  }
              }
          }

          // --- 3. MODULE 2: PROFIT TAKING (Conventional) ---
          // Guard: Do not execute if managed by Module 4 (Takeover Principle)
          if (profit.enabled && profit.profitMode === 'CONVENTIONAL' && !p.isHedged && !isManagedByModule4) {
              if (positionValue >= profit.conventional.minPosition) {
                  if (pnlPct >= profit.conventional.profitPercent) {
                      const closeRatio = profit.conventional.closePercent / 100;
                      if (closeRatio >= 0.99) {
                           this.closePosition(p.symbol, p.side, 'TAKE_PROFIT');
                      } else {
                           const closeAmount = p.amount * closeRatio;
                           this.closePositionPartially(p, closeAmount, 'TAKE_PROFIT');
                      }
                      actionTaken = true;
                  }
              }
          }
      });

      return actionTaken;
  }

  private executeHedge(originalPos: Position) {
      // 1. Mark original as hedged
      originalPos.isHedged = true;

      // 2. Calculate Hedge Size
      // STRICT LOGIC: If Strategy 4.2 (Hedge Profit Clear) is enabled, we MUST use its specific ratio.
      // Otherwise, we use the standard Module 3 ratio.
      
      let ratioPercent = this.settings.hedging.hedgeRatio;
      let reason = "Standard";

      // FORCE OVERRIDE CHECK
      if (this.settings.stopLoss.hedgeProfitClear === true) {
          ratioPercent = this.settings.stopLoss.hedgeOpenRatio;
          reason = "Strategy 4.2 Boost";
      }

      const ratio = ratioPercent / 100;
      const hedgeQuantity = originalPos.amount * ratio;
      const hedgeSide = originalPos.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG;

      // 3. Open Hedge Position directly
      const leverage = originalPos.leverage;
      const price = originalPos.markPrice;
      
      // Changed: Calculate Notional Value for Log, and Margin Cost for Check
      const notionalValue = hedgeQuantity * price;
      const marginCost = notionalValue / leverage;

      if (this.account.marginBalance < marginCost) {
          this.addLog('DANGER', `Hedge failed for ${originalPos.symbol}: Insufficient Margin`);
          return;
      }

      // Create new position object
      const hedgePos: Position = {
          symbol: originalPos.symbol,
          side: hedgeSide,
          amount: hedgeQuantity,
          markPrice: price,
          entryPrice: price,
          liquidationPrice: hedgeSide === PositionSide.LONG ? price * 0.5 : price * 1.5,
          unrealizedPnL: 0,
          unrealizedPnLPercentage: 0,
          leverage,
          riskLevel: 1,
          isHedged: true,
          entryTime: Date.now(),
          entryId: Math.random().toString(36).substr(2, 9),
          mainPositionId: originalPos.entryId, // LINK TO PARENT
          simAutoReopen: false // Hedges don't auto-reopen
      };

      this.positions.push(hedgePos);
      
      // Log it
      this.addLog('WARNING', `🛡️ 对冲启动: ${originalPos.symbol} [${reason}] (Size: ${ratioPercent}%)`);
      if (this.settings.audio.enabled) audioService.speak(`警告，${originalPos.symbol} 已触发防爆对冲`);

      // Add Trade Log
      const tradeLog: TradeLog = {
          entry_id: hedgePos.entryId!,
          symbol: hedgePos.symbol,
          direction: hedgePos.side,
          quantity: hedgePos.amount,
          cost_usdt: notionalValue, // UPDATED: Store Full Position Value
          entry_price: price,
          entry_timestamp: Date.now(),
          status: 'OPEN',
          leverage,
          is_hedge: true
      };
      this.tradeLogs.unshift(tradeLog);
  }

  // Check conditions for Module 4 (Hedge Profit Exit)
  private checkHedgeExit(originalPos: Position): boolean {
      // Find the corresponding hedge position
      const hedgePos = this.positions.find(p => p.mainPositionId === originalPos.entryId);
      if (!hedgePos) return false;

      const settings = this.settings.stopLoss;

      // Common Calculation: Margin Cost (Used for threshold calculation)
      const originalMargin = (originalPos.amount * originalPos.entryPrice) / originalPos.leverage;

      // --- Strategy 4.1: Original Position Profit Clear (原仓解套) ---
      if (settings.originalProfitClear) {
          // 1. Check Hard Stop Loss on Hedge Position
          if (hedgePos.unrealizedPnLPercentage <= -Math.abs(settings.hedgeStopLossPercent)) {
             
             // 2. Check if Net PnL > Threshold
             const netPnL = originalPos.unrealizedPnL + hedgePos.unrealizedPnL;
             const thresholdValue = originalMargin * (settings.originalCoverPercent / 100);

             if (netPnL > thresholdValue) {
                  this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_A_STOP');
                  this.closePosition(originalPos.symbol, originalPos.side, 'PATH_A_RECOVERY');
                  this.addLog('SUCCESS', `Strategy 4.1: Original Recovered. Net PnL: ${netPnL.toFixed(2)}`);
                  return true;
             }
          }
      }

      // --- Strategy 4.2: Hedge Position Profit Clear (对冲解套/反杀) ---
      if (settings.hedgeProfitClear) {
          const bufferMultiplier = 1 + (settings.hedgeCoverPercent / 100); // 1 + 5% = 1.05
          
          // Historical Accumulated Hedge Loss (if any)
          const pastHedgeLoss = originalPos.cumulativeHedgeLoss || 0;

          // CASE 1: Hedge Win (Active Hedge Counter-Kill)
          // 情况一：当前对冲盈利 > (历史对冲已结亏损 + 当前原仓位浮动亏损) * (1 + 5%)
          if (hedgePos.unrealizedPnL > 0) {
              const currentOriginalLoss = originalPos.unrealizedPnL < 0 ? Math.abs(originalPos.unrealizedPnL) : 0;
              const totalDebtToCover = pastHedgeLoss + currentOriginalLoss;

              if (hedgePos.unrealizedPnL > (totalDebtToCover * bufferMultiplier)) {
                   this.closePosition(originalPos.symbol, originalPos.side, 'PATH_B_WIN_ALL');
                   this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_B_WIN_ALL');
                   this.addLog('SUCCESS', `Strategy 4.2 (Case 1): Hedge Counter-Kill. Covered Debt: ${totalDebtToCover.toFixed(2)}`);
                   return true;
              }
          }

          // CASE 2 Transition: Hedge Stop Loss Triggered (Failure Case)
          // If Hedge hits SL, we must close it. If Original happens to cover everything AT THIS MOMENT, close all.
          // Otherwise, just close Hedge and accumulate debt (which then feeds into 'Debt Recovery' scenario later).
          if (settings.hedgeProfitClearStopLoss > 0 && hedgePos.unrealizedPnLPercentage <= -Math.abs(settings.hedgeProfitClearStopLoss)) {
              
              const currentHedgeLossAbs = Math.abs(hedgePos.unrealizedPnL);
              const totalLossToCover = pastHedgeLoss + currentHedgeLossAbs;
              
              // Condition: Original Profit > (Total Loss) * 1.05
              if (originalPos.unrealizedPnL > (totalLossToCover * bufferMultiplier)) {
                   // SUFFICIENT COVERAGE -> CLOSE EVERYTHING
                   this.closePosition(originalPos.symbol, originalPos.side, 'PATH_B_SL_COVER_ALL');
                   this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_B_SL_COVER_ALL');
                   this.addLog('SUCCESS', `Strategy 4.2: Full Recovery via Original (Covered Hedge SL).`);
                   return true;
              } else {
                   // INSUFFICIENT COVERAGE -> CLOSE HEDGE ONLY, ACCUMULATE DEBT
                   this.closePosition(hedgePos.symbol, hedgePos.side, 'HEDGE_SL_4.2');
                   
                   // Record the loss to the Original Position so future attempts must cover it
                   originalPos.cumulativeHedgeLoss = pastHedgeLoss + currentHedgeLossAbs;
                   
                   // Reset isHedged to allow re-hedge or Debt Recovery (Scenario 2) later
                   originalPos.isHedged = false;
                   
                   this.addLog('WARNING', `Strategy 4.2: Hedge SL. Loss recorded: -${currentHedgeLossAbs.toFixed(2)}U. Total Debt: ${originalPos.cumulativeHedgeLoss.toFixed(2)}U`);
                   return false; 
              }
          }
      }

      // --- Strategy 4.3: Callback Profit Clear (回调吃肉) ---
      if (settings.callbackProfitClear) {
          // Track Max Profit for Hedge Position
          const currentHedgeProfitPct = hedgePos.unrealizedPnLPercentage;
          const trackingKey = hedgePos.entryId!;
          
          if (!this.hedgeMaxProfitMap[trackingKey] || currentHedgeProfitPct > this.hedgeMaxProfitMap[trackingKey]) {
              this.hedgeMaxProfitMap[trackingKey] = currentHedgeProfitPct;
          }
          const maxProfit = this.hedgeMaxProfitMap[trackingKey];

          // 1. Check if Hedge reached target profit
          if (maxProfit >= settings.callbackTargetProfit) {
              // 2. Check Callback (Retracement)
              const pullback = maxProfit - currentHedgeProfitPct;
              if (pullback >= settings.callbackRate) {
                  // 3. Check Coverage
                  const netPnL = originalPos.unrealizedPnL + hedgePos.unrealizedPnL;
                  // Threshold: % of Margin
                  const thresholdValue = originalMargin * (settings.callbackCoverPercent / 100);
                  
                  if (netPnL > thresholdValue) {
                       this.closePosition(originalPos.symbol, originalPos.side, 'PATH_C_STOP');
                       this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_C_WIN');
                       this.addLog('SUCCESS', `Strategy 4.3: Callback Exit. Net PnL: ${netPnL.toFixed(2)}`);
                       delete this.hedgeMaxProfitMap[trackingKey];
                       return true;
                  }
              }
          }
      }

      // --- SAFE CLEAR (From Hedging Settings - Simplified) ---
      if (this.settings.hedging.safeClearEnabled) {
          const { safeClearProfit, safeClearLoss } = this.settings.hedging;
          const netPnL = originalPos.unrealizedPnL + hedgePos.unrealizedPnL;
          const totalMargin = (originalPos.amount * originalPos.entryPrice / originalPos.leverage) + (hedgePos.amount * hedgePos.entryPrice / hedgePos.leverage);
          const netRoi = (netPnL / totalMargin) * 100;

          if (netRoi >= safeClearProfit) {
               this.closePosition(originalPos.symbol, originalPos.side, 'SAFE_CLR_WIN');
               this.closePosition(hedgePos.symbol, hedgePos.side, 'SAFE_CLR_WIN');
               return true;
          }
          if (netRoi <= -Math.abs(safeClearLoss)) {
               this.closePosition(originalPos.symbol, originalPos.side, 'SAFE_CLR_LOSS');
               this.closePosition(hedgePos.symbol, hedgePos.side, 'SAFE_CLR_LOSS');
               return true;
          }
      }

      return false;
  }

  private closePositionPartially(p: Position, amount: number, reason: string) {
      if (amount >= p.amount * 0.99) {
          this.closePosition(p.symbol, p.side, reason);
          return;
      }

      // Ratio of closed amount to total
      const ratio = amount / p.amount;
      const pnlRealized = p.unrealizedPnL * ratio;
      const costClosed = amount * p.entryPrice;

      // Create Partial Close Log
      const partialLog: TradeLog = {
          entry_id: p.entryId!,
          symbol: p.symbol,
          direction: p.side,
          quantity: amount,
          cost_usdt: costClosed,
          entry_price: p.entryPrice,
          exit_price: p.markPrice,
          profit_usdt: pnlRealized,
          profit_percent: p.unrealizedPnLPercentage,
          entry_timestamp: p.entryTime || Date.now(),
          exit_timestamp: Date.now(),
          status: 'CLOSED',
          exit_reason: `PARTIAL_${reason}`, // Distinguish reason
          leverage: p.leverage,
          is_hedge: p.isHedged
      };
      this.tradeLogs.unshift(partialLog);

      // Update Position
      p.amount -= amount;
      p.unrealizedPnL -= pnlRealized; 
      // PnL Percentage stays roughly same for remaining portion (math simplification)

      // Update Account
      this.account.marginBalance += pnlRealized; 
      // Recover margin (approximate)
      // this.account.marginBalance += (amount * p.entryPrice / p.leverage); // If we tracked used margin strictly

      this.addLog('WARNING', `Partial Close ${p.symbol}: ${reason} (${(ratio*100).toFixed(0)}%)`);
      this.emitUpdate();
  }

  private updateAccountStats() {
      const totalUnrealizedPnL = this.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
      this.account.totalBalance = this.account.marginBalance + totalUnrealizedPnL;
      const totalMarginUsed = this.positions.reduce((sum, p) => (p.amount * p.entryPrice) / p.leverage, 0);
      if (totalMarginUsed > 0) {
          this.account.marginRatio = (this.account.totalBalance / totalMarginUsed) * 100;
      } else {
          this.account.marginRatio = 999;
      }
  }

  public openPosition(
      symbol: string, 
      side: PositionSide, 
      amount: number, 
      price: number, 
      tpPercent?: number, 
      autoReopen?: boolean, 
      slPercent?: number, 
      isHedge?: boolean, 
      isQuantityBase?: boolean
  ) {
      // --- PRICE SAFETY CHECK ---
      const realPrice = this.realPrices[symbol];
      if (realPrice && price > 0) {
          const deviation = Math.abs(price - realPrice) / realPrice;
          if (deviation > 0.5) { 
              this.addLog('WARNING', `Corrected invalid price for ${symbol}: ${price} -> ${realPrice}`);
              price = realPrice;
          }
      }

      const leverage = 20;
      const quantity = isQuantityBase ? amount / price : amount; 
      
      // Changed: Calculate Notional Value for Log, and Margin Cost for Check
      const notionalValue = quantity * price;
      const marginCost = notionalValue / leverage;

      if (this.account.marginBalance < marginCost) {
          this.addLog('WARNING', `Insufficient balance to open ${symbol}`);
          return;
      }

      // this.account.marginBalance -= cost; // Simplified

      const newPos: Position = {
          symbol,
          side,
          amount: quantity,
          markPrice: price,
          entryPrice: price,
          liquidationPrice: side === PositionSide.LONG ? price * 0.5 : price * 1.5,
          unrealizedPnL: 0,
          unrealizedPnLPercentage: 0,
          leverage,
          riskLevel: 1,
          isHedged: isHedge || false,
          entryTime: Date.now(),
          entryId: Math.random().toString(36).substr(2, 9),
          simTpPercent: tpPercent,
          simAutoReopen: autoReopen
      };

      this.positions.push(newPos);
      this.addLog('SUCCESS', `Opened ${side} ${symbol} at ${price}`);
      
      const tradeLog: TradeLog = {
          entry_id: newPos.entryId!,
          symbol,
          direction: side,
          quantity,
          cost_usdt: notionalValue, // UPDATED: Store Full Position Value
          entry_price: price,
          entry_timestamp: Date.now(),
          status: 'OPEN',
          leverage,
          is_hedge: isHedge
      };
      this.tradeLogs.unshift(tradeLog);

      this.emitUpdate();
      if (this.settings.audio.enabled) audioService.speak(`开仓成功 ${symbol}`);
  }

  public closePosition(symbol: string, side: PositionSide, reason: string = 'MANUAL') {
      const idx = this.positions.findIndex(p => p.symbol === symbol && p.side === side);
      if (idx === -1) return;

      const p = this.positions[idx];
      const pnl = p.unrealizedPnL;
      
      // Auto Reopen Logic: 
      // Only STOP reopening if manually closed or removed.
      // If closed by TP (PROFIT) or SL (LOSS), and loop is ON, we continue.
      // UPDATED: Added 'BATCH_CLOSE' to prevent reopening after one-click clear.
      const shouldReopen = p.simAutoReopen && reason !== 'MANUAL' && reason !== 'REMOVE' && reason !== 'BATCH_CLOSE';

      this.account.marginBalance += pnl; 
      this.positions.splice(idx, 1);

      this.addLog(pnl >= 0 ? 'SUCCESS' : 'WARNING', `Closed ${symbol} (${side}): ${pnl.toFixed(2)} U`);
      
      // CREATE SEPARATE CLOSE LOG
      const closeLog: TradeLog = {
          entry_id: p.entryId!,
          symbol: p.symbol,
          direction: p.side,
          quantity: p.amount,
          cost_usdt: (p.amount * p.entryPrice), // Entry Notional Value for reference
          entry_price: p.entryPrice,
          exit_price: p.markPrice,
          profit_usdt: pnl,
          profit_percent: p.unrealizedPnLPercentage,
          entry_timestamp: p.entryTime || Date.now(),
          exit_timestamp: Date.now(),
          status: 'CLOSED',
          exit_reason: reason,
          leverage: p.leverage,
          is_hedge: p.isHedged
      };
      this.tradeLogs.unshift(closeLog);
      
      // REMOVED: Logic that updated existing OPEN log

      this.emitUpdate();
      
      // Auto Reopen Logic
      if (shouldReopen) {
          setTimeout(() => {
              this.openPosition(p.symbol, p.side, p.amount, p.markPrice, p.simTpPercent, true, undefined, false, false);
          }, 1000);
      }
  }

  public batchCloseAllPositions() {
      const toClose = [...this.positions];
      toClose.forEach(p => this.closePosition(p.symbol, p.side, 'BATCH_CLOSE'));
      this.addLog('WARNING', 'Executed Batch Close All');
  }

  public openBatchPositions(
    symbol: string,
    direction: 'LONG' | 'SHORT' | 'RANDOM',
    count: number,
    size: number,
    tpPercent: number,
    autoReopen: boolean,
    source: 'POOL' | 'TOP_GAINERS' | 'TOP_LOSERS',
    timeBasis: 'TRADING_DAY' | '24H',
    minVolume: number,
    customCandidates?: string[],
    customPrices?: Record<string, number>
  ) {
      if (customCandidates && customCandidates.length > 0) {
          if (customPrices) {
             this.realPrices = { ...this.realPrices, ...customPrices };
          }

          customCandidates.forEach(sym => {
              const price = customPrices?.[sym] || this.realPrices[sym] || 100;
              const dir = direction === 'RANDOM' ? (Math.random() > 0.5 ? PositionSide.LONG : PositionSide.SHORT) : (direction as PositionSide);
              this.openPosition(sym, dir, size, price, tpPercent, autoReopen, undefined, false, true);
          });
      } else {
          this.addLog('WARNING', 'No candidates for batch open');
      }
  }

  public updateLeverage(symbol: string, side: PositionSide, leverage: number) {
      const p = this.positions.find(p => p.symbol === symbol && p.side === side);
      if (p) {
          p.leverage = leverage;
          this.addLog('INFO', `Updated leverage for ${symbol} to ${leverage}x`);
          this.emitUpdate();
      }
  }

  public triggerEmergencyHedge() {
      const isLooping = this.positions.length === 0 || this.positions.some(p => p.simAutoReopen !== false);
      const newAutoReopenState = !isLooping; 
      
      this.positions.forEach(p => {
          p.simAutoReopen = newAutoReopenState;
      });
      
      this.emitUpdate();
      
      if (!newAutoReopenState) {
          this.addLog('WARNING', `⛔ (平仓后停止) 已启动: 所有当前仓位平仓后将停止，不再自动开仓。`);
          if (this.settings.audio.enabled) audioService.speak('已启动平仓后停止模式，当前仓位结束后将不再开仓。');
      } else {
          this.addLog('SUCCESS', `♻️ (循环运行) 已恢复: 所有当前仓位平仓后将自动继续开仓。`);
          if (this.settings.audio.enabled) audioService.speak('已恢复循环运行模式。');
      }
  }
}