import React from 'react';

// Hand-drawn red pencil arrow pointing from annotation to target
export function PencilArrow({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M4 12C28 4 68 8 88 28C100 40 108 52 112 60"
        stroke="#d94834"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="1 0.5"
      />
      <path
        d="M98 56L113 62L116 46"
        stroke="#d94834"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Hand-drawn red pencil curved arrow pointing up-left
export function PencilArrowUpLeft({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M92 52C70 54 38 48 24 30C16 20 14 12 12 6"
        stroke="#d94834"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M6 18L12 4L22 14"
        stroke="#d94834"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Hand-drawn red pencil circle/oval around an item
export function PencilCircle({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 180 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M14 32C10 16 38 6 92 6C152 6 174 18 170 34C165 48 132 54 82 54C34 54 12 46 16 30"
        stroke="#d94834"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

// Hand-drawn red pencil underline scribble
export function PencilUnderline({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 240 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M3 14C45 8 98 16 142 10C176 5 210 12 237 8"
        stroke="#d94834"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M28 18C70 14 135 22 195 15"
        stroke="#d94834"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}

// Brass metallic paperclip
export function BrassPaperclip({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 36 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="40%" stopColor="#f3e5ab" />
          <stop offset="70%" stopColor="#aa820a" />
          <stop offset="100%" stopColor="#5c4503" />
        </linearGradient>
        <filter id="clipShadow" x="-20%" y="-10%" width="150%" height="130%">
          <feDropShadow dx="2" dy="4" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      <path
        d="M12 28V68C12 76 18 82 24 82C30 82 34 76 34 68V16C34 7 26 2 17 2C8 2 2 8 2 18V64"
        stroke="url(#brassGrad)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#clipShadow)"
      />
    </svg>
  );
}

// Vintage red rubber stamp
export function RubberStamp({
  text,
  subtext,
  rotate = -8,
  className = ''
}: {
  text: string;
  subtext?: string;
  rotate?: number;
  className?: string;
}) {
  return (
    <div
      className={`inline-block border-2 border-dashed border-[#d94834] text-[#d94834] px-3.5 py-1.5 rounded select-none uppercase font-mono tracking-widest text-[11px] font-bold ${className}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        backgroundColor: 'rgba(217, 72, 52, 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(217, 72, 52, 0.25)',
      }}
    >
      <div className="flex items-center space-x-1.5 leading-none">
        <span className="w-1.5 h-1.5 rounded-full bg-[#d94834]" />
        <span>{text}</span>
      </div>
      {subtext && <div className="text-[8px] tracking-normal opacity-80 pt-0.5">{subtext}</div>}
    </div>
  );
}

// Notebook spiral coils on the left binding spine
export function NotebookSpiralRings({ count = 18 }: { count?: number }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-around py-6 z-20 pointer-events-none select-none">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative flex items-center h-4">
          {/* Punched hole */}
          <div className="w-2.5 h-3 bg-[#18181b] rounded-sm shadow-inner border border-black/40" />
          {/* Metal spiral wire loop */}
          <div
            className="absolute -left-3.5 w-6 h-3 rounded-full border-t-2 border-b-2 border-zinc-400 bg-gradient-to-r from-zinc-300 via-zinc-100 to-zinc-400 shadow-sm"
            style={{ transform: 'rotate(-12deg)' }}
          />
        </div>
      ))}
    </div>
  );
}

// Washi Tape Snippet
export function WashiTape({
  className = '',
  width = '80px',
  color = 'cream',
  rotate = 2
}: {
  className?: string;
  width?: string;
  color?: 'cream' | 'coral' | 'kraft';
  rotate?: number;
}) {
  const bg =
    color === 'coral'
      ? 'rgba(225, 95, 75, 0.38)'
      : color === 'kraft'
      ? 'rgba(210, 185, 145, 0.65)'
      : 'rgba(245, 235, 215, 0.75)';

  return (
    <div
      className={`absolute h-5 pointer-events-none z-30 shadow-xs backdrop-blur-xs ${className}`}
      style={{
        width,
        backgroundColor: bg,
        transform: `rotate(${rotate}deg)`,
        borderLeft: '2px dashed rgba(160, 140, 110, 0.4)',
        borderRight: '2px dashed rgba(160, 140, 110, 0.4)',
      }}
    />
  );
}
