import { FormEvent, useMemo, useState } from "react";

type Tab = "registry" | "overview" | "scribe" | "priorAuth" | "followUp" | "decide" | "deadLetters" | "replay";

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
  const [result, setResult] = useState<string>("Run an action to see output.");
  const [loading, setLoading] = useState(false);
  const [doctorId, setDoctorId] = useState("d_demo");
  const [patientId, setPatientId] = useState("p_demo");
  const [deadLetterId, setDeadLetterId] = useState("");

  const tabs: Array<{ id: Tab; label: string }> = useMemo(
    () => [
      { id: "overview", label: "Ops" },
      { id: "registry", label: "Registry" },
      { id: "scribe", label: "Ambient Scribe" },
      { id: "priorAuth", label: "Prior Auth" },
      { id: "followUp", label: "Follow-up" },
      { id: "decide", label: "Decision Support" },
      { id: "deadLetters", label: "Dead Letters" },
      { id: "replay", label: "Replay" }
    ],
    []
  );

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
    <div className="page">
      <header className="top">
        <h1>doctor-agent Control Room</h1>
        <p>Built for live clinical operations: fast action, clear risk, audit-first.</p>
      </header>

      <section className="auth">
        <label>
          API token
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token value" />
        </label>
        <label>
          Doctor ID
          <input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} />
        </label>
        <label>
          Patient ID
          <input value={patientId} onChange={(e) => setPatientId(e.target.value)} />
        </label>
      </section>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="panel">
        {active === "overview" && (
          <div className="stack">
            <button onClick={runOverview} disabled={loading}>
              Refresh readiness + metrics
            </button>
          </div>
        )}

        {active === "registry" && (
          <div className="stack">
            <form className="stack" onSubmit={runCreateDoctor}>
              <h3>Create doctor</h3>
              <input name="name" placeholder="Doctor name" required />
              <select name="specialty" defaultValue="general">
                <option value="primary_care">primary_care</option>
                <option value="emergency">emergency</option>
                <option value="oncology">oncology</option>
                <option value="psychiatry">psychiatry</option>
                <option value="hospitalist">hospitalist</option>
                <option value="surgery">surgery</option>
                <option value="general">general</option>
              </select>
              <button disabled={loading}>Create doctor</button>
            </form>
            <form className="stack" onSubmit={runCreatePatient}>
              <h3>Create patient</h3>
              <input name="name" placeholder="Patient name" required />
              <input name="phone" placeholder="Phone E.164 (optional)" />
              <button disabled={loading}>Create patient</button>
            </form>
            <div className="stack">
              <button onClick={() => run(() => apiRequest("/api/doctors", token))} disabled={loading}>
                List doctors
              </button>
              <button onClick={() => run(() => apiRequest(`/api/patients?doctorId=${encodeURIComponent(doctorId)}`, token))} disabled={loading}>
                List patients for doctor
              </button>
            </div>
          </div>
        )}

        {active === "scribe" && (
          <form className="stack" onSubmit={runScribe}>
            <textarea name="transcript" rows={7} placeholder="Paste encounter transcript..." required />
            <button disabled={loading}>Generate SOAP note</button>
          </form>
        )}

        {active === "priorAuth" && (
          <form className="stack" onSubmit={runPriorAuth}>
            <input name="procedureCode" placeholder="Procedure code (e.g. 99213)" required />
            <input name="insurerId" placeholder="Insurer ID (e.g. BCBS)" required />
            <input name="diagnosisCodes" placeholder="Diagnosis codes CSV (e.g. Z00.00,E11.9)" required />
            <button disabled={loading}>Draft prior auth</button>
          </form>
        )}

        {active === "followUp" && (
          <form className="stack" onSubmit={runFollowUp}>
            <select name="trigger" defaultValue="lab_result">
              <option value="post_visit">post_visit</option>
              <option value="lab_result">lab_result</option>
              <option value="medication_reminder">medication_reminder</option>
              <option value="custom">custom</option>
            </select>
            <input name="customMessage" placeholder="Optional custom message" />
            <button disabled={loading}>Schedule dry-run follow-up</button>
          </form>
        )}

        {active === "decide" && (
          <form className="stack" onSubmit={runDecision}>
            <textarea name="query" rows={4} placeholder="Clinical question..." required />
            <button disabled={loading}>Run decision support</button>
          </form>
        )}

        {active === "deadLetters" && (
          <div className="stack">
            <button onClick={() => run(() => apiRequest("/api/follow-up/dead-letter?limit=50", token))} disabled={loading}>
              Load dead letters
            </button>
            <button onClick={() => run(() => apiRequest("/api/follow-up?status=dead_letter", token))} disabled={loading}>
              Load dead-letter follow-ups
            </button>
            <input
              value={deadLetterId}
              onChange={(e) => setDeadLetterId(e.target.value)}
              placeholder="Dead-letter ID to requeue"
            />
            <button
              onClick={() =>
                run(() =>
                  apiRequest(`/api/follow-up/dead-letter/${encodeURIComponent(deadLetterId)}/requeue`, token, {
                    method: "POST",
                    bodyJson: { doctorId, dryRun: false }
                  })
                )
              }
              disabled={loading || !deadLetterId}
            >
              Requeue dead letter
            </button>
          </div>
        )}

        {active === "replay" && (
          <div className="stack">
            <button onClick={() => run(() => apiRequest("/api/replay", token))} disabled={loading}>
              Load replay log
            </button>
          </div>
        )}
      </main>

      <section className="output">
        <h2>Response</h2>
        <pre>{loading ? "Loading..." : result}</pre>
      </section>
    </div>
  );
}
