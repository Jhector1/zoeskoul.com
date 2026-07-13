# Certificate PDF font assets

The PDF renderer uses the same font families as the browser preview:
Inter, Playfair Display, and Great Vibes.

Run the supplied `apply_certificate_pdf_ui_parity.sh` setup script. It installs
pinned `@fontsource` packages and copies the five required WOFF files into this
directory so Next.js can trace and deploy them with the certificate API route.

Expected generated files:

- `inter-400.woff`
- `inter-700.woff`
- `inter-800.woff`
- `playfair-700.woff`
- `great-vibes-400.woff`
