import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, CheckCircle2, XCircle, Loader2, Server, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { checkHealths, getMcpServerCard, getA2AAgentCard, MCP_URL, A2A_URL, CORE_URL } from '../services/apiClient';

interface ServiceStatus {
  name: string;
  url: string;
  status: 'ok' | 'error' | 'loading' | 'unknown';
  latency?: number;
  details?: Record<string, unknown>;
  card?: Record<string, unknown>;
  error?: string;
}

export default function SystemStatus() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAll = async () => {
    setLoading(true);
    const startTime = Date.now();

    const results = await checkHealths();

    const cards = await Promise.allSettled([
      getMcpServerCard(),
      getA2AAgentCard(),
    ]);

    const svcNames = ['Core API', 'MCP Server', 'A2A Agent'];
    const svcUrls = [CORE_URL, MCP_URL, A2A_URL];

    const mapped: ServiceStatus[] = results.map((r) => ({
      name: r.service,
      url: r.url,
      status: r.status === 'online' ? 'ok' as const : 'error' as const,
      details: r.details ?? undefined,
    }));

    if (cards[0].status === 'fulfilled' && cards[0].value) {
      const mcp = mapped.find((s) => s.name === 'MCP Server');
      if (mcp) mcp.card = cards[0].value;
    }
    if (cards[1].status === 'fulfilled' && cards[1].value) {
      const a2a = mapped.find((s) => s.name === 'A2A Agent');
      if (a2a) a2a.card = cards[1].value;
    }

    const elapsed = Date.now() - startTime;
    const withLatency = mapped.map((s) => ({
      ...s,
      latency: Math.round(elapsed / mapped.length),
    }));

    setServices(withLatency);
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => {
    checkAll();
  }, []);

  const overallHealthy = services.every((s) => s.status === 'ok');

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">System Status</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">
            {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : 'Checking...'}
          </p>
        </div>
        <button
          onClick={checkAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Overall Status */}
      <div className={`panel p-4 flex items-center gap-4 ${overallHealthy ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'}`}>
        {loading ? (
          <Loader2 size={24} className="text-slate-400 animate-spin" />
        ) : overallHealthy ? (
          <CheckCircle2 size={24} className="text-emerald-500" />
        ) : (
          <AlertTriangle size={24} className="text-amber-500" />
        )}
        <div>
          <p className={`text-sm font-bold uppercase tracking-wider ${overallHealthy ? 'text-emerald-700' : 'text-amber-700'}`}>
            {loading ? 'Checking services...' : overallHealthy ? 'All Systems Operational' : 'Some Services Degraded'}
          </p>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            {services.filter((s) => s.status === 'ok').length}/{services.length} services healthy
          </p>
        </div>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {services.map((svc) => (
          <motion.div key={svc.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{svc.name}</span>
              </div>
              {svc.status === 'ok' && <CheckCircle2 size={14} className="text-emerald-500" />}
              {svc.status === 'error' && <XCircle size={14} className="text-rose-500" />}
              {svc.status === 'loading' && <Loader2 size={14} className="text-slate-400 animate-spin" />}
            </div>

            <p className="text-[10px] font-mono text-slate-400 truncate">{svc.url}</p>

            {svc.latency !== undefined && (
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-slate-300" />
                <span className="text-[10px] font-mono text-slate-500">
                  {svc.latency < 100 ? `${svc.latency}ms` : `${(svc.latency / 1000).toFixed(1)}s`}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                  svc.latency < 200 ? 'bg-emerald-100 text-emerald-700' : svc.latency < 1000 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {svc.latency < 200 ? 'FAST' : svc.latency < 1000 ? 'OK' : 'SLOW'}
                </span>
              </div>
            )}

            {svc.error && (
              <p className="text-[10px] font-mono text-rose-600 bg-rose-50 p-2 rounded-sm">{svc.error}</p>
            )}

            {svc.card && (
              <div className="space-y-1">
                {svc.card.name != null && (
                  <p className="text-[10px] text-slate-500">
                    <span className="font-bold">Server:</span> {String(svc.card.name)}
                  </p>
                )}
                {svc.card.version != null && (
                  <p className="text-[10px] text-slate-500">
                    <span className="font-bold">Version:</span> {String(svc.card.version)}
                  </p>
                )}
                {svc.card.description != null && (
                  <p className="text-[10px] text-slate-400 truncate">{String(svc.card.description)}</p>
                )}
              </div>
            )}

            {svc.status === 'ok' && !svc.card && (
              <p className="text-[10px] font-mono text-emerald-600">Responsive</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Endpoints Summary */}
      {services.length > 0 && (
        <div className="panel p-4">
          <h2 className="label-caps mb-3">Endpoint Configuration</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-slate-400">VITE_CORE_URL</span>
              <span className="font-mono text-slate-600">{CORE_URL}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-slate-400">VITE_MCP_URL</span>
              <span className="font-mono text-slate-600">{MCP_URL}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-slate-400">VITE_A2A_URL</span>
              <span className="font-mono text-slate-600">{A2A_URL}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
