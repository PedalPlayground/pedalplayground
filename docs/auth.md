# Sign-in: how it works and how to set it up

Sign-in is passwordless. The user enters their email, gets a **6-digit code** (plus a one-click link as a
backup), and enters the code. The code is the primary path because it works when the email is opened on a
different device or in an in-app browser, and because email security scanners (for example Microsoft
Defender Safe Links) can open links before the user does.

## In the app

- `Account` dialog: email, then code. Uses `signInWithOtp` and `verifyOtp({ email, token, type: "email" })`.
- Emailed link: `<Site URL>/?token_hash=…&type=email`. The app shows a **Finish signing in** dialog and only
  verifies the token when the user clicks. A scanner that loads the page therefore can't use the token up.
- The `token_hash` and `type` parameters are removed from the URL on load.

## Supabase setup (production project)

1. **Authentication → URL Configuration**
   - Site URL: the production origin, for example `https://pedalplayground.com` (no trailing slash; the
     email template appends `/?token_hash=…`).
   - Redirect URLs: the same origin, plus `http://localhost:5173` for development.
2. **Authentication → SMTP (custom SMTP)**: required before launch. The built-in sender only delivers to
   members of your Supabase organization and is limited to 2 emails per hour.
   - Use a sender on your domain (for example `login@pedalplayground.com`) and add the provider's
     SPF and DKIM DNS records, plus a DMARC record.
   - Turn off click/open tracking in the mail provider: tracking rewrites links and can break them.
3. **Authentication → Rate Limits**: raise the email limit above the 30 per hour default for expected traffic.
4. **Authentication → Email Templates**: paste `docs/auth-email-template.html` into **Magic Link** and
   **Confirm signup**. Use the subject suggested at the top of that file.
5. **Authentication → Providers → Email**: keep OTP length at 6 and choose an expiry you are comfortable
   with (shorter is safer; the default is one hour).

## Test before launch

- A brand-new email address (goes through *Confirm signup*) and an existing one (*Magic Link*). The link
  uses `type=email` for both; confirm each works, and if the new-user link fails, change that template's
  link to `type=signup`.
- Code entry on the same device, and on a different device from where the email is opened.
- A corporate Microsoft 365 mailbox with link scanning, a Gmail account, and a phone mail app.
- Reusing a code or link a second time should fail with a clear message.
- Requesting several codes in a row, to see the rate-limit behavior.

## Custom domain for the Supabase address (optional)

The Custom Domain add-on (paid projects) puts Supabase's own address on a subdomain you own. It isn't
needed for the emails above, because they link to your site, not to Supabase. Consider it only if you want
your domain on the API address too.
