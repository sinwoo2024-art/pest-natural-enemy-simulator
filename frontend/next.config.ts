import type { NextConfig } from "next";

// Model identifier only: never expose credentials via Next.js env configuration.
const kilnModel = process.env.KILN_MODEL?.trim() || "Qwen3-32B";
if (kilnModel !== "Qwen3-32B") {
  throw new Error("KILN_MODEL must be Qwen3-32B. Kiln integration remains pending.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { KILN_MODEL: kilnModel },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    const backendApiUrl = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
