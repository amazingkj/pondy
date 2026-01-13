import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { TargetStatus } from '../types/metrics';

interface HexagonViewProps {
  targets: TargetStatus[];
  selectedTarget?: string | null;
  onSelectTarget?: (target: TargetStatus) => void;
}

const statusColors = {
  healthy: { bg: '#4ade80', border: '#86efac', text: '#166534' },
  warning: { bg: '#fbbf24', border: '#fde047', text: '#854d0e' },
  critical: { bg: '#f87171', border: '#fca5a5', text: '#991b1b' },
  unknown: { bg: '#d1d5db', border: '#e5e7eb', text: '#374151' },
};

export function HexagonView({ targets, selectedTarget, onSelectTarget }: HexagonViewProps) {
  const { colors } = useTheme();

  // Flatten targets with instances for hexagon display
  const hexItems = useMemo(() => {
    const items: Array<{
      type: 'target' | 'instance';
      name: string;
      displayName: string;
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      metrics?: {
        usage: number;
        active: number;
        idle: number;
        pending: number;
      };
      parent?: string;
    }> = [];

    targets.forEach(target => {
      if (target.instances && target.instances.length > 1) {
        // Multiple instances - show each instance as a hexagon
        target.instances.forEach(inst => {
          const usage = inst.current && inst.current.max > 0
            ? Math.round((inst.current.active / inst.current.max) * 100)
            : 0;
          items.push({
            type: 'instance',
            name: `${target.name}/${inst.instance_name}`,
            displayName: inst.instance_name,
            status: inst.status,
            metrics: inst.current ? {
              usage,
              active: inst.current.active,
              idle: inst.current.idle,
              pending: inst.current.pending,
            } : undefined,
            parent: target.name,
          });
        });
      } else {
        // Single instance or no instances - show target
        const current = target.current || target.instances?.[0]?.current;
        const usage = current && current.max > 0
          ? Math.round((current.active / current.max) * 100)
          : 0;
        items.push({
          type: 'target',
          name: target.name,
          displayName: target.name,
          status: target.status,
          metrics: current ? {
            usage,
            active: current.active,
            idle: current.idle,
            pending: current.pending,
          } : undefined,
        });
      }
    });

    return items;
  }, [targets]);

  return (
    <div style={{
      padding: '24px',
      backgroundColor: colors.bgSecondary,
      borderRadius: '12px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        margin: '0 0 16px 0',
        fontSize: '14px',
        fontWeight: 600,
        color: colors.text,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <HexIcon size={16} color={colors.accent} />
        Service Overview
      </h3>

      <HoneycombGrid
        items={hexItems}
        selectedTarget={selectedTarget}
        onItemClick={(item) => {
          const target = targets.find(t =>
            item.type === 'target' ? t.name === item.name : t.name === item.parent
          );
          if (target && onSelectTarget) {
            onSelectTarget(target);
          }
        }}
      />

      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        marginTop: '16px',
        fontSize: '11px',
      }}>
        {(['healthy', 'warning', 'critical'] as const).map(status => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              backgroundColor: statusColors[status].bg,
              borderRadius: '2px',
            }} />
            <span style={{ color: colors.textSecondary, textTransform: 'capitalize' }}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type HexItem = {
  type: 'target' | 'instance';
  name: string;
  displayName: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  metrics?: {
    usage: number;
    active: number;
    idle: number;
    pending: number;
  };
  parent?: string;
};

// Staggered honeycomb grid layout - pointy-top hexagons
function HoneycombGrid({ items, selectedTarget, onItemClick }: { items: HexItem[]; selectedTarget?: string | null; onItemClick: (item: HexItem) => void }) {
  const hexHeight = 100; // height of pointy-top hexagon
  const hexWidth = hexHeight * 0.866; // width = height * sqrt(3)/2

  // Staggered layout: same items per row, odd rows offset by half
  const hSpacing = hexWidth + 4; // small gap between hexagons
  const vSpacing = hexHeight * 0.76; // overlap for honeycomb effect
  const rowOffset = hexWidth / 2; // half-width offset for odd rows

  // Calculate items per row based on count
  const maxPerRow = items.length <= 4 ? items.length : Math.min(items.length, 5);

  // Build staggered positions
  const positions: { x: number; y: number; item: HexItem; index: number }[] = [];

  items.forEach((item, index) => {
    const row = Math.floor(index / maxPerRow);
    const col = index % maxPerRow;
    const isOddRow = row % 2 === 1;

    const x = col * hSpacing + (isOddRow ? rowOffset : 0);
    const y = row * vSpacing;

    positions.push({ x, y, item, index });
  });

  // Calculate container size
  const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) + hexWidth : hexWidth;
  const maxY = positions.length > 0 ? Math.max(...positions.map(p => p.y)) + hexHeight : hexHeight;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '16px 0',
    }}>
      <div style={{
        position: 'relative',
        width: maxX,
        height: maxY,
      }}>
        {positions.map(({ x, y, item, index }) => {
          const isSelected = selectedTarget === item.name || selectedTarget === item.parent;
          return (
            <div
              key={item.name}
              style={{
                position: 'absolute',
                left: x,
                top: y,
              }}
            >
              <Hexagon
                item={item}
                index={index}
                size={hexHeight}
                isSelected={isSelected}
                onClick={() => onItemClick(item)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface HexagonProps {
  item: HexItem;
  index: number;
  size: number;
  isSelected?: boolean;
  onClick: () => void;
}

function Hexagon({ item, index, size, isSelected, onClick }: HexagonProps) {
  const colors = statusColors[item.status];
  const borderWidth = isSelected ? 3 : 2;
  const innerSize = size - borderWidth * 2;

  // Pointy-top hexagon: height = size, width = size * sqrt(3)/2
  const height = size;
  const width = size * 0.866;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        cursor: 'pointer',
        transition: 'transform 0.2s, filter 0.2s',
        animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
        zIndex: isSelected ? 10 : 1,
        filter: isSelected ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.6))' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.zIndex = '5';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.zIndex = '1';
        }
      }}
    >
      {/* Outer hexagon (border) */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <polygon
          points={getHexagonPoints(width / 2, height / 2, size / 2)}
          fill={colors.border}
        />
        <polygon
          points={getHexagonPoints(width / 2, height / 2, innerSize / 2)}
          fill={colors.bg}
        />
      </svg>

      {/* Content */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        width: '70%',
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: 700,
          color: colors.text,
          lineHeight: 1,
        }}>
          {item.metrics ? `${item.metrics.usage}%` : '--'}
        </div>
        <div style={{
          fontSize: '10px',
          color: colors.text,
          opacity: 0.85,
          marginTop: '3px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: 500,
        }}>
          {item.displayName.length > 10
            ? item.displayName.substring(0, 10) + '..'
            : item.displayName}
        </div>
        {item.metrics && (
          <div style={{
            fontSize: '9px',
            color: colors.text,
            opacity: 0.7,
            marginTop: '2px',
          }}>
            {item.metrics.active}/{item.metrics.active + item.metrics.idle}
          </div>
        )}
      </div>

      {/* Pulse animation for critical/warning */}
      {(item.status === 'critical' || item.status === 'warning') && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: width,
          height: height,
          animation: item.status === 'critical' ? 'pulse 2s infinite' : 'pulse 4s infinite',
          opacity: 0.3,
        }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <polygon
              points={getHexagonPoints(width / 2, height / 2, size / 2)}
              fill="none"
              stroke={colors.bg}
              strokeWidth="2"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

function getHexagonPoints(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    // Pointy-top hexagon: start at -90 degrees (top vertex)
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

function HexIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

// Add CSS animation via style tag
const styleId = 'hexagon-view-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}
