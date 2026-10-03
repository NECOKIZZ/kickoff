import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/ogImage";

// Same picture as opengraph-image; X reads twitter:image first.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
