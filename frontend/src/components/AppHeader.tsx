import { useNavigate } from "react-router-dom";

/** The violet hero top bar with the brand and a profile icon (top-right -> /profile). */
export default function AppHeader({
  title,
  subtitle,
  showProfile = true,
  onBack,
}: {
  title: string;
  subtitle?: string;
  showProfile?: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="hero">
      <div className="hero-bar">
        {onBack ? (
          <button className="icon-btn" aria-label="Back" onClick={onBack}>
            ←
          </button>
        ) : (
          <span className="icon-spacer" />
        )}
        <div className="logo-box">🍲 Swaadeshi</div>
        {showProfile ? (
          <button className="icon-btn" aria-label="Profile" onClick={() => navigate("/profile")}>
            👤
          </button>
        ) : (
          <span className="icon-spacer" />
        )}
      </div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
