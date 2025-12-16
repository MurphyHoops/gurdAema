
export const SOURCE_VAULT: Record<string, string> = {
  "types.ts": `export enum PositionSide {
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
  mainPositionId?: string;
  entryTime?: number;
  cumulativeHedgeLoss?: number;
}

// ... (Refer to actual types.ts for full definitions)
`,
  "marketSimulator.ts": `// Due to file size limits, the full source of MarketSimulator is not embedded here.
// Please refer to services/marketSimulator.ts in your project structure for the complete logic including:
// - Position management
// - PnL calculation
// - Module 4 strategies (Hedge Profit Exit)
// - Risk management
`,
  "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>防爆仓救星 - 终极风控系统</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body {
        background-color: #0f172a;
        color: #e2e8f0;
      }
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: #1e293b; 
      }
      ::-webkit-scrollbar-thumb {
        background: #475569; 
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #64748b; 
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
  "metadata.json": `{
  "name": "防爆仓救世之星 (Risk Savior)",
  "description": "币安交易所终极风控系统 - 从绝对防守到主动出击的智能交易助手。",
  "requestFramePermissions": [
    "microphone"
  ]
}`
};
