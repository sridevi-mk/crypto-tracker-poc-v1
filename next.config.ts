import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.189",
    "localhost",
    "http://192.168.1.189",
    "http://192.168.1.189:3001",
    "http://localhost",
    "http://localhost:3001",
  ],
};

export default nextConfig;
