
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    Activity, TrendingUp, TrendingDown, DollarSign, X, 
    BarChart2, Shield, AlertTriangle, Zap, Terminal, List, 
    Play, Pause, Trash2, History, MousePointer2, AlertCircle,
    ChevronUp, ChevronDown, Repeat
} from 'lucide-react';
import { AccountData, Position, PositionSide, TradeLog } from '../types';

interface DashboardProps {
  account: AccountData;
  positions: Position[];
  tradeLogs: TradeLog[];
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
  tradeLogs,
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
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
    key: 'pnl', 
    direction: 'desc' 
  });
  
  const [confirmClear, setConfirmClear] = useState(false);
  const pressTimer = useRef<any>(null);
  const confirmTimeoutRef = useRef<any>(null);

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'desc';
      if (sortConfig.key === key) {
          direction = sortConfig.direction === 'desc' ? 'asc' : 'desc';
      } else {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (a.isHedged !== b.isHedged) {
          return a.isHedged ? -1 : 1;
      }
      if (a.isHedged && b.isHedged && a.symbol !== b.symbol) {
          return a.symbol.localeCompare(b.symbol);
      }
      let valA: any = 0;
      let valB: any = 0;
      const key = sortConfig.key;
      const direction = sortConfig.direction;

      if (key === 'symbol') {
          valA = a.symbol;
          valB = b.symbol;
      } else if (key === 'amount') {
          valA = a.amount * a.markPrice;
          valB = b.amount * b.markPrice;
      } else if (key === 'pnl') {
          valA = isNaN(a.unrealizedPnLPercentage) ? -9999 : a.unrealizedPnLPercentage;
          valB = isNaN(b.unrealizedPnLPercentage) ? -9999 : b.unrealizedPnLPercentage;
      } else if (key === 'entryTime') {
          valA = a.entryTime || 0;
          valB = b.entryTime || 0;
      }

      if (valA === valB) return 0;
      if (typeof valA === 'string') {
          return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [positions, sortConfig]);

  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalPnLPercentage = account.marginBalance > 0 ? (totalPnL / account.marginBalance) * 100 : 0;
  const walletBalance = account.totalBalance;
  const availableMargin = account.marginBalance;
  const calculatedMarginRatio = walletBalance > 0 ? (availableMargin / walletBalance * 100) : 0;
  const totalPositionValue = positions.reduce((sum, p) => sum + (p.amount * p.markPrice), 0);
  const distinctCoinsCount = new Set(positions.map(p => p.symbol)).size;

  const totalDebt = positions.reduce((sum, p) => sum + (p.cumulativeHedgeLoss || 0), 0);
  const totalHedgeProfit = useMemo(() => {
    return tradeLogs
      .filter(log => log.status === 'CLOSED' && log.exit_reason && (
        log.exit_reason.includes('WIN') || 
        log.exit_reason.includes('PROFIT') ||
        log.exit_reason.includes('RECOVERY')
      ))
      .reduce((sum, log) => sum + (log.profit_usdt || 0), 0);
  }, [tradeLogs]);

  const isLooping = positions.length === 0 || positions.some(p => p.simAutoReopen !== false);

  const handleBatchCloseWithConfirm = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => setConfirmClear(false), 3000);
    } else {
      onBatchClose();
      setConfirmClear(false);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const handlePressStart = (symbol: string) => {
      pressTimer.current = setTimeout(() => {
          onShowSymbolTradeLogs(symbol);
      }, 2000); 
  };

  const handlePressEnd = () => {
      if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
      }
  };

  const getPositionTypeLabel = (pos: Position) => {
      if (pos.mainPositionId) return '防爆仓位';
      if (pos.cumulativeHedgeLoss && pos.cumulativeHedgeLoss > 0) return '🛡️ 债务追偿中';
      return '原仓位';
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <div className="w-3 h-3 opacity-20"><ChevronDown size={12}/></div>;
    return sortConfig.direction === 'asc' 
        ? <ChevronUp size={12} className="text-emerald-400" /> 
        : <ChevronDown size={12} className="text-emerald-400" />;
  };
  
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 shrink-0">
          <div className="md:col-span-4 bg-slate-900 rounded border border-slate-800 p-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="flex flex-col justify-center pl-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">钱包余额 / 可用保证金</span>
                      <div className="flex items-baseline gap-1">
                          <span className="text-xl font-mono text-white font-bold">{walletBalance.toFixed(0)}</span>
                          <span className="text-slate-700 mx-1">/</span>
                          <span className="text-lg font-mono text-slate-400">{availableMargin.toFixed(0)}</span>
                          <span className="text-[10px] text-slate-600 ml-1">U</span>
                      </div>
                  </div>
                  <div className="flex flex-col justify-center pl-2 border-l border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">可用保证金率 (Ratio)</span>
                      <div className="flex items-baseline gap-1">
                          <span className={`text-xl font-mono font-bold ${calculatedMarginRatio >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {calculatedMarginRatio.toFixed(0)}%
                          </span>
                      </div>
                  </div>
                  <div className="flex flex-col justify-center pl-2 border-l border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">未实现盈亏 / 总持仓价值</span>
                      <div className="flex items-center gap-3">
                          <div className={`flex items-baseline gap-1 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              <span className="text-xl font-mono font-bold">{totalPnL > 0 ? '+' : ''}{totalPnL.toFixed(0)}</span>
                              <span className="text-[10px] opacity-80">({totalPnLPercentage > 0 ? '+' : ''}{totalPnLPercentage.toFixed(1)}%)</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono border-l border-slate-800 pl-3">
                              <div className="flex flex-col leading-tight">
                                <span className="text-slate-400 font-bold">总额:</span>
                                <span className="text-white font-bold">{totalPositionValue.toFixed(0)} U</span>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="flex flex-col justify-center pl-2 border-l border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">总负债 / 总浮赢 (对冲)</span>
                      <div className="flex items-baseline gap-2">
                          <span className="text-lg font-mono text-red-500 font-bold">-{totalDebt.toFixed(0)}</span>
                          <span className="text-slate-700">/</span>
                          <span className="text-lg font-mono text-emerald-400 font-bold">+{totalHedgeProfit.toFixed(0)}</span>
                          <span className="text-[10px] text-slate-600">U</span>
                      </div>
                  </div>
              </div>
          </div>
          <div className="bg-slate-900 p-2 rounded border border-slate-800 flex flex-col justify-center gap-2">
               <div className="flex gap-2">
                   <button onClick={onToggleSimulation} className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${isSimulating ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
                       {isSimulating ? <Pause size={12}/> : <Play size={12}/>} {isSimulating ? '暂停' : '启动'}
                   </button>
                   <button onClick={handleBatchCloseWithConfirm} className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1 border ${confirmClear ? 'bg-red-600 hover:bg-red-700 text-white border-red-400 animate-pulse' : 'bg-slate-800 hover:bg-red-900/50 text-slate-400 border-slate-700'}`}>
                       {confirmClear ? <AlertCircle size={12}/> : <Trash2 size={12}/>} {confirmClear ? '确认?' : '清仓'}
                   </button>
               </div>
               <div className="flex gap-2">
                   <button onClick={onEmergencyHedge} className={`flex-1 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${isLooping ? 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-400 border-emerald-500/30' : 'bg-red-900/40 hover:bg-red-900/80 text-red-400 border-red-500/30'}`}>
                       <Shield size={12}/> {isLooping ? '循环' : '停止'}
                   </button>
                   <button onClick={onOpenTradeModal} className="flex-1 py-1.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1">
                       <List size={12}/> 日志
                   </button>
               </div>
          </div>
      </div>
      
      <div className="flex items-center px-4 py-1 gap-4 text-[10px] text-slate-400 font-mono select-none">
          <div className="flex items-center gap-1.5">
              <span>运行币种:</span>
              <span className="text-white font-bold bg-slate-800 px-1.5 rounded border border-slate-700 ml-1">{distinctCoinsCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
              <span>仓位总数:</span>
              <span className="text-white font-bold bg-slate-800 px-1.5 rounded border border-slate-700 ml-1">{positions.length}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
              <span>排序方式:</span>
              <span className="text-emerald-400 font-bold">{sortConfig.key === 'pnl' ? '盈亏比例' : sortConfig.key === 'entryTime' ? '开仓时间' : '交易对'} ({sortConfig.direction === 'desc' ? '降序' : '升序'})</span>
          </div>
      </div>

      <div className="flex items-center px-4 py-2 bg-slate-900 rounded-t border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase">
          <div className="w-1/4 md:w-1/6 cursor-pointer hover:text-white flex items-center gap-1 transition-colors select-none" onClick={() => handleSort('symbol')}>
              交易对 {renderSortIcon('symbol')}
          </div>
          <div className="w-1/4 md:w-1/6 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1 transition-colors select-none" onClick={() => handleSort('amount')}>
              持仓价值 {renderSortIcon('amount')}
          </div>
          <div className="hidden md:flex w-1/6 text-right cursor-pointer hover:text-white items-center justify-end gap-1 transition-colors select-none" onClick={() => handleSort('entryTime')}>
              开仓价 / 时间 {renderSortIcon('entryTime')}
          </div>
          <div className="hidden md:block w-1/6 text-right">标记价</div>
          <div className="w-1/4 md:w-1/6 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1 transition-colors select-none" onClick={() => handleSort('pnl')}>
              盈亏 / 比例 / 极值 / 回调 {renderSortIcon('pnl')}
          </div>
          <div className="w-1/4 md:w-1/6 text-right">操作</div>
      </div>

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
                  const positionTypeLabel = getPositionTypeLabel(p);
                  const hasDebt = p.cumulativeHedgeLoss && p.cumulativeHedgeLoss > 0;
                  const hasProfits = p.cumulativeHedgeProfit && p.cumulativeHedgeProfit > 0;
                  
                  // Calculate Max Profit & Callback
                  const maxPnL = p.maxPnLPercent !== undefined ? p.maxPnLPercent : pnlPercent;
                  const callbackRatio = maxPnL - pnlPercent;

                  return (
                      <div 
                        key={`${p.symbol}-${p.side}`} 
                        className={`flex items-center px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${p.isHedged ? 'bg-indigo-900/10' : ''}`}
                        onMouseDown={() => handlePressStart(p.symbol)}
                        onMouseUp={handlePressEnd}
                      >
                          <div className="w-1/4 md:w-1/6 flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-sm text-slate-200">{p.symbol.replace('USDT','')}</span>
                                  {p.isHedged && <Shield size={10} className="text-indigo-400" />}
                              </div>
                              <div className={`text-[10px] font-bold flex flex-col items-start ${p.side === PositionSide.LONG ? 'text-emerald-500' : 'text-red-500'}`}>
                                  <div className="flex items-center gap-1">
                                      {p.side === PositionSide.LONG ? '多' : '空'} 
                                      <button onClick={() => onUpdateLeverage?.(p.symbol, p.side, p.leverage)} className="px-1 bg-slate-800 border border-slate-700 rounded text-slate-400 font-normal">
                                          {p.leverage}x
                                      </button>
                                      <span className={`px-1 rounded border ${positionTypeLabel.includes('债务') ? 'bg-orange-900/30 text-orange-400 border-orange-500/30 animate-pulse' : positionTypeLabel === '防爆仓位' ? 'bg-purple-900/50 text-purple-300 border-purple-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                          {positionTypeLabel}
                                      </span>
                                  </div>
                                  {/* Martingale Badge */}
                                  {p.isMartinActive && !p.isHedged && (
                                      <div className="mt-1 flex items-center gap-1 text-[9px] text-pink-400 border border-pink-500/30 bg-pink-900/20 px-1 rounded">
                                          <Repeat size={8} /> 
                                          <span>马丁 M-{p.martinStep || 0}</span>
                                      </div>
                                  )}
                              </div>
                          </div>

                          <div className="w-1/4 md:w-1/6 text-right flex items-center justify-end font-mono">
                              <span className="text-sm text-slate-300">{posValue.toFixed(0)} U</span>
                          </div>

                          <div className="hidden md:flex w-1/6 text-right items-center justify-end gap-2 font-mono text-sm text-slate-400">
                              <span>{p.entryPrice.toFixed(4)}</span>
                              <span className="text-[10px] text-slate-600 border-l border-slate-700 pl-2">
                                  {new Date(p.entryTime || Date.now()).toLocaleTimeString()}
                              </span>
                          </div>

                          <div className="hidden md:flex w-1/6 text-right items-center justify-end font-mono text-sm text-white">
                              <span>{p.markPrice.toFixed(4)}</span>
                          </div>

                          <div className="w-1/4 md:w-1/6 text-right flex flex-col items-end justify-center">
                              <div className="flex items-center justify-end flex-wrap gap-1 font-mono text-xs leading-tight">
                                  <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {isProfit ? '+' : ''}{pnl.toFixed(2)}
                                  </span>
                                  <span className="text-slate-600">/</span>
                                  <span className={`${pnlPercent > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                      {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                  </span>
                                  <span className="text-slate-600">/</span>
                                  <span className="text-slate-400" title="最高">
                                      M:{maxPnL.toFixed(2)}%
                                  </span>
                                  <span className="text-slate-600">/</span>
                                  <span className="text-amber-500" title="回调">
                                      C:{callbackRatio.toFixed(2)}%
                                  </span>
                              </div>

                              <div className="flex gap-2 mt-0.5 justify-end">
                                {hasProfits && (
                                    <div className="text-[9px] font-bold text-emerald-500 flex items-center gap-1 bg-emerald-900/10 px-1 rounded">
                                        <span>累计盈利: +{p.cumulativeHedgeProfit?.toFixed(2)} U</span>
                                    </div>
                                )}
                                {hasDebt && (
                                    <div className="text-[9px] font-bold text-red-500 flex items-center gap-1 bg-red-900/10 px-1 rounded">
                                        <span>累计债务: -{p.cumulativeHedgeLoss?.toFixed(2)} U</span>
                                    </div>
                                )}
                              </div>
                          </div>

                          <div className="w-1/4 md:w-1/6 text-right flex items-center justify-end gap-1">
                               <button onClick={() => onShowSymbolTradeLogs(p.symbol)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 transition-colors">
                                  <History size={14}/>
                               </button>
                               <button onClick={() => onOpenChart(p.symbol)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 transition-colors">
                                  <BarChart2 size={14}/>
                                </button>
                               <button onClick={() => onClosePosition(p.symbol, p.side)} className="px-2 py-1 bg-slate-800 hover:bg-red-900/50 border border-slate-700 rounded text-slate-300 hover:text-red-400 text-xs transition-colors ml-1">
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
