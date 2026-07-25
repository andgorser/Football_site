import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Логотипы команд и фото игроков пока храним ссылками на внешние картинки.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
