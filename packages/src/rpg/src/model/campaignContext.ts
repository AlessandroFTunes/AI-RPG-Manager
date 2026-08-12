import {
  getCampaignById,
  getRecentCampaignEvents,
  getRecentCampaignMessages,
} from "../db/campaignRepository";

export async function buildCampaignContext(campaignId: string) {
  const [campaign, recentMessages, recentEvents] = await Promise.all([
    getCampaignById(campaignId),
    getRecentCampaignMessages(campaignId, 24),
    getRecentCampaignEvents(campaignId, 20),
  ]);

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  return { campaign, recentMessages, recentEvents };
}
