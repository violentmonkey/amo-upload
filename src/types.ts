export type ChannelType = 'listed' | 'unlisted';

export interface FileInfo {
  id: number;
  created: string;
  is_mozilla_signed_extension: boolean;
  status: 'public' | 'deleted' | 'disabled' | 'nominated' | 'incomplete' | 'unreviewed';
  url: string;
  hash: string;
}

export interface VersionInfo {
  id: number;
  channel: ChannelType;
  version: string;
  source: string;
  file: FileInfo;
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
}
