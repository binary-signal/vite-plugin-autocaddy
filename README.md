# vite-plugin-autocaddy

Vite plugin that automatically registers your local dev server with a [Caddy](https://caddyserver.com/) reverse proxy
via its admin API. Get HTTPS local development with custom `.dev.local` domains — no manual Caddy config needed.

When you start `vite dev`, the plugin:

1. Configures HMR to work through Caddy's HTTPS proxy
2. Registers a reverse proxy route in Caddy pointing `your-app.dev.local` to the dev server
3. Cleans up the route when the dev server stops

## Prerequisites

- Caddy running with the [admin API](https://caddyserver.com/docs/api) enabled (default: `localhost:2019`)
- If Caddy runs in Docker, ensure `host.docker.internal` resolves to the host machine

## Installation

```bash
pnpm add -D @binary-signal/vite-plugin-autocaddy
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import autoCaddy from "vite-plugin-autocaddy";

export default defineConfig({
  plugins: [autoCaddy()],
});
```

Start your dev server and visit `https://your-app.dev.local` (where `your-app` is your project directory name).

## Options

```ts
autoCaddy({
  appName: "my-app", // Override directory-derived name
  domainSuffix: "dev.local", // Domain suffix (default: 'dev.local')
  caddyApiUrl: "http://localhost:2019", // Caddy admin API URL
  serverName: "proxy", // Caddy server name (default: 'proxy')
  upstreamHost: "host.docker.internal", // How Caddy reaches your dev server
  cleanup: true, // Delete route on server close
});
```

| Option         | Type      | Default                   | Description                                  |
| -------------- | --------- | ------------------------- | -------------------------------------------- |
| `appName`      | `string`  | Directory name            | App name used for domain and route ID        |
| `domainSuffix` | `string`  | `'dev.local'`             | Domain suffix (e.g., `app.dev.local`)        |
| `caddyApiUrl`  | `string`  | `'http://localhost:2019'` | Caddy admin API base URL                     |
| `serverName`   | `string`  | `'proxy'`                 | Caddy server name in config                  |
| `upstreamHost` | `string`  | `'host.docker.internal'`  | Host Caddy uses to reach the dev server      |
| `cleanup`      | `boolean` | `true`                    | Delete the Caddy route when dev server stops |

## How It Works

The plugin uses Caddy's [admin API](https://caddyserver.com/docs/api) to manage routes:

- On server start: checks if a route with ID `vite-{appName}` exists
  - If yes: `DELETE` the old route, then `POST` a new one
  - If no: `POST` to create a new route
- On server close: `DELETE` the route (when `cleanup: true`)

The registered Caddy route reverse-proxies `https://{appName}.dev.local` to `{upstreamHost}:{port}`.

## License

MIT
