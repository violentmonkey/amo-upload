import { program } from 'commander';
import { signAddon } from '.';
import type { ChannelType } from './types';

program
  .option('--api-key <apiKey>', 'API key from AMO')
  .option('--api-secret <apiSecret>', 'API secret from AMO')
  .option('--addon-id <addonId>', 'addon UUID which can be found in AMO')
  .option('--addon-version <addonVersion>', 'the version to create or query')
  .option('--channel <channel>', 'the version channel, either "listed" or "unlisted"', 'listed')
  .option('--dist-file <distFile>', 'the dist file to upload, should be a zip file')
  .option('--source-file <sourceFile>', 'the source file to upload, should be a zip file')
  .action(async (options) => {
    const missingKeys = ['apiKey', 'apiSecret', 'addonId', 'addonVersion'].filter(key => !options[key]);
    if (missingKeys.length) {
      throw new Error('The following options are missing but required: ' + missingKeys.join(', '));
    }
    const url = await signAddon({
      apiKey: options.apiKey as string,
      apiSecret: options.apiSecret as string,
      addonId: options.addonId as string,
      addonVersion: options.addonVersion as string,
      channel: options.channel as ChannelType,
      distFile: options.distFile as string,
      sourceFile: options.sourceFile as string,
    });
    console.info(url);
  });

program.parse();
