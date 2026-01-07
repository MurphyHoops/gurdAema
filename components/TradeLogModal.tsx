
import React, { useState, useMemo } from 'react';
import { X, FileText, Activity, Code, Clock, ArrowRight, Search, TrendingUp, TrendingDown, AlertCircle, Calculator, Link, Shield, PieChart, BarChart2, History, Filter, RotateCcw, Zap, Layers } from 'lucide-react';
import { TradeLog, SystemEvent, PositionSide, Position } from '../types';

interface Props {
  tradeLogs: TradeLog[];
  positions: Position[]; 
  systemEvents: SystemEvent[];
  onClose: () => void;
  initialSearch?: string; 
}

type FilterType = 'ALL' | 'OPEN' | 'WIN' | 'LOSS' | 'RECOVERY' | 'HEDGE' | 'MARTIN';

const TradeLogModal: React.FC<Props> = ({ tradeLogs, positions, systemEvents, onClose, initialSearch = '' }) => {
  const [selectedLog, setSelectedLog] = useState<TradeLog | null>(null); 
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');

  const groupedLogs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      
      // 1. Base Filter (Search Text)
      let filtered = tradeLogs.filter(log => 
          log.symbol.toLowerCase().includes(term) ||
          log.entry_id.toLowerCase().includes(term)
      );

      // 2. Category Filter
      if (activeFilter !== 'ALL') {
          filtered = filtered.filter(log => {
              if (activeFilter === 'OPEN') return log.status === 'OPEN';
              if (activeFilter === 'WIN') return log.status === 'CLOSED' && (log.profit_usdt || 0) > 0;
              if (activeFilter === 'LOSS') return log.status === 'CLOSED' && (log.profit_usdt || 0) < 0;
              if (activeFilter === 'HEDGE') return log.is_hedge;
              
              if (activeFilter === 'RECOVERY') {
                  const r = log.exit_reason || '';
                  return r.includes('RECOVERY') || r.includes('WIN_ALL') || r.includes('COVER') || r.includes('VICTORY') || r.includes('SAFE_CLR');
              }

              if (activeFilter === 'MARTIN') {
                  const r = log.exit_reason || '';
                  const s = log.signal_details?.type || '';
                  return r.includes('MARTIN') || s.includes('MARTINGALE');
              }
              return true;
          });
      }

      // 3. Sort
      const sorted = filtered.sort((a, b) => {
          const timeA = a.status === 'CLOSED' ? (a.exit_timestamp || a.entry_timestamp) : a.entry_timestamp;
          const timeB = b.status === 'CLOSED' ? (b.exit_timestamp || b.entry_timestamp) : b.entry_timestamp;
          return timeB - timeA;
      });

      // 4. Grouping Logic (Keep Safe Clear pairs together)
      const result: TradeLog[] = [];
      const processedLogs = new Set<TradeLog>();

      for (const log of sorted) {
          if (processedLogs.has(log)) continue;

          // Group logic for Safe Clear events
          const isSafeClear = log.exit_reason?.includes('SAFE_CLR');
          
          if (isSafeClear) {
              const pair = sorted.find(l => 
                  !processedLogs.has(l) &&
                  l !== log && 
                  l.symbol === log.symbol &&
                  l.exit_reason?.includes('SAFE_CLR') &&
                  (l.entry_id === log.entry_id || Math.abs((l.exit_timestamp || 0) - (log.exit_timestamp || 0)) < 1000)
              );

              if (pair) {
                  result.push(log);
                  result.push(pair);
                  processedLogs.add(log);
                  processedLogs.add(pair);
                  continue;
              }
          }

          result.push(log);
          processedLogs.add(log);
      }

      return result;
  }, [tradeLogs, searchTerm, activeFilter]);

  // Statistics Calculation
  const stats = useMemo(() => {
      const closedLogs = groupedLogs.filter(l => l.status === 'CLOSED');
      const totalPnL = closedLogs.reduce((acc, l) => acc + (l.profit_usdt || 0), 0);
      const winCount = closedLogs.filter(l => (l.profit_usdt || 0) > 0).length;
      const totalCount = closedLogs.length;
      const winRate = totalCount > 0 ? (winCount / totalCount) * 100 : 0;
      
      return { totalPnL, winRate, count: groupedLogs.length };
  }, [groupedLogs]);

  const renderJson = (data: any) => {
      return (
          <pre className="bg-slate-950 p-3 rounded border border-slate-700 text-[10px] font-mono text-emerald-300 overflow-x-auto">
              {JSON.stringify(data, null, 2)}
          </pre>
      );
  };

  const getDuration = (start: number, end?: number) => {
      if (!end) return '-';
      const ms = end - start;
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m ${sec % 60}s`;
      const hr = Math.floor(min / 60);
      return `${hr}h ${min % 60}m`;
  };

  const FilterChip = ({ type, label, icon: Icon, colorClass }: any) => (
      <button 
          onClick={() => setActiveFilter(type)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
              activeFilter === type 
              ? `${colorClass} ring-1 ring-offset-1 ring-offset-slate-900 ring-current` 
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
          }`}
      >
          {Icon && <Icon size={12} />}
          {label}
      </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col gap-4 p-4 border-b border-slate-800 bg-slate-950 rounded-t-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-900/30 rounded-full text-indigo-400 border border-indigo-500/30">
                        <FileText size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">交易日志 (Trade Log)</h2>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>共 {tradeLogs.length} 条记录</span>
                            <span className="text-slate-700">|</span>
                            <span>支持多维筛选分析</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="搜索币种/ID..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-full pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 w-48"
                        />
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
                <FilterChip type="ALL" label="全部" icon={Layers} colorClass="bg-slate-700 text-white border-slate-500" />
                <FilterChip type="OPEN" label="持仓中" icon={Activity} colorClass="bg-cyan-900/40 text-cyan-400 border-cyan-500/30" />
                <FilterChip type="WIN" label="盈利" icon={TrendingUp} colorClass="bg-emerald-900/40 text-emerald-400 border-emerald-500/30" />
                <FilterChip type="LOSS" label="亏损" icon={TrendingDown} colorClass="bg-red-900/40 text-red-400 border-red-500/30" />
                <FilterChip type="RECOVERY" label="解套/回血" icon={RotateCcw} colorClass="bg-blue-900/40 text-blue-400 border-blue-500/30" />
                <FilterChip type="HEDGE" label="防爆对冲" icon={Shield} colorClass="bg-indigo-900/40 text-indigo-400 border-indigo-500/30" />
                <FilterChip type="MARTIN" label="马丁" icon={Zap} colorClass="bg-pink-900/40 text-pink-400 border-pink-500/30" />
            </div>

            {/* Stats Summary Bar */}
            <div className="flex items-center gap-6 px-4 py-2 bg-slate-900/50 rounded border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-slate-500">当前筛选:</span>
                    <span className="text-white font-bold">{stats.count} 笔</span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500">累计盈亏:</span>
                    <span className={`font-mono font-bold text-sm ${stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stats.totalPnL > 0 ? '+' : ''}{stats.totalPnL.toFixed(2)} U
                    </span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500">胜率 (Win Rate):</span>
                    <span className={`font-mono font-bold ${stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {stats.winRate.toFixed(1)}%
                    </span>
                </div>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
            {/* Left Panel - LIST */}
            <div className={`flex-1 overflow-y-auto ${selectedLog ? 'w-2/3 border-r border-slate-800 hidden md:block' : 'w-full'}`}>
                 <table className="w-full text-left text-sm text-slate-400">
                     <thead className="text-xs uppercase bg-slate-800/50 text-slate-500 sticky top-0 backdrop-blur-md z-10">
                         <tr>
                             <th className="px-4 py-3">交易时间 / 类型</th>
                             <th className="px-4 py-3">交易对</th>
                             <th className="px-4 py-3">方向/杠杆</th>
                             <th className="px-4 py-3">开仓价值 (U)</th>
                             <th className="px-4 py-3">开仓价</th>
                             <th className="px-4 py-3">实时价/平仓价</th>
                             <th className="px-4 py-3">盈亏(U) / ROE%</th>
                             <th className="px-4 py-3">状态/原因</th>
                             <th className="px-4 py-3 text-right">操作</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                         {groupedLogs.map((log, idx) => {
                             const isSafeClear = log.exit_reason?.includes('SAFE_CLR');
                             const prevLog = groupedLogs[idx - 1];
                             const nextLog = groupedLogs[idx + 1];
                             const isGrouped = isSafeClear && (
                                 (prevLog?.entry_id === log.entry_id) || 
                                 (nextLog?.entry_id === log.entry_id)
                             );
                             const uniqueKey = `${log.entry_id}-${log.status}-${log.exit_timestamp || log.entry_timestamp}`;
                             
                             const activePos = positions.find(p => p.entryId === log.entry_id);
                             const currentPrice = activePos ? activePos.markPrice : (log.exit_price || 0);
                             const realizedPnL = log.profit_usdt || 0;
                             const realizedPnLPct = log.profit_percent || 0;

                             return (
                                 <tr 
                                    key={uniqueKey} 
                                    className={`
                                        transition-colors
                                        ${selectedLog === log ? 'bg-indigo-900/30' : 'hover:bg-slate-800/30'}
                                        ${isGrouped ? 'bg-indigo-900/10' : ''}
                                        ${log.is_hedge ? 'bg-blue-900/10' : ''} 
                                    `}
                                 >
                                     <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-300 relative">
                                         {isGrouped && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500/50"></div>}
                                         {log.is_hedge && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/50"></div>}
                                         {log.status === 'CLOSED' ? (
                                             <div className="flex flex-col">
                                                 <span className="font-bold text-red-300">
                                                     {new Date(log.exit_timestamp || Date.now()).toLocaleString()}
                                                 </span>
                                                 <div className="flex items-center gap-1.5 mt-0.5">
                                                     <span className="text-[9px] bg-red-900/40 text-red-400 px-1 rounded border border-red-500/20 font-bold">CLOSE</span>
                                                     <span className="text-[9px] text-slate-500">持仓: {getDuration(log.entry_timestamp, log.exit_timestamp)}</span>
                                                 </div>
                                             </div>
                                         ) : (
                                             <div className="flex flex-col">
                                                 <span className="font-bold text-emerald-300">
                                                     {new Date(log.entry_timestamp).toLocaleString()}
                                                 </span>
                                                 <div className="flex items-center gap-1.5 mt-0.5">
                                                     <span className="text-[9px] bg-emerald-900/40 text-emerald-400 px-1 rounded border border-emerald-500/20 font-bold">OPEN</span>
                                                 </div>
                                             </div>
                                         )}
                                     </td>
                                     <td className="px-4 py-3 font-bold text-slate-200">
                                         <div className="flex items-center gap-2">
                                            <span>{log.symbol}</span>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSearchTerm(log.symbol);
                                                setActiveFilter('ALL'); // Reset filter to find all for this symbol
                                              }}
                                              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400 transition-all"
                                              title="筛选此币种所有记录"
                                            >
                                              <History size={12} />
                                            </button>
                                         </div>
                                         <div className="text-[10px] text-slate-500 font-mono font-normal">{log.entry_id.slice(-6)}</div>
                                     </td>
                                     <td className={`px-4 py-3 text-xs ${log.direction === PositionSide.LONG ? 'text-emerald-400' : 'text-red-400'}`}>
                                         <div className="flex items-center gap-1">
                                            {log.direction}
                                            <span className="text-[9px] text-slate-500 border border-slate-700 px-0.5 rounded">{log.leverage || 20}x</span>
                                         </div>
                                         {log.is_hedge && (
                                             <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-500/30 text-[9px] font-bold">
                                                 <Shield size={8} /> 🛡️对冲
                                             </span>
                                         )}
                                     </td>
                                     <td className="px-4 py-3 text-xs font-mono">
                                         <div className="font-bold text-slate-200">{log.cost_usdt.toFixed(0)} U</div>
                                     </td>
                                     <td className="px-4 py-3 font-mono text-xs">{log.entry_price.toFixed(4)}</td>
                                     <td className="px-4 py-3 font-mono text-xs text-slate-300">
                                        {currentPrice > 0 ? currentPrice.toFixed(4) : '-'}
                                     </td>
                                     <td className={`px-4 py-3 font-mono font-bold ${log.status === 'CLOSED' ? (realizedPnL > 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                                         {log.status === 'CLOSED' ? (
                                             <>
                                                 <div>{realizedPnL > 0 ? '+' : ''}{realizedPnL.toFixed(2)}</div>
                                                 <div className={`text-[10px] font-normal ${realizedPnLPct > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                     {realizedPnLPct > 0 ? '+' : ''}{realizedPnLPct.toFixed(2)}%
                                                 </div>
                                             </>
                                         ) : (
                                             <span className="text-slate-600">-</span>
                                         )}
                                     </td>
                                     <td className="px-4 py-3 text-xs">
                                         {log.status === 'OPEN' ? (
                                             <span className="bg-emerald-900/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">开仓 (OPEN)</span>
                                         ) : (
                                             <div className="flex items-center gap-1">
                                                 {isGrouped && <Link size={10} className="text-indigo-400" />}
                                                 <span className="text-slate-300 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50" title={log.exit_reason}>
                                                     {log.exit_reason ? (log.exit_reason.length > 15 ? log.exit_reason.substring(0, 15) + '...' : log.exit_reason) : '-'}
                                                 </span>
                                             </div>
                                         )}
                                     </td>
                                     <td className="px-4 py-3 text-right">
                                         <button 
                                            onClick={() => setSelectedLog(log)}
                                            className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 justify-end w-full"
                                         >
                                             详情 <ArrowRight size={12}/>
                                         </button>
                                     </td>
                                 </tr>
                             );
                         })}
                         {groupedLogs.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-600">没有符合筛选条件的记录</td></tr>}
                     </tbody>
                 </table>
            </div>
            
            {/* Right Panel - DETAILS */}
            {selectedLog && (
                <div className="w-full md:w-1/3 bg-slate-900 p-4 border-l border-slate-800 overflow-y-auto absolute md:static inset-0 z-20 md:z-auto flex flex-col">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2 flex-shrink-0">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Activity size={16} className="text-indigo-400"/>
                            交易详情分析
                        </h3>
                        <button 
                            onClick={() => setSelectedLog(null)} 
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={16}/>
                        </button>
                    </div>
                    
                    <div className="space-y-4 text-sm flex-1 overflow-y-auto pr-1">
                        
                        <div className="grid grid-cols-2 gap-4 bg-slate-800/30 p-2 rounded border border-slate-800">
                            <div>
                                <span className="text-xs text-slate-500 block mb-1">开仓时间</span>
                                <p className="font-mono text-slate-300 text-xs">{new Date(selectedLog.entry_timestamp).toLocaleString()}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block mb-1">平仓时间</span>
                                <p className="font-mono text-slate-300 text-xs">
                                    {selectedLog.exit_timestamp ? new Date(selectedLog.exit_timestamp).toLocaleString() : '持仓中 (Active)'}
                                </p>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-slate-500 uppercase">交易 ID</span>
                            <p className="font-mono text-slate-400 text-xs break-all">{selectedLog.entry_id}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs text-slate-500">币种</span>
                                <p className="font-bold text-white text-lg flex items-center gap-2">
                                    {selectedLog.symbol}
                                    {selectedLog.is_hedge && <span className="text-[10px] text-blue-400 border border-blue-500/30 px-1 rounded">HEDGE</span>}
                                </p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500">方向</span>
                                <div className={`flex items-center gap-1 font-bold ${selectedLog.direction === PositionSide.LONG ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {selectedLog.direction === PositionSide.LONG ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                                    {selectedLog.direction === PositionSide.LONG ? '多' : '空'} ({selectedLog.direction})
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-slate-800/50 p-2 rounded">
                             <div>
                                <span className="text-xs text-slate-500">开仓价值 (Notional)</span>
                                <p className="font-mono text-white text-lg">{selectedLog.cost_usdt.toFixed(2)} U</p>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs text-slate-500">开仓均价</span>
                                <p className="font-mono text-white">{selectedLog.entry_price.toFixed(4)}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500">平仓/实时价</span>
                                <p className="font-mono text-white">
                                    {positions.find(p => p.entryId === selectedLog.entry_id)?.markPrice.toFixed(4) || (selectedLog.exit_price ? selectedLog.exit_price.toFixed(4) : '-')}
                                </p>
                            </div>
                        </div>

                        {selectedLog.signal_details && (
                            <div>
                                <span className="text-xs text-slate-500 uppercase block mb-1 flex items-center gap-1"><Code size={10}/> 技术面快照</span>
                                <div className="bg-slate-950 p-2 rounded border border-slate-700">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-400">触发条件:</span>
                                        <span className="text-emerald-400">{selectedLog.signal_details.condition_met || selectedLog.signal_details.type || '-'}</span>
                                    </div>
                                    {selectedLog.signal_details.ema10 && (
                                        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300 mt-2">
                                            <div>EMA10: {selectedLog.signal_details.ema10?.toFixed(2)}</div>
                                            <div>EMA20: {selectedLog.signal_details.ema20?.toFixed(2)}</div>
                                            <div>EMA30: {selectedLog.signal_details.ema30?.toFixed(2)}</div>
                                            <div>EMA40: {selectedLog.signal_details.ema40?.toFixed(2)}</div>
                                        </div>
                                    )}
                                    {selectedLog.signal_details.trigger_reason && (
                                        <div className="mt-2 text-xs border-t border-slate-800 pt-1">
                                            <span className="text-slate-500">原因:</span>
                                            <span className="text-amber-400 ml-1">{selectedLog.signal_details.trigger_reason}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <span className="text-xs text-slate-500 uppercase block mb-1">原始数据</span>
                            {renderJson(selectedLog)}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default TradeLogModal;
