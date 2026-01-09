import { memo, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface PoolGaugeProps {
  active: number;
  max: number;
  size?: number;
}

export const PoolGauge = memo(function PoolGauge({ active, max, size = 120 }: PoolGaugeProps) {
  const usage = max > 0 ? (active / max) * 100 : 0;
  const data = useMemo(() => [
    { name: 'Used', value: active },
    { name: 'Available', value: Math.max(0, max - active) },
  ], [active, max]);

  const color = useMemo(() => {
    if (usage >= 90) return '#ef4444';
    if (usage >= 70) return '#f59e0b';
    return '#22c55e';
  }, [usage]);

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.4}
            startAngle={180}
            endAngle={0}
            dataKey="value"
          >
            <Cell fill={color} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -30%)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: size * 0.2, fontWeight: 'bold', color: color }}>
          {usage.toFixed(0)}%
        </div>
        <div style={{ fontSize: size * 0.1, color: '#6b7280' }}>
          {active}/{max}
        </div>
      </div>
    </div>
  );
});
