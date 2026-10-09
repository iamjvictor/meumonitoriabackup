import type { NextConfig } from "next";

const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const allowedDevOrigins = publicAppUrl ? [new URL(publicAppUrl).hostname] : [];

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  reactCompiler: true,
  allowedDevOrigins,
  experimental: {
    // O CLI do TypeScript retorna stdout vazio neste ambiente quando invocado
    // pelo subprocesso do Next 16; a API evita a falha no --showConfig.
    useTypeScriptCli: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
