# IdleChip Verifier

Desktop helper for [IdleChip](https://idlechip.com) sellers. Scans GPUs on your PC, syncs stats to **My GPUs**, and keeps your registered cards **Available** (or reports utilization during an active rental).

Buyers do not install this — it proves your machine is real and online before they book hours.

## Version

| Version | Status |
|---------|--------|
| **1.1.0+** | Current — required for **idlechip.com** (Ed25519 attestation at pair) |
| **1.0.0** | **Deprecated** on npm — cannot pair with production |

Always pin: `npx idlechip-verifier@1.1.0 …`

## Seller workflow

1. Sign in at **https://idlechip.com**
2. Open **My GPUs** → **Generate pairing code**
3. On your GPU PC:

```powershell
npx idlechip-verifier pair --url https://idlechip.com --code XXXX-YYYY
npx idlechip-verifier scan
```

4. Back on the site: run the **test scan**, pick your card, **Register**
5. Keep the verifier running while you want to appear available:

```powershell
npx idlechip-verifier watch
```

Credentials save to `%USERPROFILE%\.idlechip\verifier-credentials.json`.

## Commands

| Command | Purpose |
|---------|---------|
| `pair --url URL --code CODE` | One-time link to your signed-in account |
| `scan` | Detect GPUs and push a one-off sync to My GPUs |
| `register [--gpu KEY]` | Register the selected GPU on the marketplace |
| `watch [--session ID]` | **Stay online** — re-scan every 5s and report availability; use `--session` during an active rental to attest delivered hours |

`watch` is what My GPUs means by **Available**. Stop it when you take the machine offline. During a booked session, run `watch --session <session-id>` so utilization proofs credit delivered hours.

## Security

- CLI only calls **idlechip.com**, **idlechip.vercel.app**, and localhost (dev)
- Sync, register, and availability updates require a **Bearer token** from pairing
- Pairing codes expire in **10 minutes** and are single-use
- Token binds to your PC's `hostId` on first sync
- **v1.1+:** pairing registers an **Ed25519 attestation key** on this PC (`%USERPROFILE%\.idlechip\attestation-key.json`). `watch --session` signs utilization proofs the marketplace verifies before crediting hours.

## Windows .exe

See [GitHub Releases](https://github.com/lnctrl/idlechip-verifier/releases).

```powershell
.\idlechip-verifier-win-x64.exe pair --url https://idlechip.com --code XXXX-YYYY
.\idlechip-verifier-win-x64.exe scan
.\idlechip-verifier-win-x64.exe watch
```

## Rename

To change the public package/repo/exe identity, edit `brand.json`, then run `npm run brand:apply`.

## License

MIT
