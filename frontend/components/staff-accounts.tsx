"use client";
import { useState, useEffect } from "react";
import { Users, Copy, Check, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/client";
import { useAuth } from "./auth-provider";
export default function StaffAccounts() {
  const { user } = useAuth();
  const [data, setData] = useState<any>({ users: [], invitations: [] }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [copied, setCopied] = useState(false);
  async function load() {
    try {
      setData(await apiRequest("/staff"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (user.role !== "admin")
    return <div className="panel pad">Administrator access is required.</div>;
  return (
    <div className="sandbox-grid">
      <section className="panel pad">
        <span className="section-icon">
          <Users />
        </span>
        <h2>Your staff team</h2>
        <p>
          Staff share this hospital’s requests. Deactivation revokes existing
          sessions.
        </p>
        {data.users.map((u: any) => (
          <div key={u.id} className="staff-row">
            <div>
              <strong>{u.name}</strong>
              <small>
                {u.email} · {u.role} · {u.active ? "Active" : "Inactive"}
              </small>
            </div>
            {u.role !== "admin" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await apiRequest("/staff/" + u.id, { active: !u.active });
                    await load();
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {u.active ? "Deactivate" : "Reactivate"}
              </button>
            )}
          </div>
        ))}
      </section>
      <div>
        <section className="panel pad">
          <h2>Invite a staff member</h2>
          <p>
            Create a one-time invitation link. Share it directly with the named
            recipient; this app does not send an email.
          </p>
          <form
            className="invite-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setLink("");
              const f = new FormData(e.currentTarget);
              try {
                const d = await apiRequest("/staff/invitations", {
                  email: f.get("email"),
                  role: f.get("role"),
                });
                setLink(d.url);
                setCopied(false);
                await load();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Work email
              <input type="email" name="email" required />
            </label>
            <label>
              Access level
              <select name="role">
                <option value="officer">
                  Managed care officer — review and update requests
                </option>
                <option value="viewer">Viewer — read only</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              <UserPlus size={16} /> Generate invitation
            </button>
          </form>
          {link && (
            <div className="invite-link">
              <label>
                Invitation link — shown once
                <input
                  aria-label="New invitation link"
                  value={link}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setError("Select and copy the invitation link manually.");
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                {copied ? "Copied" : "Copy link"}
              </button>
              <small>
                Valid for 48 hours. Generating another link for the same email
                revokes the earlier link.
              </small>
            </div>
          )}
        </section>
        <section className="panel pad" style={{ marginTop: 20 }}>
          <h2>Invitation history</h2>
          {data.invitations.map((i: any) => (
            <div className="staff-row" key={i.id}>
              <div>
                <strong>{i.email}</strong>
                <small>
                  {i.role} · {i.status}
                </small>
              </div>
              {i.status === "pending" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await apiRequest(
                        "/staff/invitations/" + i.id + "/revoke",
                        {},
                      );
                      await load();
                      setLink("");
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {!data.invitations.length && (
            <p className="helper" style={{ marginTop: 16 }}>
              No invitations created yet.
            </p>
          )}
        </section>
      </div>
      {error && (
        <div role="alert" className="auth-error">
          {error}
        </div>
      )}
    </div>
  );
}
