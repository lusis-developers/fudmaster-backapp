import { models } from "../models";
import { TeachableCoursesService } from "./teachable";
import type { DashboardStats, ContinueStudying } from "../types/dashboard";
import type { CourseAccess, IUser } from "../types/user";

export class DashboardService {
  private teachableCoursesService: TeachableCoursesService;

  constructor() {
    this.teachableCoursesService = new TeachableCoursesService();
  }

  /**
   * Retrieves dashboard data for a user.
   */
  async getUserDashboard(userId: string) {
    const user = await models.users.findById(userId).lean<IUser>();
    if (!user) {
      throw new Error("User not found");
    }

    const { stats, recentCourses } = await this.calculateStatsAndContinueStudying(user);

    return {
      stats,
      recentCourses,
    };
  }

  private async calculateStatsAndContinueStudying(user: IUser) {
    const activeCourses = (user.courses || []).filter((c) => c.status === "active");
    const teachableUserId = user.teachableUserId;

    if (!teachableUserId || activeCourses.length === 0) {
      return {
        stats: {
          inProgressCourses: 0,
          completedCourses: 0,
          totalCertificates: await models.certificates.countDocuments({ userRef: user._id }),
          streak: user.currentStreak || 0,
        },
        recentCourses: [],
      };
    }

    // Live Fetch of Progress
    const progressPromises = activeCourses.map(async (course) => {
      try {
        const { data } = await this.teachableCoursesService.courseProgress({
          course_id: course.teachableCourseId,
          user_id: teachableUserId
        } as any);
        return {
          courseId: course.teachableCourseId,
          data: data, // contains course_progress
          originalCourse: course
        };
      } catch (error) {
        console.error(`Failed to fetch progress for course ${course.teachableCourseId}`, error);
        return null;
      }
    });

    const results = await Promise.all(progressPromises);
    const validResults = results.filter((r) => r !== null) as Array<{ courseId: number, data: any, originalCourse: CourseAccess }>;

    let inProgressCount = 0;
    let completedCount = 0;
    let candidates: Array<{
      courseId: number;
      progress: number;
      lastAccessed: number;
      enrolledAt: number;
      total: number;
      completed: number;
    }> = [];

    for (const res of validResults) {
      const prog = res.data?.course_progress;
      const percent = prog?.percent_complete ?? 0;

      // Calculate counts strictly if needed, or rely on percent
      // Teachable response: lecture_sections -> lectures -> is_completed
      // Let's refine counts from the response structure if available
      let total = 0;
      let completed = 0;
      if (prog?.lecture_sections) {
        for (const sec of prog.lecture_sections) {
          if (sec.lectures) {
            total += sec.lectures.length;
            completed += sec.lectures.filter((l: any) => l.is_completed === true).length;
          }
        }
      }

      if (percent === 100) {
        completedCount++;
      } else if (percent > 0 || completed > 0) {
        inProgressCount++;
      }

      // Candidates for "Continue Studying"
      // We exclude 100% completed courses unless it's the ONLY thing they have (edge case)
      if (percent < 100) {
        candidates.push({
          courseId: res.courseId,
          progress: percent,
          lastAccessed: res.originalCourse.lastAccessedAt ? new Date(res.originalCourse.lastAccessedAt).getTime() : 0,
          enrolledAt: new Date(res.originalCourse.enrolledAt).getTime(),
          total,
          completed
        });
      }
    }

    // Determine Recent Courses (Top 3)
    // Priority: Most recently accessed > Most recently enrolled
    // If we have candidates, sort them.
    let recentCandidates: typeof candidates = [];
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.lastAccessed !== b.lastAccessed) return b.lastAccessed - a.lastAccessed;
        return b.enrolledAt - a.enrolledAt;
      });
      recentCandidates = candidates.slice(0, 3);
    } else if (validResults.length > 0) {
      // Optional fallback if needed, but per request "ultimos 3 cursos vistos" implies active ones.
    }

    const recentCourses = [];
    for (const cand of recentCandidates) {
      try {
        // Fetch full course curriculum
        const courseDetails = await this.teachableCoursesService.showCourse({ course_id: cand.courseId });
        const courseData = courseDetails.data;

        // 1. Get completed lecture IDs from progress data
        const progressResult = validResults.find(r => r.courseId === cand.courseId);
        const completedLectureIds = new Set<number>();

        if (progressResult?.data?.course_progress?.lecture_sections) {
          for (const sec of progressResult.data.course_progress.lecture_sections) {
            if (sec.lectures) {
              for (const l of sec.lectures) {
                if (l.is_completed === true) {
                  completedLectureIds.add(l.id);
                }
              }
            }
          }
        }

        // 2. Iterate full curriculum to find "Current Class" (first incomplete) and count total
        let nextLecture = null;
        let totalLecturesReal = 0;

        const sections = courseData.course?.lecture_sections || [];

        for (const section of sections) {
          if (section.lectures) {
            for (const lecture of section.lectures) {
              totalLecturesReal++;

              // If we haven't found the next lecture yet, and this one is NOT completed...
              if (!nextLecture && !completedLectureIds.has(lecture.id)) {
                nextLecture = {
                  id: lecture.id,
                  title: lecture.name,
                  url: `${process.env.FRONTEND_URL?.replace(/\/$/, "")}/courses/${cand.courseId}/lectures/${lecture.id}`
                };
              }
            }
          }
        }

        recentCourses.push({
          courseId: cand.courseId,
          title: courseData.course?.name || "Untitled Course",
          thumbnail: courseData.course?.image_url || null,
          progress: cand.progress,
          totalLectures: totalLecturesReal,
          completedLectures: completedLectureIds.size,
          lastAccessedAt: cand.lastAccessed ? new Date(cand.lastAccessed) : null,
          nextLecture
        });
      } catch (err) {
        console.error(`Failed to fetch course details for ${cand.courseId}`, err);
      }
    }

    const totalCertificates = await models.certificates.countDocuments({ userRef: user._id });
    const streak = user.currentStreak || 0;

    const stats = {
      inProgressCourses: inProgressCount,
      completedCourses: completedCount,
      totalCertificates,
      streak,
    };

    return { stats, recentCourses };
  }

  /**
   * Updates the user's streak. Should be called on significant activity.
   */
  async updateStreak(userId: string) {
    const user = await models.users.findById(userId);
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivity = user.lastActivityDate ? new Date(user.lastActivityDate) : null;

    if (lastActivity) {
      lastActivity.setHours(0, 0, 0, 0);

      const diffTime = Math.abs(today.getTime() - lastActivity.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        user.currentStreak = (user.currentStreak || 0) + 1;
      } else if (diffDays > 1) {
        // Broken streak
        user.currentStreak = 1;
      }
      // If diffDays === 0, same day, do nothing to streak count
    } else {
      // First activity
      user.currentStreak = 1;
    }

    user.lastActivityDate = new Date();
    await user.save();
  }
}
