import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { basename, join } from 'path';
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

class FatalError extends Error {}

async function poll<T>(
  check: () => Promise<T>,
  interval = 3000,
  maxRetry = 10
) {
  let lastError: unknown;
  for (let i = 0; i < maxRetry; i += 1) {
    await delay(interval);
    try {
      return await check();
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
    public apiPrefix = 'https://addons.mozilla.org'
  ) {
    if (!apiKey || !apiSecret) {
      throw new Error('apiKey and apiSecret are required');
    }
  }

  updateToken(force = false, ttl = 60) {
    const now = Date.now();
    if (this.tokenExpire < now || force) {
      const token = this.getJWT(ttl);
      this.headers.Authorization = `JWT ${token}`;
      // Refresh token a few seconds before it really expires
      this.tokenExpire = now + ttl - 10;
    }
  }

  fetch(url: string, opts?: RequestInit) {
    this.updateToken();
    return fetch(url, {
      ...opts,
      headers: {
        ...this.headers,
        ...opts?.headers,
      },
    });
  }

  async request<T = unknown>(url: string, opts?: RequestInit) {
    const res = await this.fetch(this.apiPrefix + url, opts);
    const data = (await res.json()) as T;
    if (!res.ok) throw { res, data };
    return data;
  }

  async uploadFile(distFile: string, channel: ChannelType) {
    const formData = new FormData();
    formData.set('upload', await fileFrom(distFile), basename(distFile));
    formData.set('channel', channel);
    const { uuid }: UploadResponse = await this.request(
      '/api/v5/addons/upload/',
      {
        method: 'POST',
        body: formData,
      }
    );
    await poll(async () => {
      const data: UploadResponse = await this.request(
        `/api/v5/addons/upload/${uuid}/`
      );
      if (!data.processed) throw new Error('Not processed yet');
      if (!data.valid) throw new FatalError('Not valid');
    });
    return uuid;
  }

  async createVersion(
    addonId: string,
    channel: ChannelType,
    distFile: string,
    sourceFile?: string
  ) {
    const uploadUuid = await this.uploadFile(distFile, channel);
    const formData = new FormData();
    if (sourceFile) {
      formData.set('source', await fileFrom(sourceFile), basename(sourceFile));
    }
    formData.set('upload', uploadUuid);
    const versionInfo: VersionInfo = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/`,
      {
        method: 'POST',
        body: formData,
      }
    );
    return versionInfo;
  }

  async updateVersion(
    addonId: string,
    versionInfo: VersionInfo,
    sourceFile: string
  ) {
    const formData = new FormData();
    formData.set('source', await fileFrom(sourceFile), basename(sourceFile));
    const updated: VersionInfo = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/${versionInfo.id}`,
      {
        method: 'PATCH',
        body: formData,
      }
    );
    return updated;
  }

  async getVersions(addonId: string) {
    const result: VersionListResponse = await this.request(
      `/api/v5/addons/addon/${addonId}/versions/?filter=all_with_unlisted`
    );
    return result;
  }

  async getVersionStatus(addonId: string, version: string) {
    const result: VersionStatus = await this.request(
      `/api/v5/addons/${addonId}/versions/${version}/`
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
  addonId,
  addonVersion,
  channel = 'listed',
  distFile,
  sourceFile,
  output,
  pollInterval = 15000,
  pollRetry = 4,
}: SignAddonParam) {
  const client = new AMOClient(apiKey, apiSecret);
  let signedFile: FileInfo;

  try {
    signedFile = await client.getSignedFile(addonId, addonVersion);
  } catch (err) {
    if (err.res.status !== 404) throw err;
  }

  if (!signedFile) {
    if (!distFile)
      throw new Error('Version not found, please provide distFile');
    await client.createVersion(addonId, channel, distFile, sourceFile);
  } else if (sourceFile) {
    const versionInfo = await client.findVersion(addonId, addonVersion);
    if (!versionInfo.source) {
      await client.updateVersion(addonId, versionInfo, sourceFile);
    }
  }

  signedFile = await poll(
    async () => {
      const file = await client.getSignedFile(addonId, addonVersion);
      if (!file) throw new Error('file not signed yet');
      return file;
    },
    pollInterval,
    pollRetry
  );
  return client.downloadFile(signedFile.download_url, output);
}
