import { FormEvent, useMemo, useState } from "react";

type Tab = "overview" | "registry" | "scribe" | "priorAuth" | "followUp" | "decide" | "deadLetters" | "replay";

async function apiRequest<T>(
  path: string,
  token: string,
  init?: RequestInit & { bodyJson?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init?.bodyJson !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: init?.bodyJson !== undefined ? JSON.stringify(init.bodyJson) : init?.body
  });
  const json = (await res.json()) as { ok: boolean; data?: T; message?: string; code?: string };
  if (!res.ok || !json.ok) {
    throw new Error(`${json.code ?? "REQUEST_FAILED"}: ${json.message ?? `HTTP ${res.status}`}`);
  }
  return json.data as T;
}

export function App() {
  const [token, setToken] = useState("");
  const [active, setActive] = useState<Tab>("overview");
  const [result, setResult] = useState<string>("Ready for commands.");
  const [loading, setLoading] = useState(false);
  const [doctorId, setDoctorId] = useState("d_demo");
  const [patientId, setPatientId] = useState("p_demo");
  const [deadLetterId, setDeadLetterId] = useState("");

  const navigation = useMemo(() => [
    {
      label: "Operations",
      items: [
        { id: "overview" as Tab, label: "Overview" },
        { id: "replay" as Tab, label: "Audit Replay" },
      ]
    },
    {
      label: "Management",
      items: [
        { id: "registry" as Tab, label: "Registry" },
        { id: "deadLetters" as Tab, label: "Dead Letters" },
      ]
    },
    {
      label: "Agents",
      items: [
        { id: "scribe" as Tab, label: "Ambient Scribe" },
        { id: "priorAuth" as Tab, label: "Prior Auth" },
        { id: "followUp" as Tab, label: "Follow-up" },
        { id: "decide" as Tab, label: "Decision Support" },
      ]
    }
  ], []);

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    try {
      const data = await fn();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const runOverview = async () => {
    await run(async () => {
      const ready = await fetch("/health/ready").then((r) => r.json());
      const metrics = await apiRequest("/api/ops/metrics", token);
      return { ready, metrics };
    });
  };

  const runScribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(() =>
      apiRequest("/api/scribe", token, {
        method: "POST",
        bodyJson: {
          transcript: String(fd.get("transcript") ?? ""),
          patientId,
          doctorId
        }
      })
    );
  };

  const runCreateDoctor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(async () => {
      const data = await apiRequest<{ id: string; name: string; specialty: string }>("/api/doctors", token, {
        method: "POST",
        bodyJson: {
          name: String(fd.get("name") ?? ""),
          specialty: String(fd.get("specialty") ?? "general")
        }
      });
      setDoctorId(data.id);
      return data;
    });
  };

  const runCreatePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(async () => {
      const data = await apiRequest<{ id: string; doctorId: string; name: string }>("/api/patients", token, {
        method: "POST",
        bodyJson: {
          doctorId,
          name: String(fd.get("name") ?? ""),
          phone: String(fd.get("phone") ?? "")
        }
      });
      setPatientId(data.id);
      return data;
    });
  };

  const runPriorAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(() =>
      apiRequest("/api/prior-auth", token, {
        method: "POST",
        bodyJson: {
          patientId,
          doctorId,
          procedureCode: String(fd.get("procedureCode") ?? ""),
          insurerId: String(fd.get("insurerId") ?? ""),
          diagnosisCodes: String(fd.get("diagnosisCodes") ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        }
      })
    );
  };

  const runFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(() =>
      apiRequest("/api/follow-up", token, {
        method: "POST",
        bodyJson: {
          patientId,
          doctorId,
          trigger: String(fd.get("trigger") ?? "lab_result"),
          customMessage: String(fd.get("customMessage") ?? ""),
          dryRun: true
        }
      })
    );
  };

  const runDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(() =>
      apiRequest("/api/decide", token, {
        method: "POST",
        bodyJson: {
          patientId,
          query: String(fd.get("query") ?? "")
        }
      })
    );
  };

  return (
    <div className="studio-container">
      <aside className="sidebar">
        <h1>Doctor Agent</h1>
        {navigation.map((group) => (
          <div key={group.label} className="nav-group">
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                className={`nav-button ${active === item.id ? "active" : ""}`}
                onClick={() => setActive(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="main-area">
        <header className="top-bar">
          <div className="context-item">
            <span className="context-label">API TOKEN</span>
            <input 
              className="context-value" 
              style={{ background: 'transparent', border: 'none', padding: 0, width: '150px' }}
              value={token} 
              onChange={(e) => setToken(e.target.value)} 
              placeholder="Bearer..." 
            />
          </div>
          <div className="context-item">
            <span className="context-label">DOCTOR ID</span>
            <input 
              className="context-value" 
              style={{ background: 'transparent', border: 'none', padding: 0, width: '120px' }}
              value={doctorId} 
              onChange={(e) => setDoctorId(e.target.value)} 
            />
          </div>
          <div className="context-item">
            <span className="context-label">PATIENT ID</span>
            <input 
              className="context-value" 
              style={{ background: 'transparent', border: 'none', padding: 0, width: '120px' }}
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)} 
            />
          </div>
        </header>

        <div className="content-container">
          <div className="workspace">
            {active === "overview" && (
              <div className="stack">
                <div className="card">
                  <h3>System Overview</h3>
                  <button onClick={runOverview} disabled={loading} className="btn-secondary">
                    Refresh Readiness & Metrics
                  </button>
                </div>
              </div>
            )}

            {active === "registry" && (
              <div className="stack">
                <div className="card">
                  <h3>Provider Registry</h3>
                  <form className="stack" onSubmit={runCreateDoctor}>
                    <input name="name" placeholder="New Doctor Name" required />
                    <select name="specialty" defaultValue="general">
                      <option value="primary_care">Primary Care</option>
                      <option value="emergency">Emergency</option>
                      <option value="oncology">Oncology</option>
                      <option value="psychiatry">Psychiatry</option>
                      <option value="hospitalist">Hospitalist</option>
                      <option value="surgery">Surgery</option>
                      <option value="general">General</option>
                    </select>
                    <button disabled={loading}>Add Provider</button>
                  </form>
                </div>
                <div className="card">
                  <h3>Patient Registry</h3>
                  <form className="stack" onSubmit={runCreatePatient}>
                    <input name="name" placeholder="New Patient Name" required />
                    <input name="phone" placeholder="Phone (E.164)" />
                    <button disabled={loading}>Add Patient</button>
                  </form>
                </div>
              </div>
            )}

            {active === "scribe" && (
              <div className="card">
                <h3>Ambient Scribe</h3>
                <form className="stack" onSubmit={runScribe}>
                  <textarea name="transcript" rows={12} placeholder="Paste the patient encounter transcript here..." required />
                  <button disabled={loading}>Generate Clinical SOAP Note</button>
                </form>
              </div>
            )}

            {active === "priorAuth" && (
              <div className="card">
                <h3>Prior Authorization Assistant</h3>
                <form className="stack" onSubmit={runPriorAuth}>
                  <input name="procedureCode" placeholder="Procedure Code (e.g. 99213)" required />
                  <input name="insurerId" placeholder="Insurer ID (e.g. BCBS)" required />
                  <input name="diagnosisCodes" placeholder="Diagnosis Codes (CSV: Z00.00, E11.9)" required />
                  <button disabled={loading}>Draft Authorization</button>
                </form>
              </div>
            )}

            {active === "followUp" && (
              <div className="card">
                <h3>Follow-up Automation</h3>
                <form className="stack" onSubmit={runFollowUp}>
                  <select name="trigger" defaultValue="lab_result">
                    <option value="post_visit">Post Visit</option>
                    <option value="lab_result">Lab Result</option>
                    <option value="medication_reminder">Medication Reminder</option>
                    <option value="custom">Custom Trigger</option>
                  </select>
                  <textarea name="customMessage" rows={3} placeholder="Custom message (optional)" />
                  <button disabled={loading}>Schedule Dry-Run</button>
                </form>
              </div>
            )}

            {active === "decide" && (
              <div className="card">
                <h3>Clinical Decision Support</h3>
                <form className="stack" onSubmit={runDecision}>
                  <textarea name="query" rows={4} placeholder="Enter clinical question (e.g. 'Is it safe to add metformin?')" required />
                  <button disabled={loading}>Run Analysis</button>
                </form>
              </div>
            )}

            {active === "deadLetters" && (
              <div className="card">
                <h3>Dead Letter Management</h3>
                <div className="stack">
                  <input
                    value={deadLetterId}
                    onChange={(e) => setDeadLetterId(e.target.value)}
                    placeholder="Enter Dead-Letter ID to requeue"
                  />
                  <button
                    onClick={() => run(() => apiRequest(`/api/follow-up/dead-letter/${encodeURIComponent(deadLetterId)}/requeue`, token, { method: "POST", bodyJson: { doctorId, dryRun: false } }))}
                    disabled={loading || !deadLetterId}
                  >
                    Requeue Item
                  </button>
                </div>
              </div>
            )}

            {active === "replay" && (
              <div className="card">
                <h3>Audit Log Replay</h3>
                <button onClick={() => run(() => apiRequest("/api/replay", token))} disabled={loading}>
                  Load Replay Log
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="console-panel">
          <div className="console-header">
            <span>AGENT CONSOLE</span>
            <span>{loading ? "RUNNING..." : "IDLE"}</span>
          </div>
          <pre className="console-output">{result}</pre>
        </aside>
      </main>
    </div>
  );
}
