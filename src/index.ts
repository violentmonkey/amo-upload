import debug from 'debug';
import { isEqual } from 'es-toolkit';
import jwt from 'jsonwebtoken';
import { createWriteStream, openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { setTimeout } from 'node:timers/promises';
import type {
  ChannelType,
  CompatibilityInfo,
  SignAddonParam,
  UploadResponse,
  VersionDetail,
  VersionListRequest,
  VersionListResponse,
} from './types';

const log = debug('amo-upload');

export class FatalError extends Error {}

export class ProcessingError extends Error {}

async function poll<T>(
  check: (retry: number) => Promise<T>,
  interval: number,
  maxRetry: number,
  immediate = false,
) {
  let lastError: unknown = new Error('Polling skipped');
  for (let i = 0; i < maxRetry; i += 1) {
    if (!immediate || i > 0) await setTimeout(interval);
    try {
      return await check(i);
    } catch (err) {
      lastError = err;
      if (err instanceof FatalError) break;
    }
  }
  throw lastError;
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
    formData.set('upload', await openAsBlob(distFile), basename(distFile));
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
      let error = err;
      if (error instanceof ProcessingError) {
        // It takes too long for processing. Since the version is not created yet, we cannot keep the uuid for later use.
        // So we are not able to resume the process. Throw a fatal error instead.
        error = new FatalError(error.message);
      }
      throw error;
    }
    log('Finished uploadFile %s', distFile);
    return uuid;
  }

  async createVersion(
    addonId: string,
    channel: ChannelType,
    distFile: string,
    extra?: {
      approvalNotes?: string;
      compatibility?: CompatibilityInfo;
      releaseNotes?: Record<string, string>;
      sourceFile?: string;
    },
  ) {
    const uploadUuid = await this.uploadFile(distFile, channel);
    const { approvalNotes, compatibility, releaseNotes, sourceFile } =
      extra || {};
    log('Starting createVersion');
    let versionInfo: VersionDetail = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          approval_notes: approvalNotes,
          compatibility,
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
    versionInfo: VersionDetail,
    sourceFile: string,
  ) {
    if (versionInfo.source) {
      log('Source is already uploaded, skipping');
      return versionInfo;
    }
    log('Starting updateSource: %s', sourceFile);
    const formData = new FormData();
    formData.set('source', await openAsBlob(sourceFile), basename(sourceFile));
    versionInfo = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/${versionInfo.id}/`,
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
    versionInfo: VersionDetail,
    extra: {
      approvalNotes?: string;
      releaseNotes?: Record<string, string>;
      sourceFile?: string;
      override?: boolean;
    },
  ) {
    const { approvalNotes, releaseNotes, sourceFile, override } = extra;
    let updates: Record<string, unknown> | undefined;
    if (
      approvalNotes &&
      approvalNotes !== versionInfo.approval_notes &&
      override
    ) {
      updates = { ...updates, approval_notes: approvalNotes };
    }
    if (
      releaseNotes &&
      !isEqual(releaseNotes, versionInfo.release_notes) &&
      override
    ) {
      updates = { ...updates, release_notes: releaseNotes };
    }
    if (!updates) {
      log('No update found, skipping patchVersion');
    } else {
      log('Starting updateNotes: %s', versionInfo.id);
      versionInfo = await this.request(
        `/api/v5/addons/addon/${addonId}/versions/${versionInfo.id}/`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(updates),
        },
      );
      log('Finished updateNotes: %s', versionInfo.id);
    }
    if (sourceFile) {
      versionInfo = await this.updateSource(addonId, versionInfo, sourceFile);
    }
    return versionInfo;
  }

  async getVersion(addonId: string, version: string) {
    const result: VersionDetail = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/${version}/`,
    );
    return result;
  }

  async getVersions(addonId: string, options?: VersionListRequest) {
    const search = options
      ? new URLSearchParams(
          Object.entries(options).map(([k, v]) => [k, `${v}`]),
        ).toString()
      : '';
    const result: VersionListResponse = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/?${search}`,
    );
    return result;
  }

  getSignedFileFromDetail(detail?: VersionDetail) {
    const file = detail?.file;
    if (file?.status === 'public') return file;
  }

  async getSignedFile(addonId: string, version: string) {
    const versionDetail = await this.getVersion(addonId, version);
    return this.getSignedFileFromDetail(versionDetail);
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
    await finished(Readable.fromWeb(res.body as ReadableStream).pipe(stream));
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
  compatibility,
  override,
  output,
  pollInterval = 30000,
  pollRetry = 4,
  pollRetryExisting = 1,
}: SignAddonParam) {
  const client = new AMOClient(apiKey, apiSecret, apiPrefix);

  let versionDetail: VersionDetail | undefined;
  try {
    versionDetail = await client.getVersion(addonId, addonVersion);
  } catch (err) {
    if ((err as { res: Response })?.res?.status !== 404) {
      throw err;
    }
  }
  const isNewVersion = !versionDetail;
  if (!versionDetail) {
    if (!distFile)
      throw new Error('Version not found, please provide distFile');
    versionDetail = await client.createVersion(addonId, channel, distFile, {
      sourceFile,
      approvalNotes,
      releaseNotes,
      compatibility,
    });
  } else {
    versionDetail = await client.updateVersion(addonId, versionDetail, {
      sourceFile,
      approvalNotes,
      releaseNotes,
      override,
    });
  }
  if (!output && channel === 'listed') {
    return versionDetail.file.url.slice(
      versionDetail.file.url.lastIndexOf('/') + 1,
    );
  }

  log('Starting polling for the signed file');
  const signedFile = await poll(
    async (i) => {
      log('Polling %s', i);
      const file = await client.getSignedFile(addonId, addonVersion);
      if (!file) throw new ProcessingError('The file has not been signed yet');
      return file;
    },
    pollInterval,
    isNewVersion ? pollRetry : pollRetryExisting,
    !isNewVersion,
  );
  return client.downloadFile(signedFile.url, output);
}
