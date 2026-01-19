export interface DashboardStats {
  inProgressCourses: number;
  completedCourses: number;
  totalCertificates: number;
  streak: number;
}

export interface ContinueStudying {
  courseId: number;
  title: string;
  thumbnail?: string | null;
  progress: number;
  totalLectures: number;
  completedLectures: number;
}
