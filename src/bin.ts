import { program } from 'commander';
import { signAddon } from '.';
import type { ChannelType, CompatibilityInfo } from './types';

program
  .option('--api-key <apiKey>', 'API key from AMO')
  .option('--api-secret <apiSecret>', 'API secret from AMO')
  .option(
    '--api-url-prefix <apiPrefix>',
    'the API URL prefix, https://addons.mozilla.org if unspecified',
  )
  .option('--addon-id <addonId>', 'addon UUID which can be found in AMO')
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
  .option('--output <output>', 'the file path to save the signed XPI file')
  .action(
    wrapError(async (options) => {
      const missingKeys = [
        'apiKey',
        'apiSecret',
        'addonId',
        'addonVersion',
      ].filter((key) => !options[key]);
      if (missingKeys.length) {
        throw new Error(
          'The following options are missing but required: ' +
            missingKeys.join(', '),
        );
      }
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
        output: options.output as string,
      });
      console.info(downloadedFile);
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
