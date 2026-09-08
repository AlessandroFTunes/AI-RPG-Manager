import type { MusicEnergy } from "../../../shared/music/contracts";

export type AmbientPlan = {
  mood: string;
  energy: MusicEnergy;
  tension: MusicEnergy;
  sceneType: string;
  youtubeQuery: string;
  avoidTerms: string[];
};

export type AmbientTrack = {
  title: string;
  webpageUrl: string;
  streamUrl: string;
  durationSeconds?: number;
  query: string;
  mood: string;
};
