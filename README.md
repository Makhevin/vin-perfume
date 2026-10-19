# Vin Perfume

Static perfume storefront with product filters, bottle sizes, a shopping cart, ABA QR payment instructions, and receipt upload.

## Files

- `index.html`: page, styles, product catalog, and browser JavaScript.
- `img/`: perfume photos and payment QR image.

## Preview

Open `index.html` in a browser to review the storefront. Use a local HTTP server when testing network features.

## Existing order service

The storefront sends orders and receipt images to an existing Cloudflare Worker configured in `SHOP.orderEndpoint`. That service's source code is not included in this project copy. Hosting this storefront does not migrate the order service. Verify the Worker and Telegram configuration before launch. Never put Telegram bot tokens or other secrets in browser code.

## Render static site

Connect this repository as a Static Site, use no build command, and set the publish directory to `.`. Orders continue to depend on the configured external Worker; its cross-origin settings must permit the new storefront address.
