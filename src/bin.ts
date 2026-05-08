import { program } from 'commander';
import { Table } from 'console-table-printer';
import { dirname } from 'node:path';
import { readPackageUp } from 'read-package-up';
import { AMOClient, signAddon } from '.';
import type {
  ChannelType,
  CompatibilityInfo,
  VersionListRequest,
} from './types';

const pkg = await readPackageUp({
  cwd: dirname(new URL(import.meta.url).pathname),
});
if (!pkg) throw new Error('Could not find package.json');

program
  .name('amo-upload')
  .description('CLI to communicate with AMO server')
  .option('--api-key <apiKey>', 'API key from AMO')
  .option('--api-secret <apiSecret>', 'API secret from AMO')
  .option(
    '--api-url-prefix <apiPrefix>',
    'the API URL prefix, https://addons.mozilla.org if unspecified',
  )
  .option('--addon-id <addonId>', 'addon UUID which can be found in AMO')
  .configureHelp({ showGlobalOptions: true })
  .version(pkg.packageJson.version);

program
  .command('sign')
  .description(
    `Upload a new version for signing, check the status and download the signed file.
This command could be run multiple times to check the status, and the version will not be uploaded repeatedly.`,
  )
  .option('--addon-version <addonVersion>', 'the version to create or query')
  .option(
    '--channel <channel>',
    'the version channel, either "listed" or "unlisted"',
    'listed',
  )
  .option(
    '--dist-file <distFile>',
    'the dist file to upload, should be a zip file',
  )
  .option(
    '--source-file <sourceFile>',
    'the source file to upload, should be a zip file',
  )
  .option(
    '--approval-notes <approvalNotes>',
    'the information for Mozilla reviewers',
  )
  .option(
    '--release-notes <releaseNotes>',
    'the release notes for this version',
  )
  .option(
    '--compatibility <jsonString>',
    'the compatibility info as a JSON string, e.g. `["android","firefox"]`',
  )
  .option(
    '--throttled-retry <maxTime>',
    'when a 429 throttled error occurs, if a retry is possible within maxTime, the request will wait for a certain period before being re-requested. e.g. 120',
  )
  .option('--output <output>', 'the file path to save the signed XPI file')
  .action(
    wrapError(async (_, command) => {
      const options = {
        ...loadFromEnv(),
        ...command.optsWithGlobals(),
      };
      verifyKeys(options, ['apiKey', 'apiSecret', 'addonId', 'addonVersion']);
      const downloadedFile = await signAddon({
        apiKey: options.apiKey as string,
        apiSecret: options.apiSecret as string,
        apiPrefix: options.apiPrefix as string,
        addonId: options.addonId as string,
        addonVersion: options.addonVersion as string,
        channel: options.channel as ChannelType,
        distFile: options.distFile as string,
        sourceFile: options.sourceFile as string,
        approvalNotes: options.approvalNotes as string,
        releaseNotes: {
          'en-US': options.releaseNotes as string,
        },
        compatibility: options.compatibility
          ? (JSON.parse(options.compatibility) as CompatibilityInfo)
          : undefined,
        throttledRetry: options.throttledRetry as number ?? 0,
        output: options.output as string,
      });
      console.info(downloadedFile);
    }),
  );

program
  .command('list')
  .description('List remote versions')
  .option(
    '--filter <filter>',
    'One of `all_without_unlisted`, `all_with_unlisted`, and `all_with_deleted`',
  )
  .option('-p, --page <page>', 'page number to query')
  .option('--page-size <pageSize>', 'page size to query')
  .action(
    wrapError(async (_, command) => {
      const options = {
        ...loadFromEnv(),
        ...command.optsWithGlobals(),
      };
      verifyKeys(options, ['apiKey', 'apiSecret', 'addonId']);
      const client = new AMOClient(
        options.apiKey,
        options.apiSecret,
        options.apiPrefix,
      );
      const page = options.page ?? 1;
      const pageSize = options.pageSize ?? 25;
      const params: VersionListRequest = {
        page,
        page_size: pageSize,
      };
      if (options.filter) params.filter = options.filter;
      const { results, count } = await client.getVersions(
        options.addonId,
        params,
      );
      const start = (page - 1) * pageSize + 1;
      const end = start + results.length - 1;
      const rows = results.map((item) => ({
        Channel: item.channel,
        Version: item.version,
        Status: {
          public: '✅',
          disabled: '🚫',
          unreviewed: '❔',
        }[item.file.status],
        Review:
          item.channel === 'listed'
            ? ''
            : item.file.status === 'public'
              ? '✅'
              : '👀',
        Source: item.source ? '📎' : '',
        Compatibility: Object.keys(item.compatibility).join('|'),
      }));
      console.info(`Listing ${start}-${end}/${count}`);
      const table = new Table({
        charLength: {
          '✅': 2,
          '🚫': 2,
          '❔': 2,
          '👀': 2,
          '📎': 2,
        },
      });
      table.addRows(rows);
      table.printTable();
    }),
  );

program.parse();

function wrapError<T extends unknown[], U>(fn: (...args: T) => Promise<U>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  };
}

function verifyKeys(options: Record<string, string>, keys: string[]) {
  const missingKeys = keys.filter((key) => !options[key]);
  if (missingKeys.length) {
    throw new Error(
      'The following options are missing but required: ' +
        missingKeys.join(', '),
    );
  }
  return options;
}

function loadFromEnv() {
  return {
    apiKey: process.env.AMO_KEY,
    apiSecret: process.env.AMO_SECRET,
    apiUrlPrefix: process.env.AMO_URL_PREFIX,
    addonId: process.env.AMO_ADDON_ID,
  };
}
