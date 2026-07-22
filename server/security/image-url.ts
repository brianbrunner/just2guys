const allowedImageHosts = new Set([
  "s.yimg.com",
  "sleepercdn.com",
  "yahoofantasysports-res.cloudinary.com",
]);

export function safeImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedImageHosts.has(url.hostname))
      return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}
