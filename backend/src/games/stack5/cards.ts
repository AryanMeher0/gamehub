import { Stack5Card, CardColor, CardShape } from "./types";

const COLORS: CardColor[] = ["green", "yellow", "pink", "blue"];
const SHAPES: CardShape[] = ["flower", "lightning", "star", "drop"];

export function buildDeck(): Stack5Card[] {
  const cards: Stack5Card[] = [];

  // 5 copies of every color-shape combination (80 standard cards)
  for (let copy = 0; copy < 5; copy++) {
    for (const color of COLORS) {
      for (const shape of SHAPES) {
        cards.push({ id: `std_${color}_${shape}_${copy}`, type: "standard", color, shape });
      }
    }
  }

  // 8 wild cards
  for (let i = 0; i < 8; i++) {
    cards.push({ id: `wild_${i}`, type: "wild", color: null, shape: null });
  }

  // 6 skip cards
  for (let i = 0; i < 6; i++) {
    cards.push({ id: `skip_${i}`, type: "skip", color: null, shape: null });
  }

  // 4 reverse cards
  for (let i = 0; i < 4; i++) {
    cards.push({ id: `reverse_${i}`, type: "reverse", color: null, shape: null });
  }

  // 2 reset hand cards
  for (let i = 0; i < 2; i++) {
    cards.push({ id: `reset_${i}`, type: "reset_hand", color: null, shape: null });
  }

  return shuffle(cards);
}

export function reshuffleDiscard(
  deck: Stack5Card[],
  discard: Stack5Card[]
): { deck: Stack5Card[]; discard: Stack5Card[] } {
  return { deck: [...deck, ...shuffle(discard)], discard: [] };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
