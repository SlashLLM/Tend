export type CaptureItem = {
  id: string;
  kind: 'audio_chunk' | 'photo' | 'note' | 'moment' | 'video';
  t_offset_ms: number;
  text: string | null;
  transcript: string | null;
};

export type EvidenceUnit = { idx: number; text: string; start_ms: number; end_ms: number; capture_item_ids: string[]; starred: boolean };

export type IndicatorDoc = {
  id: string;
  code: string;
  name: string;
  subdomain_code: string;
  subdomain_name: string;
  level_descriptors: Record<string, string>;
  look_fors: string[];
};

export type TagDraft = {
  unitIdx: number;
  indicator: string; // code
  level: 1 | 2 | 3;
  valence: 'glow' | 'grow';
  confidence: number; // 0..1
  reason: string;
};

export type Sentence = { text: string; evidence_ids: string[] };
export type NarrativeContent = { glows: Sentence[]; grows: Sentence[]; next_step: Sentence & { goal_id: string | null } };

export type CardBody = { why: string; try_tomorrow: string; say_it: string; adapt_by_age: string; reflect_after: string };
export type CardDraft = { indicator: string; title: string; body: CardBody };

export type PipelineContext = {
  focusIndicatorCodes: string[];
  goals: { id: string; code: string; current_level: number | null; target_level: number }[];
  educatorFirstName: string;
  classLevel: string | null;
  locale: string;
};
