import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '4px',
  style,
}) => {
  const { isDark } = useTheme();

  return (
    <>
      <style>
        {`
          @keyframes skeleton-pulse {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
          }
        `}
      </style>
      <div
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
          ...style,
        }}
      />
    </>
  );
};

// Skeleton for target cards
export const TargetCardSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        backgroundColor: colors.cardBg,
        borderRadius: '12px',
        padding: '16px',
        border: `1px solid ${colors.border}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width={12} height={12} borderRadius="50%" />
          <Skeleton width={120} height={18} />
        </div>
        <Skeleton width={60} height={24} borderRadius="12px" />
      </div>

      {/* Gauge placeholder */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Skeleton width={140} height={70} borderRadius="70px 70px 0 0" />
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <Skeleton width="60%" height={24} style={{ margin: '0 auto 4px' }} />
            <Skeleton width="40%" height={12} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton for metric cards
export const MetricCardSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        backgroundColor: colors.cardBg,
        borderRadius: '8px',
        padding: '16px',
        border: `1px solid ${colors.border}`,
      }}
    >
      <Skeleton width="50%" height={14} style={{ marginBottom: '8px' }} />
      <Skeleton width="70%" height={28} />
    </div>
  );
};

// Skeleton for table rows
export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => {
  return (
    <div style={{ display: 'flex', gap: '16px', padding: '12px 0' }}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === 0 ? '20%' : `${60 / (columns - 1)}%`}
          height={16}
        />
      ))}
    </div>
  );
};

// Skeleton for chart
export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 200 }) => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        backgroundColor: colors.cardBg,
        borderRadius: '8px',
        padding: '16px',
        border: `1px solid ${colors.border}`,
        height,
      }}
    >
      <Skeleton width="30%" height={16} style={{ marginBottom: '16px' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: height - 60 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            width="100%"
            height={`${30 + Math.random() * 60}%`}
            borderRadius="4px 4px 0 0"
          />
        ))}
      </div>
    </div>
  );
};

// Skeleton for alert items
export const AlertItemSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '8px',
        backgroundColor: colors.cardBg,
        border: `1px solid ${colors.border}`,
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <Skeleton width={80} height={20} borderRadius="10px" />
        <Skeleton width={100} height={14} />
      </div>
      <Skeleton width="90%" height={14} style={{ marginBottom: '4px' }} />
      <Skeleton width="60%" height={12} />
    </div>
  );
};

// Dashboard loading skeleton
export const DashboardSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Skeleton width={200} height={32} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton width={40} height={40} borderRadius="8px" />
          <Skeleton width={40} height={40} borderRadius="8px" />
          <Skeleton width={40} height={40} borderRadius="8px" />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[1, 2, 3, 4].map((i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Target cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <TargetCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
};
