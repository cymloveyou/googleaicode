import React, { useState, useEffect, useRef } from 'react';
import { parseSRT, generateSRT } from './services/srtParser';
import { checkConnection, fetchModels, translateBatch, ConnectionResult } from './services/ollama';
import { AppState, SubtitleBlock, OllamaConfig, OllamaModel, TranslationStats } from './types';
import { Icons } from './components/Icons';
import { ProgressBar } from './components/ProgressBar';

// Constants
const BATCH_SIZE = 10; // Optimize for speed vs context
const DEFAULT_HOST = 'http://127.0.0.1:11434';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.CONFIG);
  const [config, setConfig] = useState<OllamaConfig>({ host: DEFAULT_HOST, model: '' });
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionResult>({ ok: false });
  const [isChecking, setIsChecking] = useState(false);
  
  const [fileName, setFileName] = useState<string>('');
  const [subtitleBlocks, setSubtitleBlocks] = useState<SubtitleBlock[]>([]);
  const [stats, setStats] = useState<TranslationStats>({
    totalLines: 0,
    processedLines: 0,
    startTime: null,
    endTime: null,
    elapsedSeconds: 0
  });
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  
  const timerRef = useRef<number | null>(null);

  // Load models on mount or host change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        setIsChecking(true);
        try {
          const status = await checkConnection(config.host);
          setConnectionStatus(status);
          
          if (status.ok) {
            const availableModels = await fetchModels(config.host);
            setModels(availableModels);
            if (availableModels.length > 0 && !config.model) {
              setConfig(prev => ({ ...prev, model: availableModels[0].name }));
            }
          } else {
            setModels([]);
          }
        } catch (e) {
          console.error("Init load failed", e);
        } finally {
          setIsChecking(false);
        }
      };
      load();
    }, 500); 

    return () => clearTimeout(timer);
  }, [config.host]);

  // Timer effect
  useEffect(() => {
    if (state === AppState.PROCESSING && !stats.endTime) {
      timerRef.current = window.setInterval(() => {
        setStats(prev => ({
          ...prev,
          elapsedSeconds: prev.startTime ? (Date.now() - prev.startTime) / 1000 : 0
        }));
      }, 100);
    } else {
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [state, stats.startTime, stats.endTime]);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const parsed = parseSRT(content);
          setSubtitleBlocks(parsed);
          setStats(prev => ({ ...prev, totalLines: parsed.length }));
          setState(AppState.PROCESSING);
          startTranslation(parsed);
        } catch (e) {
          setErrorMsg("Failed to parse SRT file.");
          setState(AppState.ERROR);
        }
      };
      reader.readAsText(file);
    }
  };

  const startTranslation = async (blocks: SubtitleBlock[]) => {
    setStats(prev => ({ ...prev, startTime: Date.now(), processedLines: 0 }));
    addLog("Starting translation...");

    let currentProcessed = 0;
    const newBlocks = [...blocks];

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(b => b.originalText);
      
      addLog(`Translating lines ${i + 1} to ${Math.min(i + BATCH_SIZE, blocks.length)}...`);
      
      const translatedTexts = await translateBatch(config.host, config.model, texts);
      
      // Update blocks
      translatedTexts.forEach((text, index) => {
        if (newBlocks[i + index]) {
          newBlocks[i + index].translatedText = text;
        }
      });

      currentProcessed += batch.length;
      setSubtitleBlocks([...newBlocks]); // Trigger update for UI preview
      setStats(prev => ({ ...prev, processedLines: currentProcessed }));
    }

    setStats(prev => ({ ...prev, endTime: Date.now() }));
    setState(AppState.COMPLETED);
    addLog("Translation completed!");
  };

  const handleDownload = () => {
    const content = generateSRT(subtitleBlocks);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.cn.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStep = () => {
    switch (state) {
      case AppState.CONFIG:
        return (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 max-w-lg w-full space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icons.Settings size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white">Configuration</h2>
              <p className="text-slate-400">Connect to your local Ollama instance</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Ollama URL</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={config.host}
                    onChange={(e) => setConfig({...config, host: e.target.value})}
                    placeholder="http://127.0.0.1:11434"
                    className={`w-full bg-slate-900 border rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition ${connectionStatus.errorType ? 'border-red-500' : 'border-slate-700'}`}
                  />
                  <div className="absolute right-4 top-3.5">
                     {isChecking ? (
                       <Icons.Refresh className="animate-spin text-slate-500" size={18} />
                     ) : connectionStatus.ok ? (
                       <Icons.Check className="text-emerald-500" size={18} />
                     ) : (
                       <Icons.Alert className="text-red-500" size={18} />
                     )}
                  </div>
                </div>
              </div>

              {/* Error Handling UI */}
              {!connectionStatus.ok && connectionStatus.errorType === 'CORS' && (
                 <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg text-sm text-amber-200">
                   <div className="flex items-center gap-2 font-bold mb-2 text-amber-400">
                     <Icons.Alert size={16} />
                     <span>Connection Blocked (403)</span>
                   </div>
                   <p className="mb-2">Ollama is running but blocking external requests.</p>
                   <p className="mb-2">To fix this on Windows:</p>
                   <ol className="list-decimal list-inside space-y-1 opacity-80 ml-1">
                     <li>Quit Ollama from the system tray</li>
                     <li>Set User Env Variable: <code className="bg-black/30 px-1 rounded select-all">OLLAMA_ORIGINS</code> to <code className="bg-black/30 px-1 rounded select-all">*</code></li>
                     <li>Restart Ollama</li>
                   </ol>
                 </div>
              )}
              
               {!connectionStatus.ok && connectionStatus.errorType === 'NETWORK' && !isChecking && (
                 <div className="bg-red-900/20 border border-red-500/30 p-3 rounded-lg text-sm text-red-300">
                   Could not connect. Is Ollama running? Run <code className="bg-black/30 px-1 rounded">ollama serve</code>
                 </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Select Model</label>
                <div className="relative">
                  <select 
                    value={config.model}
                    onChange={(e) => setConfig({...config, model: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 appearance-none outline-none transition disabled:opacity-50"
                    disabled={!connectionStatus.ok || models.length === 0}
                  >
                    {models.length === 0 
                      ? <option>{connectionStatus.ok ? 'No models found' : 'Waiting for connection...'}</option> 
                      : models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)
                    }
                  </select>
                  <div className="absolute right-4 top-3.5 pointer-events-none text-slate-500">
                    <Icons.Refresh size={16} />
                  </div>
                </div>
                {connectionStatus.ok && models.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    No models found. Run <code className="bg-slate-900 px-1 rounded">ollama pull qwen2.5</code>
                  </p>
                )}
              </div>
            </div>

            <button 
              onClick={() => setState(AppState.UPLOAD)}
              disabled={!config.model}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue <Icons.Play size={18} />
            </button>
          </div>
        );

      case AppState.UPLOAD:
        return (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 max-w-lg w-full space-y-6 animate-fade-in text-center">
             <div className="w-16 h-16 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icons.Upload size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white">Upload Subtitles</h2>
              <p className="text-slate-400">Select a Japanese .srt file to translate</p>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-xl cursor-pointer bg-slate-700/30 hover:bg-slate-700/50 transition-colors group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Icons.File className="w-10 h-10 mb-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-slate-500">SRT files only</p>
                </div>
                <input type="file" className="hidden" accept=".srt" onChange={handleFileChange} />
            </label>
            <button onClick={() => setState(AppState.CONFIG)} className="text-slate-400 text-sm hover:text-white transition">Back to Settings</button>
          </div>
        );

      case AppState.PROCESSING:
      case AppState.COMPLETED:
        const progress = stats.totalLines > 0 ? (stats.processedLines / stats.totalLines) * 100 : 0;
        const speed = stats.elapsedSeconds > 0 ? (stats.processedLines / stats.elapsedSeconds).toFixed(1) : "0";

        return (
          <div className="w-full max-w-4xl space-y-6 animate-fade-in">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                 <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg">
                   <Icons.Clock size={24} />
                 </div>
                 <div>
                   <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Time Elapsed</p>
                   <p className="text-xl font-mono text-white">{stats.elapsedSeconds.toFixed(1)}s</p>
                 </div>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                 <div className="p-3 bg-purple-500/20 text-purple-400 rounded-lg">
                   <Icons.Translate size={24} />
                 </div>
                 <div>
                   <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Progress</p>
                   <p className="text-xl font-mono text-white">{stats.processedLines} / {stats.totalLines}</p>
                 </div>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                 <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg">
                   <Icons.Zap size={24} />
                 </div>
                 <div>
                   <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Speed</p>
                   <p className="text-xl font-mono text-white">{speed} lines/s</p>
                 </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden flex flex-col h-[500px]">
              {/* Toolbar */}
              <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${state === AppState.COMPLETED ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                    <span className="text-slate-200 font-medium">{fileName}</span>
                 </div>
                 {state === AppState.COMPLETED && (
                   <button 
                    onClick={handleDownload}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                   >
                     <Icons.Download size={16} /> Download .cn.srt
                   </button>
                 )}
              </div>

              {/* Progress Bar */}
              <div className="px-6 py-4">
                 <ProgressBar current={stats.processedLines} total={stats.totalLines} label={state === AppState.COMPLETED ? "Translation Complete" : "Translating..."} />
              </div>

              {/* Live Preview */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900/30 scroll-smooth">
                 {subtitleBlocks.slice(0, Math.max(5, stats.processedLines + 2)).map((block, idx) => (
                   // Only render if within a reasonable window or already translated to save DOM performance
                   (block.translatedText || idx < stats.processedLines + 5) && (
                   <div key={block.id} className={`p-4 rounded-lg border transition-all duration-500 ${block.translatedText ? 'border-slate-700 bg-slate-800/50' : 'border-transparent opacity-50'}`}>
                      <div className="flex justify-between text-xs text-slate-500 mb-1 font-mono">
                        <span>#{block.id}</span>
                        <span>{block.startTime} → {block.endTime}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <p className="text-slate-400 text-sm">{block.originalText}</p>
                         <p className="text-indigo-300 text-sm font-medium min-h-[1.25rem]">
                           {block.translatedText || <span className="animate-pulse w-24 h-4 bg-indigo-500/20 rounded inline-block"></span>}
                         </p>
                      </div>
                   </div>
                   )
                 ))}
                 <div className="h-4"></div> {/* Spacer */}
              </div>
              
              {/* Logs Footer */}
              <div className="bg-black/40 px-6 py-2 border-t border-slate-700 text-xs font-mono text-slate-500 truncate">
                <span className="text-indigo-400 mr-2">❯</span> {logs[0] || "Ready..."}
              </div>
            </div>

            {state === AppState.COMPLETED && (
               <div className="text-center">
                 <button onClick={() => window.location.reload()} className="text-slate-500 hover:text-white transition underline">Translate another file</button>
               </div>
            )}
          </div>
        );
      
      case AppState.ERROR:
        return (
           <div className="bg-red-900/20 border border-red-500/50 p-8 rounded-2xl max-w-lg text-center">
              <Icons.Alert className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Error</h3>
              <p className="text-red-200 mb-6">{errorMsg}</p>
              <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-500 transition">Try Again</button>
           </div>
        );
        
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>
      
      <header className="absolute top-6 left-6 flex items-center gap-2 z-10">
        <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
           <Icons.Translate className="text-white" size={20} />
        </div>
        <h1 className="text-lg font-bold text-white tracking-tight">Ollama<span className="text-indigo-400">Translator</span></h1>
      </header>

      <main className="z-10 w-full flex justify-center items-center flex-col">
        {renderStep()}
      </main>
    </div>
  );
};

export default App;