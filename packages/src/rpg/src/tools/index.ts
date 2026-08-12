import {
  createAskPlayersTool,
  createReadCampaignTool,
  createRecordImportantMemoryTool,
  createUpdateCampaignStateTool,
} from "./campaign";
import { createRollDiceTool } from "./dice";

export function createTools(context: { campaignId: string; authorId?: string }) {
  return {
    readCampaign: createReadCampaignTool(context.campaignId),
    updateCampaignState: createUpdateCampaignStateTool(context.campaignId),
    rollDice: createRollDiceTool(context),
    askPlayers: createAskPlayersTool(context.campaignId),
    recordImportantMemory: createRecordImportantMemoryTool(context.campaignId),
  };
}

export { rollDiceExpression } from "./dice";
