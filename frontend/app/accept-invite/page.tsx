"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, CheckCheck } from "lucide-react";
import { apiRequest } from "@/lib/client";
export default function AcceptInvite() {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    );
    window.history.replaceState(null, "", "/accept-invite");
    setReady(true);
  }, []);
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <ShieldCheck />
          </span>
          <div>
            vaedoc <small>AUTHORISE</small>
          </div>
        </div>
        <h1>{done ? "You’re ready." : "Join your care team."}</h1>
        <p>
          {done
            ? "Your staff account has been created. Sign in to continue."
            : "Use the email address your administrator invited."}
        </p>
        {done ? (
          <>
            <CheckCheck size={35} />
            <a href="/" className="primary">
              Continue to sign in
            </a>
          </>
        ) : !ready ? (
          <p>Reading invitation…</p>
        ) : !token ? (
          <div className="auth-error">
            This invitation link is incomplete. Ask your administrator for a new
            link.
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              if (f.get("password") !== f.get("confirm")) {
                setError("Passwords do not match.");
                return;
              }
              setBusy(true);
              try {
                await apiRequest("/auth/accept-invite", {
                  token,
                  email: f.get("email"),
                  name: f.get("name"),
                  password: f.get("password"),
                });
                setDone(true);
                setToken("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={150}
                autoComplete="name"
              />
            </label>
            <label>
              Invited work email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Create password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <small>At least 12 characters.</small>
            </label>
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Create invited account
            </button>
          </form>
        )}
        <div className="auth-foot">
          Invitation links expire after 48 hours and can be used once.
        </div>
      </div>
    </div>
  );
}
