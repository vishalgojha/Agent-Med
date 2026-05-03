import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Send, Brain, FileText, Loader2, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { callMcpTool, FhirConfig, McpToolCallResult } from '../services/apiClient';

interface ClinicalToolsProps {
  fhirConfig: FhirConfig | null;
}

type Tool = 'scribe' | 'prior-auth' | 'follow-up' | 'decision';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface RiskGate {
  level: RiskLevel;
  label: string;
  requiresConfirmation: boolean;
  color: string;
}

const riskGates: RiskGate[] = [
  { level: 'LOW', label: 'Low Risk', requiresConfirmation: false, color: 'emerald' },
  { level: 'MEDIUM', label: 'Medium Risk', requiresConfirmation: false, color: 'amber' },
  { level: 'HIGH', label: 'High Risk', requiresConfirmation: true, color: 'rose' },
];

export default function ClinicalTools({ fhirConfig }: ClinicalToolsProps) {
  const [activeTool, setActiveTool] = useState<Tool>('decision');
  const [activeRiskLevel, setActiveRiskLevel] = useState<RiskLevel>('LOW');
  const [confirmedHighRisk, setConfirmedHighRisk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!fhirConfig?.serverUrl;

  const execute = async (toolName: string, args: Record<string, unknown>) => {
    if (!fhirConfig?.serverUrl) {
      setError('FHIR server URL not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res: McpToolCallResult = await callMcpTool(toolName, args, {
        serverUrl: fhirConfig.serverUrl,
        accessToken: fhirConfig.accessToken || '',
        patientId: fhirConfig.patientId,
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
  };

  const tools: { id: Tool; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'decision', label: 'Decision Support', icon: <Brain size={16} />, description: 'Clinical decision alerts and medication safety checks' },
    { id: 'prior-auth', label: 'Prior Authorization', icon: <Shield size={16} />, description: 'Create and manage insurance prior auth requests' },
    { id: 'follow-up', label: 'Follow-up', icon: <Send size={16} />, description: 'Schedule patient follow-up communications' },
    { id: 'scribe', label: 'Scribe', icon: <FileText size={16} />, description: 'Generate SOAP notes from encounter transcripts' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Clinical Tools</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">
            {isConnected ? `FHIR Context Active: ${fhirConfig.patientId ?? 'No patient ID'}` : 'Configure FHIR connection in Settings'}
          </p>
        </div>
      </div>

      {/* Risk Gate Selector */}
      <div className="panel p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Risk Gate:</span>
          <div className="flex gap-2">
            {riskGates.map((gate) => (
              <button
                key={gate.level}
                onClick={() => {
                  setActiveRiskLevel(gate.level);
                  if (gate.level !== 'HIGH') setConfirmedHighRisk(false);
                }}
                className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all ${
                  activeRiskLevel === gate.level
                    ? gate.level === 'HIGH' 
                      ? 'bg-rose-500 text-white' 
                      : gate.level === 'MEDIUM'
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
              >
                {gate.requiresConfirmation && <AlertTriangle size={10} className="inline mr-1" />}
                {gate.label}
              </button>
            ))}
          </div>
          {activeRiskLevel === 'HIGH' && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmedHighRisk}
                onChange={(e) => setConfirmedHighRisk(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-rose-600 font-bold">I confirm this HIGH risk action</span>
            </label>
          )}
        </div>
      </div>

      {/* Tool Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`panel p-4 text-left transition-all hover:border-sky-300 ${
              activeTool === tool.id ? 'border-sky-500 bg-sky-50/50 shadow-sm' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {activeTool === tool.id ? (
                <span className="text-sky-600">{tool.icon}</span>
              ) : (
                <span className="text-slate-400">{tool.icon}</span>
              )}
              <span className={`text-xs font-bold uppercase tracking-wider ${activeTool === tool.id ? 'text-sky-700' : 'text-slate-600'}`}>
                {tool.label}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">{tool.description}</p>
          </button>
        ))}
      </div>

      {/* Tool Content */}
      <div className="panel p-6">
        {activeTool === 'decision' && <DecisionSupportForm onSubmit={(args) => execute('clinical_decision', args)} loading={loading} isConnected={isConnected} />}
        {activeTool === 'prior-auth' && <PriorAuthForm onSubmit={(args) => execute('prior_auth', args)} loading={loading} isConnected={isConnected} />}
        {activeTool === 'follow-up' && <FollowUpForm onSubmit={(args) => execute('follow_up', args)} loading={loading} isConnected={isConnected} />}
        {activeTool === 'scribe' && <ScribeForm onSubmit={(args) => execute('scribe', args)} loading={loading} isConnected={isConnected} />}
      </div>

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="panel p-0 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <h2 className="label-caps !mb-0 text-emerald-700">Success</h2>
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(result); }} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">
              Copy
            </button>
          </div>
          <div className="p-4">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{result}</pre>
          </div>
        </motion.div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-sm">
          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
          <p className="text-xs font-mono text-rose-700">{error}</p>
        </div>
      )}
    </div>
  );
}

function DecisionSupportForm({ onSubmit, loading, isConnected }: { onSubmit: (args: Record<string, unknown>) => void; loading: boolean; isConnected: boolean }) {
  const [query, setQuery] = useState('');
  return (
    <div className="space-y-4">
      <h3 className="label-caps">Clinical Decision Support Query</h3>
      <textarea
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs resize-none"
        rows={4}
        placeholder="e.g., Is it safe to add metformin for a patient with type 2 diabetes and CKD stage 3?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        onClick={() => onSubmit({ query })}
        disabled={loading || !isConnected || !query.trim()}
        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-sm font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
        {loading ? 'Analyzing...' : 'Run Decision Support'}
      </button>
    </div>
  );
}

function PriorAuthForm({ onSubmit, loading, isConnected }: { onSubmit: (args: Record<string, unknown>) => void; loading: boolean; isConnected: boolean }) {
  const [procedure, setProcedure] = useState('');
  const [diagnoses, setDiagnoses] = useState('');
  const [insurer, setInsurer] = useState('');
  return (
    <div className="space-y-4">
      <h3 className="label-caps">Prior Authorization Request</h3>
      <div className="grid grid-cols-2 gap-3">
        <input className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs" placeholder="CPT Code (e.g., 99213)" value={procedure} onChange={(e) => setProcedure(e.target.value)} />
        <input className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs" placeholder="Insurer (e.g., BCBS)" value={insurer} onChange={(e) => setInsurer(e.target.value)} />
      </div>
      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs" placeholder="ICD-10 Codes (comma-separated, e.g., E11.9, Z00.00)" value={diagnoses} onChange={(e) => setDiagnoses(e.target.value)} />
      <button
        onClick={() => onSubmit({ action: 'create', procedureCode: procedure, diagnosisCodes: diagnoses.split(',').map((d) => d.trim()).filter(Boolean), insurerId: insurer })}
        disabled={loading || !isConnected}
        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-sm font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
        {loading ? 'Submitting...' : 'Submit Prior Auth'}
      </button>
    </div>
  );
}

function FollowUpForm({ onSubmit, loading, isConnected }: { onSubmit: (args: Record<string, unknown>) => void; loading: boolean; isConnected: boolean }) {
  const [message, setMessage] = useState('Please contact your care team for follow-up.');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  return (
    <div className="space-y-4">
      <h3 className="label-caps">Schedule Follow-up Communication</h3>
      <textarea
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs resize-none"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex gap-2">
        {(['sms', 'whatsapp'] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            className={`px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all ${channel === ch ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            {ch}
          </button>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ action: 'schedule', body: message, channel })}
        disabled={loading || !isConnected}
        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-sm font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {loading ? 'Scheduling...' : 'Schedule Follow-up'}
      </button>
    </div>
  );
}

function ScribeForm({ onSubmit, loading, isConnected }: { onSubmit: (args: Record<string, unknown>) => void; loading: boolean; isConnected: boolean }) {
  const [transcript, setTranscript] = useState('');
  const [doctorId, setDoctorId] = useState('');
  return (
    <div className="space-y-4">
      <h3 className="label-caps">SOAP Note from Encounter Transcript</h3>
      <div className="grid grid-cols-2 gap-3">
        <input className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs" placeholder="Doctor ID" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} />
      </div>
      <textarea
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs resize-none"
        rows={6}
        placeholder="Paste the encounter transcript here..."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      <button
        onClick={() => onSubmit({ transcript, doctorId })}
        disabled={loading || !isConnected || !transcript.trim()}
        className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-sm font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        {loading ? 'Generating...' : 'Generate SOAP Note'}
      </button>
    </div>
  );
}
