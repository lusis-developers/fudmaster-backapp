import { models } from "../models";
import { TeachableCoursesService, TeachableUsersService } from "./teachable";
import { Types } from "mongoose";
import type { TeachableCourse } from "../types/teachable";
import type { CourseAccess } from "../types/user";

export class EnrollmentService {
  private coursesService: TeachableCoursesService;
  private usersService: TeachableUsersService;

  constructor() {
    this.coursesService = new TeachableCoursesService();
    this.usersService = new TeachableUsersService();
  }

  /**
   * Enrolls a user in all available courses in Teachable.
   * Checks for existing enrollments in the local database to avoid duplicate calls.
   */
  async enrollUserInAllAvailableCourses(userId: string): Promise<{ enrolled: number[]; failed: number[] }> {
    const user = await models.users.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    const tId = Number(user.teachableUserId);
    if (!tId || !Number.isFinite(tId) || tId <= 0) {
      return { enrolled: [], failed: [] };
    }

    // Get all available courses from Teachable
    const perDefault = 200;
    let page = 1;
    const allCourses: TeachableCourse[] = [];

    while (true) {
      try {
        const response = await this.coursesService.listCourses({ page, per: perDefault });
        const rawData = response.data;
        // The API might return an array or an object with a courses property
        const courses = Array.isArray(rawData) ? rawData : (Array.isArray((rawData as any)?.courses) ? (rawData as any).courses : []);

        if (courses.length === 0) break;
        allCourses.push(...courses);
        if (courses.length < perDefault) break;
        page++;
      } catch (error) {
        console.error("Error fetching courses during auto-enrollment:", error);
        break;
      }
    }

    const uniqueCourseIds = Array.from(new Set(allCourses.map((c: TeachableCourse) => Number(c.id)).filter((id) => id > 0)));
    const currentlyEnrolledIds = (user.courses || [])
      .filter((c: CourseAccess) => c.status === "active")
      .map((c: CourseAccess) => Number(c.teachableCourseId));

    const missingCourseIds = uniqueCourseIds.filter((id) => !currentlyEnrolledIds.includes(id));

    if (missingCourseIds.length === 0) {
      return { enrolled: [], failed: [] };
    }

    const enrolled: number[] = [];
    const failed: number[] = [];

    // Enroll in missing courses
    for (const cid of missingCourseIds) {
      try {
        await this.usersService.enrollUser({ user_id: tId, course_id: cid });
        enrolled.push(cid);

        // Update local user object
        const exists = (user.courses || []).some((c: CourseAccess) => Number(c.teachableCourseId) === cid);
        if (!exists) {
          user.courses.push({
            teachableCourseId: cid,
            status: "active",
            enrolledAt: new Date(),
            expiresAt: null,
            courseRef: null,
          } as CourseAccess);
        }
      } catch (error: any) {
        const err = error as { status?: number; response?: { status?: number; data?: { message?: string } }; data?: { message?: string }; message?: string };
        const status = err?.status || err?.response?.status;
        const msg = (err?.data?.message || err?.response?.data?.message || err?.message || "").toLowerCase();

        // If already enrolled, consider it a success for local sync
        if (status === 422 || msg.includes("already enrolled")) {
          enrolled.push(cid);
          const exists = (user.courses || []).some((c: CourseAccess) => Number(c.teachableCourseId) === cid);
          if (!exists) {
            user.courses.push({
              teachableCourseId: cid,
              status: "active",
              enrolledAt: new Date(),
              expiresAt: null,
              courseRef: null,
            } as CourseAccess);
          }
        } else {
          console.error(`Failed to enroll user ${tId} in course ${cid}:`, error);
          failed.push(cid);
        }
      }
    }

    if (enrolled.length > 0) {
      await user.save();
    }

    return { enrolled, failed };
  }

  /**
   * Enrolls all users with 'founder' accountType into all available courses.
   */
  async enrollAllFoundersInAllCourses(): Promise<{ processedUsers: number; enrolledCount: number }> {
    // Get all available courses first
    const perDefault = 200;
    let page = 1;
    const collectedIds: number[] = [];
    while (true) {
      try {
        const resCourses = await this.coursesService.listCourses({ page, per: perDefault });
        const rawData = resCourses.data;
        const courses = Array.isArray(rawData) ? rawData : (Array.isArray((rawData as any)?.courses) ? (rawData as any).courses : []);

        if (courses.length === 0) break;
        const ids = courses.map((c: TeachableCourse) => Number(c.id)).filter((n: number) => n > 0);
        collectedIds.push(...ids);
        if (courses.length < perDefault) break;
        page++;
      } catch (_err) {
        break;
      }
    }

    let courseIds = Array.from(new Set(collectedIds));
    if (courseIds.length === 0) {
      return { processedUsers: 0, enrolledCount: 0 };
    }

    const batchSize = 100;
    let skip = 0;
    let processedUsers = 0;
    let enrolledOperations = 0;

    while (true) {
      const users = await models.users
        .find({ accountType: "founder" })
        .skip(skip)
        .limit(batchSize);

      if (!users || users.length === 0) break;
      processedUsers += users.length;

      for (const user of users) {
        const tId = Number(user.teachableUserId);
        if (!tId) continue;

        const owned = (user.courses || [])
          .filter((c: CourseAccess) => c.status === "active")
          .map((c: CourseAccess) => Number(c.teachableCourseId));

        const missing = courseIds.filter((id) => !owned.includes(id));
        if (missing.length === 0) continue;

        let hasNewEnrollment = false;
        for (const cid of missing) {
          try {
            await this.usersService.enrollUser({ user_id: tId, course_id: cid });
            enrolledOperations++;

            user.courses.push({
              teachableCourseId: cid,
              status: "active",
              enrolledAt: new Date(),
              expiresAt: null,
              courseRef: null,
            } as CourseAccess);
            hasNewEnrollment = true;
          } catch (error: any) {
            const err = error as { status?: number; response?: { status?: number; data?: { message?: string } }; data?: { message?: string }; message?: string };
            const status = err?.status || err?.response?.status;
            const msg = (err?.data?.message || err?.response?.data?.message || err?.message || "").toLowerCase();
            if (status === 422 || msg.includes("already enrolled")) {
              user.courses.push({
                teachableCourseId: cid,
                status: "active",
                enrolledAt: new Date(),
                expiresAt: null,
                courseRef: null,
              } as CourseAccess);
              hasNewEnrollment = true;
            }
          }
        }

        if (hasNewEnrollment) {
          await user.save();
        }
      }
      skip += users.length;
    }

    return { processedUsers, enrolledCount: enrolledOperations };
  }

  /**
   * Syncs the local user course progress with data retrieved from Teachable.
   */
  async syncCourseProgress(userId: string, courseId: number, progressData: any) {
    if (!userId || !courseId || !progressData) return;

    try {
      const user = await models.users.findById(userId);
      if (!user) return;

      const courseIndex = (user.courses || []).findIndex(
        (c) => Number(c.teachableCourseId) === Number(courseId)
      );

      if (courseIndex === -1) {
        // Option: Auto-enroll if missing? For now, just ignore or log.
        // But dashboard needs it. Let's assume enrollment exists or we create it.
        // User requested robustness.
        return;
      }

      // Calculate total and completed from the nested structure
      let totalLectures = 0;
      let completedLectures = 0;
      const sections = progressData.course_progress?.lecture_sections || [];

      for (const section of sections) {
        const lectures = section.lectures || [];
        totalLectures += lectures.length;
        // Check for is_completed boolean
        completedLectures += lectures.filter((l: any) => l.is_completed === true).length;
      }

      const percent = progressData.course_progress?.percent_complete;
      // If completedLectures is 0 but percent > 0, we might prefer percent logic, 
      // but keeping strict counts is better for "Continue Studying X/Y lectures".

      // Update local data
      const courseAccess = user.courses[courseIndex];
      courseAccess.totalLectures = totalLectures;
      courseAccess.completedLecturesCount = completedLectures;
      courseAccess.lastAccessedAt = new Date(); // They just accessed it/sync occurred

      if (percent === 100 || (totalLectures > 0 && completedLectures === totalLectures)) {
        if (!courseAccess.completedAt) {
          courseAccess.completedAt = new Date();
        }
      } else {
        // Reset completedAt if for some reason it's not 100% (e.g. new content added)
        courseAccess.completedAt = null;
      }

      await user.save();
    } catch (err) {
      console.error(`Failed to sync course progress for user ${userId} course ${courseId}`, err);
    }
  }
}
