import type { AutomationPack, AutomationPackRule } from '@candydati/domain';
import type { MemberDirectory } from './automation-ports.js';
import type { EmailTemplateRepository } from './messaging-ports.js';

/** Automation packs and their rules. Every method takes the organization. */
export interface AutomationPackRepository {
  create(pack: AutomationPack): Promise<AutomationPack>;
  /** Full replace of name, description and `updatedAt` by (organizationId, id). */
  save(pack: AutomationPack): Promise<AutomationPack>;
  findById(organizationId: string, id: string): Promise<AutomationPack | null>;
  /** Case-insensitive: two packs of an organization never share a name. */
  findByName(organizationId: string, name: string): Promise<AutomationPack | null>;
  /** By name. */
  list(organizationId: string): Promise<readonly AutomationPack[]>;
  /** Removes the pack and its rules; jobs keep their copies. True when a pack was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
  /** Rules per pack; packs without rules are absent. */
  countRules(organizationId: string): Promise<Readonly<Record<string, number>>>;
  createRule(rule: AutomationPackRule): Promise<AutomationPackRule>;
  saveRule(rule: AutomationPackRule): Promise<AutomationPackRule>;
  findRule(organizationId: string, id: string): Promise<AutomationPackRule | null>;
  /** Oldest first. */
  listRules(organizationId: string, packId: string): Promise<readonly AutomationPackRule[]>;
  /** True when a rule was deleted. */
  deleteRule(organizationId: string, id: string): Promise<boolean>;
}

/** Which packs a job template brings, in order. */
export interface JobTemplatePackRepository {
  listByTemplate(organizationId: string, templateId: string): Promise<readonly string[]>;
  /** Template ids per pack; packs no template uses are absent. */
  templatesByPack(organizationId: string): Promise<Readonly<Record<string, readonly string[]>>>;
  /** Replaces the template's packs with these, in this order. */
  replace(organizationId: string, templateId: string, packIds: readonly string[]): Promise<void>;
}

/** What copying a pack into a job reads: the packs, the template links, and what a copied rule may name. */
export interface PackSources {
  readonly automationPacks: AutomationPackRepository;
  readonly templatePacks: JobTemplatePackRepository;
  readonly templates: EmailTemplateRepository;
  readonly members: MemberDirectory;
}
