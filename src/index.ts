import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { basename, join } from 'path';
import debug from 'debug';
import fetch, { fileFrom, FormData, RequestInit } from 'node-fetch';
import jwt from 'jsonwebtoken';
import type {
  ChannelType,
  UploadResponse,
  VersionInfo,
  VersionListResponse,
  SignAddonParam,
  VersionStatus,
  FileInfo,
} from './types';

const log = debug('amo-upload');

export class FatalError extends Error {}

export class ProcessingError extends Error {}

async function poll<T>(
  check: (retry: number) => Promise<T>,
  interval: number,
  maxRetry: number,
) {
  let lastError: unknown;
  for (let i = 0; i < maxRetry; i += 1) {
    await delay(interval);
    try {
      return await check(i);
    } catch (err) {
      lastError = err;
      if (err instanceof FatalError) break;
    }
  }
  throw lastError;
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export class AMOClient {
  private headers: Record<string, string> = {};

  private tokenExpire = 0;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    public apiPrefix = 'https://addons.mozilla.org',
  ) {
    if (!apiKey || !apiSecret) {
      throw new Error('apiKey and apiSecret are required');
    }
  }

  private updateToken(force = false, ttl = 60) {
    const now = Date.now();
    if (this.tokenExpire < now || force) {
      const token = this.getJWT(ttl);
      this.headers.Authorization = `JWT ${token}`;
      // Refresh token a few seconds before it really expires
      this.tokenExpire = now + ttl - 10;
    }
  }

  private fetch(url: string, opts?: RequestInit) {
    this.updateToken();
    return fetch(url, {
      ...opts,
      headers: {
        ...this.headers,
        ...opts?.headers,
      },
    });
  }

  private async request<T = unknown>(url: string, opts?: RequestInit) {
    const res = await this.fetch(this.apiPrefix + url, opts);
    const data = (await res.json()) as T;
    if (!res.ok) throw { res, data };
    return data;
  }

  async uploadFile(distFile: string, channel: ChannelType) {
    log('Starting uploadFile %s', distFile);
    const formData = new FormData();
    formData.set('upload', await fileFrom(distFile), basename(distFile));
    formData.set('channel', channel);
    const { uuid }: UploadResponse = await this.request(
      '/api/v5/addons/upload/',
      {
        method: 'POST',
        body: formData,
      },
    );
    try {
      log('Start polling for the upload result');
      await poll(
        async (i) => {
          log('Polling %s', i);
          const data: UploadResponse = await this.request(
            `/api/v5/addons/upload/${uuid}/`,
          );
          if (!data.processed)
            throw new ProcessingError(
              'The uploaded file is still being processed by the validator',
            );
          if (!data.valid)
            throw new FatalError(
              'The uploaded file is not valid and rejected by the validator',
            );
        },
        5000,
        24,
      );
    } catch (err) {
      if (err instanceof ProcessingError) {
        // It takes too long for processing. Since the version is not created yet, we cannot keep the uuid for later use.
        // So we are not able to resume the process. Throw a fatal error instead.
        err = new FatalError(err.message);
      }
      throw err;
    }
    log('Finished uploadFile %s', distFile);
    return uuid;
  }

  async createVersion(
    addonId: string,
    channel: ChannelType,
    distFile: string,
    extra?: {
      sourceFile?: string;
      approvalNotes?: string;
      releaseNotes?: Record<string, string>;
    },
  ) {
    const uploadUuid = await this.uploadFile(distFile, channel);
    const { approvalNotes, releaseNotes, sourceFile } = extra || {};
    log('Starting createVersion');
    let versionInfo: VersionInfo = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          approval_notes: approvalNotes,
          release_notes: releaseNotes,
          upload: uploadUuid,
        }),
      },
    );
    log('Finished createVersion: %o', versionInfo);
    if (sourceFile) {
      versionInfo = await this.updateSource(addonId, versionInfo, sourceFile);
    }
    return versionInfo;
  }

  async updateSource(
    addonId: string,
    versionInfo: VersionInfo,
    sourceFile: string,
  ) {
    log('Starting updateSource: %s', sourceFile);
    const formData = new FormData();
    formData.set('source', await fileFrom(sourceFile), basename(sourceFile));
    versionInfo = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/${versionInfo.id}`,
      {
        method: 'PATCH',
        body: formData,
      },
    );
    log('Finished updateSource: %s', sourceFile);
    return versionInfo;
  }

  async updateVersion(
    addonId: string,
    versionInfo: VersionInfo,
    extra: {
      sourceFile?: string;
      approvalNotes?: string;
      releaseNotes?: Record<string, string>;
    },
  ) {
    const { approvalNotes, releaseNotes, sourceFile } = extra;
    if (approvalNotes !== undefined || releaseNotes !== undefined) {
      log('Starting updateNotes: %s', versionInfo.id);
      versionInfo = await this.request(
        `/api/v5/addons/addon/${addonId}/versions/${versionInfo.id}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            approval_notes: approvalNotes,
            release_notes: releaseNotes,
          }),
        },
      );
      log('Finished updateNotes: %s', versionInfo.id);
    }
    if (sourceFile) {
      versionInfo = await this.updateSource(addonId, versionInfo, sourceFile);
    }
    return versionInfo;
  }

  async getVersions(addonId: string) {
    const result: VersionListResponse = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/?filter=all_with_unlisted`,
    );
    return result;
  }

  async getVersionStatus(addonId: string, version: string) {
    const result: VersionStatus = await this.request(
      `/api/v5/addons/${addonId}/versions/${version}/`,
    );
    return result;
  }

  getSignedFileFromStatus(versionStatus?: VersionStatus) {
    const file = versionStatus?.files?.[0];
    if (file?.signed) return file;
  }

  async getSignedFile(addonId: string, version: string) {
    const versionStatus = await this.getVersionStatus(addonId, version);
    return this.getSignedFileFromStatus(versionStatus);
  }

  async findVersion(addonId: string, version: string, firstPageOnly = true) {
    let { results, next } = await this.getVersions(addonId);
    let matched: VersionInfo;
    while (!matched) {
      matched = results.find((item) => item.version === version);
      if (matched || !next || firstPageOnly) break;
      ({ results, next } = await this.request(next));
    }
    return matched;
  }

  getJWT(ttl: number) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.apiKey,
      jti: Math.random().toString(),
      iat: issuedAt,
      exp: issuedAt + ttl,
    };
    const token = jwt.sign(payload, this.apiSecret, {
      algorithm: 'HS256',
    });
    return token;
  }

  async downloadFile(url: string, output?: string) {
    const res = await this.fetch(url);
    const filename = url.split('/').pop() || 'noname';
    if (output) {
      try {
        const stats = await stat(output);
        if (stats.isDirectory()) {
          output = join(output, filename);
        }
      } catch {
        // ignore
      }
    } else {
      output = filename;
    }
    const stream = createWriteStream(output);
    await new Promise((resolve, reject) => {
      res.body.pipe(stream);
      res.body.on('error', reject);
      stream.on('finish', resolve);
    });
    return output;
  }
}

export async function signAddon({
  apiKey,
  apiSecret,
  apiPrefix,
  addonId,
  addonVersion,
  channel = 'listed',
  distFile,
  sourceFile,
  approvalNotes,
  releaseNotes,
  output,
  pollInterval = 15000,
  pollRetry = 4,
}: SignAddonParam) {
  const client = new AMOClient(apiKey, apiSecret, apiPrefix);
  let signedFile: FileInfo;
  let versionInfo: VersionInfo;

  try {
    signedFile = await client.getSignedFile(addonId, addonVersion);
  } catch (err) {
    if (err.res.status !== 404) throw err;
  }

  if (!signedFile) {
    if (!distFile)
      throw new Error('Version not found, please provide distFile');
    versionInfo = await client.createVersion(addonId, channel, distFile, {
      sourceFile,
      approvalNotes,
      releaseNotes,
    });
  } else {
    versionInfo = await client.findVersion(addonId, addonVersion);
    await client.updateVersion(addonId, versionInfo, {
      sourceFile,
      approvalNotes,
      releaseNotes,
    });
  }
  if (!output && channel === 'listed') {
    return versionInfo.file.url.slice(
      versionInfo.file.url.lastIndexOf('/') + 1,
    );
  }

  log('Starting polling for the signed file');
  signedFile = await poll(
    async (i) => {
      log('Polling %s', i);
      const file = await client.getSignedFile(addonId, addonVersion);
      if (!file) throw new ProcessingError('The file has not been signed yet');
      return file;
    },
    pollInterval,
    pollRetry,
  );
  return client.downloadFile(signedFile.download_url, output);
}
