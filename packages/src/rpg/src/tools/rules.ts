import { tool } from "ai";
import { z } from "zod";
import type { CampaignRuleset } from "../db/campaignRepository";
import { dndRuleCategories, searchDndRules } from "../rules/dnd5eApi";

export function createSearchDndRulesTool(ruleset: CampaignRuleset) {
  return tool({
    description:
      "Consulta a fonte aberta oficial SRD de D&D 5e da edição da campanha. Use termos em inglês e consulte quando uma regra exata afetar a resposta.",
    inputSchema: z.object({
      category: z.enum(dndRuleCategories).describe(
        "Categoria SRD: regras, condições, magias, classes, talentos, equipamento, propriedades, perícias ou atributos",
      ),
      query: z.string().min(2).max(100).describe("Nome ou tópico em inglês, por exemplo Fireball, Grappled ou Advantage"),
    }),
    execute: ({ category, query }) => searchDndRules({ ruleset, category, query }),
  });
}
