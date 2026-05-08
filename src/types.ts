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

export enum SignAddonStatus {
  BEFORE_GET_VERSION = 'before_get_version',
  AFTER_GET_VERSION = 'after_get_version',
  // createVersion
  BEFORE_CREATE_VERSION = 'before_create_version',
  AFTER_CREATE_VERSION = 'after_create_version',
  // updateVersion
  BEFORE_UPDATE_VERSION = 'before_update_version',
  AFTER_UPDATE_VERSION = 'after_update_version',
  // poll signed file
  BEFORE_POLL_SIGNED_FILE = 'before_poll_signed_file',
  AFTER_POLL_SIGNED_FILE = 'after_poll_signed_file',
  // download file
  BEFORE_DOWNLOAD_FILE = 'before_download_file',
  AFTER_DOWNLOAD_FILE = 'after_download_file',
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
  // when a 429 throttled error occurs, if a retry is possible within maxTime, the system will wait until that time before retrying
  throttledRetry?: number;
  // status change callback
  onStatusChange?: (status: SignAddonStatus, data?: unknown) => void
}
