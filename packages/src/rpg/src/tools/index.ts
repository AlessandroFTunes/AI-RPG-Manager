import {
  createAdjustRelationshipTool,
  createAdvanceWorldTimeTool,
  createAskPlayersTool,
  createChangeInventoryTool,
  createReadCampaignTool,
  createRequestAmbientMusicTool,
  createRecordImportantMemoryTool,
  createSavePlayerCharacterTool,
  createUpdateSessionZeroTool,
  createUpdateNarrativeTool,
  createUpsertLocationTool,
  createUpsertNpcTool,
  createUpsertQuestTool,
} from "./campaign";
import type { CampaignRuleset } from "../db/campaignRepository";
import { createRollDiceTool } from "./dice";
import { createSearchDndRulesTool } from "./rules";

export function createTools(context: {
  campaignId: string;
  authorId?: string;
  ruleset: CampaignRuleset;
}) {
  const tools = {
    readCampaign: createReadCampaignTool(context.campaignId),
    updateNarrative: createUpdateNarrativeTool(context.campaignId, context.authorId),
    upsertNpc: createUpsertNpcTool(context.campaignId, context.authorId),
    upsertLocation: createUpsertLocationTool(context.campaignId, context.authorId),
    upsertQuest: createUpsertQuestTool(context.campaignId, context.authorId),
    changeInventory: createChangeInventoryTool(context.campaignId, context.authorId),
    adjustRelationship: createAdjustRelationshipTool(context.campaignId, context.authorId),
    advanceWorldTime: createAdvanceWorldTimeTool(context.campaignId, context.authorId),
    rollDice: createRollDiceTool(context),
    askPlayers: createAskPlayersTool(context.campaignId),
    requestAmbientMusic: createRequestAmbientMusicTool(context.campaignId, context.authorId),
    recordImportantMemory: createRecordImportantMemoryTool(context.campaignId, context.authorId),
  };

  return context.ruleset === "narrative"
    ? tools
    : { ...tools, searchDndRules: createSearchDndRulesTool(context.ruleset) };
}

export function createSetupTools(context: {
  campaignId: string;
  playerId: string;
  playerName: string;
  ruleset: CampaignRuleset;
}) {
  const tools = {
    readCampaign: createReadCampaignTool(context.campaignId),
    updateSessionZero: createUpdateSessionZeroTool(context.campaignId),
    savePlayerCharacter: createSavePlayerCharacterTool(context.campaignId, {
      id: context.playerId,
      name: context.playerName,
    }),
  };

  return context.ruleset === "narrative"
    ? tools
    : { ...tools, searchDndRules: createSearchDndRulesTool(context.ruleset) };
}

export { rollDiceExpression } from "./dice";
