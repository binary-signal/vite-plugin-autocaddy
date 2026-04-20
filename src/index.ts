import http from "node:http";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";

export interface AutoCaddyOptions {
  /** Override the app name derived from directory name */
  appName?: string;
  /** Domain suffix. Default: 'dev.local' */
  domainSuffix?: string;
  /** Caddy admin API base URL. Default: 'http://localhost:2019' */
  caddyApiUrl?: string;
  /** Caddy server name in config. Default: 'proxy' */
  serverName?: string;
  /** Where Caddy is running. 'local' uses localhost, 'docker' uses host.docker.internal. Default: 'local' */
  mode?: "docker" | "local";
  /** Upstream host Caddy uses to reach the dev server. Default depends on mode. */
  upstreamHost?: string;
  /** DELETE the Caddy route when the dev server closes. Default: true */
  cleanup?: boolean;
}

interface ResolvedConfig {
  appName: string;
  localDomain: string;
  routeId: string;
  caddyApiUrl: string;
  serverName: string;
  upstreamHost: string;
  cleanup: boolean;
}

function resolveOptions(options: AutoCaddyOptions): ResolvedConfig {
  const appName = options.appName ?? path.basename(process.cwd());
  const domainSuffix = options.domainSuffix ?? "dev.local";
  return {
    appName,
    localDomain: `${appName}.${domainSuffix}`,
    routeId: `vite-${appName}`,
    caddyApiUrl: options.caddyApiUrl ?? "http://localhost:2019",
    serverName: options.serverName ?? "proxy",
    upstreamHost:
      options.upstreamHost ??
      (options.mode === "docker" ? "host.docker.internal" : "localhost"),
    cleanup: options.cleanup ?? true,
  };
}

interface CaddyRoute {
  "@id": string;
  match: Array<{ host: string[] }>;
  handle: Array<{
    handler: "reverse_proxy";
    upstreams: Array<{ dial: string }>;
  }>;
}

interface CaddyResponse {
  status: number;
  data: string;
}

function caddyRequest(
  caddyApiUrl: string,
  method: string,
  reqPath: string,
  body?: unknown,
): Promise<CaddyResponse> {
  const url = new URL(reqPath, caddyApiUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data }));
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function buildCaddyRoute(
  routeId: string,
  localDomain: string,
  upstreamHost: string,
  port: number,
): CaddyRoute {
  return {
    "@id": routeId,
    match: [{ host: [localDomain] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: `${upstreamHost}:${port}` }],
      },
    ],
  };
}

async function registerRoute(
  caddyApiUrl: string,
  serverName: string,
  routeId: string,
  route: CaddyRoute,
): Promise<{ success: boolean; action: "created" | "updated"; error?: string }> {
  let action: "created" | "updated" = "created";

  // Delete existing route first (same strategy as dev-proxy.sh)
  const check = await caddyRequest(caddyApiUrl, "GET", `/id/${routeId}`);
  if (check.status === 200) {
    await caddyRequest(caddyApiUrl, "DELETE", `/id/${routeId}`);
    action = "updated";
  }

  const response = await caddyRequest(
    caddyApiUrl,
    "POST",
    `/config/apps/http/servers/${serverName}/routes`,
    route,
  );

  if (response.status === 200) {
    return { success: true, action };
  }

  return { success: false, action, error: `HTTP ${response.status}: ${response.data}` };
}

async function deleteRoute(caddyApiUrl: string, routeId: string): Promise<void> {
  try {
    await caddyRequest(caddyApiUrl, "DELETE", `/id/${routeId}`);
  } catch {
    // Server is shutting down — swallow errors
  }
}

// oxlint-disable-next-line max-lines-per-function
export function autoCaddy(options: AutoCaddyOptions = {}): Plugin {
  const resolved = resolveOptions(options);

  return {
    name: "vite-plugin-autocaddy",
    apply: "serve",

    config() {
      return {
        server: {
          hmr: {
            host: resolved.localDomain,
            protocol: "wss",
          },
        },
      };
    },

    configureServer(server: ViteDevServer) {
      const logger = server.config.logger;

      server.httpServer?.once("listening", async () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") return;

        const { port } = address;
        const route = buildCaddyRoute(
          resolved.routeId,
          resolved.localDomain,
          resolved.upstreamHost,
          port,
        );

        try {
          const result = await registerRoute(
            resolved.caddyApiUrl,
            resolved.serverName,
            resolved.routeId,
            route,
          );

          if (result.success) {
            logger.info(
              `\n  Caddy proxy ${result.action}: https://${resolved.localDomain} -> ${resolved.upstreamHost}:${port}\n`,
            );
          } else {
            logger.error(`  Failed to configure Caddy: ${result.error}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`  Could not connect to Caddy Admin API: ${message}`);
        }
      });

      if (resolved.cleanup) {
        server.httpServer?.once("close", () => {
          deleteRoute(resolved.caddyApiUrl, resolved.routeId);
        });
      }
    },
  };
}

export default autoCaddy;
