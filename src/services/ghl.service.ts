import axios from "axios";
import { models } from "../models";
import type { IUser, CourseAccess } from "../types/user";

export class GHLService {
  private readonly webhookUrl = "https://services.leadconnectorhq.com/hooks/KnPOuzOM4v400d8dZEKg/webhook-trigger/246c8021-88e4-4b7a-a555-16fe7ce30910";

  /**
   * Syncs a user's data to Go High Level via Webhook.
   * Calculates status based on last activity.
   */
  async syncUserToGHL(userId: string) {
    const user = await models.users.findById(userId).lean<IUser>();
    if (!user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    const lastActivity = user.lastActivityDate ? new Date(user.lastActivityDate) : null;
    const points = user.points || 0;
    const activeCourses = (user.courses || [])
      .filter((c: CourseAccess) => c.status === "active")
      .map((c: CourseAccess) => c.teachableCourseId) // Just IDs or we could lookup names if we had them easily available without extra calls.
      .join(", ");

    // Status Logic
    // Green: < 7 days
    // Yellow: >= 7 days and < 30 days (User said "Amarillo" but didn't specify exact range, inferring from context: Red > 30. Usually Yellow is in between.)
    // Red: >= 30 days (User said "Red > 30 days" implied)
    // Actually user said: "rojo, amarillo, verde segun su uso". Let's assume standard engagement logic.
    // Green: Last 7 days.
    // Yellow: 7-30 days.
    // Red: > 30 days or never.

    let status = "Rojo";
    let lastAccessString = "";

    if (lastActivity) {
      lastAccessString = lastActivity.toISOString().split("T")[0]; // YYYY-MM-DD
      const diffTime = Math.abs(new Date().getTime() - lastActivity.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 7) {
        status = "Verde";
      } else if (diffDays <= 30) {
        status = "Amarillo";
      } else {
        status = "Rojo";
      }
    } else {
      // Never accessed
      status = "Rojo";
    }

    // Name splitting
    const fullName = user.name || "";
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    const payload = {
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      phone: null, // User model doesn't seemingly have phone, or I missed it. Checked model, no phone.
      customData: {
        lms_id_estudiante: user._id.toString(),
        lms_puntos: points,
        lms_ultimo_acceso: lastAccessString,
        lms_estado_calculado: status,
        lms_cursos_activos: activeCourses
      }
    };

    try {
      if (process.env.NODE_ENV !== 'test') {
        await axios.post(this.webhookUrl, payload);
      }
      return { success: true, payload };
    } catch (error: any) {
      console.error("Error syncing user to GHL:", error?.message);
      throw new Error("Failed to sync with Go High Level");
    }
  }

  /**
   * Syncs all users to Go High Level.
   * Designed to be called via Cron Job.
   */
  async syncAllUsersToGHL() {
    console.log("Starting GHL Sync for all users...");
    const batchSize = 50; // Process in chunks to manage memory/load
    let skip = 0;
    let processed = 0;
    let successes = 0;
    let errors = 0;

    while (true) {
      const users = await models.users.find().select("_id email name lastActivityDate points courses").skip(skip).limit(batchSize);

      if (!users || users.length === 0) break;

      const promises = users.map(async (user) => {
        try {
          await this.syncUserToGHL(user._id.toString());
          return true;
        } catch (err) {
          console.error(`Failed to sync user ${user._id}:`, err);
          return false;
        }
      });

      const results = await Promise.all(promises);
      processed += users.length;
      successes += results.filter(r => r === true).length;
      errors += results.filter(r => r === false).length;

      skip += batchSize;

      // Basic safety break for extremely large datasets if needed, 
      // but strictly Vercel functions have timeout limits (10-60s depending on plan).
      // If we have thousands of users, we might need a more robust queue system, 
      // but for now, direct iteration is the best we can do within the constraints.
    }

    console.log(`GHL Sync Complete. Processed: ${processed}, Success: ${successes}, Errors: ${errors}`);
    return { processed, successes, errors };
  }
}
