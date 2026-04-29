import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Search, Activity, Pill, AlertTriangle, Calendar, User, Stethoscope, ChevronRight, Eye, Loader2, Settings, RefreshCw } from 'lucide-react';
import { callMcpTool, FhirConfig, McpToolCallResult } from '../services/apiClient';

type Tab = 'patient' | 'medications' | 'conditions' | 'observations' | 'encounters' | 'summary';

interface FhirExplorerProps {
  fhirConfig: FhirConfig | null;
}

export default function FhirExplorer({ fhirConfig }: FhirExplorerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [patientId, setPatientId] = useState(fhirConfig?.patientId ?? '');
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    if (!fhirConfig?.serverUrl) {
      setError('FHIR server URL not configured. Set VITE_MCP_URL and provide FHIR credentials in Settings.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res: McpToolCallResult = await callMcpTool(toolName, args, {
        serverUrl: fhirConfig.serverUrl,
        accessToken: fhirConfig.accessToken || '',
        patientId: patientId || fhirConfig.patientId,
      });
      if (!res.success) {
        setError(res.text);
      } else {
        setResult(res.text);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fhirConfig, patientId]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: 'Patient Summary', icon: <Stethoscope size={14} /> },
    { id: 'patient', label: 'Lookup', icon: <User size={14} /> },
    { id: 'medications', label: 'Medications', icon: <Pill size={14} /> },
    { id: 'conditions', label: 'Conditions', icon: <AlertTriangle size={14} /> },
    { id: 'observations', label: 'Observations', icon: <Activity size={14} /> },
    { id: 'encounters', label: 'Encounters', icon: <Calendar size={14} /> },
  ];

  const runSearch = () => {
    if (activeTab === 'patient') {
      execute('get_patient', { patientId: patientId || undefined, firstName: searchName.split(' ')[0], lastName: searchName.split(' ').slice(1).join(' ') });
    } else if (activeTab === 'summary') {
      execute('get_patient_summary', { patientId: patientId || undefined });
    } else if (activeTab === 'medications') {
      execute('get_medications', { patientId: patientId || undefined });
    } else if (activeTab === 'conditions') {
      execute('get_conditions', { patientId: patientId || undefined });
    } else if (activeTab === 'observations') {
      execute('get_observations', { patientId: patientId || undefined, category: 'vital-signs' });
    } else if (activeTab === 'encounters') {
      execute('get_encounters', { patientId: patientId || undefined });
    }
  };

  const isConnected = !!fhirConfig?.serverUrl;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">FHIR Resource Explorer</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">
            {isConnected ? `Connected: ${fhirConfig.serverUrl}` : 'Not connected — configure FHIR server in Settings'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-sm border border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-100 text-sky-600 border-l-2 border-sky-600'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="flex gap-2 items-center bg-white p-2 rounded-sm border border-slate-200 shadow-sm">
        {(activeTab === 'patient' || activeTab === 'summary') && (
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Patient ID (FHIR resource ID)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              />
            </div>
            {activeTab === 'patient' && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Or search by name (e.g., John Smith)"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
        {['medications', 'conditions', 'observations', 'encounters'].includes(activeTab) && (
          <div className="relative flex-1">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Patient ID (optional if set in FHIR context)"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
          </div>
        )}
        <button
          onClick={runSearch}
          disabled={loading || !isConnected}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          {loading ? 'Querying FHIR...' : 'Execute'}
        </button>
      </div>

      {/* Result */}
      <div className="panel p-0 overflow-hidden min-h-[400px]">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
          <h2 className="label-caps !mb-0">
            {tabs.find((t) => t.id === activeTab)?.label} Response
          </h2>
          {result && (
            <button
              onClick={() => { navigator.clipboard?.writeText(result); }}
              className="text-[10px] font-bold text-sky-600 hover:underline uppercase tracking-wider"
            >
              Copy
            </button>
          )}
        </div>
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={24} className="text-sky-500 animate-spin" />
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest animate-pulse">Querying FHIR server...</p>
              </div>
            </div>
          )}
          {!loading && result && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{result}</pre>
            </motion.div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-sm">
              <AlertTriangle size={16} className="text-rose-500 shrink-0" />
              <p className="text-xs font-mono text-rose-700">{error}</p>
            </div>
          )}
          {!loading && !result && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Eye size={32} className="text-slate-200 mb-4" />
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Execute a query to see FHIR resources
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
