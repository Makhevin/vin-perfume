# PayWay sandbox QR test

This stage adds a test tool to the existing admin page. It does not change the live customer payment flow, does not verify bank payment and does not mark orders paid.

## Credentials

Use only the credentials from the same PayWay sandbox registration email. On `bold-unit-5143`, save these as encrypted Secrets:

- `PAYWAY_MERCHANT_ID`: sandbox Merchant ID.
- `PAYWAY_API_KEY`: the signing credential labelled Public Key in the email; not RSA Public Key or RSA Private Key. If PayWay rejects the signature, confirm this credential with ABA instead of trying RSA material.

Never put these values in the repository, browser code or chat. Preserve DB, admin and Telegram configuration.

## Deploy and test

1. Replace `bold-unit-5143` Worker code with the updated `cloudflare-inventory-worker.js` and Deploy. No storefront upload is required for this sandbox tool.
2. Open `https://bold-unit-5143.sengmakhevin.workers.dev/admin` in a browser and sign in.
3. Select a product and publish any unsaved changes first.
4. At the bottom of the product editor, expand **PayWay sandbox test**.
5. Click **Generate sandbox payment**. The server uses the published default size, quantity 1, active discount and $2 delivery. Browser-provided amounts are ignored.
6. Verify that the sandbox response amount matches the product total. The returned ABA link comes from PayWay itself, not from a hand-built merchant deeplink.
7. Follow ABA's sandbox payment testing instructions. The UI does not confirm or capture payment. Do not use a test QR to collect real customer payments.

The provider URL is fixed to `checkout-sandbox.payway.com.kh`. Production cannot be enabled by changing a frontend query string or environment variable in this version.

## Remaining before real payments

Obtain production approval/credentials from ABA, configure any required origin/IP restrictions, add a durable order/payment record and independently verify transaction status and matching amount/currency before marking an order paid. Treat callback notifications only as a signal to verify, not proof of payment. Then test and explicitly enable the customer-facing production checkout.

## References

- https://developer.payway.com.kh/qr-api-14530840e0
- https://developer.payway.com.kh/qr-api-14530840e0.md

Request signatures use Base64(HMAC-SHA512(concatenated fields, signing key)). Field order follows the official QR API specification, and timestamps use UTC.
