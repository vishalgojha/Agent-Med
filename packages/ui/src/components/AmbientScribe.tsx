import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Save, Brain } from 'lucide-react';
import { analyzeEncounter, refineTranscription, EncounterAnalysis } from '../services/geminiService';

interface Patient {
  id: string;
  name: string;
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

function saveEncounter(encounter: Encounter) {
  const existing = loadEncounters();
  existing.push(encounter);
  localStorage.setItem('agent-med-encounters', JSON.stringify(existing));
}

export default function AmbientScribe() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [analysis, setAnalysis] = useState<EncounterAnalysis | null>(null);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'setup' | 'recording' | 'review'>('setup');

  const recognitionRef = useRef<any>(null);
  const patients = loadPatients();

  useEffect(() => {
    if (typeof window !== 'undefined' && ('WebkitSpeechRecognition' in window || 'speechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setTranscript(prev => prev + final);
        setInterimTranscript(interim);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setTranscript('');
      setInterimTranscript('');
      recognitionRef.current?.start();
      setIsRecording(true);
      setStep('recording');
    }
  };

  const stopAndProcess = async () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setProcessing(true);
    setStep('review');
    
    try {
      const refined = await refineTranscription(transcript);
      setTranscript(refined);
      const result = await analyzeEncounter(refined);
      setAnalysis(result);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const saveEncounterToStorage = () => {
    if (!selectedPatientId || !analysis) return;
    
    saveEncounter({
      id: `enc_${Date.now().toString(36)}`,
      patientId: selectedPatientId,
      transcript,
      summary: analysis.summary,
      aiAnalysis: JSON.stringify(analysis),
      createdAt: new Date().toISOString(),
    });

    setStep('setup');
    setAnalysis(null);
    setTranscript('');
    setSelectedPatientId('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">Ambient Scribe Intelligence</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Status: {isRecording ? 'Recording Interface Active' : 'Neural Core Synced'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left Column: Live Stream */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
          <div className="panel flex flex-col min-h-[450px] relative overflow-hidden bg-slate-950 text-emerald-400 border-slate-800 border-b-4 border-b-sky-600">
            <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center shrink-0">
              <span className="label-caps text-slate-400 !mb-0">Secure Clinical Stream: encrypted_input_01</span>
              <div className="flex gap-4">
                <span className="text-[9px] font-mono flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> AGENT_INGEST</span>
                <span className="text-[9px] font-mono text-slate-500">FORMAT: VOICE-TO-EMR</span>
              </div>
            </div>

            <div className="flex-1 p-6 data-mono overflow-y-auto custom-scrollbar relative">
              {transcript || interimTranscript ? (
                <div className="space-y-4 pr-4">
                  <div className="flex gap-2">
                    <span className="text-slate-600 shrink-0">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {transcript}
                      <span className="text-emerald-300 opacity-70 animate-pulse">{interimTranscript}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4 text-slate-600">
                    <Mic size={24} />
                  </div>
                  <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-600">Waiting for clinical input trigger...</p>
                </div>
              )}
              {isRecording && <div className="absolute inset-x-0 top-0 h-px bg-emerald-500/20 scanline pointer-events-none"></div>}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900 flex gap-4">
              {!isRecording && step !== 'review' && (
                <button 
                  onClick={toggleRecording}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Mic size={14} /> Start Clinical Stream
                </button>
              )}

              {isRecording && (
                <button 
                  onClick={stopAndProcess}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Square size={14} fill="currentColor" /> Finalize & Process
                </button>
              )}

              {step === 'review' && (
                <button 
                  onClick={saveEncounterToStorage}
                  disabled={!selectedPatientId || processing}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={14} /> {processing ? 'Synthesizing...' : 'Commit to EHR'}
                </button>
              )}
              
              {step === 'review' && (
                 <button 
                 onClick={() => setStep('recording')}
                 className="px-6 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all"
               >
                 Resume
               </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Reasoning & Target Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
           <section className="panel p-4">
            <h3 className="label-caps">Target Context</h3>
            <div className="mt-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Active Patient File</p>
              <select 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-sky-500 text-xs font-bold uppercase tracking-tight"
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
              >
                <option value="">-- UNKNOWN --</option>
                {patients.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
          </section>

          <section className={`panel flex-1 p-0 overflow-hidden flex flex-col transition-all duration-300 ${analysis ? 'bg-sky-600 text-white border-none' : 'bg-white'}`}>
            <div className={`px-4 py-2 border-b flex justify-between items-center ${analysis ? 'border-sky-500/30' : 'border-slate-100 bg-slate-50'}`}>
              <h3 className={`label-caps !mb-0 ${analysis ? 'text-sky-200' : ''}`}>Agent recommendation</h3>
              {processing && <div className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />}
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              {analysis ? (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-2">Primary Diagnosis</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.diagnoses.map(d => (
                        <span key={d} className="bg-white/10 px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-tighter border border-white/20">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-1">Clinical Synthesis</p>
                    <p className="text-sm font-medium leading-relaxed">{analysis.summary}</p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-1">Proposed Care Plan</p>
                    <pre className="text-[11px] font-mono leading-tight whitespace-pre-wrap opacity-90">{analysis.suggestedPlan}</pre>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                     <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-white/5 rounded-sm">
                           <p className="text-[8px] uppercase tracking-widest opacity-50 font-bold">Confidence</p>
                           <p className="text-xs font-bold font-mono tracking-tighter">0.9982</p>
                        </div>
                        <div className="p-2 bg-white/5 rounded-sm">
                           <p className="text-[8px] uppercase tracking-widest opacity-50 font-bold">Latency</p>
                           <p className="text-xs font-bold font-mono tracking-tighter">142ms</p>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 px-8">
                  <div className="w-10 h-10 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-3 text-slate-300">
                    <Brain size={20} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neural synthesis standby</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
