import type { CampaignRuleset } from "../db/campaignRepository";

const API_BASE_URL = "https://www.dnd5eapi.co";
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_SOURCE_LENGTH = 12_000;

export const dndRuleCategories = [
  "rules",
  "rule-sections",
  "conditions",
  "spells",
  "classes",
  "feats",
  "equipment",
  "weapon-properties",
  "skills",
  "ability-scores",
] as const;

export type DndRuleCategory = typeof dndRuleCategories[number];
type DndEdition = "2014" | "2024";

type ApiReference = {
  index: string;
  name: string;
  url: string;
};

type ApiCollection = {
  count: number;
  results: ApiReference[];
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export type DndRuleSearchResult = {
  found: boolean;
  requestedEdition: DndEdition;
  sourceEdition: DndEdition;
  fallback: boolean;
  fallbackReason?: string;
  category: DndRuleCategory;
  query: string;
  name?: string;
  sourceUrl?: string;
  source?: string;
  suggestions?: string[];
};

const cache = new Map<string, CacheEntry>();

function editionFromRuleset(ruleset: CampaignRuleset): DndEdition | null {
  if (ruleset === "dnd5e-2014") return "2014";
  if (ruleset === "dnd5e-2024") return "2024";
  return null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreReference(reference: ApiReference, query: string) {
  const name = normalizeSearchText(reference.name);
  const normalizedQuery = normalizeSearchText(query);
  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 80;
  if (name.includes(normalizedQuery)) return 60;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  return terms.reduce((score, term) => score + (name.includes(term) ? 10 : 0), 0);
}

function compactSource(value: unknown) {
  const source = JSON.stringify(value, (key, nestedValue) => {
    if (key === "updated_at" || key === "url") return undefined;
    if (Array.isArray(nestedValue) && nestedValue.length > 20) return nestedValue.slice(0, 20);
    return nestedValue;
  });

  return source.length <= MAX_SOURCE_LENGTH
    ? source
    : `${source.slice(0, MAX_SOURCE_LENGTH)}…`;
}

async function fetchJson(path: string) {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(path);
    cache.set(path, cached);
    return cached.value;
  }
  cache.delete(path);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const error = new Error(`D&D API returned ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }

  const value: unknown = await response.json();
  cache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  return value;
}

async function searchEdition(edition: DndEdition, category: DndRuleCategory, query: string) {
  const encodedQuery = encodeURIComponent(query.trim());
  const collection = await fetchJson(`/api/${edition}/${category}?name=${encodedQuery}`) as ApiCollection;
  let candidates = collection.results;

  if (candidates.length === 0) {
    const fullCollection = await fetchJson(`/api/${edition}/${category}`) as ApiCollection;
    candidates = fullCollection.results
      .map((reference) => ({ reference, score: scoreReference(reference, query) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((candidate) => candidate.reference);
  }

  const bestMatch = candidates
    .map((reference) => ({ reference, score: scoreReference(reference, query) }))
    .sort((left, right) => right.score - left.score)[0]?.reference;
  if (!bestMatch) return { candidates: [] as ApiReference[] };

  const detail = await fetchJson(bestMatch.url);
  return { bestMatch, detail, candidates: candidates.slice(0, 5) };
}

export async function searchDndRules(input: {
  ruleset: CampaignRuleset;
  category: DndRuleCategory;
  query: string;
}): Promise<DndRuleSearchResult> {
  const requestedEdition = editionFromRuleset(input.ruleset);
  if (!requestedEdition) {
    throw new Error("D&D rule search is unavailable for narrative campaigns");
  }

  let sourceEdition = requestedEdition;
  let fallbackReason: string | undefined;
  let result: Awaited<ReturnType<typeof searchEdition>>;

  try {
    result = await searchEdition(sourceEdition, input.category, input.query);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (requestedEdition !== "2024" || status !== 404) throw error;
    sourceEdition = "2014";
    fallbackReason = `A categoria ${input.category} não está disponível na fonte SRD 2024.`;
    result = await searchEdition(sourceEdition, input.category, input.query);
  }

  if (!result.bestMatch && requestedEdition === "2024") {
    sourceEdition = "2014";
    fallbackReason = `Nenhum resultado foi encontrado na fonte SRD 2024 para ${input.query}.`;
    result = await searchEdition(sourceEdition, input.category, input.query);
  }

  if (!result.bestMatch) {
    return {
      found: false,
      requestedEdition,
      sourceEdition,
      fallback: sourceEdition !== requestedEdition,
      fallbackReason,
      category: input.category,
      query: input.query,
      suggestions: result.candidates.map((candidate) => candidate.name),
    };
  }

  return {
    found: true,
    requestedEdition,
    sourceEdition,
    fallback: sourceEdition !== requestedEdition,
    fallbackReason,
    category: input.category,
    query: input.query,
    name: result.bestMatch.name,
    sourceUrl: `${API_BASE_URL}${result.bestMatch.url}`,
    source: compactSource(result.detail),
    suggestions: result.candidates
      .filter((candidate) => candidate.index !== result.bestMatch?.index)
      .map((candidate) => candidate.name),
  };
}

export function clearDndRulesCache() {
  cache.clear();
}
