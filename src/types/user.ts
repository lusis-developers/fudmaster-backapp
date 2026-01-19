import type { Types } from "mongoose";

export interface CourseAccess {
  teachableCourseId: number;
  status: "active" | "revoked";
  enrolledAt: Date;
  expiresAt?: Date | null;
  completedAt?: Date | null;
  courseRef?: Types.ObjectId | null;
  lastAccessedAt?: Date | null;
  totalLectures?: number;
  completedLecturesCount?: number;
}

export interface CareerAccess {
  careerId: string;
  name: string;
  courseIds: number[];
  status: "active" | "revoked";
  enrolledAt: Date;
  completedAt?: Date | null;
  careerRef?: Types.ObjectId | null;
}

export interface Payment {
  provider: "teachable" | "stripe" | "other";
  amount: number;
  currency: string;
  transactionId: string;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
  courseId?: number;
  careerId?: string;
}

export interface CompletedLecture {
  courseId: number;
  lectureId: number;
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  teachableUserId?: number;
  points?: number;
  currentStreak?: number;
  lastActivityDate?: Date | null;
  gender?: "male" | "female" | "prefer_not_to_say" | "other";
  genderOther?: string | null;
  dateOfBirth?: Date | null;
  jobPosition?: string;
  businessName?: string;
  businessType?: "physical_restaurant" | "dark_kitchen" | "food_truck" | "catering" | "bakery" | "cafe" | "other" | null;
  businessTypeOther?: string | null;
  employeeCount?: "1-5" | "6-10" | "11-25" | "26-50" | "50+" | null;
  numberOfLocations?: number;
  onboardingCompleted?: boolean;
  heardAboutUs?:
  | "social_media_ad"
  | "friend_colleague"
  | "search_engine"
  | "online_article_blog"
  | "youtube_video"
  | "podcast"
  | "event_webinar"
  | "email_campaign"
  | "teachable_marketplace"
  | "other";
  heardAboutUsOther?: string | null;
  courses: CourseAccess[];
  careers: CareerAccess[];
  payments: Payment[];
  transactions?: Types.ObjectId[];
  recoveryToken?: string | null;
  recoveryTokenExpires?: Date | null;
  accountType: "free" | "premium" | "student" | "founder";
  completedLectures: CompletedLecture[];
  createdAt?: Date;
  updatedAt?: Date;
}
