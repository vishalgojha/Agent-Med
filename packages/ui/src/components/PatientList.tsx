import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, UserPlus, X, ChevronRight, Trash2, Edit2, Upload, Camera } from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  dob: string;
  gender: string;
  medicalHistory: string;
  photoUrl?: string;
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
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  useEffect(() => {
    setPatients(loadPatients());
  }, []);

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

  const updatePatient = (id: string, data: Omit<Patient, 'id' | 'createdAt'>) => {
    const updated = patients.map((p) =>
      p.id === id ? { ...p, ...data } : p
    );
    setPatients(updated);
    savePatients(updated);
  };

  const deletePatient = (id: string) => {
    const updated = patients.filter((p) => p.id !== id);
    setPatients(updated);
    savePatients(updated);
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingPatient(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Patient Repository</h1>
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1 italic">{patients.length} records stored locally</p>
        </div>
        <button 
          onClick={() => { setEditingPatient(null); setIsAddModalOpen(true); }}
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
            className="panel group px-4 py-3 hover:border-sky-500 transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-sky-500"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.name} className="w-10 h-10 rounded-sm object-cover border border-slate-200" />
                ) : (
                  <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-sm flex items-center justify-center font-bold text-sm text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600">
                    {p.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase leading-none">{p.name}</h3>
                  <p className="text-[9px] font-mono text-slate-400 mt-1 uppercase">DOB: {p.dob} • {p.gender.charAt(0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                  className="p-1 hover:bg-sky-50 rounded-sm text-slate-400 hover:text-sky-600 transition-colors"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deletePatient(p.id); }}
                  className="p-1 hover:bg-rose-50 rounded-sm text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {p.medicalHistory && (
              <p className="text-[9px] font-mono text-slate-300 mt-2 truncate">{p.medicalHistory}</p>
            )}
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
          <AddPatientModal
            onClose={handleCloseModal}
            onAdd={addPatient}
            onUpdate={editingPatient ? (data) => updatePatient(editingPatient.id, data) : undefined}
            editingPatient={editingPatient}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPatientModal({
  onClose,
  onAdd,
  onUpdate,
  editingPatient,
}: {
  onClose: () => void;
  onAdd: (p: Omit<Patient, 'id' | 'createdAt'>) => void;
  onUpdate?: (data: Omit<Patient, 'id' | 'createdAt'>) => void;
  editingPatient: Patient | null;
}) {
  const [formData, setFormData] = useState({
    name: editingPatient?.name || '',
    dob: editingPatient?.dob || '',
    gender: editingPatient?.gender || 'Male',
    medicalHistory: editingPatient?.medicalHistory || '',
    photoUrl: editingPatient?.photoUrl || '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdate) {
      onUpdate(formData);
    } else {
      onAdd(formData);
    }
    onClose();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData({ ...formData, photoUrl: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFormData({ ...formData, photoUrl: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">
            {editingPatient ? 'Edit Patient Record' : 'New Patient Enrollment'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-sm transition-colors text-slate-400">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Photo Upload */}
          <div className="flex items-center gap-4">
            {formData.photoUrl ? (
              <div className="relative w-16 h-16 rounded-sm overflow-hidden border-2 border-slate-200">
                <img src={formData.photoUrl} alt="Patient" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-0.5 right-0.5 bg-red-500 text-white p-0.5 rounded-full hover:bg-red-600"
                >
                  <X size={10} />
                </button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-sm bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                <Camera className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <div className="flex-1">
              <label className="label-caps tracking-widest">Patient Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="mt-1 block w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-sm file:border-0 file:text-[10px] file:font-bold file:bg-sky-50 file:text-sky-700 file:uppercase file:tracking-wider hover:file:bg-sky-100"
              />
              <p className="text-[9px] text-slate-400 mt-0.5">JPG, PNG or GIF (max 2MB)</p>
            </div>
          </div>

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
            {editingPatient ? 'Update Record' : 'Commit Record'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
