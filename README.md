# Pedal Playground

Plan your pedalboard at [pedalplayground.com](https://pedalplayground.com). This repository holds the web
app (in `web/`) and the catalog of pedals and pedalboards that contributors add to.

- [Adding a pedal](#adding-a-pedal)
- [Requesting a pedal](#requesting-a-pedal)
- [Running the app locally](#running-the-app-locally)

# Adding a pedal

A new pedal is two things: an image in `public/images/pedals/` and an entry in `public/data/pedals.json`.
Pedalboards work the same way, with `public/images/pedalboards/` and `public/data/pedalboards.json`.

> [!NOTE]
> **Changes from the old site:** save the image to `public/images/pedals/` only, and at a high resolution
> (see below). The `app/images/pedals/` folder belonged to the old site and isn't used anymore, so please
> don't add files there. Open pull requests against the `beta` branch.

## 1. Make the image

- Find an image that is as close as possible to a perfect top-down angle.
  - GIMP: use the perspective tool to make any adjustments.
  - Photoshop: use the Camera Raw (`shift + ctrl + a`) perspective tool (`shift + t`).
- A white background gives the cleanest cutout, but cut out whatever you have as well as you can.
- Put the pedal on a transparent background, and don't cut off jacks or switches.
  - GIMP: open the file, click the background with the magic wand, then Layer > Transparency > Add Alpha
    Channel, Layer > Transparency > Color to Alpha, and Ok.
  - Photoshop: click the background with the magic wand (a tolerance of 12 to 18 helps), then
    Layer > Layer Mask > Hide Selection.
  - Or use https://onlinepngtools.com/create-transparent-png
- Crop to the pedal itself.
  - GIMP: Image > Crop to Content.
  - Photoshop: Image > Trim > Transparent Pixels.
- Save it as a PNG with transparency (PNG-24) to `public/images/pedals/`.

**Size:** aim for about **1200 px on the longest side** (don't enlarge a smaller original). The site makes its
own smaller copies, so a big source image never slows anything down, and it keeps pedals sharp when people zoom
in. The hard limits are:

- at least **60 px per inch** of the pedal's width (a 3 in wide pedal needs at least 180 px), and
- no more than **3 MB**.

**Filename:** lowercase letters, digits and hyphens only, as `brand-name.png`, for example
`boss-ds1.png` or `jhs-3-series-pherb.png`. If two pedals differ only by edition or color, say so in the
filename (`keeley-tube-drive-ge-12ax7a-pink.png`), not with a stray hyphen.

## 2. Add the entry

Add an entry to `public/data/pedals.json`, in alphabetical order by brand and then name:

```json
{
	"Brand": "BOSS",
	"Name": "DS-1",
	"Width": 2.875,
	"Height": 5.125,
	"Image": "boss-ds1.png"
}
```

- `Width` and `Height` are the real size of the pedal in **inches**, seen from above, rounded to the nearest
  hundredth. Include jacks, knobs and anything else that sticks out, or the pedal will look stretched or squished.
- The image's width-to-height ratio should match `Width` : `Height`, because the site stretches the image to
  the entry's size.
- `Name` should be what a player would search for. If there are several editions, make the difference obvious
  in the name, like `Tube Drive (1984 GE 12AX7A/7025, Pink)` and `Tube Drive (1984 GE 12AX7A/7025, Silver)`.
  Two entries whose names differ only by a space are confusing in search.

**Working out a side with jacks:** if the maker only gives the measurement without jacks, measure both sides of
your image in pixels and scale:

```
x = (a / b) * y

a = length in pixels of the side with jacks
b = length in pixels of the side without jacks
y = official measurement in inches of the side without jacks
```

To see an image's size in pixels: GIMP `shift + s`, Photoshop `ctrl + i`.

**Optional specs:** pedals can also list power and type. The site uses these for the equipment list, so add them
when the maker publishes them:

```json
{
	"Brand": "BOSS",
	"Name": "DS-1",
	"Width": 2.875,
	"Height": 5.125,
	"Image": "boss-ds1.png",
	"Current": 10,
	"Voltage": "9V DC",
	"Type": "Distortion"
}
```

- `Current`: current draw in milliamps, as a whole number.
- `Voltage`: one of `9V DC`, `12V DC`, `18V DC`, `24V DC`, `9V AC`, `12V AC`, `5V USB`.
- `Type`: one of `Boost`, `Overdrive`, `Distortion`, `Fuzz`, `Compressor`, `EQ`, `Modulation`, `Delay`, `Reverb`,
  `Pitch`, `Filter / Wah`, `Looper`, `Multi-Effect`, `Amp / Preamp`, `Tuner`, `Volume / Expression`,
  `Noise Gate`, `Utility`, `Other`.

## 3. Don't rename or remove existing images

Saved pedalboards point at pedals by their image filename. Renaming or deleting an existing image file breaks
every board that uses it. Fixing a typo in an existing `Name` is fine. To replace a bad image, save the new one
over the old file under the same name.

## 4. Check your work

You need [Node.js](https://nodejs.org) 22.

```bash
cd web
npm ci                      # first time only
npm run catalog:validate
```

This checks every entry and image: required fields, filenames, missing images, duplicates, resolution, file size,
and whether the image's shape matches the dimensions. It only fails on problems your change adds. Older problems
are listed in `web/scripts/catalog/baseline.json` and don't block you. Warnings are advice, not failures.

The same check runs on every pull request.

To see your pedal in the app before opening a pull request:

```bash
cd web
npm run catalog:build       # makes the site's copies of the images
npm run dev                 # opens the app at http://localhost:5173
```

## 5. Open a pull request

- Open it against the **`beta`** branch.
- List the pedals you added, and link any requests it covers with `closes #1234`.

Once it's merged, the pedals show up on [beta.pedalplayground.com](https://beta.pedalplayground.com) within a few
minutes, and on pedalplayground.com with the next release.

For how the catalog is built and served, see [docs/catalog.md](docs/catalog.md).

# Requesting a pedal

:warning: **Before you submit a request, please check:**

- New releases from all major builders are added automatically, so there's no need to request them.
- We don't take requests for other colorways, to keep the project a manageable size.
- Your pedal isn't already in a [pending pull request](https://github.com/PedalPlayground/pedalplayground/pulls).
- Your pedal hasn't already been [requested by someone else](https://github.com/PedalPlayground/pedalplayground/issues).

:warning: **A request must include:**

1. The pedal's brand and name in the title.
2. A high-resolution image of the pedal (top-down, straight-on).
3. The pedal's dimensions in inches, including jacks and other protrusions.

:warning: Open a separate issue for each pedal.

:sparkle: [Submit a pedal request](https://github.com/PedalPlayground/pedalplayground/issues/new)

> [!IMPORTANT]
> Even after a request is done and linked to a pull request, it can take a while to reach the live site. The
> contributors don't control release timing, so please be patient.

> [!IMPORTANT]
> If we haven't gotten to your request yet, there's usually a reason, like the image quality isn't good enough or
> the dimensions aren't published.

# Running the app locally

```bash
cd web
npm ci
npm run catalog:build
npm run dev
```

Sign-in and saving to the cloud need Supabase settings in `web/.env.local`. Everything else works without them.
