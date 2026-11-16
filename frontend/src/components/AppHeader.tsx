import { useNavigate } from "react-router-dom";

/** The violet hero top bar with the brand and a profile icon (top-right -> /profile). */
export default function AppHeader({
  title,
  subtitle,
  showProfile = true,
  onBack,
  onSwap,
  avatarSrc,
}: {
  title: string;
  subtitle?: string;
  showProfile?: boolean;
  onBack?: () => void;
  onSwap?: () => void;
  avatarSrc?: string;
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
        <div className="hero-actions">
          {onSwap && (
            <button className="icon-btn" aria-label="Switch mode" onClick={onSwap}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4v13M7 4L4 7M7 4l3 3" />
                <path d="M17 20V7M17 20l3-3M17 20l-3-3" />
              </svg>
            </button>
          )}
          {showProfile ? (
            <button className="icon-btn avatar-btn" aria-label="Profile" onClick={() => navigate("/profile")}>
              {avatarSrc ? (
                <img className="avatar-mini" src={avatarSrc} alt="Profile" />
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
                </svg>
              )}
            </button>
          ) : (
            !onSwap && <span className="icon-spacer" />
          )}
        </div>
      </div>
      {title && <h2>{title}</h2>}
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
