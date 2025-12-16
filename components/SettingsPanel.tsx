import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, ALL_BINANCE_SYMBOLS, ThreeLevelAlert, SimulationSettings, ProfitTier, StopLossSettings } from '../types';
import { TrendingUp, TrendingDown, Settings, Shield, Zap, Activity, BarChart2, Save, RotateCcw, CheckCircle2, Volume2, VolumeX, AlertTriangle, Play, Pause, Layers, Layout, RefreshCw, Radio, Lock, FileJson, Upload, Download, Database, MessageSquare, Target, Loader2, ArrowUp, ArrowDown, WifiOff, Code, X, Maximize2, Search, Filter, Clock, Crosshair, Minus } from 'lucide-react';
import { audioService } from '../services/audioService';
import { calculateEMA } from '../services/indicators';
import KlineChartModal from './KlineChartModal';

interface Props {
    settings: AppSettings;
    realPrices: Record<string, number>;
    previewData: { symbol: string }[];
    handleChange: (section: keyof AppSettings, key: string, value: any) => void;
    onBatchOpen: (simSettings: SimulationSettings) => void;
    onBackup: () => void; // Local Backup
    onRestore: () => void; // Local Restore
    onExport: () => void; // File Export
    onImport: (e: React.ChangeEvent<HTMLInputElement>) => void; // File Import
    onFactoryReset: () => void; // Reset to Default
    isBackingUp: boolean;
    isRestoring: boolean;
    onOpenScanner: () => void;
    onToggleSim: () => void;
    isSimulating: boolean;
    systemStats: {
        balance: number;
        positionCount: number;
        tradeCount: number;
        logCount: number;
    };
    onViewSource: () => void;
}

interface EmaRecord {
    id: string;
    tf: string;
    time: string;
    timestamp: number;
    label: string;
}

interface TrendRecord {
    id: string;
    symbol: string;
    tf: string;
    direction: 'LONG' | 'SHORT';
    timestamp: number;
    time: string;
    distance: number; // Added distance field
}

interface PrecisionRecord {
    id: string;
    symbol: string;
    tf: string;
    direction: 'LONG' | 'SHORT';
    currentPrice: number;
    triggerPrice: number; // High/Low of crossed candle
    distance: number;
    timestamp: number;
    status: 'WAIT' | 'READY' | 'OPENED';
}

const SettingsPanel: React.FC<Props> = ({ settings, realPrices, previewData, handleChange, onBatchOpen, onBackup, onRestore, onExport, onImport, onFactoryReset, isBackingUp, isRestoring, onOpenScanner, onToggleSim, isSimulating, systemStats, onViewSource }) => {
    
    const [expandedModule, setExpandedModule] = useState<number | null>(4); 
    const [isFetching, setIsFetching] = useState(false);
    const [usingMock, setUsingMock] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    
    // Module 6 Local State
    const [scanResults, setScanResults] = useState<any[]>([]);
    const [sortConfig, setSortConfig] = useState<{key: 'volume' | 'change', dir: 'desc' | 'asc'}>({ key: 'change', dir: 'desc' });
    const [modalSearch, setModalSearch] = useState(''); 
    const [autoScanEnabled, setAutoScanEnabled] = useState(false); // NEW: Auto Scan State

    // --- Module 6: Detail Modal Extended Settings (EMA Cross) ---
    const [emaTimeframes, setEmaTimeframes] = useState<string[]>([]);
    const [autoRefreshEma, setAutoRefreshEma] = useState(false);
    // UPDATED: Store array of history records
    const [emaCrossResults, setEmaCrossResults] = useState<Record<string, EmaRecord[]>>({}); 
    // NEW: Store Trend List (List 3)
    const [emaTrendList, setEmaTrendList] = useState<TrendRecord[]>([]);
    
    // --- MODULE 6.4: Precision Pick Settings ---
    const [precisionList, setPrecisionList] = useState<PrecisionRecord[]>([]);
    const [precisionWindow, setPrecisionWindow] = useState(10); // 10 candles limit
    const [precisionAmount, setPrecisionAmount] = useState(10000); // 10000 U
    const [precisionAuto, setPrecisionAuto] = useState(false);
    // To prevent re-opening same signal in auto mode
    const [openedPrecisionSignals, setOpenedPrecisionSignals] = useState<Set<string>>(new Set());

    // Refs for live access inside async loops
    const precisionAutoRef = useRef(precisionAuto);
    const openedPrecisionSignalsRef = useRef(openedPrecisionSignals);

    useEffect(() => { precisionAutoRef.current = precisionAuto; }, [precisionAuto]);
    useEffect(() => { openedPrecisionSignalsRef.current = openedPrecisionSignals; }, [openedPrecisionSignals]);

    const [isAnalyzingEma, setIsAnalyzingEma] = useState(false);
    
    // Chart Modal
    const [chartModalInfo, setChartModalInfo] = useState<{symbol: string, tf: string, highlightTimestamp?: number} | null>(null);
    
    // Available Timeframes for EMA Check
    const AVAILABLE_EMA_TF = [
        { label: '1m', val: '1m' },
        { label: '3m', val: '3m' },
        { label: '5m', val: '5m' },
        { label: '15m', val: '15m' },
        { label: '30m', val: '30m' },
        { label: '1h', val: '1h' },
        { label: '2h', val: '2h' },
        { label: '4h', val: '4h' },
    ];

    const toggleModule = (id: number) => {
        setExpandedModule(expandedModule === id ? null : id);
    };

    const updateNested = (section: keyof AppSettings, subsection: string, key: string, value: any) => {
        const currentSection = settings[section] as any;
        const currentSub = currentSection[subsection] || {};
        handleChange(section, subsection, { ...currentSub, [key]: value });
    };

    const updateDynamicTier = (index: number, key: keyof ProfitTier, value: number) => {
        const tiers = [...settings.profit.dynamic.tiers];
        tiers[index] = { ...tiers[index], [key]: value };
        updateNested('profit', 'dynamic', 'tiers', tiers);
    };
    
    const updateAudioAlert = (category: keyof AppSettings['audio'], field: keyof ThreeLevelAlert, value: any) => {
        const current = settings.audio[category] as ThreeLevelAlert;
        handleChange('audio', category as string, { ...current, [field]: value });
    };

    const updateAudioLevel = (category: keyof AppSettings['audio'], index: number, value: string) => {
        const current = settings.audio[category] as ThreeLevelAlert;
        const newLevels = [...current.levels];
        newLevels[index] = parseFloat(value) || 0;
        handleChange('audio', category as string, { ...current, levels: newLevels });
    };

    const toggleModule4Feature = (feature: keyof StopLossSettings) => {
        const current = settings.stopLoss;
        handleChange('stopLoss', feature as string, !current[feature]);
    };

    // --- MODULE 6 LOGIC ---
    const handleScan = async () => {
        setIsFetching(true);
        setUsingMock(false);
        setScanResults([]);
        const { filterTimeBasis, filterMinVolume, filterMinChangeUp, filterMinChangeDown, scanSource } = settings.simulation;
        
        // Decouple Scan Source from Execution
        const targetSource = scanSource || 'GAINERS';
        
        // Sorting Logic: Gainers = High to Low (Desc), Losers = Low to High (Asc - e.g. -20% < -5%)
        const targetDir = targetSource === 'GAINERS' ? 'desc' : 'asc';
        
        setSortConfig({ key: 'change', dir: targetDir });
        const minVolRaw = filterMinVolume * 1000000; 
        
        const processData = (rawData: any[]) => {
            const processed = rawData.filter((t: any) => {
                if (!t.symbol.endsWith('USDT')) return false;
                const vol = parseFloat(t.quoteVolume);
                const change = parseFloat(t.priceChangePercent);
                if (vol < minVolRaw) return false;
                
                // NEW: Use targetSource instead of executionDirection
                if (targetSource === 'GAINERS') { return change >= filterMinChangeUp; } 
                else { return change <= -Math.abs(filterMinChangeDown); }
            }).map((t: any) => ({
                symbol: t.symbol, volume: parseFloat(t.quoteVolume) / 1000000, change: parseFloat(t.priceChangePercent), lastPrice: parseFloat(t.lastPrice)
            }));
            const uniqueMap = new Map();
            processed.forEach(item => { if (!uniqueMap.has(item.symbol)) uniqueMap.set(item.symbol, item); });
            return Array.from(uniqueMap.values());
        };
        try {
            const endpoint = filterTimeBasis === '8AM' ? 'https://data-api.binance.vision/api/v3/ticker/tradingDay' : 'https://data-api.binance.vision/api/v3/ticker/24hr';
            const res = await fetch(endpoint, { cache: 'no-store' });
            if (!res.ok) throw new Error("API Error");
            const data = await res.json();
            const candidates = processData(Array.isArray(data) ? data : [data]);
            setScanResults(candidates);
            if (candidates.length > 0) {
                audioService.speak(`扫描完成，筛选出 ${candidates.length} 个币种。`);
            } else {
                audioService.speak('未找到符合条件的币种。');
            }
        } catch (e) {
            setUsingMock(true);
            audioService.speak('网络连接失败，已生成符合方向的模拟数据。');
            const targetCount = settings.simulation.selectCount || 60; 
            const mockPool: any[] = [];
            const baseSymbols = [...ALL_BINANCE_SYMBOLS];
            const usedSymbols = new Set<string>();
            let i = 0;
            while (mockPool.length < Math.max(targetCount + 10, 50)) {
                let sym = "";
                if (i < baseSymbols.length) sym = baseSymbols[i];
                else sym = `COIN${i}USDT`; 
                if (!usedSymbols.has(sym)) {
                    usedSymbols.add(sym);
                    const minVol = Math.max(filterMinVolume, 5);
                    const volRaw = (minVol + Math.random() * 500) * 1000000;
                    let changePct;
                    // Mock data based on SCAN SOURCE
                    if (targetSource === 'GAINERS') { const minUp = Math.max(filterMinChangeUp, 0.5); changePct = minUp + Math.random() * 15; } 
                    else { const minDown = Math.max(filterMinChangeDown, 0.5); changePct = -(minDown + Math.random() * 15); }
                    
                    // Priority: Use Real Price if available, otherwise fallback to defaults
                    let price = 10;
                    if (realPrices[sym]) {
                        price = realPrices[sym];
                    } else if (sym.includes('BTC')) {
                        price = 65000 + Math.random() * 1000;
                    } else if (sym.includes('ETH')) {
                        price = 3500 + Math.random() * 100;
                    }

                    mockPool.push({ symbol: sym, quoteVolume: volRaw.toString(), priceChangePercent: changePct.toString(), lastPrice: price.toString() });
                }
                i++; if (i > 500) break; 
            }
            const candidates = processData(mockPool);
            setScanResults(candidates);
        } finally { setIsFetching(false); }
    };

    // --- NEW: AUTO SCAN EFFECT (15 MINUTES) ---
    useEffect(() => {
        let interval: any;
        if (autoScanEnabled) {
            // Run interval every 15 minutes (15 * 60 * 1000)
            interval = setInterval(() => {
                if (!isFetching) {
                    audioService.speak("启动自动扫描。");
                    handleScan();
                }
            }, 15 * 60 * 1000);
        }
        return () => clearInterval(interval);
    }, [autoScanEnabled, isFetching]);


    const handleSort = (key: 'volume' | 'change') => { setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' })); };
    
    // Memoized Results with Local Filtering for Modal
    const sortedScanResults = React.useMemo(() => { 
        return [...scanResults].sort((a, b) => { 
            const valA = a[sortConfig.key]; 
            const valB = b[sortConfig.key]; 
            return sortConfig.dir === 'desc' ? valB - valA : valA - valB; 
        }); 
    }, [scanResults, sortConfig]);

    const filteredModalResults = React.useMemo(() => {
        if (!modalSearch) return sortedScanResults;
        return sortedScanResults.filter(item => item.symbol.toLowerCase().includes(modalSearch.toLowerCase()));
    }, [sortedScanResults, modalSearch]);
    
    // Derived List 2 Data (Grouped by Symbol for horizontal display)
    const groupedEmaCrossList = React.useMemo(() => {
        return Object.entries(emaCrossResults).map(([symbol, records]) => {
            // Group by TF
            const tfGroups: Record<string, { count: number, latestTime: string, label: string, tf: string }> = {};
            let latestTimestamp = 0;

            records.forEach(r => {
                if (r.timestamp > latestTimestamp) latestTimestamp = r.timestamp;
                if (!tfGroups[r.tf]) {
                    tfGroups[r.tf] = { count: 0, latestTime: r.time, label: AVAILABLE_EMA_TF.find(t=>t.val===r.tf)?.label || r.tf, tf: r.tf };
                }
                tfGroups[r.tf].count++;
            });
            
            // Convert tfGroups to array and sort by timeframe order
            const sortedGroups = Object.values(tfGroups).sort((a, b) => {
                const idxA = AVAILABLE_EMA_TF.findIndex(t => t.val === a.tf);
                const idxB = AVAILABLE_EMA_TF.findIndex(t => t.val === b.tf);
                return idxA - idxB;
            });

            return { symbol, groups: sortedGroups, latestTimestamp };
        }).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    }, [emaCrossResults]);

    // Derived List 3 Data (Grouped by Symbol -> TF+Dir)
    const groupedTrendList = React.useMemo(() => {
        const map: Record<string, { symbol: string, items: TrendRecord[], latestTimestamp: number }> = {};
        
        emaTrendList.forEach(r => {
            if (!map[r.symbol]) map[r.symbol] = { symbol: r.symbol, items: [], latestTimestamp: 0 };
            map[r.symbol].items.push(r);
            if (r.timestamp > map[r.symbol].latestTimestamp) map[r.symbol].latestTimestamp = r.timestamp;
        });
        
        return Object.values(map).map(group => {
            // Group items by TF + Direction
            const chipMap: Record<string, { tf: string, dir: 'LONG'|'SHORT', count: number, label: string, time: string, distance: number, timestamp: number }> = {};
            
            group.items.forEach(item => {
                const key = `${item.tf}-${item.direction}`;
                if (!chipMap[key]) {
                    chipMap[key] = { 
                        tf: item.tf, 
                        dir: item.direction, 
                        count: 0,
                        label: AVAILABLE_EMA_TF.find(t=>t.val===item.tf)?.label || item.tf,
                        time: item.time,
                        distance: item.distance, // Use distance from record
                        timestamp: item.timestamp // Ensure timestamp is passed for Chart Modal
                    };
                }
                chipMap[key].count++;
            });

            // Sort chips by timeframe
            const sortedChips = Object.values(chipMap).sort((a, b) => {
                const idxA = AVAILABLE_EMA_TF.findIndex(t => t.val === a.tf);
                const idxB = AVAILABLE_EMA_TF.findIndex(t => t.val === b.tf);
                return idxA - idxB;
            });

            return { symbol: group.symbol, chips: sortedChips, latestTimestamp: group.latestTimestamp };
        }).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    }, [emaTrendList]);

    const handleExecute = () => {
        if (sortedScanResults.length === 0) { audioService.speak("请先扫描市场生成数据。"); return; }
        const topCandidates = sortedScanResults.slice(0, settings.simulation.selectCount);
        const symbols = topCandidates.map(c => c.symbol);
        const prices: Record<string, number> = {};
        
        topCandidates.forEach(c => { 
            // Priority: Use Real Price if available to ensure accurate PnL calculation
            if (realPrices[c.symbol]) {
                prices[c.symbol] = realPrices[c.symbol];
            } else if (c.lastPrice) {
                prices[c.symbol] = c.lastPrice; 
            }
        });

        // Use EXECUTION DIRECTION for opening trades
        onBatchOpen({ ...settings.simulation, symbol: 'BATCH', batchDirection: settings.simulation.executionDirection, batchCount: topCandidates.length, batchPositionSize: settings.simulation.positionSize, batchTpPercent: settings.simulation.takeProfitPercent, batchAutoReopen: settings.simulation.autoReopen, batchSource: 'TOP_GAINERS', customCandidates: symbols, customPrices: prices, batchTimeBasis: '24H', batchMinVolume: 0 });
        if (!isSimulating) { onToggleSim(); audioService.speak(`系统已自动启动。`); } else { audioService.speak(`开始执行批量开仓。`); }
    };

    // --- EMA CROSS LOGIC (Enhanced for Module 4 Precision) ---
    const checkEmaCross = async () => {
        if (emaTimeframes.length === 0 || isAnalyzingEma) return;
        if (filteredModalResults.length === 0) return;

        setIsAnalyzingEma(true);
        // We will update state cumulatively
        
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const symbolsToCheck = filteredModalResults.map(s => s.symbol).slice(0, 30); // Limit to top 30

        try {
            for (const symbol of symbolsToCheck) {
                const sortedTFs = emaTimeframes.sort((a, b) => {
                    const idxA = AVAILABLE_EMA_TF.findIndex(t => t.val === a);
                    const idxB = AVAILABLE_EMA_TF.findIndex(t => t.val === b);
                    return idxA - idxB;
                });

                for (const tf of sortedTFs) {
                    try {
                        // Fetch 120 candles to support lookback and EMA80 calculation
                        const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=120`, { cache: 'no-store' });
                        if (!res.ok) continue;
                        const data = await res.json();
                        if (!Array.isArray(data) || data.length < 100) continue;

                        const closes = data.map((k: any) => parseFloat(k[4]));
                        const highs = data.map((k: any) => parseFloat(k[2]));
                        const lows = data.map((k: any) => parseFloat(k[3]));
                        // data[x][0] is open time

                        const ema10s = calculateEMA(closes, 10);
                        const ema20s = calculateEMA(closes, 20);
                        const ema30s = calculateEMA(closes, 30);
                        const ema40s = calculateEMA(closes, 40);
                        const ema80s = calculateEMA(closes, 80); // Added EMA80 for Precision Pick

                        // Helper: Get EMA at specific candle index
                        const getEmaAt = (p: number, idx: number) => {
                            const arr = p === 10 ? ema10s : p === 20 ? ema20s : p === 30 ? ema30s : p === 40 ? ema40s : ema80s;
                            // calculateEMA returns array starting from period-1 relative to input
                            const offset = idx - (p - 1);
                            return (offset >= 0 && offset < arr.length) ? arr[offset] : null;
                        };

                        const lastIdx = closes.length - 1;
                        
                        // 1. Identify Crosses in the last 10 candles
                        // We strictly want the LATEST state swap.
                        let latestCrossIdx = -1;

                        for (let i = lastIdx; i >= Math.max(0, lastIdx - 10); i--) {
                             const e10 = getEmaAt(10, i);
                             const e20 = getEmaAt(20, i);
                             const e30 = getEmaAt(30, i);
                             const e40 = getEmaAt(40, i);
                             if (e10 === null || e20 === null || e30 === null || e40 === null) continue;

                             const h = highs[i];
                             const l = lows[i];
                             
                             // Check Cross (EMA inside candle)
                             const isCross = [e10, e20, e30, e40].every(e => e >= l && e <= h);

                             if (isCross) {
                                 // List 2: Add Cross Event (Historical tracking allowed here)
                                 const openTime = new Date(data[i][0]);
                                 const timeStr = `${openTime.getHours().toString().padStart(2,'0')}:${openTime.getMinutes().toString().padStart(2,'0')}`;
                                 const label = AVAILABLE_EMA_TF.find(t => t.val === tf)?.label || tf;
                                 const recordKey = `${label} ${timeStr}`; 
                                
                                 setEmaCrossResults(prev => {
                                     const history = prev[symbol] || [];
                                     if (history.some(rec => rec.label === recordKey)) return prev;
                                     const newRecord: EmaRecord = {
                                         id: Math.random().toString(36).substr(2,9),
                                         tf: tf,
                                         time: timeStr,
                                         timestamp: data[i][0],
                                         label: recordKey
                                     };
                                     return { ...prev, [symbol]: [newRecord, ...history] }; 
                                 });

                                 // Track latest cross for Trend logic
                                 if (latestCrossIdx === -1) {
                                     latestCrossIdx = i;
                                 }
                             }
                        }

                        // 2. Check List 3: Trend Alignment & List 4: Precision Pick
                        if (latestCrossIdx !== -1) {
                             const i = latestCrossIdx;
                             let trend: 'LONG' | 'SHORT' | null = null;
                             const endCheck = Math.min(lastIdx, i + 10);

                             // Scan forward from the cross point up to 10 candles
                             for (let j = i; j <= endCheck; j++) {
                                 const je10 = getEmaAt(10, j);
                                 const je20 = getEmaAt(20, j);
                                 const je30 = getEmaAt(30, j);
                                 const je40 = getEmaAt(40, j);
                                 const je80 = getEmaAt(80, j); // Added for Precision check
                                 
                                 if (!je10 || !je20 || !je30 || !je40 || !je80) continue;

                                 // Strict Divergence Check (Original List 3 Logic)
                                 if (je10 > je20 && je20 > je30 && je30 > je40) {
                                     trend = 'LONG';
                                     
                                     // --- List 4 Logic Injection: Precision Pick (Long) ---
                                     // Condition: 10 > 20 > 30 > 40 > 80 AND Within Window
                                     const dist = lastIdx - i;
                                     if (dist <= precisionWindow && je40 > je80) {
                                         // Check Trigger: Current Price (closes[lastIdx]) > Cross Candle High
                                         const crossHigh = highs[i];
                                         const currentPrice = closes[lastIdx];
                                         if (currentPrice > crossHigh) {
                                             handlePrecisionEntry(symbol, tf, 'LONG', currentPrice, crossHigh, dist);
                                         }
                                     }
                                     break; // Found trend
                                 }
                                 if (je10 < je20 && je20 < je30 && je30 < je40) {
                                     trend = 'SHORT';

                                     // --- List 4 Logic Injection: Precision Pick (Short) ---
                                     // Condition: 10 < 20 < 30 < 40 < 80 AND Within Window
                                     const dist = lastIdx - i;
                                     if (dist <= precisionWindow && je40 < je80) {
                                         // Check Trigger: Current Price (closes[lastIdx]) < Cross Candle Low
                                         const crossLow = lows[i];
                                         const currentPrice = closes[lastIdx];
                                         if (currentPrice < crossLow) {
                                             handlePrecisionEntry(symbol, tf, 'SHORT', currentPrice, crossLow, dist);
                                         }
                                     }
                                     break; 
                                 }
                             }

                             // Update State List 3: Remove OLD record for this Symbol+TF, Add NEW if valid
                             if (trend) {
                                 const openTime = new Date(data[i][0]);
                                 const timeStr = `${openTime.getHours().toString().padStart(2,'0')}:${openTime.getMinutes().toString().padStart(2,'0')}`;
                                 const dist = lastIdx - i; 

                                 setEmaTrendList(prev => {
                                     const filtered = prev.filter(p => !(p.symbol === symbol && p.tf === tf));
                                     return [{
                                         id: Math.random().toString(36).substr(2,9),
                                         symbol: symbol,
                                         tf: tf,
                                         direction: trend!,
                                         timestamp: data[i][0], 
                                         time: timeStr,
                                         distance: dist
                                     }, ...filtered]; 
                                 });
                             } else {
                                 setEmaTrendList(prev => prev.filter(p => !(p.symbol === symbol && p.tf === tf)));
                             }
                        } else {
                             setEmaTrendList(prev => prev.filter(p => !(p.symbol === symbol && p.tf === tf)));
                        }

                    } catch (err) {
                        // Ignore individual fetch errors
                    }
                    await delay(50); 
                }
            }
        } catch (e) {
            console.error("EMA Check Error", e);
        } finally {
            setIsAnalyzingEma(false);
        }
    };

    // --- MODULE 4 Helper: Handle Precision Entry ---
    const handlePrecisionEntry = (symbol: string, tf: string, direction: 'LONG' | 'SHORT', currentPrice: number, triggerPrice: number, distance: number) => {
        // Add to List 4 UI
        // FIXED: USE SYMBOL AS UNIQUE KEY TO PREVENT DUPLICATES FOR THE SAME COIN
        const signalKey = symbol; 
        
        setPrecisionList(prev => {
            // Avoid duplicates in UI
            if (prev.some(p => p.symbol === symbol && p.tf === tf)) return prev.map(p => 
                (p.symbol === symbol && p.tf === tf) ? { ...p, currentPrice, distance, direction } : p
            );
            
            return [{
                id: Math.random().toString(36).substr(2, 9),
                symbol,
                tf,
                direction,
                currentPrice,
                triggerPrice,
                distance,
                timestamp: Date.now(),
                status: 'READY'
            }, ...prev];
        });

        // AUTO ENTRY LOGIC (Use Ref for live state)
        if (precisionAutoRef.current) {
            // Check if already opened this session/cycle
            // FIXED: STRICT CHECK BY SYMBOL ONLY
            if (!openedPrecisionSignalsRef.current.has(signalKey)) {
                
                // *** FIX: Ensure simulation is running (position list updates) ***
                if (!isSimulating) {
                    onToggleSim();
                    audioService.speak("自动策略触发，系统已启动运行。");
                }

                // Execute Open
                // We use onBatchOpen with count=1 to simulate a single open with the correct params
                onBatchOpen({ 
                    ...settings.simulation, 
                    symbol: 'BATCH', // Ignored
                    batchDirection: direction, // Force correct direction
                    batchCount: 1, 
                    batchPositionSize: precisionAmount, // Use precision amount
                    batchTpPercent: 0, // Use system settings logic (Module 2)
                    batchAutoReopen: false,
                    batchSource: 'POOL',
                    batchTimeBasis: '24H',
                    batchMinVolume: 0,
                    customCandidates: [symbol],
                    customPrices: { [symbol]: currentPrice }
                });
                
                audioService.speak(`精准策略触发: ${symbol} ${direction === 'LONG' ? '做多' : '做空'}`);
                
                // Update Ref and State
                const newSet = new Set(openedPrecisionSignalsRef.current).add(signalKey);
                setOpenedPrecisionSignals(newSet);
                openedPrecisionSignalsRef.current = newSet;
                
                // Update UI status - MARK ALL ENTRIES FOR THIS SYMBOL AS OPENED
                setPrecisionList(prev => prev.map(p => 
                    (p.symbol === symbol) ? { ...p, status: 'OPENED' } : p
                ));
            }
        }
    };

    // Auto Refresh Effect
    useEffect(() => {
        let interval: any;
        if (autoRefreshEma && emaTimeframes.length > 0) {
            // Run initially
            if (!isAnalyzingEma) checkEmaCross();
            
            // Set interval (e.g. 1 minute)
            interval = setInterval(() => {
                if (!isAnalyzingEma) checkEmaCross();
            }, 60000); 
        }
        return () => clearInterval(interval);
    }, [autoRefreshEma, emaTimeframes]);


    const ModuleHeader = ({ id, icon: Icon, title, subtitle, active, colorClass }: any) => (
        <button 
            onClick={() => toggleModule(id)}
            className={`w-full flex items-center justify-between p-4 border-b border-slate-800 transition-all ${active ? 'bg-slate-800' : 'bg-slate-900 hover:bg-slate-800/50'}`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center border border-white/10 ${active ? colorClass : 'bg-slate-800 text-slate-500'}`}>
                    <Icon size={16} />
                </div>
                <div className="text-left">
                    <div className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-400'}`}>{id}. {title}</div>
                    <div className="text-[10px] text-slate-600">{subtitle}</div>
                </div>
            </div>
            <div className={`text-xs font-mono transition-transform ${active ? 'rotate-90 text-slate-300' : 'text-slate-600'}`}>
                {active ? '▼' : '▶'}
            </div>
        </button>
    );

    const AlertConfigRow = ({ label, category, unit, desc }: { label: string, category: keyof AppSettings['audio'], unit: string, desc?: string }) => {
        const conf = settings.audio[category] as ThreeLevelAlert;
        if (!conf) return null;
        return (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300">{label}</span>
                    <div className="flex gap-2">
                        <button onClick={() => updateAudioAlert(category, 'voice', !conf.voice)} className={`p-1 rounded ${conf.voice ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700'}`} title="语音"><Volume2 size={12} /></button>
                        <button onClick={() => updateAudioAlert(category, 'popup', !conf.popup)} className={`p-1 rounded ${conf.popup ? 'bg-amber-900/50 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700'}`} title="弹窗"><MessageSquare size={12} /></button>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {conf.levels.map((lvl, idx) => (
                        <div key={idx} className="relative">
                            <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-center text-white focus:border-cyan-500 outline-none" value={lvl} onChange={(e) => updateAudioLevel(category, idx, e.target.value)} placeholder="0" />
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">{unit}</span>
                        </div>
                    ))}
                </div>
                {desc && <div className="text-[9px] text-slate-600">{desc}</div>}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-300 custom-scrollbar overflow-y-auto select-none">
            
            {/* MODULE 1-5 (No Changes, kept for context) ... */}
            {/* MODULE 1 */}
            <ModuleHeader id={1} icon={settings.audio?.enabled ? Volume2 : VolumeX} title="智能监控" subtitle={settings.audio?.enabled ? "Voice Active" : "Disabled"} active={expandedModule === 1} colorClass="bg-cyan-900/50 text-cyan-400" />
            {expandedModule === 1 && (
                <div className="p-4 bg-slate-800/30 space-y-3 border-b border-slate-800">
                     <AlertConfigRow label="1. 持仓量" category="positionSize" unit="U" />
                     <AlertConfigRow label="2. 个别币盈利" category="symbolProfit" unit="%" />
                     <AlertConfigRow label="3. 总账户盈利" category="totalProfit" unit="%" />
                     <AlertConfigRow label="4. 个别币亏损" category="symbolLoss" unit="%" />
                     <AlertConfigRow label="5. 总账户亏损" category="totalLoss" unit="%" />
                </div>
            )}

            {/* MODULE 2: 止盈止损 */}
            <ModuleHeader id={2} icon={Target} title="止盈止损" subtitle="Profit & Stop Loss" active={expandedModule === 2} colorClass="bg-emerald-900/50 text-emerald-400" />
            {expandedModule === 2 && (
                <div className="bg-slate-800/30 border-b border-slate-800 animate-in fade-in">
                    
                    {/* 2.1 盈利平仓 (Profit Closing) */}
                    <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={14} className="text-emerald-400"/>
                                <span className="text-xs font-bold text-emerald-400">盈利平仓主目录</span>
                            </div>
                            <div onClick={() => handleChange('profit', 'enabled', !settings.profit.enabled)} className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.profit.enabled ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.profit.enabled ? 'translate-x-4' : 'translate-x-0'}`}/>
                            </div>
                        </div>

                        {settings.profit.enabled && (
                            <>
                                {/* Mode Tabs */}
                                <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                                    {['CONVENTIONAL', 'DYNAMIC', 'SMART', 'GLOBAL'].map((mode) => {
                                        const labels: any = { CONVENTIONAL: '常规', DYNAMIC: '动态', SMART: '智能', GLOBAL: '全局' };
                                        const isActive = settings.profit.profitMode === mode;
                                        return (
                                            <button
                                                key={mode}
                                                onClick={() => handleChange('profit', 'profitMode', mode)}
                                                className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${isActive ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                {labels[mode]}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="bg-slate-900/40 p-3 rounded border border-slate-700/50">
                                    {/* CONVENTIONAL */}
                                    {settings.profit.profitMode === 'CONVENTIONAL' && (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">持仓大于 (U)</label>
                                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.profit.conventional.minPosition} onChange={(e) => updateNested('profit', 'conventional', 'minPosition', parseFloat(e.target.value))} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">平仓比例 (%)</label>
                                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.profit.conventional.closePercent} onChange={(e) => updateNested('profit', 'conventional', 'closePercent', parseFloat(e.target.value))} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">盈利大于 (%)</label>
                                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.profit.conventional.profitPercent} onChange={(e) => updateNested('profit', 'conventional', 'profitPercent', parseFloat(e.target.value))} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">或回调大于 (%)</label>
                                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-amber-400" value={settings.profit.conventional.callbackPercent} onChange={(e) => updateNested('profit', 'conventional', 'callbackPercent', parseFloat(e.target.value))} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* DYNAMIC (Ladder) */}
                                    {settings.profit.profitMode === 'DYNAMIC' && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 block mb-1">触发持仓门槛 (U)</label>
                                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.profit.dynamic.minPosition} onChange={(e) => updateNested('profit', 'dynamic', 'minPosition', parseFloat(e.target.value))} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex text-[9px] text-slate-500 px-1">
                                                    <span className="w-8">层级</span>
                                                    <span className="flex-1 text-center">盈利 &ge; %</span>
                                                    <span className="flex-1 text-center">回调 &ge; %</span>
                                                    <span className="flex-1 text-right">平仓 %</span>
                                                </div>
                                                {settings.profit.dynamic.tiers.map((tier, idx) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        <span className="text-[9px] text-slate-600 w-8">L{idx + 1}</span>
                                                        <input type="number" className="flex-1 w-full bg-slate-800 border border-slate-700 rounded px-1 py-1 text-xs text-emerald-400 text-center" value={tier.profit} onChange={(e) => updateDynamicTier(idx, 'profit', parseFloat(e.target.value))} />
                                                        <input type="number" className="flex-1 w-full bg-slate-800 border border-slate-700 rounded px-1 py-1 text-xs text-amber-400 text-center" value={tier.callback} onChange={(e) => updateDynamicTier(idx, 'callback', parseFloat(e.target.value))} />
                                                        <input type="number" className="flex-1 w-full bg-slate-800 border border-slate-700 rounded px-1 py-1 text-xs text-white text-right" value={tier.close} onChange={(e) => updateDynamicTier(idx, 'close', parseFloat(e.target.value))} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* SMART */}
                                    {settings.profit.profitMode === 'SMART' && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 block mb-1">启动盈利阈值 (%)</label>
                                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.profit.smart.activationProfit} onChange={(e) => updateNested('profit', 'smart', 'activationProfit', parseFloat(e.target.value))} />
                                            </div>
                                            <div className="p-2 bg-indigo-900/20 rounded border border-indigo-500/20 text-[10px] text-slate-400 leading-relaxed">
                                                <span className="text-indigo-400 font-bold block mb-1">智能动态逻辑：</span>
                                                当盈利大于{settings.profit.smart.activationProfit}%后，启动动态回撤机制。回撤比例随盈利增加而线性降低：
                                                <br/>- 盈利20%时允许回撤80%（保住4%利润）
                                                <br/>- 盈利40%时允许回撤60%（保住16%利润）
                                                <br/>- 盈利80%时允许回撤20%（保住64%利润）
                                                <br/>- 盈利100%时允许回撤0%（锁定100%利润）
                                            </div>
                                        </div>
                                    )}

                                    {/* GLOBAL */}
                                    {settings.profit.profitMode === 'GLOBAL' && (
                                        <div className="space-y-4">
                                             <div className="p-2 border border-slate-700 rounded bg-slate-800/30">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] text-slate-400">1. 按账户比例 (%)</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[9px] text-slate-500 block">总盈 &ge; % (0关)</label>
                                                        <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-emerald-400" value={settings.profit.global.profitPercent} onChange={(e) => updateNested('profit', 'global', 'profitPercent', parseFloat(e.target.value))} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-slate-500 block">总亏 &ge; % (0关)</label>
                                                        <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-red-400" value={settings.profit.global.lossPercent} onChange={(e) => updateNested('profit', 'global', 'lossPercent', parseFloat(e.target.value))} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-2 border border-slate-700 rounded bg-slate-800/30">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] text-slate-400">2. 按账户金额 (U)</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[9px] text-slate-500 block">总盈 &ge; U (0关)</label>
                                                        <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-emerald-400" value={settings.profit.global.profitAmount} onChange={(e) => updateNested('profit', 'global', 'profitAmount', parseFloat(e.target.value))} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-slate-500 block">总亏 &ge; U (0关)</label>
                                                        <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-red-400" value={settings.profit.global.lossAmount} onChange={(e) => updateNested('profit', 'global', 'lossAmount', parseFloat(e.target.value))} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-[9px] text-slate-500 text-center">* 触发任一条件时，所有仓位全部清仓。</div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* 2.2 止损平仓 */}
                    <div className="border-t border-slate-800 bg-slate-900/30">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <TrendingDown size={14} className="text-red-400"/>
                                    <span className="text-xs font-bold text-red-400">止损平仓主目录</span>
                                </div>
                                <div onClick={() => updateNested('profit', 'stopLoss', 'enabled', !settings.profit.stopLoss.enabled)} className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.profit.stopLoss.enabled ? 'bg-red-600' : 'bg-slate-700'}`}>
                                    <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.profit.stopLoss.enabled ? 'translate-x-4' : 'translate-x-0'}`}/>
                                </div>
                            </div>
                            
                            <div className={`space-y-3 ${!settings.profit.stopLoss.enabled && 'opacity-40 pointer-events-none'}`}>
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">单币持仓大于 (U)</label>
                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.profit.stopLoss.minPosition} onChange={(e) => updateNested('profit', 'stopLoss', 'minPosition', parseFloat(e.target.value))} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">亏损大于 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.profit.stopLoss.lossPercent} onChange={(e) => updateNested('profit', 'stopLoss', 'lossPercent', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">平仓数量 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.profit.stopLoss.closePercent} onChange={(e) => updateNested('profit', 'stopLoss', 'closePercent', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODULE 3: HEDGING */}
            <ModuleHeader id={3} icon={Shield} title="防爆对冲" subtitle="Explosion-proof Hedge" active={expandedModule === 3} colorClass="bg-indigo-900/50 text-indigo-400" />
            {expandedModule === 3 && (
                <div className="p-4 bg-slate-800/30 space-y-4 border-b border-slate-800">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400">对冲总开关</span>
                        <div onClick={() => handleChange('hedging', 'enabled', !settings.hedging.enabled)} className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.hedging.enabled ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.hedging.enabled ? 'translate-x-4' : 'translate-x-0'}`}/>
                        </div>
                    </div>
                    {settings.hedging.enabled && (
                        <>
                             <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">持仓触发门槛 (U) <span>{settings.hedging.minPosition}</span></label>
                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1" value={settings.hedging.minPosition} onChange={(e) => handleChange('hedging', 'minPosition', parseFloat(e.target.value))} />
                             </div>
                             <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">亏损触发值 <span>-{settings.hedging.triggerLossPercent}%</span></label>
                                <input type="range" min="1" max="50" step="0.5" className="w-full accent-indigo-500 h-1 bg-slate-700 rounded" value={settings.hedging.triggerLossPercent} onChange={(e) => handleChange('hedging', 'triggerLossPercent', parseFloat(e.target.value))} />
                             </div>
                             <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">对冲仓位比例 <span>{settings.hedging.hedgeRatio}%</span></label>
                                <input type="range" min="50" max="150" step="10" className="w-full accent-indigo-500 h-1 bg-slate-700 rounded" value={settings.hedging.hedgeRatio} onChange={(e) => handleChange('hedging', 'hedgeRatio', parseFloat(e.target.value))} />
                             </div>
                             
                             {/* New Safe Clear Logic */}
                             <div className="mt-3 border-t border-slate-700/50 pt-3">
                                 <div className="flex items-center justify-between mb-2">
                                     <span className="text-[11px] font-bold text-indigo-300">防爆对冲安全止损清仓</span>
                                     <div onClick={() => handleChange('hedging', 'safeClearEnabled', !settings.hedging.safeClearEnabled)} className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.hedging.safeClearEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                         <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.hedging.safeClearEnabled ? 'translate-x-4' : 'translate-x-0'}`}/>
                                     </div>
                                 </div>
                                 
                                 {settings.hedging.safeClearEnabled && (
                                     <>
                                         <div className="grid grid-cols-2 gap-2">
                                             <div>
                                                 <label className="text-[10px] text-slate-500 block mb-1">任一盈利 &ge; %</label>
                                                 <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.hedging.safeClearProfit} onChange={(e) => handleChange('hedging', 'safeClearProfit', parseFloat(e.target.value))} />
                                             </div>
                                             <div>
                                                 <label className="text-[10px] text-slate-500 block mb-1">任一亏损 &ge; %</label>
                                                 <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.hedging.safeClearLoss} onChange={(e) => handleChange('hedging', 'safeClearLoss', parseFloat(e.target.value))} />
                                             </div>
                                         </div>
                                         <div className="mt-2 p-2 bg-amber-900/10 border border-amber-500/20 rounded text-[9px] text-amber-500/80 leading-relaxed">
                                             ⚠️ 功能限制说明：开启此选项后，所有处于【对冲状态】的仓位将<strong>屏蔽</strong>常规止盈与止损策略，仅依据上方设定的【安全清仓】比例执行多空双开平仓。未对冲的独立仓位不受影响。
                                         </div>
                                     </>
                                 )}
                             </div>
                        </>
                    )}
                </div>
            )}

            {/* MODULE 4: HEDGE PROFIT EXIT */}
            <ModuleHeader id={4} icon={AlertTriangle} title="防爆对冲盈利出局" subtitle="Hedge Profit Exit" active={expandedModule === 4} colorClass="bg-red-900/50 text-red-400" />
            {expandedModule === 4 && (
                <div className="p-4 bg-slate-800/30 space-y-4 border-b border-slate-800">
                    
                    {/* Warning Text */}
                    <div className="text-[10px] text-amber-500 bg-amber-900/10 p-2 rounded border border-amber-500/20 flex items-center gap-2">
                        <AlertTriangle size={12} />
                        此功能需要有丰富交易经验的交易员，使用需谨慎。
                    </div>

                    {/* Function 1: Original Position Profit Clear */}
                    <div className="space-y-2 border border-slate-700/50 rounded bg-slate-900/30 p-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-700/50 mb-2">
                            <span className="text-xs text-blue-400 font-bold">1. 原仓盈利解套</span>
                            <div 
                                onClick={() => toggleModule4Feature('originalProfitClear')} 
                                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.stopLoss.originalProfitClear ? 'bg-blue-600' : 'bg-slate-700'}`}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.stopLoss.originalProfitClear ? 'translate-x-4' : 'translate-x-0'}`}/>
                            </div>
                        </div>
                        {settings.stopLoss.originalProfitClear && (
                            <div className="space-y-2 animate-in fade-in">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲仓硬止损 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.stopLoss.hedgeStopLossPercent} onChange={(e) => handleChange('stopLoss', 'hedgeStopLossPercent', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">覆盖盈余阈值 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.stopLoss.originalCoverPercent} onChange={(e) => handleChange('stopLoss', 'originalCoverPercent', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-500 bg-slate-800/50 p-1.5 rounded leading-relaxed border border-slate-700/30">
                                    当原仓位自然回本盈利，且盈利金额覆盖【对冲仓位止损亏损】并多出 {settings.stopLoss.originalCoverPercent}% 时，清空双向仓位。
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Function 2: Hedge Profit Clear */}
                    <div className="space-y-2 border border-slate-700/50 rounded bg-slate-900/30 p-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-700/50 mb-2">
                            <span className="text-xs text-indigo-400 font-bold">2. 对冲盈利解套</span>
                            <div 
                                onClick={() => toggleModule4Feature('hedgeProfitClear')} 
                                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.stopLoss.hedgeProfitClear ? 'bg-indigo-600' : 'bg-slate-700'}`}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.stopLoss.hedgeProfitClear ? 'translate-x-4' : 'translate-x-0'}`}/>
                            </div>
                        </div>
                        {settings.stopLoss.hedgeProfitClear && (
                            <div className="space-y-2 animate-in fade-in">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲加仓倍率 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.stopLoss.hedgeOpenRatio} onChange={(e) => handleChange('stopLoss', 'hedgeOpenRatio', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">覆盖盈余阈值 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.stopLoss.hedgeCoverPercent} onChange={(e) => handleChange('stopLoss', 'hedgeCoverPercent', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                     <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲仓位止损 (Hedge SL) %</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.stopLoss.hedgeProfitClearStopLoss} onChange={(e) => handleChange('stopLoss', 'hedgeProfitClearStopLoss', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-500 bg-slate-800/50 p-1.5 rounded leading-relaxed border border-slate-700/30">
                                    当对冲仓位盈利覆盖【原仓位当前亏损】并多出 {settings.stopLoss.hedgeCoverPercent}% 时，清空双向仓位。
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Function 3: Callback Profit Clear */}
                    <div className="space-y-2 border border-slate-700/50 rounded bg-slate-900/30 p-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-700/50 mb-2">
                            <span className="text-xs text-amber-400 font-bold">3. 回调盈利清仓</span>
                            <div 
                                onClick={() => toggleModule4Feature('callbackProfitClear')} 
                                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.stopLoss.callbackProfitClear ? 'bg-amber-600' : 'bg-slate-700'}`}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.stopLoss.callbackProfitClear ? 'translate-x-4' : 'translate-x-0'}`}/>
                            </div>
                        </div>
                        {settings.stopLoss.callbackProfitClear && (
                            <div className="space-y-2 animate-in fade-in">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲盈利目标 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.stopLoss.callbackTargetProfit} onChange={(e) => handleChange('stopLoss', 'callbackTargetProfit', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">回调比例 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-amber-400" value={settings.stopLoss.callbackRate} onChange={(e) => handleChange('stopLoss', 'callbackRate', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲止损 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.stopLoss.callbackStopLoss} onChange={(e) => handleChange('stopLoss', 'callbackStopLoss', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">覆盖亏损盈利阈值 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.stopLoss.callbackCoverPercent} onChange={(e) => handleChange('stopLoss', 'callbackCoverPercent', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-500 bg-slate-800/50 p-1.5 rounded leading-relaxed border border-slate-700/30">
                                    设定防爆对冲盈利达到 {settings.stopLoss.callbackTargetProfit}% 后回调 {settings.stopLoss.callbackRate}%，或对冲仓位止损 {settings.stopLoss.callbackStopLoss}%。当【回调产生的盈利】覆盖【原仓位当前亏损 + 对冲止损之和】并多出 {settings.stopLoss.callbackCoverPercent}% 时，原仓位执行清仓。
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODULE 5: 自动交易 */}
            <ModuleHeader 
                id={5} 
                icon={RefreshCw} 
                title="自动交易" 
                subtitle="Auto / Sim / Scan" 
                active={expandedModule === 5}
                colorClass="bg-cyan-900/50 text-cyan-400"
            />
            {expandedModule === 5 && (
                 <div className="p-4 bg-slate-800/30 space-y-4 border-b border-slate-800">
                    <div className="flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700">
                        <span className="text-xs font-bold text-slate-300">模拟交易系统</span>
                        <button 
                            onClick={onToggleSim}
                            className={`px-3 py-1 rounded text-[10px] font-bold flex items-center gap-1 ${isSimulating ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                        >
                            {isSimulating ? <Pause size={10}/> : <Play size={10}/>}
                            {isSimulating ? '运行中' : '已暂停'}
                        </button>
                    </div>
                    
                    <button 
                        onClick={onOpenScanner}
                        className="w-full py-2 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-400 rounded text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <BarChart2 size={14}/> 打开智能扫描器
                    </button>
                </div>
            )}

            {/* MODULE 6: 模拟开仓 */}
            <ModuleHeader 
                id={6} 
                icon={Layers} 
                title="模拟开仓" 
                subtitle="Simulation Execution" 
                active={expandedModule === 6}
                colorClass="bg-blue-900/50 text-blue-400"
            />
            {expandedModule === 6 && (
                <div className="p-4 bg-slate-800/30 space-y-4 border-b border-slate-800">
                     {/* 1. Time Scope */}
                     <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>时间范围 (Time Basis)</span>
                            <span className="text-blue-400 font-bold">{settings.simulation.filterTimeBasis === '8AM' ? '当日8点至今' : '过去24小时'}</span>
                        </div>
                        <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                             <button 
                                onClick={() => handleChange('simulation', 'filterTimeBasis', '8AM')}
                                className={`flex-1 py-1 text-[10px] rounded transition-colors ${settings.simulation.filterTimeBasis === '8AM' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                             >
                                 Today (8AM)
                             </button>
                             <button 
                                onClick={() => handleChange('simulation', 'filterTimeBasis', '24H')}
                                className={`flex-1 py-1 text-[10px] rounded transition-colors ${settings.simulation.filterTimeBasis === '24H' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                             >
                                 Rolling 24H
                             </button>
                        </div>
                     </div>
                     
                     {/* 2. Decoupled Scan & Execution Controls - UPDATED UI */}
                     <div className="grid grid-cols-2 gap-3 mt-2">
                         {/* Control: Execution Direction */}
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">执行策略 (Strategy)</label>
                             <select 
                                className={`w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold outline-none ${settings.simulation.executionDirection === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}
                                value={settings.simulation.executionDirection} 
                                onChange={(e) => handleChange('simulation', 'executionDirection', e.target.value)}
                             >
                                 <option value="LONG" className="text-emerald-400">做多 (Long)</option>
                                 <option value="SHORT" className="text-red-400">做空 (Short)</option>
                             </select>
                         </div>
                         {/* Control: Volume */}
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">交易额 (百万U)</label>
                             <input 
                                type="number" 
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500"
                                value={settings.simulation.filterMinVolume}
                                onChange={(e) => handleChange('simulation', 'filterMinVolume', parseFloat(e.target.value))}
                             />
                        </div>
                     </div>

                     {/* 3. Scan Target (Radio Selection) & Threshold Input */}
                     <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50 mt-2">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] text-slate-500 font-bold">扫描过滤 (Filter)</label>
                            
                            {/* NEW: AUTO SCAN TOGGLE */}
                            <div 
                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer select-none border transition-colors ${autoScanEnabled ? 'bg-cyan-900/30 border-cyan-500/30' : 'bg-slate-800 border-slate-700'}`}
                                onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                            >
                                <Clock size={10} className={autoScanEnabled ? 'text-cyan-400' : 'text-slate-500'}/>
                                <span className={`text-[9px] font-bold ${autoScanEnabled ? 'text-cyan-400' : 'text-slate-500'}`}>
                                    {autoScanEnabled ? '自动 (15m)' : '自动关闭'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="radio" 
                                    name="scanSource" 
                                    value="GAINERS"
                                    checked={(!settings.simulation.scanSource || settings.simulation.scanSource === 'GAINERS')}
                                    onChange={() => handleChange('simulation', 'scanSource', 'GAINERS')}
                                    className="accent-emerald-500 w-3 h-3"
                                />
                                <span className={`text-xs ${(!settings.simulation.scanSource || settings.simulation.scanSource === 'GAINERS') ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                                    涨幅榜 (Gainers)
                                </span>
                            </label>
                            
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="radio" 
                                    name="scanSource" 
                                    value="LOSERS"
                                    checked={settings.simulation.scanSource === 'LOSERS'}
                                    onChange={() => handleChange('simulation', 'scanSource', 'LOSERS')}
                                    className="accent-red-500 w-3 h-3"
                                />
                                <span className={`text-xs ${settings.simulation.scanSource === 'LOSERS' ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                                    跌幅榜 (Losers)
                                </span>
                            </label>
                        </div>

                        {/* Conditional Input based on Radio Selection */}
                        <div>
                            {(!settings.simulation.scanSource || settings.simulation.scanSource === 'GAINERS') ? (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1 duration-200">
                                    <span className="text-[10px] text-slate-400 w-16">涨幅 &ge;</span>
                                    <input 
                                        type="number" 
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400 focus:border-emerald-500" 
                                        value={settings.simulation.filterMinChangeUp} 
                                        onChange={(e) => handleChange('simulation', 'filterMinChangeUp', parseFloat(e.target.value))} 
                                    />
                                    <span className="text-[10px] text-slate-500">%</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-1 duration-200">
                                    <span className="text-[10px] text-slate-400 w-16">跌幅 &ge;</span>
                                    <input 
                                        type="number" 
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400 focus:border-red-500" 
                                        value={settings.simulation.filterMinChangeDown} 
                                        onChange={(e) => handleChange('simulation', 'filterMinChangeDown', parseFloat(e.target.value))} 
                                    />
                                    <span className="text-[10px] text-slate-500">%</span>
                                </div>
                            )}
                        </div>
                     </div>

                     {/* 4. Scan Button */}
                     <button 
                        onClick={handleScan}
                        disabled={isFetching}
                        className="w-full h-[32px] mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow-lg shadow-blue-900/20"
                     >
                        {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {isFetching ? '正在扫描市场...' : '开始执行扫描 (Start Scan)'}
                     </button>

                     {/* Results Window */}
                     <div className="mt-2 border border-slate-700 rounded bg-slate-900/50 flex flex-col h-32 relative">
                         {usingMock && (
                            <div className="absolute top-0 right-0 bg-slate-800 text-[8px] text-slate-400 px-1 rounded-bl border-b border-l border-slate-700 flex items-center gap-1 z-10">
                                <WifiOff size={8} /> 模拟数据
                            </div>
                         )}
                         <div className="flex text-[9px] text-slate-500 bg-slate-950 p-1.5 border-b border-slate-700 items-center">
                             <div className="w-6 text-center text-slate-600">#</div>
                             <div className="flex-1 pl-1">
                                 币种 
                                 {sortedScanResults.length > 0 && <span className="text-blue-400 ml-1">({settings.simulation.selectCount}/{sortedScanResults.length})</span>}
                             </div>
                             <div className="w-16 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1" onClick={() => handleSort('volume')}>
                                 额(M) {sortConfig.key === 'volume' ? (sortConfig.dir === 'desc' ? <ArrowDown size={8}/> : <ArrowUp size={8}/>) : null}
                             </div>
                             <div className="w-16 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1" onClick={() => handleSort('change')}>
                                 涨跌 {sortConfig.key === 'change' ? (sortConfig.dir === 'desc' ? <ArrowDown size={8}/> : <ArrowUp size={8}/>) : null}
                             </div>
                         </div>
                         <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
                             {sortedScanResults.length === 0 ? (
                                 <div className="h-full flex items-center justify-center text-[9px] text-slate-600">
                                     暂无数据 (请先扫描)
                                 </div>
                             ) : (
                                 sortedScanResults.map((item, idx) => {
                                     const isSelected = idx < settings.simulation.selectCount;
                                     return (
                                        <div key={item.symbol} className={`flex text-[10px] items-center p-1 rounded border-b border-slate-800/30 ${isSelected ? 'bg-slate-800 border-l-2 border-blue-500 pl-0.5' : 'opacity-50'}`}>
                                            <div className="w-6 text-center text-slate-600 font-mono text-[9px]">{idx + 1}</div>
                                            <div className="flex-1 font-bold text-slate-300 pl-1">{item.symbol.replace('USDT','')}</div>
                                            <div className="w-16 text-right text-slate-400">{item.volume.toFixed(0)}</div>
                                            <div className={`w-16 text-right font-mono ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                                            </div>
                                        </div>
                                     );
                                 })
                             )}
                         </div>
                     </div>

                     {/* NEW BUTTON */}
                     <button 
                        onClick={() => setShowDetailModal(true)}
                        className="w-full mt-1 mb-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-400 flex items-center justify-center gap-1 transition-colors hover:text-white"
                     >
                        <Maximize2 size={10} /> 查看完整筛选详情 (6列视图)
                     </button>

                     <div className="h-px bg-slate-700/50 my-1"></div>

                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">选择前 N 个</label>
                             <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.simulation.selectCount} onChange={(e) => handleChange('simulation', 'selectCount', parseFloat(e.target.value))} />
                         </div>
                         <div className="flex flex-col justify-end">
                            <div className="flex items-center justify-between px-1 bg-slate-800/50 rounded h-[26px]">
                                <label className="text-[10px] text-slate-500">平仓后续开</label>
                                <div onClick={() => handleChange('simulation', 'autoReopen', !settings.simulation.autoReopen)} className={`w-6 h-3 rounded-full p-0.5 transition-colors cursor-pointer ${settings.simulation.autoReopen ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                    <div className={`w-2 h-2 bg-white rounded-full shadow transition-transform ${settings.simulation.autoReopen ? 'translate-x-3' : 'translate-x-0'}`}/>
                                </div>
                            </div>
                         </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">开仓金额 (U)</label>
                             <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.simulation.positionSize} onChange={(e) => handleChange('simulation', 'positionSize', parseFloat(e.target.value))} />
                         </div>
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">模拟止盈 (%)</label>
                             <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.simulation.takeProfitPercent} onChange={(e) => handleChange('simulation', 'takeProfitPercent', parseFloat(e.target.value))} />
                         </div>
                     </div>

                     <button 
                        onClick={handleExecute}
                        disabled={sortedScanResults.length === 0}
                        className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
                     >
                         <Layers size={14} />
                         执行模拟开仓 (自动运行)
                     </button>

                     {/* NEW MODAL RENDERED CONDITIONALLY */}
                     {showDetailModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[95vw] h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                                {/* MODAL HEADER WITH EXTENDED CONTROLS */}
                                <div className="p-4 border-b border-slate-800 bg-slate-950 rounded-t-lg shrink-0 flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <Layers size={20} className="text-blue-400"/>
                                                <h3 className="font-bold text-white text-lg">筛选结果详情 (Details)</h3>
                                            </div>
                                            {/* FILTER INPUT */}
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                                                <input 
                                                    type="text" 
                                                    placeholder="搜索币种 (Search Symbol)..." 
                                                    className="bg-slate-800 border border-slate-700 rounded-full pl-9 pr-4 py-1.5 text-xs text-white w-64 focus:outline-none focus:border-blue-500 transition-all"
                                                    value={modalSearch}
                                                    onChange={(e) => setModalSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => setShowDetailModal(false)} 
                                                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                                                title="最小化"
                                            >
                                                <Minus size={20}/>
                                            </button>
                                            <button 
                                                onClick={() => setShowDetailModal(false)} 
                                                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                                                title="关闭"
                                            >
                                                <X size={20}/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* GRID HEADER WITH EMBEDDED CONTROLS - UPDATED TO 6 COLUMNS */}
                                <div className="grid grid-cols-6 gap-px bg-slate-800 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase text-center shrink-0">
                                    <div className="bg-slate-900 p-3 text-left pl-4 flex items-center">1. 筛选结果 (Data)</div>
                                    
                                    {/* LIST 2: EMA */}
                                    <div className="bg-slate-900 p-1 pl-4 flex flex-col items-start gap-2">
                                        <div className="flex items-center w-full justify-between pr-2">
                                            <span className="whitespace-nowrap mr-2 text-slate-400">2. EMA 穿越 (Cross)</span>
                                            
                                            {/* Top: Timeframes */}
                                            <div className="flex items-center gap-1 flex-wrap justify-end">
                                                {AVAILABLE_EMA_TF.map(tf => (
                                                    <button
                                                        key={tf.val}
                                                        onClick={() => {
                                                            setEmaTimeframes(prev => prev.includes(tf.val) ? prev.filter(t => t !== tf.val) : [...prev, tf.val]);
                                                        }}
                                                        className={`px-1 py-0.5 rounded text-[8px] font-bold border ${emaTimeframes.includes(tf.val) ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}
                                                    >
                                                        {tf.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end w-full gap-2 pr-2">
                                            {/* Bottom: Controls */}
                                            <div 
                                                className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer select-none border ${autoRefreshEma ? 'bg-emerald-900/30 border-emerald-500/30' : 'bg-slate-800 border-slate-700'}`}
                                                onClick={() => setAutoRefreshEma(!autoRefreshEma)}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${autoRefreshEma ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                                <span className={`text-[8px] font-bold ${autoRefreshEma ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {autoRefreshEma ? '自动' : '关'}
                                                </span>
                                            </div>

                                            <button 
                                                onClick={checkEmaCross}
                                                disabled={isAnalyzingEma || emaTimeframes.length === 0}
                                                className="px-2 py-0.5 bg-slate-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded text-[8px] font-bold flex items-center gap-1 transition-all"
                                            >
                                                {isAnalyzingEma ? <Loader2 size={8} className="animate-spin"/> : <RefreshCw size={8}/>}
                                                检测
                                            </button>
                                        </div>
                                    </div>

                                    {/* LIST 3: Trend */}
                                    <div className="bg-slate-900 p-3 flex items-center justify-center">3. 趋势对齐 (Trend) (EMA顺序排列)</div>
                                    
                                    {/* LIST 4: Precision Pick (UPDATED) */}
                                    <div className="bg-slate-900 p-1 flex flex-col justify-center gap-1">
                                        <span className="text-[10px] text-orange-400 font-bold">4. 精准选币 (Precision Pick)</span>
                                        <div className="flex flex-wrap items-center justify-center gap-1 px-1">
                                            <div className="flex items-center gap-1 bg-slate-800 rounded px-1">
                                                <span className="text-[8px] text-slate-500">K线</span>
                                                <input 
                                                    type="number" 
                                                    className="w-6 bg-transparent text-[8px] text-white text-center focus:outline-none" 
                                                    value={precisionWindow}
                                                    onChange={(e) => setPrecisionWindow(parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <div className="flex items-center gap-1 bg-slate-800 rounded px-1">
                                                <span className="text-[8px] text-slate-500">U</span>
                                                <input 
                                                    type="number" 
                                                    className="w-10 bg-transparent text-[8px] text-white text-center focus:outline-none" 
                                                    value={precisionAmount}
                                                    onChange={(e) => setPrecisionAmount(parseFloat(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const newAutoState = !precisionAuto;
                                                setPrecisionAuto(newAutoState);
                                                precisionAutoRef.current = newAutoState;
                                                
                                                if (newAutoState) {
                                                    // Auto-enable Auto-Refresh to ensure feed
                                                    if (!autoRefreshEma) {
                                                        setAutoRefreshEma(true);
                                                    }

                                                    // Trigger execution for existing READY signals immediately
                                                    const newOpened = new Set(openedPrecisionSignalsRef.current);
                                                    let executedCount = 0;
                                                    
                                                    // Use current list state
                                                    const pendingItems = precisionList.filter(p => p.status === 'READY');
                                                    
                                                    if (pendingItems.length > 0) {
                                                        // Ensure sim is running first
                                                        if (!isSimulating) {
                                                            onToggleSim();
                                                        }

                                                        pendingItems.forEach(p => {
                                                            // STRICTLY CHECK SYMBOL TO PREVENT DUPLICATES
                                                            const signalKey = p.symbol;
                                                            if (!newOpened.has(signalKey)) {
                                                                executedCount++;
                                                                onBatchOpen({ 
                                                                    ...settings.simulation, 
                                                                    symbol: 'BATCH',
                                                                    batchDirection: p.direction,
                                                                    batchCount: 1, 
                                                                    batchPositionSize: precisionAmount,
                                                                    batchTpPercent: 0, 
                                                                    batchAutoReopen: false,
                                                                    batchSource: 'POOL',
                                                                    batchTimeBasis: '24H',
                                                                    batchMinVolume: 0,
                                                                    customCandidates: [p.symbol],
                                                                    customPrices: { [p.symbol]: p.currentPrice }
                                                                });
                                                                newOpened.add(signalKey);
                                                            }
                                                        });

                                                        if (executedCount > 0) {
                                                            setOpenedPrecisionSignals(newOpened);
                                                            openedPrecisionSignalsRef.current = newOpened;
                                                            
                                                            // Update status: MARK ALL ENTRIES FOR THESE SYMBOLS AS OPENED
                                                            setPrecisionList(prev => prev.map(p => {
                                                                const k = p.symbol;
                                                                return (newOpened.has(k)) ? { ...p, status: 'OPENED' } : p;
                                                            }));
                                                            
                                                            audioService.speak(`自动运行已启动，执行 ${executedCount} 个信号。`);
                                                        } else {
                                                            audioService.speak("自动运行已开启。无新信号。");
                                                        }
                                                    } else {
                                                        audioService.speak("自动运行已开启，等待新信号。");
                                                    }
                                                } else {
                                                    audioService.speak("自动开仓已停止。");
                                                }
                                            }}
                                            className={`w-full flex items-center justify-center gap-1 px-1 py-1 rounded text-[9px] font-bold border transition-colors ${precisionAuto ? 'bg-orange-600 hover:bg-orange-500 text-white border-orange-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'}`}
                                        >
                                            {precisionAuto ? <Pause size={10} fill="currentColor"/> : <Play size={10} fill="currentColor"/>}
                                            {precisionAuto ? '停止开仓' : '自动运行'}
                                        </button>
                                    </div>

                                    <div className="bg-slate-900 p-3 flex items-center justify-center">5. 波动率 (ATR)</div>
                                    <div className="bg-slate-900 p-3 flex items-center justify-center">6. 形态识别 (Pattern)</div>
                                </div>

                                {/* CONTENT CONTAINER - 6 INDEPENDENT COLUMNS */}
                                <div className="flex-1 grid grid-cols-6 gap-px bg-slate-800 overflow-hidden">
                                    
                                    {/* LIST 1: FILTERED DATA */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {filteredModalResults.map((item, idx) => {
                                            const originalIndex = sortedScanResults.indexOf(item);
                                            const isSelected = originalIndex < settings.simulation.selectCount;
                                            return (
                                                <div key={item.symbol} className={`bg-slate-900 p-2 flex flex-col justify-center border-b border-slate-800 ${isSelected ? 'border-l-2 border-blue-500 pl-1.5' : ''}`}>
                                                    <div className="flex items-center justify-between text-[10px]">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className={`font-mono w-5 h-5 flex items-center justify-center rounded shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                                                {originalIndex + 1}
                                                            </span>
                                                            <span className="font-bold text-slate-200 truncate">{item.symbol.replace('USDT','')}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 font-mono">
                                                            <span className="text-slate-500">{item.volume.toFixed(0)}M</span>
                                                            <span className={`font-bold w-12 text-right ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filteredModalResults.length === 0 && <div className="p-4 text-center text-slate-500 text-[10px]">无数据</div>}
                                    </div>

                                    {/* LIST 2: EMA CROSS EVENTS (Grouped by Symbol) */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {groupedEmaCrossList.length === 0 && <div className="p-4 text-center text-slate-500 text-[10px]">暂无穿越事件</div>}
                                        {groupedEmaCrossList.map((item) => (
                                            <div key={item.symbol} className="bg-slate-900/50 border-b border-slate-800 p-2">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-xs font-bold text-slate-200">{item.symbol.replace('USDT','')}</span>
                                                    <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 rounded-full">{item.groups.reduce((acc, g) => acc + g.count, 0)}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {item.groups.map(g => (
                                                        <button
                                                            key={g.tf}
                                                            onClick={() => setChartModalInfo({ symbol: item.symbol, tf: g.tf })}
                                                            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-1.5 py-0.5 transition-colors group"
                                                        >
                                                            <span className="text-[9px] font-bold text-orange-300">{g.label}</span>
                                                            {g.count > 1 && <span className="text-[8px] text-slate-500 bg-slate-900 px-1 rounded-full">{g.count}</span>}
                                                            <span className="text-[8px] text-slate-600 group-hover:text-slate-400 ml-0.5">{g.latestTime}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* LIST 3: TREND ALIGNMENT */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {groupedTrendList.length === 0 && <div className="p-4 text-center text-slate-500 text-[10px]">暂无趋势对齐</div>}
                                        {groupedTrendList.map((item) => (
                                            <div key={item.symbol} className="bg-slate-900/50 border-b border-slate-800 p-2">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-xs font-bold text-slate-200">{item.symbol.replace('USDT','')}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {item.chips.map(c => (
                                                        <button
                                                            key={`${c.tf}-${c.dir}`}
                                                            onClick={() => setChartModalInfo({ symbol: item.symbol, tf: c.tf, highlightTimestamp: c.timestamp })}
                                                            className={`flex items-center gap-1 border rounded px-1.5 py-0.5 transition-colors hover:bg-slate-700 ${
                                                                c.dir === 'LONG' 
                                                                ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' 
                                                                : 'bg-red-900/20 text-red-400 border-red-500/30'
                                                            }`}
                                                        >
                                                            <span className="text-[9px] font-bold">{c.label} {c.time} ({c.distance}根)</span>
                                                            <span className="text-[9px] font-bold">{c.dir === 'LONG' ? '多' : '空'}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* LIST 4: PRECISION PICK (UPDATED) */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {precisionList.length === 0 && <div className="p-4 text-center text-slate-500 text-[10px]">等待精准信号...</div>}
                                        {precisionList.map((item) => (
                                            <div key={item.id} className="bg-slate-900 border-b border-slate-800 p-2 flex flex-col gap-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold text-slate-200">{item.symbol.replace('USDT','')}</span>
                                                    <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 rounded">{item.tf}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <span className={`font-bold ${item.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {item.direction === 'LONG' ? '做多 (Long)' : '做空 (Short)'}
                                                    </span>
                                                    <span className="text-slate-500">距{item.distance}根</span>
                                                </div>
                                                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                                                    <span>现: {item.currentPrice.toFixed(4)}</span>
                                                    <span>触: {item.triggerPrice.toFixed(4)}</span>
                                                </div>
                                                
                                                {/* Action Button */}
                                                {item.status === 'OPENED' ? (
                                                    <div className="mt-1 w-full bg-slate-800 text-slate-500 text-[9px] text-center py-1 rounded font-bold">
                                                        已开仓 (Opened)
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handlePrecisionEntry(item.symbol, item.tf, item.direction, item.currentPrice, item.triggerPrice, item.distance)}
                                                        className="mt-1 w-full bg-orange-600 hover:bg-orange-500 text-white text-[9px] text-center py-1 rounded font-bold transition-colors"
                                                    >
                                                        开仓 {precisionAmount}U
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* LIST 5: MOCK PLACEHOLDER */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {[1,2,3].map(i => (
                                            <div key={i} className="p-2 text-[10px] text-slate-600 text-center border-b border-slate-800/50">等待数据...</div>
                                        ))}
                                    </div>

                                    {/* LIST 6: MOCK PLACEHOLDER */}
                                    <div className="bg-slate-950 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                        {[1,2,3].map(i => (
                                            <div key={i} className="p-2 text-[10px] text-slate-600 text-center border-b border-slate-800/50">等待数据...</div>
                                        ))}
                                    </div>

                                </div>
                                
                                <div className="p-4 border-t border-slate-800 bg-slate-900 rounded-b-lg flex justify-between items-center text-xs shrink-0">
                                    <div className="text-slate-500 flex gap-4">
                                        <span>已选数量 (Selected): <span className="text-white font-bold">{Math.min(sortedScanResults.length, settings.simulation.selectCount)}</span></span>
                                        <span>待选数量 (Pending): <span className="text-slate-600">{Math.max(0, sortedScanResults.length - settings.simulation.selectCount)}</span></span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => setShowDetailModal(false)}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold transition-colors"
                                        >
                                            关闭窗口
                                        </button>
                                        <button 
                                            onClick={() => { setShowDetailModal(false); handleExecute(); }}
                                            disabled={sortedScanResults.length === 0}
                                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded font-bold transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2"
                                        >
                                            <Layers size={14}/> 确认并执行
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CHART MODAL */}
                    {chartModalInfo && (
                        <KlineChartModal 
                            symbol={chartModalInfo.symbol} 
                            timeframe={chartModalInfo.tf} 
                            highlightTimestamp={chartModalInfo.highlightTimestamp}
                            onClose={() => setChartModalInfo(null)} 
                        />
                    )}
                </div>
            )}

            {/* MODULE 7: 系统恢复 */}
            <ModuleHeader 
                id={7} 
                icon={Database} 
                title="系统恢复" 
                subtitle="Backup & Restore" 
                active={expandedModule === 7}
                colorClass="bg-slate-700 text-slate-200"
            />
            {expandedModule === 7 && (
                <div className="p-4 bg-slate-800/30 space-y-5 border-b border-slate-800">
                     <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 uppercase mb-2">
                             <Layout size={10} /> 1. 备份内容范围 (Content)
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-slate-900 p-2 rounded border border-slate-700/50 flex justify-between items-center">
                                <span className="text-slate-500">系统设置</span> 
                                <span className="text-emerald-400 font-bold">已包含</span>
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-700/50 flex justify-between items-center">
                                <span className="text-slate-500">账户权益</span> 
                                <span className="text-white font-mono">{systemStats.balance.toFixed(0)} U</span>
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-700/50 flex justify-between items-center">
                                <span className="text-slate-500">当前持仓</span> 
                                <span className="text-white font-mono">{systemStats.positionCount} 单</span>
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-700/50 flex justify-between items-center">
                                <span className="text-slate-500">交易日志</span> 
                                <span className="text-white font-mono">{systemStats.tradeCount} 条</span>
                            </div>
                        </div>
                     </div>

                     <div>
                         <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase mb-2">
                             <Save size={10} /> 2. 执行备份 (Backup)
                        </div>
                        <div className="flex flex-col gap-2">
                             <button 
                                onClick={onBackup}
                                disabled={isBackingUp}
                                className="w-full flex items-center justify-between p-2.5 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-xs text-slate-300 transition-all"
                             >
                                <span className="flex items-center gap-2"><Save size={12}/> 立即备份系统 (Save Snapshot)</span>
                                {isBackingUp && <Loader2 size={12} className="animate-spin" />}
                             </button>
                             
                             <button 
                                onClick={onRestore}
                                disabled={isRestoring}
                                className="w-full flex items-center justify-between p-2.5 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-xs text-slate-300 transition-all"
                             >
                                <span className="flex items-center gap-2"><RotateCcw size={12}/> 恢复最近备份 (Restore Local)</span>
                                {isRestoring && <Loader2 size={12} className="animate-spin" />}
                             </button>
                        </div>
                     </div>
                     
                     <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400 uppercase mb-2">
                             <FileJson size={10} /> 3. 文件管理 (File)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={onExport}
                                className="flex items-center justify-center gap-1 p-2 bg-slate-800 hover:bg-blue-900/30 border border-slate-700 hover:border-blue-500/30 rounded text-[10px] text-slate-300 hover:text-blue-400 transition-all"
                            >
                                <Download size={10} /> 导出配置
                            </button>
                            <label className="flex items-center justify-center gap-1 p-2 bg-slate-800 hover:bg-emerald-900/30 border border-slate-700 hover:border-emerald-500/30 rounded text-[10px] text-slate-300 hover:text-emerald-400 transition-all cursor-pointer">
                                <Upload size={10} /> 导入配置
                                <input type="file" accept=".json" className="hidden" onChange={onImport} />
                            </label>
                        </div>
                     </div>

                     <div className="pt-2 border-t border-slate-800/50 space-y-2">
                        <button 
                            onClick={onViewSource}
                            className="w-full py-2 flex items-center justify-center gap-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors border border-slate-700"
                        >
                            <Code size={12} /> 查看/备份所有源码 (View Source)
                        </button>

                        <button 
                            onClick={onFactoryReset}
                            className="w-full py-2 flex items-center justify-center gap-2 text-[10px] text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                        >
                            <AlertTriangle size={10} /> 重置所有设置 (Factory Reset)
                        </button>
                     </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPanel;