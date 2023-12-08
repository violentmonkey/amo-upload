export type ChannelType = 'listed' | 'unlisted';

export interface FileInfo {
  id: number;
  created: string;
  is_mozilla_signed_extension: boolean;
  status: 'public' | 'disabled' | 'unreviewed';
  url: string;
  hash: string;
}

export interface VersionDetail {
  id: number;
  channel: ChannelType;
  version: string;
  source: string | null;
  file: FileInfo;
  approval_notes: string;
  release_notes: Record<string, string> | null;
}

export interface UploadResponse {
  uuid: string;
  channel: ChannelType;
  processed: boolean;
  version: string;
  valid: boolean;
  validation: object;
}

export interface SignAddonParam {
  apiKey: string;
  apiSecret: string;
  apiPrefix: string;
  addonId: string;
  addonVersion: string;
  channel?: ChannelType;
  distFile?: string;
  sourceFile?: string;
  approvalNotes?: string;
  releaseNotes?: Record<string, string>;
  compatibility?: CompatibilityInfo;
  override?: boolean;
  output?: string;
  pollInterval?: number;
  /** Times to check the signed file after creating a new version. */
  pollRetry?: number;
  /** Times to check the signed file for an existing version. */
  pollRetryExisting?: number;
}

export type SupportedApps = 'android' | 'firefox';
export type CompatibilityInfo =
  | string[]
  | Partial<
      Record<
        SupportedApps,
        {
          min?: string;
          max?: string;
        }
      >
    >;
