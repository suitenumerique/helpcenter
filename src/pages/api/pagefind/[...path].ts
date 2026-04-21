import { getRedis } from "@/lib/redis";
import type { NextApiRequest, NextApiResponse } from "next";

const CONTENT_TYPES: Record<string, string> = {
  js: "application/javascript",
  css: "text/css",
  wasm: "application/wasm",
  pagefind: "application/octet-stream",
  pf_meta: "application/octet-stream",
  pf_fragment: "application/octet-stream",
  pf_index: "application/octet-stream",
};

function getContentType(path: string): string {
  const ext = path.split(".").pop() || "";
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const pathSegments = req.query.path as string[];
  const filePath = pathSegments.join("/");

  try {
    const redis = getRedis();
    const data = await redis.getBuffer(`pagefind:${filePath}`);

    if (!data) {
      return res.status(404).end();
    }

    const contentType = getContentType(filePath);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.status(200).send(data);
  } catch (error) {
    console.error("Error serving pagefind file:", error);
    res.status(500).end();
  }
}
