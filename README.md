# Vin Perfume

Static perfume storefront with product filters, bottle sizes, a shopping cart, ABA QR payment instructions, and receipt upload.

## Files

- `index.html`: storefront and checkout JavaScript.
- `catalog.js`: initial/fallback catalog; online updates come from the catalog API.
- `admin.html`, `inventory-api.js`: product, stock and promotion manager sources.
- `img/`: perfume photos and payment QR image.

## Preview

Open `index.html` in a browser to review the storefront. Use a local HTTP server when testing network features.

## Existing order service

The storefront sends orders and receipt images to a Cloudflare Worker configured in `SHOP.orderEndpoint`. The generated `cloudflare-inventory-worker.js` adds an authenticated admin page and D1 catalog API to that receiver. Follow `SHOP-MANAGER-SETUP.md` to configure the database and deploy. Stock is maintained manually after bank verification. Never put passwords or bot tokens in browser code.

## Render static site

Connect this repository as a Static Site, use no build command, and set the publish directory to `.`. Orders continue to depend on the configured external Worker; its cross-origin settings must permit the new storefront address.
