
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

  public tick(enableStrategies: boolean = true) {
      let stateChanged = false;

      // 1. Update Prices & PnL (ALWAYS RUNS to keep UI alive)
      this.positions.forEach(p => {
          const currentPrice = this.realPrices[p.symbol] || p.markPrice;
          
          // --- SAFETY: PRICE DEVIATION GUARD ---
          if (p.markPrice > 0 && Math.abs((currentPrice - p.markPrice) / p.markPrice) > 0.1) {
              return; 
          }

          if (p.markPrice !== currentPrice) {
              p.markPrice = currentPrice;
              
              const priceDiff = p.side === PositionSide.LONG 
                  ? currentPrice - p.entryPrice 
                  : p.entryPrice - currentPrice;
              
              p.unrealizedPnL = priceDiff * p.amount;
              
              if (p.entryPrice > 0) {
                  p.unrealizedPnLPercentage = (priceDiff / p.entryPrice) * 100;
              } else {
                  p.unrealizedPnLPercentage = 0;
              }
              
              if (p.unrealizedPnLPercentage > 0) {
                  if (p.maxPnLPercent === undefined || p.unrealizedPnLPercentage > p.maxPnLPercent) {
                      p.maxPnLPercent = p.unrealizedPnLPercentage;
                  }
              }
              
              // --- Strategy 4.3 Extreme Price Tracking ---
              // FIX: Only update extremePrice when HEDGED.
              // When Unhedged (e.g. after SL), extremePrice must freeze to act as a static breakout trigger.
              if (this.settings.stopLoss.callbackProfitClear && p.isHedged) {
                  if (p.side === PositionSide.LONG) {
                      p.extremePrice = (p.extremePrice !== undefined) ? Math.min(p.extremePrice, currentPrice) : currentPrice;
                  } else {
                      p.extremePrice = (p.extremePrice !== undefined) ? Math.max(p.extremePrice, currentPrice) : currentPrice;
                  }
              }

              stateChanged = true;
          }
      });

      // 2. Check Strategies (Only if Automation is Enabled)
      if (enableStrategies) {
          if (this.checkStrategies()) {
              stateChanged = true;
          }
      }

      // 3. Update Account & Emit
      if (stateChanged) {
          this.updateAccountStats();
          this.emitUpdate();
      }
  }

  private checkStrategies(): boolean {
      let actionTaken = false;
      const { hedging, profit, stopLoss, martingale } = this.settings;

      // Iterate active positions
      const activePositions = [...this.positions];

      activePositions.forEach(p => {
          if (!this.positions.includes(p)) return;

          const pnlPct = p.unrealizedPnLPercentage; 
          const positionValue = p.amount * p.entryPrice;

          // --- CRITICAL GUARD: MODULE 4 TAKEOVER PRINCIPLE ---
          // Rule: If Module 4 is enabled AND position is in explosion-proof lifecycle (Hedged OR Debt),
          // Module 4 takes over control from Module 2 (SL/TP) and Module 3 (Standard Hedge).
          const isModule4StrategyActive = (
              stopLoss.originalProfitClear ||  // Function 1
              stopLoss.hedgeProfitClear ||     // Function 2
              stopLoss.callbackProfitClear     // Function 3
          );
          
          const isInExplosionProofLifecycle = p.isHedged || (p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0) || (p.cumulativeHedgeProfit && p.cumulativeHedgeProfit > 0);
          const isManagedByModule4 = isModule4StrategyActive && isInExplosionProofLifecycle;


          // --- 0. SIMULATION SPECIFIC TP ---
          // Checks !isManagedByModule4 to prevent premature closing during debt recovery
          if (p.simTpPercent && p.simTpPercent > 0 && !p.isHedged && !isManagedByModule4) {
              if (pnlPct >= p.simTpPercent) {
                  this.closePosition(p.symbol, p.side, 'SIM_PROFIT'); 
                  actionTaken = true;
                  return;
              }
          }
          
          // --- MODULE 8: MARTINGALE STRATEGY (High Priority if Unhedged) ---
          // New Condition: Must be ENABLED and RUNNING
          if (martingale.enabled && martingale.isRunning && p.isMartinActive && !p.isHedged && !isManagedByModule4) {
              if (this.checkMartingaleStrategy(p)) {
                  actionTaken = true;
                  return;
              }
          }

          // --- MODULE 4: HEDGE EXIT STRATEGIES ---
          if (p.isHedged && !p.mainPositionId) {
             if (this.checkHedgeExit(p)) {
                 actionTaken = true;
                 return;
             }
          }

          // --- MODULE 4.3: Rolling Hedge Entry (Extreme Breakout) ---
          // Logic: If we are in the 4.3 lifecycle (have debt OR past profit) AND price breaks extreme, RE-HEDGE.
          // This replaces Module 3 entry for 4.3 scenarios.
          if (!p.isHedged && stopLoss.callbackProfitClear && (p.cumulativeHedgeLoss! > 0 || p.cumulativeHedgeProfit! > 0)) {
              // FIX: Initialize extremePrice safely. If undefined, set it but DO NOT trigger immediately.
              if (p.extremePrice === undefined) {
                  p.extremePrice = p.markPrice;
                  return; // Wait for next tick to detect breakout
              }

              const extreme = p.extremePrice;
              
              // Check Breakout: Long Origin breaks Low, Short Origin breaks High
              // Strict inequality (< or >) prevents trigger on equal initialization
              const isBreakout = p.side === PositionSide.LONG 
                  ? p.markPrice < extreme 
                  : p.markPrice > extreme;
              
              if (isBreakout) {
                  const reason = `Strategy 4.3 Breakout (Extreme: ${extreme.toFixed(4)})`;
                  this.executeHedge(p, reason);
                  actionTaken = true;
                  return;
              }
          }

          // --- MODULE 4.1 & 4.2: UNIFIED Debt Recovery (Unhedged) ---
          // Note: Excludes Strategy 4.3 to protect 4.2 logic integrity as requested.
          const isRecoveryEnabled = (stopLoss.hedgeProfitClear || stopLoss.originalProfitClear) && !stopLoss.callbackProfitClear;
          
          if (!p.isHedged && p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0 && isRecoveryEnabled) {
              let coverPercent = 0;
              if (stopLoss.hedgeProfitClear) {
                  coverPercent = stopLoss.hedgeCoverPercent || 0;
              } else if (stopLoss.originalProfitClear) {
                  coverPercent = stopLoss.originalCoverPercent || 0;
              }
              
              const bufferMultiplier = 1 + (coverPercent / 100);
              const targetProfit = p.cumulativeHedgeLoss * bufferMultiplier;
              
              if (p.unrealizedPnL > targetProfit) {
                  const debtCleared = p.cumulativeHedgeLoss;
                  const surplus = p.unrealizedPnL - debtCleared;
                  
                  p.cumulativeHedgeLoss = 0;
                  p.hedgeLossCount = 0;
                  this.closePosition(p.symbol, p.side, 'PATH_B_DEBT_RECOVERY');
                  this.addLog('SUCCESS', `Strategy Recovery: Cleared Debt ${debtCleared.toFixed(2)}U with +${surplus.toFixed(2)}U surplus.`);
                  actionTaken = true;
                  return;
              }
          }

          // --- MODULE 4.3: Victory/Recovery (Unhedged) ---
          // Covers Rule 1 (Callback Profit vs Debt) & Rule 2 (Original Win vs Debt)
          if (!p.isHedged && stopLoss.callbackProfitClear) {
              const pastProfit = p.cumulativeHedgeProfit || 0;
              const pastLoss = p.cumulativeHedgeLoss || 0;
              
              // FIX: CRITICAL BUG FIX
              // Only trigger 4.3 Victory logic if we are actually in a 4.3 lifecycle (have debt or accumulated profit).
              // Without this check, fresh positions with 0 debt/profit would instantly close if gain > 0.
              if (pastProfit > 0 || pastLoss > 0) {
                  const currentPnL = p.unrealizedPnL;
                  
                  // Assets: Past Profit + Current Profit (if any)
                  const gains = pastProfit + (currentPnL > 0 ? currentPnL : 0);
                  // Liabilities: Past Loss + Current Loss (if any)
                  const losses = pastLoss + (currentPnL < 0 ? Math.abs(currentPnL) : 0);

                  const bufferMultiplier = 1 + (stopLoss.callbackCoverPercent / 100);

                  if (gains > losses * bufferMultiplier) {
                       p.cumulativeHedgeProfit = 0;
                       p.cumulativeHedgeLoss = 0;
                       p.hedgeLossCount = 0;
                       p.extremePrice = undefined; // Reset cycle
                       
                       this.closePosition(p.symbol, p.side, 'PATH_C_VICTORY_ORIGIN');
                       this.addLog('SUCCESS', `Strategy 4.3 Victory (Origin): Gains ${gains.toFixed(2)} > Losses ${losses.toFixed(2)} * ${bufferMultiplier}`);
                       actionTaken = true;
                       return;
                  }
              }
          }

          // --- 1. MODULE 3: EXPLOSION-PROOF HEDGE (Entry) ---
          // CRITICAL UPDATE: Allow entry if it is a Strategy 4.2 Recovery scenario.
          // For Strategy 4.3, we rely on the specific breakout block above, so standard Module 3 is skipped via `!isManagedByModule4`.
          const isStrategy42Recovery = stopLoss.hedgeProfitClear && p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0;

          if (hedging.enabled && !p.isHedged && !p.mainPositionId && (!isManagedByModule4 || isStrategy42Recovery)) {
             if (positionValue >= hedging.minPosition) {
                 // Trigger Logic
                 if (pnlPct <= -Math.abs(hedging.triggerLossPercent)) {
                     // Pass explicit reason with data snapshot
                     const reason = `Module 3 Threshold (PnL: ${pnlPct.toFixed(2)}% <= -${hedging.triggerLossPercent}%)`;
                     this.executeHedge(p, reason);
                     actionTaken = true;
                     return;
                 }
             }
          }

          // --- 2. MODULE 2: STOP LOSS ---
          if (profit.stopLoss.enabled && !p.isHedged && !isManagedByModule4) {
              if (positionValue >= profit.stopLoss.minPosition) {
                  if (pnlPct <= -Math.abs(profit.stopLoss.lossPercent)) {
                      this.closePosition(p.symbol, p.side, 'STOP_LOSS');
                      actionTaken = true;
                      return;
                  }
              }
          }

          // --- 3. MODULE 2: PROFIT TAKING ---
          if (profit.enabled && profit.profitMode === 'CONVENTIONAL' && !p.isHedged && !isManagedByModule4) {
              if (positionValue >= profit.conventional.minPosition) {
                  if (pnlPct >= profit.conventional.profitPercent) {
                       this.closePosition(p.symbol, p.side, 'TAKE_PROFIT');
                       actionTaken = true;
                  }
              }
          }
      });

      return actionTaken;
  }
  
  private checkMartingaleStrategy(p: Position): boolean {
      const { martingale } = this.settings;
      
      // 0. Direction Check
      // If configured for LONG only, skip Shorts.
      if (martingale.direction !== 'BOTH' && p.side !== martingale.direction) {
          return false;
      }

      const currentPrice = p.markPrice;
      
      // 1. Check Take Profit based on Average Price
      if (p.unrealizedPnLPercentage >= martingale.takeProfit) {
          this.closePosition(p.symbol, p.side, 'MARTIN_TP');
          this.addLog('SUCCESS', `Martingale TP: ${p.symbol} reached ${p.unrealizedPnLPercentage.toFixed(2)}% target.`);
          return true;
      }

      // 2. Check Refill Condition
      if ((p.martinStep || 0) < martingale.maxSteps) {
          const lastPrice = p.lastRefillPrice || p.entryPrice;
          const dropThreshold = martingale.dropPercent / 100;
          
          let shouldRefill = false;
          if (p.side === PositionSide.LONG) {
              if (currentPrice <= lastPrice * (1 - dropThreshold)) {
                  shouldRefill = true;
              }
          } else {
              if (currentPrice >= lastPrice * (1 + dropThreshold)) {
                  shouldRefill = true;
              }
          }

          if (shouldRefill) {
              this.executeMartingaleRefill(p);
              return true;
          }
      }
      return false;
  }
  
  private executeMartingaleRefill(p: Position) {
      const { martingale } = this.settings;
      
      // DETERMINE REFILL BASE:
      // If "firstBuyAmount" is set (>0):
      // - First refill (Step 0) uses this amount as base.
      // - Subsequent refills use the Last Refill Amount as base.
      // If "firstBuyAmount" is 0:
      // - First refill uses Current Position Amount as base (Legacy behavior).
      let baseAmount = p.amount; // Default to current total position size
      
      if (p.martinStep === 0 && martingale.firstBuyAmount > 0) {
          baseAmount = martingale.firstBuyAmount / p.markPrice; // Convert U to Qty (approx)
          // Wait, p.amount is Quantity. firstBuyAmount is U. We need Qty.
          // Let's store Qty Base.
          // Actually, let's keep logic in "Amount" (Quantity) domain.
      } else if (p.martinStep && p.martinStep > 0 && p.lastRefillAmount) {
          baseAmount = p.lastRefillAmount;
      }

      // Calculate refill quantity
      // If it's Step 0 and we have firstBuyAmount (U), convert to Qty
      // Else, baseAmount is already Qty
      let refillQuantity = 0;
      
      if (p.martinStep === 0 && martingale.firstBuyAmount > 0) {
          refillQuantity = (martingale.firstBuyAmount / p.markPrice) * martingale.volumeMultiplier;
      } else {
          refillQuantity = baseAmount * martingale.volumeMultiplier;
      }
      
      const currentPrice = p.markPrice;
      const notionalValue = refillQuantity * currentPrice;
      const marginCost = notionalValue / p.leverage;

      if (this.account.marginBalance < marginCost) {
          this.addLog('WARNING', `Martingale Refill Skipped: Insufficient Margin for ${p.symbol}`);
          return;
      }

      // Execute Trade Logic (Updating Average Price)
      const oldAmount = p.amount;
      const oldCost = oldAmount * p.entryPrice;
      const newCost = oldCost + (refillQuantity * currentPrice);
      const newAmount = oldAmount + refillQuantity;
      const newEntryPrice = newCost / newAmount;

      // Update Position State
      p.amount = newAmount;
      p.entryPrice = newEntryPrice;
      p.lastRefillPrice = currentPrice;
      p.lastRefillAmount = refillQuantity; // Store for next step calculation
      p.martinStep = (p.martinStep || 0) + 1;
      
      // Recalculate PnL immediately
      const priceDiff = p.side === PositionSide.LONG ? currentPrice - newEntryPrice : newEntryPrice - currentPrice;
      p.unrealizedPnL = priceDiff * newAmount;
      p.unrealizedPnLPercentage = (priceDiff / newEntryPrice) * 100;

      // Log
      this.addLog('INFO', `Martingale Refill #${p.martinStep} for ${p.symbol}. Added ${refillQuantity.toFixed(4)} @ ${currentPrice} (${notionalValue.toFixed(0)}U). New Avg: ${newEntryPrice.toFixed(4)}`);
      if (this.settings.audio.enabled) audioService.speak(`${p.symbol} 马丁补仓成功`);

      const tradeLog: TradeLog = {
          entry_id: p.entryId!,
          symbol: p.symbol,
          direction: p.side,
          quantity: refillQuantity,
          cost_usdt: notionalValue,
          entry_price: currentPrice,
          entry_timestamp: Date.now(),
          status: 'OPEN', // Treating refills as open events in log
          leverage: p.leverage,
          is_hedge: false,
          signal_details: { type: 'MARTINGALE_REFILL', step: p.martinStep }
      };
      this.tradeLogs.unshift(tradeLog);
  }

  private executeHedge(originalPos: Position, reason: string = 'Standard Trigger') {
      // --- CRITICAL DOUBLE-CHECK GUARD ---
      // 防止数据闪崩导致的“幽灵对冲”。如果当前盈亏其实很好（>-0.1%），强制拦截。
      // 除非是 4.2/4.3 策略强制触发 (Reason contains "Strategy")
      const isStrategyTrigger = reason.includes("Strategy");
      const isPnLHealthy = originalPos.unrealizedPnLPercentage > -0.1; 

      if (!isStrategyTrigger && isPnLHealthy) {
          this.addLog('WARNING', `⛔ 拦截幽灵对冲: ${originalPos.symbol} 当前盈亏 ${originalPos.unrealizedPnLPercentage.toFixed(2)}% (未达标), 忽略触发信号。`);
          return; // ABORT HEDGE
      }

      // 1. Mark original as hedged
      originalPos.isHedged = true;

      // 2. Calculate Hedge Size
      let ratioPercent = this.settings.hedging.hedgeRatio;
      
      // Override for Strategy 4.2
      if (this.settings.stopLoss.hedgeProfitClear === true) {
          ratioPercent = this.settings.stopLoss.hedgeOpenRatio;
      }
      // Override for Strategy 4.3
      else if (this.settings.stopLoss.callbackProfitClear === true) {
          ratioPercent = this.settings.stopLoss.callbackHedgeRatio ?? 100;
      }

      const ratio = ratioPercent / 100;
      const hedgeQuantity = originalPos.amount * ratio;
      const hedgeSide = originalPos.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG;

      const leverage = originalPos.leverage;
      const price = originalPos.markPrice;
      const notionalValue = hedgeQuantity * price;
      const marginCost = notionalValue / leverage;

      if (this.account.marginBalance < marginCost) {
          this.addLog('DANGER', `Hedge failed for ${originalPos.symbol}: Insufficient Margin`);
          return;
      }

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
          mainPositionId: originalPos.entryId,
          simAutoReopen: false 
      };

      this.positions.push(hedgePos);
      
      // Detailed Log
      this.addLog('WARNING', `🛡️ 对冲启动: ${originalPos.symbol} @ ${price} [${reason}]`);
      if (this.settings.audio.enabled) audioService.speak(`警告，${originalPos.symbol} 已触发防爆对冲`);

      const tradeLog: TradeLog = {
          entry_id: hedgePos.entryId!,
          symbol: hedgePos.symbol,
          direction: hedgePos.side,
          quantity: hedgePos.amount,
          cost_usdt: notionalValue,
          entry_price: price,
          entry_timestamp: Date.now(),
          status: 'OPEN',
          leverage,
          is_hedge: true,
          signal_details: { trigger_reason: reason } // Store reason in history
      };
      this.tradeLogs.unshift(tradeLog);
  }

  // Check conditions for Module 4 (Hedge Profit Exit)
  private checkHedgeExit(originalPos: Position): boolean {
      const hedgePos = this.positions.find(p => p.mainPositionId === originalPos.entryId);
      if (!hedgePos) return false;

      const settings = this.settings.stopLoss;
      const originalMargin = (originalPos.amount * originalPos.entryPrice) / originalPos.leverage;

      // --- Strategy 4.1: Original Position Profit Clear ---
      if (settings.originalProfitClear) {
          if (hedgePos.unrealizedPnLPercentage <= -Math.abs(settings.hedgeStopLossPercent)) {
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

      // --- Strategy 4.2: Hedge Position Profit Clear ---
      if (settings.hedgeProfitClear) {
          const bufferMultiplier = 1 + (settings.hedgeCoverPercent / 100);
          const pastHedgeLoss = originalPos.cumulativeHedgeLoss || 0;

          // CASE 1: Hedge Win
          if (hedgePos.unrealizedPnL > 0) {
              const currentOriginalLoss = originalPos.unrealizedPnL < 0 ? Math.abs(originalPos.unrealizedPnL) : 0;
              const totalDebtToCover = pastHedgeLoss + currentOriginalLoss;
              const targetProfit = totalDebtToCover * bufferMultiplier;

              if (hedgePos.unrealizedPnL > targetProfit) {
                   originalPos.cumulativeHedgeLoss = 0;
                   originalPos.hedgeLossCount = 0;
                   this.closePosition(originalPos.symbol, originalPos.side, 'PATH_B_WIN_ALL');
                   this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_B_WIN_ALL');
                   this.addLog('SUCCESS', `Strategy 4.2: Hedge Win Cleared All.`);
                   return true;
              }
          }

          // CASE 2: Hedge SL (Failure) with Smart Execution
          if (settings.hedgeProfitClearStopLoss > 0 && hedgePos.unrealizedPnLPercentage <= -Math.abs(settings.hedgeProfitClearStopLoss)) {
              const currentHedgeLossAbs = Math.abs(hedgePos.unrealizedPnL);
              const totalLossToCover = pastHedgeLoss + currentHedgeLossAbs;
              
              if (originalPos.unrealizedPnL > (totalLossToCover * bufferMultiplier)) {
                   originalPos.cumulativeHedgeLoss = 0;
                   originalPos.hedgeLossCount = 0;
                   this.closePosition(originalPos.symbol, originalPos.side, 'PATH_B_SL_COVER_ALL');
                   this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_B_SL_COVER_ALL');
                   this.addLog('SUCCESS', `Strategy 4.2: Original Covered Hedge SL.`);
                   return true;
              } else {
                   // --- SMART SLIPPAGE FIX ---
                   let smartExitPrice = hedgePos.markPrice;
                   const targetPercentage = settings.hedgeProfitClearStopLoss;
                   const factor = targetPercentage / 100;
                   const theoreticalPrice = hedgePos.side === PositionSide.SHORT
                      ? hedgePos.entryPrice * (1 + factor)
                      : hedgePos.entryPrice * (1 - factor);
                   
                   const gap = Math.abs(hedgePos.markPrice - theoreticalPrice) / theoreticalPrice;
                   
                   if (gap < 0.05) {
                       smartExitPrice = theoreticalPrice;
                   }

                   this.closePosition(hedgePos.symbol, hedgePos.side, 'HEDGE_SL_4.2', smartExitPrice);
                   
                   const priceDiff = hedgePos.side === PositionSide.LONG ? smartExitPrice - hedgePos.entryPrice : hedgePos.entryPrice - smartExitPrice;
                   const smartPnL = priceDiff * hedgePos.amount;
                   
                   originalPos.cumulativeHedgeLoss = pastHedgeLoss + Math.abs(smartPnL);
                   originalPos.hedgeLossCount = (originalPos.hedgeLossCount || 0) + 1;
                   originalPos.isHedged = false; 
                   
                   this.addLog('WARNING', `Strategy 4.2: Hedge SL Triggered. Smart Exec @ ${smartExitPrice.toFixed(4)} (Debt: ${originalPos.cumulativeHedgeLoss.toFixed(2)}U)`);
                   return false; 
              }
          }
      }

      // --- Strategy 4.3: Callback Profit Clear (Rolling Hedge) ---
      if (settings.callbackProfitClear) {
          const currentHedgeProfitPct = hedgePos.unrealizedPnLPercentage;
          const trackingKey = hedgePos.entryId!;
          
          if (!this.hedgeMaxProfitMap[trackingKey] || currentHedgeProfitPct > this.hedgeMaxProfitMap[trackingKey]) {
              this.hedgeMaxProfitMap[trackingKey] = currentHedgeProfitPct;
          }
          const maxProfit = this.hedgeMaxProfitMap[trackingKey];

          // 1. Check Victory (Rules 1, 2 & 3: Total Net Equity > Debt Check)
          const pastProfit = originalPos.cumulativeHedgeProfit || 0;
          const pastLoss = originalPos.cumulativeHedgeLoss || 0;
          const hedgePnL = hedgePos.unrealizedPnL;
          const origPnL = originalPos.unrealizedPnL;

          // Assets: Past Profits + Current Positive PnLs
          const gains = pastProfit + (hedgePnL > 0 ? hedgePnL : 0) + (origPnL > 0 ? origPnL : 0);
          // Liabilities: Past Losses + Current Negative PnLs
          const losses = pastLoss + (hedgePnL < 0 ? Math.abs(hedgePnL) : 0) + (origPnL < 0 ? Math.abs(origPnL) : 0);

          const bufferMultiplier = 1 + (settings.callbackCoverPercent / 100);
          
          // Strict check: Gains must cover Losses by the buffer percentage
          if (gains > losses * bufferMultiplier) {
               originalPos.cumulativeHedgeProfit = 0;
               originalPos.cumulativeHedgeLoss = 0;
               originalPos.extremePrice = undefined;
               
               this.closePosition(originalPos.symbol, originalPos.side, 'PATH_C_VICTORY_ALL');
               this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_C_VICTORY_ALL');
               
               this.addLog('SUCCESS', `Strategy 4.3 Victory: Gains ${gains.toFixed(2)} > Losses ${losses.toFixed(2)} * ${bufferMultiplier}`);
               delete this.hedgeMaxProfitMap[trackingKey];
               return true;
          }

          // 2. Callback Profit Take (Harvest)
          if (maxProfit >= settings.callbackTargetProfit) {
              const pullback = maxProfit - currentHedgeProfitPct;
              if (pullback >= settings.callbackRate) {
                  // Close Hedge Only
                  this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_C_HARVEST');
                  
                  // Record Profit, Original stays open
                  originalPos.cumulativeHedgeProfit = (originalPos.cumulativeHedgeProfit || 0) + hedgePos.unrealizedPnL;
                  originalPos.isHedged = false; 
                  
                  this.addLog('SUCCESS', `Strategy 4.3 Harvest: +${hedgePos.unrealizedPnL.toFixed(2)}U. Waiting for extreme breakout.`);
                  delete this.hedgeMaxProfitMap[trackingKey];
                  return true;
              }
          }

          // 3. Stop Loss
          if (settings.callbackStopLoss > 0 && currentHedgeProfitPct <= -Math.abs(settings.callbackStopLoss)) {
               this.closePosition(hedgePos.symbol, hedgePos.side, 'PATH_C_HEDGE_SL');
               
               // Record Loss, Original stays open
               originalPos.cumulativeHedgeLoss = (originalPos.cumulativeHedgeLoss || 0) + Math.abs(hedgePos.unrealizedPnL);
               originalPos.isHedged = false;

               this.addLog('WARNING', `Strategy 4.3 Hedge SL: -${Math.abs(hedgePos.unrealizedPnL).toFixed(2)}U.`);
               delete this.hedgeMaxProfitMap[trackingKey];
               return true;
          }
      }

      // --- SAFE CLEAR ---
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
      const ratio = amount / p.amount;
      const pnlRealized = p.unrealizedPnL * ratio;
      const costClosed = amount * p.entryPrice;
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
          exit_reason: `PARTIAL_${reason}`,
          leverage: p.leverage,
          is_hedge: p.isHedged
      };
      this.tradeLogs.unshift(partialLog);
      p.amount -= amount;
      p.unrealizedPnL -= pnlRealized; 
      this.account.marginBalance += pnlRealized; 
      this.addLog('WARNING', `Partial Close ${p.symbol}: ${reason} (${(ratio*100).toFixed(0)}%)`);
      this.emitUpdate();
  }

  private updateAccountStats() {
      const totalUnrealizedPnL = this.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
      this.account.totalBalance = this.account.marginBalance + totalUnrealizedPnL;
      const totalMarginUsed = this.positions.reduce((sum, p) => (p.amount * p.entryPrice) / p.leverage, 0);
      this.account.marginRatio = totalMarginUsed > 0 ? (this.account.totalBalance / totalMarginUsed) * 100 : 999;
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
      const notionalValue = quantity * price;
      const marginCost = notionalValue / leverage;

      if (this.account.marginBalance < marginCost) {
          this.addLog('WARNING', `Insufficient balance to open ${symbol}`);
          return;
      }
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
          simAutoReopen: autoReopen,
          // Initialize Martingale fields
          martinStep: 0,
          isMartinActive: this.settings.martingale.enabled && !isHedge, // Inherit global setting on open
          lastRefillPrice: price
      };
      this.positions.push(newPos);
      this.addLog('SUCCESS', `Opened ${side} ${symbol} at ${price}`);
      const tradeLog: TradeLog = {
          entry_id: newPos.entryId!,
          symbol: newPos.symbol,
          direction: side,
          quantity,
          cost_usdt: notionalValue,
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

  public closePosition(symbol: string, side: PositionSide, reason: string = 'MANUAL', overridePrice?: number) {
      const idx = this.positions.findIndex(p => p.symbol === symbol && p.side === side);
      if (idx === -1) return;
      const p = this.positions[idx];
      
      // FIX: Check if we are closing a HEDGE position. If so, find parent and reset isHedged state.
      // This prevents the original position from becoming a "Zombie" (unprotected but marked as hedged).
      if (p.mainPositionId) {
          const parentPos = this.positions.find(parent => parent.entryId === p.mainPositionId);
          if (parentPos) {
              parentPos.isHedged = false;
              // We don't necessarily need to log this detail, but it ensures logic safety.
          }
      }

      // Calculate PnL based on Mark Price OR Override Price (Smart Execution)
      let exitPrice = p.markPrice;
      let pnl = p.unrealizedPnL;
      
      if (overridePrice) {
          exitPrice = overridePrice;
          const priceDiff = p.side === PositionSide.LONG 
              ? exitPrice - p.entryPrice 
              : p.entryPrice - exitPrice;
          pnl = priceDiff * p.amount;
          // Update percentage for accurate logging
          if (p.entryPrice > 0) {
              p.unrealizedPnLPercentage = (priceDiff / p.entryPrice) * 100;
          }
      }

      // FIX: Ensure hedge positions NEVER auto-reopen, even if simAutoReopen is somehow true
      const shouldReopen = !p.isHedged && p.simAutoReopen && reason !== 'MANUAL' && reason !== 'REMOVE' && reason !== 'BATCH_CLOSE';
      
      this.account.marginBalance += pnl; 
      this.positions.splice(idx, 1);
      this.addLog(pnl >= 0 ? 'SUCCESS' : 'WARNING', `Closed ${symbol} (${side}): ${pnl.toFixed(2)} U`);
      const closeLog: TradeLog = {
          entry_id: p.entryId!,
          symbol: p.symbol,
          direction: p.side,
          quantity: p.amount,
          cost_usdt: (p.amount * p.entryPrice),
          entry_price: p.entryPrice,
          exit_price: exitPrice,
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
      this.emitUpdate();
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
          // FIX: Only update auto-reopen state for MAIN positions. 
          // Hedge positions must NEVER auto-reopen.
          if (!p.isHedged) {
              p.simAutoReopen = newAutoReopenState;
          }
      });
      
      this.emitUpdate();
      if (!newAutoReopenState) {
          this.addLog('WARNING', `⛔ (平仓后停止) 已启动: 所有当前仓位平仓后将停止，不再自动开仓。`);
          if (this.settings.audio.enabled) audioService.speak('已启动平仓后停止模式');
      } else {
          this.addLog('SUCCESS', `♻️ (循环运行) 已恢复: 所有当前仓位平仓后将自动继续开仓。`);
          if (this.settings.audio.enabled) audioService.speak('已恢复循环运行模式');
      }
  }
}
