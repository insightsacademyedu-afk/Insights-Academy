import Notification from "../models/Notification.js";
import { notificationEmailFailure, sendNotificationEmail } from "./email.js";
import { setTimeout as delay } from "node:timers/promises";

// Each queued email is claimed atomically, including when multiple servers run.
// Uncertain deliveries after a process crash are marked failed, avoiding duplicate emails.
export async function deliverNotificationEmails(limit = 25, notificationId) {
  await Notification.updateMany({ emailDeliveries: { $elemMatch: { status: "sending", startedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } } } },
    { $set: { "emailDeliveries.$[stale].status": "failed", "emailDeliveries.$[stale].failureReason": "Delivery was interrupted and its outcome is unknown. Check the provider log before sending again." } },
    { arrayFilters: [{ "stale.status": "sending", "stale.startedAt": { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] });
  for (let index = 0; index < limit; index++) {
    // Pace broadcasts instead of bursting all requests at the email provider.
    if (index > 0) await delay(600);
    const notification = await Notification.findOneAndUpdate({ "emailDeliveries.status": "pending", ...(notificationId ? { _id: notificationId } : {}) },
      { $set: { "emailDeliveries.$.status": "sending", "emailDeliveries.$.startedAt": new Date() } },
      { new: false, sort: { createdAt: 1 } }).select("title message +emailDeliveries").lean();
    if (!notification) break;
    const delivery = notification.emailDeliveries.find(item => item.status === "pending");
    let status = "sent";
    let failureReason = "";
    try {
      await sendNotificationEmail({ recipient: delivery.recipient, title: notification.title, message: notification.message });
    } catch (error) {
      status = "failed";
      failureReason = notificationEmailFailure(error);
    }
    await Notification.updateOne({ _id: notification._id, "emailDeliveries._id": delivery._id }, { $set: { "emailDeliveries.$.status": status, "emailDeliveries.$.failureReason": failureReason } });
  }
}

export function startNotificationDelivery() {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await deliverNotificationEmails(); }
    catch { console.error("[notifications] Email queue processing failed; pending emails remain queued."); }
    finally { busy = false; }
  };
  void run();
  const timer = setInterval(run, 5000);
  timer.unref();
  return () => clearInterval(timer);
}
