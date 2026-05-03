import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, FileText, Activity, Clock } from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  dob: string;
  gender: string;
}

interface Encounter {
  id: string;
  patientId: string;
  transcript: string;
  summary: string;
  aiAnalysis: string;
  createdAt: string;
}

function loadPatients(): Patient[] {
  try {
    const raw = localStorage.getItem('agent-med-patients');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadEncounters(): Encounter[] {
  try {
    const raw = localStorage.getItem('agent-med-encounters');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);

  useEffect(() => {
    setPatients(loadPatients());
    setEncounters(loadEncounters());
  }, []);

  const today = new Date().toDateString();
  const todayEncounters = encounters.filter(
    (e) => new Date(e.createdAt).toDateString() === today
  );

  const getPatientName = (patientId: string) => {
    const p = patients.find((p) => p.id === patientId);
    return p ? p.name : 'Unknown';
  };

  const stats = [
    { label: 'Active Patients', value: patients.length, icon: <Users className="text-blue-600" />, trend: 'local storage' },
    { label: 'Encounters Today', value: todayEncounters.length, icon: <FileText className="text-emerald-600" />, trend: `${encounters.length - todayEncounters.length} historical` },
    { label: 'Avg Voice Scribe', value: '98%', icon: <Activity className="text-amber-600" />, trend: 'Accuracy rate' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">Physician Overview</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Provider: Local Session • Node: AIS-PRO-01</p>
          </div>
        </div>
        <div className="text-right">
          <p className="label-caps !mb-0">System Time</p>
          <p className="text-sm font-mono font-bold">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], {hour12: false})}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="panel p-4 vital-badge"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="label-caps">{stat.label}</span>
              <div className="p-1.5 bg-slate-50 rounded-sm">{stat.icon}</div>
            </div>
            <div className="flex items-end gap-2">
              <h3 className="text-2xl font-bold text-slate-900 leading-none">{stat.value}</h3>
              <p className="text-[10px] text-slate-400 font-mono mb-0.5">{stat.trend}</p>
            </div>
          </motion.div>
        ))}
        <div className="panel p-4 bg-sky-600 border-none flex flex-col justify-between">
          <span className="label-caps text-sky-200">Alert Priority</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-bold text-white uppercase tracking-tight">Active Critical</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 panel p-0 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
            <h2 className="label-caps !mb-0">Patient Queue & Recent Ingests</h2>
          </div>
          <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
            {patients.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50/30 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-white border border-slate-200 rounded-sm flex items-center justify-center text-xs font-bold text-slate-500 uppercase">
                    {doc.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{doc.name}</p>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">UID: {doc.id.slice(0, 8)} • DOB: {doc.dob}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 pr-2">
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Status</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Processed</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Telemetry</p>
                    <p className="text-[10px] font-mono text-slate-600">Stable</p>
                  </div>
                </div>
              </div>
            ))}
            {patients.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-xs font-mono text-slate-400">0 RECORDS RETURNED FROM LOCAL REPOSITORY</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <section className="panel p-4 terminal-log flex-1">
            <div className="flex justify-between mb-4 pb-2 border-b border-slate-800">
              <span className="label-caps text-slate-600 italic">Encounter Log</span>
              <span className="text-[9px] uppercase">{encounters.length} total</span>
            </div>
            <div className="space-y-1 text-[11px] font-mono leading-tight max-h-[200px] overflow-y-auto">
              {encounters.length > 0 ? (
                [...encounters].reverse().slice(0, 8).map((enc) => (
                  <p key={enc.id}>
                    <span className="text-slate-600">[{new Date(enc.createdAt).toLocaleTimeString([], { hour12: false })}]</span>{' '}
                    <span className="text-emerald-500">ENC:</span>{' '}
                    <span className="text-slate-400">{getPatientName(enc.patientId)}</span>{' '}
                    <span className="text-slate-600">— {enc.summary.slice(0, 60)}{enc.summary.length > 60 ? '...' : ''}</span>
                  </p>
                ))
              ) : (
                <>
                  <p><span className="text-slate-600">[System]</span> <span className="text-sky-400">BOOT:</span> Agent-Med Engine v4.2</p>
                  <p><span className="text-slate-600">[System]</span> <span className="text-emerald-500">READY:</span> No encounters recorded yet</p>
                  <p className="animate-pulse">_</p>
                </>
              )}
            </div>
          </section>

          <section className="panel p-4">
            <h3 className="label-caps">Risk Propensity</h3>
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-[10px] text-slate-500 flex justify-between mb-1 uppercase font-bold"><span>Comorbidity Index</span> <span className="text-slate-900">42.8%</span></p>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-sky-500 h-full w-[42.8%]"></div>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 flex justify-between mb-1 uppercase font-bold"><span>Acute Variance</span> <span className="text-rose-500">Normal</span></p>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[12%]"></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
