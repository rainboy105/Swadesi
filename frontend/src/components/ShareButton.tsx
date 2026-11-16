import { useState } from "react";

/**
 * Share a dish deep-link (e.g. to a WhatsApp group). Uses the native share sheet when
 * available (mobile), otherwise opens WhatsApp web with a prefilled message, and falls
 * back to copying the link.
 */
export default function ShareButton({ id, title, price }: {
  id: string;
  title: string;
  price?: number;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/dish/${id}`;
  const text = price
    ? `${title} — ₹${price}/serving on Swaadesi 🍲\nOrder here: ${url}`
    : `${title} on Swaadesi 🍲\nOrder here: ${url}`;

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch {
        return; // user cancelled the native sheet
      }
    }
    // Desktop / no native share: open WhatsApp with the message.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <button className="icon-btn small-icon share-btn" aria-label="Share this dish" onClick={share} title="Share">
      {copied ? (
        <span className="share-copied">Copied</span>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      )}
    </button>
  );
}
