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
    title: "Advance to Taj Mahal",
    description: "Your express ticket takes you straight to the Taj Mahal.",
    effect: { type: "move_to", position: 39 },
  },
  {
    id: "ch_go",
    title: "Advance to GO",
    description: "Your visa is approved! Advance to GO and collect ₹200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "ch_illinois",
    title: "Advance to Marine Drive",
    description: "Proceed to Marine Drive, the Queen's Necklace. If you pass GO, collect ₹200.",
    effect: { type: "move_to", position: 24 },
  },
  {
    id: "ch_stcharles",
    title: "Advance to Pune",
    description: "Head to Pune, the Oxford of the East. If you pass GO, collect ₹200.",
    effect: { type: "move_to", position: 11 },
  },
  {
    id: "ch_rr1",
    title: "Board the Nearest Train",
    description: "Advance token to the nearest Railway. If owned, pay double fare. If unowned, you may buy it.",
    effect: { type: "advance_nearest_railroad" },
  },
  {
    id: "ch_rr2",
    title: "Board the Nearest Train",
    description: "Advance token to the nearest Railway. If owned, pay double fare. If unowned, you may buy it.",
    effect: { type: "advance_nearest_railroad" },
  },
  {
    id: "ch_utility",
    title: "Advance to Nearest Utility",
    description: "Advance token to nearest Utility. If owned, roll dice and pay 10× the amount.",
    effect: { type: "advance_nearest_utility" },
  },
  {
    id: "ch_dividend",
    title: "Diwali Bonus",
    description: "Festival season bonus from your employer! Collect ₹50.",
    effect: { type: "receive_money", amount: 50 },
  },
  {
    id: "ch_gojf",
    title: "Get Out of Jail Free",
    description: "Your MP connection comes through. This card may be kept until needed.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "ch_back3",
    title: "Traffic Jam — Go Back 3 Spaces",
    description: "Caught in Bengaluru traffic. Go back 3 spaces.",
    effect: { type: "move_backward", steps: 3 },
  },
  {
    id: "ch_jail",
    title: "Go to Jail",
    description: "Income tax evasion detected! Go directly to Jail. Do not pass GO.",
    effect: { type: "go_to_jail" },
  },
  {
    id: "ch_repairs",
    title: "Property Maintenance Notice",
    description: "BMC inspection due. Pay ₹25 per house and ₹100 per hotel.",
    effect: { type: "street_repairs", houseCost: 25, hotelCost: 100 },
  },
  {
    id: "ch_tax",
    title: "Challaan Fine",
    description: "Traffic violation fine. Pay ₹15.",
    effect: { type: "pay_money", amount: 15 },
  },
  {
    id: "ch_reading",
    title: "Take a Trip on Northern Railway",
    description: "Board the Northern Railway. If you pass GO, collect ₹200.",
    effect: { type: "move_to", position: 5 },
  },
  {
    id: "ch_chairman",
    title: "Elected Gram Panchayat Head",
    description: "Congratulations! As the newly elected head, pay each player ₹50.",
    effect: { type: "pay_each_player", amount: 50 },
  },
  {
    id: "ch_loan",
    title: "Housing Loan Approved",
    description: "Your PMAY housing loan matures. Collect ₹150.",
    effect: { type: "receive_money", amount: 150 },
  },
];

export const COMMUNITY_CHEST_CARDS: Card[] = [
  {
    id: "cc_go",
    title: "Advance to GO",
    description: "Your ration card renewal is complete. Advance to GO and collect ₹200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "cc_bank_error",
    title: "Bank Error in Your Favour",
    description: "A UPI glitch credits your account. Collect ₹200.",
    effect: { type: "receive_money", amount: 200 },
  },
  {
    id: "cc_doctor",
    title: "Doctor's Consultation Fee",
    description: "Private clinic visit. Pay ₹50.",
    effect: { type: "pay_money", amount: 50 },
  },
  {
    id: "cc_stock",
    title: "Sold Startup Shares",
    description: "You sold your ESOPs. Collect ₹50.",
    effect: { type: "receive_money", amount: 50 },
  },
  {
    id: "cc_gojf",
    title: "Get Out of Jail Free",
    description: "You know someone who knows someone. This card may be kept until needed.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "cc_jail",
    title: "Go to Jail",
    description: "Violation of Section 420 IPC. Go directly to Jail. Do not pass GO.",
    effect: { type: "go_to_jail" },
  },
  {
    id: "cc_opera",
    title: "IPL After-Party",
    description: "You hosted the after-party! Collect ₹50 from every player for the tickets.",
    effect: { type: "collect_from_each_player", amount: 50 },
  },
  {
    id: "cc_holiday",
    title: "PF Maturity",
    description: "Your Provident Fund matures. Receive ₹100.",
    effect: { type: "receive_money", amount: 100 },
  },
  {
    id: "cc_tax_refund",
    title: "GST Refund",
    description: "Income tax refund processed. Collect ₹20.",
    effect: { type: "receive_money", amount: 20 },
  },
  {
    id: "cc_birthday",
    title: "Happy Birthday!",
    description: "Your WhatsApp birthday wishes come with cash. Collect ₹10 from every player.",
    effect: { type: "collect_from_each_player", amount: 10 },
  },
  {
    id: "cc_insurance",
    title: "LIC Policy Matures",
    description: "Your LIC endowment plan pays out. Collect ₹100.",
    effect: { type: "receive_money", amount: 100 },
  },
  {
    id: "cc_hospital",
    title: "Hospital Bills",
    description: "Emergency room visit without Ayushman Bharat. Pay ₹100.",
    effect: { type: "pay_money", amount: 100 },
  },
  {
    id: "cc_school",
    title: "School Donation",
    description: "Capitation fees for the new school year. Pay ₹150.",
    effect: { type: "pay_money", amount: 150 },
  },
  {
    id: "cc_consultancy",
    title: "Freelance Project Payment",
    description: "Your Upwork client finally pays. Receive ₹25.",
    effect: { type: "receive_money", amount: 25 },
  },
  {
    id: "cc_repairs",
    title: "Society Maintenance Levy",
    description: "Housing society special assessment. Pay ₹40 per house and ₹115 per hotel.",
    effect: { type: "street_repairs", houseCost: 40, hotelCost: 115 },
  },
  {
    id: "cc_beauty",
    title: "Filmy Award Nomination",
    description: "You won second prize at the Filmfare Awards. Collect ₹10.",
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
