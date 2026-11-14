import { useState } from "react";
import { api, setToken, normalizePhone, type LoginResponse } from "../lib/api";

type Step = "phone" | "code";

export default function Login({ onLoggedIn }: { onLoggedIn: (login: LoginResponse) => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestOtp(normalized);
      setPhone(normalized);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 4) {
      setError("Please enter the code from WhatsApp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const login = await api.verifyOtp(phone, code.trim());
      setToken(login.token);
      onLoggedIn(login);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <div className="logo-box">🍲 Swaadesi</div>
        <h2>{step === "phone" ? "Sign in" : "Enter your code"}</h2>
        <p>
          {step === "phone"
            ? "Home-cooked food from your own neighbourhood"
            : "Check WhatsApp for your login code"}
        </p>
      </div>
      <div className="card">
        {step === "phone" && (
        <>
          <label htmlFor="phone">WhatsApp number <span className="req">*</span></label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="98765 43210"
            value={phone}
            autoFocus
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCode()}
          />
          <button disabled={busy} onClick={sendCode}>
            {busy ? "Sending…" : "Send code on WhatsApp"}
          </button>
        </>
      )}

        {step === "code" && (
        <>
          <p className="hint">
            We sent a code on WhatsApp to <strong>{phone}</strong>.{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              Change number
            </a>
          </p>
          <label htmlFor="code">Code <span className="req">*</span></label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <button disabled={busy} onClick={verify}>
            {busy ? "Checking…" : "Log in"}
          </button>
          <button className="link" disabled={busy} onClick={sendCode}>
            Resend code
          </button>
        </>
      )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
