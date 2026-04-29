import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, UserPlus, X, ChevronRight } from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  dob: string;
  gender: string;
  medicalHistory: string;
  createdAt: string;
}

const STORAGE_KEY = 'agent-med-patients';

function loadPatients(): Patient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePatients(patients: Patient[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
}

export default function PatientList() {
  const [patients, setPatients] = useState<Patient[]>(loadPatients);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addPatient = (patient: Omit<Patient, 'id' | 'createdAt'>) => {
    const newPatient: Patient = {
      ...patient,
      id: `px_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...patients, newPatient];
    setPatients(updated);
    savePatients(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Patient Repository</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1 italic">{patients.length} records stored locally</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-md shadow-sky-500/20"
        >
          <UserPlus size={14} />
          <span>New Enrollment</span>
        </button>
      </div>

      <div className="flex gap-2 items-center bg-white p-1 rounded-sm border border-slate-200 shadow-sm">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold" size={14} />
          <input 
            type="text" 
            placeholder="Search Registry (Name, ID)..." 
            className="w-full pl-10 pr-4 py-2 bg-transparent outline-none text-xs font-mono text-slate-700 placeholder:text-slate-300 uppercase tracking-tight"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPatients.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="panel group px-4 py-3 hover:border-sky-500 transition-all cursor-pointer flex items-center justify-between border-l-4 border-l-transparent hover:border-l-sky-500"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-sm flex items-center justify-center font-bold text-xs text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600">
                {p.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase leading-none">{p.name}</h3>
                <p className="text-[9px] font-mono text-slate-400 mt-1 uppercase">DOB: {p.dob} • {p.gender.charAt(0)}</p>
              </div>
            </div>
            <ChevronRight className="text-slate-200 group-hover:text-sky-500" size={14} />
          </motion.div>
        ))}
        {filteredPatients.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">No patients found. Enroll a new patient to get started.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddModalOpen && (
          <AddPatientModal onClose={() => setIsAddModalOpen(false)} onAdd={addPatient} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPatientModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Omit<Patient, 'id' | 'createdAt'>) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    gender: 'Male',
    medicalHistory: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="relative bg-white w-full max-w-lg rounded-sm shadow-2xl overflow-hidden border border-slate-200"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">New Patient Enrollment</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-sm transition-colors text-slate-400">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="label-caps tracking-widest">Full Legal Name</label>
              <input 
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs uppercase" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="label-caps tracking-widest">Date of Birth</label>
              <input 
                required
                type="date"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs" 
                value={formData.dob}
                onChange={e => setFormData({...formData, dob: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="label-caps tracking-widest">Gender Tag</label>
              <select 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs uppercase"
                value={formData.gender}
                onChange={e => setFormData({...formData, gender: e.target.value})}
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="label-caps tracking-widest">Medical Context / History</label>
            <textarea 
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 font-mono text-xs resize-none"
              value={formData.medicalHistory}
              onChange={e => setFormData({...formData, medicalHistory: e.target.value})}
            />
          </div>
          <button 
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
          >
            Commit Record
          </button>
        </form>
      </motion.div>
    </div>
  );
}
