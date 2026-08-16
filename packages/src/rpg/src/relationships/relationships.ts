export const relationshipEntityTypes = ["character", "npc", "faction"] as const;
export type RelationshipEntityType = typeof relationshipEntityTypes[number];

export const relationshipDimensions = [
  "trust",
  "friendship",
  "fear",
  "respect",
  "romance",
  "resentment",
  "debt",
] as const;
export type RelationshipDimension = typeof relationshipDimensions[number];
export type RelationshipScores = Record<RelationshipDimension, number>;

export type RelationshipParty = {
  type: RelationshipEntityType;
  id: string;
  name: string;
};

export type CampaignRelationship = {
  id: string;
  source: RelationshipParty;
  target: RelationshipParty;
  scores: RelationshipScores;
  updatedAt: string;
};

export type RelationshipDeltas = Partial<RelationshipScores>;

export type AdjustRelationshipInput = {
  source: RelationshipParty;
  target: RelationshipParty;
  deltas: RelationshipDeltas;
  now?: string;
};

const initialScores: RelationshipScores = {
  trust: 50,
  friendship: 0,
  fear: 0,
  respect: 50,
  romance: 0,
  resentment: 0,
  debt: 0,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function relationshipId(source: RelationshipParty, target: RelationshipParty) {
  return `${source.type}:${source.id}->${target.type}:${target.id}`;
}

export function adjustRelationships(
  relationships: CampaignRelationship[],
  input: AdjustRelationshipInput,
) {
  if (input.source.type === input.target.type && input.source.id === input.target.id) {
    throw new Error("Uma entidade não pode ter relacionamento consigo mesma.");
  }

  const id = relationshipId(input.source, input.target);
  const existing = relationships.find((relationship) => relationship.id === id);
  const scores = { ...(existing?.scores ?? initialScores) };

  for (const dimension of relationshipDimensions) {
    const delta = input.deltas[dimension];
    if (delta !== undefined) scores[dimension] = clampScore(scores[dimension] + delta);
  }

  const relationship: CampaignRelationship = {
    id,
    source: input.source,
    target: input.target,
    scores,
    updatedAt: input.now ?? new Date().toISOString(),
  };
  const nextRelationships = relationships.filter((candidate) => candidate.id !== id);
  nextRelationships.push(relationship);

  return { relationships: nextRelationships, relationship };
}

export function getNarrativeRelationshipView(relationship: CampaignRelationship) {
  const { scores } = relationship;
  const attitudes: string[] = [];

  if (scores.trust <= 20) attitudes.push("desconfia profundamente");
  else if (scores.trust < 45) attitudes.push("desconfia");
  else if (scores.trust >= 85) attitudes.push("confia plenamente");
  else if (scores.trust >= 65) attitudes.push("confia");

  if (scores.friendship >= 80) attitudes.push("considera uma amizade muito próxima");
  else if (scores.friendship >= 55) attitudes.push("sente amizade");
  else if (scores.friendship >= 25) attitudes.push("sente simpatia");

  if (scores.fear >= 80) attitudes.push("sente terror");
  else if (scores.fear >= 55) attitudes.push("sente medo");
  else if (scores.fear >= 25) attitudes.push("age com receio");

  if (scores.respect <= 20) attitudes.push("despreza");
  else if (scores.respect < 40) attitudes.push("demonstra pouco respeito");
  else if (scores.respect >= 85) attitudes.push("admira profundamente");
  else if (scores.respect >= 65) attitudes.push("respeita");

  if (scores.romance >= 80) attitudes.push("está profundamente apaixonado");
  else if (scores.romance >= 55) attitudes.push("tem interesse romântico claro");
  else if (scores.romance >= 25) attitudes.push("demonstra interesse romântico discreto");

  if (scores.resentment >= 80) attitudes.push("guarda rancor intenso");
  else if (scores.resentment >= 55) attitudes.push("guarda ressentimento");
  else if (scores.resentment >= 25) attitudes.push("está incomodado com acontecimentos passados");

  if (scores.debt >= 80) attitudes.push("acredita ter uma dívida de vida");
  else if (scores.debt >= 55) attitudes.push("sente uma grande dívida");
  else if (scores.debt >= 25) attitudes.push("sente que deve um favor");

  return {
    id: relationship.id,
    source: relationship.source,
    target: relationship.target,
    attitudes: attitudes.length > 0 ? attitudes : ["mantém uma relação neutra"],
  };
}
