// Shared types for Activity data model used across pages
export interface ActivityRecord {
  activity_id: string;
  course_id: string;
  title: string;
  type: string;
  deadline?: string;
  grace_period?: number;
  is_mandatory?: boolean;
  is_submitted?: boolean;
  rules?: {
    reward_hp?: number;
    late_penalty_hp?: number;
    late_penalty_percent?: number;
    score_to_hp_multiplier?: number;
  };
}
