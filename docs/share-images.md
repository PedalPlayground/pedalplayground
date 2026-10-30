# Link previews for shared playgrounds

When someone posts a share link (`https://pedalplayground.com/?p=<slug>`) on social media or in a chat app, the
preview shows that playground: its layout on the dark canvas, its name and the logo, at 1200×630.

## How it works

- **The app draws the image** (`web/src/lib/shareImage.ts`) and uploads it to the public Supabase Storage bucket
  `share-images` as `<slug>.jpg`. It does this when a playground is shared, about 10 seconds after edits to a shared
  playground settle, and when a shared playground is opened (so boards shared before this feature get one). Stop
  Sharing deletes the image.
- **nginx points the link at it.** Link previewers don't run JavaScript, so they only see `index.html`. For `?p=<slug>`
  requests, nginx rewrites the `og:image`, `twitter:image` and `og:url` tags in that file. Any other URL keeps the
  default `social.jpg`. The slug must be lowercase letters and digits, so nothing else from the URL reaches the page.

Previews are cached by each site (Facebook, iMessage and others keep them for days), so a link posted before an edit
keeps its old picture.

## Setup (once)

1. **Supabase → SQL Editor:** paste and run `supabase/migrations/20261030000000_share_images.sql`. It creates the
   bucket and the rules that let only a playground's owner write its image. Safe to run again.
2. **Forge → the live `pedalplayground.com` site → nginx config.** Edit the per-domain file only (rules in both files
   clash). Copy the whole file somewhere first as the rollback.

   a. At the very top of the file, **above** `server {`, add the two maps. Replace `YOUR-PROJECT` with the Supabase
      project URL's host (the same value as `VITE_SUPABASE_URL` in the GitHub settings):

   ```nginx
   # Link previews for shared playgrounds (docs/share-images.md).
   map $arg_p $pp_share_image {
       "~^(?<pp_slug>[a-z0-9]{4,32})$"  "https://YOUR-PROJECT.supabase.co/storage/v1/object/public/share-images/$pp_slug.jpg";
       default                          "https://pedalplayground.com/social.jpg";
   }
   map $arg_p $pp_share_url {
       "~^(?<pp_slug>[a-z0-9]{4,32})$"  "https://pedalplayground.com/?p=$pp_slug";
       default                          "https://pedalplayground.com/";
   }
   ```

   b. Inside `server { … }`, next to the `gzip` lines, add:

   ```nginx
   sub_filter_once off;
   sub_filter 'content="https://pedalplayground.com/social.jpg"' 'content="$pp_share_image"';
   sub_filter '<meta property="og:url" content="https://pedalplayground.com/"' '<meta property="og:url" content="$pp_share_url"';
   ```

   c. Make sure the `location /` fallback keeps the query string, so the rule also works on reloads of deeper paths:

   ```nginx
   location / {
       try_files $uri $uri/ /index.html?$query_string;
   }
   ```

   Save, then **Restart Nginx** from the server's "..." menu (saving alone doesn't reload it). If anything looks
   unchanged, check the nginx error log for `[emerg]`.

These rules were tested on nginx 1.24: a valid slug swaps the tags, a missing or bad `p` (including one with quotes or
HTML) keeps the defaults, and it works with gzip on.

## Check it

1. Share a playground, then open `https://pedalplayground.com/?p=<slug>` with View Source. The `og:image` should be the
   Supabase URL, and opening that URL shows the picture.
2. Paste the link into the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) or
   [opengraph.xyz](https://www.opengraph.xyz/) to see the preview. "Scrape Again" in Facebook's debugger refreshes a
   cached one.

## Later

The preview title stays "Pedal Playground"; the playground's name is in the picture. A title like "Trav's board"
would need a server (for example a Supabase Edge Function) answering previewers with the playground's details.
