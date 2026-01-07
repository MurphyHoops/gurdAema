
import React, { useEffect, useState, useRef } from 'react';
import { X, LineChart, Loader2 } from 'lucide-react';
import { calculateEMA } from '../services/indicators';

interface Props {
  symbol: string;
  onClose: () => void;
}

interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

// Binance Colors
const COLOR_UP = '#0ECB81'; // Green
const COLOR_DOWN = '#F6465D'; // Red
const COLOR_BG = '#161A25'; // Dark BG
const COLOR_GRID = '#2B3139'; // Grid Lines
const COLOR_TEXT = '#848E9C';

const KlineChartModal: React.FC<Props> = ({ symbol, onClose }) => {
  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KlineData[]>([]);
  const [emaData, setEmaData] = useState<Record<number, number[]>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch Data with Recursive Polling
  useEffect(() => {
    let isMounted = true;
    let timerId: any;

    const fetchData = async (isInitialLoad: boolean) => {
        if (isInitialLoad) setLoading(true);

        try {
            // Fetch 100 candles with no-store cache to ensure freshness (FUTURES API)
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100`, { cache: 'no-store' });
            if (res.ok && isMounted) {
                const json = await res.json();
                const klines: KlineData[] = json.map((k: any) => ({
                    time: k[0],
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                    volume: parseFloat(k[5])
                }));
                setData(klines);

                // Calculate EMAs
                const closes = klines.map(k => k.close);
                setEmaData({
                    10: calculateEMA(closes, 10),
                    20: calculateEMA(closes, 20),
                    30: calculateEMA(closes, 30),
                    40: calculateEMA(closes, 40)
                });
            }
        } catch (e) {
            console.error("Failed to fetch kline data:", e);
        } finally {
            if (isMounted) {
                if (isInitialLoad) setLoading(false);
                // Schedule next poll only after current request completes
                // Update every 2 seconds for near real-time feel
                timerId = setTimeout(() => fetchData(false), 2000);
            }
        }
    };

    fetchData(true);

    return () => { 
        isMounted = false; 
        clearTimeout(timerId); 
    };
  }, [symbol, timeframe]);


  // Chart Drawing Logic (SVG)
  const renderChart = () => {
      if (data.length === 0) return null;

      const width = containerRef.current?.clientWidth || 800;
      const height = 400;
      // Reserve 20% height for volume
      const chartHeight = height * 0.8; 
      const volumeHeight = height * 0.2;
      
      const padding = { top: 20, right: 60, bottom: 20, left: 10 }; // Right padding for Y-Axis labels

      // Calculate Price Scaling
      const minPrice = Math.min(...data.map(d => d.low));
      const maxPrice = Math.max(...data.map(d => d.high));
      const priceRange = maxPrice - minPrice;

      // Calculate Volume Scaling
      const maxVolume = Math.max(...data.map(d => d.volume));

      const getX = (index: number) => padding.left + (index / data.length) * (width - padding.left - padding.right);
      const getYPrice = (price: number) => chartHeight - ((price - minPrice) / priceRange) * (chartHeight - padding.top);
      const getYVol = (vol: number) => height - padding.bottom - (vol / maxVolume) * (volumeHeight - 10); // -10 for spacing

      const candleWidth = (width - padding.left - padding.right) / data.length * 0.65;

      // Render Candles & Volume
      const candles = data.map((d, i) => {
          const isGreen = d.close >= d.open;
          const color = isGreen ? COLOR_UP : COLOR_DOWN;
          
          const x = getX(i);
          const yOpen = getYPrice(d.open);
          const yClose = getYPrice(d.close);
          const yHigh = getYPrice(d.high);
          const yLow = getYPrice(d.low);

          // Volume Bar
          const vHeight = (d.volume / maxVolume) * (volumeHeight - 10);
          const vy = height - padding.bottom - vHeight;

          return (
              <g key={i}>
                  {/* Volume */}
                  <rect x={x} y={vy} width={candleWidth} height={vHeight} fill={color} opacity={0.3} />
                  
                  {/* Price Wick */}
                  <line x1={x + candleWidth/2} y1={yHigh} x2={x + candleWidth/2} y2={yLow} stroke={color} strokeWidth={1} />
                  
                  {/* Price Body */}
                  <rect 
                    x={x} 
                    y={Math.min(yOpen, yClose)} 
                    width={candleWidth} 
                    height={Math.max(1, Math.abs(yOpen - yClose))} 
                    fill={color} 
                  />
              </g>
          );
      });

      // Render EMAs
      const renderEMA = (period: number, color: string) => {
          const points = emaData[period];
          if (!points || points.length === 0) return null;
          
          let pathD = "";
          points.forEach((val, idx) => {
              const dataIndex = idx + (period - 1); // calculateEMA output alignment
              if (dataIndex < data.length) {
                  const x = getX(dataIndex) + candleWidth/2;
                  const y = getYPrice(val);
                  if (idx === 0) pathD += `M ${x} ${y}`;
                  else pathD += ` L ${x} ${y}`;
              }
          });

          return <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />;
      };

      // Y-Axis Labels
      const yLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => {
          const price = minPrice + pct * priceRange;
          const y = getYPrice(price);
          return (
              <g key={pct}>
                   <line x1={padding.left} y1={y} x2={width - padding.right} stroke={COLOR_GRID} strokeDasharray="3 3" strokeWidth={1} />
                   <text x={width - 50} y={y + 3} fill={COLOR_TEXT} fontSize="10" fontFamily="monospace">
                       {price.toFixed(price < 10 ? 4 : 2)}
                   </text>
              </g>
          );
      });

      return (
          <svg width="100%" height={height} className="overflow-visible font-mono" style={{ backgroundColor: COLOR_BG }}>
              {yLabels}
              
              {/* Volume Separator Line */}
              <line x1={padding.left} y1={height - volumeHeight - padding.bottom} x2={width - padding.right} y2={height - volumeHeight - padding.bottom} stroke={COLOR_GRID} strokeWidth={1} />

              {candles}
              
              {renderEMA(10, '#FACC15')} {/* Yellow */}
              {renderEMA(20, '#A855F7')} {/* Purple */}
              {renderEMA(30, '#3B82F6')} {/* Blue */}
              {renderEMA(40, '#F97316')} {/* Orange */}
          </svg>
      );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="border border-slate-700 rounded-lg shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]" style={{ backgroundColor: COLOR_BG }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#1E2329] rounded-t-lg">
           <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                   <h2 className="text-xl font-bold text-slate-100">{symbol}</h2>
                   <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">FUTURES</span>
               </div>
               <div className="flex items-center gap-3 text-xs font-mono border-l border-slate-700 pl-4">
                   <span className="text-yellow-400">EMA(10)</span>
                   <span className="text-purple-400">EMA(20)</span>
                   <span className="text-blue-400">EMA(30)</span>
                   <span className="text-orange-400">EMA(40)</span>
               </div>
           </div>
           
           <div className="flex items-center gap-2">
               {TIMEFRAMES.map(tf => (
                   <button 
                    key={tf} 
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${timeframe === tf ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                   >
                       {tf}
                   </button>
               ))}
               <div className="w-px h-6 bg-slate-700 mx-2"></div>
               <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white">
                 <X size={20} />
               </button>
           </div>
        </div>

        {/* Chart Area */}
        <div className="flex-1 p-4 relative min-h-[400px]" ref={containerRef}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#161A25]/80">
                    <Loader2 size={40} className="animate-spin text-[#FCD535]" />
                </div>
            )}
            {renderChart()}
        </div>
        
        <div className="p-3 bg-[#1E2329] border-t border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>数据来源: Binance Futures API (USDT-M)</span>
            <div className="flex gap-4">
                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#0ECB81]"></div> 涨 (Up)</span>
                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#F6465D]"></div> 跌 (Down)</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default KlineChartModal;
