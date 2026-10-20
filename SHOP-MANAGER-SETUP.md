# Vin Perfume online shop manager

Prepared locally; Cloudflare database, secrets and deployment still need setup.

## Activate in this order

1. In Cloudflare, open Storage & databases → D1 SQL Database → Create database. Name it `vin-perfume-stock`.
2. Open that database's Console and run the contents of `inventory-schema.sql`.
3. Open Workers & Pages → `bold-unit-5143` → Bindings → Add binding → D1 database. Use variable name `DB`, and select `vin-perfume-stock`.
4. In the same Worker's Production Variables and Secrets, add `ADMIN_PASSWORD` as a Secret (at least 12 characters), and `ADMIN_SESSION_SECRET` as a Secret (at least 32 random characters). Keep both private. Preserve existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
5. In Edit code, replace the entire Worker with `cloudflare-inventory-worker.js`, then Deploy. This bundled file includes the admin UI, catalog API and Telegram order receiver. Do not paste `inventory-api.js` or `admin.html` separately.
6. Open `https://bold-unit-5143.sengmakhevin.workers.dev/admin` in a full browser. Sign in with your admin password. The initial catalog contains your 56 existing products; stock is initially unknown, not a fabricated quantity.
7. Set actual stock counts and verify prices, then Publish changes.
8. Upload the updated `cloudflare-upload` folder to your storefront Worker `vperfume`. It includes `catalog.js` and `catalog-rules.js` as well as the existing storefront assets. Keep the database and backend Worker separate from this upload.
9. Verify product availability, discounted cart totals, and one clearly marked test order. Do not make a payment just to verify message delivery.

## Day-to-day use

- **Add product:** New product → enter brand, name, image URL, descriptions, size, price and stock → Apply to draft → Publish changes.
- **Stock:** enter a whole quantity for each size. `0` disables purchases for that size. Blank shows “Confirm availability”. Stock is updated manually after you verify a sale; receipt uploads do not deduct it.
- **Discount:** enter a percentage (0–90), optionally choose start and end times, then Publish changes. The entered times use the admin computer's local timezone and are stored as UTC. Both customer prices and backend order validation use the promotion dates.
- **New photo:** click Upload photo and choose an image from your phone or computer. Admin resizes it to a JPEG under 800 KB, stores it in the existing D1 database, and fills the image URL automatically. Click Publish changes to associate it with the live product. The product_photos table is created automatically on the first upload. Existing image URLs continue to work.
- **Back up:** Download backup saves a JSON catalog copy. D1 is the live catalog source; GitHub's `catalog.js` is only the initial/fallback catalog.
- **Confirm payments:** check your bank account before shipping. Order receipt uploads are not proof of received payment. Inventory is not automatically reserved, so confirm availability with customers before they pay.
- **Sessions:** login lasts 8 hours. Signing out clears the browser's cookie. Changing `ADMIN_SESSION_SECRET` invalidates existing sessions.

## Development

After editing admin UI or backend sources, run `node build-inventory-worker.cjs`, then `node verify-inventory.cjs` and `node verify-checkout.cjs` before deploying the generated Worker.

Do not rerun the one-time `prepare-catalog.cjs` migration against the migrated storefront. Never put real passwords, session secrets or Telegram tokens in source files.
