import React, { useState } from 'react';
import { X, Copy, Check, FileCode, Activity, Music, Database, Layout, Download } from 'lucide-react';
import { SOURCE_VAULT } from '../utils/sourceCodeData';

interface Props {
  onClose: () => void;
}

const SourceCodeModal: React.FC<Props> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('TYPES');
    const [copied, setCopied] = useState(false);

    // Pull real code from the Vault
    const SOURCE_FILES: Record<string, { name: string, icon: any, code: string }> = {
        'TYPES': { 
            name: 'types.ts', 
            icon: Database, 
            code: SOURCE_VAULT['types.ts'] || '// Error: Types source not found' 
        },
        'SIMULATOR': { 
            name: 'marketSimulator.ts', 
            icon: Activity, 
            code: SOURCE_VAULT['marketSimulator.ts'] || '// Error: Simulator source not found' 
        },
        'HTML': {
            name: 'index.html',
            icon: Layout,
            code: SOURCE_VAULT['index.html'] || '// Error: HTML not found'
        },
        'METADATA': {
            name: 'metadata.json',
            icon: FileCode,
            code: SOURCE_VAULT['metadata.json'] || '{}'
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(SOURCE_FILES[activeTab].code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        try {
            const item = SOURCE_FILES[activeTab];
            const blob = new Blob([item.code], {type: 'text/plain'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        } catch(e) {
            console.error("Download failed", e);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 rounded-t-lg shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-900/30 rounded-full text-blue-400 border border-blue-500/30">
                            <FileCode size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Source Code Viewer (Live)</h2>
                            <p className="text-xs text-slate-500">
                                实时核心源码快照 (Contains Full Logic for Module 4.2 & All Features)
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">
                    <div className="w-48 border-r border-slate-800 bg-slate-900/50 flex flex-col overflow-y-auto">
                        {Object.keys(SOURCE_FILES).map(key => {
                            const item = SOURCE_FILES[key];
                            const Icon = item.icon;
                            return (
                                <button
                                    key={key}
                                    onClick={() => { setActiveTab(key); setCopied(false); }}
                                    className={`flex items-center gap-2 p-3 text-xs text-left transition-colors border-l-2 ${
                                        activeTab === key 
                                        ? 'bg-slate-800 border-blue-500 text-white' 
                                        : 'border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon size={14} />
                                    <span className="font-mono">{item.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 flex flex-col bg-[#1e1e1e]">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900">
                             <span className="text-xs text-slate-400 font-mono">{SOURCE_FILES[activeTab].name}</span>
                             <div className="flex gap-2">
                                 <button 
                                    onClick={handleDownload}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors border border-slate-700"
                                    title="下载此文件"
                                 >
                                     <Download size={14}/> Download
                                 </button>
                                 <button 
                                    onClick={handleCopy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                                 >
                                     {copied ? <Check size={14}/> : <Copy size={14}/>}
                                     {copied ? 'Copied' : 'Copy Source'}
                                 </button>
                             </div>
                        </div>
                        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                            <pre className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
                                {SOURCE_FILES[activeTab].code}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SourceCodeModal;