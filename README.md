# amo-upload

Upload your web extension to [AMO](https://addons.mozilla.org/) and get the download URL after being signed.

Note: This package requires Node.js >= 14 and only provides ES module, see [here] for more details.

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
```

### API

```js
import { signAddon } from 'amo-upload';

try {
  const url = await signAddon({
    apiKey,
    apiSecret,
    addonId,
    addonVersion,
    channel: 'listed',
    distFile: 'path/to/dist.zip',
    sourceFile: 'path/to/source.zip',
  });
  downloadSignedVersionAndPublish(url);
} catch (err) {
  console.error('File not signed yet');
}
```
