import { BoardSpace } from "../../types/game";

export const BOARD: BoardSpace[] = [
  { index: 0,  name: "GO",                    type: "go" },
  { index: 1,  name: "Old Delhi",             type: "property", color: "brown",     price: 60,  rent: 2   },
  { index: 2,  name: "Community Chest",       type: "community" },
  { index: 3,  name: "Chandni Chowk",         type: "property", color: "brown",     price: 60,  rent: 4   },
  { index: 4,  name: "Income Tax",            type: "tax",      tax: 200 },
  { index: 5,  name: "Northern Railway",      type: "railroad", price: 200, rent: 25 },
  { index: 6,  name: "Jaipur",               type: "property", color: "lightblue", price: 100, rent: 6   },
  { index: 7,  name: "Lucky Draw",            type: "chance" },
  { index: 8,  name: "Lucknow",              type: "property", color: "lightblue", price: 100, rent: 6   },
  { index: 9,  name: "Chandigarh",           type: "property", color: "lightblue", price: 120, rent: 8   },
  { index: 10, name: "Jail / Visiting",       type: "visiting" },
  { index: 11, name: "Pune",                 type: "property", color: "pink",      price: 140, rent: 10  },
  { index: 12, name: "Power Grid",           type: "utility",  price: 150, rent: 25 },
  { index: 13, name: "Ahmedabad",            type: "property", color: "pink",      price: 140, rent: 10  },
  { index: 14, name: "Kochi",               type: "property", color: "pink",      price: 160, rent: 12  },
  { index: 15, name: "Western Railway",      type: "railroad", price: 200, rent: 25 },
  { index: 16, name: "Hyderabad",            type: "property", color: "orange",    price: 180, rent: 14  },
  { index: 17, name: "Community Chest",       type: "community" },
  { index: 18, name: "Chennai",              type: "property", color: "orange",    price: 180, rent: 14  },
  { index: 19, name: "Kolkata",              type: "property", color: "orange",    price: 200, rent: 16  },
  { index: 20, name: "Free Parking",          type: "free_parking" },
  { index: 21, name: "Bangalore Tech Park",   type: "property", color: "red",       price: 220, rent: 18  },
  { index: 22, name: "Lucky Draw",            type: "chance" },
  { index: 23, name: "Connaught Place",       type: "property", color: "red",       price: 220, rent: 18  },
  { index: 24, name: "Marine Drive",          type: "property", color: "red",       price: 240, rent: 20  },
  { index: 25, name: "Southern Railway",      type: "railroad", price: 200, rent: 25 },
  { index: 26, name: "Gurgaon Cyber City",    type: "property", color: "yellow",    price: 260, rent: 22  },
  { index: 27, name: "Noida Sector 18",       type: "property", color: "yellow",    price: 260, rent: 22  },
  { index: 28, name: "Water Board",           type: "utility",  price: 150, rent: 25 },
  { index: 29, name: "Hitech City",           type: "property", color: "yellow",    price: 280, rent: 24  },
  { index: 30, name: "Go To Jail",            type: "go_to_jail" },
  { index: 31, name: "Mumbai Central",        type: "property", color: "green",     price: 300, rent: 26  },
  { index: 32, name: "Gateway of India",      type: "property", color: "green",     price: 300, rent: 26  },
  { index: 33, name: "Community Chest",       type: "community" },
  { index: 34, name: "BKC",                  type: "property", color: "green",     price: 320, rent: 28  },
  { index: 35, name: "Eastern Railway",       type: "railroad", price: 200, rent: 25 },
  { index: 36, name: "Lucky Draw",            type: "chance" },
  { index: 37, name: "Rashtrapati Bhavan",    type: "property", color: "darkblue",  price: 350, rent: 35  },
  { index: 38, name: "GST",                  type: "tax",      tax: 100 },
  { index: 39, name: "Taj Mahal",             type: "property", color: "darkblue",  price: 400, rent: 50  },
];

export const BOARD_SIZE    = 40;
export const GO_SALARY     = 200;
export const JAIL_POSITION = 10;

export function isPurchasable(type: string): boolean {
  return type === "property" || type === "railroad" || type === "utility";
}
