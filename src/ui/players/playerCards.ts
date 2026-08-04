/**
 * Player card registry — the designed card art (user's own, from
 * ~/Kickoff Player Perps Card, optimized to webp). Markets are matched to
 * cards by player name; anything unmatched gets a generated placeholder
 * card so a new listing never breaks the deck.
 */

export type PlayerCard = {
  key: string; // last-name slug — also the match token against market.playerName
  name: string;
  club: string;
  accent: string; // club color — drives the focused card's glow
  img: string;
  position: string;
};

export const PLAYER_CARDS: PlayerCard[] = [
  { key: "palmer", name: "Cole Palmer", club: "Chelsea", accent: "#2A4FD9", img: "/brand/cards/palmer.webp", position: "AM" },
  { key: "fernandes", name: "Bruno Fernandes", club: "Man United", accent: "#DA291C", img: "/brand/cards/fernandes.webp", position: "AM" },
  { key: "haaland", name: "Erling Haaland", club: "Man City", accent: "#6CABDD", img: "/brand/cards/haaland.webp", position: "ST" },
  { key: "gyokeres", name: "Viktor Gyökeres", club: "Arsenal", accent: "#EF0107", img: "/brand/cards/gyokeres.webp", position: "ST" },
  { key: "szoboszlai", name: "Dominik Szoboszlai", club: "Liverpool", accent: "#C8102E", img: "/brand/cards/szoboszlai.webp", position: "AM" },
];

/** Fold diacritics so "Gyökeres" matches "gyokeres". */
function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Find the designed card for a market's playerName (null → placeholder card). */
export function cardForPlayer(playerName: string | null | undefined): PlayerCard | null {
  if (!playerName) return null;
  const n = fold(playerName);
  return PLAYER_CARDS.find((c) => n.includes(c.key)) ?? null;
}
