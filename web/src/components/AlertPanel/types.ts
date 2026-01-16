export type Tab = 'history' | 'rules' | 'channels' | 'maintenance';

export interface AlertingConfig {
  enabled: boolean;
  check_interval: string;
  cooldown: string;
  channels: {
    slack: {
      enabled: boolean;
      webhook_url: string;
      channel: string;
      username: string;
    };
    discord: {
      enabled: boolean;
      webhook_url: string;
    };
    mattermost: {
      enabled: boolean;
      webhook_url: string;
      channel: string;
      username: string;
    };
    webhook: {
      enabled: boolean;
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    email: {
      enabled: boolean;
      smtp_host: string;
      smtp_port: number;
      username: string;
      from: string;
      to: string[];
      use_tls: boolean;
    };
    notion: {
      enabled: boolean;
      database_id: string;
    };
  };
}
