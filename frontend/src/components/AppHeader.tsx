import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/** The violet hero top bar with the brand and a profile icon (top-right -> /profile). */
export default function AppHeader({
  title,
  subtitle,
  showProfile = true,
  onBack,
  onSwap,
  avatarSrc,
  compactOnScroll = false,
}: {
  title: string;
  subtitle?: string;
  showProfile?: boolean;
  onBack?: () => void;
  onSwap?: () => void;
  avatarSrc?: string;
  /** Collapse into a slim pinned bar as the page scrolls (brand top-left, subtitle under it). */
  compactOnScroll?: boolean;
}) {
  const navigate = useNavigate();

  // Scroll-linked collapse: as the page scrolls through the first COLLAPSE px, the header
  // shrinks to a slim pinned bar. Progress (0..1) is written straight to a CSS variable so the
  // brand slides to the top-left and the greeting fades in step with the finger, no re-render.
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compactOnScroll) return;
    const COLLAPSE = 104; // must match --c on .hero.collapsing
    let frame = 0;
    const apply = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, window.scrollY / COLLAPSE));
      heroRef.current?.style.setProperty("--p", p.toFixed(3));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [compactOnScroll]);

  const actions = (
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
  );

  return (
    <div ref={heroRef} className={compactOnScroll ? "hero collapsing" : "hero"}>
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
        {actions}
      </div>
      {title && <h2>{title}</h2>}
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
