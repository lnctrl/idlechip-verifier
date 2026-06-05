# IdleChip Verifier

Public GPU verifier for [IdleChip](https://idlechip.com). Scans GPUs on your PC and syncs to **idlechip.com** (and preview hosts). Requires a **pairing code** from the website (proves you are signed in).

## Setup

1. Sign in at **https://idlechip.com**
2. Open **My GPUs** -> **Generate pairing code**
3. On your PC:

```powershell
npx idlechip-verifier pair --url https://idlechip.com --code XXXX-YYYY
npx idlechip-verifier scan
```

Credentials save to `%USERPROFILE%\.idlechip\verifier-credentials.json`.

## Commands

| Command | Purpose |
|---------|---------|
| `pair --url URL --code CODE` | One-time link to your signed-in account |
| `scan` | Detect GPUs and sync (requires pair) |
| `register [--gpu KEY]` | Register GPU on marketplace |
| `watch` | Re-scan + heartbeat every 60s |

## Security

- CLI only calls **idlechip.com**, **idlechip.vercel.app**, and localhost (dev)
- Sync/register/heartbeat require a **Bearer token** from pairing
- Pairing codes expire in **10 minutes** and are single-use
- Token binds to your PC's `hostId` on first sync
- **v1.1+:** pairing registers an **Ed25519 attestation key** on this PC (`%USERPROFILE%\.idlechip\attestation-key.json`). Session `watch --session` signs utilization proofs the marketplace verifies before crediting hours.

## Windows .exe

See [GitHub Releases](https://github.com/lnctrl/idlechip-verifier/releases).

```powershell
.\idlechip-verifier-win-x64.exe pair --url https://idlechip.com --code XXXX-YYYY
.\idlechip-verifier-win-x64.exe scan
```

## Rename

To change the public package/repo/exe identity, edit `brand.json`, then run `npm run brand:apply`.

## License

MIT
