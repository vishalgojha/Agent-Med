/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Stethoscope, 
  Settings, 
  LogOut, 
  Plus, 
  Search,
  Activity,
  Mic,
  FileText,
  Database,
  Wrench,
  MessageSquare,
  Monitor,
  Shield
} from 'lucide-react';

import PatientList from './components/PatientList';
import AmbientScribe from './components/AmbientScribe';
import Dashboard from './components/Dashboard';
import FhirExplorer from './components/FhirExplorer';
import ClinicalTools from './components/ClinicalTools';
import A2aAgentChat from './components/A2aAgentChat';
import SystemStatus from './components/SystemStatus';
import { FhirConfig } from './services/apiClient';
import { MCP_URL, A2A_URL, CORE_URL } from './services/apiClient';

type Tab = 'dashboard' | 'patients' | 'scribe' | 'fhir' | 'tools' | 'a2a' | 'status' | 'settings';

interface FhirSettings {
  serverUrl: string;
  accessToken: string;
  patientId: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [fhirSettings, setFhirSettings] = useState<FhirSettings>(() => {
    try {
      const stored = localStorage.getItem('fhir-settings');
      return stored ? JSON.parse(stored) : { serverUrl: '', accessToken: '', patientId: '' };
    } catch {
      return { serverUrl: '', accessToken: '', patientId: '' };
    }
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('fhir-settings', JSON.stringify(fhirSettings));
  }, [fhirSettings]);

  const fhirConfig: FhirConfig | null = fhirSettings.serverUrl
    ? { serverUrl: fhirSettings.serverUrl, accessToken: fhirSettings.accessToken, patientId: fhirSettings.patientId }
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-12 h-12 border-4 border-medical-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div id="login-screen" className="flex flex-col items-center justify-center min-h-screen bg-slate-950 medical-grid relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 scanline"></div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-10 bg-slate-900 border border-slate-800 rounded-sm shadow-2xl max-w-sm w-full text-center relative z-10"
        >
          <div className="w-16 h-16 bg-sky-500 rounded-sm flex items-center justify-center mx-auto mb-6 shadow-lg shadow-sky-500/20">
            <Stethoscope className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1 tracking-tighter uppercase font-mono">Agent-Med <span className="text-slate-500 text-xs font-normal">v4.2</span></h1>
          <p className="text-emerald-500 font-mono text-[10px] mb-8 uppercase tracking-widest animate-pulse">System Boot Sequence Active...</p>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full py-3 px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            Authenticate Google ID
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Top OS Header */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-sky-500 rounded-sm flex items-center justify-center font-bold text-sm">AM</div>
          <h1 className="text-base font-bold tracking-tight uppercase">Agent-Med <span className="text-slate-500 font-normal text-xs ml-1">OS v4.2.0</span></h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex gap-4 text-[10px] font-mono">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> AGENT ACTIVE</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> SYSTEM SYNCED</span>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold">{user.displayName}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-tighter">Clinical Provider</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <nav className="w-64 bg-white border-r border-slate-200 flex flex-col p-3 shrink-0">
          <div className="space-y-1 flex-grow">
            <p className="label-caps px-4 py-2 mt-4">Command Center</p>
            <SidebarLink 
              icon={<Activity size={16} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <SidebarLink 
              icon={<Users size={16} />} 
              label="Patient Registry" 
              active={activeTab === 'patients'} 
              onClick={() => setActiveTab('patients')} 
            />
            <SidebarLink 
              icon={<Mic size={16} />} 
              label="Ambient Scribe" 
              active={activeTab === 'scribe'} 
              onClick={() => setActiveTab('scribe')} 
            />
            <p className="label-caps px-4 py-2 mt-6">Integrations</p>
            <SidebarLink 
              icon={<Database size={16} />} 
              label="FHIR Explorer" 
              active={activeTab === 'fhir'} 
              onClick={() => setActiveTab('fhir')} 
            />
            <SidebarLink 
              icon={<Wrench size={16} />} 
              label="Clinical Tools" 
              active={activeTab === 'tools'} 
              onClick={() => setActiveTab('tools')} 
            />
            <SidebarLink 
              icon={<MessageSquare size={16} />} 
              label="A2A Agent" 
              active={activeTab === 'a2a'} 
              onClick={() => setActiveTab('a2a')} 
            />
            <p className="label-caps px-4 py-2 mt-6">System</p>
            <SidebarLink 
              icon={<Monitor size={16} />} 
              label="Status" 
              active={activeTab === 'status'} 
              onClick={() => setActiveTab('status')} 
            />
            <SidebarLink 
              icon={<Shield size={16} />} 
              label="Settings" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
            />
          </div>

          <div className="mt-auto pt-4 border-t border-slate-100">
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-red-500 transition-colors rounded-sm"
            >
              <LogOut size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">De-Authenticate</span>
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative medical-grid p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="max-w-7xl mx-auto"
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'patients' && <PatientList />}
              {activeTab === 'scribe' && <AmbientScribe />}
              {activeTab === 'fhir' && <FhirExplorer fhirConfig={fhirConfig} />}
              {activeTab === 'tools' && <ClinicalTools fhirConfig={fhirConfig} />}
              {activeTab === 'a2a' && <A2aAgentChat fhirConfig={fhirConfig} />}
              {activeTab === 'status' && <SystemStatus />}
              {activeTab === 'settings' && <FhirSettingsPage settings={fhirSettings} onSave={setFhirSettings} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-slate-100 border-t border-slate-200 flex items-center px-6 justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex gap-6 uppercase tracking-widest">
          <span>ENCRYPTION: AES-256-GCM</span>
          <span>HIPAA: COMPLIANT</span>
          <span className="hidden sm:inline">NODES: 04-ACTIVE</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="font-bold text-slate-900">{currentTime.toLocaleTimeString('en-US', { hour12: false })} UTC</span>
        </div>
      </footer>
    </div>
  );
}

function FhirSettingsPage({ settings, onSave }: { settings: FhirSettings; onSave: (s: FhirSettings) => void }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Settings</h1>
        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">FHIR Server & SHARP Context Configuration</p>
      </div>

      <div className="panel p-6 space-y-4">
        <h2 className="label-caps">FHIR Connection</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Server URL</label>
            <input
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
              placeholder="https://fhir.example.com/r4"
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Access Token</label>
            <input
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
              placeholder="Bearer token for FHIR authentication"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Default Patient ID</label>
            <input
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs"
              placeholder="FHIR Patient resource ID"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            />
          </div>
        </div>

        <div className="pt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all"
          >
            {saved ? 'Saved!' : 'Save Configuration'}
          </button>
          {saved && <span className="text-[10px] font-mono text-emerald-600">Settings persisted to localStorage</span>}
        </div>
      </div>

      <div className="panel p-6 space-y-3">
        <h2 className="label-caps">Environment Variables</h2>
        <p className="text-[10px] text-slate-400">Configure these in your <code className="bg-slate-100 px-1 rounded">.env</code> file for the UI package:</p>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between p-2 bg-slate-50 rounded-sm">
            <span className="text-slate-600">VITE_CORE_URL</span>
            <span className="text-slate-400">{CORE_URL}</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 rounded-sm">
            <span className="text-slate-600">VITE_MCP_URL</span>
            <span className="text-slate-400">{MCP_URL}</span>
          </div>
          <div className="flex justify-between p-2 bg-slate-50 rounded-sm">
            <span className="text-slate-600">VITE_A2A_URL</span>
            <span className="text-slate-400">{A2A_URL}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void 
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-sm transition-all duration-150 group ${
        active 
          ? 'bg-slate-100 text-sky-600 border-l-2 border-sky-600' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-transparent'
      }`}
    >
      <span className={`${active ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{icon}</span>
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
