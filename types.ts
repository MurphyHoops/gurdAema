export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export interface AccountData {
  marginBalance: number;
  totalBalance: number;
  marginRatio: number;
  maintenanceMargin: number;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  amount: number;
  markPrice: number;
  entryPrice: number;
  liquidationPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercentage: number;
  leverage: number;
  riskLevel: number;
  isHedged: boolean;
  entryId?: string;
  maxPnLPercent?: number;
  simTpPercent?: number;
  simAutoReopen?: boolean;
  mainPositionId?: string; // If this is a hedge, link to parent
  entryTime?: number;
  cumulativeHedgeLoss?: number; // NEW: Tracks sum of losses from previous failed hedges
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
  message: string;
}

export interface TradeLog {
    entry_id: string;
    symbol: string;
    direction: PositionSide;
    quantity: number;
    cost_usdt: number;
    entry_price: number;
    exit_price?: number;
    profit_usdt?: number;
    profit_percent?: number;
    entry_timestamp: number;
    exit_timestamp?: number;
    status: 'OPEN' | 'CLOSED';
    exit_reason?: string;
    signal_details?: any;
    leverage?: number;
    is_hedge?: boolean;
}

export interface SystemEvent {
    id: string;
    timestamp: number;
    severity: 'INFO' | 'WARNING' | 'ERROR';
    event_type: string;
    description: string;
    current_balance: number;
    margin_ratio: number;
    halt_reason?: string;
    error_message?: string;
}

export interface HedgeRecord {
    id: string;
    symbol: string;
    timestamp: number;
    action: string;
    triggerPrice: number;
    hedgeAmount: number;
    originalPnL: number;
    detail: string;
}

export interface ProfitTier {
    profit: number;   
    callback: number; 
    close: number;    
}

export interface ProfitSettings {
    enabled: boolean; 
    profitMode: 'CONVENTIONAL' | 'DYNAMIC' | 'SMART' | 'GLOBAL';
    conventional: {
        minPosition: number;     
        profitPercent: number;   
        callbackPercent: number; 
        closePercent: number;    
    };
    dynamic: {
        minPosition: number;
        tiers: ProfitTier[];
    };
    smart: {
        activationProfit: number; 
    };
    global: {
        profitPercent: number;
        lossPercent: number;
        profitAmount: number;
        lossAmount: number;
    };
    stopLoss: {
        enabled: boolean;
        minPosition: number; 
        lossPercent: number; 
        closePercent: number;
    };
}

export interface StopLossSettings {
    enabled: boolean;
    lossThreshold: number;
    positionThreshold: number; 
    originalProfitClear: boolean;
    hedgeStopLossPercent: number;
    originalCoverPercent: number;
    hedgeProfitClear: boolean;
    hedgeOpenRatio: number;
    hedgeCoverPercent: number;
    hedgeProfitClearStopLoss: number; // NEW: Stop Loss for Strategy 4.2
    callbackProfitClear: boolean;
    callbackTargetProfit: number;
    callbackRate: number;
    callbackStopLoss: number;
    callbackCoverPercent: number;
}

export interface HedgingSettings {
    enabled: boolean;
    triggerLossPercent: number;
    hedgeRatio: number;
    minPosition: number; 
    safeClearEnabled: boolean;
    safeClearProfit: number;
    safeClearLoss: number;
}

export interface VictoryOutSettings {
    enabled: boolean;
    activationProfit: number;
    retraceCallback: number;
}

export interface WinningOutSettings {
    enabled: boolean;
    disableOtherCloseOnHedge: boolean;
}

export interface SimulationSettings {
  filterTimeBasis: '24H' | '8AM';
  filterMinVolume: number;
  filterMinChangeUp: number;
  filterMinChangeDown: number;
  filterSort: 'DESC' | 'ASC';
  selectCount: number;
  executionDirection: 'LONG' | 'SHORT';
  scanSource: 'GAINERS' | 'LOSERS'; // NEW: Decouples scanning from execution
  positionSize: number;
  takeProfitPercent: number;
  autoReopen: boolean;
  customCandidates?: string[]; 
  customPrices?: Record<string, number>;
  symbol: string; 
  batchDirection: 'LONG' | 'SHORT' | 'RANDOM';
  batchCount: number;
  batchPositionSize: number;
  batchTpPercent: number;
  batchAutoReopen: boolean;
  batchSource: 'POOL' | 'TOP_GAINERS' | 'TOP_LOSERS';
  batchTimeBasis: 'TRADING_DAY' | '24H';
  batchMinVolume: number;
}

export interface SmartTradeSettings {
  enabled: boolean;
}

export interface ScannerSettings {
    volumeThreshold: number;
    changeFrom8amUp: number;
    changeFrom8amDown: number;
    amplitudeMin: number;
    amplitudeMax: number;
    bodyRatio: number;
    breakoutBuffer: number;
    alertCountLong: number;
    alertCountShort: number;
    autoOpen: boolean;
    openAmount: number;
    scanTimeframes: string[];
}

export interface ThreeLevelAlert {
    voice: boolean;
    popup: boolean;
    levels: [number, number, number];
}

export interface AudioSettings {
    enabled: boolean;
    positionSize: ThreeLevelAlert;
    symbolProfit: ThreeLevelAlert;
    totalProfit: ThreeLevelAlert;
    symbolLoss: ThreeLevelAlert;
    totalLoss: ThreeLevelAlert;
    marginRatio: ThreeLevelAlert;
}

export interface AppSettings {
    audio: AudioSettings;
    profit: ProfitSettings;
    stopLoss: StopLossSettings;
    hedging: HedgingSettings;
    victoryOut: VictoryOutSettings;
    winningOut: WinningOutSettings;
    simulation: SimulationSettings;
    smartTrade: SmartTradeSettings;
    scanner: ScannerSettings;
}

export interface BackupData {
    version: string;
    timestamp: string;
    settings: AppSettings;
    account: AccountData;
    positions: Position[];
    tradeLogs: TradeLog[];
    logs: LogEntry[];
    systemEvents: SystemEvent[];
}

export const ALL_BINANCE_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LUNAUSDT',
    'MATICUSDT', 'TRXUSDT', 'SHIBUSDT', 'LTCUSDT', 'LINKUSDT', 'UNIUSDT', 'ATOMUSDT', 'ETCUSDT', 'FILUSDT', 'ICPUSDT',
    'HBARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'LDOUSDT', 'NEARUSDT', 'QNTUSDT', 'VETUSDT', 'GRTUSDT', 'MKRUSDT',
    'AAVEUSDT', 'ALGOUSDT', 'STXUSDT', 'EGLDUSDT', 'SANDUSDT', 'THETAUSDT', 'EOSUSDT', 'IMXUSDT', 'FTMUSDT', 'MANAUSDT',
    'XTZUSDT', 'NEOUSDT', 'SNXUSDT', 'RNDRUSDT', 'CFXUSDT', 'KAVAUSDT', 'CHZUSDT', 'AXSUSDT', 'FLOWUSDT', 'CRVUSDT',
    'KLAYUSDT', 'GALAUSDT', 'MINAUSDT', 'IOTAUSDT', 'ZECUSDT', 'CAKEUSDT', 'FXSUSDT', 'DASHUSDT', 'ZILUSDT', 'COMPUSDT',
    'RUNEUSDT', '1INCHUSDT', 'ENJUSDT', 'BATUSDT', 'LUNCUSDT', 'QTUMUSDT', 'MAGICUSDT', 'DYDXUSDT', 'CKBUSDT', 'MASKUSDT',
    'GLMUSDT', 'LPTUSDT', 'LRCUSDT', 'KSMUSDT', 'CELOUSDT', 'RVNUSDT', 'HOTUSDT', 'SCUSDT', 'WOOUSDT', 'ZRXUSDT',
    'ENSUSDT', 'GMTUSDT', 'APEUSDT', 'SUIUSDT', 'PEPEUSDT', 'WLDUSDT', 'BLURUSDT', 'FLOKIUSDT', 'MEMEUSDT', 'ORDIUSDT',
    'TIASUSDT', 'JTOUSDT', 'BONKUSDT', '1000SATSUSDT', 'ETHFIUSDT', 'YGGUSDT', 'GTCUSDT', 'OCEANUSDT', 'AGIXUSDT',
    'FETUSDT', 'JASMYUSDT', 'RDNTUSDT', 'ACHUSDT', 'HOOKUSDT'
];

export const STATIC_PRICES: Record<string, number> = {
    'BTCUSDT': 67500, 'ETHUSDT': 3450, 'BNBUSDT': 590, 'SOLUSDT': 145, 'XRPUSDT': 0.60,
    'ADAUSDT': 0.45, 'DOGEUSDT': 0.16, 'AVAXUSDT': 35, 'DOTUSDT': 7.2, 'TRXUSDT': 0.12,
    'LINKUSDT': 14, 'MATICUSDT': 0.70, 'LTCUSDT': 82, 'BCHUSDT': 450, 'NEARUSDT': 6.5,
    'UNIUSDT': 10, 'ICPUSDT': 12, 'FILUSDT': 6, 'APTUSDT': 9, 'ARBUSDT': 1.1,
    'OPUSDT': 2.5, 'LDOUSDT': 2.0, 'STXUSDT': 2.2, 'IMXUSDT': 2.0, 'RNDRUSDT': 8.5,
    'INJUSDT': 25, 'GRTUSDT': 0.30, 'VETUSDT': 0.04, 'THETAUSDT': 2.2, 'FTMUSDT': 0.7,
    'RUNEUSDT': 5.5, 'AAVEUSDT': 90, 'ALGOUSDT': 0.18, 'FLOWUSDT': 0.9, 'SANDUSDT': 0.45,
    'MANAUSDT': 0.45, 'AXSUSDT': 7.5, 'EGLDUSDT': 40, 'XTZUSDT': 1.0, 'EOSUSDT': 0.8
};