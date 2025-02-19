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

1. Install dependencies via `npm install`
2. Start the local server and compile resources via `npm start`. This will open a browser tab for you at localhost:3000.

# Requesting Pedals

**Before you submit a request, please consider the following:**

-   New releases from all major builders will be added to the database automatically -- no need to request them,
-   We are not accepting requests for alternative colorways to help keep the project size manageable,
-   Check to see if your pedal request hasn't already been covered by a [pending pull](https://github.com/PedalPlayground/PedalPlayground.github.io/pulls),
-   Check if your pedal hasn't already been [requested by somebody else](https://github.com/PedalPlayground/PedalPlayground.github.io/issues).

**Requests must include the following:**

1.  Include the pedal brand and name in the title of your request,
2.  A high resolution image of the pedal (top-down view, straight on perspective),
3.  The dimensions of the pedal in inches (include jacks and other protrusions).

_Post a separate issue for each pedal that you are requesting._

[Submit a Pedal Request](https://github.com/PedalPlayground/PedalPlayground.github.io/issues)

****

Note: Even if your request has been completed and linked to a pull request it may still take several weeks for updates to get pulled into the main project.  The individual contributors have no control over that so please remain patient. If we haven't gotten to your request yet there is probably a good reason for it (insufficient image quality, lack of published dimensions, etc).
