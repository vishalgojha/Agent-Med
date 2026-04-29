import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Bot, User, Loader2, AlertTriangle, Sparkles, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import { callA2AAgent, FhirConfig, A2ATaskResult, A2A_URL } from '../services/apiClient';

interface A2aAgentChatProps {
  fhirConfig: FhirConfig | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: 'Prior Auth Status', prompt: 'Check the status of pending prior authorizations for my patient' },
  { label: 'Care Plan', prompt: 'Generate a care plan summary for the current patient' },
  { label: 'Medication Reconciliation', prompt: 'Perform medication reconciliation for the current patient' },
  { label: 'Patient Summary', prompt: 'Provide a comprehensive clinical summary of the patient' },
];

export default function A2aAgentChat({ fhirConfig }: A2aAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'sys-1',
      role: 'system',
      content: 'Agent-to-Agent (A2A) interface ready. Describe a clinical workflow and I\'ll coordinate across services to complete it.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isConnected = !!A2A_URL;

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response: A2ATaskResult = await callA2AAgent(text, {
        serverUrl: fhirConfig?.serverUrl || '',
        accessToken: fhirConfig?.accessToken || '',
        patientId: fhirConfig?.patientId || '',
      }, sessionId || undefined);

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: response.text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);

      if (response.id) {
        setSessionId(response.id);
      }
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'system',
        content: err instanceof Error ? err.message : 'Failed to reach A2A agent.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const resetSession = () => {
    setSessionId('');
    setMessages([
      {
        id: 'sys-1',
        role: 'system',
        content: 'Session reset. Describe a clinical workflow and I\'ll coordinate across services.',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-end justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">A2A Agent Chat</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">
            {isConnected ? `Agent: ${A2A_URL}${sessionId ? ` | Session: ${sessionId.slice(0, 8)}...` : ' | No active session'}` : 'A2A agent URL not configured'}
          </p>
        </div>
        {sessionId && (
          <button
            onClick={resetSession}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
          >
            <RefreshCw size={12} />
            New Session
          </button>
        )}
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Quick Workflows</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => send(action.prompt)}
                disabled={loading || !isConnected}
                className="panel p-3 text-left hover:border-sky-300 transition-all group disabled:opacity-40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 group-hover:text-sky-600 transition-colors">{action.label}</span>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-sky-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 panel p-4 min-h-0">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role !== 'user' && (
              <div className={`shrink-0 w-7 h-7 rounded-sm flex items-center justify-center ${msg.role === 'agent' ? 'bg-sky-100 text-sky-600' : 'bg-amber-100 text-amber-600'}`}>
                {msg.role === 'agent' ? <Bot size={14} /> : <Sparkles size={14} />}
              </div>
            )}
            <div className={`max-w-[80%] rounded-sm px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-sky-600 text-white'
                : msg.role === 'agent'
                ? 'bg-slate-50 border border-slate-200 text-slate-800'
                : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{msg.content}</pre>
              <div className={`text-[9px] mt-1 uppercase tracking-wider ${
                msg.role === 'user' ? 'text-sky-200' : msg.role === 'agent' ? 'text-slate-400' : 'text-amber-500'
              }`}>
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="shrink-0 w-7 h-7 rounded-sm bg-slate-100 text-slate-600 flex items-center justify-center">
                <User size={14} />
              </div>
            )}
          </motion.div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-sm bg-sky-100 text-sky-600 flex items-center justify-center">
              <Loader2 size={14} className="animate-spin" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest animate-pulse">Agent is processing...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 flex gap-2">
        <input
          className="flex-1 px-3 py-3 bg-white border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs shadow-sm"
          placeholder="Describe a clinical workflow... (e.g., 'Check prior auth for patient X')"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={loading || !isConnected}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !isConnected || !input.trim()}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Send
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-rose-50 border border-rose-200 rounded-sm shrink-0">
          <AlertTriangle size={14} className="text-rose-500 shrink-0" />
          <p className="text-[10px] font-mono text-rose-700">{error}</p>
        </div>
      )}
    </div>
  );
}
