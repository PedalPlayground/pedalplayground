# Contributing

## Images

-   Find an image that is as close as possible to a perfect top-down angle.
    -   You can make it perfectly top-down/rectangular using GIMP perspective tool.
-   White background is preferred for best cutout quality, but if not available just cut them out best as possible
-   Isolate the pedal on a transparent background (do not cut off jacks or switches). In GIMP (2.10), open file, select magic wand tool and click background, Layer > Transparency > Add Alpha Channel, then Layer > Transparency > Color to Alpha, and finally Ok in the dialog prompt.
    You can also use https://onlinepngtools.com/create-transparent-png
-   Crop the image to non-transparent pixels (in Photoshop Image > Trim > Transparent Pixels, in Gimp Image -> Crop to Content)
-   Save to two places with the following guidelines:
    -   `/app/images/pedals` - Save for Web as PNG-24, make width 800px or less (don't enlarge original image though)
    -   `/public/images/pedals` - Save for web as PNG-24, make width 350px or less
    -   Please make sure file names use all lower-case letters and no spaces

## Dimensions

-   Add the dimensions of the pedals you add to `/public/data/pedals.json`
-   Input dimensions in inches, with decimals (rounding to nearest hundredth)
-   Dimensions recorded should include jacks and switches (if possible, most placed don't specify wether or not measurements do or do not)

## Running Locally

0. Install node v10

1. Install dependencies
   * `npm install`

2. Install client-side libraries
   * `npm run bower install`

3. Compile assets and watch for changes
   * `npm run gulp`

4. Start the local server
   * `npm run serve`
   * This will open a browser tab for you at localhost:8080.

### MacOS Notes

Under MacOS Mojave:

-   brew install node@10 bower
-   sudo npm install gulp-cli -g;
-   sudo npm rebuild node-sass -g
-   sudo npm install sharp -g;
-   sudo npm install http-server -g

# Requesting Pedals

If there is a pedal you're looking for, feel free to log an issue. Please follow the following rules when posting request issues:

-   Include a decent resolution image of the pedal (top-down view, white background)
-   Include the dimensions, in inches (make sure the dimensions are accurate and include jacks and other protrusions)
-   Post one issue for each pedal you're requesting
