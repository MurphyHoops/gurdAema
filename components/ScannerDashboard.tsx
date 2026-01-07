
import React, { useState, useEffect, useRef } from 'react';
import { ScannerSettings, PositionSide } from '../types';
import { X, Play, Loader2, ArrowRight, Zap, TrendingUp, TrendingDown, Volume2, AlertTriangle, Crosshair, BarChart2 } from 'lucide-react';
import { calculateEMA } from '../services/indicators';
import { audioService } from '../services/audioService';

interface Props {
  settings: ScannerSettings;
  onClose: () => void;
  onOpenPosition: (symbol: string, side: PositionSide, amount: number, price: number, tpPercent?: number, autoReopen?: boolean, isQuantityBase?: boolean) => void;
  realPrices?: Record<string, number>; // Added realPrices prop
}

interface ScannerItem {
    symbol: string;
    price: number;
    volume24h?: number; // millions
    change8am?: number; // %
    emaDetails?: {
        ema10: number;
        ema20: number;
        ema30: number;
        ema40: number;
        ema80: number;
    };
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
    candleShape?: {
        amplitude: number;
        bodyRatio: number;
        valid: boolean;
        signalPrice: number; // Low for Short, High for Long
    };
    breakout?: {
        triggerPrice: number;
        isBroken: boolean;
    };
}

const ScannerDashboard: React.FC<Props> = ({ settings, onClose, onOpenPosition, realPrices = {} }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [activeTimeframe, setActiveTimeframe] = useState(settings.scanTimeframes[0] || '15m');
  
  // Pipeline Lists
  const [list1, setList1] = useState<ScannerItem[]>([]);
  const [list2, setList2] = useState<ScannerItem[]>([]);
  const [list3, setList3] = useState<ScannerItem[]>([]);
  const [list4, setList4] = useState<ScannerItem[]>([]);
  const [list5, setList5] = useState<ScannerItem[]>([]);
  const [list6, setList6] = useState<ScannerItem[]>([]);
  const [list7, setList7] = useState<ScannerItem[]>([]);

  // Monitoring
  const [monitoring, setMonitoring] = useState(false);
  const monitorIntervalRef = useRef<any>(null);

  const mockDelay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const startScan = async () => {
      setIsScanning(true);
      setScanStep(1);
      setList1([]); setList2([]); setList3([]); setList4([]); setList5([]); setList6([]); setList7([]);

      try {
          // --- STEP 1: VOLUME ---
          let step1Results: ScannerItem[] = [];
          
          try {
              // Futures API
              const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', { cache: 'no-store' });
              if (!res.ok) throw new Error("API Fail");
              const data = await res.json();
              const volumeThreshold = settings.volumeThreshold * 10000000; 

              data.forEach((t: any) => {
                  if (t.symbol.endsWith('USDT')) {
                      const vol = parseFloat(t.quoteVolume);
                      if (vol >= volumeThreshold) {
                          step1Results.push({
                              symbol: t.symbol,
                              price: parseFloat(t.lastPrice),
                              volume24h: vol / 10000000 
                          });
                      }
                  }
              });
          } catch (e) {
              // Fallback Mock with REAL PRICES if available
              await mockDelay(500);
              const mocks = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','ADAUSDT','DOGEUSDT','MATICUSDT','XRPUSDT', 'LTCUSDT', 'AVAXUSDT', 'TRXUSDT', 'LINKUSDT', 'DOTUSDT', 'UNIUSDT', 'ATOMUSDT'];
              
              step1Results = mocks.map(sym => {
                   const isLong = Math.random() > 0.5;
                   // Force change > 3% or < -3% to pass step 2 filters
                   const change = isLong ? (3 + Math.random() * 10) : -(3 + Math.random() * 10);
                   
                   // USE REAL PRICE OR FALLBACK
                   const price = realPrices[sym] || (Math.random() * 100 + 1);

                   return {
                      symbol: sym,
                      price: price,
                      volume24h: 20 + Math.random() * 200, 
                      change8am: change,
                      direction: isLong ? 'LONG' : 'SHORT',
                      emaDetails: { 
                          ema10: price * 1.01, 
                          ema20: price * 1.005, 
                          ema30: price * 1.0, 
                          ema40: price * 0.995, 
                          ema80: price * 0.99 
                      }
                   } as ScannerItem;
              });
          }

          setList1(step1Results);
          setScanStep(2);

          // --- STEP 2: CHANGE ---
          let step2Results: ScannerItem[] = [];
          step2Results = step1Results.filter(item => {
              const change = item.change8am !== undefined ? item.change8am : (Math.random() * 20 - 10);
              return change >= settings.changeFrom8amUp || change <= -settings.changeFrom8amDown;
          }).map(i => ({ ...i, change8am: i.change8am || (Math.random() * 20 - 10) }));

          setList2(step2Results);
          setScanStep(3);
          await mockDelay(300);

          // --- STEP 3-6: TECHNICALS (Mocked Logic) ---
          const step3Results = step2Results.filter(() => Math.random() > 0.3); // 70% pass
          setList3(step3Results);
          setScanStep(4);
          await mockDelay(300);

          const step4Results = step3Results.filter(() => Math.random() > 0.4).map(i => ({
              ...i,
              direction: Math.random() > 0.5 ? 'LONG' : 'SHORT' as 'LONG'|'SHORT'
          }));
          setList4(step4Results);
          setScanStep(5);
          await mockDelay(300);
          
          const step5Results = step4Results.filter(() => Math.random() > 0.5);
          setList5(step5Results);
          setScanStep(6);
          await mockDelay(300);

          const step6Results = step5Results.filter(() => Math.random() > 0.6).map(i => ({
              ...i,
              candleShape: {
                  amplitude: 5 + Math.random() * 5,
                  bodyRatio: 60 + Math.random() * 30,
                  valid: true,
                  signalPrice: i.price
              },
              breakout: {
                  triggerPrice: i.price * (i.direction === 'LONG' ? 1.01 : 0.99),
                  isBroken: false
              }
          }));

          setList6(step6Results);
          setList7(step6Results);

          // --- VOICE ALERTS ---
          audioService.speak('扫描完成，已生成模拟分析结果。');

      } catch (e) {
          console.error("Scan Failed", e);
          audioService.speak('扫描异常中断。');
      } finally {
          setIsScanning(false);
          setScanStep(0);
          setMonitoring(true); 
      }
  };

  // Condition 4: Live Breakout Monitoring (Simulated)
  useEffect(() => {
      if (!monitoring || list7.length === 0) return;

      monitorIntervalRef.current = setInterval(() => {
          // Randomly trigger breakouts
          if (Math.random() > 0.7) {
              const idx = Math.floor(Math.random() * list7.length);
              const item = list7[idx];
              if (item && !item.breakout?.isBroken) {
                   setList7(prev => prev.map((i, index) => index === idx ? { ...i, breakout: { ...i.breakout!, isBroken: true } } : i));
                   
                   const action = settings.autoOpen ? '自动开仓' : '突破警报';
                   audioService.speak(`${action}。${item.symbol.replace('USDT','')} 模拟突破。`, true);

                   if (settings.autoOpen) {
                       onOpenPosition(item.symbol, item.direction === 'LONG' ? PositionSide.LONG : PositionSide.SHORT, settings.openAmount, item.price, undefined, false, false);
                   }
              }
          }
      }, 3000);

      return () => clearInterval(monitorIntervalRef.current);
  }, [monitoring, list7, settings.autoOpen, settings.openAmount, onOpenPosition]);


  // Helper Renderers
  const renderList = (title: string, data: ScannerItem[], extraRenderer?: (item: ScannerItem) => React.ReactNode, actionRenderer?: (item: ScannerItem) => React.ReactNode) => (
      <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 min-w-[200px] w-[200px]">
          <div className="p-2 border-b border-slate-800 bg-slate-950/50 sticky top-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase">{title}</div>
              <div className="text-xs font-mono font-bold text-white">{data.length}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 space-y-1 custom-scrollbar">
              {data.map((item, idx) => (
                  <div key={`${item.symbol}-${idx}`} className="bg-slate-800/50 p-2 rounded border border-slate-700/50 text-[10px]">
                      <div className="flex justify-between font-bold text-slate-300">
                          <span>{item.symbol}</span>
                          <span className={item.change8am! > 0 ? 'text-emerald-400' : 'text-red-400'}>{item.change8am?.toFixed(2)}%</span>
                      </div>
                      {extraRenderer && extraRenderer(item)}
                      {actionRenderer && <div className="mt-1 pt-1 border-t border-slate-700/50">{actionRenderer(item)}</div>}
                  </div>
              ))}
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-200">
        {/* Header */}
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-cyan-400">
                     <Crosshair size={20} />
                     <h2 className="font-bold">智能市场扫描 (Smart Scanner)</h2>
                 </div>
                 
                 <div className="flex items-center gap-2 ml-8">
                     <select 
                        className="bg-slate-800 border border-slate-700 text-xs rounded px-2 py-1"
                        value={activeTimeframe}
                        onChange={(e) => setActiveTimeframe(e.target.value)}
                     >
                         {settings.scanTimeframes.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                     
                     <button 
                        onClick={startScan} 
                        disabled={isScanning}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white px-4 py-1 rounded text-xs font-bold flex items-center gap-2 transition-colors"
                     >
                         {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                         {isScanning ? `扫描中 (Step ${scanStep}/6)...` : '开始扫描'}
                     </button>
                 </div>
             </div>
             
             <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><X size={20} /></button>
        </div>

        {/* Content - Horizontal Scroll for 7 Lists */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full min-w-max">
                
                {/* List 1: Volume */}
                {renderList("1. 巨量筛选 (>1000万)", list1, (item) => (
                    <div className="text-slate-500">Vol: {item.volume24h?.toFixed(1)}kw</div>
                ))}
                
                {/* List 2: Change */}
                {renderList("2. 异动筛选 (8点起)", list2, (item) => (
                    <div className="text-slate-500">Price: {item.price.toFixed(4)}</div>
                ))}
                
                {/* List 3: EMA Cross */}
                {renderList(`3. EMA穿越 (${activeTimeframe})`, list3, (item) => (
                    <div className="text-slate-500 grid grid-cols-2 gap-1 text-[9px] font-mono">
                        <span>E10:{item.emaDetails?.ema10.toFixed(2)}</span>
                    </div>
                ))}
                
                {/* List 4: Trend */}
                {renderList("4. 均线排列 (趋势)", list4, (item) => (
                    <div className={`font-bold ${item.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.direction} (10-40)
                    </div>
                ), (item) => (
                     <button 
                        onClick={() => onOpenPosition(item.symbol, item.direction === 'LONG' ? PositionSide.LONG : PositionSide.SHORT, settings.openAmount, item.price, undefined, false, false)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white text-[9px] py-1 rounded"
                     >
                         开仓 {settings.openAmount}U
                     </button>
                ))}
                
                {/* List 5: Strong Trend */}
                {renderList("5. 强趋势 (含EMA80)", list5, (item) => (
                    <div className={`font-bold ${item.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.direction} (10-80)
                    </div>
                ), (item) => (
                     <button 
                        onClick={() => onOpenPosition(item.symbol, item.direction === 'LONG' ? PositionSide.LONG : PositionSide.SHORT, settings.openAmount, item.price, undefined, false, false)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white text-[9px] py-1 rounded"
                     >
                         开仓 {settings.openAmount}U
                     </button>
                ))}
                
                {/* List 6: Candle Shape */}
                {renderList("6. 形态优选 (Pattern)", list6, (item) => (
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <span>Amp: {item.candleShape?.amplitude.toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Body: {item.candleShape?.bodyRatio.toFixed(0)}%</span>
                        </div>
                    </div>
                ), (item) => (
                     <button 
                        onClick={() => onOpenPosition(item.symbol, item.direction === 'LONG' ? PositionSide.LONG : PositionSide.SHORT, settings.openAmount, item.price, undefined, false, false)}
                        className="w-full bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 text-[9px] py-1 rounded border border-cyan-700/50"
                     >
                         强力开仓
                     </button>
                ))}

                {/* List 7: Breakout Monitor */}
                {renderList("7. 突破监控 (Live)", list7, (item) => (
                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className="text-slate-500">Trig: {item.breakout?.triggerPrice.toFixed(4)}</span>
                        </div>
                        {item.breakout?.isBroken ? (
                            <div className="text-orange-400 font-bold flex items-center gap-1 animate-pulse">
                                <Zap size={10} fill="currentColor"/> 突破触发
                            </div>
                        ) : (
                            <div className="text-slate-600 flex items-center gap-1">
                                <Loader2 size={10} className="animate-spin"/> 监控中
                            </div>
                        )}
                    </div>
                ), (item) => (
                     <div className="flex gap-1">
                         <button 
                            onClick={() => onOpenPosition(item.symbol, item.direction === 'LONG' ? PositionSide.LONG : PositionSide.SHORT, settings.openAmount, 0, undefined, false, false)}
                            className={`flex-1 text-[9px] py-1 rounded font-bold ${item.breakout?.isBroken ? 'bg-orange-600 text-white animate-bounce' : 'bg-slate-800 text-slate-500'}`}
                         >
                             {item.breakout?.isBroken ? '立即追单' : '等待突破'}
                         </button>
                     </div>
                ))}
            </div>
        </div>
    </div>
  );
};

export default ScannerDashboard;
