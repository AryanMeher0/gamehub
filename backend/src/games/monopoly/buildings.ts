// House cost to buy per color group
export const HOUSE_PRICE: Record<string, number> = {
  brown:    50,
  lightblue: 50,
  pink:     100,
  orange:   100,
  red:      150,
  yellow:   150,
  green:    200,
  darkblue: 200,
};

// Rent at [0 houses, 1 house, 2 houses, 3 houses, 4 houses, hotel]
// Keyed by board space index
export const RENT_TABLE: Record<number, [number, number, number, number, number, number]> = {
  // Brown
  1:  [2,   10,  30,   90,  160, 250],
  3:  [4,   20,  60,  180,  320, 450],
  // Light Blue
  6:  [6,   30,  90,  270,  400, 550],
  8:  [6,   30,  90,  270,  400, 550],
  9:  [8,   40, 100,  300,  450, 600],
  // Pink
  11: [10,  50, 150,  450,  625, 750],
  13: [10,  50, 150,  450,  625, 750],
  14: [12,  60, 180,  500,  700, 900],
  // Orange
  16: [14,  70, 200,  550,  750, 950],
  18: [14,  70, 200,  550,  750, 950],
  19: [16,  80, 220,  600,  800, 1000],
  // Red
  21: [18,  90, 250,  700,  875, 1050],
  23: [18,  90, 250,  700,  875, 1050],
  24: [20, 100, 300,  750,  925, 1100],
  // Yellow
  26: [22, 110, 330,  800,  975, 1150],
  27: [22, 110, 330,  800,  975, 1150],
  29: [24, 120, 360,  850, 1025, 1200],
  // Green
  31: [26, 130, 390,  900, 1100, 1275],
  32: [26, 130, 390,  900, 1100, 1275],
  34: [28, 150, 450, 1000, 1200, 1400],
  // Dark Blue
  37: [35, 175, 500, 1100, 1300, 1500],
  39: [50, 200, 600, 1400, 1700, 2000],
};

// Which space indices belong to each color group
export const COLOR_GROUPS: Record<string, number[]> = {
  brown:    [1, 3],
  lightblue:[6, 8, 9],
  pink:     [11, 13, 14],
  orange:   [16, 18, 19],
  red:      [21, 23, 24],
  yellow:   [26, 27, 29],
  green:    [31, 32, 34],
  darkblue: [37, 39],
};

export function ownsFullGroup(
  color: string,
  ownerId: string,
  properties: Record<number, { ownerId: string }>
): boolean {
  const group = COLOR_GROUPS[color];
  if (!group) return false;
  return group.every((idx) => properties[idx]?.ownerId === ownerId);
}

export function getRent(
  spaceIndex: number,
  houseCount: number,
  hasHotel: boolean
): number {
  const row = RENT_TABLE[spaceIndex];
  if (!row) return 0;
  if (hasHotel) return row[5];
  return row[Math.min(houseCount, 4) as 0 | 1 | 2 | 3 | 4];
}
