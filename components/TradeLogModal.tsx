import React, { useState, useMemo } from 'react';
import { X, FileText, Activity, Code, Clock, ArrowRight, Search, TrendingUp, TrendingDown, AlertCircle, Calculator, Link, Shield, PieChart, BarChart2 } from 'lucide-react';
import { TradeLog, SystemEvent, PositionSide, Position } from '../types';

interface Props {
  tradeLogs: TradeLog[];
  positions: Position[]; // Added active positions for real-time calculation
  systemEvents: SystemEvent[];
  onClose: () => void;
  initialSearch?: string; 
}

const TradeLogModal: React.FC<Props> = ({ tradeLogs, positions, systemEvents, onClose, initialSearch = '' }) => {
  // UPDATED: Only one main tab for "TRADES" to strictly show Open/Close records
  const [activeTab, setActiveTab] = useState<'TRADES'>('TRADES');
  const [selectedLog, setSelectedLog] = useState<TradeLog | null>(null); 
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  const groupedLogs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      
      const sorted = tradeLogs
          .filter(log => 
              log.symbol.toLowerCase().includes(term) ||
              log.entry_id.toLowerCase().includes(term)
          )
          .sort((a, b) => {
              const timeA = a.status === 'CLOSED' ? (a.exit_timestamp || a.entry_timestamp) : a.entry_timestamp;
              const timeB = b.status === 'CLOSED' ? (b.exit_timestamp || b.entry_timestamp) : b.entry_timestamp;
              return timeB - timeA;
          });

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
  }, [tradeLogs, searchTerm]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 rounded-t-lg">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-900/30 rounded-full text-indigo-400 border border-indigo-500/30">
                <FileText size={20} />
             </div>
             <div>
                <h2 className="text-lg font-bold text-white">交易日志 (Trade Log)</h2>
                <p className="text-xs text-slate-500">仅显示开仓与平仓记录</p>
             </div>
          </div>
          <div className="flex items-center gap-4">
              <div className="relative">
                  <input 
                    type="text" 
                    placeholder="搜索币种..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-full pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 w-48"
                    autoFocus
                  />
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
                <X size={20} />
              </button>
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
                                         {log.symbol}
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
                                                     {log.exit_reason ? (log.exit_reason.length > 10 ? log.exit_reason.substring(0, 10) + '...' : log.exit_reason) : '-'}
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
                         {groupedLogs.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-600">暂无开/平仓记录</td></tr>}
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
                                        <span className="text-emerald-400">{selectedLog.signal_details.condition_met}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300 mt-2">
                                        <div>EMA10: {selectedLog.signal_details.ema10.toFixed(2)}</div>
                                        <div>EMA20: {selectedLog.signal_details.ema20.toFixed(2)}</div>
                                        <div>EMA30: {selectedLog.signal_details.ema30.toFixed(2)}</div>
                                        <div>EMA40: {selectedLog.signal_details.ema40.toFixed(2)}</div>
                                    </div>
                                    <div className="mt-2 text-xs border-t border-slate-800 pt-1 flex justify-between">
                                        <span className="text-slate-500">24H成交额:</span>
                                        <span className="text-slate-300">{(selectedLog.signal_details.volume_24h_usdt / 1000000).toFixed(2)}M</span>
                                    </div>
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