# cloudflare-tunnel-upvendo

Second cloudflared connector on this host, holding a tunnel from the
**Upvendo** Cloudflare account. Serves `agents.upvendo.com` → the
`upvendo-dispatch` status page.

Deliberately not a second service inside `cloudflare-tunnel/`: that one's
token belongs to the personal account, and mixing the two would put a
company credential in a personal `.env` and make either account's revocation
take both hostnames down.

## Why a second account works at all

A dashboard-managed tunnel authenticates with a **token**, which encodes the
account and the tunnel. There is no shared `~/.cloudflared/cert.pem` to
collide over — that only exists for locally-managed tunnels. Two connectors
on one host are just two processes.

## Setup

1. In the **Upvendo** Cloudflare account: Zero Trust → Networks → Tunnels →
   Create a tunnel → Cloudflared, name it `upvendo-agents`. Copy the token
   from the install command (the long string after `--token`).
2. `cp .env.example .env` and paste the token into `UPVENDO_TUNNEL_TOKEN`.
3. `docker compose up -d`
4. Back in the dashboard, on the tunnel's **Published application routes**:
   - Subdomain `agents`, domain `upvendo.com`
   - Type `HTTP`, URL `host.docker.internal:8377`

   Saving this writes the `agents.upvendo.com` CNAME to
   `<tunnel-uuid>.cfargotunnel.com` in the upvendo.com zone automatically.

## Origin

`host.docker.internal:8377` — the `upvendo-dispatch` status page, which
listens on the host at `0.0.0.0:8377` (`[web] lan = true` in
`~/.config/upvendo-dispatch/config.toml`). A container's `localhost` is its
own, hence `extra_hosts`.

## Auth

None at the edge, by design. Requests arriving through a tunnel are
identified by their `Cf-Ray` / `Cf-Connecting-Ip` headers and walled behind
the app's own PIN page; LAN and localhost hits are not. The PIN is posted to
a private Slack channel, so **that channel's membership is the access-control
list** — everyone in it can log in, and the record shows the PIN was used,
not who used it.

## Checks

```sh
docker logs cloudflared-upvendo --tail 20        # expect 4 QUIC connections
curl -sI https://agents.upvendo.com | head -1    # expect 401 (the PIN page)
curl -sI http://localhost:8377 | head -1         # expect 200 (loopback skips auth)
```

A 502 from the hostname means the connector is up but the origin is not —
check `systemctl --user status upvendo-dispatch` before touching the tunnel.
