# amo-upload

![NPM](https://img.shields.io/npm/v/amo-upload.svg)
![License](https://img.shields.io/npm/l/amo-upload.svg)
![Downloads](https://img.shields.io/npm/dt/amo-upload.svg)

Upload your web extension to [AMO](https://addons.mozilla.org/) and get the download URL after being signed.

Note: This package requires Node.js >= 14 and only provides ES module, see [here](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c) for more details.

## Highlights

- Upload zipped extension file
- Optionally upload source code for review
- Can run multiple times, friendly to CI

## Usage

### Command-line

```bash
$ npx amo-upload \
  --api-key $API_KEY \
  --api-secret $API_SECRET \
  --addon-id $ADDON_ID \
  --addon-version $VERSION \
  --channel listed \
  --dist-file path/to/dist.zip \
  --source-file path/to/source.zip
  --output path/to/my-ext-v1.2.3.xpi
```

For `listed` channel, we don't wait for the signed package if no `output` is specified. The output will be the filename of the package.

For `unlisted` channel, we will wait for the package to be signed. After the signed file is downloaded, the path of the downloaded file will be printed to the console. Otherwise an error will be thrown.

### API

```js
import { signAddon } from 'amo-upload';

try {
  const output = await signAddon({
    apiKey,
    apiSecret,
    addonId,
    addonVersion,
    channel: 'listed',
    distFile: 'path/to/dist.zip',
    sourceFile: 'path/to/source.zip',
    output: 'path/to/my-ext-v1.2.3.xpi',
  });
  console.info('The signed file is stored at:', output);
} catch (err) {
  console.error('File not signed yet');
}
```
