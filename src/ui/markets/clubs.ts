"use client";

/**
 * EPL club lookup for score markets — crest slug (public/brand/clubs/*.webp)
 * plus the 3-letter code used on goal markers ("12' ARS"). Matching is by
 * folded name so "Manchester City" / "Man City" / "man city" all resolve.
 */

export interface ClubInfo {
  slug: string;
  name: string;
  code: string;
}

const CLUBS: ClubInfo[] = [
  { slug: "arsenal", name: "Arsenal", code: "ARS" },
  { slug: "aston-villa", name: "Aston Villa", code: "AVL" },
  { slug: "bournemouth", name: "Bournemouth", code: "BOU" },
  { slug: "brentford", name: "Brentford", code: "BRE" },
  { slug: "brighton", name: "Brighton", code: "BHA" },
  { slug: "burnley", name: "Burnley", code: "BUR" },
  { slug: "chelsea", name: "Chelsea", code: "CHE" },
  { slug: "coventry", name: "Coventry", code: "COV" },
  { slug: "crystal-palace", name: "Crystal Palace", code: "CRY" },
  { slug: "everton", name: "Everton", code: "EVE" },
  { slug: "fulham", name: "Fulham", code: "FUL" },
  { slug: "hull", name: "Hull", code: "HUL" },
  { slug: "ipswich", name: "Ipswich", code: "IPS" },
  { slug: "leeds", name: "Leeds", code: "LEE" },
  { slug: "liverpool", name: "Liverpool", code: "LIV" },
  { slug: "man-city", name: "Man City", code: "MCI" },
  { slug: "man-united", name: "Man United", code: "MUN" },
  { slug: "newcastle", name: "Newcastle", code: "NEW" },
  { slug: "nottingham-forest", name: "Forest", code: "NFO" },
  { slug: "sunderland", name: "Sunderland", code: "SUN" },
  { slug: "tottenham", name: "Tottenham", code: "TOT" },
  { slug: "west-ham", name: "West Ham", code: "WHU" },
  { slug: "wolves", name: "Wolves", code: "WOL" },
];

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(fc|afc)\b/g, "")
    .replace(/[^a-z]/g, "");

// Common long-form aliases → canonical folded key.
const ALIASES: Record<string, string> = {
  manchestercity: "mancity",
  manchesterunited: "manunited",
  manutd: "manunited",
  nottinghamforest: "forest",
  nottmforest: "forest", // FPL's "Nott'm Forest"
  coventrycity: "coventry",
  hullcity: "hull",
  ipswichtown: "ipswich",
  brightonhovealbion: "brighton",
  westhamunited: "westham",
  wolverhamptonwanderers: "wolves",
  newcastleunited: "newcastle",
  leedsunited: "leeds",
  tottenhamhotspur: "tottenham",
  spurs: "tottenham",
  afcbournemouth: "bournemouth",
};

const BY_FOLDED = new Map(CLUBS.map((c) => [fold(c.name), c]));

export function clubFor(teamName: string | null | undefined): ClubInfo | null {
  if (!teamName) return null;
  const key = fold(teamName);
  return BY_FOLDED.get(ALIASES[key] ?? key) ?? null;
}

/** Crest URL or null when the club isn't recognized. */
export function crestUrl(teamName: string | null | undefined): string | null {
  const club = clubFor(teamName);
  return club ? `/brand/clubs/${club.slug}.webp` : null;
}

/** 3-letter code for goal markers — falls back to first 3 letters uppercased. */
export function clubCode(teamName: string | null | undefined): string {
  const club = clubFor(teamName);
  if (club) return club.code;
  return (teamName ?? "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "—";
}
