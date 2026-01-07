
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import SettingsPanel from './components/SettingsPanel';
import ScannerDashboard from './components/ScannerDashboard';
import Logs from './components/Logs';
import TradeLogModal from './components/TradeLogModal';
import SourceCodeModal from './components/SourceCodeModal';
import { MarketSimulator } from './services/marketSimulator';
import { BackgroundTimer } from './services/backgroundTask'; // Import Worker Timer
import { audioService } from './services/audioService'; // Import Audio Service
import { AppSettings, Position, AccountData, LogEntry, TradeLog, SimulationSettings, PositionSide, ScannerSettings, ALL_BINANCE_SYMBOLS, SystemEvent, BackupData, STATIC_PRICES } from './types';
import { Shield, Activity, Lock, MessageSquare, Zap, BatteryCharging, Power, Sun } from 'lucide-react';

const INITIAL_SETTINGS: AppSettings = {
    audio: { 
        enabled: true,
        positionSize: { voice: true, popup: true, levels: [1000, 5000, 10000] },
        symbolProfit: { voice: true, popup: false, levels: [5, 10, 20] },
        totalProfit:  { voice: true, popup: true, levels: [1, 5, 10] },
        symbolLoss:   { voice: true, popup: true, levels: [5, 10, 20] },
        totalLoss:    { voice: true, popup: true, levels: [1, 5, 10] },
        marginRatio:  { voice: true, popup: true, levels: [80, 50, 30] }
    },
    profit: {
        enabled: false, 
        profitMode: 'CONVENTIONAL',
        conventional: { minPosition: 100, profitPercent: 1, callbackPercent: 0, closePercent: 100 },
        dynamic: { 
            minPosition: 100,
            tiers: [
                { profit: 4, callback: 50, close: 100 },
                { profit: 6, callback: 40, close: 100 },
                { profit: 10, callback: 30, close: 100 },
                { profit: 15, callback: 20, close: 100 }
            ]
        },
        smart: { activationProfit: 10 },
        global: { profitPercent: 0, lossPercent: 0, profitAmount: 0, lossAmount: 0 },
        stopLoss: { enabled: false, minPosition: 100, lossPercent: 10, closePercent: 100 }
    },
    stopLoss: { 
        enabled: true, 
        lossThreshold: 20, 
        positionThreshold: 50,
        originalProfitClear: false,
        hedgeStopLossPercent: 1,
        originalCoverPercent: 50,
        hedgeProfitClear: false,
        hedgeOpenRatio: 150,  // Modified: Default 150% for Strategy 4.2
        hedgeCoverPercent: 5,
        hedgeProfitClearStopLoss: 1,
        callbackProfitClear: false,
        callbackTargetProfit: 2,
        callbackRate: 1,
        callbackStopLoss: 1,
        callbackCoverPercent: 5,
        callbackHedgeRatio: 150 // Modified: Default 150% for Strategy 4.3
    }, 
    hedging: { 
        enabled: true, 
        triggerLossPercent: 1,
        hedgeRatio: 100,
        minPosition: 1000,
        safeClearEnabled: false,
        safeClearProfit: 10,
        safeClearLoss: 10
    },
    martingale: {
        enabled: false,
        dropPercent: 1.0,
        volumeMultiplier: 1.5,
        maxSteps: 5,
        takeProfit: 1.0,
        firstBuyAmount: 0, // Default 0 (Use current position size)
        direction: 'BOTH', // Default BOTH
        isRunning: false // Default Stopped
    },
    victoryOut: { enabled: false, activationProfit: 0.8, retraceCallback: 0.1 },
    winningOut: { enabled: true, disableOtherCloseOnHedge: true },
    simulation: {
        filterTimeBasis: '24H', // Modified: Default to 24H
        filterMinVolume: 1,     // Modified: Default to 1M
        filterMinChangeUp: 1,   // Modified: Default to 1%
        filterMinChangeDown: 3,
        filterSort: 'DESC',
        selectCount: 100,       // Modified: Default to 100
        executionDirection: 'LONG',
        scanSource: 'GAINERS',
        positionSize: 10000,
        takeProfitPercent: 2,
        autoReopen: true,       // Modified: Default to true (Loop)
        symbol: 'BTCUSDT',
        batchDirection: 'RANDOM',
        batchCount: 3, 
        batchPositionSize: 500,
        batchTpPercent: 2,
        batchAutoReopen: false,
        batchSource: 'POOL',
        batchTimeBasis: '24H',
        batchMinVolume: 10,
        customCandidates: []
    },
    smartTrade: { enabled: true },
    scanner: {
        volumeThreshold: 20,
        changeFrom8amUp: 3,
        changeFrom8amDown: 3,
        amplitudeMin: 2,
        amplitudeMax: 15,
        bodyRatio: 60,
        breakoutBuffer: 0.2,
        alertCountLong: 3,
        alertCountShort: 3,
        autoOpen: false,
        openAmount: 100,
        scanTimeframes: ['15m', '4h']
    },
    system: { binanceApiKey: '', binanceApiSecret: '' }
};

const App: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
    const [positions, setPositions] = useState<Position[]>([]);
    const [account, setAccount] = useState<AccountData>({ marginBalance: 50000, totalBalance: 50000, marginRatio: 999, maintenanceMargin: 0 });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
    const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
    const [realPrices, setRealPrices] = useState<Record<string, number>>(STATIC_PRICES);
    const [isSimulating, setIsSimulating] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [showLogs, setShowLogs] = useState(true);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [tradeLogFilter, setTradeLogFilter] = useState('');
    const [showSourceModal, setShowSourceModal] = useState(false);
    
    // Background Mode & Wake Lock Status
    const [bgModeActive, setBgModeActive] = useState(false);
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const wakeLockRef = useRef<any>(null);
    
    const positionsRef = useRef(positions);
    const isSimulatingRef = useRef(isSimulating);
    const simulatorRef = useRef<MarketSimulator | null>(null);

    // Timing & Worker Refs
    const backgroundTimerRef = useRef<BackgroundTimer | null>(null);
    const lastFastLoopTime = useRef(0);
    const isFastLoopRunning = useRef(false);
    const isSlowLoopRunning = useRef(false);

    useEffect(() => { positionsRef.current = positions; }, [positions]);
    useEffect(() => { isSimulatingRef.current = isSimulating; }, [isSimulating]);

    // 初始化 Simulator
    useEffect(() => {
        simulatorRef.current = new MarketSimulator(
            account, positions, settings,
            (acc, pos, lgs, hedge, tLogs) => {
                setAccount({...acc});
                setPositions([...pos]);
                if (lgs) setLogs([...lgs]);
                if (tLogs) setTradeLogs([...tLogs]);
            },
            tradeLogs, systemEvents, logs
        );
        // Feed initial static prices to simulator
        simulatorRef.current.updateRealPrices(STATIC_PRICES);
    }, []);

    // --- Wake Lock API Implementation ---
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                // If already active, don't re-request unless necessary, but logic here allows retry
                const lock = await (navigator as any).wakeLock.request('screen');
                wakeLockRef.current = lock;
                setWakeLockActive(true);
                
                lock.addEventListener('release', () => {
                    setWakeLockActive(false);
                    console.log('Wake Lock released');
                });
                console.log('Wake Lock active');
            }
        } catch (err: any) {
            // Fix: Handle policy error gracefully to prevent crash/console spam
            if (err.name === 'NotAllowedError') {
                console.warn('Wake Lock request denied by permissions policy. Keeping screen on is disabled.');
                // Do not retry repeatedly if denied
            } else {
                console.error('Wake Lock failed:', err);
            }
            setWakeLockActive(false);
        }
    };

    // Manual Trigger for Background Mode (Audio + WakeLock)
    const handleManualBackgroundActivation = () => {
        audioService.enableBackgroundMode();
        setBgModeActive(true);
        requestWakeLock();
    };

    // Re-request wake lock when visibility changes (if user tabs away and comes back)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wakeLockActive) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [wakeLockActive]);

    // --- Background Worker & Audio Orchestration ---
    useEffect(() => {
        // 1. Initialize Background Timer (Worker)
        backgroundTimerRef.current = new BackgroundTimer(() => {
            handleTick();
        });
        
        // 2. Start Timer
        backgroundTimerRef.current.start();
        
        // 3. Enable Audio Keep Alive & Wake Lock on interaction
        const enableBackgroundFeatures = () => {
             audioService.enableBackgroundMode();
             setBgModeActive(true);
             requestWakeLock();
             
             // Remove listeners once enabled
             document.removeEventListener('click', enableBackgroundFeatures);
             document.removeEventListener('touchstart', enableBackgroundFeatures);
             document.removeEventListener('keydown', enableBackgroundFeatures);
        };
        document.addEventListener('click', enableBackgroundFeatures);
        document.addEventListener('touchstart', enableBackgroundFeatures);
        document.addEventListener('keydown', enableBackgroundFeatures);

        return () => {
            backgroundTimerRef.current?.stop();
            if (wakeLockRef.current) wakeLockRef.current.release();
            document.removeEventListener('click', enableBackgroundFeatures);
            document.removeEventListener('touchstart', enableBackgroundFeatures);
            document.removeEventListener('keydown', enableBackgroundFeatures);
        };
    }, []);

    // Central Tick Handler (Driven by Web Worker every 100ms)
    const handleTick = () => {
        const now = Date.now();
        
        // Watchdog: If loop stuck for > 10s, force reset
        if (isFastLoopRunning.current && now - lastFastLoopTime.current > 10000) {
             console.warn("Watchdog: Resetting stuck loop");
             isFastLoopRunning.current = false;
        }

        // Execute Fast Loop Logic (Throttle to 1000ms = 1s)
        if (now - lastFastLoopTime.current >= 1000 && !isFastLoopRunning.current) {
            lastFastLoopTime.current = now;
            runFastLoop();
        } else if (simulatorRef.current && isSimulatingRef.current) {
            // Check logic on minor ticks if needed
        }
    };

    const runFastLoop = async () => {
        isFastLoopRunning.current = true;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s Network Timeout

        try {
            // Only update active positions to save bandwidth/processing
            const activeSymbols = Array.from(new Set(positionsRef.current.map(p => p.symbol)));
            
            if (activeSymbols.length > 0) {
                const symbolParams = JSON.stringify(activeSymbols);
                const targetedRes = await fetch(
                    `https://fapi.binance.com/fapi/v1/ticker/price?symbols=${encodeURIComponent(symbolParams)}`, 
                    { cache: 'no-store', signal: controller.signal }
                );
                
                if (targetedRes.ok) {
                    const tData = await targetedRes.json();
                    const targetedPrices: Record<string, number> = {};
                    tData.forEach((t: any) => { targetedPrices[t.symbol] = parseFloat(t.price); });
                    
                    if (simulatorRef.current) {
                        simulatorRef.current.updateRealPrices(targetedPrices);
                        simulatorRef.current.tick(isSimulatingRef.current);
                    }
                    
                    setRealPrices(prev => ({ ...prev, ...targetedPrices }));
                }
            } else if (simulatorRef.current) {
                // Keep engine alive for internal logic (auto-reopen queues, etc.)
                simulatorRef.current.tick(isSimulatingRef.current);
            }
        } catch (e) {
            // Ignore timeout/abort errors
        } finally {
            clearTimeout(timeoutId);
            isFastLoopRunning.current = false;
        }
    };

    useEffect(() => {
        if (simulatorRef.current) simulatorRef.current.updateSettings(settings);
    }, [settings]);

    // Memoize callbacks to prevent child re-renders (Scanner resetting issue)
    const handleBatchOpen = useCallback((simSettings: SimulationSettings) => {
        simulatorRef.current?.openBatchPositions(
            simSettings.symbol, simSettings.batchDirection, simSettings.batchCount,
            simSettings.batchPositionSize, simSettings.batchTpPercent, 
            simSettings.batchAutoReopen, simSettings.batchSource, 
            simSettings.batchTimeBasis, simSettings.batchMinVolume, 
            simSettings.customCandidates, simSettings.customPrices
        );
    }, []);

    const handleScannerOpenPosition = useCallback((symbol: string, side: PositionSide, amount: number, price: number) => {
        simulatorRef.current?.openPosition(symbol, side, amount, price, undefined, false, undefined, false, true);
        if (!isSimulatingRef.current) {
            setIsSimulating(true);
            audioService.speak('系统已跟随开仓自动启动');
        }
    }, []);

    const handleSettingsChange = useCallback((section: keyof AppSettings, key: string, value: any) => {
        setSettings(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    }, []);

    const handleToggleSim = useCallback(() => setIsSimulating(prev => !prev), []);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden">
            <header className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-md z-50">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center shadow-lg">
                        <Shield size={14} className="text-white" />
                    </div>
                    <h1 className="font-bold text-xs tracking-wide text-slate-100 flex items-center gap-2">
                        防爆仓救世之星 <span className="text-[9px] text-slate-500">v12.25.0112 (Ultra-Low Latency Futures)</span>
                    </h1>
                </div>
                {/* Background Mode & Wake Lock Indicator */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={requestWakeLock}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold transition-all cursor-pointer ${wakeLockActive ? 'bg-amber-900/20 border-amber-500/30 text-amber-400' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`} 
                        title="点击尝试激活屏幕常亮"
                    >
                        <Sun size={10} />
                        {wakeLockActive ? '屏幕常亮: ON' : '屏幕常亮: OFF'}
                    </button>
                    <button 
                        onClick={handleManualBackgroundActivation}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold transition-all cursor-pointer ${bgModeActive ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                        title="点击手动激活后台保活"
                    >
                        {bgModeActive ? <Zap size={10} fill="currentColor" /> : <Power size={10} />}
                        {bgModeActive ? '后台保活: 已激活' : '后台保活: 点击激活'}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex min-h-0 flex-row relative">
                <div className="w-80 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-20 shadow-xl">
                    <SettingsPanel 
                        settings={settings} realPrices={realPrices}
                        previewData={ALL_BINANCE_SYMBOLS.map(s => ({ symbol: s }))} 
                        handleChange={handleSettingsChange}
                        onBatchOpen={handleBatchOpen}
                        onFactoryReset={() => {}} 
                        onOpenScanner={() => setShowScanner(true)}
                        onToggleSim={handleToggleSim}
                        isSimulating={isSimulating}
                        systemStats={{ balance: account.marginBalance, positionCount: positions.length, tradeCount: tradeLogs.length, logCount: logs.length }}
                        onViewSource={() => setShowSourceModal(true)}
                    />
                </div>

                <div className="flex-1 flex flex-col min-w-0 p-2 gap-2 bg-slate-950">
                    <div className="flex-1 min-h-0">
                        <Dashboard 
                            account={account} positions={positions} tradeLogs={tradeLogs}
                            onRowLongPress={() => {}} onShowHistory={() => {}} hasHistory={() => false}
                            onClearPositions={() => simulatorRef.current?.batchCloseAllPositions()}
                            onClosePosition={(sym, side) => simulatorRef.current?.closePosition(sym, side)}
                            onDeletePosition={(sym, side) => simulatorRef.current?.closePosition(sym, side, 'REMOVE')}
                            onBatchClose={() => simulatorRef.current?.batchCloseAllPositions()}
                            onOpenChart={() => {}} onOpenLogs={() => setShowLogs(!showLogs)}
                            onOpenTradeModal={() => { setTradeLogFilter(''); setShowTradeModal(true); }}
                            isSimulating={isSimulating} onToggleSimulation={handleToggleSim}
                            onShowSymbolTradeLogs={(symbol) => { setTradeLogFilter(symbol); setShowTradeModal(true); }}
                            onEmergencyHedge={() => simulatorRef.current?.triggerEmergencyHedge()}
                            onOpenScanner={() => setShowScanner(true)}
                            onUpdateLeverage={(sym, side, lev) => simulatorRef.current?.updateLeverage(sym, side, lev)}
                        />
                    </div>
                    {showLogs && <div className="h-48 shrink-0"><Logs logs={logs} /></div>}
                </div>
                
                {showTradeModal && <TradeLogModal tradeLogs={tradeLogs} positions={positions} systemEvents={systemEvents} onClose={() => setShowTradeModal(false)} initialSearch={tradeLogFilter} />}
                {showSourceModal && <SourceCodeModal onClose={() => setShowSourceModal(false)} />}
            </div>
            
            {showScanner && (
                <ScannerDashboard 
                    settings={settings.scanner} 
                    onClose={() => setShowScanner(false)} 
                    onOpenPosition={handleScannerOpenPosition} 
                    realPrices={realPrices} 
                />
            )}
        </div>
    );
};

export default App;
