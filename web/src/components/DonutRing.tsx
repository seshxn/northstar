export const DonutRing = ({ value, size, stroke, color }: { value: number; size: number; stroke: number; color: string }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="donut-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (value / 100) * circumference}
          strokeLinecap="round"
        />
      </svg>
      <span className="donut-ring-label" style={{ fontSize: size < 60 ? 11 : 15, color }}>
        {value}%
      </span>
    </div>
  );
};
