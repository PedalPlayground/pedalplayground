# PedalPlayground

<!-- toc -->

- [Contributing Pedals/Pedalboards](#contributing-pedalspedalboards)
  - [Images](#images)
  - [Dimensions](#dimensions)
- [Running Locally](#running-locally)
  - [Pre-requisites](#pre-requisites)
    - [MacOS Notes](#macos-notes)
  - [Building](#building)
- [Requesting Pedals](#requesting-pedals)

<!-- tocstop -->

## Contributing Pedals/Pedalboards

### Images

- Find an image that is as close as possible to a perfect top-down angle,
  - **GIMP**: use the perspective tool to make any necessary adjustments,
  - **Photoshop**: use the free transform tools (perspective, skew) to make any necessary adjustments,
- White background is preferred for best cutout quality, but if not available just cut them out best as possible
- Isolate the pedal on a transparent background (do not cut off jacks or switches):
  - **GIMP**: open file, select magic wand tool and click background, Layer > Transparency > Add Alpha Channel, 
  then Layer > Transparency > Color to Alpha, and finally Ok in the dialog prompt.
  - **Photoshop**: open file, select magic wand tool (can help to adjust the tolerance to 12-18) and click background, Layer > Layer Mask > Hide Selection
  - You can also use <https://onlinepngtools.com/create-transparent-png>
- Crop the image to non-transparent pixels:
  - **GIMP**: Image > Crop to Content,
  - **Photoshop**: Image > Trim > Transparent Pixels.
- Save to **two places** with the following guidelines:
  - `/app/images/pedals` - Save for Web as PNG-24, make width **800px** or less (don't enlarge original image though)
  - `/public/images/pedals` - Save for web as PNG-24, make width **350px** or less
  - Please make sure file names use all lower-case letters and no spaces

### Dimensions

- Add the dimensions of the pedals you add to `/public/data/pedals.json`
- Input dimensions in inches, with decimals (rounding to nearest hundredth)
- Dimensions recorded should include any jacks and protrusions, otherwise your pedal may appear elongated or squished,
- If you have an official measurement for the side that has no protrusions, you can find the actual measurement of the side with jacks with just a bit of algebra:

    ```text
    ((a / b) * y) = x

    a = length of side in image with jacks in pixels
    b = length of side in image without jacks in pixels
    y = official measurement of side without jacks in inches
    ```

- To find the dimensions of your png:
  - **GIMP**: <kbd>Shift</kbd> + <kbd>S</kbd>
  - **Photoshop**: <kbd>Ctrl</kbd> + <kbd>I</kbd>

## Running Locally

### Pre-requisites

Install `node@10`, `bower`, and `gulp`

- To maintain multiple installations of `node`, install `nvm`
([Node Version Manager](https://github.com/nvm-sh/nvm)).
While working in this repo, execute `nvm install`, and it will
reference this repo's `.nvmrc` file which states version 10.24.1
(LTS version of Node v10).

#### MacOS Notes

Under MacOS Mojave:

```shell
brew install nvm
nvm install --lts 10
sudo npm install bower -g
sudo npm install gulp-cli -g
sudo npm rebuild node-sass -g
sudo npm install sharp -g
sudo npm install http-server -g
```

### Building

1. Install dependencies via `npm install`
2. Install client-side libraries via `bower install`
3. Compile assets and watch for changes via `gulp`
4. Start the local server via `npm run serve`. This will open a browser tab for you at localhost:8080.

## Requesting Pedals

If there is a pedal you're looking for, feel free to log an issue.
Please follow the following rules when posting request issues:

- Include a decent resolution image of the pedal (top-down view, white background)
- Include the dimensions, in inches (make sure the dimensions are accurate and include jacks and other protrusions)
- Post one issue for each pedal you're requesting
