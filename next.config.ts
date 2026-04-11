import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1 MB; PDF uploads are allowed up to 5 MB (see lib/validations/invoice.ts)
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
