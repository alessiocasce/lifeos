export function LifeOSLogo({ className = '', showWordmark = false, size = 24 }) {
  const mark = (
    <svg
      aria-hidden="true"
      className={showWordmark ? 'shrink-0' : className}
      fill="none"
      height={size}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 3.75 41.54 13.88v20.24L24 44.25 6.46 34.12V13.88L24 3.75Z"
        fill="#071312"
        stroke="#22d3ee"
        strokeOpacity="0.72"
        strokeWidth="2.4"
      />
      <path
        d="M14.25 25.35h5.18l2.86-7.1 4.9 13.48 3.06-6.38h3.5"
        stroke="#34d399"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M14.25 18.25h4.82M28.92 18.25h4.83M14.25 31.75h4.82M28.92 31.75h4.83"
        stroke="#67e8f9"
        strokeLinecap="round"
        strokeOpacity="0.82"
        strokeWidth="2"
      />
      <path
        d="M24 9.5v4.25M24 34.25v4.25M9.25 24h4.25M34.5 24h4.25"
        stroke="#22d3ee"
        strokeLinecap="round"
        strokeOpacity="0.48"
        strokeWidth="2"
      />
      <circle cx="24" cy="24" fill="#0a0a0a" r="3.35" stroke="#22d3ee" strokeWidth="1.9" />
      <circle cx="24" cy="24" fill="#34d399" r="1.25" />
    </svg>
  );

  if (!showWordmark) return mark;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark}
      <span className="font-semibold tracking-wide text-zinc-100">LifeOS</span>
    </span>
  );
}
