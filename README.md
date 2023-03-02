# Contributing

## Images

-   Find an image that is as close as possible to a perfect top-down angle,
    -   GIMP: use the perspective tool to make any necessary adjustments,
    -   Photoshop: use the camera raw (`shift + ctrl + a`) perspective tool (`'shift + t`) to make any necessary adjustments,
-   White background is preferred for best cutout quality, but if not available just cut them out best as possible
-   Isolate the pedal on a transparent background (do not cut off jacks or switches):
    -   GIMP: open file, select magic wand tool and click background, Layer > Transparency > Add Alpha Channel, then Layer > Transparency > Color to Alpha, and finally Ok in the dialog prompt.
    -   Photoshop: open file, select magic wand tool (can help to adjust the tolerance to 12-18) and click background, Layer > Layer Mask > Hide Selection
    -   You can also use https://onlinepngtools.com/create-transparent-png
-   Crop the image to non-transparent pixels:
    -   Gimp: Image > Crop to Content,
    -   Photoshop: Image > Trim > Transparent Pixels.
-   Save to **two places** with the following guidelines:
    -   `/app/images/pedals` - Save for Web as PNG-24, make width **800px** or less (don't enlarge original image though)
    -   `/public/images/pedals` - Save for web as PNG-24, make width **350px** or less
    -   Please make sure file names use all lower-case letters and no spaces

## Dimensions

-   Add the dimensions of the pedals you add to `/public/data/pedals.json`
-   Input dimensions in inches, with decimals (rounding to nearest hundredth)
-   Dimensions recorded should include any jacks and protrusions, otherwise your pedal may appear elongated or squished,
-   If you have an official measurement for the side that has no protrusions, you can find the actual measurement of the side with jacks with just a bit of algebra:
    ```
    ((a / b) * y) = x

    a = length of side in image with jacks in pixels
    b = length of side in image without jacks in pixels
    y = official measurement of side without jacks in inches
    ```
-   To find the dimensions of your png:
    -   GIMP: `shift + s`
    -   Photoshop: `ctrl + i`


## Running Locally

0. Install node v10, bower, and gulp
1. Install dependencies via `npm install`
2. Install client-side libraries via `bower install`
3. Compile assets and watch for changes via `gulp`
4. Start the local server via `npm run serve`. This will open a browser tab for you at localhost:8080.

### MacOS Notes

Under MacOS Mojave:

-   brew install node@10 bower
-   sudo npm install gulp-cli -g;
-   sudo npm rebuild node-sass -g
-   sudo npm install sharp -g;
-   sudo npm install http-server -g

# Requesting Pedals

If there is a pedal you're looking for, feel free to [log an issue](https://github.com/PedalPlayground/PedalPlayground.github.io/issues). Please keep the following guidelines in mind:

-   New releases from all popular builders are added automatically.  There is no need to make a request for those.
-   Double check to see if the pedal isn't already in the database.
-   Also check to see if the pedal hasn't already been included in a [pending pull](https://github.com/PedalPlayground/PedalPlayground.github.io/pulls) by one of our contributors.
-   We're sorry, but please no requests for alternate colorways.
-   Include a high resolution image of the pedal (top-down view, preferably white background, straight on perspective)
-   Include the dimensions of the pedal in inches (make sure the dimensions are accurate and include jacks and other protrusions)
-   Post one issue for each pedal you're requesting and **do not** bump/repost open issues
-   **Please remain patient**  Even if your request is marked to be closed it can still sometimes take several weeks for updates to get pulled into the main project.
