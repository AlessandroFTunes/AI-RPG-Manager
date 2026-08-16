export type AmbientPlan = {
  mood: string;
  energy: "low" | "medium" | "high";
  tension: "low" | "medium" | "high";
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
