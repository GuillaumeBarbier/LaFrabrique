import type { MetadataRoute } from "next";

/** Personal tool: nothing to index (books may carry the children's first names). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
