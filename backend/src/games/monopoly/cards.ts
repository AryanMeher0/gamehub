export type CardEffect =
  | { type: "receive_money"; amount: number }
  | { type: "pay_money"; amount: number }
  | { type: "move_to"; position: number }
  | { type: "move_forward"; steps: number }
  | { type: "move_backward"; steps: number }
  | { type: "go_to_jail" }
  | { type: "gojf_keep" }
  | { type: "advance_nearest_railroad" }
  | { type: "advance_nearest_utility" }
  | { type: "pay_each_player"; amount: number }
  | { type: "collect_from_each_player"; amount: number }
  | { type: "street_repairs"; houseCost: number; hotelCost: number };

export interface Card {
  id: string;
  title: string;
  description: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: Card[] = [
  {
    id: "ch_boardwalk",
    title: "Advance to Boardwalk",
    description: "Advance token to Boardwalk.",
    effect: { type: "move_to", position: 39 },
  },
  {
    id: "ch_go",
    title: "Advance to GO",
    description: "Advance to GO. Collect $200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "ch_illinois",
    title: "Advance to Illinois Avenue",
    description: "Advance token to Illinois Ave. If you pass GO, collect $200.",
    effect: { type: "move_to", position: 24 },
  },
  {
    id: "ch_stcharles",
    title: "Advance to St. Charles Place",
    description: "Advance token to St. Charles Place. If you pass GO, collect $200.",
    effect: { type: "move_to", position: 11 },
  },
  {
    id: "ch_rr1",
    title: "Advance to Nearest Railroad",
    description: "Advance token to the nearest Railroad. If owned, pay double rent. If unowned, you may buy it.",
    effect: { type: "advance_nearest_railroad" },
  },
  {
    id: "ch_rr2",
    title: "Advance to Nearest Railroad",
    description: "Advance token to the nearest Railroad. If owned, pay double rent. If unowned, you may buy it.",
    effect: { type: "advance_nearest_railroad" },
  },
  {
    id: "ch_utility",
    title: "Advance to Nearest Utility",
    description: "Advance token to nearest Utility. If owned, throw dice and pay 10× amount. If unowned, you may buy it.",
    effect: { type: "advance_nearest_utility" },
  },
  {
    id: "ch_dividend",
    title: "Bank Dividend",
    description: "The bank pays you a dividend of $50.",
    effect: { type: "receive_money", amount: 50 },
  },
  {
    id: "ch_gojf",
    title: "Get Out of Jail Free",
    description: "This card may be kept until needed or traded.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "ch_back3",
    title: "Go Back 3 Spaces",
    description: "Go back 3 spaces.",
    effect: { type: "move_backward", steps: 3 },
  },
  {
    id: "ch_jail",
    title: "Go to Jail",
    description: "Go directly to Jail. Do not pass GO. Do not collect $200.",
    effect: { type: "go_to_jail" },
  },
  {
    id: "ch_repairs",
    title: "General Repairs",
    description: "Make general repairs on all your property. Pay $25 per house and $100 per hotel.",
    effect: { type: "street_repairs", houseCost: 25, hotelCost: 100 },
  },
  {
    id: "ch_tax",
    title: "Speeding Fine",
    description: "Pay a speeding fine of $15.",
    effect: { type: "pay_money", amount: 15 },
  },
  {
    id: "ch_reading",
    title: "Take a Trip to Reading Railroad",
    description: "Take a trip to Reading Railroad. If you pass GO, collect $200.",
    effect: { type: "move_to", position: 5 },
  },
  {
    id: "ch_chairman",
    title: "Chairman of the Board",
    description: "You have been elected Chairman of the Board. Pay each player $50.",
    effect: { type: "pay_each_player", amount: 50 },
  },
  {
    id: "ch_loan",
    title: "Building Loan Matures",
    description: "Your building and loan matures. Collect $150.",
    effect: { type: "receive_money", amount: 150 },
  },
];

export const COMMUNITY_CHEST_CARDS: Card[] = [
  {
    id: "cc_go",
    title: "Advance to GO",
    description: "Advance to GO. Collect $200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "cc_bank_error",
    title: "Bank Error in Your Favor",
    description: "Bank error in your favor. Collect $200.",
    effect: { type: "receive_money", amount: 200 },
  },
  {
    id: "cc_doctor",
    title: "Doctor's Fee",
    description: "Doctor's fee. Pay $50.",
    effect: { type: "pay_money", amount: 50 },
  },
  {
    id: "cc_stock",
    title: "From Sale of Stock",
    description: "From sale of stock you get $50.",
    effect: { type: "receive_money", amount: 50 },
  },
  {
    id: "cc_gojf",
    title: "Get Out of Jail Free",
    description: "This card may be kept until needed or traded.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "cc_jail",
    title: "Go to Jail",
    description: "Go directly to Jail. Do not pass GO. Do not collect $200.",
    effect: { type: "go_to_jail" },
  },
  {
    id: "cc_opera",
    title: "Grand Opera Night",
    description: "Grand Opera Night. Collect $50 from every player for opening night seats.",
    effect: { type: "collect_from_each_player", amount: 50 },
  },
  {
    id: "cc_holiday",
    title: "Holiday Fund Matures",
    description: "Holiday fund matures. Receive $100.",
    effect: { type: "receive_money", amount: 100 },
  },
  {
    id: "cc_tax_refund",
    title: "Income Tax Refund",
    description: "Income tax refund. Collect $20.",
    effect: { type: "receive_money", amount: 20 },
  },
  {
    id: "cc_birthday",
    title: "It is Your Birthday",
    description: "It is your birthday! Collect $10 from every player.",
    effect: { type: "collect_from_each_player", amount: 10 },
  },
  {
    id: "cc_insurance",
    title: "Life Insurance Matures",
    description: "Life insurance matures. Collect $100.",
    effect: { type: "receive_money", amount: 100 },
  },
  {
    id: "cc_hospital",
    title: "Hospital Fees",
    description: "Pay hospital fees of $100.",
    effect: { type: "pay_money", amount: 100 },
  },
  {
    id: "cc_school",
    title: "School Fees",
    description: "Pay school fees of $150.",
    effect: { type: "pay_money", amount: 150 },
  },
  {
    id: "cc_consultancy",
    title: "Consultancy Fee",
    description: "Receive $25 consultancy fee.",
    effect: { type: "receive_money", amount: 25 },
  },
  {
    id: "cc_repairs",
    title: "Street Repairs",
    description: "You are assessed for street repairs. Pay $40 per house and $115 per hotel.",
    effect: { type: "street_repairs", houseCost: 40, hotelCost: 115 },
  },
  {
    id: "cc_beauty",
    title: "Beauty Contest",
    description: "You have won second prize in a beauty contest. Collect $10.",
    effect: { type: "receive_money", amount: 10 },
  },
];

export function shuffleDeck(deck: Card[]): string[] {
  const ids = deck.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function drawFromDeck(
  deckIds: string[],
  allCards: Card[]
): { card: Card; remaining: string[] } {
  const ids = deckIds.length > 0 ? [...deckIds] : shuffleDeck(allCards);
  const [top, ...rest] = ids;
  const card = allCards.find((c) => c.id === top) ?? allCards[0];
  return { card, remaining: rest };
}

/** @deprecated Use drawFromDeck with deck state instead */
export function drawCard(deck: Card[]): Card {
  return deck[Math.floor(Math.random() * deck.length)];
}
