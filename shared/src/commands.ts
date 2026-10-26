import { z } from 'zod';
import { BUDGET_CATEGORIES, TAXES, UNIT_TYPES } from './types.js';

/**
 * Comandos que un gobierno (humano o IA) puede emitir. Todos pasan por el mismo
 * validador y aplicador del motor de simulación: la IA no tiene atajos.
 */
const id = z.string().min(1).max(64);
const budgetShape = Object.fromEntries(BUDGET_CATEGORIES.map((k) => [k, z.number().min(0).max(40).optional()]));
const taxShape = Object.fromEntries(TAXES.map((k) => [k, z.number().min(0).max(0.95).optional()]));

export const treatyTypeSchema = z.enum([
  'trade_agreement', 'non_aggression', 'defensive_alliance', 'military_alliance', 'energy_agreement',
  'science_cooperation', 'customs_union', 'migration_cooperation', 'economic_aid', 'loan',
  'military_access', 'peace', 'ceasefire', 'territorial_cession', 'unification', 'recognition',
  'debt_relief', 'mediation', 'join_organization'
]);

export const termsSchema = z.object({
  amount: z.number().min(0).max(1e6).optional(),
  monthly: z.number().min(0).max(1e5).optional(),
  months: z.number().int().min(1).max(600).optional(),
  rate: z.number().min(0).max(0.5).optional(),
  years: z.number().int().min(1).max(50).optional(),
  provinces: z.array(id).max(200).optional(),
  provincesTo: id.optional(),
  reparations: z.number().min(0).max(1e6).optional(),
  demilitarized: z.array(id).max(200).optional(),
  recognize: id.optional(),
  organization: id.optional(),
  warId: id.optional(),
  truceYears: z.number().int().min(0).max(30).optional(),
  share: z.number().min(0).max(1).optional(),
  mediator: id.optional()
}).strict();

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setBudget'), budget: z.object(budgetShape).strict() }),
  z.object({ type: z.literal('setTaxes'), taxes: z.object(taxShape).strict() }),
  z.object({ type: z.literal('setMonetary'), policyRate: z.number().min(0).max(1).optional(), monetization: z.number().min(0).max(1).optional() }),
  z.object({ type: z.literal('proposeLaw'), law: id, option: id }),
  z.object({ type: z.literal('withdrawBill'), bill: id }),
  z.object({
    type: z.literal('privatize'), sector: id, percent: z.number().min(0.05).max(1),
    method: z.enum(['auction', 'public_offering', 'direct_sale']),
    buyers: z.enum(['domestic', 'foreign_allowed', 'workers']),
    regulation: z.enum(['light', 'regulator', 'price_caps']),
    labor: z.enum(['keep_jobs', 'flexible']),
    proceeds: z.enum(['debt', 'treasury', 'investment'])
  }),
  z.object({ type: z.literal('nationalize'), sector: id, percent: z.number().min(0.05).max(1), compensation: z.enum(['full', 'partial', 'none']) }),
  z.object({ type: z.literal('buildProject'), province: id, kind: z.enum(['road', 'port', 'airport', 'power_plant', 'industrial_zone', 'military_base', 'fortification', 'refinery', 'university']) }),
  z.object({ type: z.literal('cancelProject'), project: id }),
  z.object({ type: z.literal('setResearch'), queue: z.array(id).max(6) }),
  z.object({ type: z.literal('borrow'), amount: z.number().positive().max(1e6) }),
  z.object({ type: z.literal('repayDebt'), amount: z.number().positive().max(1e6) }),
  z.object({ type: z.literal('declareDefault') }),
  z.object({ type: z.literal('restructureDebt'), haircut: z.number().min(0).max(0.8) }),
  z.object({ type: z.literal('recruit'), unitType: z.enum(UNIT_TYPES), province: id, count: z.number().int().min(1).max(10).optional() }),
  z.object({ type: z.literal('disbandUnit'), unit: id }),
  z.object({ type: z.literal('orderUnits'), units: z.array(id).min(1).max(100), order: z.enum(['move', 'attack', 'defend', 'hold', 'retreat', 'blockade', 'patrol', 'embark', 'disembark', 'air_superiority', 'ground_support', 'interdiction', 'bombing', 'recon', 'rebase', 'sabotage']), target: id.nullable() }),
  z.object({ type: z.literal('createPlan'), kind: z.enum(['front_defense', 'offensive']), units: z.array(id).min(1).max(200), targets: z.array(id).max(50), enemy: id.nullable() }),
  z.object({ type: z.literal('cancelPlan'), plan: id }),
  z.object({ type: z.literal('setProduction'), production: z.object({ arms: z.number().min(0), vehicles: z.number().min(0), aircraft: z.number().min(0), ships: z.number().min(0) }) }),
  z.object({ type: z.literal('setDoctrine'), doctrine: z.enum(['defensive', 'balanced', 'offensive']) }),
  z.object({ type: z.literal('diploPropose'), to: id, proposal: treatyTypeSchema, terms: termsSchema, message: z.string().max(1000).optional() }),
  z.object({ type: z.literal('diploRespond'), proposal: id, response: z.enum(['accept', 'reject']), counter: termsSchema.optional() }),
  z.object({ type: z.literal('diploWithdraw'), proposal: id }),
  z.object({ type: z.literal('diploAction'), to: id, action: z.enum(['sanction', 'lift_sanctions', 'recall_ambassador', 'restore_embassy', 'recognize', 'withdraw_recognition', 'improve_relations', 'denounce']) }),
  z.object({ type: z.literal('cancelTreaty'), treaty: id }),
  z.object({ type: z.literal('createOrganization'), name: z.string().min(3).max(60), kind: z.enum(['economic', 'military', 'political', 'scientific']) }),
  z.object({ type: z.literal('leaveOrganization'), organization: id }),
  z.object({ type: z.literal('declareWar'), target: id, goal: z.enum(['conquest', 'claims', 'punitive', 'regime_change']), provinces: z.array(id).max(100) }),
  z.object({ type: z.literal('warReady'), war: id }),
  z.object({ type: z.literal('withdrawDeclaration'), war: id }),
  z.object({ type: z.literal('callToArmsRespond'), war: id, accept: z.boolean() }),
  z.object({ type: z.literal('resolveDecision'), decision: id, option: id }),
  z.object({ type: z.literal('setDirectives'), directives: z.object({ balanceBudget: z.boolean(), continueResearch: z.boolean(), maintainGarrison: z.boolean(), autoDecisions: z.boolean(), acceptFriendlyTrade: z.boolean() }) })
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

export interface CommandResult { ok: boolean; error?: string; message?: string; data?: Record<string, unknown> }

/** Envoltorio de transporte: commandId lo genera el cliente (UUID) y garantiza idempotencia. */
export interface CommandEnvelope { commandId: string; command: Command }
