import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import { api, getToken, setToken, type Me } from "./lib/api";
import "./App.css";

type Screen = "loading" | "login" | "onboarding" | "home";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setScreen("login");
      return;
    }
    api
      .me()
      .then((m) => {
        setMe(m);
        setScreen(m.onboarded ? "home" : "onboarding");
      })
      .catch(() => {
        setToken(null);
        setScreen("login");
      });
  }, []);

  const logout = () => {
    setToken(null);
    setMe(null);
    setScreen("login");
  };

  if (screen === "loading") return <div className="shell" />;

  return (
    <div className="shell">
      {screen === "login" && (
        <Login
          onLoggedIn={(login) => {
            if (login.onboarded) {
              api.me().then(setMe).catch(() => undefined);
              setScreen("home");
            } else {
              setScreen("onboarding");
            }
          }}
        />
      )}

      {screen === "onboarding" && (
        <Onboarding
          onDone={(m) => {
            setMe(m);
            setScreen("home");
          }}
        />
      )}

      {screen === "home" && (
        <>
          <div className="hero">
            <div className="logo-box">🍲 Swadesi</div>
            <h2>Namaste{me?.name ? `, ${me.name.split(" ")[0]}` : ""} 👋</h2>
            <p>{me?.addressText}</p>
          </div>
          <div className="card">
            <span className="tile marigold">🥘</span>
            <h1>Food near you</h1>
            <p className="hint">
              Listings from home cooks in your neighbourhood are coming next — this is the end
              of the login flow for now.
            </p>
            <button className="link" onClick={logout}>
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
