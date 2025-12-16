import React, { useEffect, useState, useRef, useMemo } from 'react';
import { X, Loader2, Crosshair } from 'lucide-react';
import { calculateEMA } from '../services/indicators';

interface Props {
  symbol: string;
  timeframe: string;
  highlightTimestamp?: number;
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

// Binance Colors
const COLOR_UP = '#0ECB81'; // Green
const COLOR_DOWN = '#F6465D'; // Red
const COLOR_BG = '#161A25'; // Dark BG
const COLOR_GRID = '#2B3139'; // Grid Lines
const COLOR_TEXT = '#848E9C';
const COLORS_EMA = {
    10: '#FACC15', // Yellow
    20: '#A855F7', // Purple
    30: '#3B82F6', // Blue
    40: '#F97316'  // Orange
};

const KlineChartModal: React.FC<Props> = ({ symbol, timeframe, highlightTimestamp, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KlineData[]>([]);
  const [emaData, setEmaData] = useState<Record<number, number[]>>({});
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch more candles for smoother line rendering
            const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=100`, { cache: 'no-store' });
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
            if (isMounted) setLoading(false);
        }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [symbol, timeframe]);

  // Derived active data (Hover or Latest)
  const activeIndex = hoverIndex !== null ? hoverIndex : Math.max(0, data.length - 1);
  const activeItem = data[activeIndex];
  
  const getEmaValue = (period: number, idx: number) => {
      const arr = emaData[period];
      if (!arr) return 0;
      const offset = idx - (period - 1);
      return (offset >= 0 && offset < arr.length) ? arr[offset] : null;
  };

  const activeEmas = {
      10: getEmaValue(10, activeIndex),
      20: getEmaValue(20, activeIndex),
      30: getEmaValue(30, activeIndex),
      40: getEmaValue(40, activeIndex),
  };

  // Determine Cross Status for active candle (EMA within High/Low range)
  const getCrossStatus = (low: number, high: number, ema: number | null) => {
      if (ema === null) return false;
      return ema >= low && ema <= high;
  };

  const crossState = activeItem ? {
      10: getCrossStatus(activeItem.low, activeItem.high, activeEmas[10]),
      20: getCrossStatus(activeItem.low, activeItem.high, activeEmas[20]),
      30: getCrossStatus(activeItem.low, activeItem.high, activeEmas[30]),
      40: getCrossStatus(activeItem.low, activeItem.high, activeEmas[40]),
  } : {};


  const renderChart = () => {
      if (data.length === 0) return null;

      const width = containerRef.current?.clientWidth || 800;
      const height = 400;
      const chartHeight = height * 0.75; 
      const volumeHeight = height * 0.2;
      const padding = { top: 20, right: 60, bottom: 20, left: 10 };

      // Calculate Scale
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      
      data.forEach(d => {
          if (d.low < minPrice) minPrice = d.low;
          if (d.high > maxPrice) maxPrice = d.high;
      });
      
      // Add padding to price range
      const priceBuffer = (maxPrice - minPrice) * 0.05;
      minPrice -= priceBuffer;
      maxPrice += priceBuffer;
      const priceRange = maxPrice - minPrice;

      const maxVolume = Math.max(...data.map(d => d.volume));

      const getX = (index: number) => padding.left + (index / data.length) * (width - padding.left - padding.right);
      const getYPrice = (price: number) => chartHeight - ((price - minPrice) / priceRange) * (chartHeight - padding.top) + padding.top;

      const candleWidth = (width - padding.left - padding.right) / data.length * 0.6;

      // Render Candles
      const candles = data.map((d, i) => {
          const isGreen = d.close >= d.open;
          const color = isGreen ? COLOR_UP : COLOR_DOWN;
          const x = getX(i);
          const yOpen = getYPrice(d.open);
          const yClose = getYPrice(d.close);
          const yHigh = getYPrice(d.high);
          const yLow = getYPrice(d.low);
          
          const vHeight = (d.volume / maxVolume) * (volumeHeight - 10);
          const vy = height - padding.bottom - vHeight;

          return (
              <g key={i}>
                  {/* Volume */}
                  <rect x={x} y={vy} width={candleWidth} height={vHeight} fill={color} opacity={0.3} />
                  {/* Wick */}
                  <line x1={x + candleWidth/2} y1={yHigh} x2={x + candleWidth/2} y2={yLow} stroke={color} strokeWidth={1} />
                  {/* Body */}
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

      // Render Highlight (Cross Marker)
      let highlightEl = null;
      if (highlightTimestamp) {
          const idx = data.findIndex(d => d.time === highlightTimestamp);
          if (idx !== -1) {
              const x = getX(idx) + candleWidth / 2;
              const yTop = padding.top;
              const yBottom = height - padding.bottom;
              highlightEl = (
                  <g pointerEvents="none">
                      {/* Vertical Dashed Line */}
                      <line x1={x} y1={yTop} x2={x} y2={yBottom} stroke="#EAB308" strokeWidth={1} strokeDasharray="6 3" opacity={0.8} />
                      {/* Marker Label */}
                      <rect x={x - 20} y={yTop} width={40} height={14} fill="#EAB308" rx={2} />
                      <text x={x} y={yTop + 10} fill="black" fontSize="9" fontWeight="bold" textAnchor="middle">CROSS</text>
                  </g>
              );
          }
      }

      // Render EMAs
      const renderEMA = (period: number, color: string) => {
          const points = emaData[period];
          if (!points || points.length === 0) return null;
          
          let pathD = "";
          points.forEach((val, idx) => {
              const dataIndex = idx + (period - 1); 
              if (dataIndex < data.length && dataIndex >= 0) {
                  const x = getX(dataIndex) + candleWidth/2;
                  const y = getYPrice(val);
                  if (pathD === "") pathD += `M ${x} ${y}`;
                  else pathD += ` L ${x} ${y}`;
              }
          });
          return <path d={pathD} fill="none" stroke={color} strokeWidth={1} />;
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

      // Crosshair
      let crosshairEl = null;
      if (hoverIndex !== null) {
          const x = getX(hoverIndex) + candleWidth/2;
          const y = getYPrice(data[hoverIndex].close);
          crosshairEl = (
              <g pointerEvents="none">
                  <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="white" strokeWidth={0.5} strokeDasharray="4 4" opacity={0.5} />
                  <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="white" strokeWidth={0.5} strokeDasharray="4 4" opacity={0.5} />
                  <circle cx={x} cy={y} r={3} fill="white" />
              </g>
          );
      }

      return (
          <svg 
            width="100%" 
            height={height} 
            style={{ backgroundColor: COLOR_BG, cursor: 'crosshair' }}
            onMouseMove={(e) => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const chartWidth = width - padding.left - padding.right;
                const ratio = (x - padding.left) / chartWidth;
                const idx = Math.floor(ratio * data.length);
                if (idx >= 0 && idx < data.length) {
                    setHoverIndex(idx);
                }
            }}
            onMouseLeave={() => setHoverIndex(null)}
          >
              {yLabels}
              {candles}
              {highlightEl}
              {renderEMA(10, COLORS_EMA[10])}
              {renderEMA(20, COLORS_EMA[20])}
              {renderEMA(30, COLORS_EMA[30])}
              {renderEMA(40, COLORS_EMA[40])}
              {crosshairEl}
          </svg>
      );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="border border-slate-700 rounded-lg shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] bg-[#1E2329]">
        {/* Header */}
        <div className="flex flex-col border-b border-slate-800 bg-[#1E2329] rounded-t-lg">
            <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        {symbol} <span className="text-sm text-slate-500 bg-slate-800 px-2 py-0.5 rounded font-mono">{timeframe}</span>
                    </h2>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            {/* Info Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 text-[11px] font-mono border-b border-slate-800/50 bg-[#161A25]">
                {activeItem ? (
                    <>
                        <span className="text-slate-400">{new Date(activeItem.time).toLocaleString()}</span>
                        <div className="flex gap-2">
                            <span className="text-slate-500">O: <span className={activeItem.close >= activeItem.open ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{activeItem.open}</span></span>
                            <span className="text-slate-500">H: <span className={activeItem.close >= activeItem.open ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{activeItem.high}</span></span>
                            <span className="text-slate-500">L: <span className={activeItem.close >= activeItem.open ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{activeItem.low}</span></span>
                            <span className="text-slate-500">C: <span className={activeItem.close >= activeItem.open ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{activeItem.close}</span></span>
                        </div>
                        <div className="flex gap-3 border-l border-slate-700 pl-3">
                            <span style={{ color: COLORS_EMA[10] }}>
                                EMA10: {activeEmas[10]?.toFixed(4) || '-'} 
                                {(crossState as any)[10] && <span className="ml-1 text-[9px] bg-yellow-500/20 px-1 rounded font-bold">CROSS</span>}
                            </span>
                            <span style={{ color: COLORS_EMA[20] }}>
                                EMA20: {activeEmas[20]?.toFixed(4) || '-'}
                                {(crossState as any)[20] && <span className="ml-1 text-[9px] bg-purple-500/20 px-1 rounded font-bold">CROSS</span>}
                            </span>
                            <span style={{ color: COLORS_EMA[30] }}>
                                EMA30: {activeEmas[30]?.toFixed(4) || '-'}
                                {(crossState as any)[30] && <span className="ml-1 text-[9px] bg-blue-500/20 px-1 rounded font-bold">CROSS</span>}
                            </span>
                            <span style={{ color: COLORS_EMA[40] }}>
                                EMA40: {activeEmas[40]?.toFixed(4) || '-'}
                                {(crossState as any)[40] && <span className="ml-1 text-[9px] bg-orange-500/20 px-1 rounded font-bold">CROSS</span>}
                            </span>
                        </div>
                    </>
                ) : (
                    <span className="text-slate-500">Loading data...</span>
                )}
            </div>
        </div>

        {/* Chart Area */}
        <div className="flex-1 p-2 relative min-h-[400px]" ref={containerRef}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#161A25]/80 backdrop-blur-sm">
                    <Loader2 size={40} className="animate-spin text-yellow-400"/>
                </div>
            )}
            {renderChart()}
        </div>
        
        <div className="px-4 py-2 bg-[#1E2329] rounded-b-lg border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
            <span>Power by Binance Public Data</span>
            <div className="flex items-center gap-1">
                <Crosshair size={10} />
                <span>Move mouse to view details</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default KlineChartModal;