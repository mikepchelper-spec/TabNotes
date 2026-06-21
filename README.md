# TabNotes Public Site

Static public pages for Google OAuth and Chrome Web Store review.

Production target:

- https://tabnotes.atlaspcsupport.com/
- https://tabnotes.atlaspcsupport.com/app/ (mobile PWA, built from `apps/web`)
- https://tabnotes.atlaspcsupport.com/privacy/
- https://tabnotes.atlaspcsupport.com/terms/

Search Console verification file:

- https://tabnotes.atlaspcsupport.com/google8ef5d404fc100dff.html

Deploy the folder contents directly to the `gh-pages` branch used by GitHub Pages.
Build the PWA separately from `apps/web` with `VITE_GOOGLE_CLIENT_ID` configured, then publish the
generated web bundle under `/app/` on the same domain.
