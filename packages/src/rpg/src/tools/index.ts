import {
  createAskPlayersTool,
  createReadCampaignTool,
  createRecordImportantMemoryTool,
  createSavePlayerCharacterTool,
  createUpdateSessionZeroTool,
  createUpdateCampaignStateTool,
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
    updateCampaignState: createUpdateCampaignStateTool(context.campaignId),
    rollDice: createRollDiceTool(context),
    askPlayers: createAskPlayersTool(context.campaignId),
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
