import { cn } from '@/lib/utils';

const BLUE = '#1a4db5';
const AMBER = '#f5a623';

// 3×3 dot grid: top-center dot is filled, all others are outlines
const DOTS = [
  [false, true,  false],
  [false, false, false],
  [false, false, false],
];

function DotGrid({ size = 28 }: { size?: number }) {
  const spacing = size / 3.5;
  const r = spacing * 0.28;
  const offset = (size - spacing * 2) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true">
      {DOTS.map((row, ri) =>
        row.map((filled, ci) => {
          const cx = offset + ci * spacing;
          const cy = offset + ri * spacing;
          return filled ? (
            <circle key={`${ri}-${ci}`} cx={cx} cy={cy} r={r} fill={BLUE} />
          ) : (
            <circle key={`${ri}-${ci}`} cx={cx} cy={cy} r={r * 0.85} stroke={BLUE} strokeWidth={size * 0.04} fill="none" />
          );
        })
      )}
    </svg>
  );
}

interface LogoProps {
  /** Tailwind className for the wrapper */
  className?: string;
  /** Font size in px for the wordmark text */
  textSize?: number;
  /** Show icon only (no wordmark text) */
  iconOnly?: boolean;
  /** Icon size in px */
  iconSize?: number;
}

export function Logo({ className, textSize = 22, iconOnly = false, iconSize }: LogoProps) {
  const dotSize = iconSize ?? Math.round(textSize * 1.25);

  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <DotGrid size={dotSize} />
      {!iconOnly && (
        <span
          style={{
            fontSize: textSize,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1,
          }}
        >
          <span style={{ color: BLUE }}>team</span>
          <span style={{ color: AMBER }}>sn</span>
        </span>
      )}
    </div>
  );
}
