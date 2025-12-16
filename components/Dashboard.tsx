import React, { useState, useMemo, useRef } from 'react';
import { 
    Activity, TrendingUp, TrendingDown, DollarSign, X, 
    BarChart2, Shield, AlertTriangle, Zap, Terminal, List, 
    Play, Pause, Trash2, History, MousePointer2 
} from 'lucide-react';
import { AccountData, Position, PositionSide } from '../types';

interface DashboardProps {
  account: AccountData;
  positions: Position[];
  onRowLongPress: (symbol: string) => void;
  onShowHistory: (symbol: string) => void;
  hasHistory: (symbol: string) => boolean;
  onClearPositions: () => void;
  onClosePosition: (symbol: string, side: PositionSide) => void;
  onDeletePosition: (symbol: string, side: PositionSide) => void;
  onBatchClose: () => void;
  onOpenChart: (symbol: string) => void;
  onOpenLogs: () => void;
  onOpenTradeModal: () => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onShowSymbolTradeLogs: (symbol: string) => void;
  onEmergencyHedge: () => void;
  onOpenScanner: () => void;
  onUpdateLeverage?: (symbol: string, side: PositionSide, leverage: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  account,
  positions,
  onRowLongPress,
  onShowHistory,
  hasHistory,
  onClearPositions,
  onClosePosition,
  onDeletePosition,
  onBatchClose,
  onOpenChart,
  onOpenLogs,
  onOpenTradeModal,
  isSimulating,
  onToggleSimulation,
  onShowSymbolTradeLogs,
  onEmergencyHedge,
  onOpenScanner,
  onUpdateLeverage
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'desc' });
  const pressTimer = useRef<any>(null);

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'desc';
      if (sortConfig.key === key && sortConfig.direction === 'desc') {
          direction = 'asc';
      }
      setSortConfig({ key, direction });
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      // 1. Hedged Priority: Pin to top
      if (a.isHedged && !b.isHedged) return -1;
      if (!a.isHedged && b.isHedged) return 1;

      // 2. Group Hedged Pairs: If both are hedged, sort by Symbol to keep pairs together
      if (a.isHedged && b.isHedged) {
          if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
      }

      // 3. User Selected Sort
      if (sortConfig.key) {
          let valA = 0;
          let valB = 0;

          if (sortConfig.key === 'amount') {
              valA = a.amount * a.markPrice;
              valB = b.amount * b.markPrice;
          } else if (sortConfig.key === 'pnl') {
              valA = isNaN(a.unrealizedPnLPercentage) ? -9999 : a.unrealizedPnLPercentage;
              valB = isNaN(b.unrealizedPnLPercentage) ? -9999 : b.unrealizedPnLPercentage;
          }
          
          if (valA !== valB) {
              return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
          }
      }
      return (b.amount * b.markPrice) - (a.amount * a.markPrice);
    });
  }, [positions, sortConfig]);

  // Calculate Stats
  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalPnLPercentage = account.marginBalance > 0 ? (totalPnL / account.marginBalance) * 100 : 0;
  
  const walletBalance = account.marginBalance;
  const marginBalance = account.totalBalance;
  const calculatedMarginRatio = walletBalance > 0 ? (marginBalance / walletBalance * 100) : 0;
  
  // Counts
  const longCount = positions.filter(p => p.side === PositionSide.LONG).length;
  const shortCount = positions.filter(p => p.side === PositionSide.SHORT).length;

  // Logic: Green if looping (some positions have autoReopen !== false), Red if stopping (all positions are false)
  // Default to Green (Looping) if no positions or state is ambiguous
  const isLooping = positions.length === 0 || positions.some(p => p.simAutoReopen !== false);

  // Long Press Handlers
  const handlePressStart = (symbol: string) => {
      pressTimer.current = setTimeout(() => {
          onShowSymbolTradeLogs(symbol);
      }, 2000); // 2 seconds threshold
  };

  const handlePressEnd = () => {
      if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
      }
  };

  // UPDATED: Strict naming logic
  const getPositionTypeLabel = (pos: Position) => {
      // If it has a mainPositionId, it's a child/hedge position created by the system
      if (pos.mainPositionId) return '防爆仓位';
      // Otherwise it's an original position
      return '原仓位';
  };
  
  const currentTimeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Top Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
          
          {/* Consolidated Stats Box (3 Columns Wide) */}
          <div className="col-span-2 md:col-span-3 bg-slate-900 rounded border border-slate-800 p-2 flex items-center">
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 h-full">
                  
                  {/* 1. Wallet Balance */}
                  <div className="flex flex-col justify-center pl-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">钱包余额 (Wallet)</span>
                      <div className="flex items-baseline gap-1">
                          <span className="text-xl font-mono text-slate-300 font-bold">{walletBalance.toFixed(0)}</span>
                          <span className="text-[10px] text-slate-600">USDT</span>
                      </div>
                  </div>

                  {/* 2. Margin Balance */}
                  <div className="flex flex-col justify-center pl-2 md:border-l border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">保证金余额 (Margin)</span>
                      <div className="flex items-baseline gap-1">
                          <span className="text-xl font-mono text-white font-bold">{marginBalance.toFixed(0)}</span>
                          <span className="text-[10px] text-slate-600">USDT</span>
                      </div>
                  </div>

                  {/* 3. Margin Ratio (Calculated) */}
                  <div className="flex flex-col justify-center pl-2 border-l border-slate-800 md:border-l">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">保证金率 (Ratio)</span>
                      <div className="flex items-baseline gap-1">
                          <span className={`text-xl font-mono font-bold ${calculatedMarginRatio >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {calculatedMarginRatio.toFixed(0)}%
                          </span>
                      </div>
                  </div>

                  {/* 4. Unrealized PnL */}
                  <div className="flex flex-col justify-center pl-2 border-l border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">未实现盈亏 (PnL)</span>
                      <div className={`flex items-baseline gap-1 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          <span className="text-xl font-mono font-bold">{totalPnL > 0 ? '+' : ''}{totalPnL.toFixed(0)}</span>
                          <span className="text-[10px] opacity-80">({totalPnLPercentage > 0 ? '+' : ''}{totalPnLPercentage.toFixed(1)}%)</span>
                      </div>
                  </div>
              </div>
          </div>

          {/* Controls Box (1 Column Wide) */}
          <div className="col-span-2 md:col-span-1 bg-slate-900 p-2 rounded border border-slate-800 flex flex-col justify-center gap-2">
               <div className="flex gap-2">
                   <button 
                       onClick={onToggleSimulation}
                       className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${isSimulating ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                   >
                       {isSimulating ? <Pause size={12}/> : <Play size={12}/>}
                       {isSimulating ? '暂停 (PAUSE)' : '启动 (START)'}
                   </button>
                   <button 
                       onClick={onBatchClose}
                       className="flex-1 py-1.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/50 transition-colors flex items-center justify-center gap-1"
                   >
                       <Trash2 size={12}/> 一键清仓
                   </button>
               </div>
               <div className="flex gap-2">
                   <button 
                       onClick={onEmergencyHedge}
                       className={`flex-1 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                           isLooping 
                           ? 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-400 border-emerald-500/30' 
                           : 'bg-red-900/40 hover:bg-red-900/80 text-red-400 border-red-500/30'
                       }`}
                   >
                       <Shield size={12}/> {isLooping ? '循环运行' : '平仓后停止'}
                   </button>
                   <button 
                       onClick={onOpenTradeModal}
                       className="flex-1 py-1.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center justify-center gap-1"
                   >
                       <List size={12}/> 交易日志
                   </button>
               </div>
          </div>
      </div>
      
      {/* Position Summary Info */}
      <div className="flex items-center px-4 py-1 gap-4 text-[10px] text-slate-400 font-mono select-none">
          <div className="flex items-center gap-1.5">
              <span>运行币种:</span>
              <span className="text-white font-bold bg-slate-800 px-1.5 rounded border border-slate-700">{positions.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
              <span>多单:</span>
              <span className="text-emerald-400 font-bold bg-emerald-900/20 px-1.5 rounded border border-emerald-500/20">{longCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
              <span>空单:</span>
              <span className="text-red-400 font-bold bg-red-900/20 px-1.5 rounded border border-red-500/20">{shortCount}</span>
          </div>
      </div>

      {/* Positions Table Header */}
      <div className="flex items-center px-4 py-2 bg-slate-900 rounded-t border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase">
          <div className="w-1/4 md:w-1/6 cursor-pointer hover:text-white flex items-center gap-1" onClick={() => handleSort('symbol')}>
              交易对 (Symbol)
          </div>
          <div className="w-1/4 md:w-1/6 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1" onClick={() => handleSort('amount')}>
              持仓价值 (Value)
          </div>
          <div className="hidden md:block w-1/6 text-right">开仓价 (Entry) / 时间</div>
          <div className="hidden md:block w-1/6 text-right">标记价 / 防爆仓价格</div>
          <div className="w-1/4 md:w-1/6 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1" onClick={() => handleSort('pnl')}>
              盈亏 / 比例 / 回调
          </div>
          <div className="w-1/4 md:w-1/6 text-right">操作 (Action)</div>
      </div>

      {/* Positions List */}
      <div className="flex-1 overflow-y-auto bg-slate-900/50 rounded-b border border-t-0 border-slate-800 custom-scrollbar">
          {sortedPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                  <Activity size={32} className="opacity-20"/>
                  <span className="text-xs">暂无持仓 (No Positions)</span>
              </div>
          ) : (
              sortedPositions.map((p) => {
                  const pnl = p.unrealizedPnL;
                  const pnlPercent = p.unrealizedPnLPercentage;
                  const isProfit = pnl >= 0;
                  const posValue = p.amount * p.markPrice;
                  
                  // Calculate Callback (Retracement) from Max Profit
                  const maxPnL = p.maxPnLPercent || p.unrealizedPnLPercentage;
                  const callbackRatio = Math.max(0, maxPnL - p.unrealizedPnLPercentage);
                  
                  const positionTypeLabel = getPositionTypeLabel(p);

                  return (
                      <div 
                        key={`${p.symbol}-${p.side}`} 
                        className={`flex items-center px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${p.isHedged ? 'bg-indigo-900/10' : ''}`}
                        onTouchStart={() => handlePressStart(p.symbol)}
                        onTouchEnd={handlePressEnd}
                        onMouseDown={() => handlePressStart(p.symbol)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                      >
                          {/* 1. Symbol & Side (Horizontal) */}
                          <div className="w-1/4 md:w-1/6 flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-sm text-slate-200">{p.symbol.replace('USDT','')}</span>
                                  {p.isHedged && <Shield size={10} className="text-indigo-400" />}
                              </div>
                              <div className={`text-[10px] font-bold flex flex-col items-start ${p.side === PositionSide.LONG ? 'text-emerald-500' : 'text-red-500'}`}>
                                  <div className="flex items-center gap-1">
                                      {p.side === PositionSide.LONG ? '做多' : '做空'} 
                                      <button 
                                          onClick={() => onUpdateLeverage && onUpdateLeverage(p.symbol, p.side, p.leverage)}
                                          className="px-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded text-slate-400 font-normal cursor-pointer transition-colors"
                                          title="点击修改杠杆倍数"
                                      >
                                          {p.leverage}x
                                      </button>
                                      {/* UPDATED: Dynamic Styling for Hedge Label */}
                                      <span className={`px-1 rounded border ${
                                          positionTypeLabel === '防爆仓位' 
                                          ? 'bg-purple-900/50 text-purple-300 border-purple-500/30' 
                                          : 'bg-slate-800 text-slate-500 border-slate-700'
                                      }`}>
                                          {positionTypeLabel}
                                      </span>
                                  </div>
                              </div>
                          </div>

                          {/* 2. Value Only (No Quantity) (Horizontal) */}
                          <div className="w-1/4 md:w-1/6 text-right flex items-center justify-end">
                              <span className="text-sm text-slate-300 font-mono">{posValue.toFixed(0)} U</span>
                          </div>

                          {/* 3. Entry Price & Time (Desktop) (Horizontal) */}
                          <div className="hidden md:flex w-1/6 text-right items-center justify-end gap-2 font-mono text-sm text-slate-400">
                              <span>{p.entryPrice.toFixed(4)}</span>
                              <span className="text-[10px] text-slate-600 font-mono border-l border-slate-700 pl-2">
                                  {new Date(p.entryTime || Date.now()).toLocaleTimeString()}
                              </span>
                          </div>

                          {/* 4. Mark Price (Desktop) (Horizontal) */}
                          <div className="hidden md:flex w-1/6 text-right items-center justify-end font-mono text-sm text-white">
                              <span>{p.markPrice.toFixed(4)}</span>
                          </div>

                          {/* 5. PnL (Horizontal) */}
                          <div className="w-1/4 md:w-1/6 text-right flex items-center justify-end gap-1.5 flex-wrap md:flex-nowrap">
                              <span className={`font-bold font-mono text-sm ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {isProfit ? '+' : ''}{pnl.toFixed(2)}
                              </span>
                              <span className="text-slate-600 hidden md:inline">/</span>
                              <span className={`text-xs ${pnlPercent > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                              </span>
                              {callbackRatio > 0 && (
                                  <>
                                      <span className="text-slate-600">/</span>
                                      <span className="text-[10px] text-amber-500">
                                          -{callbackRatio.toFixed(1)}%
                                      </span>
                                  </>
                              )}
                          </div>

                          {/* 6. Action (Horizontal) */}
                          <div className="w-1/4 md:w-1/6 text-right flex items-center justify-end gap-1">
                               <button 
                                  onClick={() => onShowSymbolTradeLogs(p.symbol)}
                                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400 transition-colors"
                                  title="交易记录"
                               >
                                  <History size={14}/>
                               </button>
                               <button 
                                  onClick={() => onOpenChart(p.symbol)}
                                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                  title="K线图"
                               >
                                  <BarChart2 size={14}/>
                               </button>
                               <button 
                                  onClick={() => onClosePosition(p.symbol, p.side)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-red-900/50 border border-slate-700 hover:border-red-500/50 rounded text-slate-300 hover:text-red-400 text-xs transition-colors ml-1"
                                  title="平仓"
                               >
                                  平仓
                               </button>
                          </div>
                      </div>
                  );
              })
          )}
      </div>
    </div>
  );
};

export default Dashboard;