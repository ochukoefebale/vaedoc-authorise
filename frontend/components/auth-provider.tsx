"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { ShieldCheck, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { apiRequest, setCsrf } from "@/lib/client";
export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "officer" | "viewer";
  workspace: string;
  workspace_id: string;
};
const AuthContext = createContext<{
  user: StaffUser;
  logout: () => Promise<void>;
}>({ user: null as any, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    apiRequest("/auth/me")
      .then((d) => {
        setCsrf(d.csrf_token);
        setUser(d.user);
      })
      .catch((e) => {
        if (!e.message.includes("Sign in")) setError(e.message);
      })
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setCsrf("");
    };
    window.addEventListener("authorise-session-expired", expired);
    return () =>
      window.removeEventListener("authorise-session-expired", expired);
  }, []);
  async function logout() {
    try {
      await apiRequest("/auth/logout", {});
    } finally {
      setUser(null);
      setCsrf("");
    }
  }
  if (loading)
    return (
      <div className="auth-shell">
        <Loader2 className="spin" />
        <p>Opening your staff workspace…</p>
      </div>
    );
  if (user)
    return (
      <AuthContext.Provider value={{ user, logout }}>
        {children}
      </AuthContext.Provider>
    );
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <ShieldCheck size={27} />
          </span>
          <div>
            vaedoc <small>AUTHORISE</small>
          </div>
        </div>
        <div className="eyebrow">YOUR MANAGED CARE WORKSPACE</div>
        <h1>Welcome back.</h1>
        <p>Sign in with your invited staff account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const d = await apiRequest("/auth/login", {
                email: f.get("email"),
                password: f.get("password"),
              });
              setCsrf(d.csrf_token);
              setUser(d.user);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Work email
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {error && (
            <p role="alert" className="auth-error">
              <AlertCircle size={16} />
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            Sign in
          </button>
        </form>
        <div className="auth-foot">
          Accounts are invitation-only. Contact your administrator for access or
          password recovery.
        </div>
        <div className="info-note">
          <p>
            This release uses synthetic records and simulated insurer/EMR
            connections.
          </p>
        </div>
      </div>
    </div>
  );
}
