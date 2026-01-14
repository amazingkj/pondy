import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const defaultIcons = {
  noData: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="10" width="36" height="28" rx="2" />
      <line x1="6" y1="18" x2="42" y2="18" />
      <line x1="14" y1="26" x2="34" y2="26" opacity="0.5" />
      <line x1="14" y1="32" x2="28" y2="32" opacity="0.5" />
    </svg>
  ),
  success: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="24" cy="24" r="18" />
      <path d="M16 24l6 6 12-12" />
    </svg>
  ),
  error: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="24" cy="24" r="18" />
      <line x1="18" y1="18" x2="30" y2="30" />
      <line x1="30" y1="18" x2="18" y2="30" />
    </svg>
  ),
  search: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="20" cy="20" r="12" />
      <line x1="29" y1="29" x2="40" y2="40" />
    </svg>
  ),
  bell: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M24 6v2M24 40v2M12 18a12 12 0 0124 0v8c0 2 2 4 4 6H8c2-2 4-4 4-6v-8z" />
      <circle cx="24" cy="40" r="3" />
    </svg>
  ),
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          color: colors.textSecondary,
          marginBottom: '16px',
          opacity: 0.6,
        }}
      >
        {icon || defaultIcons.noData}
      </div>
      <h3
        style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: colors.text,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            color: colors.textSecondary,
            maxWidth: '300px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            backgroundColor: colors.primary,
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// Pre-configured empty states
export const NoTargetsEmpty: React.FC<{ onAddTarget?: () => void }> = ({ onAddTarget }) => (
  <EmptyState
    icon={defaultIcons.noData}
    title="No targets configured"
    description="Add a target to start monitoring your connection pools."
    action={onAddTarget ? { label: 'Add Target', onClick: onAddTarget } : undefined}
  />
);

export const NoAlertsEmpty: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => (
  <EmptyState
    icon={isActive ? defaultIcons.success : defaultIcons.bell}
    title={isActive ? 'No active alerts' : 'No alerts found'}
    description={isActive ? 'All systems are operating normally.' : 'There are no alerts matching your filter.'}
  />
);

export const NoSearchResultsEmpty: React.FC<{ query?: string }> = ({ query }) => (
  <EmptyState
    icon={defaultIcons.search}
    title="No results found"
    description={query ? `No matches for "${query}". Try a different search term.` : 'Try adjusting your search or filters.'}
  />
);

export const ErrorEmpty: React.FC<{ message?: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <EmptyState
    icon={defaultIcons.error}
    title="Something went wrong"
    description={message || 'An error occurred while loading data.'}
    action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
  />
);
