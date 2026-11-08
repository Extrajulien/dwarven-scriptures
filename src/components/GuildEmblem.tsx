export default function GuildEmblem() {
  return (
    <svg
      className="w-full h-full"
      fill="none"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        height="94"
        rx="4"
        stroke="#ffb77b"
        strokeDasharray="5 3"
        strokeWidth="3"
        width="94"
        x="3"
        y="3"
      />
      <rect fill="#1c1b1b" height="84" rx="2" width="84" x="8" y="8" />
      <line
        stroke="#7a4100"
        strokeLinecap="round"
        strokeWidth="5"
        x1="45"
        x2="75"
        y1="35"
        y2="75"
      />
      <line
        stroke="#7a4100"
        strokeLinecap="round"
        strokeWidth="5"
        x1="38"
        x2="68"
        y1="42"
        y2="82"
      />
      <path
        d="M58 21 C62 38, 70 46, 80 50 C70 50, 60 48, 58 45 Z"
        fill="#809bb3"
        stroke="#4e4635"
        strokeWidth="1.5"
      />
      <line stroke="#eec14b" strokeWidth="2" x1="38" x2="52" y1="40" y2="52" />
      <rect
        fill="#c59b27"
        height="18"
        stroke="#eec14b"
        strokeWidth="1.5"
        transform="rotate(-38 22 26)"
        width="16"
        x="22"
        y="26"
      />
      <line stroke="#775a00" strokeWidth="1.5" x1="28" x2="23" y1="36" y2="30" />
      <circle cx="50" cy="50" fill="#4f7942" r="5.5" stroke="#28501e" strokeWidth="2" />
      <text fill="#eec14b" fontFamily="Space Mono" fontSize="7" x="33" y="88">
        ᚠ
      </text>
      <text fill="#eec14b" fontFamily="Space Mono" fontSize="7" x="49" y="88">
        ↑
      </text>
      <text fill="#eec14b" fontFamily="Space Mono" fontSize="7" x="63" y="88">
        ᛋ
      </text>
    </svg>
  );
}
