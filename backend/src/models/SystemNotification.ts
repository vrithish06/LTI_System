import mongoose, { Schema, model, Document } from 'mongoose';
import { connectDB } from '../db/connection.js';

export type SysNotifType =
  | 'bp_awarded'
  | 'bp_deducted'
  | 'peer_connect_received'
  | 'peer_connect_accepted'
  | 'peer_connect_rejected'
  | 'peer_connect_resolved'
  | 'peer_connect_disputed'
  | 'milestone_reached'
  | 'activity_penalty'
  | 'general';

export interface ISystemNotification extends Document {
  user_id:    string;
  course_id:  string;
  type:       SysNotifType;
  title:      string;
  message:    string;
  is_read:    boolean;
  created_at: Date;
}

const SystemNotificationSchema = new Schema<ISystemNotification>(
  {
    user_id:    { type: String, required: true },
    course_id:  { type: String, required: true },
    type:       { type: String, required: true, default: 'general' },
    title:      { type: String, required: true },
    message:    { type: String, required: true },
    is_read:    { type: Boolean, default: false },
    created_at: { type: Date,   default: () => new Date() },
  },
  { collection: 'system_notifications' }
);
SystemNotificationSchema.index({ user_id: 1, course_id: 1 });
SystemNotificationSchema.index({ created_at: -1 });

export const SystemNotificationModel =
  mongoose.models.SystemNotification ||
  model<ISystemNotification>('SystemNotification', SystemNotificationSchema);

/** Convenience helper — fire and forget, never throws */
export async function sysNotify(
  userId: string,
  courseId: string,
  type: SysNotifType,
  title: string,
  message: string
): Promise<void> {
  try {
    await connectDB();
    await SystemNotificationModel.create({ user_id: userId, course_id: courseId, type, title, message });
    console.log(`[SysNotify] ✅ ${type} → user=${userId} | ${title}`);
  } catch (e: any) {
    console.error('[SysNotify] ❌ Failed to create notification:', e?.message || e);
  }
}
