'use client';

import { useState } from 'react';
import {
  TIERS,
  getTier,
  getColor,
  cfuToScore,
  type SiteData,
  type AreaData,
} from '@/lib/platform-utils';

// ── HELPERS ──
const getTrendIcon = (t: string) => (t === 'improving' ? '↑' : t === 'declining' ? '↓' : '→');
const getTrendLabel = (t: string) =>
  t === 'improving' ? 'Improving' : t === 'declining' ? 'Declining' : 'Stable';

const areaStats = (area: AreaData) => {
  const scores = area.sites.map((s) => s.score);
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    issues: area.sites.filter((s) => s.score < 60).length,
    total: scores.length,
  };
};

const getFactors = (site: SiteData) => [
  {
    label: 'Rainfall (48h)',
    value: site.rainfall48h === 0 ? 95 : site.rainfall48h <= 0.1 ? 70 : site.rainfall48h <= 0.3 ? 40 : 20,
    detail: site.rainfall48h === 0 ? 'None' : `${site.rainfall48h}mm`,
  },
  {
    label: 'Runoff Proximity',
    value: site.drainProximity === 'none' ? 95 : site.drainProximity === 'nearby' ? 65 : 30,
    detail: site.drainProximity === 'none' ? 'No outlets nearby' : site.drainProximity === 'nearby' ? 'Storm drain nearby' : `Near ${site.drainProximity}`,
  },
  {
    label: 'Tide Phase',
    value: site.tidePhase === 'high' ? 90 : site.tidePhase === 'mid-rising' ? 80 : 50,
    detail: site.tidePhase.replace('-', ' '),
  },
];

// ── SHARED COMPONENTS ──
export function ScoreRing({
  score,
  size = 64,
  stroke = 5,
}: {
  score: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = getColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size * 0.32, fontWeight: 700, color, fontFamily: 'var(--f)' }}>
          {score}
        </span>
      </div>
    </div>
  );
}

function Spark({
  data,
  current,
  w = 100,
  h = 32,
}: {
  data: number[];
  current: number;
  w?: number;
  h?: number;
}) {
  const all = [current, ...data];
  const mx = Math.max(...all, 100);
  const mn = Math.min(...all, 0);
  const rng = mx - mn || 1;
  const pts = all.map(
    (v, i) => `${(i / (all.length - 1)) * w},${h - ((v - mn) / rng) * (h - 6) - 3}`
  );
  const color = getColor(data[data.length - 1] ?? current);
  const uid = `sp-${current}-${data.join('')}`;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${uid})`} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {all.map((v, i) => {
        const x = (i / (all.length - 1)) * w;
        const y = h - ((v - mn) / rng) * (h - 6) - 3;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === 0 ? 3 : 2}
            fill={i === 0 ? '#fff' : color}
            stroke={color}
            strokeWidth={i === 0 ? 1.5 : 0}
          />
        );
      })}
    </svg>
  );
}

function ScoreRange({ min, max, avg }: { min: number; max: number; avg: number }) {
  return (
    <div style={{ width: 110 }}>
      <div
        style={{
          position: 'relative',
          height: 5,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${min}%`,
            right: `${100 - max}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${getColor(min)}, ${getColor(max)})`,
            borderRadius: 3,
            opacity: 0.65,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${avg}%`,
            top: -2.5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: getColor(avg),
            border: '2px solid #1a1e2e',
            transform: 'translateX(-5px)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: getColor(min) }}>{min}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>avg {avg}</span>
        <span style={{ fontSize: 9, color: getColor(max) }}>{max}</span>
      </div>
    </div>
  );
}

function FibHoverInfo({ fib, dotColor }: { fib: number; dotColor: string }) {
  const [show, setShow] = useState(false);
  const score = cfuToScore(fib);
  const tier = getTier(score);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
        cursor: 'default',
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: '#fff',
          fontFamily: 'var(--f)',
          lineHeight: 1,
        }}
      >
        {fib}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          marginTop: 2,
        }}
      >
        CFU/104mL
      </span>
      {show && (
        <div
          style={{
            position: 'absolute',
            left: '105%',
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#14161e',
            border: `1px solid ${dotColor}30`,
            borderRadius: 10,
            padding: '10px 14px',
            minWidth: 200,
            zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {fib} CFU/104mL
          </div>
        </div>
      )}
    </div>
  );
}

function FibGauge({ fib }: { fib: number }) {
  const size = 160;
  const strokeW = 12;
  const r = (size - strokeW) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const totalArcDeg = 270;
  const startAngleDeg = 135;
  const maxFib = 400;

  // 5 zones matching the Safety Score Guide tiers (mapped by CFU thresholds)
  // CFU 0–10 → Excellent (#00D68F), 10–35 → Good (#00D68F),
  // 35–70 → Fair (#FFB800), 70–104 → Caution (#FF8C00),
  // 104–200 → Poor (#FF5733), 200–400 → Unsafe (#FF3B5C)
  const zones = [
    { from: 0, to: 10, c1: '#00D68F', c2: '#00D68F' },   // Excellent
    { from: 10, to: 35, c1: '#00D68F', c2: '#00D68F' },   // Good
    { from: 35, to: 70, c1: '#FFB800', c2: '#FFB800' },   // Fair
    { from: 70, to: 103, c1: '#FF8C00', c2: '#FF8C00' },  // Caution
    { from: 103, to: 200, c1: '#FF5733', c2: '#FF5733' }, // Poor
    { from: 200, to: maxFib, c1: '#FF3B5C', c2: '#FF3B5C' }, // Unsafe
  ];

  // 104 threshold at 3/4 of the arc
  const thresholdCFU = 104;
  const thresholdFrac = 0.75;

  // Helper: polar point on circle
  const polarXY = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  // Helper: SVG arc path between two angles
  const arcPath = (fromDeg: number, toDeg: number) => {
    const start = polarXY(fromDeg);
    const end = polarXY(toDeg);
    const sweep = toDeg - fromDeg;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Map CFU to angle: 0–104 spans first 75% of arc, 104–400 spans last 25%
  const cfuToAngle = (cfu: number) => {
    if (cfu <= thresholdCFU) {
      return startAngleDeg + (cfu / thresholdCFU) * thresholdFrac * totalArcDeg;
    }
    return startAngleDeg + thresholdFrac * totalArcDeg +
      ((Math.min(cfu, maxFib) - thresholdCFU) / (maxFib - thresholdCFU)) * (1 - thresholdFrac) * totalArcDeg;
  };

  const readingAngle = Math.min(cfuToAngle(fib), startAngleDeg + totalArcDeg);
  const dot = polarXY(readingAngle);

  // Find which zone the reading falls in and use that color for the dot
  const activeZone = zones.find((z) => fib >= z.from && fib < z.to) || zones[zones.length - 1];
  const dotColor = activeZone.c1;

  // Build zone arc segments
  const zoneArcs = zones.map((z) => ({
    ...z,
    startAngle: cfuToAngle(z.from),
    endAngle: cfuToAngle(z.to),
  }));

  // Render arc segments for a zone
  const renderZone = (
    zone: typeof zoneArcs[0],
    opacity: number,
    clipToReading: boolean
  ) => {
    let segEnd = zone.endAngle;
    if (clipToReading) {
      if (zone.startAngle >= readingAngle) return null;
      segEnd = Math.min(segEnd, readingAngle);
    }
    if (segEnd <= zone.startAngle) return null;
    return (
      <path
        key={`${zone.from}-${opacity}-${clipToReading}`}
        d={arcPath(zone.startAngle, segEnd)}
        fill="none"
        stroke={zone.c1}
        strokeWidth={strokeW}
        strokeLinecap="butt"
        opacity={opacity}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          {/* Dim background track */}
          {zoneArcs.map((z) => renderZone(z, 0.15, false))}
          {/* Active filled arc */}
          {zoneArcs.map((z) => renderZone(z, 1, true))}
          {/* Indicator dot */}
          <circle
            cx={dot.x}
            cy={dot.y}
            r={7}
            fill={dotColor}
            stroke="#0b0d14"
            strokeWidth={3}
          />
        </svg>
        <FibHoverInfo fib={fib} dotColor={dotColor} />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          marginTop: -8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}60`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: dotColor }}>
            {getTier(cfuToScore(fib)).label}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {getTier(cfuToScore(fib)).desc}
        </span>
      </div>
    </div>
  );
}

function FactorBreakdown({ site }: { site: SiteData }) {
  const factors = getFactors(site);
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        What&apos;s behind this score
      </div>
      {factors.map((f, i) => (
        <div key={i} style={{ marginBottom: i < factors.length - 1 ? 8 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{f.label}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{f.detail}</span>
          </div>
          <div
            style={{
              height: 4,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${f.value}%`,
                borderRadius: 2,
                background: getColor(f.value),
                opacity: 0.7,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── HOVER INFO TAG ──
function HoverInfo({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'var(--f)',
          flexShrink: 0,
        }}
      >
        i
      </span>
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#14161e',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 200,
            maxWidth: 260,
            zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.5,
            whiteSpace: 'normal',
            textAlign: 'left',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// ── INFO TOOLTIP (hover to see factor breakdown) ──
function InfoTooltip({ site }: { site: SiteData }) {
  const [show, setShow] = useState(false);
  const factors = getFactors(site);
  return (
    <div
      style={{ position: 'absolute', bottom: 10, right: 12 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.35)',
          fontFamily: 'var(--f)',
        }}
      >
        i
      </div>
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            right: 0,
            background: '#14161e',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '12px 14px',
            minWidth: 220,
            zIndex: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            What&apos;s behind this score
          </div>
          {factors.map((f, i) => (
            <div key={i} style={{ marginBottom: i < factors.length - 1 ? 8 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{f.label}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{f.detail}</span>
              </div>
              <div
                style={{
                  height: 4,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${f.value}%`,
                    borderRadius: 2,
                    background: getColor(f.value),
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SITE DETAIL PANEL ──
export function SiteDetail({
  site,
  onClose,
  style: panelStyle = {},
}: {
  site: SiteData;
  onClose?: () => void;
  style?: React.CSSProperties;
}) {
  const tier = getTier(site.score);
  const color = tier.color;
  const today = new Date();
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const days = [
    'Now',
    formatDate(new Date(today.getTime() + 86400000)),
    formatDate(new Date(today.getTime() + 86400000 * 2)),
    formatDate(new Date(today.getTime() + 86400000 * 3)),
  ];
  const all = [site.score, ...site.forecast];

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', ...panelStyle }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 13,
            cursor: 'pointer',
            padding: '6px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: 'var(--f)',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>‹</span> Back
        </button>
      )}

      <div
        style={{
          background: `${color}0a`,
          border: `1px solid ${color}18`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--f)' }}>
            {tier.label}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {tier.desc}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.3)',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color, fontSize: 11 }}>
              {getTrendIcon(site.trend)} {getTrendLabel(site.trend)}
            </span>
          </div>
        </div>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            background: `${color}15`,
            border: `1px solid ${color}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              fontFamily: 'var(--f)',
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            {tier.label}
          </span>
        </div>
      </div>

      {site.advisory && (
        <div
          style={{
            background: `${color}08`,
            border: `1px solid ${color}12`,
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
            fontSize: 12,
            color: `${color}cc`,
            lineHeight: 1.5,
          }}
        >
          ⚠ {site.advisory}
        </div>
      )}

      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 12,
          position: 'relative',
        }}
      >
        <FibGauge fib={site.fib} />
        <InfoTooltip site={site} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 7,
          marginBottom: 12,
        }}
      >
        {all.slice(0, 4).map((s, i) => {
          const t = getTier(s);
          return (
            <div
              key={i}
              style={{
                background: i === 0 ? `${t.color}0d` : 'rgba(255,255,255,0.02)',
                borderRadius: 10,
                padding: '12px 6px',
                textAlign: 'center',
                border:
                  i === 0 ? `1px solid ${t.color}20` : '1px solid rgba(255,255,255,0.03)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                }}
              >
                <HoverInfo text={`${t.label} — ${t.desc}`} />
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: i === 0 ? t.color : 'rgba(255,255,255,0.28)',
                  marginBottom: 6,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {days[i]}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: t.color,
                  fontFamily: 'var(--f)',
                  lineHeight: 1.2,
                }}
              >
                {t.label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 7,
        }}
      >
        {[
          { label: 'Water Temp', value: `${site.temp}°F` },
          { label: 'Swell', value: site.swell },
          { label: 'Wind', value: site.wind },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              padding: '9px 10px',
              border: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.28)',
                marginBottom: 2,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {c.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'var(--f)' }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SITE ROW ──
function SiteRow({
  site,
  index,
  onSelect,
}: {
  site: SiteData;
  index: number;
  onSelect?: (site: SiteData) => void;
}) {
  const [open, setOpen] = useState(false);
  const tier = getTier(site.score);
  const color = tier.color;

  const toggle = () => {
    setOpen(!open);
    if (!open) onSelect?.(site);
  };

  return (
    <div style={{ animation: `cardIn 0.4s ease ${index * 0.04}s both` }}>
      <div
        onClick={toggle}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.035)' : 'transparent',
          borderRadius: 12,
          transition: 'background 0.2s',
          margin: '0 6px',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `${color}12`,
            border: `1px solid ${color}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color,
              fontFamily: 'var(--f)',
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            {tier.label}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: 'var(--f)' }}>
              {site.name}
            </span>
            {site.advisory && (
              <span
                style={{
                  fontSize: 9,
                  background: `${color}18`,
                  color,
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {site.score >= 40 ? 'advisory' : 'warning'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>
            {site.address} · Updated {site.tested}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Spark data={site.forecast} current={site.score} w={72} h={24} />
            <span
              style={{
                fontSize: 8,
                color: 'rgba(255,255,255,0.2)',
                marginTop: 3,
                letterSpacing: '0.06em',
              }}
            >
              3-DAY
            </span>
          </div>
          <span style={{ fontSize: 13, color, fontWeight: 600, opacity: 0.7 }}>
            {getTrendIcon(site.trend)}
          </span>
          <span
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.12)',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          >
            ▾
          </span>
        </div>
      </div>
      {open && (
        <div
          style={{
            padding: '6px 16px 20px 74px',
            animation: 'fadeIn 0.2s ease',
            margin: '0 6px',
          }}
        >
          <SiteDetail site={site} />
        </div>
      )}
    </div>
  );
}

// ── AREA CARD ──
function AreaCard({
  area,
  onClick,
  index,
}: {
  area: AreaData;
  onClick: (area: AreaData) => void;
  index: number;
}) {
  const st = areaStats(area);
  const tier = getTier(st.avg);
  const color = tier.color;
  return (
    <div
      onClick={() => onClick(area)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}30`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.transform = 'none';
      }}
      style={{
        background: 'linear-gradient(165deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        borderRadius: 18,
        padding: '18px 22px',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.3s',
        animation: `cardIn 0.5s ease ${index * 0.06}s both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            background: `${color}12`,
            border: `1px solid ${color}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color,
              fontFamily: 'var(--f)',
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            {tier.label}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: 'var(--f)' }}>
              {area.name}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 3 }}>
            {st.total} sites · {area.region}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {st.issues > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'rgba(255,140,0,0.1)',
                  color: '#FF8C00',
                  padding: '2px 9px',
                  borderRadius: 8,
                }}
              >
                {st.issues} site{st.issues > 1 ? 's' : ''} with advisory
              </span>
            )}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              {getTier(st.min).label} to {getTier(st.max).label}
            </span>
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.12)' }}>›</span>
        </div>
      </div>
    </div>
  );
}

// ── AREA DETAIL ──
function AreaDetail({
  area,
  onBack,
  onStationSelect,
}: {
  area: AreaData;
  onBack: () => void;
  onStationSelect?: (site: SiteData) => void;
}) {
  const st = areaStats(area);
  const tier = getTier(st.avg);

  return (
    <div style={{ animation: 'slideUp 0.35s ease' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 13,
          cursor: 'pointer',
          padding: '6px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: 'var(--f)',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>‹</span> All Beaches
      </button>
      <div
        style={{
          background: `linear-gradient(165deg, ${tier.color}06, transparent)`,
          borderRadius: 20,
          padding: '24px 24px 20px',
          border: `1px solid ${tier.color}12`,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: 5,
              }}
            >
              {area.region}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 700,
                color: '#fff',
                fontFamily: 'var(--f)',
              }}
            >
              {area.name}
            </h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
              {st.total} sites · Overall:{' '}
              <span style={{ color: tier.color, fontWeight: 600 }}>{tier.label}</span>
            </p>
          </div>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: `${tier.color}12`,
              border: `1px solid ${tier.color}25`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: tier.color,
                fontFamily: 'var(--f)',
                textAlign: 'center',
                lineHeight: 1.1,
              }}
            >
              {tier.label}
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.28)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 600,
          padding: '0 4px',
          marginBottom: 8,
        }}
      >
        Testing Sites ({st.total}) — tap to expand
      </div>
      <div
        style={{
          background: 'linear-gradient(165deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          padding: '4px 0',
        }}
      >
        {area.sites.map((site, i) => (
          <SiteRow
            key={site.id}
            site={site}
            index={i}
            onSelect={onStationSelect}
          />
        ))}
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

// ── LEGEND ──
function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: open ? '12px 12px 0 0' : 12,
          padding: '10px 16px',
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--f)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[...TIERS].reverse().map((t, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: t.color,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            {open ? 'Safety Score Guide' : 'What do the scores mean?'}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.2)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            padding: '16px 16px 14px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TIERS.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '8px 12px',
                  background: `${t.color}08`,
                  borderRadius: 10,
                  border: `1px solid ${t.color}10`,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: t.color,
                    boxShadow: `0 0 8px ${t.color}40`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: t.color,
                      fontFamily: 'var(--f)',
                    }}
                  >
                    {t.label}
                  </span>
                  <span
                    style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 10 }}
                  >
                    {t.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Safety Scores combine bacteria levels, recent rainfall, proximity to storm drains &
              creeks, and tidal conditions. Scores are predicted by AI models and update
              continuously — not just once a week.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LIST VIEW ──
export function ListView({
  area,
  onStationSelect,
}: {
  area: AreaData;
  onStationSelect?: (site: SiteData) => void;
}) {
  const [selectedArea, setSelectedArea] = useState<AreaData | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'safe' | 'issues'>('all');

  const filtered = (() => {
    if (search) {
      const q = search.toLowerCase();
      return {
        ...area,
        sites: area.sites.filter((s) => s.name.toLowerCase().includes(q)),
      };
    }
    if (filter === 'safe') {
      const st = areaStats(area);
      if (st.avg < 80) return { ...area, sites: [] };
      return area;
    }
    if (filter === 'issues') {
      return {
        ...area,
        sites: area.sites.filter((s) => s.score < 60),
      };
    }
    return area;
  })();

  const displayArea = selectedArea ?? filtered;
  const hasSites = displayArea.sites.length > 0;

  return (
    <div>
      {!selectedArea && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 170, position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.18)',
                fontSize: 14,
                pointerEvents: 'none',
              }}
            >
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search beaches or sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 13px 10px 34px',
                background: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 11,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                fontFamily: 'var(--f)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.18)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.07)')}
            />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[
              { k: 'all' as const, l: 'All' },
              { k: 'safe' as const, l: 'Safe' },
              { k: 'issues' as const, l: 'Issues' },
            ].map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                style={{
                  padding: '9px 15px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: '1px solid',
                  fontFamily: 'var(--f)',
                  transition: 'all 0.2s',
                  background: filter === f.k ? 'rgba(255,255,255,0.08)' : 'transparent',
                  borderColor: filter === f.k ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
                  color: filter === f.k ? '#fff' : 'rgba(255,255,255,0.32)',
                }}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedArea ? (
        <AreaDetail
          area={selectedArea}
          onBack={() => setSelectedArea(null)}
          onStationSelect={onStationSelect}
        />
      ) : hasSites ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <AreaCard area={filtered} onClick={() => setSelectedArea(filtered)} index={0} />
        </div>
      ) : (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: 20 }}>
          No sites match your filters.
        </div>
      )}
    </div>
  );
}

export { Legend };
