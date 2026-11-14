import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
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
          onLoggedIn={async (login) => {
            if (login.onboarded) {
              try {
                setMe(await api.me());
                setScreen("home");
              } catch {
                setScreen("login");
              }
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

      {screen === "home" && me && (
        <Home me={me} onMe={setMe} onLogout={logout} />
      )}
    </div>
  );
}
