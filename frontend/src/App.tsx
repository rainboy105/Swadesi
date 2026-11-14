import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Settlements from "./pages/Settlements";
import { api, getToken, setToken, type Me } from "./lib/api";
import "./App.css";

type Phase = "loading" | "login" | "onboarding" | "ready";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setPhase("login");
      return;
    }
    api
      .me()
      .then((m) => {
        setMe(m);
        setPhase(m.onboarded ? "ready" : "onboarding");
      })
      .catch(() => {
        setToken(null);
        setPhase("login");
      });
  }, []);

  const logout = () => {
    setToken(null);
    setMe(null);
    setPhase("login");
  };

  let content;
  if (phase === "loading") {
    content = <div className="shell" />;
  } else if (phase === "login") {
    content = (
      <div className="shell">
        <Login
          onLoggedIn={async (login) => {
            if (login.onboarded) {
              try {
                setMe(await api.me());
                setPhase("ready");
              } catch {
                setPhase("login");
              }
            } else {
              setPhase("onboarding");
            }
          }}
        />
      </div>
    );
  } else if (phase === "onboarding") {
    content = (
      <div className="shell">
        <Onboarding
          onDone={(m) => {
            setMe(m);
            setPhase("ready");
          }}
        />
      </div>
    );
  } else {
    content = (
      <Routes>
        <Route path="/" element={<div className="shell"><Home me={me!} onMe={setMe} /></div>} />
        <Route
          path="/profile"
          element={<div className="shell"><Profile me={me!} onMe={setMe} onLogout={logout} /></div>}
        />
        <Route
          path="/admin/settlements"
          element={
            me!.admin ? (
              <div className="shell"><Settlements /></div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <BrowserRouter>{content}</BrowserRouter>;
}
