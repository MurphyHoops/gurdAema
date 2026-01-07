
import React, { useState } from 'react';
import { AppSettings, ALL_BINANCE_SYMBOLS, ThreeLevelAlert, SimulationSettings, ProfitTier, StopLossSettings } from '../types';
import { TrendingUp, TrendingDown, Settings, Shield, Zap, Activity, BarChart2, Save, RotateCcw, CheckCircle2, Volume2, VolumeX, AlertTriangle, Play, Pause, Layers, Layout, RefreshCw, Radio, Lock, FileJson, Upload, Download, Database, MessageSquare, Target, Loader2, ArrowUp, ArrowDown, WifiOff, Code, Key, Info, X, Repeat } from 'lucide-react';
import { audioService } from '../services/audioService';

interface Props {
    settings: AppSettings;
    realPrices: Record<string, number>;
    previewData: { symbol: string }[];
    handleChange: (section: keyof AppSettings, key: string, value: any) => void;
    onBatchOpen: (simSettings: SimulationSettings) => void;
    onFactoryReset: () => void; // Reset to Default
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

const SettingsPanel: React.FC<Props> = ({ settings, realPrices, previewData, handleChange, onBatchOpen, onFactoryReset, onOpenScanner, onToggleSim, isSimulating, systemStats, onViewSource }) => {
    
    const [expandedModule, setExpandedModule] = useState<number | null>(7); // Default to System Settings for visibility
    const [isFetching, setIsFetching] = useState(false);
    const [usingMock, setUsingMock] = useState(false);
    const [showStrategy43Info, setShowStrategy43Info] = useState(false);
    
    // Module 6 Local State
    const [scanResults, setScanResults] = useState<any[]>([]);
    const [sortConfig, setSortConfig] = useState<{key: 'volume' | 'change', dir: 'desc' | 'asc'}>({ key: 'change', dir: 'desc' });

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
        const willEnable = !current[feature];

        if (willEnable) {
            // Enforce Mutual Exclusivity: Only one of 4.1, 4.2, 4.3 can be active
            if (feature === 'originalProfitClear') {
                handleChange('stopLoss', 'hedgeProfitClear', false);
                handleChange('stopLoss', 'callbackProfitClear', false);
            } else if (feature === 'hedgeProfitClear') {
                handleChange('stopLoss', 'originalProfitClear', false);
                handleChange('stopLoss', 'callbackProfitClear', false);
            } else if (feature === 'callbackProfitClear') {
                handleChange('stopLoss', 'originalProfitClear', false);
                handleChange('stopLoss', 'hedgeProfitClear', false);
            }
        }
        
        handleChange('stopLoss', feature as string, willEnable);
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
                symbol: t.symbol, volume: parseFloat(t.quoteVolume) / 1000000, change: parseFloat(t.priceChangePercent), price: parseFloat(t.lastPrice)
            }));
            const uniqueMap = new Map();
            processed.forEach(item => { if (!uniqueMap.has(item.symbol)) uniqueMap.set(item.symbol, item); });
            return Array.from(uniqueMap.values());
        };
        try {
            // NOTE: Switched to FAPI (Futures). FAPI ticker/24hr is standard. TradingDay is mapped to 24hr for stability.
            const endpoint = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
            const res = await fetch(endpoint, { cache: 'no-store' });
            if (!res.ok) throw new Error("API Error");
            const data = await res.json();
            const candidates = processData(Array.isArray(data) ? data : [data]);
            setScanResults(candidates);
            if (candidates.length > 0) audioService.speak(`扫描完成，筛选出 ${candidates.length} 个币种。`);
            else audioService.speak('未找到符合条件的币种。');
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
                    
                    // Priority: Use Real Price if available, otherwise fallback to diverse defaults
                    let price = 10;
                    if (realPrices[sym]) {
                        price = realPrices[sym];
                    } else if (sym.includes('BTC')) {
                        price = 65000 + Math.random() * 1000;
                    } else if (sym.includes('ETH')) {
                        price = 3500 + Math.random() * 100;
                    } else {
                        // Generate varied price for unknown coins (e.g. 5 to 200)
                        price = 5 + Math.random() * 195;
                    }

                    mockPool.push({ symbol: sym, quoteVolume: volRaw.toString(), priceChangePercent: changePct.toString(), lastPrice: price.toString() });
                }
                i++; if (i > 500) break; 
            }
            const candidates = processData(mockPool);
            setScanResults(candidates);
        } finally { setIsFetching(false); }
    };

    const handleSort = (key: 'volume' | 'change') => { setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' })); };
    const sortedScanResults = React.useMemo(() => { return [...scanResults].sort((a, b) => { const valA = a[sortConfig.key]; const valB = b[sortConfig.key]; return sortConfig.dir === 'desc' ? valB - valA : valA - valB; }); }, [scanResults, sortConfig]);
    
    const handleExecute = () => {
        if (sortedScanResults.length === 0) { audioService.speak("请先扫描市场生成数据。"); return; }
        const topCandidates = sortedScanResults.slice(0, settings.simulation.selectCount);
        const symbols = topCandidates.map(c => c.symbol);
        const prices: Record<string, number> = {};
        
        topCandidates.forEach(c => { 
            // Priority: Use Real Price if available to ensure accurate PnL calculation
            if (realPrices[c.symbol]) {
                prices[c.symbol] = realPrices[c.symbol];
            } else if (c.price) {
                prices[c.symbol] = c.price; 
            }
        });

        // Use EXECUTION DIRECTION for opening trades
        onBatchOpen({ ...settings.simulation, symbol: 'BATCH', batchDirection: settings.simulation.executionDirection, batchCount: topCandidates.length, batchPositionSize: settings.simulation.positionSize, batchTpPercent: settings.simulation.takeProfitPercent, batchAutoReopen: settings.simulation.autoReopen, batchSource: 'TOP_GAINERS', customCandidates: symbols, customPrices: prices, batchTimeBasis: '24H', batchMinVolume: 0 });
        if (!isSimulating) { onToggleSim(); audioService.speak(`系统已自动启动。`); } else { audioService.speak(`开始执行批量开仓。`); }
    };

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
        <div className="flex flex-col h-full bg-slate-900 text-slate-300 custom-scrollbar overflow-y-auto select-none relative">
            
            {/* Strategy 4.3 Rules Modal */}
            {showStrategy43Info && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-amber-500/50 rounded-lg shadow-2xl w-full max-w-md p-5 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                                <Info size={16} /> 4.3 回调盈利清仓 (运行规则)
                            </h3>
                            <button onClick={() => setShowStrategy43Info(false)} className="text-slate-500 hover:text-white"><X size={16}/></button>
                        </div>
                        <div className="space-y-3 text-[10px] text-slate-300 leading-relaxed">
                            <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                                <span className="text-blue-400 font-bold block mb-1">1. 触发逻辑 (Entry)</span>
                                初始开仓由【3. 防爆对冲】模块触发。一旦进入4.3模式，后续加仓由【价格突破极值】触发。
                            </div>
                            
                            <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                                <span className="text-emerald-400 font-bold block mb-1">2. 循环收割 (Harvest)</span>
                                当对冲仓位盈利达到【对冲盈利目标】且回调【回调比例】时，仅平掉对冲仓位，保留原仓位。盈利计入“总子弹”。
                            </div>

                            <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                                <span className="text-amber-400 font-bold block mb-1">3. 最终胜利 (Victory)</span>
                                当【历史累计对冲盈利 + 当前对冲浮盈 + 原仓当前浮盈】 > 【最大债务 * (1+覆盖阈值)】时，执行全平。
                                <br/><span className="text-slate-500 mt-1 block">* 注：若原仓位盈利足以覆盖历史亏损，也会触发全平。</span>
                            </div>
                        </div>
                        <button onClick={() => setShowStrategy43Info(false)} className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs">关闭</button>
                    </div>
                </div>
            )}

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
                                    <strong>解套原理：</strong> 当行情V型反转回原方向，原仓位(富豪)赚的钱足以帮对冲单(败家子)还债，并多赚 {settings.stopLoss.originalCoverPercent}% 时，强制双向平仓，落袋为安。
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
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-400 font-bold">3. 回调盈利清仓</span>
                                <button onClick={() => setShowStrategy43Info(true)} className="text-slate-500 hover:text-white" title="查看运行规则"><Info size={12}/></button>
                            </div>
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
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲仓位开仓数量 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.stopLoss.callbackHedgeRatio ?? 100} onChange={(e) => handleChange('stopLoss', 'callbackHedgeRatio', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">覆盖亏损盈利阈值 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.stopLoss.callbackCoverPercent} onChange={(e) => handleChange('stopLoss', 'callbackCoverPercent', parseFloat(e.target.value))} />
                                    </div>
                                </div>
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
                                <div className="grid grid-cols-1 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">对冲止损 (%)</label>
                                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.stopLoss.callbackStopLoss} onChange={(e) => handleChange('stopLoss', 'callbackStopLoss', parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-500 bg-slate-800/50 p-1.5 rounded leading-relaxed border border-slate-700/30">
                                    对冲盈利达标后回调收割，或止损控制。利润积攒至总子弹 > 亏损 * (1+阈值) 时清仓。
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* MODULE 8: MARTINGALE STRATEGY (New) */}
            <ModuleHeader 
                id={8} 
                icon={Repeat} 
                title="智能马丁" 
                subtitle="Martingale Auto-Refill" 
                active={expandedModule === 8}
                colorClass="bg-pink-900/50 text-pink-400"
            />
            {expandedModule === 8 && (
                <div className="p-4 bg-slate-800/30 space-y-4 border-b border-slate-800">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
                        <span className="text-xs font-bold text-pink-400">智能补仓策略</span>
                        <div onClick={() => handleChange('martingale', 'enabled', !settings.martingale.enabled)} className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${settings.martingale.enabled ? 'bg-pink-600' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.martingale.enabled ? 'translate-x-4' : 'translate-x-0'}`}/>
                        </div>
                    </div>
                    
                    {/* Settings - Always visible if expanded, but logic depends on enabled & isRunning */}
                    <div className={`space-y-3 animate-in fade-in transition-opacity ${!settings.martingale.enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        
                        {/* RUN SWITCH - NEW */}
                        <div className="flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700">
                            <span className="text-[10px] text-slate-400 font-bold">运行状态 (Status)</span>
                            <button 
                                onClick={() => handleChange('martingale', 'isRunning', !settings.martingale.isRunning)}
                                className={`px-4 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${settings.martingale.isRunning ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'bg-slate-700 text-slate-400'}`}
                            >
                                {settings.martingale.isRunning ? <Play size={10} fill="currentColor"/> : <Pause size={10} />}
                                {settings.martingale.isRunning ? '正在运行 (Running)' : '已停止 (Stopped)'}
                            </button>
                        </div>

                        {/* Direction Selector */}
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">执行方向 (Direction)</label>
                            <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                                {(['LONG', 'SHORT', 'BOTH'] as const).map(dir => (
                                    <button
                                        key={dir}
                                        onClick={() => handleChange('martingale', 'direction', dir)}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${
                                            settings.martingale.direction === dir 
                                            ? (dir === 'LONG' ? 'bg-emerald-600 text-white' : dir === 'SHORT' ? 'bg-red-600 text-white' : 'bg-pink-600 text-white')
                                            : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {dir === 'BOTH' ? '双向 (Both)' : dir === 'LONG' ? '仅做多 (Long)' : '仅做空 (Short)'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">首单金额 (U)</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" 
                                    value={settings.martingale.firstBuyAmount} 
                                    onChange={(e) => handleChange('martingale', 'firstBuyAmount', parseFloat(e.target.value))} 
                                    placeholder="0 = Auto"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">补仓倍数 (Multiplier)</label>
                                <input type="number" step="0.1" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.martingale.volumeMultiplier} onChange={(e) => handleChange('martingale', 'volumeMultiplier', parseFloat(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">补仓跌幅 (%)</label>
                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400" value={settings.martingale.dropPercent} onChange={(e) => handleChange('martingale', 'dropPercent', parseFloat(e.target.value))} />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">最大补仓次数</label>
                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" value={settings.martingale.maxSteps} onChange={(e) => handleChange('martingale', 'maxSteps', parseFloat(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">综合止盈 (%)</label>
                                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400" value={settings.martingale.takeProfit} onChange={(e) => handleChange('martingale', 'takeProfit', parseFloat(e.target.value))} />
                            </div>
                        </div>
                        <div className="text-[9px] text-slate-500 bg-slate-800/50 p-1.5 rounded leading-relaxed border border-slate-700/30">
                            <strong>机制说明：</strong> 价格每下跌【补仓跌幅】时，以【首单金额 x 倍数】执行补仓拉低均价。若首单金额设为0，则按当前持仓计算。需点击【运行】才生效。
                        </div>
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
                     
                     {/* 2. Decoupled Scan & Execution Controls */}
                     <div className="grid grid-cols-2 gap-3 mt-2">
                         {/* Control 1: Scan Source */}
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">扫描目标 (Scan Source)</label>
                             <select 
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                                value={settings.simulation.scanSource || 'GAINERS'} 
                                onChange={(e) => handleChange('simulation', 'scanSource', e.target.value)}
                             >
                                 <option value="GAINERS">涨幅榜 (Top Gainers)</option>
                                 <option value="LOSERS">跌幅榜 (Top Losers)</option>
                             </select>
                         </div>

                         {/* Control 2: Execution Direction */}
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
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                        <div>
                             <label className="text-[10px] text-slate-500 block mb-1">交易额 (百万U)</label>
                             <input 
                                type="number" 
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500"
                                value={settings.simulation.filterMinVolume}
                                onChange={(e) => handleChange('simulation', 'filterMinVolume', parseFloat(e.target.value))}
                             />
                        </div>
                        <div className="flex flex-col justify-end">
                            <button 
                                onClick={handleScan}
                                disabled={isFetching}
                                className="w-full h-[26px] bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                            >
                                {isFetching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                {isFetching ? '扫描中...' : '开始扫描'}
                            </button>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">涨幅大于 (%)</label>
                             <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400 focus:border-emerald-500" value={settings.simulation.filterMinChangeUp} onChange={(e) => handleChange('simulation', 'filterMinChangeUp', parseFloat(e.target.value))} />
                         </div>
                         <div>
                             <label className="text-[10px] text-slate-500 block mb-1">跌幅大于 (%)</label>
                             <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-red-400 focus:border-red-500" value={settings.simulation.filterMinChangeDown} onChange={(e) => handleChange('simulation', 'filterMinChangeDown', parseFloat(e.target.value))} />
                         </div>
                     </div>

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
                </div>
            )}

            {/* MODULE 7: 系统设置 (SYSTEM SETTINGS) */}
            <ModuleHeader 
                id={7} 
                icon={Settings} 
                title="系统设置" 
                subtitle="System Settings" 
                active={expandedModule === 7}
                colorClass="bg-slate-700 text-slate-200"
            />
            {expandedModule === 7 && (
                <div className="p-4 bg-slate-800/30 space-y-5 border-b border-slate-800">
                     {/* 1. API Configuration */}
                     <div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 uppercase mb-2">
                             <Key size={10} /> 1. API 配置 (Binance Connection)
                        </div>
                        <div className="space-y-2">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">API Key</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none"
                                    value={settings.system?.binanceApiKey || ''}
                                    onChange={(e) => handleChange('system', 'binanceApiKey', e.target.value)}
                                    placeholder="Enter Binance API Key"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Secret Key</label>
                                <input 
                                    type="password" 
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none"
                                    value={settings.system?.binanceApiSecret || ''}
                                    onChange={(e) => handleChange('system', 'binanceApiSecret', e.target.value)}
                                    placeholder="Enter Secret Key"
                                />
                            </div>
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
