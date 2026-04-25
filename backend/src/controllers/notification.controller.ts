import { Request, Response } from 'express';
import { connectDB } from '../db/connection.js';
import { SystemNotificationModel } from '../models/SystemNotification.js';
import { DoubtNotificationModel } from '../models/Doubt.js';

const DOUBT_TITLES: Record<string, string> = {
  request_received: '🤝 New Peer Connect Request',
  request_accepted: '✅ Request Accepted',
  request_rejected: '❌ Request Rejected',
  request_resolved: '🎉 Session Resolved',
  dispute_opened:   '⚖️ Dispute Opened',
  dispute_resolved: '✅ Dispute Resolved',
};

/** GET /api/notifications/:userId/:courseId */
export async function getNotifications(req: Request, res: Response) {
  await connectDB();
  const { userId, courseId } = req.params;

  const [sysNotes, doubtNotes] = await Promise.all([
    SystemNotificationModel
      .find({ user_id: userId, course_id: courseId })
      .sort({ created_at: -1 }).limit(50).lean(),
    DoubtNotificationModel
      .find({ user_id: userId, course_id: courseId })
      .sort({ created_at: -1 }).limit(30).lean()
      .then(arr => arr.map((n: any) => ({
        _id:        n._id,
        user_id:    n.user_id,
        course_id:  n.course_id,
        type:       n.type,
        title:      DOUBT_TITLES[n.type] || '🤝 Peer Connect Update',
        message:    n.message,
        is_read:    n.is_read,
        created_at: n.created_at,
      }))),
  ]);

  // Merge + deduplicate by _id, sort newest first
  const merged = [...sysNotes, ...doubtNotes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 60);

  res.json({ success: true, data: merged });
}

/** PATCH /api/notifications/:userId/:courseId/read — mark all read in both stores */
export async function markAllRead(req: Request, res: Response) {
  await connectDB();
  const { userId, courseId } = req.params;
  await Promise.all([
    SystemNotificationModel.updateMany(
      { user_id: userId, course_id: courseId, is_read: false },
      { $set: { is_read: true } }
    ),
    DoubtNotificationModel.updateMany(
      { user_id: userId, course_id: courseId, is_read: false },
      { $set: { is_read: true } }
    ),
  ]);
  res.json({ success: true });
}
