import { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import type { IUser, CourseAccess, CareerAccess, Payment, CompletedLecture } from "../types/user";

const CourseAccessSchema = new Schema<CourseAccess>(
  {
    teachableCourseId: { type: Number, required: true },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    enrolledAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    courseRef: { type: Schema.Types.ObjectId, ref: "courses", default: null },
    lastAccessedAt: { type: Date, default: null },
    totalLectures: { type: Number, default: 0 },
    completedLecturesCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const CareerAccessSchema = new Schema<CareerAccess>(
  {
    careerId: { type: String, required: true },
    name: { type: String, required: true },
    courseIds: { type: [Number], default: [] },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    enrolledAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    careerRef: { type: Schema.Types.ObjectId, ref: "careers", default: null },
  },
  { _id: false },
);

const PaymentSchema = new Schema<Payment>(
  {
    provider: { type: String, enum: ["teachable", "stripe", "other"], default: "teachable" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    transactionId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
    createdAt: { type: Date, default: () => new Date() },
    courseId: { type: Number },
    careerId: { type: String },
  },
  { _id: false },
);

const CompletedLectureSchema = new Schema<CompletedLecture>(
  {
    courseId: { type: Number, required: true },
    lectureId: { type: Number, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    teachableUserId: { type: Number },
    points: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    lastActivityDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female", "prefer_not_to_say", "other"], default: null },
    genderOther: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    jobPosition: { type: String, default: null },
    businessName: { type: String, default: null },
    businessType: {
      type: String,
      enum: ["physical_restaurant", "dark_kitchen", "food_truck", "catering", "bakery", "cafe", "other"],
      default: null
    },
    businessTypeOther: { type: String, default: null },
    employeeCount: {
      type: String,
      enum: ["1-5", "6-10", "11-25", "26-50", "50+"],
      default: null
    },
    numberOfLocations: { type: Number, default: 0 },
    onboardingCompleted: { type: Boolean, default: false },
    heardAboutUs: {
      type: String,
      enum: [
        "social_media_ad",
        "friend_colleague",
        "search_engine",
        "online_article_blog",
        "youtube_video",
        "podcast",
        "event_webinar",
        "email_campaign",
        "teachable_marketplace",
        "other",
      ],
      default: null,
    },
    heardAboutUsOther: { type: String, default: null },
    courses: { type: [CourseAccessSchema], default: [] },
    careers: { type: [CareerAccessSchema], default: [] },
    payments: { type: [PaymentSchema], default: [] },
    transactions: { type: [Schema.Types.ObjectId], ref: "transactions", default: [] },
    recoveryToken: { type: String, default: null },
    recoveryTokenExpires: { type: Date, default: null },
    accountType: { type: String, enum: ["free", "premium", "student", "founder"], default: "free" },
    completedLectures: { type: [CompletedLectureSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

UserSchema.pre("save", async function (next) {
  const doc = this as any;
  if (doc.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    doc.password = await bcrypt.hash(doc.password, salt);
  }
  next();
});

export const UserModel = model<IUser>("users", UserSchema);
