export type Mode = 'marshrutka' | 'bus' | 'trolleybus' | 'tram' | 'suburban' | 'metro';
export interface District {
  id: number; name: string; type: string; x: number; y: number;
  population: number; jobs: number; pull: number; density: number;
  landValue: number; accessibility: number;
}
export interface Route { id: number; mode: Mode; stops: number[]; vehicles: number; served: number; }
export interface Ledger { tickets: number; advertising: number; subsidy: number; rent: number; wages: number; energy: number; maintenance: number; depreciation: number; interest: number; construction: number; purchases: number; storyReceipts: number; storyPayments: number; }
export type GoalSlot = 'quick' | 'medium' | 'long';
export type Goal = { id: number; slot: GoalSlot } & (
  { kind: 'connect'; from: number; to: number } |
  { kind: 'passengers'; baseline: number; target: number } |
  { kind: 'coverage'; target: number }
);
export interface GoalState { active: Goal[]; nextId: number; completed: number; links: string[]; earned: number; lastCompleted: Goal | null; }
export interface World {
  version: 6;
  story: string[];
  goals: GoalState;
  development: Development[]; expansion: { index: number; since: number; until: number } | null;
  mobility: { transit: number; taxi: number; car: number; walk: number }; seed: number; minute: number; remainder: number; money: number;
  satisfaction: number; trust: number; ecology: number; districts: District[]; routes: Route[];
  fleet: number; fleets: Record<Mode, number>; wear: Record<Mode, number>;
  fare: number; nextRoute: number; served: number; missed: number;
  income: number; expenses: number; lastGrowth: number; queues: number[][]; demand: number[];
  ledger: Ledger; debt: number; gameOver: boolean;
  event: { id: string; until: number } | null; nextEvent: { id: string; at: number };
}
export type Command = { type: 'storyChoice'; choice: string } | { type: 'buildRoute'; stops: number[]; mode?: Mode } |
  { type: 'changeRouteMode'; routeId: number; mode: Mode } |
  { type: 'editRoute'; routeId: number; stops: number[] } |
  { type: 'buyVehicle'; mode?: Mode } | { type: 'assignVehicle'; routeId: number } |
  { type: 'releaseVehicle'; routeId: number } | { type: 'setFare'; fare: number } |
  { type: 'serviceFleet'; mode: Mode } | { type: 'takeLoan' } | { type: 'repayLoan' } |
  { type: 'removeRoute'; routeId: number };
export type Result = { ok: true } | { ok: false; error: string };

export interface Development { phase: 'occupied' | 'construction' | 'renovation' | 'abandoned' | 'park'; since: number; until: number; level: number; badDays: number; capacity: number; growthRemainder: number; }
