# Planejamento do Motor de RPG Narrativo Persistente

## 1. Visão do produto

Construir um bot de Discord que funcione como um motor de RPG narrativo persistente, e não apenas como uma interface de conversa com uma LLM.

O sistema deve assumir, de forma coordenada, os papéis de:

- Mestre narrativo;
- motor de regras e dados;
- simulador de mundo;
- memória da campanha;
- ficha e inventário;
- diretor de cena;
- diretor de música e efeitos;
- intérprete de NPCs por texto e voz;
- diário, mapa e codex da campanha.

A LLM deve interpretar intenções e produzir narrativa. Dados objetivos, regras, rolagens, conhecimento, tempo, posição e consequências devem ser controlados por código e persistidos no PostgreSQL.

## 2. Objetivos

- Permitir que jogadores interajam principalmente por linguagem natural.
- Manter campanhas longas coerentes entre sessões e reinicializações.
- Impedir que narrador e NPCs revelem informações indevidas.
- Separar ficção, regras, estado e apresentação.
- Produzir consequências consistentes e duradouras.
- Fazer o mundo avançar mesmo fora da visão dos personagens.
- Combinar resultado mecânico e descrição cinematográfica.
- Adaptar ritmo, música, som e voz ao estado da cena.
- Oferecer comandos para consulta sem depender deles durante o jogo.

## 3. Princípios obrigatórios

### 3.1. A LLM não é a fonte da verdade

A LLM pode propor interpretações, falas e descrições. Ela não pode decidir sozinha:

- resultado de testes;
- dano, cura, recursos ou condições;
- posição de personagens;
- passagem de tempo;
- conteúdo de inventário;
- solução de mistérios;
- fatos já estabelecidos;
- conhecimento de cada personagem;
- consequências objetivas.

Esses dados devem vir de serviços determinísticos e do banco.

### 3.2. Separação de conhecimento

Toda informação relevante deve ter escopo de visibilidade:

```text
world_truth         Verdade canônica do mundo e do Mestre
player_knowledge    Informação conhecida pelo jogador
character_knowledge Informação conhecida por um personagem
npc_knowledge       Informação conhecida por um NPC específico
public_knowledge    Informação pública em uma região ou facção
```

O contexto enviado ao narrador deve ser filtrado para a cena e para os participantes atuais. Segredos não podem entrar no prompt público apenas com uma instrução para a LLM não revelá-los.

### 3.3. Regras antes da narrativa

```text
Mensagem do jogador
        |
        v
Classificação da intenção
        |
        v
Validação do estado e das regras
        |
        v
Rolagem e resolução determinística
        |
        v
Aplicação atômica das mudanças
        |
        v
Narrativa baseada no resultado
        |
        v
Discord, voz, música e efeitos
```

### 3.4. O jogador mantém a própria agência

- O narrador não decide ações, falas, emoções ou pensamentos do personagem do jogador.
- Ações impossíveis devem ser explicadas pelo estado do mundo, não bloqueadas arbitrariamente.
- Soluções não previstas devem ser resolvidas pelas mesmas regras das soluções esperadas.
- Falhas devem alterar a situação, não apenas interromper a história.

### 3.5. Estado validado e alterações auditáveis

- Toda alteração importante gera um evento na linha do tempo.
- Operações mecânicas devem ser transacionais e idempotentes.
- Estruturas persistidas devem ter esquema e versão.
- A narrativa nunca deve substituir diretamente o estado completo da campanha.
- Eventos canônicos devem registrar ator, causa, momento do mundo e momento real.

## 4. Estado atual do projeto

O repositório já oferece uma base funcional:

- bot de RPG em Bun, TypeScript e Discord.js;
- campanha por thread do Discord;
- sessão zero e cadastro narrativo inicial de personagens;
- mensagens livres durante a campanha;
- persistência PostgreSQL com estado JSONB;
- histórico de mensagens, eventos e rolagens;
- rolagens determinísticas em código;
- suporte inicial a regras narrativas e D&D 5e;
- ferramentas da IA para consultar e alterar campanha;
- resumo e memória importante;
- TTS com narrador e perfis de voz para NPCs;
- solicitação automática de música ambiente para o bot de música;
- fila por campanha para reduzir concorrência entre mensagens.

Essa base é um protótipo útil, mas o estado ainda é amplo, a memória não possui controle fino de conhecimento e a LLM ainda acumula responsabilidades que devem migrar para serviços especializados.

## 5. Arquitetura-alvo

```text
Discord Gateway
      |
      v
Interaction Orchestrator
      |
      +--> Intent Parser
      +--> Context Builder / Knowledge Filter
      +--> Rules Engine
      +--> Spatial Engine
      +--> Time and Travel Engine
      +--> World Simulator
      +--> NPC Agent
      +--> Narrative Director
      +--> Narrator
      +--> Memory Projector
      +--> Music Director
      +--> SFX Director
      +--> TTS / Voice Cast
      |
      v
PostgreSQL + jobs persistentes
```

### 5.1. Interaction Orchestrator

Responsável por executar uma interação do começo ao fim:

1. Receber e deduplicar a mensagem.
2. Carregar campanha, cena, participantes e estado necessário.
3. Classificar intenção sem produzir consequências.
4. Consultar conhecimento e percepção permitidos.
5. Encaminhar a intenção ao motor adequado.
6. Aplicar mudanças em uma transação.
7. Registrar eventos canônicos.
8. Solicitar a narrativa do resultado.
9. Publicar texto e acionar mídia.

Cada interação deve possuir um `interaction_id` para impedir efeitos duplicados após erros ou novas tentativas.

### 5.2. Intent Parser

Converte texto livre em uma estrutura validada:

```json
{
  "type": "attack",
  "actorId": "character-alessandro",
  "targets": ["npc-cultist-1"],
  "method": "longsword",
  "dialogue": null,
  "declaredIntent": "ferir e afastar o cultista",
  "confidence": 0.94,
  "needsClarification": false
}
```

Tipos iniciais:

- `dialogue`;
- `movement`;
- `inspect`;
- `skill_attempt`;
- `attack`;
- `cast_spell`;
- `use_item`;
- `rest`;
- `travel`;
- `meta_question`;
- `unknown`.

Uma classificação não executa a ação. Ela apenas representa o que o jogador declarou.

### 5.3. Rules Engine

Responsável por:

- dados e modificadores;
- vantagem e desvantagem;
- CDs e testes opostos;
- iniciativa e turnos;
- ataques, defesa e dano;
- HP, morte e estabilização;
- condições e duração;
- magias, slots e concentração;
- recursos por descanso;
- inventário e carga;
- experiência, marcos e níveis.

O motor deve expor adaptadores por sistema:

```text
RulesEngine
├── NarrativeRuleset
├── Dnd5e2014Ruleset
└── Dnd5e2024Ruleset
```

Todas as resoluções retornam um resultado estruturado que possa ser testado sem Discord ou LLM.

### 5.4. Context Builder e memória

O contexto não deve ser apenas as últimas mensagens. Ele deve reunir:

- cena atual;
- participantes presentes;
- posição e condições perceptivas;
- estado mecânico relevante;
- fatos conhecidos por cada participante;
- eventos recentes;
- memórias recuperadas por relevância;
- objetivos e personalidade dos NPCs presentes;
- ritmo definido pelo Narrative Director;
- resultado mecânico que precisa ser narrado.

O contexto deve ter orçamento de tokens e fontes identificáveis. O histórico bruto é apoio, não a memória principal.

### 5.5. World Simulator

Executa ações independentes de facções, NPCs e ameaças quando o relógio avança.

Exemplo:

```text
Dia 14: missão ignorada
Dia 16: goblins atacam a fazenda
Dia 18: comida fica mais cara
Dia 21: refugiados chegam à cidade
Dia 25: a guarda fecha a estrada
```

O simulador deve usar agendas e eventos programados, não gerar acontecimentos aleatórios em toda interação. Nada acontecer também é um resultado válido.

### 5.6. Narrative Director

Mantém métricas de cena, por exemplo:

```json
{
  "tension": 0.8,
  "mystery": 0.6,
  "danger": 0.7,
  "pace": "fast",
  "recommendedBeat": "release"
}
```

Ele recomenda ritmo e tipo de cena, mas não altera fatos nem força escolhas. Depois de sequências intensas, deve favorecer descanso, conversa, exploração ou silêncio.

### 5.7. Narrator

Recebe somente dados autorizados e um resultado já resolvido. É responsável por:

- descrição sensorial contextual;
- voz e comportamento dos NPCs;
- distinção entre narração, fala e ação;
- adaptação de ritmo e extensão;
- apresentação de consequências;
- pergunta final quando uma nova decisão for necessária.

Exemplo de entrada mecânica:

```json
{
  "attackRoll": 19,
  "targetArmorClass": 14,
  "damage": 8,
  "damageType": "slashing",
  "targetHpBefore": 11,
  "targetHpAfter": 3
}
```

Exemplo de saída:

```text
Sua lâmina atravessa a defesa do cultista. Ele recua antes que o golpe o atravesse por completo, mas cambaleia segurando o ferimento.

🎲 19 | ⚔️ 8 de dano
```

## 6. Modelo de domínio

O domínio principal deve evoluir para:

```text
Campaign
├── WorldState
│   ├── Calendar
│   ├── Weather
│   ├── Economy
│   └── GlobalEvents
├── Scenes
├── Characters
├── NPCs
├── Locations
├── Routes
├── Factions
├── Quests
├── Mysteries
├── Secrets
├── Knowledge
├── Relationships
├── Encounters
├── Inventory
├── ScheduledEvents
└── Timeline
```

### 6.1. Entidades essenciais

| Entidade | Responsabilidade |
| --- | --- |
| `campaigns` | Configuração, status e versão do estado da campanha |
| `characters` | Identidade, ficha, recursos e posição dos personagens |
| `npcs` | Personalidade, objetivos, agenda, voz e estado do NPC |
| `locations` | Hierarquia espacial, ambiente, terreno e pontos de interesse |
| `location_edges` | Rotas, distância, requisitos e tempo-base de deslocamento |
| `scenes` | Participantes, local, iluminação, clima, ritmo e estado atual |
| `factions` | Objetivos, recursos, relações, reputação e planos |
| `relationships` | Relações direcionais e multidimensionais entre entidades |
| `quests` | Objetivos, etapas, prazo e estado real da missão |
| `mysteries` | Verdade imutável, evidências, pistas e conclusões possíveis |
| `knowledge_facts` | Fatos canônicos com origem, validade e sensibilidade |
| `knowledge_owners` | Quais entidades conhecem cada fato e com qual confiança |
| `inventory_items` | Posse, quantidade, estado, carga e propriedades |
| `encounters` | Combate, iniciativa, rodadas, turnos e participantes |
| `scheduled_events` | Consequências e ações futuras aguardando o relógio do mundo |
| `timeline_events` | Registro append-only de mudanças canônicas |
| `session_journals` | Resumo público e registro privado do Mestre |
| `media_cues` | Música, ambiente, SFX e voz associados a cenas e eventos |

JSONB continua útil para configurações e atributos variáveis. Dados consultados, relacionados ou alterados com frequência devem ganhar tabelas e restrições próprias.

### 6.2. Conhecimento e segredos

Um fato deve conter ao menos:

```text
id
campaign_id
subject_type / subject_id
predicate
value
truth_status
sensitivity
source_event_id
valid_from / valid_until
```

A associação de conhecimento deve conter:

```text
fact_id
knower_type / knower_id
learned_at
confidence
source
```

Isso permite que Bram saiba que Alessandro salvou sua vida sem saber que Alessandro roubou um artefato.

### 6.3. Relacionamentos

Relacionamentos são direcionais. `Lyra -> Alessandro` pode ser diferente de `Alessandro -> Lyra`.

Dimensões iniciais:

- confiança;
- amizade;
- medo;
- respeito;
- romance;
- ressentimento;
- dívida.

Os valores ficam ocultos. O jogador percebe mudanças apenas por comportamento, diálogo e pistas ficcionais.

### 6.4. Localização espacial

Localizações formam uma hierarquia:

```text
Floresta Negra
└── Ruínas de Velaris
    └── Segundo andar
        └── Biblioteca
            └── perto da janela
```

O motor espacial deve calcular:

- co-localização;
- linha de visão;
- alcance auditivo;
- iluminação e visibilidade;
- cobertura;
- terreno;
- distância e rota;
- velocidade e duração de viagem;
- rotas descobertas por personagem ou grupo.

### 6.5. Mistérios persistentes

Cada mistério deve ser criado com uma verdade fixa antes da investigação:

```text
Verdade canônica
      |
      +--> evidências físicas
      +--> pistas interpretáveis
      +--> testemunhas
      +--> pistas falsas justificadas
      +--> condições de descoberta
```

Teorias dos jogadores não alteram retroativamente a solução. Novas pistas devem derivar da verdade já persistida.

## 7. Tempo, calendário e viagens

O `WorldClock` deve registrar data, hora, calendário e fuso ou região. Ações têm duração definida pelo motor.

O avanço do relógio executa, na ordem:

1. Atualização de duração de condições.
2. Consumo ou recuperação de recursos.
3. Mudança de clima e iluminação.
4. Eventos programados vencidos.
5. Agendas de NPCs e planos de facções.
6. Consequências econômicas e políticas.
7. Rumores e notícias que passam a circular.

Viagens devem considerar distância, rota, terreno, meio de transporte, clima, carga, ritmo e descanso. O motor divide a viagem em blocos e o diretor escolhe quais blocos merecem cena.

## 8. Percepção contextual

Informações observáveis devem possuir requisitos. O mesmo objeto pode produzir descrições diferentes:

- guerreiro: qualidade e prontidão da arma;
- mago: resíduos e escola de magia;
- ladino: posição da bainha e facilidade de saque;
- personagem local: símbolos culturais ou sotaques familiares.

O pipeline de percepção deve usar ficha, proficiências, posição, iluminação, condições e conhecimento anterior. Testes secretos devem ocultar rolagem e falha quando apropriado.

## 9. Música, som e voz

### 9.1. Música dinâmica

Estados iniciais:

```text
exploration, mystery, tavern, emotional, horror, combat,
boss, chase, victory, death, camp
```

Cada cena produz uma direção estruturada:

```json
{
  "mood": "mystery",
  "intensity": 0.3,
  "transitionSeconds": 8,
  "replaceCurrent": false
}
```

O Music Director deve evitar trocas frequentes e preferir transições graduais.

### 9.2. Ambiente e efeitos

Eventos podem emitir sugestões independentes de ambiente e efeito:

```json
{
  "ambient": "rain_forest",
  "sfx": ["distant_thunder", "branch_snap"]
}
```

SFX nunca deve atrasar a resposta textual. A fila de mídia precisa de prioridade, cooldown, cancelamento e fallback silencioso.

### 9.3. Voz de NPCs

Cada NPC mantém uma voz estável:

```json
{
  "voiceProfile": "male_old_soft",
  "speed": 0.85,
  "defaultEmotion": "worried"
}
```

O narrador usa uma voz própria. Personagens dos jogadores não têm suas falas sintetizadas como se fossem ditas por eles, salvo configuração explícita.

## 10. Comandos planejados

O jogo comum deve exigir poucos comandos. Os comandos existem para controle e consulta:

| Comando | Finalidade |
| --- | --- |
| `/rpg iniciar` | Criar campanha e sessão zero |
| `/rpg comecar` | Encerrar preparação e iniciar aventura |
| `/rpg ficha` | Exibir ficha do personagem |
| `/rpg inventario` | Consultar itens e recursos |
| `/rpg diario` | Exibir diário público desbloqueado |
| `/rpg mapa` | Exibir locais e rotas descobertos |
| `/rpg missoes` | Consultar missões conhecidas |
| `/rpg codex` | Consultar personagens, locais e facções conhecidos |
| `/rpg descansar` | Declarar descanso e iniciar sua resolução |
| `/rpg rolar` | Fazer uma rolagem manual |
| `/rpg regras` | Consultar regra ou conjunto ativo |
| `/rpg musica` | Configurar ou solicitar música |
| `/rpg recap` | Obter resumo para retomada |
| `/rpg pausar` | Pausar relógio e simulação |
| `/rpg continuar` | Retomar campanha pausada |
| `/rpg encerrar` | Encerrar campanha |

Respostas de ficha, inventário e codex devem ser privadas quando puderem revelar informações individuais.

## 11. Roadmap de implementação

### Fase 0: fundação técnica

Objetivo: tornar evolução e migrações seguras antes de ampliar o domínio.

- [ ] Adicionar versão explícita ao estado da campanha.
- [ ] Criar sistema incremental de migrações SQL.
- [ ] Definir schemas Zod para leitura e escrita de todo estado persistido.
- [ ] Introduzir `interaction_id` e idempotência.
- [ ] Substituir patches amplos de estado por operações de domínio específicas.
- [ ] Criar transações por interação e controle de concorrência no banco.
- [ ] Definir contratos compartilhados entre bot de RPG e bot de música.
- [ ] Adicionar logs estruturados com `campaign_id`, `interaction_id` e duração.

Critérios de aceite:

- Reiniciar ou repetir uma mensagem não duplica rolagens, dano, itens ou eventos.
- Estado inválido não é gravado.
- Duas instâncias do bot não processam simultaneamente a mesma campanha.
- Migrações podem ser aplicadas em uma base existente sem apagar campanhas.

### Fase 1: núcleo persistente e regras

Objetivo: estabelecer a fonte de verdade mínima para campanhas coerentes.

- [ ] Criar fichas estruturadas de personagem por ruleset.
- [ ] Implementar recursos, HP, condições, inventário e descanso.
- [ ] Criar Intent Parser com saída validada.
- [ ] Criar Rules Engine com interface por ruleset.
- [ ] Resolver ataques, testes e dano antes da chamada ao narrador.
- [ ] Implementar memória factual e controle de conhecimento.
- [ ] Implementar memória individual de NPCs.
- [ ] Criar eventos canônicos append-only.
- [ ] Montar contexto filtrado por personagem e cena.
- [ ] Adicionar testes unitários para toda resolução mecânica.

Critérios de aceite:

- A LLM não consegue conceder item, alterar HP ou concluir teste sem operação válida do motor.
- NPCs recebem somente fatos que conhecem.
- Uma ação idêntica produz estrutura de resolução reproduzível quando o dado é fixado em teste.
- Ficha, inventário e condições sobrevivem a reinicializações.
- Jogadores conseguem agir em linguagem natural sem usar `/rpg rolar`.

### Fase 2: tempo, espaço e campanha

Objetivo: tornar o mundo consistente e explorável.

- [ ] Implementar calendário e relógio do mundo.
- [ ] Registrar duração das ações.
- [ ] Criar hierarquia de locais e posição de entidades.
- [ ] Implementar visão, audição e presença em cena.
- [ ] Criar rotas, distâncias e velocidades.
- [ ] Implementar viagens em etapas.
- [ ] Criar relacionamentos multidimensionais e ocultos.
- [ ] Estruturar missões, objetivos, prazos e consequências.
- [ ] Estruturar mistérios com verdade, pistas e testemunhas.
- [ ] Criar diário público e registro privado do Mestre.
- [ ] Implementar codex com desbloqueio por conhecimento.

Critérios de aceite:

- Um NPC distante não ouve nem participa de uma conversa local.
- Viagens consomem tempo coerente e podem disparar eventos programados.
- Um segredo permanece verdadeiro mesmo após uma acusação incorreta.
- Codex e diário não exibem fatos ainda desconhecidos.
- Relações mudam por eventos e afetam comportamento sem revelar números.

### Fase 3: direção audiovisual

Objetivo: ampliar imersão sem comprometer o núcleo do jogo.

- [ ] Padronizar estados de música, intensidade e transições.
- [ ] Implementar crossfade e manutenção de tema por cena.
- [ ] Criar biblioteca e fila de ambientes sonoros.
- [ ] Criar eventos de SFX com prioridade e cooldown.
- [ ] Persistir perfil de voz por NPC.
- [ ] Adicionar emoção, velocidade e estilo ao TTS.
- [ ] Definir fallback quando música, SFX ou TTS falharem.
- [ ] Adicionar controles para jogadores desativarem mídia.

Critérios de aceite:

- Mudanças pequenas de tensão não reiniciam a música.
- Falha de mídia nunca impede uma jogada ou mensagem de texto.
- Um NPC recorrente mantém sua voz entre sessões.
- Música, ambiente e efeitos podem operar de forma independente.

### Fase 4: mundo vivo e direção narrativa

Objetivo: simular acontecimentos fora da visão dos jogadores sem gerar caos aleatório.

- [ ] Criar agendas de NPCs.
- [ ] Criar objetivos, recursos e planos de facções.
- [ ] Implementar eventos programados e consequências atrasadas.
- [ ] Simular economia local, guerras, política, rumores e notícias.
- [ ] Implementar Narrative Director com tensão, perigo e ritmo.
- [ ] Criar limites de frequência para conflitos e encontros.
- [ ] Permitir períodos sem acontecimentos relevantes.
- [ ] Gerar projeções do estado a partir da linha do tempo.

Critérios de aceite:

- Missões ignoradas podem evoluir sem depender de improviso retroativo.
- NPCs mudam de local conforme agendas e acontecimentos.
- Notícias circulam com atraso e alcance coerentes.
- O diretor cria respiro após sequências intensas.
- Simulações são determinísticas ou auditáveis a partir dos eventos gerados.

### Fase 5: interface visual

Objetivo: transformar dados persistentes em uma experiência acessível.

- [ ] Criar mapas dinâmicos com locais e rotas descobertos.
- [ ] Gerar retratos consistentes de NPCs importantes.
- [ ] Criar imagens de locais e cenas marcantes.
- [ ] Implementar codex visual.
- [ ] Criar painel de ficha, inventário, missões e condições.
- [ ] Adicionar ferramentas privadas de inspeção e correção para o Mestre.

Critérios de aceite:

- A interface respeita os mesmos filtros de conhecimento do bot.
- Conteúdo visual não contradiz fatos persistidos.
- Correções administrativas deixam registro de auditoria.

## 12. Primeira entrega recomendada

A primeira entrega deve ser pequena o suficiente para validar a arquitetura e completa o suficiente para jogar uma cena real:

1. Um personagem com ficha mínima, HP, defesa, perícias e inventário.
2. Um NPC com objetivos, relação e memória individual.
3. Uma cena com local e participantes explícitos.
4. Classificação de `dialogue`, `inspect`, `skill_attempt` e `attack`.
5. Resolução determinística de teste e ataque.
6. Aplicação transacional do resultado.
7. Contexto filtrado por conhecimento.
8. Narração do resultado sem poder alterar a mecânica.
9. Consulta por `/rpg ficha` e `/rpg inventario`.
10. Teste de integração cobrindo uma sequência completa de ação.

Essa fatia vertical valida o principal fluxo do produto antes de investir em simulação ampla ou mídia avançada.

## 13. Estratégia de agentes e chamadas de IA

Não é necessário transformar cada módulo em uma chamada de IA. A separação deve seguir responsabilidade e custo:

| Componente | Implementação preferida |
| --- | --- |
| Orquestração | Código determinístico |
| Regras e dados | Código determinístico |
| Tempo, espaço e viagens | Código determinístico |
| Controle de conhecimento | SQL e código determinístico |
| Recuperação de memória | SQL, busca textual e embeddings quando necessário |
| Classificação de intenção | Modelo pequeno ou saída estruturada |
| Decisão tática de NPC | Regras + modelo somente em situações complexas |
| Narrative Director | Estado e heurísticas, com modelo opcional |
| Narrador | Modelo principal |
| Música e SFX | Regras, catálogo e modelo opcional para classificação |

Chamadas independentes podem ocorrer em paralelo, mas nenhuma deve publicar efeitos antes da resolução transacional da interação.

## 14. Testes e qualidade

### 14.1. Testes unitários

- parser de dados e expressões;
- modificadores, vantagem e desvantagem;
- ataques, dano, cura e condições;
- duração de ações e viagens;
- visibilidade e alcance auditivo;
- filtros de conhecimento;
- relações e mudanças de reputação;
- transições de ritmo e mídia.

### 14.2. Testes de integração

- mensagem livre até resposta no Discord;
- idempotência de interação;
- concorrência entre duas mensagens;
- persistência após reinicialização;
- avanço do relógio e execução de eventos;
- combate completo com iniciativa;
- segredo conhecido por um NPC e desconhecido por outro;
- falha dos provedores de IA, música e TTS.

### 14.3. Testes narrativos

Criar cenários fixos e verificar invariantes, não frases exatas:

- não controlar o personagem do jogador;
- não revelar segredos ausentes do contexto;
- respeitar resultado mecânico;
- não ressuscitar NPC morto;
- não duplicar itens;
- manter nomes, voz e personalidade;
- terminar em ponto de decisão quando necessário.

## 15. Requisitos não funcionais

- **Consistência:** alterações canônicas devem ser transacionais.
- **Idempotência:** reprocessamento não pode duplicar efeitos.
- **Observabilidade:** logs, métricas e eventos devem permitir reconstruir falhas.
- **Privacidade:** respostas privadas e prompts devem respeitar conhecimento individual.
- **Latência:** texto tem prioridade; mídia e tarefas secundárias são assíncronas.
- **Resiliência:** indisponibilidade de IA ou mídia não pode corromper estado.
- **Custo:** usar modelos menores para classificação e sumarização.
- **Escalabilidade:** filas e locks devem funcionar com múltiplas instâncias.
- **Manutenção:** contratos de domínio independem de Discord e do provedor de IA.

## 16. Métricas de sucesso

- Percentual de ações livres corretamente classificadas.
- Percentual de interações que exigem esclarecimento.
- Violações detectadas de conhecimento ou segredo.
- Inconsistências mecânicas por sessão.
- Duplicações evitadas por idempotência.
- Latência até texto e até áudio.
- Continuidade de NPCs, itens, missões e locais após várias sessões.
- Frequência de trocas de música por cena.
- Distribuição entre combate, exploração, interação e descanso.
- Correções manuais necessárias por sessão.

## 17. Definição de pronto do produto-base

O núcleo pode ser considerado pronto quando:

- jogadores completam uma sessão usando principalmente linguagem natural;
- todas as ações mecânicas são resolvidas fora da LLM;
- estado e memória sobrevivem a reinicializações;
- narrador e NPCs não recebem segredos indevidos;
- posição, tempo e viagem produzem consequências coerentes;
- mistérios mantêm uma verdade fixa;
- mundo e facções avançam por eventos auditáveis;
- narrativa apresenta ficção e mecânica sem retirar agência;
- mídia melhora a cena, mas sua falha não interrompe o jogo;
- diário, ficha, inventário, mapa, missões e codex refletem apenas dados persistidos e autorizados.

## 18. Ordem de prioridade resumida

```text
1. Segurança do estado, migrações e idempotência
2. Ficha, Rules Engine e resolução estruturada
3. Memória factual e conhecimento individual
4. Tempo, espaço, viagens, relações e mistérios
5. Música, ambiente, SFX e vozes persistentes
6. World Simulator e Narrative Director
7. Mapas, imagens, codex visual e painel completo
```

O maior ganho de imersão virá da redução das responsabilidades da LLM. Quanto mais fatos objetivos forem controlados por dados, regras e eventos, mais livre o modelo ficará para fazer bem seu principal trabalho: interpretar personagens e narrar um mundo coerente.
