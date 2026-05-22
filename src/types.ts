export type ChannelType = 'listed' | 'unlisted';
export type SupportedApps = 'android' | 'firefox';
export type CompatibilityMap = Partial<
  Record<
    SupportedApps,
    {
      min?: string;
      max?: string;
    }
  >
>;
export type CompatibilityInfo = string[] | CompatibilityMap;

export type AMOClientActions =
  | 'token-update'
  | 'request-start'
  | 'request-end'
  | 'upload-file-start'
  | 'upload-file-processing'
  | 'upload-file-poll'
  | 'upload-file-end'
  | 'create-version-start'
  | 'create-version-end'
  | 'update-source-skip'
  | 'update-source-start'
  | 'update-source-end'
  | 'update-version-skip'
  | 'update-version-start'
  | 'update-version-end'
  | 'wait-start'
  | 'wait-poll'
  | 'wait-end'
  | 'download-start'
  | 'download-end';

export interface AMOClientOptions {
  onDebug?: (type: AMOClientActions, payload?: unknown) => void;
  /** When a throttled error occurs, if a retry is possible within this parameter, the system will wait until that time before retrying. */
  retryAfterLimit?: number;
}

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
  compatibility: CompatibilityMap;
}

export interface VersionListRequest {
  filter?: 'all_without_unlisted' | 'all_with_unlisted' | 'all_with_deleted';
  page?: number;
  page_size?: number;
}

export interface VersionListResponse {
  count: number;
  next: string;
  previous: string;
  results: VersionDetail[];
}

export interface UploadResponse {
  uuid: string;
  channel: ChannelType;
  processed: boolean;
  version: string;
  valid: boolean;
  validation: object;
}

export interface SignAddonParam extends AMOClientOptions {
  apiKey: string;
  apiSecret: string;
  apiUrlPrefix: string;
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
