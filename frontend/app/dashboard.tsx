"use client";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Inbox,
  Plug,
  Activity,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  X,
  ShieldCheck,
  Download,
  RefreshCw,
  Send,
  FlaskConical,
  AlertCircle,
  Menu,
  Building2,
  Code2,
  Mail,
  Copy,
  Loader2,
  Stethoscope,
  Users,
  LogOut,
} from "lucide-react";
import { callbackPayload } from "@/lib/workflow.mjs";
import { apiRequest } from "@/lib/client";
import { useAuth } from "@/components/auth-provider";
import StaffAccounts from "@/components/staff-accounts";
const labels: Record<string, string> = {
  draft: "Draft ready",
  pending: "Awaiting insurer",
  query: "Needs information",
  review: "Review decision",
  resolved: "Resolved",
  cancelled: "Cancelled",
};
const initial = {
  synthetic: true,
  patient: "Ada Demo (synthetic)",
  insurer: "Acacia Health",
  member: "DEMO-20001",
  encounter: "DEMO-ENC-20001",
  historyText:
    "Synthetic patient reports persistent shoulder pain for two weeks after lifting at work.",
  examination: "Documented shoulder tenderness and reduced range of movement.",
  diagnosis: "Shoulder strain (working diagnosis)",
  source: "EMR sandbox",
  items: [
    {
      name: "Shoulder X-ray",
      quantity: 1,
      indication: "Persistent symptoms with documented clinician request.",
    },
    {
      name: "Physiotherapy sessions",
      quantity: 4,
      indication:
        "Clinician-requested rehabilitation for functional limitation.",
    },
  ],
};
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
const ago = (s: string) => {
  const n = Math.max(
    0,
    Math.floor((Date.now() - new Date(s).getTime()) / 60000),
  );
  return n < 60
    ? `${n}m ago`
    : n < 1440
      ? `${Math.floor(n / 60)}h ago`
      : `${Math.floor(n / 1440)}d ago`;
};
function download(name: string, body: string, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("Overview"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [insurer, setInsurer] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState("Request"),
    [modal, setModal] = useState(""),
    [draft, setDraft] = useState(""),
    [checked, setChecked] = useState(false),
    [decisions, setDecisions] = useState<any[]>([]),
    [payload, setPayload] = useState(JSON.stringify(initial, null, 2)),
    [mobile, setMobile] = useState(false);
  const active = rows.find((r) => r.id === selected);
  async function api(body?: any) {
    return apiRequest("/requests", body);
  }
  async function load() {
    try {
      setError("");
      const d = await api();
      setRows(d.requests);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal("");
        setSelected(null);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  useEffect(() => {
    if (!selected && !modal) return;
    const prior = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled),[role="dialog"] input,[role="dialog"] textarea,[role="dialog"] select',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = old;
      document.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, [selected, modal]);
  function open(r: any) {
    setSelected(r.id);
    setDraft(r.draft);
    setChecked(false);
    setDecisions(structuredClone(r.reply?.decisions || []));
    setTab("Request");
    setError("");
  }
  async function run(body: any, message: string) {
    setBusy(true);
    setError("");
    try {
      const d = await api(body);
      await load();
      if (d.request) {
        setSelected(d.request.id);
        setDraft(d.request.draft);
        setDecisions(structuredClone(d.request.reply?.decisions || []));
      }
      setChecked(false);
      setNotice(message);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, extra: any = {}) {
    if (!active) return;
    return run(
      {
        kind: "action",
        id: active.id,
        version: active.version,
        action,
        ...extra,
      },
      action === "submit"
        ? "Request submitted to the simulated insurer."
        : action === "verify"
          ? "Decision verified. EMR callback ready."
          : "Workspace updated.",
    );
  }
  const counts = {
    draft: rows.filter((r) => r.stage === "draft").length,
    pending: rows.filter((r) => r.stage === "pending").length,
    review: rows.filter((r) => ["review", "query"].includes(r.stage)).length,
    resolved: rows.filter((r) => r.stage === "resolved").length,
  };
  const filtered = rows.filter(
    (r) =>
      (filter === "all" ||
        r.stage === filter ||
        (filter === "attention" && ["review", "query"].includes(r.stage))) &&
      (insurer === "all" || r.insurer === insurer) &&
      `${r.patient} ${r.reference} ${r.member} ${r.encounter}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activities = useMemo(
    () =>
      rows
        .flatMap((r) =>
          r.history.map((h: any) => ({
            ...h,
            request: r.reference,
            patient: r.patient,
            rid: r.id,
          })),
        )
        .sort((a, b) => b.at.localeCompare(a.at)),
    [rows],
  );
  function nav(name: string) {
    setPage(name);
    setFilter("all");
    setMobile(false);
  }
  function exportCsv() {
    const quote = (s: any) => `"${String(s ?? "").replaceAll('"', '""')}"`;
    download(
      "vaedoc-authorise-requests.csv",
      [
        [
          "Reference",
          "Synthetic patient",
          "Insurer",
          "Status",
          "Services",
          "EMR status",
        ],
        ...filtered.map((r) => [
          r.reference,
          r.patient,
          r.insurer,
          labels[r.stage],
          r.items.length,
          r.callback?.status || "Not queued",
        ]),
      ]
        .map((r) => r.map(quote).join(","))
        .join("\n"),
      "text/csv",
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            nav("Overview");
          }}
        >
          <span className="brand-mark">
            <ShieldCheck size={25} />
          </span>
          <span>
            vaedoc<span className="brand-sub">AUTHORISE</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={18} />
          </span>
          <div>
            <strong>{user.workspace}</strong>
            <small>Staff workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [Inbox, "Requests"],
            [Plug, "EMR sandbox"],
            [Activity, "Activity"],
            [Settings, "Configuration"],
            ...(user.role === "admin" ? [[Users, "Staff accounts"]] : []),
          ].map(([Icon, name]: any) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => nav(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Requests" && <b>{rows.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-note">
            <FlaskConical size={20} />
            <strong>Your pilot workspace</strong>
            <p>Explore the complete approval journey with synthetic records.</p>
            <span>
              Simulation mode <i />
            </span>
          </div>
          <div className="profile">
            <div className="avatar">MC</div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role} · invited account</small>
            </div>
            <button
              className="logout-button"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="simulation">
              <i /> DEMO ENVIRONMENT
            </span>
            <span className="top-divider" />
            <span className="today">
              {new Date().toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Africa/Lagos",
              })}
            </span>
            <div className="avatar small">MC</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MANAGED CARE, MADE CLEARER</div>
              <h1>
                {page === "Overview"
                  ? "A clearer path to care."
                  : page === "Requests"
                    ? "Every request. One workspace."
                    : page === "EMR sandbox"
                      ? "Connect the care journey."
                      : page === "Activity"
                        ? "A record of every step."
                        : page === "Staff accounts"
                          ? "Your team. The right access."
                          : "Built around your workflow."}
              </h1>
              <p>
                {page === "Overview"
                  ? "Keep approvals moving, from consultation to confirmed care."
                  : page === "Requests"
                    ? "Prepare, track and verify hospital authorisation requests."
                    : page === "EMR sandbox"
                      ? "Test encounter intake and inspect verified decision callbacks."
                      : page === "Activity"
                        ? "Trace submissions, reviews and delivery events across your workspace."
                        : page === "Staff accounts"
                          ? "Invite staff and manage access to your hospital workspace."
                          : "Review the boundaries and capabilities of this demonstration."}
              </p>
            </div>
            <button
              className="primary"
              disabled={user.role === "viewer"}
              onClick={() => {
                setModal("new");
                setPayload(
                  JSON.stringify(
                    {
                      ...initial,
                      source: "Manual intake",
                      encounter: `DEMO-ENC-${Date.now().toString().slice(-6)}`,
                    },
                    null,
                    2,
                  ),
                );
              }}
            >
              <Plus size={17} /> New request
            </button>
          </div>
          {(page === "Overview" || page === "Requests") && (
            <>
              <section className="metrics">
                {[
                  [
                    FileText,
                    "Ready to submit",
                    counts.draft,
                    "Awaiting staff review",
                    "draft",
                  ],
                  [
                    Clock,
                    "Awaiting insurer",
                    counts.pending,
                    "Submitted · response pending",
                    "pending",
                  ],
                  [
                    ShieldCheck,
                    "Needs attention",
                    counts.review,
                    "Decisions and insurer queries",
                    "attention",
                  ],
                  [
                    CheckCheck,
                    "Resolved",
                    counts.resolved,
                    "Verified service decisions",
                    "resolved",
                  ],
                ].map(([Icon, label, n, sub, stage]: any) => (
                  <button
                    className={`metric metric-${stage}`}
                    key={label}
                    onClick={() => {
                      setFilter(stage);
                      setPage("Requests");
                    }}
                  >
                    <div className="metric-top">
                      <span>{label}</span>
                      <Icon size={19} />
                    </div>
                    <div className="metric-num">
                      {String(n).padStart(2, "0")}
                      <ArrowUpRight size={17} />
                    </div>
                    <small>{sub}</small>
                  </button>
                ))}
              </section>
              {page === "Overview" && (
                <div className="workflow-banner">
                  <div className="banner-icon">
                    <ArrowRight size={21} />
                  </div>
                  <div>
                    <strong>Less chasing. More clarity.</strong>
                    <p>
                      Draft → review → submit → verify → notify. Every service
                      stays traceable.
                    </p>
                  </div>
                  <button onClick={() => nav("EMR sandbox")}>
                    Try the full journey <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
              <section className="panel queue">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Authorisation requests{" "}
                      <span className="count">{rows.length}</span>
                    </h2>
                    <p>
                      Your hospital’s requests, with the next step always in
                      view.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={exportCsv}
                    disabled={!rows.length}
                  >
                    <Download size={15} /> Export
                  </button>
                </div>
                <div className="queue-controls">
                  <div className="filter-tabs">
                    {[
                      ["all", "All requests"],
                      ["draft", "Drafts"],
                      ["pending", "Pending"],
                      ["review", "To review"],
                      ["query", "Queries"],
                      ["resolved", "Resolved"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={filter === key ? "selected" : ""}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                        {key === "review" && counts.review > 0 && (
                          <span className="tab-dot" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="search-row">
                    <label className="searchbox">
                      <Search size={16} />
                      <input
                        aria-label="Search requests"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search patient or request ID…"
                      />
                    </label>
                    <select
                      aria-label="Filter insurer"
                      value={insurer}
                      onChange={(e) => setInsurer(e.target.value)}
                    >
                      <option value="all">All insurers</option>
                      {Array.from(new Set(rows.map((r) => r.insurer))).map(
                        (i) => (
                          <option key={i}>{i}</option>
                        ),
                      )}
                    </select>
                    <button
                      className="icon-button"
                      aria-label="Refresh requests"
                      onClick={load}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient / request</th>
                        <th>Insurer</th>
                        <th>Requested services</th>
                        <th>Status</th>
                        <th>Received</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} onClick={() => open(r)}>
                          <td>
                            <div className="patient-cell">
                              <div
                                className={`patient-avatar color-${r.insurer.length % 3}`}
                              >
                                {r.patient
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((x: string) => x[0])
                                  .join("")}
                              </div>
                              <div>
                                <button
                                  className="patient-name"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    open(r);
                                  }}
                                >
                                  {r.patient.replace(" (demo)", "")}
                                </button>
                                <small>{r.reference}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong className="insurer-name">
                              {r.insurer}
                            </strong>
                            <small>{r.member}</small>
                          </td>
                          <td>
                            <span>{r.items[0].name}</span>
                            <small>
                              {r.items.length > 1
                                ? `+ ${r.items.length - 1} more service${r.items.length > 2 ? "s" : ""}`
                                : `Quantity ${r.items[0].quantity}`}
                            </small>
                          </td>
                          <td>
                            <span className={`status ${r.stage}`}>
                              <i />
                              {labels[r.stage]}
                            </span>
                          </td>
                          <td>
                            <span>{ago(r.createdAt)}</span>
                            <small>{time(r.createdAt)} WAT</small>
                          </td>
                          <td>
                            <ChevronRight size={17} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {loading && (
                  <div className="empty">
                    <Loader2 className="spin" /> Loading your workspace…
                  </div>
                )}
                {!loading && !rows.length && (
                  <div className="empty">
                    <Inbox size={32} />
                    <h3>Your workspace is ready.</h3>
                    <p>
                      Load synthetic cases to explore every stage of an
                      approval.
                    </p>
                    <button
                      className="primary"
                      disabled={busy || user.role === "viewer"}
                      onClick={() =>
                        run(
                          { kind: "seed" },
                          "Seven synthetic cases added. Open any request to begin.",
                        )
                      }
                    >
                      Load demonstration cases <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {!loading && rows.length > 0 && !filtered.length && (
                  <div className="empty">
                    <Search size={28} />
                    <h3>No matching requests</h3>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                        setInsurer("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    Showing {filtered.length} of {rows.length} requests
                  </span>
                  <span>
                    <ShieldCheck size={13} /> Synthetic records only · staff
                    verification required
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "EMR sandbox" && (
            <div className="sandbox-grid">
              <section className="panel pad">
                <span className="section-icon">
                  <Code2 />
                </span>
                <h2>Encounter intake</h2>
                <p>
                  Submit a synthetic consultation with stable encounter and
                  service identifiers. Repeating the same encounter returns the
                  existing request.
                </p>
                <div className="endpoint">
                  POST /api/requests <span>Sandbox</span>
                </div>
                <textarea
                  className="code-editor"
                  aria-label="Synthetic encounter JSON"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={busy || user.role === "viewer"}
                  onClick={async () => {
                    try {
                      const p = JSON.parse(payload);
                      if (
                        await run(
                          {
                            kind: "intake",
                            encounter: { ...p, source: "EMR sandbox" },
                          },
                          "Synthetic EMR encounter received.",
                        )
                      )
                        setPage("Requests");
                    } catch {
                      setError("Enter valid JSON.");
                    }
                  }}
                >
                  <Send size={16} /> Send synthetic encounter
                </button>
              </section>
              <div>
                <section className="panel pad">
                  <span className="section-icon">
                    <Plug />
                  </span>
                  <h2>Decision callback</h2>
                  <p>
                    Verified decisions generate a versioned payload. Open a
                    resolved request to simulate acknowledgement or a failed
                    delivery and retry.
                  </p>
                  <pre>
                    {JSON.stringify(
                      {
                        event_type: "authorisation.decision_verified",
                        review_status: "verified",
                        decision_version: 1,
                        simulation: true,
                        items: [
                          {
                            outcome: "approved",
                            authorisation_code: "DEMO-PA-1234",
                          },
                        ],
                      },
                      null,
                      2,
                    )}
                  </pre>
                </section>
                <div className="info-note">
                  <FlaskConical size={20} />
                  <p>
                    This sandbox uses server-side persistence and simulated
                    delivery. External EMR calls, signatures and live email are
                    not enabled.
                  </p>
                </div>
              </div>
            </div>
          )}
          {page === "Staff accounts" && <StaffAccounts />}
          {page === "Activity" && (
            <section className="panel pad">
              <h2>Workspace activity</h2>
              <p>Request history is saved with each record.</p>
              <div className="activity-list">
                {activities.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => open(rows.find((r) => r.id === a.rid))}
                  >
                    <span className="activity-dot">
                      <Check size={13} />
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                      <small>
                        {a.request} · {a.patient}
                      </small>
                    </div>
                    <time>{time(a.at)} WAT</time>
                  </button>
                ))}
                {!activities.length && (
                  <div className="empty">
                    Load demonstration cases or create your first request.
                  </div>
                )}
              </div>
            </section>
          )}
          {page === "Configuration" && (
            <div className="sandbox-grid">
              <section className="panel pad">
                <h2>Demonstration boundaries</h2>
                <p>
                  This release validates the managed care workflow before
                  connecting a pilot hospital.
                </p>
                {[
                  ["Workspace access", "Invitation-only staff accounts"],
                  [
                    "Record storage",
                    "MySQL / PostgreSQL · hospital workspace isolation",
                  ],
                  ["Drafting", "Source-based templates · no live AI"],
                  ["Insurer email", "Simulated inbox and outbox"],
                  [
                    "Decision extraction",
                    "Controlled reply scenarios · staff verification",
                  ],
                  ["EMR delivery", "Simulated acknowledgement and retry"],
                  [
                    "Patient information",
                    "Synthetic demonstration records only",
                  ],
                ].map(([k, v]) => (
                  <div className="config-row" key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      "vaedoc-authorise-demo-export.json",
                      JSON.stringify(rows, null, 2),
                    )
                  }
                >
                  <Download size={15} /> Download workspace data
                </button>
              </section>
              <section className="panel pad">
                <h2>Pilot connection checklist</h2>
                <p>
                  Next implementation requirements for a hospital-connected
                  pilot.
                </p>
                {[
                  "Approved hospital identity and managed care mailbox",
                  "Insurer contacts, templates and service requirements",
                  "EMR API documentation and sandbox access",
                  "MFA and a production security review",
                  "Live AI provider and evaluation examples",
                  "Signed external webhooks and durable delivery workers",
                  "Privacy arrangements and security review",
                ].map((v, n) => (
                  <div className="checklist" key={v}>
                    <span>{n + 1}</span>
                    <p>{v}</p>
                  </div>
                ))}
              </section>
            </div>
          )}
          <footer className="main-footer">
            <span>VAEDOC AUTHORISE</span>
            <span>Every request accounted for.</span>
            <span>Hosted demonstration v0.2</span>
          </footer>
        </main>
      </div>
      {error && (
        <div role="alert" className="toast error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {active && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Request ${active.reference}`}
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow">
                  {active.reference} · {active.encounter}
                </div>
                <h2>{active.patient}</h2>
                <p>
                  {active.insurer} · {active.member}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close request"
                onClick={() => setSelected(null)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="drawer-summary">
              <span className={`status ${active.stage}`}>
                <i />
                {labels[active.stage]}
              </span>
              <span>{active.items.length} services</span>
              <span>{active.source}</span>
            </div>
            <div className="detail-tabs">
              {["Request", "Clinical record", "Timeline", "EMR delivery"].map(
                (t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    onClick={() => {
                      setTab(t);
                      setChecked(false);
                    }}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
            <div className="drawer-body">
              {tab === "Clinical record" && (
                <>
                  {[
                    ["Clinical history", active.historyText],
                    ["Examination findings", active.examination],
                    ["Working diagnosis", active.diagnosis],
                  ].map(([k, v]) => (
                    <section className="detail-card" key={k}>
                      <h3>{k}</h3>
                      <p>{v}</p>
                    </section>
                  ))}
                  <h3>Clinician-requested services</h3>
                  {active.items.map((i: any) => (
                    <section className="detail-card" key={i.id}>
                      <strong>
                        {i.name} <span className="muted">× {i.quantity}</span>
                      </strong>
                      <p>{i.indication}</p>
                    </section>
                  ))}
                </>
              )}
              {tab === "Timeline" && (
                <div className="activity-list">
                  {active.history.map((h: any) => (
                    <div className="timeline-item" key={h.id}>
                      <span className="activity-dot">
                        <Check size={13} />
                      </span>
                      <div>
                        <strong>{h.title}</strong>
                        <p>{h.detail}</p>
                        <small>
                          {new Date(h.at).toLocaleString("en-NG", {
                            timeZone: "Africa/Lagos",
                          })}{" "}
                          WAT
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab === "EMR delivery" && (
                <>
                  {active.callback ? (
                    <>
                      <div className="detail-card">
                        <h3>Verified decision callback</h3>
                        <p>
                          Status: <strong>{active.callback.status}</strong> ·
                          Attempts: {active.callback.attempts} · Decision v
                          {active.decisionVersion}
                        </p>
                      </div>
                      <pre>
                        {JSON.stringify(callbackPayload(active), null, 2)}
                      </pre>
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() =>
                            download(
                              `${active.reference}-callback.json`,
                              JSON.stringify(callbackPayload(active), null, 2),
                            )
                          }
                        >
                          <Download size={15} /> Download payload
                        </button>
                        {active.callback.status !== "acknowledged" &&
                          user.role !== "viewer" && (
                            <>
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => act("deliver")}
                              >
                                <CheckCheck size={16} /> Simulate EMR
                                acknowledgement
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => act("deliver", { fail: true })}
                              >
                                Simulate failure
                              </button>
                            </>
                          )}
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <Plug size={30} />
                      <h3>No verified decision yet</h3>
                      <p>
                        A callback becomes available after staff verify an
                        insurer decision.
                      </p>
                    </div>
                  )}
                </>
              )}
              {tab === "Request" && (
                <>
                  {user.role === "viewer" && (
                    <div className="info-note">
                      <ShieldCheck size={18} />
                      <p>
                        Read-only access. Request updates require a managed care
                        officer.
                      </p>
                    </div>
                  )}
                  {active.stage === "cancelled" ? (
                    <div className="info-note">
                      <AlertCircle />
                      <p>
                        This demonstration request has been cancelled. Its
                        history remains available.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="service-list">
                        {active.items.map((i: any) => (
                          <div key={i.id}>
                            <FileText size={16} />
                            <span>
                              {i.name}
                              <small>Requested quantity: {i.quantity}</small>
                            </span>
                            <span className={`item-outcome ${i.outcome}`}>
                              {i.outcome.replaceAll("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                      {user.role !== "viewer" &&
                        ["draft", "query"].includes(active.stage) && (
                          <>
                            {active.reply && (
                              <section className="reply-card">
                                <span className="eyebrow">
                                  SIMULATED INSURER QUERY
                                </span>
                                <p>{active.reply.body}</p>
                              </section>
                            )}
                            <div className="detail-title">
                              <h3>
                                {active.stage === "query"
                                  ? "Follow-up request"
                                  : "Request draft"}
                              </h3>
                              <span className="mini-badge">
                                Template-assisted
                              </span>
                            </div>
                            <p className="helper">
                              Review against the clinical record. Add documented
                              information only.
                            </p>
                            <textarea
                              className="draft-editor"
                              aria-label="Authorisation email draft"
                              value={draft}
                              onChange={(e) => {
                                setDraft(e.target.value);
                                setChecked(false);
                              }}
                            />
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => setChecked(e.target.checked)}
                              />
                              I reviewed the patient details, services and exact
                              request text.
                            </label>
                            <div className="button-row">
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => act("saveDraft", { draft })}
                              >
                                Save draft
                              </button>
                              <button
                                className="primary"
                                disabled={busy || !checked}
                                onClick={() =>
                                  act("submit", { draft, reviewed: checked })
                                }
                              >
                                <Send size={16} /> Approve & simulate submission
                              </button>
                            </div>
                          </>
                        )}
                      {active.stage === "pending" && user.role !== "viewer" && (
                        <>
                          <div className="info-note">
                            <Clock />
                            <p>
                              The request is in the simulated insurer inbox.
                              Choose a reply to explore the next step.
                            </p>
                          </div>
                          <h3>Simulate insurer response</h3>
                          <div className="scenario-grid">
                            {[
                              [
                                "approved",
                                "Approve all",
                                "All services authorised.",
                              ],
                              [
                                "partial",
                                "Mixed decision",
                                "First service approved; others denied.",
                              ],
                              [
                                "query",
                                "Request information",
                                "Keep all services awaiting a decision.",
                              ],
                              [
                                "denied",
                                "Decline all",
                                "No services authorised.",
                              ],
                            ].map(([scenario, title, sub]) => (
                              <button
                                disabled={busy}
                                key={scenario}
                                onClick={() => act("reply", { scenario })}
                              >
                                <strong>
                                  {title}
                                  <ArrowUpRight size={15} />
                                </strong>
                                <small>{sub}</small>
                              </button>
                            ))}
                          </div>
                          <details>
                            <summary>View submitted request</summary>
                            <pre className="email-view">
                              {active.submittedDraft}
                            </pre>
                          </details>
                        </>
                      )}
                      {active.stage === "review" && user.role !== "viewer" && (
                        <>
                          <section className="reply-card">
                            <span className="eyebrow">
                              ORIGINAL SIMULATED INSURER REPLY
                            </span>
                            <p className="preserve">{active.reply.body}</p>
                          </section>
                          <h3>Verify each service</h3>
                          <p className="helper">
                            Check the proposed interpretation against the reply.
                            Nothing is published until you verify.
                          </p>
                          {decisions.map((d: any, n: number) => (
                            <section className="decision-card" key={d.itemId}>
                              <strong>
                                {
                                  active.items.find(
                                    (i: any) => i.id === d.itemId,
                                  )?.name
                                }
                              </strong>
                              <div className="decision-fields">
                                <label>
                                  Outcome
                                  <select
                                    value={d.outcome}
                                    onChange={(e) => {
                                      const outcome = e.target.value;
                                      setDecisions((ds) =>
                                        ds.map((x, j) =>
                                          j === n
                                            ? {
                                                ...x,
                                                outcome,
                                                approvedQuantity:
                                                  outcome === "approved"
                                                    ? active.items[n].quantity
                                                    : 0,
                                                code: [
                                                  "denied",
                                                  "more_information_required",
                                                ].includes(outcome)
                                                  ? ""
                                                  : x.code,
                                              }
                                            : x,
                                        ),
                                      );
                                      setChecked(false);
                                    }}
                                  >
                                    <option value="approved">Approved</option>
                                    <option value="partially_approved">
                                      Partially approved
                                    </option>
                                    <option value="denied">Denied</option>
                                    <option value="more_information_required">
                                      More information required
                                    </option>
                                  </select>
                                </label>
                                <label>
                                  Approved quantity
                                  <input
                                    type="number"
                                    min="0"
                                    max={active.items[n].quantity}
                                    value={d.approvedQuantity ?? ""}
                                    onChange={(e) => {
                                      setDecisions((ds) =>
                                        ds.map((x, j) =>
                                          j === n
                                            ? {
                                                ...x,
                                                approvedQuantity: Number(
                                                  e.target.value,
                                                ),
                                              }
                                            : x,
                                        ),
                                      );
                                      setChecked(false);
                                    }}
                                  />
                                </label>
                                <label>
                                  Authorisation code
                                  <input
                                    value={d.code}
                                    onChange={(e) => {
                                      setDecisions((ds) =>
                                        ds.map((x, j) =>
                                          j === n
                                            ? { ...x, code: e.target.value }
                                            : x,
                                        ),
                                      );
                                      setChecked(false);
                                    }}
                                  />
                                </label>
                                <label>
                                  Conditions / reason
                                  <input
                                    value={d.conditions}
                                    onChange={(e) => {
                                      setDecisions((ds) =>
                                        ds.map((x, j) =>
                                          j === n
                                            ? {
                                                ...x,
                                                conditions: e.target.value,
                                              }
                                            : x,
                                        ),
                                      );
                                      setChecked(false);
                                    }}
                                  />
                                </label>
                              </div>
                            </section>
                          ))}
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setChecked(e.target.checked)}
                            />
                            I checked every item, code, quantity and condition
                            against the reply.
                          </label>
                          <button
                            className="primary"
                            disabled={busy || !checked}
                            onClick={() =>
                              act("verify", { reviewed: checked, decisions })
                            }
                          >
                            <ShieldCheck size={16} /> Verify decision & prepare
                            EMR update
                          </button>
                        </>
                      )}
                      {active.stage === "resolved" && (
                        <>
                          <div className="info-note success">
                            <ShieldCheck />
                            <p>
                              Decision verified. Each service retains its own
                              outcome and authorisation details.
                            </p>
                          </div>
                          {active.items.map((i: any) => (
                            <section className="detail-card" key={i.id}>
                              <strong>{i.name}</strong>
                              <p>
                                {i.outcome.replaceAll("_", " ")} · quantity{" "}
                                {i.approvedQuantity}/{i.quantity}
                              </p>
                              {i.code && <code>{i.code}</code>}
                              {i.conditions && <p>{i.conditions}</p>}
                            </section>
                          ))}
                          <button
                            className="primary"
                            onClick={() => setTab("EMR delivery")}
                          >
                            View EMR delivery <ArrowRight size={16} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="drawer-footer">
              <span>
                <FlaskConical size={14} /> Synthetic demonstration · v
                {active.version}
              </span>
              {user.role !== "viewer" &&
                !["resolved", "cancelled"].includes(active.stage) && (
                  <button
                    className="text-danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Cancel this demonstration request? Its history will be preserved.",
                        )
                      )
                        act("cancel");
                    }}
                  >
                    Cancel request
                  </button>
                )}
            </div>
          </section>
        </div>
      )}
      {modal === "new" && !active && (
        <div className="overlay center">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create synthetic request"
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow">MANUAL INTAKE</div>
                <h2>New authorisation request</h2>
                <p>Create a synthetic encounter and its requested services.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Close new request"
                onClick={() => setModal("")}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const services = String(f.get("services"))
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean);
                const p = {
                  synthetic: f.get("synthetic") === "on",
                  patient: String(f.get("patient")),
                  member: String(f.get("member")),
                  insurer: String(f.get("insurer")),
                  encounter: String(f.get("encounter")),
                  historyText: String(f.get("historyText")),
                  examination: String(f.get("examination")),
                  diagnosis: String(f.get("diagnosis")),
                  source: "Manual intake",
                  items: services.map((name) => ({
                    name,
                    quantity: 1,
                    indication: String(f.get("indication")),
                  })),
                };
                if (
                  await run(
                    { kind: "intake", encounter: p },
                    "Synthetic request created. Review its draft to continue.",
                  )
                )
                  setModal("");
              }}
            >
              <div className="form-grid">
                <label>
                  Synthetic patient name
                  <input
                    name="patient"
                    required
                    defaultValue="Ada Demo (synthetic)"
                  />
                </label>
                <label>
                  Membership number
                  <input name="member" required defaultValue="DEMO-20001" />
                </label>
                <label>
                  Insurer
                  <select name="insurer">
                    <option>Acacia Health</option>
                    <option>Cedar Assurance</option>
                    <option>Northstar HMO</option>
                  </select>
                </label>
                <label>
                  Encounter ID
                  <input
                    name="encounter"
                    required
                    defaultValue={`DEMO-ENC-${Date.now().toString().slice(-6)}`}
                  />
                </label>
                <label className="wide">
                  Relevant clinical history
                  <textarea
                    name="historyText"
                    required
                    defaultValue={initial.historyText}
                  />
                </label>
                <label>
                  Examination findings
                  <textarea
                    name="examination"
                    required
                    defaultValue={initial.examination}
                  />
                </label>
                <label>
                  Working diagnosis
                  <textarea
                    name="diagnosis"
                    required
                    defaultValue={initial.diagnosis}
                  />
                </label>
                <label className="wide">
                  Requested services — one per line
                  <textarea
                    name="services"
                    required
                    defaultValue={"Shoulder X-ray\nPhysiotherapy assessment"}
                  />
                </label>
                <label className="wide">
                  Documented indication for these services
                  <textarea
                    name="indication"
                    required
                    defaultValue="Persistent symptoms and functional limitation; services requested by the clinician."
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input type="checkbox" name="synthetic" required />
                This contains synthetic demonstration data only.
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal("")}
                >
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  <Plus size={16} /> Create request & prepare draft
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
