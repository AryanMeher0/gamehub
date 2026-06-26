import { BoardSpace } from "../../types/game";

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

export const BOARD_SIZE    = 40;
export const GO_SALARY     = 200;
export const JAIL_POSITION = 10;

export function isPurchasable(type: string): boolean {
  return type === "property" || type === "railroad" || type === "utility";
}
