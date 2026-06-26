import { BoardSpace } from "@/types/game";

// Matches backend board exactly. Corners at indices 0, 10, 20, 30.
// Clockwise from GO (bottom-right):
//   Bottom row  (GO→Jail): 0..10  going left
//   Left column (Jail→FreePark): 10..20 going up
//   Top row     (FreePark→GoJail): 20..30 going right
//   Right column (GoJail→GO): 30..39 going down
export const BOARD: BoardSpace[] = [
  { index: 0,  name: "GO",               type: "go" },
  { index: 1,  name: "Mizoram",          type: "property", color: "brown",     price: 60,  rent: 2   },
  { index: 2,  name: "Community Chest",  type: "community" },
  { index: 3,  name: "Tripura",          type: "property", color: "brown",     price: 60,  rent: 4   },
  { index: 4,  name: "Income Tax",       type: "tax",      tax: 200 },
  { index: 5,  name: "Northern Railway", type: "railroad", price: 200, rent: 25 },
  { index: 6,  name: "Nagaland",         type: "property", color: "lightblue", price: 100, rent: 6   },
  { index: 7,  name: "Lucky Draw",       type: "chance" },
  { index: 8,  name: "Manipur",          type: "property", color: "lightblue", price: 100, rent: 6   },
  { index: 9,  name: "Sikkim",           type: "property", color: "lightblue", price: 120, rent: 8   },
  { index: 10, name: "Jail / Visiting",  type: "visiting" },
  { index: 11, name: "Meghalaya",        type: "property", color: "pink",      price: 140, rent: 10  },
  { index: 12, name: "Power Grid",       type: "utility",  price: 150, rent: 25 },
  { index: 13, name: "Jharkhand",        type: "property", color: "pink",      price: 140, rent: 10  },
  { index: 14, name: "Arunachal Pradesh",type: "property", color: "pink",      price: 160, rent: 12  },
  { index: 15, name: "Western Railway",  type: "railroad", price: 200, rent: 25 },
  { index: 16, name: "Himachal Pradesh", type: "property", color: "orange",    price: 180, rent: 14  },
  { index: 17, name: "Community Chest",  type: "community" },
  { index: 18, name: "Chhattisgarh",     type: "property", color: "orange",    price: 180, rent: 14  },
  { index: 19, name: "Assam",            type: "property", color: "orange",    price: 200, rent: 16  },
  { index: 20, name: "Free Parking",     type: "free_parking" },
  { index: 21, name: "Uttarakhand",      type: "property", color: "red",       price: 220, rent: 18  },
  { index: 22, name: "Lucky Draw",       type: "chance" },
  { index: 23, name: "Bihar",            type: "property", color: "red",       price: 220, rent: 18  },
  { index: 24, name: "Odisha",           type: "property", color: "red",       price: 240, rent: 20  },
  { index: 25, name: "Southern Railway", type: "railroad", price: 200, rent: 25 },
  { index: 26, name: "Haryana",          type: "property", color: "yellow",    price: 260, rent: 22  },
  { index: 27, name: "Punjab",           type: "property", color: "yellow",    price: 260, rent: 22  },
  { index: 28, name: "Water Board",      type: "utility",  price: 150, rent: 25 },
  { index: 29, name: "West Bengal",      type: "property", color: "yellow",    price: 280, rent: 24  },
  { index: 30, name: "Go To Jail",       type: "go_to_jail" },
  { index: 31, name: "Kerala",           type: "property", color: "green",     price: 300, rent: 26  },
  { index: 32, name: "Tamil Nadu",       type: "property", color: "green",     price: 300, rent: 26  },
  { index: 33, name: "Community Chest",  type: "community" },
  { index: 34, name: "Gujarat",          type: "property", color: "green",     price: 320, rent: 28  },
  { index: 35, name: "Eastern Railway",  type: "railroad", price: 200, rent: 25 },
  { index: 36, name: "Lucky Draw",       type: "chance" },
  { index: 37, name: "Karnataka",        type: "property", color: "darkblue",  price: 350, rent: 35  },
  { index: 38, name: "GST",             type: "tax",      tax: 100 },
  { index: 39, name: "Maharashtra",      type: "property", color: "darkblue",  price: 400, rent: 50  },
];

export const PROPERTY_COLORS: Record<string, string> = {
  brown:     "#92400e",
  lightblue: "#38bdf8",
  pink:      "#f472b6",
  orange:    "#fb923c",
  red:       "#ef4444",
  yellow:    "#facc15",
  green:     "#22c55e",
  darkblue:  "#1d4ed8",
};

export const COLOR_LABELS: Record<string, string> = {
  brown:     "Brown",
  lightblue: "Light Blue",
  pink:      "Pink",
  orange:    "Orange",
  red:       "Red",
  yellow:    "Yellow",
  green:     "Green",
  darkblue:  "Dark Blue",
};

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

export const RAILROAD_INDICES = [5, 15, 25, 35];
export const UTILITY_INDICES = [12, 28];

export const RENT_TABLE: Record<number, [number, number, number, number, number, number]> = {
  1:  [2,   10,  30,   90,  160, 250],
  3:  [4,   20,  60,  180,  320, 450],
  6:  [6,   30,  90,  270,  400, 550],
  8:  [6,   30,  90,  270,  400, 550],
  9:  [8,   40, 100,  300,  450, 600],
  11: [10,  50, 150,  450,  625, 750],
  13: [10,  50, 150,  450,  625, 750],
  14: [12,  60, 180,  500,  700, 900],
  16: [14,  70, 200,  550,  750, 950],
  18: [14,  70, 200,  550,  750, 950],
  19: [16,  80, 220,  600,  800, 1000],
  21: [18,  90, 250,  700,  875, 1050],
  23: [18,  90, 250,  700,  875, 1050],
  24: [20, 100, 300,  750,  925, 1100],
  26: [22, 110, 330,  800,  975, 1150],
  27: [22, 110, 330,  800,  975, 1150],
  29: [24, 120, 360,  850, 1025, 1200],
  31: [26, 130, 390,  900, 1100, 1275],
  32: [26, 130, 390,  900, 1100, 1275],
  34: [28, 150, 450, 1000, 1200, 1400],
  37: [35, 175, 500, 1100, 1300, 1500],
  39: [50, 200, 600, 1400, 1700, 2000],
};

export const FULL_NAMES: Record<number, string> = {
  1:  "Mizoram",
  3:  "Tripura",
  6:  "Nagaland",
  8:  "Manipur",
  9:  "Sikkim",
  11: "Meghalaya",
  13: "Jharkhand",
  14: "Arunachal Pradesh",
  16: "Himachal Pradesh",
  18: "Chhattisgarh",
  19: "Assam",
  21: "Uttarakhand",
  23: "Bihar",
  24: "Odisha",
  26: "Haryana",
  27: "Punjab",
  29: "West Bengal",
  31: "Kerala",
  32: "Tamil Nadu",
  34: "Gujarat",
  37: "Karnataka",
  39: "Maharashtra",
  5:  "Northern Railway",
  15: "Western Railway",
  25: "Southern Railway",
  35: "Eastern Railway",
  12: "Power Grid",
  28: "Water Board",
};

export function getSpaceBg(type: string): string {
  const map: Record<string, string> = {
    go:           "bg-emerald-950",
    community:    "bg-yellow-950",
    chance:       "bg-orange-950",
    tax:          "bg-slate-700",
    railroad:     "bg-slate-800",
    utility:      "bg-slate-800",
    visiting:     "bg-amber-950",
    free_parking: "bg-slate-800",
    go_to_jail:   "bg-red-950",
    property:     "bg-slate-900",
  };
  return map[type] ?? "bg-slate-900";
}
