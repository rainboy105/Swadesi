import { useNavigate } from "react-router-dom";
import { setToken, type Me } from "../lib/api";
import AppHeader from "../components/AppHeader";

/** The /profile page: the user's details and log out. */
export default function Profile({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const navigate = useNavigate();

  const logout = () => {
    setToken(null);
    onLogout();
  };

  return (
    <>
      <AppHeader
        title="Your profile"
        subtitle={me.activeRole === "cook" ? "Cook mode" : "Consumer mode"}
        showProfile={false}
        onBack={() => navigate("/")}
      />
      <div className="card">
        <span className="tile">👤</span>
        <div className="profile">
          <div className="profile-row">
            <span>Name</span>
            <strong>{me.name || "—"}</strong>
          </div>
          <div className="profile-row">
            <span>Phone</span>
            <strong>{me.phone}</strong>
          </div>
          <div className="profile-row">
            <span>Address</span>
            <strong>{me.addressText || "—"}</strong>
          </div>
          <div className="profile-row">
            <span>Current mode</span>
            <strong>{me.activeRole === "cook" ? "🍳 Cook" : "🍽️ Consumer"}</strong>
          </div>
        </div>
        <button onClick={() => navigate("/")}>Back to home</button>
        <button className="link" onClick={logout}>
          Log out
        </button>
      </div>
    </>
  );
}
