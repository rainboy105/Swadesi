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
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <span className="icon-spacer" />
        )}
        <div className="logo-box">🍲 Swaadesi</div>
        {showProfile ? (
          <button className="icon-btn" aria-label="Profile" onClick={() => navigate("/profile")}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
            </svg>
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
