export type CardEffect =
  | { type: "receive_money"; amount: number }
  | { type: "pay_money";     amount: number }
  | { type: "move_to";       position: number }   // absolute board position
  | { type: "move_forward";  steps: number }
  | { type: "move_backward"; steps: number }
  | { type: "go_to_jail" }
  | { type: "gojf_keep" } // Get Out of Jail Free (Chance/Community) card
  | { type: "gojf_use" };


export interface Card {
  id: string;
  title: string;
  description: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: Card[] = [
  {
    id: "ch1",

    title: "Bank Dividend",
    description: "The bank pays you a dividend of $50.",
    effect: { type: "receive_money", amount: 50 },
  },
  {
    id: "ch2",
    title: "Speeding Fine",
    description: "Pay a $15 speeding fine.",
    effect: { type: "pay_money", amount: 15 },
  },
  {
    id: "ch3",
    title: "Advance to GO",
    description: "Advance to GO and collect $200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "ch4",
    title: "Get Out of Jail Free",
    description: "This card may be kept until needed.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "ch5_gojail",
    title: "Go to Jail",

    description: "Go directly to Jail. Do not pass GO.",
    effect: { type: "go_to_jail" },
  },

  {
    id: "ch6_lucky",
    title: "Lucky Find",


    description: "You found $100 on the street.",
    effect: { type: "receive_money", amount: 100 },
  },
  {
    id: "ch6",
    title: "Road Repairs",
    description: "Pay $40 for road repairs.",
    effect: { type: "pay_money", amount: 40 },
  },
  {
    id: "ch7",
    title: "Advance 3 Spaces",
    description: "Move forward 3 spaces.",
    effect: { type: "move_forward", steps: 3 },
  },
  {
    id: "ch8",
    title: "Step Back",
    description: "Move back 3 spaces.",
    effect: { type: "move_backward", steps: 3 },
  },
];

export const COMMUNITY_CHEST_CARDS: Card[] = [
  {

    id: "cc1",
    title: "Bank Error",
    description: "Bank error in your favor — collect $200.",
    effect: { type: "receive_money", amount: 200 },
  },
  {
    id: "cc2",
    title: "Doctor's Fee",
    description: "Pay doctor's fee of $50.",
    effect: { type: "pay_money", amount: 50 },
  },
  {
    id: "cc3",
    title: "Advance to GO",
    description: "Advance to GO and collect $200.",
    effect: { type: "move_to", position: 0 },
  },
  {
    id: "cc4",
    title: "Go to Jail",
    description: "Go directly to Jail. Do not pass GO.",
    effect: { type: "go_to_jail" },
  },
  {
    id: "cc5",
    title: "Tax Refund",
    description: "Income tax refund — collect $20.",
    effect: { type: "receive_money", amount: 20 },
  },
  {
    id: "cc6",
    title: "Hospital Fee",
    description: "Pay hospital fee of $100.",
    effect: { type: "pay_money", amount: 100 },
  },
  {
    id: "cc7",
    title: "Get Out of Jail Free",
    description: "This card may be kept until needed.",
    effect: { type: "gojf_keep" },
  },
  {
    id: "cc8_bday",
    title: "Birthday Gift",

    description: "It's your birthday! Collect $10.",
    effect: { type: "receive_money", amount: 10 },
  },
  {
    id: "cc8",
    title: "Advance 2 Spaces",
    description: "Move forward 2 spaces.",
    effect: { type: "move_forward", steps: 2 },
  },
];

export function drawCard(deck: Card[]): Card {
  return deck[Math.floor(Math.random() * deck.length)];
}
