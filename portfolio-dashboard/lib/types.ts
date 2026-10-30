export type Holding = {
  ticker: string;
  shares: number;
  cost?: number;
  costKind?: "total" | "perShare";
  account?: string;
  openDate?: string;
};

export type Call = [firm: string, target: number, date: string];

export type TargetSet = {
  avg: number;
  low: number;
  high: number;
  median?: number;
  n?: number;
};

export type TickerMarket = {
  ticker: string;
  name: string;
  sector?: string;
  price: number;
  prevClose: number;
  beta?: number | null;
  sp: TargetSet | null;
  zacks: TargetSet | null;
  calls: Call[];
  prevTargets?: { sp: TargetSet | null; zacks: TargetSet | null };
  tgtDate?: string;
  modeled?: boolean;
  next?: { date: string; what: string; conf: boolean };
  events?: { date: string; what: string; conf: boolean }[];
  er?: {
    hist: [date: string, surprisePct: number | null, movePct: number | null][];
  };
  closes: [date: string, close: number][];
  errors: Record<string, string>;
};
