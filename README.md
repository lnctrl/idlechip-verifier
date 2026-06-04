# IdleChip Agent

Public desktop helper for [IdleChip](https://idlechip.com). Scans GPUs on your PC and syncs to **idlechip.com** (and preview hosts). Requires a **pairing code** from the website (proves you are signed in).

## Setup

1. Sign in at **https://idlechip.com**
2. Open **My GPUs** → **Generate pairing code**
3. On your PC:

```powershell
npx idlechip-agent pair --url https://idlechip.com --code XXXX-YYYY
npx idlechip-agent scan
```

Credentials save to `%USERPROFILE%\.idlechip\agent-credentials.json`.

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

## Windows `.exe`

See [GitHub Releases](https://github.com/lnctrl/idlechip-agent/releases).

```powershell
.\idlechip-agent-win-x64.exe pair --url https://idlechip.com --code XXXX-YYYY
.\idlechip-agent-win-x64.exe scan
```

## License

MIT
