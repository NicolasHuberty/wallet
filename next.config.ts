import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Limit parallel workers during the "Collecting page data" build phase to
  // avoid OOM on the Coolify build host (limited RAM). Local builds still
  // go fast; this only caps the Coolify run. Without this, the 7 default
  // workers each load the full bundle and the kernel kills the run.
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
};

export default nextConfig;
