/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/directory/nrcc",
        destination: "/directory/national-republican-congressional-committee-nrcc",
        permanent: true,
      },
      {
        source: "/directory/nrsc",
        destination: "/directory/national-republican-senatorial-committee-nrsc",
        permanent: true,
      },
      {
        source: "/directory/rnc",
        destination: "/directory/republican-national-committee-rnc",
        permanent: true,
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
 
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
