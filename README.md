# pedal-playground

## Contributing

# Images

* Find an image that is as close as possible to a perfect top-down angle.
* White background is preferred for best cutout quality, but if not available just cut them out best as possible
* Isolate the pedal on a transparent background (do not cut off jacks or switches)
* Crop the image to non-transparent pixels (in Photoshop Image > Trim > Transparent Pixels, in Gimp Image -> Crop to Content)
* Save to two places with the following guidelines:
	* `/app/images/pedals` - Save for Web as PNG-24, make width 800px or less (don't enlarge original image though)
	* `/public/images/pedals` - Save for web as PNG-24, make width 350px or less

# Dimensions

* Add the dimensions of the pedals you add to `/public/data/pedals.json`
* Input dimensions in inches, with decimals (rounding to nearest hundredth)
* Dimensions recorded should include jacks and switches (if possible, most placed don't specify wether or not measurements do or do not)
