export type ChannelType = 'listed' | 'unlisted';

export interface UploadInfo {
  id: number;
  created: string;
  is_mozilla_signed_extension: boolean;
  status:
    | 'public'
    | 'deleted'
    | 'disabled'
    | 'nominated'
    | 'incomplete'
    | 'unreviewed';
  url: string;
  hash: string;
}

export interface VersionInfo {
  id: number;
  channel: ChannelType;
  version: string;
  source: string;
  file: UploadInfo;
}

export interface VersionListResponse {
  results: VersionInfo[];
  next: string;
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
  addonId: string;
  addonVersion: string;
  channel?: ChannelType;
  distFile?: string;
  sourceFile?: string;
  output?: string;
  pollInterval?: number;
  pollRetry?: number;
}

export interface FileInfo {
  download_url: string;
  hash: string;
  signed: boolean;
}

export interface VersionStatus {
  guid: string;
  active: boolean;
  automated_signing: boolean;
  files: FileInfo[];
  passed_review: boolean;
  processed: boolean;
  reviewed: string;
  valid: boolean;
  version: string;
}
