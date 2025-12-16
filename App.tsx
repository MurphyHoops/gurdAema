import React, { useState, useRef, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import SettingsPanel from './components/SettingsPanel';
import ScannerDashboard from './components/ScannerDashboard';
import Logs from './components/Logs';
import TradeLogModal from './components/TradeLogModal';
import SourceCodeModal from './components/SourceCodeModal';
import { MarketSimulator } from './services/marketSimulator';
import { AppSettings, Position, AccountData, LogEntry, TradeLog, SimulationSettings, PositionSide, ScannerSettings, ALL_BINANCE_SYMBOLS, SystemEvent, BackupData, STATIC_PRICES } from './types';
import { Shield, Activity, Lock, MessageSquare, Download } from 'lucide-react';

// --- ABSOLUTE DEFENSE VERSION (12.08 02:20) ---
// Priority: Capital Preservation > Profit Taking
const INITIAL_SETTINGS: AppSettings = {
    audio: { 
        enabled: true,
        // NEW 3-LEVEL CONFIG
        positionSize: { voice: true, popup: true, levels: [1000, 5000, 10000] },
        symbolProfit: { voice: true, popup: false, levels: [5, 10, 20] },
        totalProfit:  { voice: true, popup: true, levels: [1, 5, 10] },
        symbolLoss:   { voice: true, popup: true, levels: [5, 10, 20] },
        totalLoss:    { voice: true, popup: true, levels: [1, 5, 10] },
        marginRatio:  { voice: true, popup: true, levels: [80, 50, 30] } // Alert when < 80%, < 50%, < 30%
    },
    profit: {
        enabled: false, 
        profitMode: 'CONVENTIONAL',
        
        // 1. 常规止盈
        conventional: { 
            minPosition: 100, 
            profitPercent: 1, 
            callbackPercent: 0, 
            closePercent: 100 
        },

        // 2. 动态止盈 (阶梯)
        dynamic: { 
            minPosition: 100,
            tiers: [
                { profit: 4, callback: 50, close: 100 },  // 4% profit, 50% callback -> close at 2%
                { profit: 6, callback: 40, close: 100 },  // 6% profit, 40% callback -> close at 3.6%
                { profit: 10, callback: 30, close: 100 }, // 10% profit, 30% callback -> close at 7%
                { profit: 15, callback: 20, close: 100 }  // 15% profit, 20% callback -> close at 12%
            ]
        },

        // 3. 智能止盈
        smart: { 
            activationProfit: 10 
        },

        // 4. 全局止盈
        global: { 
            profitPercent: 0,
            lossPercent: 0,
            profitAmount: 0,
            lossAmount: 0
        },

        // 5. 止损平仓 (Module 2 Internal)
        stopLoss: {
            enabled: false,
            minPosition: 100,
            lossPercent: 10,
            closePercent: 100
        }
    },
    stopLoss: { 
        enabled: true, 
        lossThreshold: 20, 
        positionThreshold: 50,
        // Module 4 Advanced Profit Exit Features
        originalProfitClear: false,
        hedgeStopLossPercent: 1, // Default to 1%
        originalCoverPercent: 50, // Default to 50%

        hedgeProfitClear: false,
        hedgeOpenRatio: 150,
        hedgeCoverPercent: 5,
        hedgeProfitClearStopLoss: 1, // NEW: Default 1%

        callbackProfitClear: false,
        callbackTargetProfit: 2, // Default to 2%
        callbackRate: 1, // Default to 1%
        callbackStopLoss: 1, // Default to 1%
        callbackCoverPercent: 5 // UPDATED: Default to 5% to ensure strict execution
    }, 
    hedging: { 
        enabled: true, 
        triggerLossPercent: 1, // Default to 1%
        hedgeRatio: 100, // 100% per request
        minPosition: 1000, // 1000U per request
        
        // NEW SAFE CLEAR SETTINGS
        safeClearEnabled: false,
        safeClearProfit: 10,
        safeClearLoss: 10
    },
    victoryOut: { 
        enabled: false, // Disabled in Defense Version
        activationProfit: 0.8, 
        retraceCallback: 0.1 
    },
    winningOut: { enabled: true, disableOtherCloseOnHedge: true },
    simulation: {
        // Advanced Filter Defaults
        filterTimeBasis: '8AM', // Default to Today 8AM
        filterMinVolume: 10, // Default 10 Million USDT
        filterMinChangeUp: 3,
        filterMinChangeDown: 3,
        filterSort: 'DESC',
        selectCount: 60, // UPDATED: Default 60 items
        executionDirection: 'LONG',
        scanSource: 'GAINERS', // Default scan source
        positionSize: 10000, // UPDATED: Default 10000 USDT
        takeProfitPercent: 2, // UPDATED: Back to 2% for quick simulation
        autoReopen: false,

        // Legacy defaults
        symbol: 'BTCUSDT',
        batchDirection: 'RANDOM',
        batchCount: 3, 
        batchPositionSize: 500,
        batchTpPercent: 2, // Back to 2%
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
    }
};

interface Notification {
    id: number;
    title: string;
    message: string;
}

const App: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
    const [positions, setPositions] = useState<Position[]>([]);
    const [account, setAccount] = useState<AccountData>({ marginBalance: 50000, totalBalance: 50000, marginRatio: 999, maintenanceMargin: 0 });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
    const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
    
    // Global Real Price Cache (Shared State)
    const [realPrices, setRealPrices] = useState<Record<string, number>>({});
    
    // Notifications State Kept but UI removed as per request
    const [notifications, setNotifications] = useState<Notification[]>([]);
    
    const [isSimulating, setIsSimulating] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [showLogs, setShowLogs] = useState(false); // Bottom Panel
    const [showTradeModal, setShowTradeModal] = useState(false); // Full Modal
    const [tradeLogFilter, setTradeLogFilter] = useState(''); // Added Filter State
    const [showSourceModal, setShowSourceModal] = useState(false); // New Source Code Modal
    
    // UI Feedback state
    const [isRestoring, setIsRestoring] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    
    // Mutable refs
    const positionsRef = useRef(positions);
    const accountRef = useRef(account);
    const logsRef = useRef(logs);
    const tradeLogsRef = useRef(tradeLogs);
    
    // Sync refs
    useEffect(() => { positionsRef.current = positions; }, [positions]);
    useEffect(() => { accountRef.current = account; }, [account]);
    useEffect(() => { logsRef.current = logs; }, [logs]);
    useEffect(() => { tradeLogsRef.current = tradeLogs; }, [tradeLogs]);

    const simulatorRef = useRef<MarketSimulator | null>(null);

    const addNotification = (title: string, message: string) => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, title, message }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    // Initialization
    useEffect(() => {
        simulatorRef.current = new MarketSimulator(
            accountRef.current,
            positionsRef.current,
            settings,
            (acc, pos, lgs, hedge, tLogs, evts, notif) => {
                setAccount({...acc});
                setPositions([...pos]);
                if (lgs.length !== logsRef.current.length) setLogs([...lgs]);
                if (tLogs && tLogs.length !== tradeLogsRef.current.length) setTradeLogs([...tLogs]);
                if (notif) addNotification(notif.title, notif.message);
            },
            tradeLogsRef.current,
            systemEvents,
            logsRef.current
        );
        
        // Initial Log - Restored Format
        setLogs(prev => [{
            id: 'init',
            timestamp: new Date(),
            type: 'INFO',
            message: 'System Online - Absolute Defense Mode (v12.08.0220)'
        }, ...prev]);

        // --- NEW: FETCH REAL PRICES ON STARTUP & POLL INTERVAL ---
        const fetchPrices = async () => {
            const endpoints = [
                'https://data-api.binance.vision/api/v3/ticker/price',
                'https://api.binance.com/api/v3/ticker/price',
                'https://api-gcp.binance.com/api/v3/ticker/price',
                'https://api.mexc.com/api/v3/ticker/price' // Fallback to MEXC
            ];

            for (const ep of endpoints) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
                    
                    const res = await fetch(ep, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) {
                            const priceMap: Record<string, number> = {};
                            data.forEach((t: any) => {
                                if (t.symbol && t.symbol.endsWith('USDT') && t.price) {
                                    priceMap[t.symbol] = parseFloat(t.price);
                                }
                            });
                            if (Object.keys(priceMap).length > 0) return priceMap;
                        }
                    }
                } catch (e) {
                    // Fail silently to try next endpoint
                }
            }
            // CRITICAL FIX: Return null instead of fallback to prevent data corruption
            return null;
        };

        const runPriceUpdate = () => {
             fetchPrices()
            .then(priceMap => {
                if (priceMap) {
                    setRealPrices(priceMap); // Store in React State
                    if (simulatorRef.current) {
                        simulatorRef.current.updateRealPrices(priceMap); // Push to Simulator
                    }
                }
                // If priceMap is null (all failed), DO NOTHING. Keep the old prices.
                // Do NOT revert to STATIC_PRICES.
            })
            .catch(err => {
                console.warn("Price update skipped (Network Error). Keeping previous prices.");
            });
        };

        // 1. Run Immediately
        runPriceUpdate();
        
        // 2. Poll every 1 second (High Frequency Update)
        const pollInterval = setInterval(runPriceUpdate, 1000);

        return () => clearInterval(pollInterval);

    }, []);

    // Simulation Loop
    useEffect(() => {
        let interval: any;
        if (isSimulating && simulatorRef.current) {
            interval = setInterval(() => {
                simulatorRef.current?.tick();
            }, 1000); 
        }
        return () => clearInterval(interval);
    }, [isSimulating]);

    // Sync settings
    useEffect(() => {
        if (simulatorRef.current) {
            simulatorRef.current.updateSettings(settings);
        }
    }, [settings]);


    const handleBatchOpen = (simSettings: SimulationSettings) => {
        if (!simulatorRef.current) return;
        simulatorRef.current.openBatchPositions(
            simSettings.symbol,
            simSettings.batchDirection,
            simSettings.batchCount,
            simSettings.batchPositionSize,
            simSettings.batchTpPercent, 
            simSettings.batchAutoReopen, 
            simSettings.batchSource, 
            simSettings.batchTimeBasis, 
            simSettings.batchMinVolume, 
            simSettings.customCandidates,
            simSettings.customPrices // PASSED PRICES
        );
    };

    const handleSettingsChange = (section: keyof AppSettings, key: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value
            }
        }));
    };
    
    const handleUpdateLeverage = (symbol: string, side: PositionSide, currentLeverage: number) => {
        const input = window.prompt(`修改 ${symbol} (${side}) 杠杆倍数:`, currentLeverage.toString());
        if (input !== null) {
            const newLev = parseInt(input, 10);
            if (!isNaN(newLev) && newLev > 0 && newLev <= 125) {
                simulatorRef.current?.updateLeverage(symbol, side, newLev);
            } else {
                alert('无效的杠杆倍数 (1-125)');
            }
        }
    };

    // --- BACKUP & RESTORE SYSTEM ---
    
    const getBackupData = (): BackupData => ({
        version: "v12.08.0220",
        timestamp: new Date().toISOString(),
        settings,
        account,
        positions,
        tradeLogs,
        logs,
        systemEvents
    });

    const restoreFromData = (data: BackupData, sourceName: string) => {
        try {
            if (data.settings) setSettings(data.settings);
            if (data.account) setAccount(data.account);
            if (data.positions) setPositions(data.positions);
            if (data.tradeLogs) setTradeLogs(data.tradeLogs);
            if (data.logs) setLogs(prev => [...data.logs, ...prev]); // Append logs
            
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'SUCCESS',
                message: `成功从 ${sourceName} 恢复数据。`,
            }, ...prev]);
        } catch (e) {
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'DANGER',
                message: `数据恢复失败: 无效的格式。`,
            }, ...prev]);
        }
    };

    const handleLocalBackup = () => {
        setIsBackingUp(true);
        const backup = getBackupData();
        localStorage.setItem('risk_savior_full_backup', JSON.stringify(backup));
        
        setLogs(prev => [{
            id: Math.random().toString(),
            timestamp: new Date(),
            type: 'SUCCESS',
            message: '系统快照已保存至本地缓存。'
        }, ...prev]);
        setTimeout(() => setIsBackingUp(false), 800);
    };

    const handleLocalRestore = () => {
        setIsRestoring(true);
        const raw = localStorage.getItem('risk_savior_full_backup');
        if (raw) {
            const data = JSON.parse(raw) as BackupData;
            restoreFromData(data, '本地缓存');
        } else {
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'WARNING',
                message: '未发现本地备份文件。'
            }, ...prev]);
        }
        setTimeout(() => setIsRestoring(false), 1000);
    };

    const handleExportBackup = () => {
        try {
            const data = getBackupData();
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; // Hidden anchor
            a.href = url;
            a.download = `risk_savior_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            
            // Clean up with delay to ensure download starts
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
            
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'SUCCESS',
                message: '完整数据包导出成功。'
            }, ...prev]);
        } catch (err) {
            console.error("Download Error:", err);
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'DANGER',
                message: '导出失败：浏览器可能拦截了下载。'
            }, ...prev]);
        }
    };

    const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string) as BackupData;
                restoreFromData(json, 'JSON文件');
            } catch (err) {
                setLogs(prev => [{
                    id: Math.random().toString(),
                    timestamp: new Date(),
                    type: 'DANGER',
                    message: '导入失败：文件格式损坏。'
                }, ...prev]);
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
    };

    const handleFactoryReset = () => {
        if (window.confirm('警告：确定要重置所有系统设置吗？当前持仓和记录将被保留，但策略配置将恢复默认。')) {
            setSettings(INITIAL_SETTINGS);
            setLogs(prev => [{
                id: Math.random().toString(),
                timestamp: new Date(),
                type: 'WARNING',
                message: '系统设置已重置为出厂默认 (Absolute Defense)。'
            }, ...prev]);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden">
            {/* --- GLOBAL APP HEADER --- */}
            <header className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-md z-50">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center shadow-lg shadow-indigo-900/50">
                        <Shield size={14} className="text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-xs tracking-wide text-slate-100 flex items-center gap-2">
                            防爆仓救世之星 
                            <span className="px-1 py-0.5 bg-slate-800 text-slate-400 text-[9px] rounded border border-slate-700">v12.08.0220 (Defense)</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                     <span className="text-[10px] text-slate-500 flex items-center gap-1 border-r border-slate-800 pr-4"><Lock size={10} className="text-emerald-500"/> Core: Protected</span>
                     
                     {/* GLOBAL DOWNLOAD BUTTON */}
                     <button 
                        onClick={handleExportBackup}
                        className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-blue-400 transition-colors"
                        title="导出系统数据备份 (Export Data)"
                     >
                         <Download size={12} />
                         <span className="hidden md:inline">导出数据</span>
                     </button>
                </div>
            </header>

            {/* Main Content Area - Left Sidebar Layout */}
            <div className="flex-1 flex min-h-0 flex-row relative">
                {/* LEFT SIDEBAR SETTINGS */}
                <div className="w-80 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-20 shadow-xl">
                    <SettingsPanel 
                        settings={settings}
                        realPrices={realPrices} // PASS REAL PRICES
                        previewData={ALL_BINANCE_SYMBOLS.map(s => ({ symbol: s }))} 
                        handleChange={handleSettingsChange}
                        onBatchOpen={handleBatchOpen}
                        onBackup={handleLocalBackup}
                        onRestore={handleLocalRestore}
                        onExport={handleExportBackup}
                        onImport={handleImportBackup}
                        onFactoryReset={handleFactoryReset}
                        isBackingUp={isBackingUp}
                        isRestoring={isRestoring}
                        onOpenScanner={() => setShowScanner(true)}
                        onToggleSim={() => setIsSimulating(!isSimulating)}
                        isSimulating={isSimulating}
                        systemStats={{
                            balance: account.marginBalance,
                            positionCount: positions.length,
                            tradeCount: tradeLogs.length,
                            logCount: logs.length
                        }}
                        onViewSource={() => setShowSourceModal(true)}
                    />
                </div>

                {/* RIGHT MAIN DASHBOARD */}
                <div className="flex-1 flex flex-col min-w-0 p-2 gap-2 bg-slate-950">
                    <div className="flex-1 min-h-0">
                        <Dashboard 
                            account={account}
                            positions={positions}
                            onRowLongPress={() => {}}
                            onShowHistory={() => {}}
                            hasHistory={() => false}
                            onClearPositions={() => simulatorRef.current?.batchCloseAllPositions()}
                            onClosePosition={(sym, side) => simulatorRef.current?.closePosition(sym, side)}
                            onDeletePosition={(sym, side) => simulatorRef.current?.closePosition(sym, side, 'REMOVE')}
                            onBatchClose={() => simulatorRef.current?.batchCloseAllPositions()}
                            onOpenChart={() => {}}
                            onOpenLogs={() => setShowLogs(!showLogs)}
                            onOpenTradeModal={() => { setTradeLogFilter(''); setShowTradeModal(true); }}
                            isSimulating={isSimulating}
                            onToggleSimulation={() => setIsSimulating(!isSimulating)}
                            onShowSymbolTradeLogs={(symbol) => {
                                setTradeLogFilter(symbol);
                                setShowTradeModal(true);
                            }}
                            onEmergencyHedge={() => simulatorRef.current?.triggerEmergencyHedge()}
                            onOpenScanner={() => setShowScanner(true)}
                            onUpdateLeverage={handleUpdateLeverage}
                        />
                    </div>
                    {showLogs && (
                        <div className="h-48 shrink-0">
                            <Logs logs={logs} />
                        </div>
                    )}
                </div>
                
                {/* MODALS */}
                {showTradeModal && (
                    <TradeLogModal 
                        tradeLogs={tradeLogs} 
                        positions={positions}
                        systemEvents={systemEvents} 
                        onClose={() => setShowTradeModal(false)} 
                        initialSearch={tradeLogFilter}
                    />
                )}

                {showSourceModal && (
                    <SourceCodeModal onClose={() => setShowSourceModal(false)} />
                )}
            </div>
            
            {showScanner && (
                <ScannerDashboard 
                    settings={settings.scanner}
                    onClose={() => setShowScanner(false)}
                    onOpenPosition={(symbol, side, amount, price) => {
                        // Pass "isQuantityBase" = true to interpret amount as USDT not coin qty
                        simulatorRef.current?.openPosition(symbol, side, amount, price, undefined, false, undefined, false, true);
                    }}
                    realPrices={realPrices}
                />
            )}
        </div>
    );
};

export default App;