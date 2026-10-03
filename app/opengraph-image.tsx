import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/ogImage";

// Site-wide link preview. Pages with their own og:image (e.g. /card/:id) override it.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
