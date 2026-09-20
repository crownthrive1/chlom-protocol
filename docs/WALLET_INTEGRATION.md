# CHLOM wallet integration

Wallet connection is a CHLOM core capability exposed from the core console. The optional LEX application may consume the same adapter; the wallet is not defined by the marketplace. Core operator authentication and a wallet-control observation are independent identities and do not implicitly bind one another.

The core console exposes `/#wallet` and uses the same-origin `/api/wallet` adapter. The optional LEX view lives at `/lex#wallet`. Browser-injected EVM wallets are discovered using EIP-6963, with an EIP-1193 legacy fallback. Connection requires an explicit user action. The interface reads the selected account, chain and native balance, supports an explicit Base network-switch request, and clears observations on account changes, network changes and disconnect.

## Installation

Install the pinned dependencies with `npm ci`. Set `CHLOM_WALLET_CHALLENGE_SECRET` to a cryptographically random server-only value of at least 32 bytes. A 32-byte random value encoded as hexadecimal is suitable. Configure it consistently across instances of the same deployment; do not put it in browser code, source control or public documentation. Rotating it invalidates outstanding challenges. No wallet private key or seed phrase is required.

`GET /api/wallet?route=status` reports `proof_verification: true` only when a sufficiently long challenge secret is configured. Connection works without that secret; challenge generation and proof verification fail closed with HTTP 503.

## Verification sequence

1. Connect a browser wallet.
2. Select **Prepare verification**. The server creates a random challenge bound to the exact HTTPS origin, selected address and chain. Its expiry is five minutes.
3. Review the exact message shown in the page, then select **Sign wallet-control message**. The wallet requests an EIP-191 `personal_sign` signature; the interface never requests a transfer or token approval.
4. The server reconstructs the message from its HMAC-protected Secure, HttpOnly, SameSite=Strict challenge cookie and recovers the signer using ethers 6.17.0. A successful response provides a short-lived wallet-control observation and clears the browser cookie.

Only ordinary EVM externally owned account signatures are verified by this implementation. EIP-1271 smart-contract wallet signatures, WalletConnect QR/relay pairing and MetaMask embedded wallets are not activated by this change.

## Precise security boundary

The response is an observation of signature control. It does not authenticate a cloud account, persist a wallet-account association, grant rights, create an entitlement, authorize payment, issue tokens, or enable token settlement. Neither a signature nor the wallet address is stored by this application in localStorage or in a database. Operational hosting logs remain subject to the hosting configuration.

The cookie is stateless. Copying a valid cookie and signature can reproduce the same observation until expiry; clearing the browser cookie does not constitute distributed one-time nonce consumption. The API therefore declares `one_time_nonce: false` and `account_authenticated: false`. Any future use for sign-in, account binding or access control must first add a durable atomic nonce-consumption store and the corresponding account/authority checks.

The in-process request limiter is a local instance throttle, not a globally coordinated quota. Deployment operators may add an external rate limiter without changing the proof contract.

## API

| Route | Method | Result |
| --- | --- | --- |
| `?route=status` | GET | Configuration and integration scope |
| `?route=challenge` | POST | Exact message and expiry for `{address, chain_id}` |
| `?route=verify` | POST | Signature observation for `{signature}` and the challenge cookie |
| `?route=disconnect` | POST | Clear the browser challenge cookie |

All POST requests require the same HTTPS origin. JSON requests are limited to 4 KiB. Challenges fail on tampering, wrong origin, expiry, invalid address or chain, invalid signature, or a recovered address different from the selected account.

## Verification

Run `node --test tests/wallet-proof.test.mjs tests/wallet-client.test.mjs`. Tests use real cryptographic signing and recovery plus a controlled EIP-1193 provider. These tests do not prove a real wallet extension or mobile wallet has completed a production user journey.

Primary implementation references: [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), and [ethers signature recovery](https://docs.ethers.org/v6/api/hashing/).
