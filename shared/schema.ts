import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
  date,
  decimal,
  unique,
  type PgTableWithColumns,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  employeeId: varchar("employee_id").unique(), // Custom employee ID for HR management
  email: varchar("email").unique().notNull(),
  password: varchar("password"), // Hashed password for traditional auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("employee"), // employee, manager, admin
  department: varchar("department"),
  position: varchar("position"),
  hireDate: date("hire_date"),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // Hourly wage for cost calculations
  defaultEntryCost: decimal("default_entry_cost", { precision: 8, scale: 2 }), // Default cost per time entry
  benefits: jsonb("benefits"), // Array of benefit items: { id, type, name, cadence, amount, cap, startDate, endDate, active }
  
  // Employee Purchase Portal
  employeePurchaseEnabled: boolean("employee_purchase_enabled").default(false), // Whether employee can use purchase portal
  employeePurchaseCap: decimal("employee_purchase_cap", { precision: 10, scale: 2 }).default("0.00"), // Monthly purchase allowance
  employeePurchaseCostMarkup: decimal("employee_purchase_cost_markup", { precision: 5, scale: 2 }).default("0.00"), // Markup % added to cost (before cap is hit)
  employeePurchaseRetailDiscount: decimal("employee_purchase_retail_discount", { precision: 5, scale: 2 }).default("0.00"), // Discount % from retail (after cap is hit)

  timeOffBalance: integer("time_off_balance").default(24),
  isActive: boolean("is_active").default(true),
  phone: varchar("phone"),
  address: varchar("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  emergencyContact: varchar("emergency_contact"),
  emergencyPhone: varchar("emergency_phone"),
  notes: text("notes"),
  permissions: text("permissions").array(), // Array of permission strings
  
  // Visual identification for scheduling
  displayColor: varchar("display_color").default("#3b82f6"), // Color for shift displays (blue default)
  
  // Store/Location assignments for multi-location targeting
  primaryStore: varchar("primary_store"), // 'lake_geneva', 'watertown', 'online'
  assignedStores: text("assigned_stores").array(), // Array of store IDs user works at
  
  // SMS preferences and compliance
  smsConsent: boolean("sms_consent").default(false), // Whether user consented to SMS
  smsConsentDate: timestamp("sms_consent_date"), // When consent was given
  smsEnabled: boolean("sms_enabled").default(true), // User preference for SMS notifications
  smsNotificationTypes: text("sms_notification_types").array().default(['emergency']), // Types of notifications to send via SMS
  
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  employeeIdIdx: index("idx_users_employee_id").on(table.employeeId),
  roleIdx: index("idx_users_role").on(table.role),
  primaryStoreIdx: index("idx_users_primary_store").on(table.primaryStore),
  smsConsentIdx: index("idx_users_sms_consent").on(table.smsConsent),
}));

// Time clock entries for punch in/out system
export const timeClockEntries = pgTable("time_clock_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  locationId: integer("location_id"),
  clockInTime: timestamp("clock_in_time").notNull(),
  clockOutTime: timestamp("clock_out_time"),
  breakStartTime: timestamp("break_start_time"),
  breakEndTime: timestamp("break_end_time"),
  totalBreakMinutes: integer("total_break_minutes").default(0),
  totalWorkedMinutes: integer("total_worked_minutes").default(0),
  status: varchar("status").notNull().default("clocked_in"), // clocked_in, on_break, clocked_out
  isManualEntry: boolean("is_manual_entry").default(false), // true if manually added by employee, false if clocked in/out
  notes: text("notes"),
  ipAddress: varchar("ip_address"),
  deviceInfo: text("device_info"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userClockInIdx: index("idx_time_clock_user_clockin").on(table.userId, table.clockInTime),
  statusIdx: index("idx_time_clock_status").on(table.status),
  locationIdx: index("idx_time_clock_location").on(table.locationId),
  clockInDateIdx: index("idx_time_clock_date").on(table.clockInTime),
}));

// User presence/status for team chat
export const userPresence = pgTable("user_presence", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  status: varchar("status").notNull().default("offline"), // online, away, busy, offline, clocked_in, on_break
  lastSeen: timestamp("last_seen").defaultNow(),
  currentLocation: varchar("current_location"),
  statusMessage: text("status_message"),
  isWorking: boolean("is_working").default(false),
  clockedInAt: timestamp("clocked_in_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SMS consent history tracking for compliance and auditing
export const smsConsentHistory = pgTable("sms_consent_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  consentGiven: boolean("consent_given").notNull(), // true = opted in, false = opted out
  previousConsent: boolean("previous_consent"), // What their consent was before this change
  notificationTypes: text("notification_types").array(), // What notification types they consented to
  previousNotificationTypes: text("previous_notification_types").array(), // Previous notification types
  changeReason: varchar("change_reason"), // 'bulk_opt_in', 'user_preference', 'admin_update', 'onboarding'
  changedBy: varchar("changed_by").references(() => users.id), // Who made the change (admin/user themselves)
  changeMethod: varchar("change_method"), // 'web_interface', 'bulk_script', 'admin_panel', 'mobile_app'
  ipAddress: varchar("ip_address"), // For audit trail
  userAgent: text("user_agent"), // Browser/device info
  notes: text("notes"), // Optional notes about the change
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_sms_consent_history_user_id").on(table.userId),
  consentGivenIdx: index("idx_sms_consent_history_consent").on(table.consentGiven),
  changeReasonIdx: index("idx_sms_consent_history_reason").on(table.changeReason),
  createdAtIdx: index("idx_sms_consent_history_created_at").on(table.createdAt),
}));

// Time off requests
export const timeOffRequests = pgTable("time_off_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  status: varchar("status").notNull().default("pending"), // pending, approved, rejected, cancellation_requested, cancelled
  requestedAt: timestamp("requested_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  comments: text("comments"),
}, (table) => ({
  userStatusIdx: index("idx_time_off_user_status").on(table.userId, table.status),
  statusIdx: index("idx_time_off_status").on(table.status),
  requestedAtIdx: index("idx_time_off_requested_at").on(table.requestedAt),
}));

// Locations
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  address: varchar("address").notNull(),
  city: varchar("city").notNull(),
  state: varchar("state").notNull(),
  zipCode: varchar("zip_code").notNull(),
  phone: varchar("phone"),
  displayColor: varchar("display_color").default("#10b981"), // Color for location indicators
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Work schedules
export const workSchedules = pgTable("work_schedules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  locationId: integer("location_id").references(() => locations.id),
  date: date("date").notNull(),
  startTime: varchar("start_time").notNull(),
  endTime: varchar("end_time").notNull(),
  shiftType: varchar("shift_type").default("regular"), // regular, coverage, overtime
  status: varchar("status").default("scheduled"), // scheduled, completed, cancelled, no_show, sick_day, vacation, personal_day
  breaks: text("breaks"), // JSON string for break times
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("idx_work_schedules_user_date").on(table.userId, table.date),
  locationDateIdx: index("idx_work_schedules_location_date").on(table.locationId, table.date),
  statusIdx: index("idx_work_schedules_status").on(table.status),
}));

// Calendar notes for day-level annotations (staff meetings, open shifts, etc.)
export const calendarNotes = pgTable("calendar_notes", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  locationId: integer("location_id").references(() => locations.id),
  title: varchar("title").notNull(),
  content: text("content"),
  noteType: varchar("note_type").default("general"), // general, meeting, open_shifts, closure, event
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dateLocationIdx: index("idx_calendar_notes_date_location").on(table.date, table.locationId),
  noteTypeIdx: index("idx_calendar_notes_type").on(table.noteType),
  activeIdx: index("idx_calendar_notes_active").on(table.isActive),
}));

// Shift Swap Marketplace
export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: serial("id").primaryKey(),
  originalScheduleId: integer("original_schedule_id").references(() => workSchedules.id).notNull(),
  requesterId: varchar("requester_id").references(() => users.id).notNull(),
  takerId: varchar("taker_id").references(() => users.id),
  status: varchar("status").default("open"), // open, pending, approved, rejected, completed, cancelled
  reason: text("reason"),
  offerMessage: text("offer_message"),
  responseMessage: text("response_message"),
  urgencyLevel: varchar("urgency_level").default("normal"), // low, normal, high, urgent
  incentive: text("incentive"), // e.g., "Will cover your next weekend shift", monetary compensation, etc.
  notifiedEmployeeIds: varchar("notified_employee_ids").array(), // Employee IDs to notify via SMS (max 10)
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  requesterIdx: index("idx_shift_swap_requester").on(table.requesterId),
  takerIdx: index("idx_shift_swap_taker").on(table.takerId),
  statusIdx: index("idx_shift_swap_status").on(table.status),
  scheduleIdx: index("idx_shift_swap_schedule").on(table.originalScheduleId),
  urgencyIdx: index("idx_shift_swap_urgency").on(table.urgencyLevel),
  activeIdx: index("idx_shift_swap_active").on(table.isActive),
}));

// Shift coverage requests
export const shiftCoverageRequests = pgTable("shift_coverage_requests", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  scheduleId: integer("schedule_id").notNull().references(() => workSchedules.id),
  reason: text("reason"),
  status: varchar("status").notNull().default("open"), // open, covered, expired
  coveredBy: varchar("covered_by").references(() => users.id),
  requestedAt: timestamp("requested_at").defaultNow(),
  coveredAt: timestamp("covered_at"),
});

// Announcements
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  authorId: varchar("author_id").notNull().references(() => users.id),
  priority: varchar("priority").default("normal"), // low, normal, high, urgent
  targetAudience: varchar("target_audience").default("all"), // all, employees, admins, department
  targetEmployees: varchar("target_employees").array(), // specific employee IDs when targeting individuals
  imageUrls: text("image_urls").array(), // Array of image URLs for attachments
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  publishedCreatedIdx: index("idx_announcements_published_created").on(table.isPublished, table.createdAt),
  priorityIdx: index("idx_announcements_priority").on(table.priority),
  authorIdx: index("idx_announcements_author").on(table.authorId),
}));

// Training modules - Enhanced with comprehensive learning features
export const trainingModules = pgTable("training_modules", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description"),
  content: text("content"),
  duration: integer("duration"), // in minutes
  category: varchar("category"),
  requiredForRole: varchar("required_for_role"),
  difficulty: varchar("difficulty").default("beginner"), // beginner, intermediate, advanced
  isMandatory: boolean("is_mandatory").default(false), // Required for all employees
  requiredForRoles: text("required_for_roles").array(), // Roles that must complete this
  requiredForDepartments: text("required_for_departments").array(), // Departments that must complete this
  prerequisites: integer("prerequisites").array(), // Module IDs that must be completed first
  thumbnailUrl: varchar("thumbnail_url"),
  createdBy: varchar("created_by").references(() => users.id),
  isActive: boolean("is_active").default(true),
  publicationStatus: varchar("publication_status").default("draft"), // draft, pending_review, approved, published
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_training_modules_category").on(table.category),
  isActiveIdx: index("idx_training_modules_is_active").on(table.isActive),
  isMandatoryIdx: index("idx_training_modules_is_mandatory").on(table.isMandatory),
  publicationStatusIdx: index("idx_training_modules_publication_status").on(table.publicationStatus),
}));

// Training lessons - Break modules into individual lessons
export const trainingLessons = pgTable("training_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(), // Markdown or HTML content
  contentType: varchar("content_type").default("markdown"), // markdown, html, video, pdf
  videoUrl: varchar("video_url"),
  attachmentUrl: varchar("attachment_url"),
  orderIndex: integer("order_index").notNull(), // Lesson order within module
  duration: integer("duration"), // Estimated minutes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  moduleIdIdx: index("idx_training_lessons_module_id").on(table.moduleId),
  orderIdx: index("idx_training_lessons_order").on(table.moduleId, table.orderIndex),
}));

// Training progress - Enhanced with enrollment features
export const trainingProgress = pgTable("training_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id),
  status: varchar("status").default("not_started"), // not_started, in_progress, completed, failed
  progress: integer("progress").default(0), // percentage
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  dueDate: timestamp("due_date"),
  assignedBy: varchar("assigned_by").references(() => users.id), // Admin/Manager who assigned
  finalScore: integer("final_score"), // Percentage score on assessment (renamed from score)
  attempts: integer("attempts").default(0), // Number of assessment attempts
  certificateUrl: varchar("certificate_url"), // Generated certificate if passed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userModuleIdx: unique("idx_training_progress_user_module").on(table.userId, table.moduleId),
  userIdIdx: index("idx_training_progress_user_id").on(table.userId),
  moduleIdIdx: index("idx_training_progress_module_id").on(table.moduleId),
  statusIdx: index("idx_training_progress_status").on(table.status),
  dueDateIdx: index("idx_training_progress_due_date").on(table.dueDate),
}));

// Lesson progress - Track individual lesson completion
export const lessonProgress = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: integer("lesson_id").notNull().references(() => trainingLessons.id, { onDelete: "cascade" }),
  completed: boolean("completed").default(false),
  timeSpent: integer("time_spent").default(0), // Seconds spent on lesson
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userLessonIdx: unique("idx_lesson_progress_user_lesson").on(table.userId, table.lessonId),
  userIdIdx: index("idx_lesson_progress_user_id").on(table.userId),
  lessonIdIdx: index("idx_lesson_progress_lesson_id").on(table.lessonId),
}));

// Training assessments - Quiz/test for each module
export const trainingAssessments = pgTable("training_assessments", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  passingScore: integer("passing_score").default(70), // Minimum percentage to pass
  timeLimit: integer("time_limit"), // Minutes (null = unlimited)
  maxAttempts: integer("max_attempts").default(3), // Maximum number of attempts allowed
  randomizeQuestions: boolean("randomize_questions").default(false),
  showCorrectAnswers: boolean("show_correct_answers").default(true), // Show answers after completion
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  moduleIdIdx: index("idx_training_assessments_module_id").on(table.moduleId),
}));

// Assessment questions
export const trainingQuestions = pgTable("training_questions", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => trainingAssessments.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type").notNull(), // multiple_choice, true_false, multiple_answer
  options: jsonb("options").$type<Array<{ id: string; text: string; isCorrect: boolean }>>().notNull(),
  explanation: text("explanation"), // Explanation shown after answering
  points: integer("points").default(1), // Point value for this question
  orderIndex: integer("order_index").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assessmentIdIdx: index("idx_training_questions_assessment_id").on(table.assessmentId),
  orderIdx: index("idx_training_questions_order").on(table.assessmentId, table.orderIndex),
}));

// Assessment attempts - Record each quiz attempt
export const trainingAttempts = pgTable("training_attempts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  assessmentId: integer("assessment_id").notNull().references(() => trainingAssessments.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<Array<{ questionId: number; selectedOptions: string[]; isCorrect: boolean }>>().notNull(),
  score: integer("score").notNull(), // Percentage score
  passed: boolean("passed").notNull(),
  timeSpent: integer("time_spent"), // Seconds spent on assessment
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_training_attempts_user_id").on(table.userId),
  assessmentIdIdx: index("idx_training_attempts_assessment_id").on(table.assessmentId),
  createdAtIdx: index("idx_training_attempts_created_at").on(table.createdAt),
}));

// Skills database - Track employee skills acquired through training
export const trainingSkills = pgTable("training_skills", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  category: varchar("category"), // e.g., "Technical", "Soft Skills", "Compliance"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_training_skills_category").on(table.category),
}));

// Link modules to skills they teach
export const trainingModuleSkills = pgTable("training_module_skills", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id, { onDelete: "cascade" }),
  skillId: integer("skill_id").notNull().references(() => trainingSkills.id, { onDelete: "cascade" }),
  proficiencyLevel: varchar("proficiency_level").default("basic"), // basic, intermediate, advanced, expert
}, (table) => ({
  moduleSkillIdx: unique("idx_training_module_skills_unique").on(table.moduleId, table.skillId),
  moduleIdIdx: index("idx_training_module_skills_module_id").on(table.moduleId),
  skillIdIdx: index("idx_training_module_skills_skill_id").on(table.skillId),
}));

// Employee skills - Track which skills each employee has
export const employeeSkills = pgTable("employee_skills", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillId: integer("skill_id").notNull().references(() => trainingSkills.id, { onDelete: "cascade" }),
  proficiencyLevel: varchar("proficiency_level").default("basic"), // basic, intermediate, advanced, expert
  acquiredFrom: integer("acquired_from").references(() => trainingModules.id), // Module that granted this skill
  acquiredAt: timestamp("acquired_at").defaultNow(),
  lastAssessedAt: timestamp("last_assessed_at"),
}, (table) => ({
  userSkillIdx: unique("idx_employee_skills_unique").on(table.userId, table.skillId),
  userIdIdx: index("idx_employee_skills_user_id").on(table.userId),
  skillIdIdx: index("idx_employee_skills_skill_id").on(table.skillId),
}));

// AI Training Generation Jobs - Track async AI content generation
export const trainingGenerationJobs = pgTable("training_generation_jobs", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("pending"), // pending, processing, completed, failed
  jobType: varchar("job_type").notNull(), // full_training, lessons_only, assessment_only, enrichment, collection
  progress: integer("progress").default(0), // 0-100 percentage
  generatedContent: jsonb("generated_content").$type<{
    lessons?: Array<{ title: string; content: string; duration: number }>;
    questions?: Array<{ questionText: string; options: any[]; explanation: string }>;
    skills?: string[];
    enrichedDescription?: string;
  }>(),
  sourceData: jsonb("source_data").$type<{
    productName?: string;
    productDescription?: string;
    brand?: string;
    category?: string;
    webSearchResults?: any[];
    products?: Array<{
      name: string;
      description: string;
      brand?: string;
      category?: string;
    }>;
  }>(),
  errorMessage: text("error_message"),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  moduleIdIdx: index("idx_training_generation_jobs_module_id").on(table.moduleId),
  statusIdx: index("idx_training_generation_jobs_status").on(table.status),
  requestedByIdx: index("idx_training_generation_jobs_requested_by").on(table.requestedBy),
  createdAtIdx: index("idx_training_generation_jobs_created_at").on(table.createdAt),
}));

// Staged products from BigCommerce or converted from modules before grouping
export const stagedProducts = pgTable("staged_products", {
  id: serial("id").primaryKey(),
  bigCommerceId: integer("bigcommerce_id"), // Nullable for module conversions
  name: varchar("name").notNull(),
  description: text("description"),
  brand: varchar("brand"),
  category: varchar("category"),
  sku: varchar("sku"),
  price: decimal("price", { precision: 10, scale: 2 }),
  imageUrl: varchar("image_url"),
  productData: jsonb("product_data"), // Full BigCommerce product JSON or module data
  status: varchar("status").notNull().default("pending"), // pending, grouped, archived
  importedBy: varchar("imported_by").notNull().references(() => users.id),
  importedAt: timestamp("imported_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bigCommerceIdIdx: index("idx_staged_products_bigcommerce_id").on(table.bigCommerceId),
  statusIdx: index("idx_staged_products_status").on(table.status),
  brandIdx: index("idx_staged_products_brand").on(table.brand),
  categoryIdx: index("idx_staged_products_category").on(table.category),
}));

// Training collections - groups of products that become modules
export const trainingCollections = pgTable("training_collections", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  groupingCriteria: varchar("grouping_criteria"), // brand, category, manual
  status: varchar("status").notNull().default("draft"), // draft, ready, generated
  createdBy: varchar("created_by").notNull().references(() => users.id),
  moduleId: integer("module_id").references(() => trainingModules.id, { onDelete: "set null" }), // Final exam module ID
  individualModuleIds: jsonb("individual_module_ids").$type<number[]>().default([]), // Individual product module IDs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("idx_training_collections_status").on(table.status),
  createdByIdx: index("idx_training_collections_created_by").on(table.createdBy),
}));

// Junction table linking collections to staged products
export const collectionProducts = pgTable("collection_products", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => trainingCollections.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => stagedProducts.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").default(0),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  collectionIdIdx: index("idx_collection_products_collection_id").on(table.collectionId),
  productIdIdx: index("idx_collection_products_product_id").on(table.productId),
  uniqueCollectionProduct: unique("unique_collection_product").on(table.collectionId, table.productId),
}));

// Messages
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  recipientId: varchar("recipient_id").references(() => users.id),
  subject: varchar("subject"),
  content: text("content").notNull(),
  priority: varchar("priority").default("normal"), // 'emergency', 'high', 'normal', 'low'
  imageUrls: text("image_urls").array(), // Array of image URLs for attachments
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
  readAt: timestamp("read_at"),
  messageType: varchar("message_type").default("direct"), // 'direct', 'channel', 'announcement', 'broadcast'
  channelId: varchar("channel_id"), // for team/group messages
  targetAudience: varchar("target_audience"), // 'all', 'store:lake_geneva', 'store:watertown', 'role:admin', 'role:manager', 'role:employee'
  smsEnabled: boolean("sms_enabled").default(false), // Whether to send via SMS
  smsDelivered: boolean("sms_delivered").default(false), // Whether SMS was successfully delivered
}, (table) => ({
  recipientReadIdx: index("idx_messages_recipient_read").on(table.recipientId, table.isRead),
  channelIdx: index("idx_messages_channel").on(table.channelId),
  sentAtIdx: index("idx_messages_sent_at").on(table.sentAt),
  senderIdx: index("idx_messages_sender").on(table.senderId),
  priorityIdx: index("idx_messages_priority").on(table.priority),
  targetAudienceIdx: index("idx_messages_target_audience").on(table.targetAudience),
}));

// Phase 3: Message Reactions
export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  reactionType: varchar("reaction_type").notNull(), // 'check', 'thumbs_up', 'x', 'question'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  messageUserIdx: index("idx_reactions_message_user").on(table.messageId, table.userId),
  messageTypeIdx: index("idx_reactions_message_type").on(table.messageId, table.reactionType),
  uniqueReactionPerUser: unique("unique_reaction_per_user").on(table.messageId, table.userId, table.reactionType),
}));

// Announcement Reactions (new)
export const announcementReactions = pgTable("announcement_reactions", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  reactionType: varchar("reaction_type").notNull(), // 'check', 'thumbs_up', 'x', 'question'
  isFromSMS: boolean("is_from_sms").default(false), // Track if reaction came via SMS
  smsMessageSid: varchar("sms_message_sid"), // Twilio SID for SMS-originated reactions
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  announcementUserIdx: index("idx_announcement_reactions_announcement_user").on(table.announcementId, table.userId),
  announcementTypeIdx: index("idx_announcement_reactions_announcement_type").on(table.announcementId, table.reactionType),
  uniqueAnnouncementReactionPerUser: unique("unique_announcement_reaction_per_user").on(table.announcementId, table.userId, table.reactionType),
  smsIdx: index("idx_announcement_reactions_sms").on(table.isFromSMS),
}));

// Phase 3: Read Receipts
export const readReceipts = pgTable("read_receipts", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  smsDeliveryStatus: varchar("sms_delivery_status"), // 'sent', 'delivered', 'failed', 'undelivered'
  smsDeliveryId: varchar("sms_delivery_id"), // Twilio SID for tracking
}, (table) => ({
  messageUserIdx: index("idx_receipts_message_user").on(table.messageId, table.userId),
  userReadIdx: index("idx_receipts_user_read").on(table.userId, table.readAt),
  uniqueReceiptPerUser: unique("unique_receipt_per_user").on(table.messageId, table.userId),
}));

// Phase 3: Voice Messages
export const voiceMessages = pgTable("voice_messages", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: 'cascade' }),
  filePath: varchar("file_path").notNull(),
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  duration: integer("duration"), // Duration in seconds
  transcription: text("transcription"), // Optional AI transcription
  mimeType: varchar("mime_type").default("audio/webm"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => ({
  messageIdx: index("idx_voice_messages_message").on(table.messageId),
  uploadedAtIdx: index("idx_voice_messages_uploaded").on(table.uploadedAt),
}));

// Communication Attachments (PDFs and other files for announcements/messages)
export const communicationAttachments = pgTable("communication_attachments", {
  id: serial("id").primaryKey(),
  ownerType: varchar("owner_type").notNull(), // 'announcement' or 'message'
  ownerId: integer("owner_id").notNull(), // ID of the announcement or message
  fileUrl: text("file_url").notNull(), // URL to the file in object storage
  fileType: varchar("file_type").notNull(), // 'pdf', 'image', etc.
  fileName: varchar("file_name").notNull(), // Original filename
  fileSize: integer("file_size"), // File size in bytes
  mimeType: varchar("mime_type"), // MIME type of the file
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("idx_comm_attachments_owner").on(table.ownerType, table.ownerId),
  uploadedByIdx: index("idx_comm_attachments_uploaded_by").on(table.uploadedBy),
  fileTypeIdx: index("idx_comm_attachments_file_type").on(table.fileType),
}));

// Phase 3: Message Templates
export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  category: varchar("category").notNull(), // 'schedule', 'emergency', 'general', 'announcements'
  subject: varchar("subject"),
  content: text("content").notNull(),
  priority: varchar("priority").default("normal"), // 'emergency', 'high', 'normal', 'low'
  targetAudience: varchar("target_audience"), // 'all', 'managers', 'employees', 'location_specific'
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  useCount: integer("use_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_templates_category").on(table.category),
  createdByIdx: index("idx_templates_created_by").on(table.createdBy),
  activeIdx: index("idx_templates_active").on(table.isActive),
}));

// Employee responses to announcements and messages (supports threaded conversations)
export const responses: PgTableWithColumns<any> = pgTable("responses", {
  id: serial("id").primaryKey(),
  authorId: varchar("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  
  // References to parent content - either announcement or message
  announcementId: integer("announcement_id").references(() => announcements.id, { onDelete: 'cascade' }),
  messageId: integer("message_id").references(() => messages.id, { onDelete: 'cascade' }),
  
  // For threaded responses (responses to responses)
  parentResponseId: integer("parent_response_id").references((): any => responses.id, { onDelete: 'cascade' }),
  
  // Response metadata
  responseType: varchar("response_type").notNull().default("reply"), // 'reply', 'question', 'confirmation', 'concern'
  isFromSMS: boolean("is_from_sms").default(false), // Whether this response came via SMS
  smsMessageSid: varchar("sms_message_sid"), // Twilio SID for tracking SMS source
  
  // Moderation and status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isHidden: boolean("is_hidden").default(false), // For moderation
  hiddenBy: varchar("hidden_by").references(() => users.id),
  hiddenReason: text("hidden_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  authorIdx: index("idx_responses_author").on(table.authorId),
  announcementIdx: index("idx_responses_announcement").on(table.announcementId),
  messageIdx: index("idx_responses_message").on(table.messageId),
  parentIdx: index("idx_responses_parent").on(table.parentResponseId),
  typeIdx: index("idx_responses_type").on(table.responseType),
  smsIdx: index("idx_responses_sms").on(table.isFromSMS),
  createdIdx: index("idx_responses_created").on(table.createdAt),
  readIdx: index("idx_responses_read").on(table.isRead),
}));

// SMS delivery tracking for compliance and monitoring
export const smsDeliveries = pgTable("sms_deliveries", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  twilioMessageId: varchar("twilio_message_id").notNull(), // Twilio's SID
  phoneNumber: varchar("phone_number").notNull(),
  status: varchar("status").notNull().default("queued"), // 'queued', 'sending', 'sent', 'delivered', 'failed', 'undelivered'
  errorCode: varchar("error_code"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  messageUserIdx: index("idx_sms_message_user").on(table.messageId, table.userId),
  twilioMessageIdx: index("idx_sms_twilio_message").on(table.twilioMessageId),
  statusIdx: index("idx_sms_status").on(table.status),
  phoneIdx: index("idx_sms_phone").on(table.phoneNumber),
  sentAtIdx: index("idx_sms_sent_at").on(table.sentAt),
}));

// Chat channels for team communication
export const chatChannels = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  type: varchar("type").default("team"), // 'team', 'department', 'general'
  isPrivate: boolean("is_private").default(false),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Channel memberships
export const channelMembers = pgTable("channel_members", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => chatChannels.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role").default("member"), // 'admin', 'member'
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => ({
  // Ensure unique channel-user combinations
  uniqueChannelUser: unique("unique_channel_user").on(table.channelId, table.userId),
  channelIdx: index("idx_channel_members_channel").on(table.channelId),
  userIdx: index("idx_channel_members_user").on(table.userId),
}));

// Channel messages for team communication
export const channelMessages = pgTable("channel_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => chatChannels.id, { onDelete: 'cascade' }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("message"), // 'message', 'system', 'announcement'
  priority: varchar("priority").default("normal"), // 'emergency', 'high', 'normal', 'low'
  smsEnabled: boolean("sms_enabled").default(false),
  parentMessageId: integer("parent_message_id"), // For replies/threads
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  channelIdx: index("idx_channel_messages_channel").on(table.channelId),
  senderIdx: index("idx_channel_messages_sender").on(table.senderId),
  createdAtIdx: index("idx_channel_messages_created").on(table.createdAt),
  priorityIdx: index("idx_channel_messages_priority").on(table.priority),
}));

// Channel message reactions
export const channelMessageReactions = pgTable("channel_message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => channelMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reactionType: varchar("reaction_type").notNull(), // 'check', 'thumbs_up', 'x', 'question'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  messageUserIdx: index("idx_channel_reactions_message_user").on(table.messageId, table.userId),
  messageTypeIdx: index("idx_channel_reactions_message_type").on(table.messageId, table.reactionType),
  uniqueReactionPerUser: unique("unique_channel_reaction_per_user").on(table.messageId, table.userId, table.reactionType),
}));

// Channel message read receipts
export const channelMessageReadReceipts = pgTable("channel_message_read_receipts", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => channelMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp("read_at").defaultNow(),
}, (table) => ({
  messageUserIdx: index("idx_channel_read_receipts_message_user").on(table.messageId, table.userId),
  uniqueReceiptPerUser: unique("unique_channel_receipt_per_user").on(table.messageId, table.userId),
}));

// Push subscriptions for mobile notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications for time-sensitive approvals
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  body: text("body").notNull(),
  type: varchar("type").notNull(), // 'time_off_request', 'shift_coverage', 'approval_needed'
  relatedId: integer("related_id"), // ID of the related record (time off request, etc.)
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
  readAt: timestamp("read_at"),
});

// Document management and file sharing
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name").notNull(),
  originalName: varchar("original_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  category: varchar("category").default("general"), // 'policy', 'form', 'training', 'general'
  description: text("description"),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  isPublic: boolean("is_public").default(false),
  isActive: boolean("is_active").default(true),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document access permissions
export const documentPermissions = pgTable("document_permissions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  userId: varchar("user_id").references(() => users.id),
  department: varchar("department"), // If null, applies to specific user
  role: varchar("role"), // If null, applies to specific user
  accessLevel: varchar("access_level").default("read"), // 'read', 'write', 'admin'
  grantedBy: varchar("granted_by").notNull().references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),
});

// Document download/view logs
export const documentLogs = pgTable("document_logs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: varchar("action").notNull(), // 'view', 'download', 'share'
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Employee Dashboard Content - Rotating Banners
export const employeeBanners = pgTable("employee_banners", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(), // URL to banner image in object storage
  externalUrl: text("external_url"), // Optional link when banner is clicked
  orderIndex: integer("order_index").notNull().default(0), // Display order in rotation
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date"), // Optional: when to start showing
  endDate: timestamp("end_date"), // Optional: when to stop showing
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeOrderIdx: index("idx_employee_banners_active_order").on(table.isActive, table.orderIndex),
  createdByIdx: index("idx_employee_banners_created_by").on(table.createdBy),
}));

// Employee Dashboard Content - Spotlight Blog Areas (Video/Article/Photo/Product/News/Link/Event)
export const employeeSpotlights = pgTable("employee_spotlights", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // 'video', 'article', 'photo', 'product', 'news', 'link', 'event'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url").notNull(), // Main image/thumbnail
  videoUrl: text("video_url"), // For video type
  externalUrl: text("external_url"), // Link when clicked
  orderIndex: integer("order_index").notNull().default(0), // Display priority (0-2 for 3 spots)
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date"), // Optional: when to start showing
  endDate: timestamp("end_date"), // Optional: when to stop showing
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeOrderIdx: index("idx_employee_spotlights_active_order").on(table.isActive, table.orderIndex),
  typeIdx: index("idx_employee_spotlights_type").on(table.type),
  createdByIdx: index("idx_employee_spotlights_created_by").on(table.createdBy),
}));

// Logo management for branding customization
export const logos = pgTable("logos", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(), // 'main_logo', 'login_logo', 'header_logo', etc.
  fileName: varchar("file_name").notNull(),
  originalName: varchar("original_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  isActive: boolean("is_active").default(true),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee invitations for beta testing
export const employeeInvitations = pgTable("employee_invitations", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull().unique(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  role: varchar("role").notNull().default("employee"),
  department: varchar("department"),
  position: varchar("position"),
  inviteToken: varchar("invite_token").notNull().unique(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  status: varchar("status").notNull().default("pending"), // pending, accepted, expired
  notes: text("notes"),
});

// Password reset tokens for traditional authentication
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenIdx: index("idx_password_reset_token").on(table.token),
  userIdx: index("idx_password_reset_user").on(table.userId),
}));

// Communication Analytics - Aggregated metrics for dashboard
export const communicationAnalytics = pgTable("communication_analytics", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(), // Daily aggregation date
  
  // Message metrics
  totalMessages: integer("total_messages").default(0),
  totalAnnouncements: integer("total_announcements").default(0),
  totalSMS: integer("total_sms").default(0),
  totalDirectMessages: integer("total_direct_messages").default(0),
  totalChannelMessages: integer("total_channel_messages").default(0),
  
  // Delivery metrics
  smsDelivered: integer("sms_delivered").default(0),
  smsFailed: integer("sms_failed").default(0),
  smsDeliveryRate: decimal("sms_delivery_rate", { precision: 5, scale: 2 }).default("0.00"), // Percentage
  
  // Engagement metrics
  totalReactions: integer("total_reactions").default(0),
  totalResponses: integer("total_responses").default(0),
  totalReadReceipts: integer("total_read_receipts").default(0),
  averageResponseTime: integer("average_response_time").default(0), // Minutes
  engagementRate: decimal("engagement_rate", { precision: 5, scale: 2 }).default("0.00"), // Percentage
  
  // User metrics
  activeUsers: integer("active_users").default(0),
  newUsers: integer("new_users").default(0),
  smsOptedInUsers: integer("sms_opted_in_users").default(0),
  
  // Cost metrics (in cents)
  smsCost: integer("sms_cost").default(0), // Total SMS cost in cents
  averageSMSCost: decimal("average_sms_cost", { precision: 10, scale: 4 }).default("0.0000"), // Per SMS in cents
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dateIdx: index("idx_communication_analytics_date").on(table.date),
  createdAtIdx: index("idx_communication_analytics_created").on(table.createdAt),
  uniqueDate: unique("unique_communication_analytics_date").on(table.date),
}));

// Communication Events - Individual event tracking for detailed analytics
export const communicationEvents = pgTable("communication_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type").notNull(), // 'message_sent', 'message_read', 'sms_delivered', 'reaction_added', 'response_created'
  
  // Related entities
  userId: varchar("user_id").references(() => users.id),
  messageId: integer("message_id").references(() => messages.id),
  announcementId: integer("announcement_id").references(() => announcements.id),
  channelMessageId: integer("channel_message_id").references(() => channelMessages.id),
  
  // Event metadata
  eventData: jsonb("event_data"), // Flexible JSON for event-specific data
  source: varchar("source").default("app"), // 'app', 'sms', 'email', 'push'
  platform: varchar("platform"), // 'web', 'mobile', 'sms'
  
  // Cost tracking
  cost: integer("cost").default(0), // Event cost in cents
  
  // Timing
  eventTimestamp: timestamp("event_timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  eventTypeIdx: index("idx_communication_events_type").on(table.eventType),
  userIdx: index("idx_communication_events_user").on(table.userId),
  messageIdx: index("idx_communication_events_message").on(table.messageId),
  timestampIdx: index("idx_communication_events_timestamp").on(table.eventTimestamp),
  sourceIdx: index("idx_communication_events_source").on(table.source),
}));

// User Communication Preferences and Patterns
export const userCommunicationStats = pgTable("user_communication_stats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Message preferences
  preferredChannel: varchar("preferred_channel").default("app"), // 'app', 'sms', 'email'
  messageFrequency: varchar("message_frequency").default("normal"), // 'high', 'normal', 'low'
  
  // Usage statistics (last 30 days)
  messagesReceived: integer("messages_received").default(0),
  messagesSent: integer("messages_sent").default(0),
  announcementsViewed: integer("announcements_viewed").default(0),
  reactionsGiven: integer("reactions_given").default(0),
  responsesCreated: integer("responses_created").default(0),
  
  // Engagement metrics
  averageResponseTime: integer("average_response_time").default(0), // Minutes
  readReceiptRate: decimal("read_receipt_rate", { precision: 5, scale: 2 }).default("0.00"), // Percentage
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }).default("0.00"), // Calculated score
  
  // SMS specific
  smsReceived: integer("sms_received").default(0),
  smsCostIncurred: integer("sms_cost_incurred").default(0), // In cents
  
  lastCalculated: timestamp("last_calculated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_user_communication_stats_user").on(table.userId),
  lastCalculatedIdx: index("idx_user_communication_stats_calculated").on(table.lastCalculated),
  engagementIdx: index("idx_user_communication_stats_engagement").on(table.engagementScore),
  uniqueUser: unique("unique_user_communication_stats").on(table.userId),
}));

// Define relations
export const usersRelations = relations(users, ({ many, one }) => ({
  timeOffRequests: many(timeOffRequests),
  workSchedules: many(workSchedules),
  shiftCoverageRequests: many(shiftCoverageRequests),
  announcements: many(announcements),
  trainingProgress: many(trainingProgress),
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "recipient" }),
  smsDeliveries: many(smsDeliveries),
  pushSubscriptions: many(pushSubscriptions),
  notifications: many(notifications),
  createdChannels: many(chatChannels),
  channelMemberships: many(channelMembers),
  uploadedDocuments: many(documents),
  documentPermissions: many(documentPermissions),
  documentLogs: many(documentLogs),
  uploadedLogos: many(logos),
  sentInvitations: many(employeeInvitations),
  authoredResponses: many(responses, { relationName: "author" }),
  hiddenResponses: many(responses, { relationName: "hiddenBy" }),
  messageReactions: many(messageReactions),
  announcementReactions: many(announcementReactions),
  communicationEvents: many(communicationEvents),
  communicationStats: one(userCommunicationStats),
}));

export const timeOffRequestsRelations = relations(timeOffRequests, ({ one }) => ({
  user: one(users, { fields: [timeOffRequests.userId], references: [users.id] }),
  reviewer: one(users, { fields: [timeOffRequests.reviewedBy], references: [users.id] }),
}));

export const workSchedulesRelations = relations(workSchedules, ({ one, many }) => ({
  user: one(users, { fields: [workSchedules.userId], references: [users.id] }),
  coverageRequests: many(shiftCoverageRequests),
}));

export const shiftCoverageRequestsRelations = relations(shiftCoverageRequests, ({ one }) => ({
  requester: one(users, { fields: [shiftCoverageRequests.requesterId], references: [users.id] }),
  schedule: one(workSchedules, { fields: [shiftCoverageRequests.scheduleId], references: [workSchedules.id] }),
  coverer: one(users, { fields: [shiftCoverageRequests.coveredBy], references: [users.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  author: one(users, { fields: [announcements.authorId], references: [users.id] }),
  reactions: many(announcementReactions),
  responses: many(responses),
}));

export const trainingModulesRelations = relations(trainingModules, ({ one, many }) => ({
  creator: one(users, { fields: [trainingModules.createdBy], references: [users.id] }),
  lessons: many(trainingLessons),
  progress: many(trainingProgress),
  assessments: many(trainingAssessments),
  moduleSkills: many(trainingModuleSkills),
}));

export const trainingLessonsRelations = relations(trainingLessons, ({ one, many }) => ({
  module: one(trainingModules, { fields: [trainingLessons.moduleId], references: [trainingModules.id] }),
  lessonProgress: many(lessonProgress),
}));

export const trainingProgressRelations = relations(trainingProgress, ({ one }) => ({
  user: one(users, { fields: [trainingProgress.userId], references: [users.id] }),
  module: one(trainingModules, { fields: [trainingProgress.moduleId], references: [trainingModules.id] }),
  assigner: one(users, { fields: [trainingProgress.assignedBy], references: [users.id], relationName: "assignedTraining" }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, { fields: [lessonProgress.userId], references: [users.id] }),
  lesson: one(trainingLessons, { fields: [lessonProgress.lessonId], references: [trainingLessons.id] }),
}));

export const trainingAssessmentsRelations = relations(trainingAssessments, ({ one, many }) => ({
  module: one(trainingModules, { fields: [trainingAssessments.moduleId], references: [trainingModules.id] }),
  questions: many(trainingQuestions),
  attempts: many(trainingAttempts),
}));

export const trainingQuestionsRelations = relations(trainingQuestions, ({ one }) => ({
  assessment: one(trainingAssessments, { fields: [trainingQuestions.assessmentId], references: [trainingAssessments.id] }),
}));

export const trainingAttemptsRelations = relations(trainingAttempts, ({ one }) => ({
  user: one(users, { fields: [trainingAttempts.userId], references: [users.id] }),
  assessment: one(trainingAssessments, { fields: [trainingAttempts.assessmentId], references: [trainingAssessments.id] }),
}));

export const trainingSkillsRelations = relations(trainingSkills, ({ many }) => ({
  moduleSkills: many(trainingModuleSkills),
  employeeSkills: many(employeeSkills),
}));

export const trainingModuleSkillsRelations = relations(trainingModuleSkills, ({ one }) => ({
  module: one(trainingModules, { fields: [trainingModuleSkills.moduleId], references: [trainingModules.id] }),
  skill: one(trainingSkills, { fields: [trainingModuleSkills.skillId], references: [trainingSkills.id] }),
}));

export const employeeSkillsRelations = relations(employeeSkills, ({ one }) => ({
  user: one(users, { fields: [employeeSkills.userId], references: [users.id] }),
  skill: one(trainingSkills, { fields: [employeeSkills.skillId], references: [trainingSkills.id] }),
  acquiredFromModule: one(trainingModules, { fields: [employeeSkills.acquiredFrom], references: [trainingModules.id] }),
}));

export const stagedProductsRelations = relations(stagedProducts, ({ one, many }) => ({
  importer: one(users, { fields: [stagedProducts.importedBy], references: [users.id] }),
  collectionProducts: many(collectionProducts),
}));

export const trainingCollectionsRelations = relations(trainingCollections, ({ one, many }) => ({
  creator: one(users, { fields: [trainingCollections.createdBy], references: [users.id] }),
  module: one(trainingModules, { fields: [trainingCollections.moduleId], references: [trainingModules.id] }),
  collectionProducts: many(collectionProducts),
}));

export const collectionProductsRelations = relations(collectionProducts, ({ one }) => ({
  collection: one(trainingCollections, { fields: [collectionProducts.collectionId], references: [trainingCollections.id] }),
  product: one(stagedProducts, { fields: [collectionProducts.productId], references: [stagedProducts.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id], relationName: "sender" }),
  recipient: one(users, { fields: [messages.recipientId], references: [users.id], relationName: "recipient" }),
  channel: one(chatChannels, { fields: [messages.channelId], references: [chatChannels.id] }),
  smsDeliveries: many(smsDeliveries),
}));

export const smsDeliveriesRelations = relations(smsDeliveries, ({ one }) => ({
  message: one(messages, { fields: [smsDeliveries.messageId], references: [messages.id] }),
  user: one(users, { fields: [smsDeliveries.userId], references: [users.id] }),
}));

export const chatChannelsRelations = relations(chatChannels, ({ one, many }) => ({
  creator: one(users, { fields: [chatChannels.createdBy], references: [users.id] }),
  members: many(channelMembers),
  messages: many(messages),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(chatChannels, { fields: [channelMembers.channelId], references: [chatChannels.id] }),
  user: one(users, { fields: [channelMembers.userId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  permissions: many(documentPermissions),
  logs: many(documentLogs),
}));

export const documentPermissionsRelations = relations(documentPermissions, ({ one }) => ({
  document: one(documents, { fields: [documentPermissions.documentId], references: [documents.id] }),
  user: one(users, { fields: [documentPermissions.userId], references: [users.id] }),
  granter: one(users, { fields: [documentPermissions.grantedBy], references: [users.id] }),
}));

export const documentLogsRelations = relations(documentLogs, ({ one }) => ({
  document: one(documents, { fields: [documentLogs.documentId], references: [documents.id] }),
  user: one(users, { fields: [documentLogs.userId], references: [users.id] }),
}));

export const logosRelations = relations(logos, ({ one }) => ({
  uploader: one(users, { fields: [logos.uploadedBy], references: [users.id] }),
}));

export const employeeInvitationsRelations = relations(employeeInvitations, ({ one }) => ({
  inviter: one(users, { fields: [employeeInvitations.invitedBy], references: [users.id] }),
}));

// Analytics relations
export const communicationAnalyticsRelations = relations(communicationAnalytics, ({ many }) => ({
  // No direct relations needed for aggregated data
}));

export const communicationEventsRelations = relations(communicationEvents, ({ one }) => ({
  user: one(users, { fields: [communicationEvents.userId], references: [users.id] }),
  message: one(messages, { fields: [communicationEvents.messageId], references: [messages.id] }),
  announcement: one(announcements, { fields: [communicationEvents.announcementId], references: [announcements.id] }),
  channelMessage: one(channelMessages, { fields: [communicationEvents.channelMessageId], references: [channelMessages.id] }),
}));

export const userCommunicationStatsRelations = relations(userCommunicationStats, ({ one }) => ({
  user: one(users, { fields: [userCommunicationStats.userId], references: [users.id] }),
}));

// Create insert schemas
// Benefits item validation schema
export const benefitItemSchema = z.object({
  id: z.string(),
  type: z.enum(['ymca', 'employee_purchase', 'custom']),
  name: z.string().min(1),
  cadence: z.enum(['one_time', 'monthly', 'annual', 'per_shift']),
  amount: z.number().min(0).optional(),
  cap: z.number().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  hourlyRate: z.number().min(0).max(200).optional(),
  defaultEntryCost: z.number().min(0).max(100).optional(),
  benefits: z.array(benefitItemSchema).optional(),
});

// Enhanced schema for financial updates
export const updateUserFinancialsSchema = z.object({
  hourlyRate: z.number().min(0).max(200).optional(),
  defaultEntryCost: z.number().min(0).max(100).optional(),
  benefits: z.array(benefitItemSchema).optional(),
  employeePurchaseEnabled: z.boolean().optional(),
  employeePurchaseCap: z.string().optional(),
  employeePurchaseCostMarkup: z.string().optional(),
  employeePurchaseRetailDiscount: z.string().optional(),
});

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({
  id: true,
  requestedAt: true,
  reviewedAt: true,
});

export const insertWorkScheduleSchema = createInsertSchema(workSchedules).omit({
  id: true,
  createdAt: true,
});

export const insertShiftCoverageRequestSchema = createInsertSchema(shiftCoverageRequests).omit({
  id: true,
  requestedAt: true,
  coveredAt: true,
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  publishedAt: true,
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingGenerationJobSchema = createInsertSchema(trainingGenerationJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStagedProductSchema = createInsertSchema(stagedProducts).omit({
  id: true,
  importedAt: true,
  updatedAt: true,
});

export const insertTrainingCollectionSchema = createInsertSchema(trainingCollections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCollectionProductSchema = createInsertSchema(collectionProducts).omit({
  id: true,
  addedAt: true,
});

export const insertTrainingLessonSchema = createInsertSchema(trainingLessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingProgressSchema = createInsertSchema(trainingProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLessonProgressSchema = createInsertSchema(lessonProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingAssessmentSchema = createInsertSchema(trainingAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingQuestionSchema = createInsertSchema(trainingQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingAttemptSchema = createInsertSchema(trainingAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertTrainingSkillSchema = createInsertSchema(trainingSkills).omit({
  id: true,
  createdAt: true,
});

export const insertTrainingModuleSkillSchema = createInsertSchema(trainingModuleSkills).omit({
  id: true,
});

export const insertEmployeeSkillSchema = createInsertSchema(employeeSkills).omit({
  id: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  sentAt: true,
  readAt: true,
});

export const insertSMSDeliverySchema = createInsertSchema(smsDeliveries).omit({
  id: true,
  sentAt: true,
  deliveredAt: true,
  updatedAt: true,
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  sentAt: true,
  readAt: true,
});

export const insertChatChannelSchema = createInsertSchema(chatChannels).omit({
  id: true,
  createdAt: true,
});

export const insertChannelMemberSchema = createInsertSchema(channelMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  updatedAt: true,
});

export const insertDocumentPermissionSchema = createInsertSchema(documentPermissions).omit({
  id: true,
  grantedAt: true,
});

export const insertDocumentLogSchema = createInsertSchema(documentLogs).omit({
  id: true,
  timestamp: true,
});

export const insertLogoSchema = createInsertSchema(logos).omit({
  id: true,
  uploadedAt: true,
  updatedAt: true,
});

export const insertEmployeeBannerSchema = createInsertSchema(employeeBanners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateEmployeeBannerSchema = insertEmployeeBannerSchema.partial();

export const insertEmployeeSpotlightSchema = createInsertSchema(employeeSpotlights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateEmployeeSpotlightSchema = insertEmployeeSpotlightSchema.partial();

export const insertEmployeeInvitationSchema = createInsertSchema(employeeInvitations).omit({
  id: true,
  invitedAt: true,
  acceptedAt: true,
});

// Analytics insert schemas
export const insertCommunicationAnalyticsSchema = createInsertSchema(communicationAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommunicationEventSchema = createInsertSchema(communicationEvents).omit({
  id: true,
  eventTimestamp: true,
  createdAt: true,
});

export const insertUserCommunicationStatsSchema = createInsertSchema(userCommunicationStats).omit({
  id: true,
  lastCalculated: true,
  createdAt: true,
  updatedAt: true,
});

// Add relations for new tables
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// Phase 3: Enhanced Messaging Relations
export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, { fields: [messageReactions.messageId], references: [messages.id] }),
  user: one(users, { fields: [messageReactions.userId], references: [users.id] }),
}));

export const announcementReactionsRelations = relations(announcementReactions, ({ one }) => ({
  announcement: one(announcements, { fields: [announcementReactions.announcementId], references: [announcements.id] }),
  user: one(users, { fields: [announcementReactions.userId], references: [users.id] }),
}));

export const readReceiptsRelations = relations(readReceipts, ({ one }) => ({
  message: one(messages, { fields: [readReceipts.messageId], references: [messages.id] }),
  user: one(users, { fields: [readReceipts.userId], references: [users.id] }),
}));

export const voiceMessagesRelations = relations(voiceMessages, ({ one }) => ({
  message: one(messages, { fields: [voiceMessages.messageId], references: [messages.id] }),
}));

export const messageTemplatesRelations = relations(messageTemplates, ({ one }) => ({
  creator: one(users, { fields: [messageTemplates.createdBy], references: [users.id] }),
}));


// Enhanced messages relations with Phase 3 features
export const enhancedMessagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id], relationName: "messageSender" }),
  recipient: one(users, { fields: [messages.recipientId], references: [users.id], relationName: "messageRecipient" }),
  reactions: many(messageReactions),
  readReceipts: many(readReceipts),
  voiceMessage: one(voiceMessages),
}));

// Phase 6: Advanced Features - Scheduled Messages
export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  authorId: varchar("author_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("announcement"), // 'announcement', 'message', 'reminder'
  priority: varchar("priority").default("normal"), // 'emergency', 'high', 'normal', 'low'
  targetAudience: varchar("target_audience").default("all"), // 'all', 'employees', 'managers', 'department:X', 'store:X'
  targetEmployees: varchar("target_employees").array(), // specific employee IDs when targeting individuals
  smsEnabled: boolean("sms_enabled").default(false),
  
  // Scheduling information
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status").default("scheduled"), // 'scheduled', 'sent', 'failed', 'cancelled'
  
  // Auto-expiry (optional)
  expiresAt: timestamp("expires_at"),
  
  // Automation rule reference (if this is from an automation rule)
  automationRuleId: integer("automation_rule_id"),
  
  // Delivery tracking
  sentAt: timestamp("sent_at"),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  authorIdx: index("idx_scheduled_messages_author").on(table.authorId),
  scheduledForIdx: index("idx_scheduled_messages_scheduled_for").on(table.scheduledFor),
  statusIdx: index("idx_scheduled_messages_status").on(table.status),
  automationRuleIdx: index("idx_scheduled_messages_automation_rule").on(table.automationRuleId),
  typeIdx: index("idx_scheduled_messages_type").on(table.messageType),
}));

// Phase 6: Enhanced Announcement Templates with Emojis & Professional Categories
export const announcementTemplates = pgTable("announcement_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  category: varchar("category").notNull(), // 'emergency', 'safety', 'policy', 'schedule', 'general', 'training', 'important', 'recognition', 'maintenance'
  
  // Enhanced visual system
  emoji: varchar("emoji"), // Custom emoji for this template (e.g., '🚨', '📋', '🎉')
  priorityEmoji: varchar("priority_emoji"), // Auto-assigned based on priority
  categoryEmoji: varchar("category_emoji"), // Auto-assigned based on category
  
  // Template content
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  priority: varchar("priority").default("normal"), // 'emergency', 'high', 'normal', 'low'
  targetAudience: varchar("target_audience").default("all"), // Default audience for this template
  targetEmployees: varchar("target_employees").array(), // specific employee IDs when targeting individuals
  smsEnabled: boolean("sms_enabled").default(false), // Default SMS setting
  
  // Template metadata
  isActive: boolean("is_active").default(true),
  useCount: integer("use_count").default(0),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  lastUsedAt: timestamp("last_used_at"),
  
  // Tags for better organization
  tags: text("tags").array(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_announcement_templates_category").on(table.category),
  createdByIdx: index("idx_announcement_templates_created_by").on(table.createdBy),
  activeIdx: index("idx_announcement_templates_active").on(table.isActive),
  nameIdx: index("idx_announcement_templates_name").on(table.name),
}));

// Phase 6: Automation Rules for recurring messages
export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Rule configuration
  isActive: boolean("is_active").default(true),
  ruleType: varchar("rule_type").notNull(), // 'recurring', 'conditional', 'reminder'
  
  // Scheduling pattern
  cronExpression: varchar("cron_expression"), // For recurring messages (e.g., "0 9 * * 1" = every Monday at 9am)
  timezone: varchar("timezone").default("America/Chicago"),
  
  // Template to use
  templateId: integer("template_id").references(() => announcementTemplates.id),
  
  // Override template values if needed
  title: varchar("title"), // Override template title
  content: text("content"), // Override template content
  priority: varchar("priority"), // Override template priority
  targetAudience: varchar("target_audience"), // Override template audience
  smsEnabled: boolean("sms_enabled"), // Override template SMS setting
  
  // Conditional logic (for future expansion)
  conditions: jsonb("conditions"), // JSON object defining conditions
  
  // Rule metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  lastTriggered: timestamp("last_triggered"),
  nextRun: timestamp("next_run"),
  runCount: integer("run_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIdx: index("idx_automation_rules_active").on(table.isActive),
  typeIdx: index("idx_automation_rules_type").on(table.ruleType),
  nextRunIdx: index("idx_automation_rules_next_run").on(table.nextRun),
  createdByIdx: index("idx_automation_rules_created_by").on(table.createdBy),
  templateIdx: index("idx_automation_rules_template").on(table.templateId),
}));

// Export types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type SMSConsentHistory = typeof smsConsentHistory.$inferSelect;
export type InsertSMSConsentHistory = typeof smsConsentHistory.$inferInsert;
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type InsertWorkSchedule = z.infer<typeof insertWorkScheduleSchema>;
export type WorkSchedule = typeof workSchedules.$inferSelect;
export type CalendarNote = typeof calendarNotes.$inferSelect;
export type InsertCalendarNote = typeof calendarNotes.$inferInsert;

export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;
export type InsertShiftSwapRequest = typeof shiftSwapRequests.$inferInsert;
export type InsertShiftCoverageRequest = z.infer<typeof insertShiftCoverageRequestSchema>;
export type ShiftCoverageRequest = typeof shiftCoverageRequests.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;

export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModule = typeof trainingModules.$inferSelect;

export type InsertTrainingGenerationJob = z.infer<typeof insertTrainingGenerationJobSchema>;
export type TrainingGenerationJob = typeof trainingGenerationJobs.$inferSelect;

export type InsertStagedProduct = z.infer<typeof insertStagedProductSchema>;
export type StagedProduct = typeof stagedProducts.$inferSelect;

export type InsertTrainingCollection = z.infer<typeof insertTrainingCollectionSchema>;
export type TrainingCollection = typeof trainingCollections.$inferSelect;

export type InsertCollectionProduct = z.infer<typeof insertCollectionProductSchema>;
export type CollectionProduct = typeof collectionProducts.$inferSelect;

export type InsertTrainingLesson = z.infer<typeof insertTrainingLessonSchema>;
export type TrainingLesson = typeof trainingLessons.$inferSelect;

export type InsertTrainingProgress = z.infer<typeof insertTrainingProgressSchema>;
export type TrainingProgress = typeof trainingProgress.$inferSelect;

export type InsertLessonProgress = z.infer<typeof insertLessonProgressSchema>;
export type LessonProgress = typeof lessonProgress.$inferSelect;

export type InsertTrainingAssessment = z.infer<typeof insertTrainingAssessmentSchema>;
export type TrainingAssessment = typeof trainingAssessments.$inferSelect;

export type InsertTrainingQuestion = z.infer<typeof insertTrainingQuestionSchema>;
export type TrainingQuestion = typeof trainingQuestions.$inferSelect;

export type InsertTrainingAttempt = z.infer<typeof insertTrainingAttemptSchema>;
export type TrainingAttempt = typeof trainingAttempts.$inferSelect;

export type InsertTrainingSkill = z.infer<typeof insertTrainingSkillSchema>;
export type TrainingSkill = typeof trainingSkills.$inferSelect;

export type InsertTrainingModuleSkill = z.infer<typeof insertTrainingModuleSkillSchema>;
export type TrainingModuleSkill = typeof trainingModuleSkills.$inferSelect;

export type InsertEmployeeSkill = z.infer<typeof insertEmployeeSkillSchema>;
export type EmployeeSkill = typeof employeeSkills.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type InsertLogo = z.infer<typeof insertLogoSchema>;
export type Logo = typeof logos.$inferSelect;
export type InsertEmployeeBanner = z.infer<typeof insertEmployeeBannerSchema>;
export type EmployeeBanner = typeof employeeBanners.$inferSelect;
export type InsertEmployeeSpotlight = z.infer<typeof insertEmployeeSpotlightSchema>;
export type EmployeeSpotlight = typeof employeeSpotlights.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;
export type InsertChatChannel = z.infer<typeof insertChatChannelSchema>;
export type ChatChannel = typeof chatChannels.$inferSelect;
export type InsertChannelMember = z.infer<typeof insertChannelMemberSchema>;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocumentPermission = z.infer<typeof insertDocumentPermissionSchema>;
export type DocumentPermission = typeof documentPermissions.$inferSelect;
export type InsertDocumentLog = z.infer<typeof insertDocumentLogSchema>;
export type DocumentLog = typeof documentLogs.$inferSelect;

// Employee invitation types
export type EmployeeInvitation = typeof employeeInvitations.$inferSelect;
export type InsertEmployeeInvitation = typeof employeeInvitations.$inferInsert;

// Phase 3: Enhanced Messaging Insert Schemas
export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
  id: true,
  createdAt: true,
});

export const insertAnnouncementReactionSchema = createInsertSchema(announcementReactions).omit({
  id: true,
  createdAt: true,
});

export const insertReadReceiptSchema = createInsertSchema(readReceipts).omit({
  id: true,
  readAt: true,
  deliveredAt: true,
});

export const insertVoiceMessageSchema = createInsertSchema(voiceMessages).omit({
  id: true,
  uploadedAt: true,
});

export const insertCommunicationAttachmentSchema = createInsertSchema(communicationAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Phase 3: Enhanced Messaging Types
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;
export type AnnouncementReaction = typeof announcementReactions.$inferSelect;
export type InsertAnnouncementReaction = typeof announcementReactions.$inferInsert;
export type ReadReceipt = typeof readReceipts.$inferSelect;
export type InsertReadReceipt = typeof readReceipts.$inferInsert;
export type VoiceMessage = typeof voiceMessages.$inferSelect;
export type InsertVoiceMessage = typeof voiceMessages.$inferInsert;
export type CommunicationAttachment = typeof communicationAttachments.$inferSelect;
export type InsertCommunicationAttachment = z.infer<typeof insertCommunicationAttachmentSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = typeof messageTemplates.$inferInsert;



// Calendar event type for unified calendar view
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'schedule' | 'timeoff' | 'coverage_request' | 'announcement';
  userId?: string;
  locationId?: number;
  status?: string;
  description?: string;
  data?: any;
}

// ============================================
// ACCOUNTING TOOL SCHEMA EXTENSION
// ============================================

// QuickBooks Integration Configuration
export const quickbooksConfig = pgTable("quickbooks_config", {
  id: serial("id").primaryKey(),
  companyId: varchar("company_id").notNull().unique(), // QB Company ID
  accessToken: text("access_token"), // Encrypted OAuth token
  refreshToken: text("refresh_token"), // Encrypted refresh token
  tokenExpiry: timestamp("token_expires_at"),
  realmId: varchar("realm_id"), // QB Realm ID
  baseUrl: varchar("base_url"), // Sandbox vs Production URL
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("idx_qb_company_id").on(table.companyId),
}));

// Clover POS Integration Configuration
export const cloverConfig = pgTable("clover_config", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id").notNull().unique(),
  merchantName: varchar("merchant_name"), // Human-readable location name
  locationId: integer("location_id").notNull().references(() => locations.id), // Maps to internal location - REQUIRED
  apiToken: text("api_token"), // Encrypted API token for REST API calls
  publicKey: text("public_key"), // Ecommerce public key for iframe tokenization
  privateKey: text("private_key"), // Ecommerce private key for payment processing
  baseUrl: varchar("base_url"), // Sandbox vs Production
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantIdIdx: index("idx_clover_merchant_id").on(table.merchantId),
}));

// HSA Tools Configuration
export const hsaConfig = pgTable("hsa_config", {
  id: serial("id").primaryKey(),
  systemName: varchar("system_name").notNull(), // HSA provider name
  apiEndpoint: varchar("api_endpoint"),
  apiKey: text("api_key"), // Encrypted API key
  accountNumber: varchar("account_number"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Thrive Inventory Configuration
export const thriveConfig = pgTable("thrive_config", {
  id: serial("id").primaryKey(),
  storeId: varchar("store_id").notNull().unique(),
  apiToken: text("api_token"), // Encrypted API token
  baseUrl: varchar("base_url"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("idx_thrive_store_id").on(table.storeId),
}));

// Amazon Seller API Configuration
export const amazonConfig = pgTable("amazon_config", {
  id: serial("id").primaryKey(),
  sellerId: varchar("seller_id").notNull().unique(),
  marketplaceId: varchar("marketplace_id"), // e.g., ATVPDKIKX0DER for US
  merchantName: varchar("merchant_name"), // Human-readable store name
  refreshToken: text("refresh_token"), // Encrypted refresh token
  clientId: text("client_id"), // Encrypted client identifier
  clientSecret: text("client_secret"), // Encrypted client secret
  accessToken: text("access_token"), // Current access token
  baseUrl: varchar("base_url").default("https://sellingpartnerapi-na.amazon.com"), // SP API endpoint
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sellerIdIdx: index("idx_amazon_seller_id").on(table.sellerId),
  marketplaceIdIdx: index("idx_amazon_marketplace_id").on(table.marketplaceId),
}));

// Financial Accounts (Chart of Accounts from QB)
export const financialAccounts = pgTable("financial_accounts", {
  id: serial("id").primaryKey(),
  qbAccountId: varchar("qb_account_id").unique(), // QuickBooks Account ID
  accountNumber: varchar("account_number"),
  accountName: varchar("account_name").notNull(),
  accountType: varchar("account_type").notNull(), // Asset, Liability, Equity, Income, Expense
  subType: varchar("sub_type"),
  description: text("description"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00"),
  dataSource: varchar("data_source").default("Auto"), // Auto (API-calculated), Manual, QuickBooks
  manualBalance: decimal("manual_balance", { precision: 15, scale: 2 }), // For manually entered fixed expenses
  billingFrequency: varchar("billing_frequency").default("monthly"), // weekly, monthly, quarterly, annual, custom - determines how expense resets per period
  effectiveMonth: integer("effective_month"), // For annual/quarterly expenses: which month (1-12) the expense applies to
  effectiveYear: integer("effective_year"), // For annual expenses: which year the expense applies to
  isActive: boolean("is_active").default(true),
  parentAccountId: integer("parent_account_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  qbAccountIdIdx: index("idx_fa_qb_account_id").on(table.qbAccountId),
  accountTypeIdx: index("idx_fa_account_type").on(table.accountType),
  parentAccountIdx: index("idx_fa_parent_account").on(table.parentAccountId),
  dataSourceIdx: index("idx_fa_data_source").on(table.dataSource),
  billingFrequencyIdx: index("idx_fa_billing_frequency").on(table.billingFrequency),
}));

// Financial Transactions (General Ledger Entries)
export const financialTransactions = pgTable("financial_transactions", {
  id: serial("id").primaryKey(),
  qbTransactionId: varchar("qb_transaction_id").unique(),
  transactionNumber: varchar("transaction_number"),
  transactionDate: date("transaction_date").notNull(),
  transactionType: varchar("transaction_type").notNull(), // Journal Entry, Invoice, Bill, Payment, etc.
  description: text("description"),
  referenceNumber: varchar("reference_number"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  sourceSystem: varchar("source_system").notNull(), // QB, Clover, HSA, Thrive, Manual
  sourceId: varchar("source_id"), // Original system's transaction ID
  status: varchar("status").default("pending"), // pending, posted, voided
  frequency: varchar("frequency").default("one_time"), // one_time, weekly, bi_weekly, monthly, quarterly, annually
  createdBy: varchar("created_by").references(() => users.id),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  qbTransactionIdIdx: index("idx_ft_qb_transaction_id").on(table.qbTransactionId),
  transactionDateIdx: index("idx_ft_transaction_date").on(table.transactionDate),
  sourceSystemIdx: index("idx_ft_source_system").on(table.sourceSystem),
  statusIdx: index("idx_ft_status").on(table.status),
  frequencyIdx: index("idx_ft_frequency").on(table.frequency),
}));

// Financial Transaction Lines (Journal Entry Details)
export const financialTransactionLines = pgTable("financial_transaction_lines", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => financialTransactions.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => financialAccounts.id),
  description: text("description"),
  debitAmount: decimal("debit_amount", { precision: 15, scale: 2 }).default("0.00"),
  creditAmount: decimal("credit_amount", { precision: 15, scale: 2 }).default("0.00"),
  lineNumber: integer("line_number").default(1),
  customerVendorId: varchar("customer_vendor_id"), // Reference to QB Customer/Vendor
  itemId: varchar("item_id"), // Product/Service Item from inventory
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  transactionIdIdx: index("idx_ftl_transaction_id").on(table.transactionId),
  accountIdIdx: index("idx_ftl_account_id").on(table.accountId),
}));

// Customers and Vendors (from QuickBooks)
export const customersVendors = pgTable("customers_vendors", {
  id: serial("id").primaryKey(),
  qbId: varchar("qb_id").unique(), // QuickBooks Customer/Vendor ID
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // customer, vendor
  companyName: varchar("company_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  qbIdIdx: index("idx_cv_qb_id").on(table.qbId),
  typeIdx: index("idx_cv_type").on(table.type),
  nameIdx: index("idx_cv_name").on(table.name),
}));

// ================================
// PURCHASING MODULE
// ================================

// Vendor Profiles (extends customersVendors with purchasing metadata)
export const vendorProfiles = pgTable("vendor_profiles", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => customersVendors.id, { onDelete: "cascade" }).unique(),
  paymentTerms: varchar("payment_terms").default("Net 30"),
  preferredPaymentMethod: varchar("preferred_payment_method"),
  accountNumber: varchar("account_number"),
  creditCardLastFour: varchar("credit_card_last_four", { length: 4 }),
  website: varchar("website"),
  notes: text("notes"),
  isPreferredVendor: boolean("is_preferred_vendor").default(false),
  source: varchar("source").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  vendorIdIdx: index("idx_vp_vendor_id").on(table.vendorId),
}));

// Purchase Orders
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: varchar("po_number").notNull().unique(),
  vendorId: integer("vendor_id").notNull().references(() => customersVendors.id),
  status: varchar("status").notNull().default("draft"),
  requestedById: varchar("requested_by_id").notNull().references(() => users.id),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  locationId: integer("location_id"),
  expenseAccountId: integer("expense_account_id").references(() => financialAccounts.id),
  paymentTerms: varchar("payment_terms").default("Net 30"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  shippingAmount: decimal("shipping_amount", { precision: 12, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0.00"),
  orderDate: date("order_date"),
  expectedDeliveryDate: date("expected_delivery_date"),
  receivedDate: date("received_date"),
  
  // Order Tracking (post-approval)
  orderPlacedDate: timestamp("order_placed_date"),
  vendorOrderNumber: varchar("vendor_order_number"),
  trackingNumber: varchar("tracking_number"),
  shippedDate: date("shipped_date"),
  actualShippingCost: decimal("actual_shipping_cost", { precision: 12, scale: 2 }),
  actualHandlingCost: decimal("actual_handling_cost", { precision: 12, scale: 2 }),
  actualProductCost: decimal("actual_product_cost", { precision: 12, scale: 2 }),
  
  // Payment Tracking
  paymentStatus: varchar("payment_status").default("unpaid"), // unpaid, scheduled, paid
  paymentDate: date("payment_date"),
  scheduledPaymentDate: date("scheduled_payment_date"),
  expectedChargeDate: date("expected_charge_date"), // For Credit Card and Bank of Lake-9187 payment terms
  paymentMethod: varchar("payment_method"), // check, ach, wire, credit_card, cash
  paymentReference: varchar("payment_reference"), // check number, transaction ID, etc.
  quickbooksPaymentId: varchar("quickbooks_payment_id"), // for QB reconciliation
  
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  poNumberIdx: index("idx_po_number").on(table.poNumber),
  vendorIdIdx: index("idx_po_vendor_id").on(table.vendorId),
  statusIdx: index("idx_po_status").on(table.status),
  requestedByIdx: index("idx_po_requested_by").on(table.requestedById),
  orderDateIdx: index("idx_po_order_date").on(table.orderDate),
  expenseAccountIdIdx: index("idx_po_expense_account").on(table.expenseAccountId),
}));

// Purchase Order Line Items
export const purchaseOrderLineItems = pgTable("purchase_order_line_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  description: varchar("description").notNull(),
  sku: varchar("sku"),
  productUrl: text("product_url"), // URL to product page on vendor website
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
  receivedQuantity: decimal("received_quantity", { precision: 10, scale: 3 }).default("0.000"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  purchaseOrderIdIdx: index("idx_poli_po_id").on(table.purchaseOrderId),
  inventoryItemIdIdx: index("idx_poli_item_id").on(table.inventoryItemId),
}));

// Purchase Order Approvals
export const purchaseOrderApprovals = pgTable("purchase_order_approvals", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  approverId: varchar("approver_id").references(() => users.id),
  requiredRole: varchar("required_role").notNull(),
  approvalThreshold: decimal("approval_threshold", { precision: 12, scale: 2 }),
  sequence: integer("sequence").default(1),
  status: varchar("status").notNull().default("pending"),
  decision: varchar("decision"),
  decisionDate: timestamp("decision_date"),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  purchaseOrderIdIdx: index("idx_poa_po_id").on(table.purchaseOrderId),
  approverIdIdx: index("idx_poa_approver_id").on(table.approverId),
  statusIdx: index("idx_poa_status").on(table.status),
}));

// Purchase Order Events (Audit Trail)
export const purchaseOrderEvents = pgTable("purchase_order_events", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  eventType: varchar("event_type").notNull(),
  oldStatus: varchar("old_status"),
  newStatus: varchar("new_status"),
  description: text("description").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  purchaseOrderIdIdx: index("idx_poe_po_id").on(table.purchaseOrderId),
  eventTypeIdx: index("idx_poe_event_type").on(table.eventType),
  createdAtIdx: index("idx_poe_created_at").on(table.createdAt),
}));

// Inventory Items (from Thrive and QB)
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  qbItemId: varchar("qb_item_id").unique(),
  thriveItemId: varchar("thrive_item_id").unique(),
  cloverItemId: varchar("clover_item_id"),
  locationId: integer("location_id"), // Clover config ID for multi-location tracking
  cloverMerchantId: varchar("clover_merchant_id"), // Clover merchant ID
  sku: varchar("sku"),
  upc: varchar("upc"), // UPC barcode from Clover item.code
  asin: varchar("asin"), // Amazon Standard Identification Number
  itemName: varchar("item_name").notNull(),
  description: text("description"),
  category: varchar("category"),
  vendor: varchar("vendor"), // Vendor/Supplier name
  tags: text("tags").array(), // Tags from Clover
  unitOfMeasure: varchar("unit_of_measure"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0.00"),
  standardCost: decimal("standard_cost", { precision: 10, scale: 2 }).default("0.00"), // Standard cost for COGS calculation
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00"),
  quantityOnHand: decimal("quantity_on_hand", { precision: 10, scale: 3 }).default("0.000"),
  reorderPoint: decimal("reorder_point", { precision: 10, scale: 3 }).default("0.000"),
  isActive: boolean("is_active").default(true),
  
  // Sync status tracking for Thrive-Clover reconciliation
  importSource: varchar("import_source"), // 'clover', 'thrive', 'manual'
  syncStatus: varchar("sync_status"), // 'synced', 'unmatched_thrive', 'missing_vendor_data', 'discrepancy'
  matchMethod: varchar("match_method"), // How item was matched: 'SKU+Location', 'Name+Location', 'SKU', etc.
  thriveQuantity: decimal("thrive_quantity", { precision: 10, scale: 3 }), // Thrive's reported quantity for comparison
  thriveListPrice: decimal("thrive_list_price", { precision: 10, scale: 2 }), // Thrive's list/sale price
  thriveCost: decimal("thrive_cost", { precision: 10, scale: 2 }), // Thrive's unit cost
  hasDiscrepancy: boolean("has_discrepancy").default(false), // Quick flag for quantity mismatches
  lastThriveImport: timestamp("last_thrive_import"), // When Thrive data was last imported
  
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  qbItemIdIdx: index("idx_ii_qb_item_id").on(table.qbItemId),
  thriveItemIdIdx: index("idx_ii_thrive_item_id").on(table.thriveItemId),
  cloverItemIdIdx: index("idx_ii_clover_item_id").on(table.cloverItemId),
  locationIdIdx: index("idx_ii_location_id").on(table.locationId),
  cloverMerchantIdIdx: index("idx_ii_clover_merchant_id").on(table.cloverMerchantId),
  skuIdx: index("idx_ii_sku").on(table.sku),
  upcIdx: index("idx_ii_upc").on(table.upc),
  asinIdx: index("idx_ii_asin").on(table.asin),
  categoryIdx: index("idx_ii_category").on(table.category),
  vendorIdx: index("idx_ii_vendor").on(table.vendor),
  syncStatusIdx: index("idx_ii_sync_status").on(table.syncStatus),
  hasDiscrepancyIdx: index("idx_ii_has_discrepancy").on(table.hasDiscrepancy),
}));

// Inventory Snapshots (monthly snapshots for beginning/ending inventory values)
export const inventorySnapshots = pgTable("inventory_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: date("snapshot_date").notNull(),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  periodType: varchar("period_type", { length: 20 }).notNull(), // 'BEGINNING' or 'ENDING'
  inventoryValue: decimal("inventory_value", { precision: 14, scale: 2 }).notNull(),
  itemCount: integer("item_count"), // Number of items included in snapshot
  capturedAt: timestamp("captured_at").defaultNow(),
  notes: text("notes"),
}, (table) => ({
  monthYearIdx: index("idx_is_month_year").on(table.month, table.year),
  periodTypeIdx: index("idx_is_period_type").on(table.periodType),
  snapshotDateIdx: index("idx_is_snapshot_date").on(table.snapshotDate),
  uniqueSnapshot: index("idx_is_unique").on(table.month, table.year, table.periodType),
}));

export const insertInventorySnapshotSchema = createInsertSchema(inventorySnapshots).omit({ id: true, capturedAt: true });
export type InsertInventorySnapshot = z.infer<typeof insertInventorySnapshotSchema>;
export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;

// Unmatched Thrive Items (for manual reconciliation)
export const unmatchedThriveItems = pgTable("unmatched_thrive_items", {
  id: serial("id").primaryKey(),
  productName: varchar("product_name").notNull(),
  variant: varchar("variant"),
  locationName: varchar("location_name"),
  category: varchar("category"),
  vendor: varchar("vendor"),
  sku: varchar("sku"),
  quantityOnHand: decimal("quantity_on_hand", { precision: 10, scale: 3 }),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  importDate: timestamp("import_date").defaultNow(),
  status: varchar("status").default("pending"), // pending, matched, ignored
  matchedItemId: integer("matched_item_id").references(() => inventoryItems.id),
  notes: text("notes"),
}, (table) => ({
  statusIdx: index("idx_uti_status").on(table.status),
  skuIdx: index("idx_uti_sku").on(table.sku),
  locationIdx: index("idx_uti_location").on(table.locationName),
}));

// POS Sales Data (from Clover)
export const posSales = pgTable("pos_sales", {
  id: serial("id").primaryKey(),
  cloverOrderId: varchar("clover_order_id").unique(),
  amazonOrderId: varchar("amazon_order_id").unique(),
  saleDate: date("sale_date").notNull(),
  saleTime: timestamp("sale_time").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  paymentMethod: varchar("payment_method"), // cash, card, mobile
  cardType: varchar("card_type"), // visa, mastercard, amex, etc.
  locationId: integer("location_id").references(() => posLocations.id),
  employeeId: varchar("employee_id").references(() => users.id),
  customerCount: integer("customer_count").default(1),
  status: varchar("status").default("completed"), // completed, refunded, voided
  qbPosted: boolean("qb_posted").default(false),
  qbTransactionId: varchar("qb_transaction_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  cloverOrderIdIdx: index("idx_ps_clover_order_id").on(table.cloverOrderId),
  amazonOrderIdIdx: index("idx_ps_amazon_order_id").on(table.amazonOrderId),
  saleDateIdx: index("idx_ps_sale_date").on(table.saleDate),
  locationIdIdx: index("idx_ps_location_id").on(table.locationId),
  qbPostedIdx: index("idx_ps_qb_posted").on(table.qbPosted),
}));

// POS Sale Items (Line items from Clover sales)
export const posSaleItems = pgTable("pos_sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => posSales.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  itemName: varchar("item_name").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  costBasis: decimal("cost_basis", { precision: 10, scale: 2 }), // Actual cost basis for COGS calculation
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  saleIdIdx: index("idx_psi_sale_id").on(table.saleId),
  inventoryItemIdIdx: index("idx_psi_inventory_item_id").on(table.inventoryItemId),
}));

// Employee Purchases (Barcode scanning for employee store purchases)
export const employeePurchases = pgTable("employee_purchases", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id").notNull().references(() => users.id),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  locationId: integer("location_id").references(() => locations.id), // Which store location (Watertown/Lake Geneva)
  itemName: varchar("item_name").notNull(),
  barcode: varchar("barcode"), // Scanned barcode/SKU
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull().default("1.000"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Price employee pays per unit
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(), // Total amount employee pays
  retailValue: decimal("retail_value", { precision: 10, scale: 2 }), // Retail value of items (for allowance tracking)
  cogsValue: decimal("cogs_value", { precision: 10, scale: 2 }), // COGS value for loss accounting
  purchaseDate: timestamp("purchase_date").defaultNow().notNull(),
  periodMonth: varchar("period_month").notNull(), // YYYY-MM format for monthly allowance tracking
  status: varchar("status").default("completed").notNull(), // completed, voided, pending_payment
  notes: text("notes"), // Special instructions/approvals (e.g., "Owner approved 3 for price of 1")
  
  // Clover payment integration fields
  requiresPayment: boolean("requires_payment").default(false), // true if purchase exceeds allowance
  paymentStatus: varchar("payment_status").default("not_required"), // not_required, pending, paid, failed
  cloverPaymentId: varchar("clover_payment_id"), // Clover payment ID for tracking
  cloverOrderId: varchar("clover_order_id"), // Clover order ID for reference
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }), // Amount employee actually paid
  paymentDate: timestamp("payment_date"), // When payment was completed
  paymentMethod: varchar("payment_method"), // credit_card, debit_card, etc.
  last4: varchar("last_4"), // Last 4 digits of card used
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employeeIdIdx: index("idx_ep_employee_id").on(table.employeeId),
  purchaseDateIdx: index("idx_ep_purchase_date").on(table.purchaseDate),
  periodMonthIdx: index("idx_ep_period_month").on(table.periodMonth),
  statusIdx: index("idx_ep_status").on(table.status),
  employeePeriodIdx: index("idx_ep_employee_period").on(table.employeeId, table.periodMonth),
  paymentStatusIdx: index("idx_ep_payment_status").on(table.paymentStatus),
  cloverPaymentIdIdx: index("idx_ep_clover_payment_id").on(table.cloverPaymentId),
}));

// HSA Expenses
export const hsaExpenses = pgTable("hsa_expenses", {
  id: serial("id").primaryKey(),
  hsaSystemId: varchar("hsa_system_id").unique(),
  employeeId: varchar("employee_id").references(() => users.id),
  expenseDate: date("expense_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category").notNull(), // medical, dental, vision, etc.
  description: text("description"),
  receiptUrl: varchar("receipt_url"),
  isEligible: boolean("is_eligible").default(true),
  status: varchar("status").default("pending"), // pending, approved, denied, reimbursed
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  qbPosted: boolean("qb_posted").default(false),
  qbTransactionId: varchar("qb_transaction_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  hsaSystemIdIdx: index("idx_hsa_system_id").on(table.hsaSystemId),
  employeeIdIdx: index("idx_hsa_employee_id").on(table.employeeId),
  expenseDateIdx: index("idx_hsa_expense_date").on(table.expenseDate),
  statusIdx: index("idx_hsa_status").on(table.status),
  qbPostedIdx: index("idx_hsa_qb_posted").on(table.qbPosted),
}));

// System Integration Logs
export const integrationLogs = pgTable("integration_logs", {
  id: serial("id").primaryKey(),
  system: varchar("system").notNull(), // quickbooks, clover, hsa, thrive
  operation: varchar("operation").notNull(), // sync, create, update, delete
  recordType: varchar("record_type"), // transaction, customer, item, etc.
  recordId: varchar("record_id"),
  status: varchar("status").notNull(), // success, error, warning
  message: text("message"),
  errorDetails: jsonb("error_details"),
  processingTime: integer("processing_time_ms"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  systemIdx: index("idx_il_system").on(table.system),
  statusIdx: index("idx_il_status").on(table.status),
  timestampIdx: index("idx_il_timestamp").on(table.timestamp),
  recordTypeIdx: index("idx_il_record_type").on(table.recordType),
}));

// Sync Jobs - Track historical sync operations with persistent state
export const syncJobs = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  type: varchar("type").notNull(), // clover_historical, amazon_historical
  status: varchar("status").notNull().default("pending"), // pending, active, completed, failed, cancelled
  requestedBy: varchar("requested_by").references(() => users.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalLocations: integer("total_locations").default(0),
  totalOrders: integer("total_orders").default(0),
  processedOrders: integer("processed_orders").default(0),
  metadata: jsonb("metadata"), // startDate, endDate, forceFullSync, etc.
  errorLog: text("error_log"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("idx_sj_status").on(table.status),
  typeIdx: index("idx_sj_type").on(table.type),
  createdAtIdx: index("idx_sj_created_at").on(table.createdAt),
}));

// Sync Checkpoints - Track per-location progress for resumable syncs
export const syncCheckpoints = pgTable("sync_checkpoints", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => syncJobs.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => posLocations.id),
  merchantId: varchar("merchant_id"), // Clover merchant ID or Amazon seller ID
  lastSyncedAt: timestamp("last_synced_at"), // Last successfully synced order timestamp
  nextCursor: varchar("next_cursor"), // API pagination cursor
  processedOrders: integer("processed_orders").default(0),
  totalOrders: integer("total_orders").default(0),
  status: varchar("status").notNull().default("pending"), // pending, active, completed, failed, retry
  retryCount: integer("retry_count").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  jobIdIdx: index("idx_sc_job_id").on(table.jobId),
  locationIdIdx: index("idx_sc_location_id").on(table.locationId),
  statusIdx: index("idx_sc_status").on(table.status),
  jobLocationIdx: unique("idx_sc_job_location").on(table.jobId, table.locationId),
}));

// Financial Reports Configuration
export const reportConfigs = pgTable("report_configs", {
  id: serial("id").primaryKey(),
  reportName: varchar("report_name").notNull(),
  reportType: varchar("report_type").notNull(), // profit_loss, balance_sheet, cash_flow, custom
  parameters: jsonb("parameters"), // Report configuration and filters
  createdBy: varchar("created_by").references(() => users.id),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  reportTypeIdx: index("idx_rc_report_type").on(table.reportType),
  createdByIdx: index("idx_rc_created_by").on(table.createdBy),
}));

// Dashboard Widgets Configuration
export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  widgetType: varchar("widget_type").notNull(), // financial_summary, sales_chart, inventory_alerts, etc.
  widgetConfig: jsonb("widget_config"), // Widget-specific configuration
  position: integer("position").default(1),
  size: varchar("size").default("medium"), // small, medium, large
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_dw_user_id").on(table.userId),
  widgetTypeIdx: index("idx_dw_widget_type").on(table.widgetType),
}));

// ============================================
// MONTHLY ACCOUNTING ARCHIVAL TABLES
// ============================================

// Monthly Closings - Records when months were closed and summary data
export const monthlyClosings = pgTable("monthly_closings", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  closingDate: timestamp("closing_date").notNull().defaultNow(),
  closedBy: varchar("closed_by").notNull().references(() => users.id),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalExpenses: decimal("total_expenses", { precision: 15, scale: 2 }).notNull().default("0.00"),
  netIncome: decimal("net_income", { precision: 15, scale: 2 }).notNull().default("0.00"),
  transactionCount: integer("transaction_count").notNull().default(0),
  accountBalanceSnapshot: jsonb("account_balance_snapshot"), // Account balances at month end
  notes: text("notes"),
  status: varchar("status").notNull().default("closed"), // closed, reopened
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  yearMonthIdx: unique("idx_mc_year_month").on(table.year, table.month),
  yearIdx: index("idx_mc_year").on(table.year),
  statusIdx: index("idx_mc_status").on(table.status),
  closingDateIdx: index("idx_mc_closing_date").on(table.closingDate),
}));

// Monthly Account Balances - Snapshot of all account balances at month end
export const monthlyAccountBalances = pgTable("monthly_account_balances", {
  id: serial("id").primaryKey(),
  monthlyClosingId: integer("monthly_closing_id").notNull().references(() => monthlyClosings.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => financialAccounts.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  closingBalance: decimal("closing_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalDebits: decimal("total_debits", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCredits: decimal("total_credits", { precision: 15, scale: 2 }).notNull().default("0.00"),
  transactionCount: integer("transaction_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  monthlyClosingIdIdx: index("idx_mab_monthly_closing_id").on(table.monthlyClosingId),
  accountIdIdx: index("idx_mab_account_id").on(table.accountId),
  yearMonthIdx: index("idx_mab_year_month").on(table.year, table.month),
  accountYearMonthIdx: unique("idx_mab_account_year_month").on(table.accountId, table.year, table.month),
}));

// Monthly Transaction Summaries - Aggregated transaction data by account and month
export const monthlyTransactionSummaries = pgTable("monthly_transaction_summaries", {
  id: serial("id").primaryKey(),
  monthlyClosingId: integer("monthly_closing_id").notNull().references(() => monthlyClosings.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => financialAccounts.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  sourceSystem: varchar("source_system").notNull(), // QB, Clover, HSA, Thrive, Manual
  transactionCount: integer("transaction_count").notNull().default(0),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalDebits: decimal("total_debits", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCredits: decimal("total_credits", { precision: 15, scale: 2 }).notNull().default("0.00"),
  averageAmount: decimal("average_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  monthlyClosingIdIdx: index("idx_mts_monthly_closing_id").on(table.monthlyClosingId),
  accountIdIdx: index("idx_mts_account_id").on(table.accountId),
  sourceSystemIdx: index("idx_mts_source_system").on(table.sourceSystem),
  yearMonthIdx: index("idx_mts_year_month").on(table.year, table.month),
  accountSourceYearMonthIdx: unique("idx_mts_account_source_year_month").on(table.accountId, table.sourceSystem, table.year, table.month),
}));

// Monthly Reset History - Track when months were reset to fresh start
export const monthlyResetHistory = pgTable("monthly_reset_history", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  resetDate: timestamp("reset_date").notNull().defaultNow(),
  resetBy: varchar("reset_by").notNull().references(() => users.id),
  previousClosingId: integer("previous_closing_id").references(() => monthlyClosings.id),
  resetType: varchar("reset_type").notNull().default("manual"), // manual, automated, rollover
  transactionsArchived: integer("transactions_archived").notNull().default(0),
  newStartingBalances: jsonb("new_starting_balances"), // Account starting balances after reset
  reason: text("reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  yearMonthIdx: index("idx_mrh_year_month").on(table.year, table.month),
  resetDateIdx: index("idx_mrh_reset_date").on(table.resetDate),
  resetByIdx: index("idx_mrh_reset_by").on(table.resetBy),
  resetTypeIdx: index("idx_mrh_reset_type").on(table.resetType),
}));

// Cached Financial Reports - Pre-computed financial snapshots for fast reporting
// Hybrid design: structured period metadata + flexible JSON payload
export const cachedFinancialReports = pgTable("cached_financial_reports", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type").notNull(), // 'revenue-trends', 'profit-loss', 'location-revenue', etc.
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  
  // Optional filters
  locationId: integer("location_id"), // null = all locations
  merchantId: varchar("merchant_id"), // null = all merchants
  filters: jsonb("filters"), // Additional filtering options
  
  // Report payload - structure depends on reportType
  reportData: jsonb("report_data").notNull(),
  
  // Lifecycle metadata
  generatedBy: varchar("generated_by").notNull().references(() => users.id),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  isStale: boolean("is_stale").notNull().default(false), // Set to true if source data changes
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  reportTypeIdx: index("idx_cfr_report_type").on(table.reportType),
  periodStartEndIdx: index("idx_cfr_period_start_end").on(table.periodStart, table.periodEnd),
  locationIdx: index("idx_cfr_location_id").on(table.locationId),
  isStaleIdx: index("idx_cfr_is_stale").on(table.isStale),
  uniqueReportIdx: unique("idx_cfr_unique_report").on(
    table.reportType, 
    table.periodStart, 
    table.periodEnd,
    table.locationId, 
    table.merchantId
  ),
}));

// Report Cache Metadata - Track cache status and refresh schedules per report type
export const reportCacheMetadata = pgTable("report_cache_metadata", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type").notNull().unique(), // Primary key for metadata
  
  lastGeneratedAt: timestamp("last_generated_at"),
  lastGeneratedBy: varchar("last_generated_by").references(() => users.id),
  
  totalCachedReports: integer("total_cached_reports").notNull().default(0),
  averageGenerationTime: integer("average_generation_time").notNull().default(0), // milliseconds
  
  // Additional metadata as JSON
  metadata: jsonb("metadata"), // Flexible metadata per report type
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  reportTypeIdx: index("idx_rcm_report_type").on(table.reportType),
  lastGeneratedIdx: index("idx_rcm_last_generated").on(table.lastGeneratedAt),
}));

// ============================================
// ACCOUNTING RELATIONS
// ============================================

export const financialAccountsRelations = relations(financialAccounts, ({ one, many }) => ({
  parentAccount: one(financialAccounts, { fields: [financialAccounts.parentAccountId], references: [financialAccounts.id], relationName: "parentAccount" }),
  childAccounts: many(financialAccounts, { relationName: "parentAccount" }),
  transactionLines: many(financialTransactionLines),
}));

export const financialTransactionsRelations = relations(financialTransactions, ({ one, many }) => ({
  creator: one(users, { fields: [financialTransactions.createdBy], references: [users.id] }),
  transactionLines: many(financialTransactionLines),
}));

export const financialTransactionLinesRelations = relations(financialTransactionLines, ({ one }) => ({
  transaction: one(financialTransactions, { fields: [financialTransactionLines.transactionId], references: [financialTransactions.id] }),
  account: one(financialAccounts, { fields: [financialTransactionLines.accountId], references: [financialAccounts.id] }),
}));

export const customersVendorsRelations = relations(customersVendors, ({ many }) => ({
  transactions: many(financialTransactions),
  vendorProfile: many(vendorProfiles),
  purchaseOrders: many(purchaseOrders),
}));

export const vendorProfilesRelations = relations(vendorProfiles, ({ one }) => ({
  vendor: one(customersVendors, { fields: [vendorProfiles.vendorId], references: [customersVendors.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(customersVendors, { fields: [purchaseOrders.vendorId], references: [customersVendors.id] }),
  requestedBy: one(users, { fields: [purchaseOrders.requestedById], references: [users.id], relationName: "poRequestedBy" }),
  createdBy: one(users, { fields: [purchaseOrders.createdById], references: [users.id], relationName: "poCreatedBy" }),
  lineItems: many(purchaseOrderLineItems),
  approvals: many(purchaseOrderApprovals),
  events: many(purchaseOrderEvents),
}));

export const purchaseOrderLineItemsRelations = relations(purchaseOrderLineItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderLineItems.purchaseOrderId], references: [purchaseOrders.id] }),
  inventoryItem: one(inventoryItems, { fields: [purchaseOrderLineItems.inventoryItemId], references: [inventoryItems.id] }),
}));

export const purchaseOrderApprovalsRelations = relations(purchaseOrderApprovals, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderApprovals.purchaseOrderId], references: [purchaseOrders.id] }),
  approver: one(users, { fields: [purchaseOrderApprovals.approverId], references: [users.id] }),
}));

export const purchaseOrderEventsRelations = relations(purchaseOrderEvents, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderEvents.purchaseOrderId], references: [purchaseOrders.id] }),
  user: one(users, { fields: [purchaseOrderEvents.userId], references: [users.id] }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ many }) => ({
  saleItems: many(posSaleItems),
  purchaseOrderLineItems: many(purchaseOrderLineItems),
}));

export const posSalesRelations = relations(posSales, ({ one, many }) => ({
  location: one(locations, { fields: [posSales.locationId], references: [locations.id] }),
  employee: one(users, { fields: [posSales.employeeId], references: [users.id] }),
  saleItems: many(posSaleItems),
}));

export const posSaleItemsRelations = relations(posSaleItems, ({ one }) => ({
  sale: one(posSales, { fields: [posSaleItems.saleId], references: [posSales.id] }),
  inventoryItem: one(inventoryItems, { fields: [posSaleItems.inventoryItemId], references: [inventoryItems.id] }),
}));

export const hsaExpensesRelations = relations(hsaExpenses, ({ one }) => ({
  employee: one(users, { fields: [hsaExpenses.employeeId], references: [users.id], relationName: "hsaEmployee" }),
  approver: one(users, { fields: [hsaExpenses.approvedBy], references: [users.id], relationName: "hsaApprover" }),
}));

export const reportConfigsRelations = relations(reportConfigs, ({ one }) => ({
  creator: one(users, { fields: [reportConfigs.createdBy], references: [users.id] }),
}));

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  user: one(users, { fields: [dashboardWidgets.userId], references: [users.id] }),
}));

// Monthly Accounting Archival Relations
export const monthlyClosingsRelations = relations(monthlyClosings, ({ one, many }) => ({
  closedBy: one(users, { fields: [monthlyClosings.closedBy], references: [users.id] }),
  accountBalances: many(monthlyAccountBalances),
  transactionSummaries: many(monthlyTransactionSummaries),
  resetHistory: many(monthlyResetHistory, { relationName: "previousClosing" }),
}));

export const monthlyAccountBalancesRelations = relations(monthlyAccountBalances, ({ one }) => ({
  monthlyClosing: one(monthlyClosings, { fields: [monthlyAccountBalances.monthlyClosingId], references: [monthlyClosings.id] }),
  account: one(financialAccounts, { fields: [monthlyAccountBalances.accountId], references: [financialAccounts.id] }),
}));

export const monthlyTransactionSummariesRelations = relations(monthlyTransactionSummaries, ({ one }) => ({
  monthlyClosing: one(monthlyClosings, { fields: [monthlyTransactionSummaries.monthlyClosingId], references: [monthlyClosings.id] }),
  account: one(financialAccounts, { fields: [monthlyTransactionSummaries.accountId], references: [financialAccounts.id] }),
}));

export const monthlyResetHistoryRelations = relations(monthlyResetHistory, ({ one }) => ({
  resetBy: one(users, { fields: [monthlyResetHistory.resetBy], references: [users.id] }),
  previousClosing: one(monthlyClosings, { fields: [monthlyResetHistory.previousClosingId], references: [monthlyClosings.id], relationName: "previousClosing" }),
}));

// Phase 6: Advanced Features Relations
export const scheduledMessagesRelations = relations(scheduledMessages, ({ one }) => ({
  author: one(users, { fields: [scheduledMessages.authorId], references: [users.id] }),
}));

export const announcementTemplatesRelations = relations(announcementTemplates, ({ one, many }) => ({
  creator: one(users, { fields: [announcementTemplates.createdBy], references: [users.id] }),
}));

export const automationRulesRelations = relations(automationRules, ({ one, many }) => ({
  creator: one(users, { fields: [automationRules.createdBy], references: [users.id] }),
  template: one(announcementTemplates, { fields: [automationRules.templateId], references: [announcementTemplates.id] }),
}));

// ============================================
// ACCOUNTING INSERT SCHEMAS & TYPES
// ============================================

export const insertQuickbooksConfigSchema = createInsertSchema(quickbooksConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCloverConfigSchema = createInsertSchema(cloverConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHsaConfigSchema = createInsertSchema(hsaConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertThriveConfigSchema = createInsertSchema(thriveConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAmazonConfigSchema = createInsertSchema(amazonConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialAccountSchema = createInsertSchema(financialAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialTransactionSchema = createInsertSchema(financialTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialTransactionLineSchema = createInsertSchema(financialTransactionLines).omit({
  id: true,
  createdAt: true,
});

export const insertCustomersVendorsSchema = createInsertSchema(customersVendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderLineItemSchema = createInsertSchema(purchaseOrderLineItems).omit({
  id: true,
  createdAt: true,
});

// Purchase Order Payload Schemas for transactional create/update
export const purchaseOrderLineItemPayloadSchema = z.object({
  id: z.number().optional(), // Include ID for existing items being updated
  purchaseOrderId: z.number().optional(), // Optional for create, will be set by backend
  inventoryItemId: z.number().optional().nullable(),
  description: z.string(),
  sku: z.string().optional().nullable(),
  productUrl: z.string().optional().nullable(),
  quantity: z.string().or(z.number()).transform(val => typeof val === 'string' ? val : val.toString()),
  unitCost: z.string().or(z.number()).transform(val => typeof val === 'string' ? val : val.toString()),
  lineTotal: z.string().or(z.number()).optional().transform(val => val === undefined ? undefined : (typeof val === 'string' ? val : val.toString())),
  receivedQuantity: z.string().or(z.number()).optional().transform(val => val === undefined ? '0.000' : (typeof val === 'string' ? val : val.toString())),
  notes: z.string().optional().nullable(),
  _delete: z.boolean().optional(), // Flag to mark item for deletion
});

export const purchaseOrderPayloadSchema = z.object({
  // PO metadata fields (same as insertPurchaseOrderSchema but without omitted fields)
  poNumber: z.string(),
  vendorId: z.number(),
  requestedById: z.string().optional().nullable(),
  createdById: z.string().optional().nullable(),
  status: z.string().default('draft'),
  paymentTerms: z.string().default('Net 30'),
  expectedChargeDate: z.string().optional().nullable(), // For Credit Card and Bank of Lake-9187 payment terms
  locationId: z.number().optional().nullable(),
  expenseAccountId: z.number().optional().nullable(),
  orderDate: z.string().optional().nullable(),
  requestedDeliveryDate: z.string().optional().nullable(),
  actualDeliveryDate: z.string().optional().nullable(),
  totalAmount: z.string().or(z.number()).optional().transform(val => val === undefined ? '0.00' : (typeof val === 'string' ? val : val.toString())),
  taxAmount: z.string().or(z.number()).optional().transform(val => val === undefined ? '0.00' : (typeof val === 'string' ? val : val.toString())),
  shippingAmount: z.string().or(z.number()).optional().transform(val => val === undefined ? '0.00' : (typeof val === 'string' ? val : val.toString())),
  discountAmount: z.string().or(z.number()).optional().transform(val => val === undefined ? '0.00' : (typeof val === 'string' ? val : val.toString())),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  // Line items array
  lineItems: z.array(purchaseOrderLineItemPayloadSchema).min(1, 'At least one line item is required'),
});

// Purchase Order Tracking Update Schema (for approved POs)
export const purchaseOrderTrackingUpdateSchema = z.object({
  orderPlacedDate: z.string().optional().nullable(),
  vendorOrderNumber: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  shippedDate: z.string().optional().nullable(),
  receivedDate: z.string().optional().nullable(),
  actualShippingCost: z.string().or(z.number()).optional().nullable().transform(val => val === null || val === undefined || val === '' ? null : (typeof val === 'string' ? val : val.toString())),
  actualHandlingCost: z.string().or(z.number()).optional().nullable().transform(val => val === null || val === undefined || val === '' ? null : (typeof val === 'string' ? val : val.toString())),
  actualProductCost: z.string().or(z.number()).optional().nullable().transform(val => val === null || val === undefined || val === '' ? null : (typeof val === 'string' ? val : val.toString())),
});

export const insertPurchaseOrderApprovalSchema = createInsertSchema(purchaseOrderApprovals).omit({
  id: true,
  createdAt: true,
});

export const insertPurchaseOrderEventSchema = createInsertSchema(purchaseOrderEvents).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUnmatchedThriveItemSchema = createInsertSchema(unmatchedThriveItems).omit({
  id: true,
  importDate: true,
});

export const insertPosSaleSchema = createInsertSchema(posSales).omit({
  id: true,
  createdAt: true,
});

export const insertPosSaleItemSchema = createInsertSchema(posSaleItems).omit({
  id: true,
  createdAt: true,
});

export const insertEmployeePurchaseSchema = createInsertSchema(employeePurchases).omit({
  id: true,
  createdAt: true,
});

export const insertHsaExpenseSchema = createInsertSchema(hsaExpenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({
  id: true,
  timestamp: true,
});

export const insertReportConfigSchema = createInsertSchema(reportConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDashboardWidgetSchema = createInsertSchema(dashboardWidgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Monthly Accounting Archival Insert Schemas
export const insertMonthlyClosingSchema = createInsertSchema(monthlyClosings).omit({
  id: true,
  closingDate: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMonthlyAccountBalanceSchema = createInsertSchema(monthlyAccountBalances).omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyTransactionSummarySchema = createInsertSchema(monthlyTransactionSummaries).omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyResetHistorySchema = createInsertSchema(monthlyResetHistory).omit({
  id: true,
  resetDate: true,
  createdAt: true,
});

export const insertCachedFinancialReportSchema = createInsertSchema(cachedFinancialReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReportCacheMetadataSchema = createInsertSchema(reportCacheMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// ACCOUNTING EXPORT TYPES
// ============================================

export type QuickbooksConfig = typeof quickbooksConfig.$inferSelect;
export type InsertQuickbooksConfig = z.infer<typeof insertQuickbooksConfigSchema>;

export type CloverConfig = typeof cloverConfig.$inferSelect;
export type InsertCloverConfig = z.infer<typeof insertCloverConfigSchema>;

export type HsaConfig = typeof hsaConfig.$inferSelect;
export type InsertHsaConfig = z.infer<typeof insertHsaConfigSchema>;

export type ThriveConfig = typeof thriveConfig.$inferSelect;
export type InsertThriveConfig = z.infer<typeof insertThriveConfigSchema>;

export type AmazonConfig = typeof amazonConfig.$inferSelect;
export type InsertAmazonConfig = z.infer<typeof insertAmazonConfigSchema>;

export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type InsertFinancialAccount = z.infer<typeof insertFinancialAccountSchema>;

export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = z.infer<typeof insertFinancialTransactionSchema>;

export type FinancialTransactionLine = typeof financialTransactionLines.$inferSelect;
export type InsertFinancialTransactionLine = z.infer<typeof insertFinancialTransactionLineSchema>;

export type CustomersVendors = typeof customersVendors.$inferSelect;
export type InsertCustomersVendors = z.infer<typeof insertCustomersVendorsSchema>;

export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PurchaseOrderLineItem = typeof purchaseOrderLineItems.$inferSelect;
export type InsertPurchaseOrderLineItem = z.infer<typeof insertPurchaseOrderLineItemSchema>;

export type PurchaseOrderLineItemPayload = z.infer<typeof purchaseOrderLineItemPayloadSchema>;
export type PurchaseOrderPayload = z.infer<typeof purchaseOrderPayloadSchema>;

export type PurchaseOrderApproval = typeof purchaseOrderApprovals.$inferSelect;
export type InsertPurchaseOrderApproval = z.infer<typeof insertPurchaseOrderApprovalSchema>;

export type PurchaseOrderEvent = typeof purchaseOrderEvents.$inferSelect;
export type InsertPurchaseOrderEvent = z.infer<typeof insertPurchaseOrderEventSchema>;

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

export type UnmatchedThriveItem = typeof unmatchedThriveItems.$inferSelect;
export type InsertUnmatchedThriveItem = z.infer<typeof insertUnmatchedThriveItemSchema>;

export type PosSale = typeof posSales.$inferSelect;
export type InsertPosSale = z.infer<typeof insertPosSaleSchema>;

export type PosSaleItem = typeof posSaleItems.$inferSelect;
export type InsertPosSaleItem = z.infer<typeof insertPosSaleItemSchema>;

export type EmployeePurchase = typeof employeePurchases.$inferSelect;
export type InsertEmployeePurchase = z.infer<typeof insertEmployeePurchaseSchema>;

export type HsaExpense = typeof hsaExpenses.$inferSelect;
export type InsertHsaExpense = z.infer<typeof insertHsaExpenseSchema>;

export type IntegrationLog = typeof integrationLogs.$inferSelect;
export type InsertIntegrationLog = z.infer<typeof insertIntegrationLogSchema>;

export type ReportConfig = typeof reportConfigs.$inferSelect;
export type InsertReportConfig = z.infer<typeof insertReportConfigSchema>;

export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type InsertDashboardWidget = z.infer<typeof insertDashboardWidgetSchema>;

// Monthly Accounting Archival Types
export type MonthlyClosure = typeof monthlyClosings.$inferSelect;
export type InsertMonthlyClosure = z.infer<typeof insertMonthlyClosingSchema>;

export type MonthlyAccountBalance = typeof monthlyAccountBalances.$inferSelect;
export type InsertMonthlyAccountBalance = z.infer<typeof insertMonthlyAccountBalanceSchema>;

export type CachedFinancialReport = typeof cachedFinancialReports.$inferSelect;
export type InsertCachedFinancialReport = z.infer<typeof insertCachedFinancialReportSchema>;

export type ReportCacheMetadata = typeof reportCacheMetadata.$inferSelect;
export type InsertReportCacheMetadata = z.infer<typeof insertReportCacheMetadataSchema>;

export type MonthlyTransactionSummary = typeof monthlyTransactionSummaries.$inferSelect;
export type InsertMonthlyTransactionSummary = z.infer<typeof insertMonthlyTransactionSummarySchema>;

export type MonthlyResetHistory = typeof monthlyResetHistory.$inferSelect;
export type InsertMonthlyResetHistory = z.infer<typeof insertMonthlyResetHistorySchema>;

// ============================================
// QR CODE MANAGEMENT SCHEMA
// ============================================

// QR Code Management
export const qrCodes = pgTable("qr_codes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id),
  qrCodeData: text("qr_code_data").notNull(), // Base64 data URL
  downloadCount: integer("download_count").default(0),
  lastDownloaded: timestamp("last_downloaded"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  createdByIdx: index("idx_qr_created_by").on(table.createdBy),
  categoryIdx: index("idx_qr_category").on(table.category),
  createdAtIdx: index("idx_qr_created_at").on(table.createdAt),
}));

// QR Code Relations
export const qrCodesRelations = relations(qrCodes, ({ one }) => ({
  creator: one(users, { fields: [qrCodes.createdBy], references: [users.id] }),
}));

// QR Code Types and Schemas
export const insertQrCodeSchema = createInsertSchema(qrCodes).omit({
  id: true,
  qrCodeData: true,
  downloadCount: true,
  lastDownloaded: true,
  createdAt: true,
  updatedAt: true,
});

export const updateQrCodeSchema = createInsertSchema(qrCodes)
  .omit({
    id: true,
    createdBy: true,
    qrCodeData: true,
    downloadCount: true,
    lastDownloaded: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type QrCode = typeof qrCodes.$inferSelect;
export type InsertQrCode = z.infer<typeof insertQrCodeSchema>;
export type UpdateQrCode = z.infer<typeof updateQrCodeSchema>;

// ============================================
// VIDEO CREATION MANAGEMENT SCHEMA
// ============================================

// Video Templates
export const videoTemplates = pgTable("video_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  config: jsonb("config").notNull(), // Template configuration
  previewUrl: text("preview_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_vt_category").on(table.category),
  nameIdx: index("idx_vt_name").on(table.name),
}));

// Product Videos
export const productVideos = pgTable("product_videos", {
  id: serial("id").primaryKey(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  productDescription: text("product_description"),
  category: varchar("category", { length: 100 }),
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id),
  videoConfig: jsonb("video_config").notNull(), // Complete video configuration
  renderStatus: varchar("render_status", { length: 50 }).default("pending"), // pending, rendering, completed, failed
  renderProgress: integer("render_progress").default(0), // 0-100
  videoUrl: text("video_url"), // Final video URL
  thumbnailUrl: text("thumbnail_url"), // Video thumbnail
  duration: integer("duration"), // Video duration in seconds
  fileSize: integer("file_size"), // File size in bytes
  downloadCount: integer("download_count").default(0),
  lastDownloaded: timestamp("last_downloaded"),
  renderStartedAt: timestamp("render_started_at"),
  renderCompletedAt: timestamp("render_completed_at"),
  errorMessage: text("error_message"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  createdByIdx: index("idx_pv_created_by").on(table.createdBy),
  categoryIdx: index("idx_pv_category").on(table.category),
  renderStatusIdx: index("idx_pv_render_status").on(table.renderStatus),
  createdAtIdx: index("idx_pv_created_at").on(table.createdAt),
}));

// Video Assets (uploaded images, audio files, etc.)
export const videoAssets = pgTable("video_assets", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => productVideos.id, { onDelete: "cascade" }),
  assetType: varchar("asset_type", { length: 50 }).notNull(), // image, audio, logo, etc.
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  metadata: jsonb("metadata"), // Additional asset metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  videoIdIdx: index("idx_va_video_id").on(table.videoId),
  assetTypeIdx: index("idx_va_asset_type").on(table.assetType),
}));

// Video Relations
export const productVideosRelations = relations(productVideos, ({ one, many }) => ({
  creator: one(users, { fields: [productVideos.createdBy], references: [users.id] }),
  assets: many(videoAssets),
}));

export const videoAssetsRelations = relations(videoAssets, ({ one }) => ({
  video: one(productVideos, { fields: [videoAssets.videoId], references: [productVideos.id] }),
}));

export const videoTemplatesRelations = relations(videoTemplates, ({ one }) => ({
  // Add any relations if needed
}));

// Video Creation Schemas
export const insertVideoTemplateSchema = createInsertSchema(videoTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductVideoSchema = createInsertSchema(productVideos).omit({
  id: true,
  renderStatus: true,
  renderProgress: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  fileSize: true,
  downloadCount: true,
  lastDownloaded: true,
  renderStartedAt: true,
  renderCompletedAt: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProductVideoSchema = createInsertSchema(productVideos)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export const insertVideoAssetSchema = createInsertSchema(videoAssets).omit({
  id: true,
  createdAt: true,
});

// Video Types
export type VideoTemplate = typeof videoTemplates.$inferSelect;
export type InsertVideoTemplate = z.infer<typeof insertVideoTemplateSchema>;

export type ProductVideo = typeof productVideos.$inferSelect;
export type InsertProductVideo = z.infer<typeof insertProductVideoSchema>;
export type UpdateProductVideo = z.infer<typeof updateProductVideoSchema>;

export type VideoAsset = typeof videoAssets.$inferSelect;
export type InsertVideoAsset = z.infer<typeof insertVideoAssetSchema>;

// Response schemas
export const insertResponseSchema = createInsertSchema(responses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateResponseSchema = createInsertSchema(responses)
  .omit({
    id: true,
    authorId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

// Response types
export type SelectResponse = typeof responses.$inferSelect;
export type InsertResponse = z.infer<typeof insertResponseSchema>;
export type UpdateResponse = z.infer<typeof updateResponseSchema>;

// Analytics types
export type CommunicationAnalytics = typeof communicationAnalytics.$inferSelect;
export type InsertCommunicationAnalytics = z.infer<typeof insertCommunicationAnalyticsSchema>;
export type CommunicationEvent = typeof communicationEvents.$inferSelect;
export type InsertCommunicationEvent = z.infer<typeof insertCommunicationEventSchema>;
export type UserCommunicationStats = typeof userCommunicationStats.$inferSelect;
export type InsertUserCommunicationStats = z.infer<typeof insertUserCommunicationStatsSchema>;

// Phase 6: Advanced Features Schemas and Types
export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({
  id: true,
  sentAt: true,
  retryCount: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Transform scheduledFor from string to Date
  scheduledFor: z.string().transform((val) => new Date(val))
});

export const updateScheduledMessageSchema = createInsertSchema(scheduledMessages)
  .omit({
    id: true,
    authorId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export const insertAnnouncementTemplateSchema = createInsertSchema(announcementTemplates).omit({
  id: true,
  useCount: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAnnouncementTemplateSchema = createInsertSchema(announcementTemplates)
  .omit({
    id: true,
    useCount: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  lastTriggered: true,
  nextRun: true,
  runCount: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAutomationRuleSchema = createInsertSchema(automationRules)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

// Phase 6: Advanced Features Types
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type UpdateScheduledMessage = z.infer<typeof updateScheduledMessageSchema>;

export type AnnouncementTemplate = typeof announcementTemplates.$inferSelect;
export type InsertAnnouncementTemplate = z.infer<typeof insertAnnouncementTemplateSchema>;
export type UpdateAnnouncementTemplate = z.infer<typeof updateAnnouncementTemplateSchema>;

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type UpdateAutomationRule = z.infer<typeof updateAutomationRuleSchema>;

// ============================================
// ORDER MANAGEMENT SCHEMA EXTENSION
// ============================================

// Merchants for multi-location businesses
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id").notNull(), // External system merchant ID
  name: varchar("name").notNull(), // Business/merchant name
  legalName: varchar("legal_name"), // Legal business name
  channel: varchar("channel").notNull(), // 'clover', 'amazon'
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  country: varchar("country").default("US"),
  timezone: varchar("timezone").default("America/Chicago"),
  currency: varchar("currency").default("USD"),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings"), // Merchant-specific settings and configuration
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantIdChannelIdx: index("idx_merchants_merchant_id_channel").on(table.merchantId, table.channel),
  channelIdx: index("idx_merchants_channel").on(table.channel),
  activeIdx: index("idx_merchants_active").on(table.isActive),
  uniqueMerchantChannel: unique("unique_merchant_channel").on(table.merchantId, table.channel),
}));

// POS Locations for location-based analytics
export const posLocations = pgTable("pos_locations", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  channel: varchar("channel").notNull(), // 'clover', 'amazon'
  externalLocationId: varchar("external_location_id").notNull(), // Location ID from external system
  name: varchar("name").notNull(), // Location name
  address: text("address"), // Full address
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  country: varchar("country").default("US"),
  timezone: varchar("timezone").default("America/Chicago"), // Location timezone
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantChannelIdx: index("idx_pos_locations_merchant_channel").on(table.merchantId, table.channel),
  externalLocationChannelIdx: index("idx_pos_locations_external_channel").on(table.externalLocationId, table.channel),
  activeIdx: index("idx_pos_locations_active").on(table.isActive),
  uniqueExternalLocationChannel: unique("unique_external_location_channel").on(table.externalLocationId, table.channel),
}));

// Items/Products for inventory management
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  externalItemId: varchar("external_item_id").notNull(), // Item ID from external system (Clover/Amazon)
  channel: varchar("channel").notNull(), // 'clover', 'amazon'
  sku: varchar("sku"),
  name: varchar("name").notNull(),
  description: text("description"),
  category: varchar("category"),
  subcategory: varchar("subcategory"),
  brand: varchar("brand"),
  
  // Pricing
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00"), // Current selling price
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0.00"), // Current cost price
  msrp: decimal("msrp", { precision: 10, scale: 2 }), // Manufacturer suggested retail price
  
  // Inventory
  quantityOnHand: decimal("quantity_on_hand", { precision: 10, scale: 3 }).default("0.000"),
  reorderPoint: decimal("reorder_point", { precision: 10, scale: 3 }).default("0.000"),
  
  // Physical properties
  weight: decimal("weight", { precision: 8, scale: 3 }), // Weight in pounds/kg
  dimensions: jsonb("dimensions"), // {length, width, height, unit}
  
  // Tax and pricing configuration
  taxable: boolean("taxable").default(true),
  taxCategory: varchar("tax_category"), // Tax category for different tax rates
  priceType: varchar("price_type").default("fixed"), // 'fixed', 'variable', 'per_unit'
  
  // Status and metadata
  isActive: boolean("is_active").default(true),
  isDeleted: boolean("is_deleted").default(false),
  itemType: varchar("item_type").default("product"), // 'product', 'service', 'fee', 'discount'
  metadata: jsonb("metadata"), // Additional item metadata
  
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantExternalIdx: index("idx_items_merchant_external").on(table.merchantId, table.externalItemId),
  channelIdx: index("idx_items_channel").on(table.channel),
  skuIdx: index("idx_items_sku").on(table.sku),
  categoryIdx: index("idx_items_category").on(table.category),
  activeIdx: index("idx_items_active").on(table.isActive),
  nameIdx: index("idx_items_name").on(table.name),
  uniqueMerchantChannelItem: unique("unique_merchant_channel_item").on(table.merchantId, table.channel, table.externalItemId),
}));

// Orders from all channels
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  locationId: integer("location_id").references(() => posLocations.id),
  externalOrderId: varchar("external_order_id").notNull(), // Order ID from external system
  channel: varchar("channel").notNull(), // 'clover', 'amazon'
  
  // Order identification
  orderNumber: varchar("order_number"), // Human-readable order number
  customerReference: varchar("customer_reference"), // Customer reference number
  
  // Timestamps
  createdTime: timestamp("created_time").notNull(), // When order was created
  modifiedTime: timestamp("modified_time"), // When order was last modified
  orderDate: date("order_date").notNull(), // Date of the order
  
  // Order status
  orderState: varchar("order_state").notNull(), // 'open', 'locked', 'closed'
  paymentState: varchar("payment_state"), // 'open', 'paid', 'partially_paid', 'refunded'
  fulfillmentStatus: varchar("fulfillment_status"), // 'pending', 'shipped', 'delivered', 'cancelled'
  
  // Customer information
  customerId: varchar("customer_id"), // External customer ID
  customerName: varchar("customer_name"),
  customerEmail: varchar("customer_email"),
  customerPhone: varchar("customer_phone"),
  
  // Financial totals
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"), // Sum of line items before tax/discount
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"), // Total tax
  tipAmount: decimal("tip_amount", { precision: 12, scale: 2 }).default("0.00"), // Total tips
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0.00"), // Total discounts
  shippingAmount: decimal("shipping_amount", { precision: 12, scale: 2 }).default("0.00"), // Shipping costs
  total: decimal("total", { precision: 12, scale: 2 }).notNull(), // Final order total
  
  // Cost calculations
  orderCogs: decimal("order_cogs", { precision: 12, scale: 2 }).default("0.00"), // Total Cost of Goods Sold
  orderGrossMargin: decimal("order_gross_margin", { precision: 12, scale: 2 }).default("0.00"), // Gross profit
  
  // Order type and source
  orderType: varchar("order_type").default("sale"), // 'sale', 'refund', 'exchange'
  orderSource: varchar("order_source"), // 'in_store', 'online', 'phone', 'mobile'
  deviceId: varchar("device_id"), // POS device ID for in-store orders
  
  // Employee/staff
  employeeId: varchar("employee_id").references(() => users.id), // Staff who processed the order
  
  // Shipping address
  shippingAddress: jsonb("shipping_address"), // Full shipping address object
  billingAddress: jsonb("billing_address"), // Full billing address object
  
  // Additional metadata
  notes: text("notes"), // Order notes
  tags: text("tags").array(), // Order tags for categorization
  metadata: jsonb("metadata"), // Additional order data
  
  // Sync and audit
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantExternalIdx: index("idx_orders_merchant_external").on(table.merchantId, table.externalOrderId),
  channelIdx: index("idx_orders_channel").on(table.channel),
  orderDateIdx: index("idx_orders_date").on(table.orderDate),
  createdTimeIdx: index("idx_orders_created_time").on(table.createdTime),
  modifiedTimeIdx: index("idx_orders_modified_time").on(table.modifiedTime),
  customerIdx: index("idx_orders_customer").on(table.customerId),
  locationIdx: index("idx_orders_location").on(table.locationId),
  employeeIdx: index("idx_orders_employee").on(table.employeeId),
  orderStateIdx: index("idx_orders_state").on(table.orderState),
  paymentStateIdx: index("idx_orders_payment_state").on(table.paymentState),
  orderTypeIdx: index("idx_orders_type").on(table.orderType),
  uniqueMerchantOrderChannel: unique("unique_merchant_order_channel").on(table.merchantId, table.externalOrderId, table.channel),
}));

// Order line items
export const orderLineItems = pgTable("order_line_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: integer("item_id").references(() => items.id),
  externalLineItemId: varchar("external_line_item_id"), // Line item ID from external system
  
  // Item details (snapshot at time of sale)
  itemName: varchar("item_name").notNull(),
  itemSku: varchar("item_sku"),
  itemCategory: varchar("item_category"),
  
  // Quantity and pricing
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Price per unit
  unitCostAtSale: decimal("unit_cost_at_sale", { precision: 10, scale: 2 }), // Cost at time of sale
  lineSubtotal: decimal("line_subtotal", { precision: 10, scale: 2 }).notNull(), // quantity * unitPrice
  
  // Financial calculations
  lineCogs: decimal("line_cogs", { precision: 10, scale: 2 }).default("0.00"), // Cost of goods sold for this line
  lineMargin: decimal("line_margin", { precision: 10, scale: 2 }).default("0.00"), // Gross margin for this line
  
  // Discounts and adjustments
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }), // Discount percentage applied
  
  // Tax information
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }), // Tax rate applied
  taxable: boolean("taxable").default(true),
  
  // Line item metadata
  notes: text("notes"),
  lineNumber: integer("line_number").default(1), // Order of items in the order
  isRefunded: boolean("is_refunded").default(false),
  refundQuantity: decimal("refund_quantity", { precision: 10, scale: 3 }).default("0.000"),
  
  // Product variations/modifiers
  modifiers: jsonb("modifiers"), // Item modifiers or variations
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_order_line_items_order").on(table.orderId),
  itemIdIdx: index("idx_order_line_items_item").on(table.itemId),
  itemNameIdx: index("idx_order_line_items_item_name").on(table.itemName),
  itemSkuIdx: index("idx_order_line_items_item_sku").on(table.itemSku),
  categoryIdx: index("idx_order_line_items_category").on(table.itemCategory),
  refundedIdx: index("idx_order_line_items_refunded").on(table.isRefunded),
  uniqueExternalLineItem: unique("unique_external_line_item").on(table.externalLineItemId),
}));

// Payment information for orders
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: 'cascade' }),
  externalPaymentId: varchar("external_payment_id"), // Payment ID from external system
  
  // Payment details
  paymentMethod: varchar("payment_method").notNull(), // 'cash', 'credit', 'debit', 'gift_card', 'check', 'mobile'
  paymentType: varchar("payment_type"), // 'sale', 'refund', 'partial_refund'
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  tipAmount: decimal("tip_amount", { precision: 12, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  cashbackAmount: decimal("cashback_amount", { precision: 12, scale: 2 }).default("0.00"),
  
  // Payment status and processing
  paymentStatus: varchar("payment_status").notNull().default("pending"), // 'pending', 'approved', 'declined', 'voided'
  result: varchar("result"), // 'success', 'failure', 'pending'
  
  // Card transaction details
  cardType: varchar("card_type"), // 'visa', 'mastercard', 'amex', 'discover'
  cardLast4: varchar("card_last_4"), // Last 4 digits of card
  cardFirst6: varchar("card_first_6"), // First 6 digits of card
  cardEntryType: varchar("card_entry_type"), // 'swiped', 'keyed', 'contactless', 'chip'
  
  // Processing details
  transactionId: varchar("transaction_id"), // Gateway transaction ID
  authCode: varchar("auth_code"), // Authorization code
  gatewayResponseCode: varchar("gateway_response_code"),
  gatewayResponseMessage: text("gateway_response_message"),
  
  // Timestamps
  processedAt: timestamp("processed_at"),
  createdTime: timestamp("created_time").notNull(),
  
  // Additional metadata
  metadata: jsonb("metadata"), // Additional payment metadata
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_payments_order").on(table.orderId),
  paymentMethodIdx: index("idx_payments_method").on(table.paymentMethod),
  paymentStatusIdx: index("idx_payments_status").on(table.paymentStatus),
  createdTimeIdx: index("idx_payments_created_time").on(table.createdTime),
  transactionIdIdx: index("idx_payments_transaction_id").on(table.transactionId),
  uniqueExternalPayment: unique("unique_external_payment").on(table.externalPaymentId),
}));

// Tax details for orders and line items
export const taxes = pgTable("taxes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }),
  lineItemId: integer("line_item_id").references(() => orderLineItems.id, { onDelete: 'cascade' }),
  
  // Tax identification
  taxName: varchar("tax_name").notNull(), // 'State Tax', 'City Tax', 'VAT'
  taxType: varchar("tax_type").notNull(), // 'sales_tax', 'vat', 'gst', 'custom'
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).notNull(), // Tax rate as decimal (0.0825 for 8.25%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Tax basis
  taxableAmount: decimal("taxable_amount", { precision: 10, scale: 2 }).notNull(), // Amount tax was calculated on
  
  // Tax authority
  taxJurisdiction: varchar("tax_jurisdiction"), // 'state', 'city', 'county', 'federal'
  taxAuthorityName: varchar("tax_authority_name"), // Name of tax authority
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_taxes_order").on(table.orderId),
  lineItemIdIdx: index("idx_taxes_line_item").on(table.lineItemId),
  taxTypeIdx: index("idx_taxes_type").on(table.taxType),
  taxNameIdx: index("idx_taxes_name").on(table.taxName),
}));

// Discounts applied to orders and line items
export const discounts = pgTable("discounts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }),
  lineItemId: integer("line_item_id").references(() => orderLineItems.id, { onDelete: 'cascade' }),
  
  // Discount identification
  discountName: varchar("discount_name").notNull(),
  discountType: varchar("discount_type").notNull(), // 'percentage', 'fixed_amount', 'buy_x_get_y'
  discountValue: decimal("discount_value", { precision: 10, scale: 4 }), // Percentage or fixed amount
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(), // Actual discount applied
  
  // Discount configuration
  discountCode: varchar("discount_code"), // Coupon/promo code used
  discountReason: varchar("discount_reason"), // 'coupon', 'loyalty', 'employee', 'manager_comp'
  
  // Discount constraints
  minimumAmount: decimal("minimum_amount", { precision: 10, scale: 2 }), // Minimum order for discount
  maximumAmount: decimal("maximum_amount", { precision: 10, scale: 2 }), // Maximum discount amount
  
  // Applied by
  appliedBy: varchar("applied_by").references(() => users.id), // Employee who applied discount
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_discounts_order").on(table.orderId),
  lineItemIdIdx: index("idx_discounts_line_item").on(table.lineItemId),
  discountTypeIdx: index("idx_discounts_type").on(table.discountType),
  discountCodeIdx: index("idx_discounts_code").on(table.discountCode),
  appliedByIdx: index("idx_discounts_applied_by").on(table.appliedBy),
}));

// Refunds for orders and line items
export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  originalPaymentId: integer("original_payment_id").references(() => payments.id),
  externalRefundId: varchar("external_refund_id"), // Refund ID from external system
  
  // Refund details
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }).notNull(),
  refundReason: varchar("refund_reason"), // 'customer_request', 'damaged', 'wrong_item', 'defective'
  refundType: varchar("refund_type").notNull(), // 'full', 'partial', 'exchange'
  refundMethod: varchar("refund_method"), // 'original_payment', 'cash', 'store_credit'
  
  // Refund status
  refundStatus: varchar("refund_status").notNull().default("pending"), // 'pending', 'processed', 'failed', 'cancelled'
  
  // Processing details
  processedBy: varchar("processed_by").references(() => users.id), // Employee who processed refund
  processedAt: timestamp("processed_at"),
  
  // Refund timestamps
  refundDate: date("refund_date").notNull(),
  createdTime: timestamp("created_time").notNull(),
  
  // Additional details
  notes: text("notes"),
  customerNotified: boolean("customer_notified").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_refunds_order").on(table.orderId),
  refundDateIdx: index("idx_refunds_date").on(table.refundDate),
  refundStatusIdx: index("idx_refunds_status").on(table.refundStatus),
  processedByIdx: index("idx_refunds_processed_by").on(table.processedBy),
  createdTimeIdx: index("idx_refunds_created_time").on(table.createdTime),
  uniqueExternalRefund: unique("unique_external_refund").on(table.externalRefundId),
}));

// Tender types for payments (cash, card types, etc.)
export const tenders = pgTable("tenders", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => payments.id, { onDelete: 'cascade' }),
  
  // Tender details
  tenderType: varchar("tender_type").notNull(), // 'cash', 'credit_card', 'debit_card', 'gift_card', 'check'
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  
  // Card details (if applicable)
  cardType: varchar("card_type"), // 'visa', 'mastercard', 'amex', 'discover'
  cardLast4: varchar("card_last_4"),
  cardFirst6: varchar("card_first_6"),
  
  // Gift card details (if applicable)
  giftCardNumber: varchar("gift_card_number"),
  giftCardBalance: decimal("gift_card_balance", { precision: 12, scale: 2 }),
  
  // Check details (if applicable)
  checkNumber: varchar("check_number"),
  
  // Cash details
  cashReceived: decimal("cash_received", { precision: 12, scale: 2 }),
  changeGiven: decimal("change_given", { precision: 12, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  paymentIdIdx: index("idx_tenders_payment").on(table.paymentId),
  tenderTypeIdx: index("idx_tenders_type").on(table.tenderType),
}));

// Item cost history for accurate COGS calculations
export const itemCostHistory = pgTable("item_cost_history", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => items.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  
  // Cost tracking
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  costMethod: varchar("cost_method").notNull().default("avg"), // 'avg', 'fifo', 'lifo', 'specific'
  
  // Effective date range
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"), // NULL means current/active cost
  
  // Cost basis information
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 3 }), // For FIFO/LIFO tracking
  sourceDocument: varchar("source_document"), // 'purchase_order', 'inventory_adjustment', 'manual'
  sourceDocumentId: varchar("source_document_id"), // Reference to source document
  
  // Audit trail
  createdBy: varchar("created_by").references(() => users.id),
  reason: text("reason"), // Reason for cost change
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  itemIdEffectiveIdx: index("idx_item_cost_history_item_effective").on(table.itemId, table.effectiveFrom),
  merchantIdIdx: index("idx_item_cost_history_merchant").on(table.merchantId),
  effectiveFromIdx: index("idx_item_cost_history_effective_from").on(table.effectiveFrom),
  effectiveToIdx: index("idx_item_cost_history_effective_to").on(table.effectiveTo),
  costMethodIdx: index("idx_item_cost_history_method").on(table.costMethod),
  // Ensure no overlapping date ranges for same item
  uniqueItemEffectiveRange: unique("unique_item_effective_range").on(table.itemId, table.effectiveFrom),
}));

// Sync cursors for incremental data synchronization
export const syncCursors = pgTable("sync_cursors", {
  id: serial("id").primaryKey(),
  system: varchar("system").notNull(), // 'clover', 'amazon'
  merchantId: integer("merchant_id").references(() => merchants.id), // NULL for system-wide cursors
  dataType: varchar("data_type").notNull(), // 'orders', 'items', 'customers', 'payments'
  
  // Sync tracking
  lastModifiedMs: varchar("last_modified_ms"), // Last modification timestamp from external system
  lastSyncAt: timestamp("last_sync_at"), // When we last synced this cursor
  lastRunAt: timestamp("last_run_at"), // When sync process last ran (even if no data)
  
  // Sync state and progress
  backfillState: varchar("backfill_state").default("none"), // 'none', 'in_progress', 'completed', 'failed'
  backfillStartDate: timestamp("backfill_start_date"), // Start date for historical backfill
  backfillEndDate: timestamp("backfill_end_date"), // End date for historical backfill
  backfillProgress: decimal("backfill_progress", { precision: 5, scale: 2 }).default("0.00"), // Progress percentage
  
  // Error handling
  lastError: text("last_error"), // Last sync error message
  errorCount: integer("error_count").default(0), // Consecutive error count
  lastSuccessAt: timestamp("last_success_at"), // Last successful sync
  
  // Sync configuration
  isActive: boolean("is_active").default(true), // Whether this cursor should be processed
  syncFrequency: integer("sync_frequency").default(300), // Sync frequency in seconds
  batchSize: integer("batch_size").default(100), // Records to process per batch
  
  // Metadata
  metadata: jsonb("metadata"), // Additional sync metadata
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  systemMerchantDataIdx: index("idx_sync_cursors_system_merchant_data").on(table.system, table.merchantId, table.dataType),
  systemDataTypeIdx: index("idx_sync_cursors_system_data_type").on(table.system, table.dataType),
  lastSyncIdx: index("idx_sync_cursors_last_sync").on(table.lastSyncAt),
  backfillStateIdx: index("idx_sync_cursors_backfill_state").on(table.backfillState),
  activeIdx: index("idx_sync_cursors_active").on(table.isActive),
  // Ensure unique cursor per system/merchant/dataType combination
  uniqueSystemMerchantDataType: unique("unique_system_merchant_data_type").on(table.system, table.merchantId, table.dataType),
}));

// Daily sales aggregation for fast reporting
export const dailySales = pgTable("daily_sales", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  locationId: integer("location_id").references(() => posLocations.id),
  channel: varchar("channel").notNull(), // 'clover', 'amazon'
  date: date("date").notNull(), // Sales date
  
  // Sales metrics
  orderCount: integer("order_count").default(0), // Number of orders
  itemCount: integer("item_count").default(0), // Number of items sold
  customerCount: integer("customer_count").default(0), // Unique customers served
  
  // Revenue metrics
  grossSales: decimal("gross_sales", { precision: 12, scale: 2 }).default("0.00"), // Total before discounts
  discounts: decimal("discounts", { precision: 12, scale: 2 }).default("0.00"), // Total discounts
  netSales: decimal("net_sales", { precision: 12, scale: 2 }).default("0.00"), // After discounts, before tax
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"), // Total tax collected
  tipAmount: decimal("tip_amount", { precision: 12, scale: 2 }).default("0.00"), // Total tips
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0.00"), // Final total
  
  // Cost and margin metrics
  totalCogs: decimal("total_cogs", { precision: 12, scale: 2 }).default("0.00"), // Cost of goods sold
  grossMargin: decimal("gross_margin", { precision: 12, scale: 2 }).default("0.00"), // Revenue - COGS
  grossMarginPercent: decimal("gross_margin_percent", { precision: 5, scale: 2 }), // Margin as percentage
  
  // Refund metrics
  refundCount: integer("refund_count").default(0), // Number of refunds
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }).default("0.00"), // Total refunded
  
  // Payment method breakdown
  paymentsBreakdown: jsonb("payments_breakdown"), // {cash: 0.00, credit: 0.00, debit: 0.00, etc.}
  
  // Time-based metrics
  avgOrderValue: decimal("avg_order_value", { precision: 10, scale: 2 }), // Average order size
  avgItemsPerOrder: decimal("avg_items_per_order", { precision: 8, scale: 2 }), // Average items per order
  
  // Performance indicators
  peakHour: integer("peak_hour"), // Hour with most sales (0-23)
  peakHourRevenue: decimal("peak_hour_revenue", { precision: 12, scale: 2 }), // Revenue in peak hour
  
  // Category breakdown (top categories)
  topCategories: jsonb("top_categories"), // Array of {category, revenue, count}
  
  // Aggregation metadata
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  dataCompleteness: decimal("data_completeness", { precision: 5, scale: 2 }).default("100.00"), // Data quality score
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  merchantDateChannelIdx: index("idx_daily_sales_merchant_date_channel").on(table.merchantId, table.date, table.channel),
  dateLocationChannelIdx: index("idx_daily_sales_date_location_channel").on(table.date, table.locationId, table.channel),
  channelDateIdx: index("idx_daily_sales_channel_date").on(table.channel, table.date),
  locationDateIdx: index("idx_daily_sales_location_date").on(table.locationId, table.date),
  revenueIdx: index("idx_daily_sales_revenue").on(table.totalRevenue),
  marginIdx: index("idx_daily_sales_margin").on(table.grossMargin),
  lastUpdatedIdx: index("idx_daily_sales_last_updated").on(table.lastUpdatedAt),
  // Ensure unique daily record per merchant/location/channel/date
  uniqueDailySalesRecord: unique("unique_daily_sales_record").on(table.merchantId, table.locationId, table.channel, table.date),
}));

// Payroll Tables
export const payrollPeriods = pgTable("payroll_periods", {
  id: serial("id").primaryKey(),
  periodType: varchar("period_type").notNull(), // weekly, bi-weekly, monthly
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  payDate: date("pay_date").notNull(),
  status: varchar("status").notNull().default("draft"), // draft, calculated, processed, paid
  totalGrossPay: decimal("total_gross_pay", { precision: 10, scale: 2 }).default("0.00"),
  totalNetPay: decimal("total_net_pay", { precision: 10, scale: 2 }).default("0.00"),
  totalDeductions: decimal("total_deductions", { precision: 10, scale: 2 }).default("0.00"),
  totalTaxes: decimal("total_taxes", { precision: 10, scale: 2 }).default("0.00"),
  notes: text("notes"),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  periodTypeIdx: index("idx_payroll_periods_type").on(table.periodType),
  statusIdx: index("idx_payroll_periods_status").on(table.status),
  startDateIdx: index("idx_payroll_periods_start_date").on(table.startDate),
  endDateIdx: index("idx_payroll_periods_end_date").on(table.endDate),
}));

export const payrollEntries = pgTable("payroll_entries", {
  id: serial("id").primaryKey(),
  payrollPeriodId: integer("payroll_period_id").notNull().references(() => payrollPeriods.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  locationId: integer("location_id").references(() => locations.id),
  
  // Hours breakdown
  regularHours: decimal("regular_hours", { precision: 8, scale: 2 }).default("0.00"),
  overtimeHours: decimal("overtime_hours", { precision: 8, scale: 2 }).default("0.00"),
  doubleTimeHours: decimal("double_time_hours", { precision: 8, scale: 2 }).default("0.00"),
  totalHours: decimal("total_hours", { precision: 8, scale: 2 }).default("0.00"),
  
  // Pay rates
  regularRate: decimal("regular_rate", { precision: 8, scale: 2 }).notNull(),
  overtimeRate: decimal("overtime_rate", { precision: 8, scale: 2 }).notNull(),
  doubleTimeRate: decimal("double_time_rate", { precision: 8, scale: 2 }).notNull(),
  
  // Pay calculations
  regularPay: decimal("regular_pay", { precision: 10, scale: 2 }).default("0.00"),
  overtimePay: decimal("overtime_pay", { precision: 10, scale: 2 }).default("0.00"),
  doubleTimePay: decimal("double_time_pay", { precision: 10, scale: 2 }).default("0.00"),
  grossPay: decimal("gross_pay", { precision: 10, scale: 2 }).default("0.00"),
  
  // Deductions and taxes
  federalTax: decimal("federal_tax", { precision: 10, scale: 2 }).default("0.00"),
  stateTax: decimal("state_tax", { precision: 10, scale: 2 }).default("0.00"),
  socialSecurityTax: decimal("social_security_tax", { precision: 10, scale: 2 }).default("0.00"),
  medicareTax: decimal("medicare_tax", { precision: 10, scale: 2 }).default("0.00"),
  unemploymentTax: decimal("unemployment_tax", { precision: 10, scale: 2 }).default("0.00"),
  totalTaxes: decimal("total_taxes", { precision: 10, scale: 2 }).default("0.00"),
  
  // Other deductions
  healthInsurance: decimal("health_insurance", { precision: 10, scale: 2 }).default("0.00"),
  dentalInsurance: decimal("dental_insurance", { precision: 10, scale: 2 }).default("0.00"),
  visionInsurance: decimal("vision_insurance", { precision: 10, scale: 2 }).default("0.00"),
  retirement401k: decimal("retirement_401k", { precision: 10, scale: 2 }).default("0.00"),
  otherDeductions: decimal("other_deductions", { precision: 10, scale: 2 }).default("0.00"),
  totalDeductions: decimal("total_deductions", { precision: 10, scale: 2 }).default("0.00"),
  
  // Final calculations
  netPay: decimal("net_pay", { precision: 10, scale: 2 }).default("0.00"),
  
  // Additional info
  timeEntryIds: text("time_entry_ids").array(), // Array of time clock entry IDs used in calculation
  adjustments: jsonb("adjustments"), // Manual adjustments with reasons
  notes: text("notes"),
  isApproved: boolean("is_approved").default(false),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  payrollPeriodIdx: index("idx_payroll_entries_period").on(table.payrollPeriodId),
  userIdIdx: index("idx_payroll_entries_user").on(table.userId),
  locationIdx: index("idx_payroll_entries_location").on(table.locationId),
  approvedIdx: index("idx_payroll_entries_approved").on(table.isApproved),
  createdAtIdx: index("idx_payroll_entries_created_at").on(table.createdAt),
}));

export const payrollTimeEntries = pgTable("payroll_time_entries", {
  id: serial("id").primaryKey(),
  payrollEntryId: integer("payroll_entry_id").notNull().references(() => payrollEntries.id),
  timeClockEntryId: integer("time_clock_entry_id").notNull().references(() => timeClockEntries.id),
  hoursWorked: decimal("hours_worked", { precision: 8, scale: 2 }).notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }).notNull(),
  payAmount: decimal("pay_amount", { precision: 10, scale: 2 }).notNull(),
  payType: varchar("pay_type").notNull(), // regular, overtime, double_time
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollEntryIdx: index("idx_payroll_time_entries_payroll").on(table.payrollEntryId),
  timeClockEntryIdx: index("idx_payroll_time_entries_time_clock").on(table.timeClockEntryId),
  payTypeIdx: index("idx_payroll_time_entries_pay_type").on(table.payType),
}));

// Payroll journal entries for accounting integration
export const payrollJournalEntries = pgTable("payroll_journal_entries", {
  id: serial("id").primaryKey(),
  payrollPeriodId: integer("payroll_period_id").notNull().references(() => payrollPeriods.id),
  transactionId: integer("transaction_id").references(() => financialTransactions.id),
  entryType: varchar("entry_type").notNull(), // gross_wages, taxes_payable, deductions_payable, net_pay_liability
  account: varchar("account").notNull(), // Account name/code
  debitAmount: decimal("debit_amount", { precision: 12, scale: 2 }).default("0.00"),
  creditAmount: decimal("credit_amount", { precision: 12, scale: 2 }).default("0.00"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollPeriodIdx: index("idx_payroll_journal_entries_period").on(table.payrollPeriodId),
  transactionIdx: index("idx_payroll_journal_entries_transaction").on(table.transactionId),
  entryTypeIdx: index("idx_payroll_journal_entries_type").on(table.entryType),
}));

// Payroll schemas for validation
export const insertPayrollPeriodSchema = createInsertSchema(payrollPeriods).omit({
  id: true,
  totalGrossPay: true,
  totalNetPay: true,
  totalDeductions: true,
  totalTaxes: true,
  processedBy: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
  isApproved: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPayrollTimeEntrySchema = createInsertSchema(payrollTimeEntries).omit({
  id: true,
  createdAt: true,
});

// ============================================
// ORDER MANAGEMENT INSERT SCHEMAS
// ============================================

// Merchant schemas
export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

// Items schemas
export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

// Orders schemas
export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

// Order line items schemas
export const insertOrderLineItemSchema = createInsertSchema(orderLineItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Payments schemas
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Taxes schemas
export const insertTaxSchema = createInsertSchema(taxes).omit({
  id: true,
  createdAt: true,
});

// Discounts schemas
export const insertDiscountSchema = createInsertSchema(discounts).omit({
  id: true,
  createdAt: true,
});

// Refunds schemas
export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Tenders schemas
export const insertTenderSchema = createInsertSchema(tenders).omit({
  id: true,
  createdAt: true,
});

// Item cost history schemas
export const insertItemCostHistorySchema = createInsertSchema(itemCostHistory).omit({
  id: true,
  createdAt: true,
});

// Sync cursors schemas
export const insertSyncCursorSchema = createInsertSchema(syncCursors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Daily sales schemas
export const insertDailySalesSchema = createInsertSchema(dailySales).omit({
  id: true,
  lastUpdatedAt: true,
  createdAt: true,
});

// ============================================
// ORDER MANAGEMENT TYPES
// ============================================

// Merchant types
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;

// Items types
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;

// Orders types
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// Order line items types
export type OrderLineItem = typeof orderLineItems.$inferSelect;
export type InsertOrderLineItem = z.infer<typeof insertOrderLineItemSchema>;

// Payments types
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// Taxes types
export type Tax = typeof taxes.$inferSelect;
export type InsertTax = z.infer<typeof insertTaxSchema>;

// Discounts types
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;

// Refunds types
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;

// Tenders types
export type Tender = typeof tenders.$inferSelect;
export type InsertTender = z.infer<typeof insertTenderSchema>;

// Item cost history types
export type ItemCostHistory = typeof itemCostHistory.$inferSelect;
export type InsertItemCostHistory = z.infer<typeof insertItemCostHistorySchema>;

// Sync cursors types
export type SyncCursor = typeof syncCursors.$inferSelect;
export type InsertSyncCursor = z.infer<typeof insertSyncCursorSchema>;

// Daily sales types
export type DailySales = typeof dailySales.$inferSelect;
export type InsertDailySales = z.infer<typeof insertDailySalesSchema>;

// Payroll types
export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = z.infer<typeof insertPayrollPeriodSchema>;

export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;

export type PayrollTimeEntry = typeof payrollTimeEntries.$inferSelect;
export type InsertPayrollTimeEntry = z.infer<typeof insertPayrollTimeEntrySchema>;

export type PayrollJournalEntry = typeof payrollJournalEntries.$inferSelect;

// ===== COMPREHENSIVE PRODUCT DATABASE SYSTEM =====
// Enhanced inventory management with historical tracking, multi-location support, and fast search

// Product identifiers for comprehensive search (SKU, barcode, alt codes)
export const productIdentifiers = pgTable("product_identifiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  type: varchar("type").notNull(), // 'barcode', 'sku', 'altCode', 'upc'
  value: varchar("value").notNull(), // The actual identifier value
  source: varchar("source").notNull().default("clover"), // 'clover', 'manual', 'import'
  isPrimary: boolean("is_primary").default(false), // Is this the primary identifier of this type
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productIdIdx: index("idx_product_identifiers_product_id").on(table.productId),
  typeValueIdx: index("idx_product_identifiers_type_value").on(table.type, table.value),
  valueSearchIdx: index("idx_product_identifiers_value_search").on(table.value),
  primaryTypeIdx: index("idx_product_identifiers_primary_type").on(table.isPrimary, table.type),
  // Ensure unique identifier per type for each product
  uniqueProductTypeValue: unique("unique_product_type_value").on(table.productId, table.type, table.value),
}));

// Product locations for multi-location inventory management
export const productLocations = pgTable("product_locations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").notNull().references(() => posLocations.id, { onDelete: 'cascade' }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(true), // Is this product active at this location
  reorderPoint: integer("reorder_point").default(0), // Minimum stock level before reorder
  reorderQty: integer("reorder_qty").default(0), // Quantity to reorder
  maxStockLevel: integer("max_stock_level"), // Maximum stock level
  preferredVendor: varchar("preferred_vendor"), // Preferred supplier for this location
  locationSpecificSku: varchar("location_specific_sku"), // Location-specific SKU if different
  notes: text("notes"), // Location-specific notes
  lastSyncedAt: timestamp("last_synced_at"), // Last time this location data was synced
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productLocationIdx: index("idx_product_locations_product_location").on(table.productId, table.locationId),
  locationProductIdx: index("idx_product_locations_location_product").on(table.locationId, table.productId),
  merchantIdx: index("idx_product_locations_merchant").on(table.merchantId),
  activeIdx: index("idx_product_locations_active").on(table.isActive),
  reorderIdx: index("idx_product_locations_reorder").on(table.reorderPoint),
  lastSyncIdx: index("idx_product_locations_last_sync").on(table.lastSyncedAt),
  // Ensure unique product per location
  uniqueProductLocation: unique("unique_product_location").on(table.productId, table.locationId),
}));

// Stock movements for complete inventory audit trail
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").notNull().references(() => posLocations.id, { onDelete: 'cascade' }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  qtyChange: integer("qty_change").notNull(), // Positive for increases, negative for decreases
  balanceAfter: integer("balance_after").notNull(), // Stock level after this movement
  reason: varchar("reason").notNull(), // 'sale', 'refund', 'receipt', 'adjustment', 'transfer_out', 'transfer_in', 'stocktake', 'sync'
  refType: varchar("ref_type"), // 'order', 'payment', 'manual', 'sync', 'transfer'
  refId: varchar("ref_id"), // Reference to order ID, payment ID, etc.
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }), // Cost per unit at time of movement
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }), // Total cost impact of movement
  userId: varchar("user_id").references(() => users.id), // User who initiated the movement
  note: text("note"), // Human-readable note about the movement
  metadata: jsonb("metadata"), // Additional movement metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productLocationOccurredIdx: index("idx_stock_movements_product_location_occurred").on(table.productId, table.locationId, table.occurredAt),
  locationOccurredIdx: index("idx_stock_movements_location_occurred").on(table.locationId, table.occurredAt),
  reasonIdx: index("idx_stock_movements_reason").on(table.reason),
  refTypeRefIdIdx: index("idx_stock_movements_ref_type_ref_id").on(table.refType, table.refId),
  userIdx: index("idx_stock_movements_user").on(table.userId),
  occurredAtIdx: index("idx_stock_movements_occurred_at").on(table.occurredAt),
  // Ensure idempotency for reference-based movements
  uniqueRefMovement: unique("unique_ref_movement").on(table.refType, table.refId, table.productId, table.locationId),
}));

// Current stock levels for fast lookups
export const stockLevels = pgTable("stock_levels", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").notNull().references(() => posLocations.id, { onDelete: 'cascade' }),
  onHand: integer("on_hand").notNull().default(0), // Current quantity on hand
  allocated: integer("allocated").default(0), // Quantity allocated to orders  
  available: integer("available").notNull().default(0), // Available quantity (on_hand - allocated)
  inTransit: integer("in_transit").default(0), // Quantity in transit to this location
  lastMovementAt: timestamp("last_movement_at"), // Timestamp of last stock movement
  lastCountAt: timestamp("last_count_at"), // Timestamp of last physical count
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productLocationIdx: index("idx_stock_levels_product_location").on(table.productId, table.locationId),
  locationIdx: index("idx_stock_levels_location").on(table.locationId),
  onHandIdx: index("idx_stock_levels_on_hand").on(table.onHand),
  availableIdx: index("idx_stock_levels_available").on(table.available),
  lastMovementIdx: index("idx_stock_levels_last_movement").on(table.lastMovementAt),
  lowStockIdx: index("idx_stock_levels_low_stock").on(table.onHand, table.locationId), // For low stock alerts
  // Ensure unique stock level per product per location
  uniqueProductLocationStock: unique("unique_product_location_stock").on(table.productId, table.locationId),
}));

// Daily stock snapshots for reporting and analytics
export const stockSnapshotsDaily = pgTable("stock_snapshots_daily", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").notNull().references(() => posLocations.id, { onDelete: 'cascade' }),
  date: date("date").notNull(), // Snapshot date
  openingQty: integer("opening_qty").notNull(), // Stock at start of day
  inQty: integer("in_qty").default(0), // Total quantity received during day
  outQty: integer("out_qty").default(0), // Total quantity sold/removed during day
  adjustmentQty: integer("adjustment_qty").default(0), // Net adjustments during day
  closingQty: integer("closing_qty").notNull(), // Stock at end of day
  averageCost: decimal("average_cost", { precision: 10, scale: 4 }), // Average unit cost for the day
  totalValue: decimal("total_value", { precision: 10, scale: 2 }), // Total inventory value at end of day
  turnoverVelocity: decimal("turnover_velocity", { precision: 8, scale: 4 }), // Stock turnover rate
  daysSinceLastSale: integer("days_since_last_sale"), // Days since last sale for aging analysis
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productLocationDateIdx: index("idx_stock_snapshots_product_location_date").on(table.productId, table.locationId, table.date),
  locationDateIdx: index("idx_stock_snapshots_location_date").on(table.locationId, table.date),
  dateIdx: index("idx_stock_snapshots_date").on(table.date),
  turnoverIdx: index("idx_stock_snapshots_turnover").on(table.turnoverVelocity),
  agingIdx: index("idx_stock_snapshots_aging").on(table.daysSinceLastSale),
  // Ensure unique snapshot per product per location per day
  uniqueProductLocationDateSnapshot: unique("unique_product_location_date_snapshot").on(table.productId, table.locationId, table.date),
}));

// Enhanced sync cursors with location-specific tracking
export const inventorySyncCursors = pgTable("inventory_sync_cursors", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").references(() => posLocations.id, { onDelete: 'cascade' }), // NULL for merchant-level cursors
  entity: varchar("entity").notNull(), // 'items', 'inventory', 'stock_levels'
  cursor: varchar("cursor"), // Last processed cursor/token from API
  lastProcessedId: varchar("last_processed_id"), // Last processed item/record ID
  lastSyncAt: timestamp("last_sync_at"),
  nextSyncAt: timestamp("next_sync_at"), // When next sync should run
  status: varchar("status").default("idle"), // 'idle', 'running', 'completed', 'failed'
  errorMessage: text("error_message"), // Last error message if failed
  itemsProcessed: integer("items_processed").default(0), // Count of items processed in last sync
  totalItemsEstimate: integer("total_items_estimate"), // Estimated total items to process
  syncDurationMs: integer("sync_duration_ms"), // Duration of last sync in milliseconds
  consecutiveFailures: integer("consecutive_failures").default(0), // Count of consecutive failures
  isActive: boolean("is_active").default(true), // Is this sync cursor active
  metadata: jsonb("metadata"), // Additional sync metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantLocationEntityIdx: index("idx_inventory_sync_merchant_location_entity").on(table.merchantId, table.locationId, table.entity),
  entityStatusIdx: index("idx_inventory_sync_entity_status").on(table.entity, table.status),
  nextSyncIdx: index("idx_inventory_sync_next_sync").on(table.nextSyncAt),
  activeIdx: index("idx_inventory_sync_active").on(table.isActive),
  lastSyncIdx: index("idx_inventory_sync_last_sync").on(table.lastSyncAt),
  failuresIdx: index("idx_inventory_sync_failures").on(table.consecutiveFailures),
  // Ensure unique cursor per merchant/location/entity combination
  uniqueMerchantLocationEntity: unique("unique_merchant_location_entity").on(table.merchantId, table.locationId, table.entity),
}));

// Relations for the new product database tables
export const productIdentifiersRelations = relations(productIdentifiers, ({ one }) => ({
  product: one(items, { fields: [productIdentifiers.productId], references: [items.id] }),
}));

export const productLocationsRelations = relations(productLocations, ({ one }) => ({
  product: one(items, { fields: [productLocations.productId], references: [items.id] }),
  location: one(posLocations, { fields: [productLocations.locationId], references: [posLocations.id] }),
  merchant: one(merchants, { fields: [productLocations.merchantId], references: [merchants.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(items, { fields: [stockMovements.productId], references: [items.id] }),
  location: one(posLocations, { fields: [stockMovements.locationId], references: [posLocations.id] }),
  merchant: one(merchants, { fields: [stockMovements.merchantId], references: [merchants.id] }),
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
}));

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  product: one(items, { fields: [stockLevels.productId], references: [items.id] }),
  location: one(posLocations, { fields: [stockLevels.locationId], references: [posLocations.id] }),
}));

export const stockSnapshotsDailyRelations = relations(stockSnapshotsDaily, ({ one }) => ({
  product: one(items, { fields: [stockSnapshotsDaily.productId], references: [items.id] }),
  location: one(posLocations, { fields: [stockSnapshotsDaily.locationId], references: [posLocations.id] }),
}));

export const inventorySyncCursorsRelations = relations(inventorySyncCursors, ({ one }) => ({
  merchant: one(merchants, { fields: [inventorySyncCursors.merchantId], references: [merchants.id] }),
  location: one(posLocations, { fields: [inventorySyncCursors.locationId], references: [posLocations.id] }),
}));

// Insert schemas for the new product database tables
export const insertProductIdentifierSchema = createInsertSchema(productIdentifiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductLocationSchema = createInsertSchema(productLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});

export const insertStockLevelSchema = createInsertSchema(stockLevels).omit({
  id: true,
  updatedAt: true,
});

export const insertStockSnapshotDailySchema = createInsertSchema(stockSnapshotsDaily).omit({
  id: true,
  createdAt: true,
});

export const insertInventorySyncCursorSchema = createInsertSchema(inventorySyncCursors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for the new product database tables
export type ProductIdentifier = typeof productIdentifiers.$inferSelect;
export type InsertProductIdentifier = z.infer<typeof insertProductIdentifierSchema>;

export type ProductLocation = typeof productLocations.$inferSelect;
export type InsertProductLocation = z.infer<typeof insertProductLocationSchema>;

export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

export type StockLevel = typeof stockLevels.$inferSelect;
export type InsertStockLevel = z.infer<typeof insertStockLevelSchema>;

export type StockSnapshotDaily = typeof stockSnapshotsDaily.$inferSelect;
export type InsertStockSnapshotDaily = z.infer<typeof insertStockSnapshotDailySchema>;

export type InventorySyncCursor = typeof inventorySyncCursors.$inferSelect;
export type InsertInventorySyncCursor = z.infer<typeof insertInventorySyncCursorSchema>;

// Task Management Tables
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  steps: jsonb("steps").$type<Array<{ text: string; completed: boolean; order: number }>>(), // Task steps/checklist
  status: varchar("status").notNull().default("pending"), // pending, in_progress, completed, blocked
  priority: varchar("priority").notNull().default("medium"), // low, medium, high, urgent
  createdBy: varchar("created_by").notNull().references(() => users.id), // Admin/Manager who created
  assignedTo: varchar("assigned_to").references(() => users.id), // Employee assigned to (nullable)
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  archived: boolean("archived").notNull().default(false), // Soft delete for admins/managers
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by").references(() => users.id), // Who archived the task
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assignedToIdx: index("idx_tasks_assigned_to").on(table.assignedTo),
  createdByIdx: index("idx_tasks_created_by").on(table.createdBy),
  statusIdx: index("idx_tasks_status").on(table.status),
  priorityIdx: index("idx_tasks_priority").on(table.priority),
  dueDateIdx: index("idx_tasks_due_date").on(table.dueDate),
  archivedIdx: index("idx_tasks_archived").on(table.archived),
}));

export const taskNotes = pgTable("task_notes", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isQuestion: boolean("is_question").default(false), // True if employee is asking a question
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  taskIdIdx: index("idx_task_notes_task_id").on(table.taskId),
  userIdIdx: index("idx_task_notes_user_id").on(table.userId),
  createdAtIdx: index("idx_task_notes_created_at").on(table.createdAt),
}));

// Task relations
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, { fields: [tasks.createdBy], references: [users.id], relationName: "taskCreator" }),
  assignee: one(users, { fields: [tasks.assignedTo], references: [users.id], relationName: "taskAssignee" }),
  notes: many(taskNotes),
}));

export const taskNotesRelations = relations(taskNotes, ({ one }) => ({
  task: one(tasks, { fields: [taskNotes.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskNotes.userId], references: [users.id] }),
}));

// Insert schemas for tasks
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskNoteSchema = createInsertSchema(taskNotes).omit({
  id: true,
  createdAt: true,
});

// Type definitions for tasks
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskNote = typeof taskNotes.$inferSelect;
export type InsertTaskNote = z.infer<typeof insertTaskNoteSchema>;

// Company Monthly Goals - shared across all admins/managers
export const companyMonthlyGoals = pgTable("company_monthly_goals", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 0-11 (JavaScript month format)
  revenue: decimal("revenue", { precision: 12, scale: 2 }).notNull(),
  profit: decimal("profit", { precision: 12, scale: 2 }).notNull(),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }).notNull(), // Percentage
  notes: text("notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  yearMonthIdx: unique("idx_company_goals_year_month").on(table.year, table.month),
}));

// Dream Scenarios - "what-if" modeling with officer salaries
export const dreamScenarios = pgTable("dream_scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 0-11 (JavaScript month format)
  
  // Officer monthly salaries
  ryanSorensenSalary: decimal("ryan_sorensen_salary", { precision: 10, scale: 2 }).default("0.00"),
  jacalynPhillipsSalary: decimal("jacalyn_phillips_salary", { precision: 10, scale: 2 }).default("0.00"),
  leanneAnthonSalary: decimal("leanne_anthon_salary", { precision: 10, scale: 2 }).default("0.00"),
  lynleyGraySalary: decimal("lynley_gray_salary", { precision: 10, scale: 2 }).default("0.00"),
  
  // Additional expense/revenue projections
  additionalExpenses: decimal("additional_expenses", { precision: 12, scale: 2 }).default("0.00"),
  projectedRevenue: decimal("projected_revenue", { precision: 12, scale: 2 }),
  
  notes: text("notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  createdByIdx: index("idx_dream_scenarios_created_by").on(table.createdBy),
  yearMonthIdx: index("idx_dream_scenarios_year_month").on(table.year, table.month),
}));

// Insert schemas
export const insertCompanyMonthlyGoalsSchema = createInsertSchema(companyMonthlyGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDreamScenarioSchema = createInsertSchema(dreamScenarios).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Goals - Personal, Company BHAG, and Team Goals
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  type: varchar("type").notNull(), // 'my', 'company', 'team'
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  targetDate: date("target_date"),
  status: varchar("status").notNull().default("not_started"), // 'not_started', 'in_progress', 'completed'
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_goals_type").on(table.type),
  createdByIdx: index("idx_goals_created_by").on(table.createdBy),
  statusIdx: index("idx_goals_status").on(table.status),
}));

export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Suggested Goals - Collaborative brainstorming board (Padlet-style)
export const suggestedGoals = pgTable("suggested_goals", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  assignedTo: varchar("assigned_to"), // 'my', 'company', 'team', or null if unassigned
  assignedGoalId: integer("assigned_goal_id"), // ID of the goal it was converted to
  status: varchar("status").notNull().default("suggested"), // 'suggested', 'assigned', 'archived'
  notes: text("notes"), // Collaboration notes/comments
  priority: varchar("priority").default("medium"), // 'low', 'medium', 'high'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  createdByIdx: index("idx_suggested_goals_created_by").on(table.createdBy),
  statusIdx: index("idx_suggested_goals_status").on(table.status),
  assignedToIdx: index("idx_suggested_goals_assigned_to").on(table.assignedTo),
}));

export const insertSuggestedGoalSchema = createInsertSchema(suggestedGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions
export type CompanyMonthlyGoals = typeof companyMonthlyGoals.$inferSelect;
export type InsertCompanyMonthlyGoals = z.infer<typeof insertCompanyMonthlyGoalsSchema>;

export type DreamScenario = typeof dreamScenarios.$inferSelect;
export type InsertDreamScenario = z.infer<typeof insertDreamScenarioSchema>;

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;

export type SuggestedGoal = typeof suggestedGoals.$inferSelect;
export type InsertSuggestedGoal = z.infer<typeof insertSuggestedGoalSchema>;

// ==========================================
// VIDEO PRODUCTION ASSET MANAGEMENT SYSTEM
// ==========================================

// Media Assets - Core asset storage for images, videos, music (comprehensive system)
export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  type: varchar("type").notNull(), // 'image', 'video', 'music', 'voiceover', 'sfx'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  url: varchar("url", { length: 1000 }).notNull(),
  thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
  
  // Classification status: uncategorized, brand, general
  // - uncategorized: newly uploaded, not yet classified
  // - brand: moved to Brand Media tab (linked to brand_media_library)
  // - general: stays in Asset Library for video production use
  classification: varchar("classification", { length: 50 }).default("uncategorized"),
  
  // Link to brand_media_library if classified as 'brand'
  brandMediaId: integer("brand_media_id").references(() => brandMediaLibrary.id),
  
  // Source information
  source: varchar("source").notNull(), // 'stability_ai', 'runway', 'elevenlabs', 'pexels', 'pixabay', 'unsplash', 'user_upload'
  sourceId: varchar("source_id"), // Original ID from source API
  licenseType: varchar("license_type"), // 'royalty_free', 'editorial', 'commercial', 'custom'
  
  // Technical metadata
  duration: integer("duration"), // Duration in seconds for video/audio
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"), // Size in bytes
  mimeType: varchar("mime_type"),
  fps: integer("fps"), // Frames per second for video
  codec: varchar("codec"),
  bitrate: integer("bitrate"),
  
  // Quality and scoring
  qualityScore: integer("quality_score"), // AI-evaluated quality 0-100
  relevanceScore: integer("relevance_score"), // How well it matches the prompt/scene
  technicalScore: integer("technical_score"), // Technical quality score
  emotionalScore: integer("emotional_score"), // Emotional impact score
  
  // Search and organization
  prompt: text("prompt"), // Original generation prompt
  keywords: text("keywords").array(), // Searchable keywords
  category: varchar("category"), // 'product', 'lifestyle', 'nature', 'people', 'abstract', etc.
  mood: varchar("mood"), // 'uplifting', 'calm', 'dramatic', 'professional', etc.
  style: varchar("style"), // 'cinematic', 'documentary', 'commercial', 'casual'
  
  // Usage tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  
  // Ownership
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  isPublic: boolean("is_public").default(true), // Available for all productions
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_media_assets_type").on(table.type),
  sourceIdx: index("idx_media_assets_source").on(table.source),
  categoryIdx: index("idx_media_assets_category").on(table.category),
  moodIdx: index("idx_media_assets_mood").on(table.mood),
  qualityIdx: index("idx_media_assets_quality").on(table.qualityScore),
  uploadedByIdx: index("idx_media_assets_uploaded_by").on(table.uploadedBy),
  classificationIdx: index("idx_media_assets_classification").on(table.classification),
  brandMediaIdIdx: index("idx_media_assets_brand_media_id").on(table.brandMediaId),
}));

// Asset Tags - Flexible tagging system
export const assetTags = pgTable("asset_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  category: varchar("category"), // 'mood', 'subject', 'color', 'style', 'compliance'
  description: text("description"),
  color: varchar("color"), // Display color for UI
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_asset_tags_category").on(table.category),
}));

// Media Asset Tag Map - Many-to-many relationship
export const mediaAssetTagMap = pgTable("media_asset_tag_map", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => assetTags.id, { onDelete: "cascade" }),
  confidence: integer("confidence").default(100), // How confident the tag assignment is (0-100)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  assetTagUnique: unique("media_asset_tag_unique").on(table.assetId, table.tagId),
  assetIdx: index("idx_media_asset_tag_map_asset").on(table.assetId),
  tagIdx: index("idx_media_asset_tag_map_tag").on(table.tagId),
}));

// Video Productions - Track entire video production jobs
export const videoProductions = pgTable("video_productions", {
  id: serial("id").primaryKey(),
  productionId: varchar("production_id", { length: 100 }).notNull().unique(), // External ID like 'prod_123abc'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  // Production configuration
  mode: varchar("mode").notNull().default("script"), // 'product', 'script'
  targetDuration: integer("target_duration").notNull().default(60), // Target duration in seconds
  platform: varchar("platform").default("youtube"), // 'youtube', 'tiktok', 'instagram', 'facebook', 'twitter'
  style: varchar("style").default("professional"), // 'professional', 'casual', 'energetic', 'calm', 'cinematic'
  voiceStyle: varchar("voice_style").default("professional"),
  voiceGender: varchar("voice_gender").default("female"),
  musicMood: varchar("music_mood").default("uplifting"),
  
  // Script and brief data
  script: text("script"),
  visualDirections: text("visual_directions"),
  brief: jsonb("brief"), // Full production brief JSON
  
  // Status and progress
  status: varchar("status").notNull().default("pending"), // 'pending', 'analyzing', 'generating', 'evaluating', 'iterating', 'assembling', 'completed', 'failed'
  currentPhase: varchar("current_phase"), // Current active phase
  overallProgress: integer("overall_progress").default(0), // 0-100
  overallQualityScore: integer("overall_quality_score"), // Final quality score
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedDuration: integer("estimated_duration"), // Estimated production time in seconds
  actualDuration: integer("actual_duration"), // Actual time taken
  
  // Output
  outputUrl: varchar("output_url", { length: 1000 }), // Final video URL
  previewUrl: varchar("preview_url", { length: 1000 }), // Preview/thumbnail URL
  outputFormat: varchar("output_format").default("mp4"),
  outputResolution: varchar("output_resolution").default("1920x1080"),
  
  // Ownership
  createdBy: varchar("created_by").references(() => users.id),
  
  // Iteration tracking
  iterationCount: integer("iteration_count").default(0),
  maxIterations: integer("max_iterations").default(3),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productionIdIdx: index("idx_video_productions_production_id").on(table.productionId),
  statusIdx: index("idx_video_productions_status").on(table.status),
  createdByIdx: index("idx_video_productions_created_by").on(table.createdBy),
  createdAtIdx: index("idx_video_productions_created_at").on(table.createdAt),
}));

// Production Phases - Track each phase of production
export const productionPhases = pgTable("production_phases", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  phase: varchar("phase").notNull(), // 'analyze', 'generate', 'evaluate', 'iterate', 'assemble'
  status: varchar("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  
  // Timing (realistic production pacing)
  estimatedDuration: integer("estimated_duration"), // Expected duration in seconds
  actualDuration: integer("actual_duration"), // Actual time taken
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Progress and results
  progress: integer("progress").default(0), // 0-100
  qualityScore: integer("quality_score"), // Phase-specific quality score
  
  // Phase-specific data
  inputData: jsonb("input_data"), // Input for this phase
  outputData: jsonb("output_data"), // Output/results from this phase
  logs: jsonb("logs"), // Array of log entries
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productionPhaseIdx: index("idx_production_phases_production").on(table.productionId),
  phaseIdx: index("idx_production_phases_phase").on(table.phase),
  statusIdx: index("idx_production_phases_status").on(table.status),
}));

// Production Assets - Link assets to productions
export const productionAssets = pgTable("production_assets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id),
  
  // Scene information
  sceneNumber: integer("scene_number"),
  section: varchar("section"), // 'hook', 'problem', 'solution', 'social_proof', 'cta'
  role: varchar("role"), // 'primary', 'background', 'overlay', 'transition'
  
  // Timing within production
  startTime: integer("start_time"), // Start time in milliseconds
  endTime: integer("end_time"), // End time in milliseconds
  duration: integer("duration"), // Duration in milliseconds
  
  // Effects and transitions
  transition: varchar("transition"), // 'fade', 'dissolve', 'wipe', 'zoom', 'none'
  transitionDuration: integer("transition_duration"), // Transition duration in ms
  effects: jsonb("effects"), // Array of effects to apply
  
  // Position and styling
  zIndex: integer("z_index").default(0),
  opacity: integer("opacity").default(100),
  position: jsonb("position"), // { x, y, width, height }
  
  // Evaluation
  qualityScore: integer("quality_score"),
  wasRegenerated: boolean("was_regenerated").default(false),
  regenerationCount: integer("regeneration_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productionIdx: index("idx_production_assets_production").on(table.productionId),
  assetIdx: index("idx_production_assets_asset").on(table.assetId),
  sceneIdx: index("idx_production_assets_scene").on(table.sceneNumber),
}));

// User Media Uploads - Custom uploads (logos, testimonials, custom assets)
export const userMediaUploads = pgTable("user_media_uploads", {
  id: serial("id").primaryKey(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  
  // File information
  name: varchar("name", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  description: text("description"),
  type: varchar("type").notNull(), // 'logo', 'testimonial', 'product_image', 'b_roll', 'music', 'voiceover'
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"),
  
  // Storage
  url: varchar("url", { length: 1000 }).notNull(),
  thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
  storageKey: varchar("storage_key", { length: 500 }), // Object storage key
  
  // Metadata
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"), // For video/audio in seconds
  
  // Organization
  category: varchar("category"),
  tags: text("tags").array(),
  
  // Linked asset (after processing)
  assetId: integer("asset_id").references(() => mediaAssets.id),
  
  // Status
  status: varchar("status").default("pending"), // 'pending', 'processing', 'ready', 'failed'
  processingError: text("processing_error"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uploadedByIdx: index("idx_user_media_uploads_uploaded_by").on(table.uploadedBy),
  typeIdx: index("idx_user_media_uploads_type").on(table.type),
  statusIdx: index("idx_user_media_uploads_status").on(table.status),
}));

// Production Logs - Detailed logging for production workflow
export const productionLogs = pgTable("production_logs", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  phaseId: integer("phase_id").references(() => productionPhases.id),
  
  level: varchar("level").notNull().default("info"), // 'debug', 'info', 'warn', 'error'
  category: varchar("category"), // 'api_call', 'asset_generation', 'evaluation', 'assembly', 'system'
  message: text("message").notNull(),
  details: jsonb("details"), // Additional structured data
  
  // Timing
  timestamp: timestamp("timestamp").defaultNow(),
  duration: integer("duration"), // Duration of the logged action in ms
  
  // API tracking
  apiService: varchar("api_service"), // 'stability_ai', 'runway', 'elevenlabs', etc.
  apiEndpoint: varchar("api_endpoint"),
  apiResponseCode: integer("api_response_code"),
  apiCost: decimal("api_cost", { precision: 10, scale: 4 }), // Cost of API call if applicable
}, (table) => ({
  productionIdx: index("idx_production_logs_production").on(table.productionId),
  phaseIdx: index("idx_production_logs_phase").on(table.phaseId),
  levelIdx: index("idx_production_logs_level").on(table.level),
  timestampIdx: index("idx_production_logs_timestamp").on(table.timestamp),
}));

// Relations for video production system
export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  uploader: one(users, { fields: [mediaAssets.uploadedBy], references: [users.id] }),
  tagMaps: many(mediaAssetTagMap),
  productionAssets: many(productionAssets),
  brandMedia: one(brandMediaLibrary, { fields: [mediaAssets.brandMediaId], references: [brandMediaLibrary.id] }),
}));

export const assetTagsRelations = relations(assetTags, ({ many }) => ({
  assetMaps: many(mediaAssetTagMap),
}));

export const mediaAssetTagMapRelations = relations(mediaAssetTagMap, ({ one }) => ({
  asset: one(mediaAssets, { fields: [mediaAssetTagMap.assetId], references: [mediaAssets.id] }),
  tag: one(assetTags, { fields: [mediaAssetTagMap.tagId], references: [assetTags.id] }),
}));

export const videoProductionsRelations = relations(videoProductions, ({ one, many }) => ({
  creator: one(users, { fields: [videoProductions.createdBy], references: [users.id] }),
  phases: many(productionPhases),
  assets: many(productionAssets),
  logs: many(productionLogs),
}));

export const productionPhasesRelations = relations(productionPhases, ({ one, many }) => ({
  production: one(videoProductions, { fields: [productionPhases.productionId], references: [videoProductions.id] }),
  logs: many(productionLogs),
}));

export const productionAssetsRelations = relations(productionAssets, ({ one }) => ({
  production: one(videoProductions, { fields: [productionAssets.productionId], references: [videoProductions.id] }),
  asset: one(mediaAssets, { fields: [productionAssets.assetId], references: [mediaAssets.id] }),
}));

export const userMediaUploadsRelations = relations(userMediaUploads, ({ one }) => ({
  uploader: one(users, { fields: [userMediaUploads.uploadedBy], references: [users.id] }),
  asset: one(mediaAssets, { fields: [userMediaUploads.assetId], references: [mediaAssets.id] }),
}));

export const productionLogsRelations = relations(productionLogs, ({ one }) => ({
  production: one(videoProductions, { fields: [productionLogs.productionId], references: [videoProductions.id] }),
  phase: one(productionPhases, { fields: [productionLogs.phaseId], references: [productionPhases.id] }),
}));

// Insert schemas for video production system
export const insertMediaAssetSchema = createInsertSchema(mediaAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssetTagSchema = createInsertSchema(assetTags).omit({
  id: true,
  createdAt: true,
});

export const insertMediaAssetTagMapSchema = createInsertSchema(mediaAssetTagMap).omit({
  id: true,
  createdAt: true,
});

export const insertVideoProductionSchema = createInsertSchema(videoProductions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductionPhaseSchema = createInsertSchema(productionPhases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductionAssetSchema = createInsertSchema(productionAssets).omit({
  id: true,
  createdAt: true,
});

export const insertUserMediaUploadSchema = createInsertSchema(userMediaUploads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductionLogSchema = createInsertSchema(productionLogs).omit({
  id: true,
});

// Type definitions for video production system
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;

export type AssetTag = typeof assetTags.$inferSelect;
export type InsertAssetTag = z.infer<typeof insertAssetTagSchema>;

export type MediaAssetTagMap = typeof mediaAssetTagMap.$inferSelect;
export type InsertMediaAssetTagMap = z.infer<typeof insertMediaAssetTagMapSchema>;

export type VideoProduction = typeof videoProductions.$inferSelect;
export type InsertVideoProduction = z.infer<typeof insertVideoProductionSchema>;

export type ProductionPhase = typeof productionPhases.$inferSelect;
export type InsertProductionPhase = z.infer<typeof insertProductionPhaseSchema>;

export type ProductionAsset = typeof productionAssets.$inferSelect;
export type InsertProductionAsset = z.infer<typeof insertProductionAssetSchema>;

export type UserMediaUpload = typeof userMediaUploads.$inferSelect;
export type InsertUserMediaUpload = z.infer<typeof insertUserMediaUploadSchema>;

export type ProductionLog = typeof productionLogs.$inferSelect;
export type InsertProductionLog = z.infer<typeof insertProductionLogSchema>;

// Brand Assets for Video Production (logos, watermarks, etc.)
export const brandAssets = pgTable("brand_assets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // logo, watermark, overlay, intro, outro
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  isDefault: boolean("is_default").default(false),
  settings: jsonb("settings"), // placement, opacity, size, position, animation
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const brandAssetsRelations = relations(brandAssets, ({ one }) => ({
  uploader: one(users, { fields: [brandAssets.uploadedBy], references: [users.id] }),
}));

export const insertBrandAssetSchema = createInsertSchema(brandAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BrandAsset = typeof brandAssets.$inferSelect;
export type InsertBrandAsset = z.infer<typeof insertBrandAssetSchema>;

// Brand Media Library - Extended asset storage for video production with semantic matching
export const brandMediaLibrary = pgTable("brand_media_library", {
  id: serial("id").primaryKey(),
  
  // Asset identification
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Asset type: logo, photo, video, graphic, watermark, intro, outro, lower_third
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  
  // Structured asset category and type from taxonomy (Phase 14 Addendum B)
  // Category: "products" | "location" | "people" | "logos" | "trust" | "services" | "creative" | "documents"
  assetCategory: varchar("asset_category", { length: 50 }),
  // Type: e.g., "product-hero-single", "logo-primary-color", "people-founder-portrait"
  assetType: varchar("asset_type", { length: 100 }),
  
  // Entity association (e.g., "Pine Hill Farm", "Wellness Center", "BioScan")
  entityName: varchar("entity_name", { length: 255 }),
  entityType: varchar("entity_type", { length: 100 }), // brand, location, product, service, equipment
  
  // File details
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  duration: decimal("duration", { precision: 10, scale: 2 }), // for video assets in seconds
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  
  // Semantic matching keywords (for visual direction parsing)
  // e.g., ["logo", "branding", "Pine Hill Farm", "brand identity"]
  matchKeywords: text("match_keywords").array().default([]),
  
  // Negative keywords (when NOT to use this asset)
  // e.g., ["competitor", "generic"]
  excludeKeywords: text("exclude_keywords").array().default([]),
  
  // Usage context: when is this asset appropriate?
  // e.g., ["intro", "brand scene", "logo placement", "watermark"]
  usageContexts: text("usage_contexts").array().default([]),
  
  // Visual attributes for smarter matching
  // e.g., {"style": "modern", "mood": "professional", "colors": ["green", "gold"]}
  visualAttributes: jsonb("visual_attributes"),
  
  // Default placement settings for this asset
  placementSettings: jsonb("placement_settings"), // position, size, opacity, animation
  
  // Person-specific metadata (Phase 14 Addendum)
  // { name?: string, title?: string, credentials?: string, consentObtained: boolean }
  personInfo: jsonb("person_info"),
  
  // Product-specific metadata (Phase 14 Addendum)
  // { productName?: string, sku?: string }
  productInfo: jsonb("product_info"),
  
  // Priority when multiple assets match (higher = prefer)
  priority: integer("priority").default(0),
  
  // Is this the default asset for its type/entity combination?
  isDefault: boolean("is_default").default(false),
  
  // Active flag
  isActive: boolean("is_active").default(true),
  
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  mediaTypeIdx: index("idx_brand_media_library_type").on(table.mediaType),
  entityNameIdx: index("idx_brand_media_library_entity").on(table.entityName),
  entityTypeIdx: index("idx_brand_media_library_entity_type").on(table.entityType),
  isActiveIdx: index("idx_brand_media_library_active").on(table.isActive),
  assetCategoryIdx: index("idx_brand_media_library_category").on(table.assetCategory),
  assetTypeIdx: index("idx_brand_media_library_asset_type").on(table.assetType),
  categoryTypeIdx: index("idx_brand_media_library_category_type").on(table.assetCategory, table.assetType),
}));

export const brandMediaLibraryRelations = relations(brandMediaLibrary, ({ one }) => ({
  uploader: one(users, { fields: [brandMediaLibrary.uploadedBy], references: [users.id] }),
}));

export const insertBrandMediaSchema = createInsertSchema(brandMediaLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BrandMedia = typeof brandMediaLibrary.$inferSelect;
export type InsertBrandMedia = z.infer<typeof insertBrandMediaSchema>;

// Universal Video Projects - Stores VideoProject entities for the Universal Video Producer
export const universalVideoProjects = pgTable("universal_video_projects", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id", { length: 100 }).notNull().unique(),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(), // 'product' | 'script-based'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetAudience: text("target_audience"),
  
  // Video settings
  totalDuration: integer("total_duration").notNull(),
  fps: integer("fps").notNull().default(30),
  
  // Complex nested data stored as JSONB
  outputFormat: jsonb("output_format").notNull(), // OutputFormat
  brand: jsonb("brand").notNull(), // BrandSettings
  scenes: jsonb("scenes").notNull(), // Scene[]
  assets: jsonb("assets").notNull(), // GeneratedAssets
  progress: jsonb("progress").notNull(), // ProductionProgress
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  
  // Undo/Redo history (Phase 4)
  history: jsonb("history"), // ProjectHistory for undo/redo
  
  // Quality evaluation (Phase 3)
  qualityReport: jsonb("quality_report"), // VideoQualityReport from quality evaluation
  
  // Quality tier (Phase 14C)
  qualityTier: varchar("quality_tier", { length: 20 }).notNull().default("premium"), // 'ultra' | 'premium' | 'standard'
  
  // Media mode - user's choice of image vs video backgrounds
  mediaMode: varchar("media_mode", { length: 10 }), // 'image' | 'video' | null (default: image)
  
  // Render metadata
  renderId: varchar("render_id", { length: 100 }),
  bucketName: varchar("bucket_name", { length: 255 }),
  outputUrl: text("output_url"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("idx_universal_video_projects_project_id").on(table.projectId),
  ownerIdIdx: index("idx_universal_video_projects_owner_id").on(table.ownerId),
  statusIdx: index("idx_universal_video_projects_status").on(table.status),
  createdAtIdx: index("idx_universal_video_projects_created_at").on(table.createdAt),
}));

export const universalVideoProjectsRelations = relations(universalVideoProjects, ({ one }) => ({
  owner: one(users, { fields: [universalVideoProjects.ownerId], references: [users.id] }),
}));

export const insertUniversalVideoProjectSchema = createInsertSchema(universalVideoProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UniversalVideoProject = typeof universalVideoProjects.$inferSelect;
export type InsertUniversalVideoProject = z.infer<typeof insertUniversalVideoProjectSchema>;

// ========================================
// MARKETPLACE INTEGRATION TABLES
// ========================================

// Marketplace Channels - BigCommerce, Amazon, etc.
export const marketplaceChannels = pgTable("marketplace_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "BigCommerce", "Amazon", "Shopify"
  type: varchar("type", { length: 50 }).notNull(), // bigcommerce, amazon, shopify
  isActive: boolean("is_active").default(true),
  apiConfig: jsonb("api_config"), // Store hash, endpoint URLs, etc. (non-sensitive)
  syncSettings: jsonb("sync_settings"), // Auto-sync interval, enabled features
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_marketplace_channels_type").on(table.type),
  isActiveIdx: index("idx_marketplace_channels_active").on(table.isActive),
}));

export const insertMarketplaceChannelSchema = createInsertSchema(marketplaceChannels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceChannel = typeof marketplaceChannels.$inferSelect;
export type InsertMarketplaceChannel = z.infer<typeof insertMarketplaceChannelSchema>;

// Marketplace Orders - Orders from external marketplaces
export const marketplaceOrders = pgTable("marketplace_orders", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => marketplaceChannels.id),
  externalOrderId: varchar("external_order_id", { length: 255 }).notNull(),
  externalOrderNumber: varchar("external_order_number", { length: 100 }), // Human-readable order #
  
  // Order status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, awaiting_fulfillment, partially_fulfilled, fulfilled, shipped, cancelled, refunded
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"), // pending, paid, refunded, partially_refunded
  fulfillmentStatus: varchar("fulfillment_status", { length: 50 }).default("unfulfilled"), // unfulfilled, partial, fulfilled
  
  // Customer info
  customerEmail: varchar("customer_email", { length: 255 }),
  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  
  // Addresses stored as JSONB
  shippingAddress: jsonb("shipping_address"), // { firstName, lastName, street1, street2, city, state, zip, country, phone }
  billingAddress: jsonb("billing_address"),
  
  // Totals
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0.00"),
  shippingTotal: decimal("shipping_total", { precision: 10, scale: 2 }).default("0.00"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).default("0.00"),
  discountTotal: decimal("discount_total", { precision: 10, scale: 2 }).default("0.00"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  
  // Shipping method
  shippingMethod: varchar("shipping_method", { length: 255 }),
  shippingCarrier: varchar("shipping_carrier", { length: 100 }),
  
  // Timestamps from marketplace
  orderPlacedAt: timestamp("order_placed_at").notNull(),
  orderUpdatedAt: timestamp("order_updated_at"),
  
  // Fulfillment tracking
  fulfilledAt: timestamp("fulfilled_at"),
  fulfilledBy: varchar("fulfilled_by").references(() => users.id),
  
  // Store raw marketplace data for reference
  rawPayload: jsonb("raw_payload"),
  
  // Notes
  internalNotes: text("internal_notes"),
  customerNotes: text("customer_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("idx_marketplace_orders_channel").on(table.channelId),
  externalOrderIdx: unique("idx_marketplace_orders_external").on(table.channelId, table.externalOrderId),
  statusIdx: index("idx_marketplace_orders_status").on(table.status),
  fulfillmentStatusIdx: index("idx_marketplace_orders_fulfillment").on(table.fulfillmentStatus),
  orderPlacedAtIdx: index("idx_marketplace_orders_placed_at").on(table.orderPlacedAt),
}));

export const marketplaceOrdersRelations = relations(marketplaceOrders, ({ one, many }) => ({
  channel: one(marketplaceChannels, { fields: [marketplaceOrders.channelId], references: [marketplaceChannels.id] }),
  fulfiller: one(users, { fields: [marketplaceOrders.fulfilledBy], references: [users.id] }),
  items: many(marketplaceOrderItems),
  fulfillments: many(marketplaceFulfillments),
}));

export const insertMarketplaceOrderSchema = createInsertSchema(marketplaceOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type InsertMarketplaceOrder = z.infer<typeof insertMarketplaceOrderSchema>;

// Marketplace Order Items - Line items in marketplace orders
export const marketplaceOrderItems = pgTable("marketplace_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => marketplaceOrders.id, { onDelete: "cascade" }),
  
  // External references
  externalItemId: varchar("external_item_id", { length: 255 }),
  externalProductId: varchar("external_product_id", { length: 255 }),
  externalVariantId: varchar("external_variant_id", { length: 255 }),
  
  // Product info
  sku: varchar("sku", { length: 100 }),
  name: varchar("name", { length: 500 }).notNull(),
  variantName: varchar("variant_name", { length: 255 }),
  
  // Quantities
  quantity: integer("quantity").notNull().default(1),
  quantityFulfilled: integer("quantity_fulfilled").default(0),
  
  // Pricing
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  
  // Link to Clover inventory if matched
  cloverItemId: varchar("clover_item_id", { length: 100 }),
  inventoryItemId: integer("inventory_item_id"),
  
  // Weight for shipping calculations
  weight: decimal("weight", { precision: 10, scale: 4 }),
  weightUnit: varchar("weight_unit", { length: 10 }).default("oz"),
  
  // Raw data
  rawPayload: jsonb("raw_payload"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_marketplace_order_items_order").on(table.orderId),
  skuIdx: index("idx_marketplace_order_items_sku").on(table.sku),
  cloverItemIdx: index("idx_marketplace_order_items_clover").on(table.cloverItemId),
}));

export const marketplaceOrderItemsRelations = relations(marketplaceOrderItems, ({ one }) => ({
  order: one(marketplaceOrders, { fields: [marketplaceOrderItems.orderId], references: [marketplaceOrders.id] }),
}));

export const insertMarketplaceOrderItemSchema = createInsertSchema(marketplaceOrderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceOrderItem = typeof marketplaceOrderItems.$inferSelect;
export type InsertMarketplaceOrderItem = z.infer<typeof insertMarketplaceOrderItemSchema>;

// Marketplace Fulfillments - Shipment records for orders
export const marketplaceFulfillments = pgTable("marketplace_fulfillments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => marketplaceOrders.id, { onDelete: "cascade" }),
  
  // Tracking info
  trackingNumber: varchar("tracking_number", { length: 255 }),
  trackingUrl: text("tracking_url"),
  labelUrl: text("label_url"), // PDF label URL for reprinting
  carrier: varchar("carrier", { length: 100 }), // USPS, UPS, FedEx, etc.
  serviceLevel: varchar("service_level", { length: 100 }), // Ground, Priority, Express
  
  // Status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, shipped, delivered, failed
  
  // Items in this shipment (for partial fulfillments)
  items: jsonb("items"), // [{ orderItemId, quantity }]
  
  // Shipment details
  shippedAt: timestamp("shipped_at"),
  estimatedDelivery: timestamp("estimated_delivery"),
  deliveredAt: timestamp("delivered_at"),
  
  // Who fulfilled
  fulfilledBy: varchar("fulfilled_by").references(() => users.id),
  
  // Response from marketplace API
  externalShipmentId: varchar("external_shipment_id", { length: 255 }),
  rawResponse: jsonb("raw_response"),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdIdx: index("idx_marketplace_fulfillments_order").on(table.orderId),
  statusIdx: index("idx_marketplace_fulfillments_status").on(table.status),
  trackingIdx: index("idx_marketplace_fulfillments_tracking").on(table.trackingNumber),
}));

export const marketplaceFulfillmentsRelations = relations(marketplaceFulfillments, ({ one }) => ({
  order: one(marketplaceOrders, { fields: [marketplaceFulfillments.orderId], references: [marketplaceOrders.id] }),
  fulfiller: one(users, { fields: [marketplaceFulfillments.fulfilledBy], references: [users.id] }),
}));

export const insertMarketplaceFulfillmentSchema = createInsertSchema(marketplaceFulfillments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceFulfillment = typeof marketplaceFulfillments.$inferSelect;
export type InsertMarketplaceFulfillment = z.infer<typeof insertMarketplaceFulfillmentSchema>;

// Marketplace Inventory Rules - Rules for syncing inventory to marketplaces
export const marketplaceInventoryRules = pgTable("marketplace_inventory_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  channelId: integer("channel_id").references(() => marketplaceChannels.id),
  
  // Rule type
  ruleType: varchar("rule_type", { length: 50 }).notNull(), // percentage, fixed, exclude, minimum_threshold
  
  // Percentage of Clover inventory to send to marketplace (e.g., 80% means keep 20% reserve)
  percentageAllocation: integer("percentage_allocation").default(100),
  
  // Minimum stock threshold before listing as out of stock
  minStockThreshold: integer("min_stock_threshold").default(0),
  
  // Fixed quantity to always reserve
  reserveQuantity: integer("reserve_quantity").default(0),
  
  // Exclude specific products (by SKU or Clover item ID)
  excludedSkus: text("excluded_skus").array().default([]),
  excludedProductIds: text("excluded_product_ids").array().default([]),
  excludedCategories: text("excluded_categories").array().default([]),
  
  // Include only specific products (if set, only these are synced)
  includedSkus: text("included_skus").array(),
  includedCategories: text("included_categories").array(),
  
  // Sync settings
  syncEnabled: boolean("sync_enabled").default(true),
  syncIntervalMinutes: integer("sync_interval_minutes").default(60),
  lastSyncAt: timestamp("last_sync_at"),
  nextSyncAt: timestamp("next_sync_at"),
  
  // Priority for rule application (higher = applied first)
  priority: integer("priority").default(0),
  
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("idx_marketplace_inventory_rules_channel").on(table.channelId),
  ruleTypeIdx: index("idx_marketplace_inventory_rules_type").on(table.ruleType),
  isActiveIdx: index("idx_marketplace_inventory_rules_active").on(table.isActive),
}));

export const marketplaceInventoryRulesRelations = relations(marketplaceInventoryRules, ({ one }) => ({
  channel: one(marketplaceChannels, { fields: [marketplaceInventoryRules.channelId], references: [marketplaceChannels.id] }),
  creator: one(users, { fields: [marketplaceInventoryRules.createdBy], references: [users.id] }),
}));

export const insertMarketplaceInventoryRuleSchema = createInsertSchema(marketplaceInventoryRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceInventoryRule = typeof marketplaceInventoryRules.$inferSelect;
export type InsertMarketplaceInventoryRule = z.infer<typeof insertMarketplaceInventoryRuleSchema>;

// Marketplace Sync Jobs - Track sync operations
export const marketplaceSyncJobs = pgTable("marketplace_sync_jobs", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => marketplaceChannels.id),
  
  // Job type
  jobType: varchar("job_type", { length: 50 }).notNull(), // orders_import, inventory_export, order_status_update, fulfillment_push
  
  // Status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, running, completed, failed, cancelled
  
  // Progress
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Results and errors
  results: jsonb("results"), // Summary of what was processed
  errors: jsonb("errors"), // Array of error messages
  
  // Who triggered (null = automatic)
  triggeredBy: varchar("triggered_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("idx_marketplace_sync_jobs_channel").on(table.channelId),
  jobTypeIdx: index("idx_marketplace_sync_jobs_type").on(table.jobType),
  statusIdx: index("idx_marketplace_sync_jobs_status").on(table.status),
  createdAtIdx: index("idx_marketplace_sync_jobs_created_at").on(table.createdAt),
}));

export const marketplaceSyncJobsRelations = relations(marketplaceSyncJobs, ({ one }) => ({
  channel: one(marketplaceChannels, { fields: [marketplaceSyncJobs.channelId], references: [marketplaceChannels.id] }),
  triggeredByUser: one(users, { fields: [marketplaceSyncJobs.triggeredBy], references: [users.id] }),
}));

export const insertMarketplaceSyncJobSchema = createInsertSchema(marketplaceSyncJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceSyncJob = typeof marketplaceSyncJobs.$inferSelect;
export type InsertMarketplaceSyncJob = z.infer<typeof insertMarketplaceSyncJobSchema>;

// Marketplace Authorized Users - Control which employees can access marketplace features
export const marketplaceAuthorizedUsers = pgTable("marketplace_authorized_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").references(() => marketplaceChannels.id), // null = all channels
  
  // Permission level
  permissionLevel: varchar("permission_level", { length: 50 }).notNull().default("view"), // view, fulfill, manage
  
  // Specific permissions (overrides permissionLevel)
  permissions: text("permissions").array().default([]), // ['view_orders', 'fulfill_orders', 'manage_inventory', 'manage_rules']
  
  isActive: boolean("is_active").default(true),
  grantedBy: varchar("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_marketplace_authorized_users_user").on(table.userId),
  channelIdIdx: index("idx_marketplace_authorized_users_channel").on(table.channelId),
  userChannelUnique: unique("idx_marketplace_authorized_users_unique").on(table.userId, table.channelId),
}));

export const marketplaceAuthorizedUsersRelations = relations(marketplaceAuthorizedUsers, ({ one }) => ({
  user: one(users, { fields: [marketplaceAuthorizedUsers.userId], references: [users.id] }),
  channel: one(marketplaceChannels, { fields: [marketplaceAuthorizedUsers.channelId], references: [marketplaceChannels.id] }),
  granter: one(users, { fields: [marketplaceAuthorizedUsers.grantedBy], references: [users.id] }),
}));

export const insertMarketplaceAuthorizedUserSchema = createInsertSchema(marketplaceAuthorizedUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceAuthorizedUser = typeof marketplaceAuthorizedUsers.$inferSelect;
export type InsertMarketplaceAuthorizedUser = z.infer<typeof insertMarketplaceAuthorizedUserSchema>;

// Product SKU Mapping - Map Clover items to marketplace products
export const marketplaceProductMappings = pgTable("marketplace_product_mappings", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => marketplaceChannels.id),
  
  // Clover/internal reference
  cloverItemId: varchar("clover_item_id", { length: 100 }),
  internalSku: varchar("internal_sku", { length: 100 }),
  
  // Marketplace reference
  externalProductId: varchar("external_product_id", { length: 255 }),
  externalVariantId: varchar("external_variant_id", { length: 255 }),
  externalSku: varchar("external_sku", { length: 100 }),
  
  // Mapping status
  isActive: boolean("is_active").default(true),
  isSynced: boolean("is_synced").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  
  // Override settings for this specific product
  overrideSettings: jsonb("override_settings"), // { priceMultiplier, fixedPrice, excludeFromSync }
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("idx_marketplace_product_mappings_channel").on(table.channelId),
  cloverItemIdx: index("idx_marketplace_product_mappings_clover").on(table.cloverItemId),
  externalProductIdx: index("idx_marketplace_product_mappings_external").on(table.channelId, table.externalProductId),
  internalSkuIdx: index("idx_marketplace_product_mappings_internal_sku").on(table.internalSku),
}));

export const marketplaceProductMappingsRelations = relations(marketplaceProductMappings, ({ one }) => ({
  channel: one(marketplaceChannels, { fields: [marketplaceProductMappings.channelId], references: [marketplaceChannels.id] }),
}));

export const insertMarketplaceProductMappingSchema = createInsertSchema(marketplaceProductMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketplaceProductMapping = typeof marketplaceProductMappings.$inferSelect;
export type InsertMarketplaceProductMapping = z.infer<typeof insertMarketplaceProductMappingSchema>;

// ============================================
// VIDEO GENERATION JOBS
// Async job tracking for AI video generation
// ============================================

export const videoGenerationJobs = pgTable("video_generation_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(), // Unique job identifier (UUID)
  
  // Project and scene reference
  projectId: varchar("project_id", { length: 100 }).notNull(),
  sceneId: varchar("scene_id", { length: 100 }).notNull(),
  
  // Provider info
  provider: varchar("provider", { length: 50 }).notNull(), // runway, kling, luma, hailuo, hunyuan, veo
  
  // Job status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, running, succeeded, failed, cancelled
  progress: integer("progress").default(0), // 0-100 percentage
  
  // Input parameters
  prompt: text("prompt"),
  fallbackPrompt: text("fallback_prompt"),
  duration: integer("duration").default(6), // seconds
  aspectRatio: varchar("aspect_ratio", { length: 20 }).default("16:9"),
  negativePrompt: text("negative_prompt"),
  style: varchar("style", { length: 50 }),
  sourceImageUrl: text("source_image_url"), // For I2V: matched brand asset product photo URL
  i2vSettings: jsonb("i2v_settings"), // I2V-specific settings: { imageControlStrength, animationStyle, motionStrength }
  motionControl: jsonb("motion_control"), // Phase 16: motion control override { camera_movement, intensity }
  sceneType: varchar("scene_type", { length: 50 }), // For intelligent motion control when no override
  
  // Output
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Who triggered
  triggeredBy: varchar("triggered_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  jobIdIdx: index("idx_video_gen_jobs_job_id").on(table.jobId),
  projectIdIdx: index("idx_video_gen_jobs_project_id").on(table.projectId),
  sceneIdIdx: index("idx_video_gen_jobs_scene_id").on(table.sceneId),
  statusIdx: index("idx_video_gen_jobs_status").on(table.status),
  projectSceneIdx: index("idx_video_gen_jobs_project_scene").on(table.projectId, table.sceneId),
  createdAtIdx: index("idx_video_gen_jobs_created_at").on(table.createdAt),
}));

export const videoGenerationJobsRelations = relations(videoGenerationJobs, ({ one }) => ({
  triggeredByUser: one(users, { fields: [videoGenerationJobs.triggeredBy], references: [users.id] }),
}));

export const insertVideoGenerationJobSchema = createInsertSchema(videoGenerationJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VideoGenerationJob = typeof videoGenerationJobs.$inferSelect;
export type InsertVideoGenerationJob = z.infer<typeof insertVideoGenerationJobSchema>;

// ============================================
// SCENE REGENERATION HISTORY
// Phase 13E: Track regeneration attempts for intelligent retry
// ============================================

export const sceneRegenerationHistory = pgTable("scene_regeneration_history", {
  id: serial("id").primaryKey(),
  sceneId: varchar("scene_id", { length: 100 }).notNull(),
  projectId: varchar("project_id", { length: 100 }),
  attemptNumber: integer("attempt_number").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  prompt: text("prompt"),
  result: varchar("result", { length: 20 }).notNull(),
  qualityScore: decimal("quality_score", { precision: 3, scale: 2 }),
  issues: text("issues"),
  claudeAnalysis: text("claude_analysis"),
  reasoning: text("reasoning"),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sceneIdIdx: index("idx_scene_regen_history_scene").on(table.sceneId),
  projectIdIdx: index("idx_scene_regen_history_project").on(table.projectId),
  resultIdx: index("idx_scene_regen_history_result").on(table.result),
  createdAtIdx: index("idx_scene_regen_history_created").on(table.createdAt),
}));

export const insertSceneRegenerationHistorySchema = createInsertSchema(sceneRegenerationHistory).omit({
  id: true,
  createdAt: true,
});

export type SceneRegenerationHistory = typeof sceneRegenerationHistory.$inferSelect;
export type InsertSceneRegenerationHistory = z.infer<typeof insertSceneRegenerationHistorySchema>;

// Phase 11E: Asset Library - Stores AI-generated assets for reuse across projects
export const assetLibrary = pgTable("asset_library", {
  id: serial("id").primaryKey(),
  
  // Project association (optional - some assets may be standalone)
  projectId: varchar("project_id", { length: 100 }),
  sceneId: varchar("scene_id", { length: 100 }),
  
  // Asset URLs
  assetUrl: text("asset_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  
  // Asset type and provider
  assetType: varchar("asset_type", { length: 20 }).notNull(), // 'image' | 'video'
  provider: varchar("provider", { length: 50 }), // 'kling' | 'runway' | 'flux' | 'falai' | 'hunyuan' | 'veo' | 'luma' | 'hailuo'
  
  // Generation details
  prompt: text("prompt"),
  visualDirection: text("visual_direction"),
  duration: decimal("duration", { precision: 10, scale: 2 }), // For videos, in seconds
  width: integer("width"),
  height: integer("height"),
  
  // Quality and usage tracking
  qualityScore: integer("quality_score"), // 0-100 from QA system
  isFavorite: boolean("is_favorite").default(false),
  tags: text("tags").array().default([]),
  contentType: varchar("content_type", { length: 50 }), // 'person' | 'product' | 'nature' | 'abstract' | 'other'
  
  // Usage statistics
  useCount: integer("use_count").default(1),
  lastUsedAt: timestamp("last_used_at"),
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assetTypeIdx: index("idx_asset_library_type").on(table.assetType),
  providerIdx: index("idx_asset_library_provider").on(table.provider),
  isFavoriteIdx: index("idx_asset_library_favorite").on(table.isFavorite),
  qualityScoreIdx: index("idx_asset_library_quality").on(table.qualityScore),
  contentTypeIdx: index("idx_asset_library_content_type").on(table.contentType),
  createdAtIdx: index("idx_asset_library_created_at").on(table.createdAt),
  projectIdIdx: index("idx_asset_library_project_id").on(table.projectId),
}));

export const assetLibraryRelations = relations(assetLibrary, ({ one }) => ({
  creator: one(users, { fields: [assetLibrary.createdBy], references: [users.id] }),
}));

export const insertAssetLibrarySchema = createInsertSchema(assetLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AssetLibraryItem = typeof assetLibrary.$inferSelect;
export type InsertAssetLibraryItem = z.infer<typeof insertAssetLibrarySchema>;

// ============================================
// SUPPORT CENTER
// Support articles, tickets, and reactions
// ============================================

// Support articles for blog-style updates (Helpful Tips, What's New, Bug Fixes, Enhancements)
export const supportArticles = pgTable("support_articles", {
  id: serial("id").primaryKey(),
  
  // Content
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  excerpt: text("excerpt"), // Short preview text
  
  // Categorization
  category: varchar("category", { length: 50 }).notNull(), // helpful_tips, whats_new, bug_fixes, enhancements
  
  // Author (only Ryan Sorensen can create/edit)
  authorId: varchar("author_id").notNull().references(() => users.id),
  
  // Display options
  isPinned: boolean("is_pinned").default(false),
  isPublished: boolean("is_published").default(true),
  
  // Engagement metrics
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  
  // Timestamps
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_support_articles_category").on(table.category),
  authorIdx: index("idx_support_articles_author").on(table.authorId),
  publishedIdx: index("idx_support_articles_published").on(table.isPublished),
  pinnedIdx: index("idx_support_articles_pinned").on(table.isPinned),
  createdAtIdx: index("idx_support_articles_created_at").on(table.createdAt),
}));

export const supportArticlesRelations = relations(supportArticles, ({ one, many }) => ({
  author: one(users, { fields: [supportArticles.authorId], references: [users.id] }),
  reactions: many(supportArticleReactions),
}));

export const insertSupportArticleSchema = createInsertSchema(supportArticles).omit({
  id: true,
  viewCount: true,
  helpfulCount: true,
  notHelpfulCount: true,
  createdAt: true,
  updatedAt: true,
});

export type SupportArticle = typeof supportArticles.$inferSelect;
export type InsertSupportArticle = z.infer<typeof insertSupportArticleSchema>;

// Article reactions (emoji reactions on articles)
export const supportArticleReactions = pgTable("support_article_reactions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => supportArticles.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  reactionType: varchar("reaction_type", { length: 20 }).notNull(), // celebrate, helpful, lightbulb, bug
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  articleUserIdx: unique("support_article_reaction_unique").on(table.articleId, table.userId, table.reactionType),
  articleIdx: index("idx_support_article_reactions_article").on(table.articleId),
  userIdx: index("idx_support_article_reactions_user").on(table.userId),
}));

export const supportArticleReactionsRelations = relations(supportArticleReactions, ({ one }) => ({
  article: one(supportArticles, { fields: [supportArticleReactions.articleId], references: [supportArticles.id] }),
  user: one(users, { fields: [supportArticleReactions.userId], references: [users.id] }),
}));

export const insertSupportArticleReactionSchema = createInsertSchema(supportArticleReactions).omit({
  id: true,
  createdAt: true,
});

export type SupportArticleReaction = typeof supportArticleReactions.$inferSelect;
export type InsertSupportArticleReaction = z.infer<typeof insertSupportArticleReactionSchema>;

// "Was this helpful?" feedback on articles
export const supportArticleFeedback = pgTable("support_article_feedback", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => supportArticles.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  isHelpful: boolean("is_helpful").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  articleUserIdx: unique("support_article_feedback_unique").on(table.articleId, table.userId),
  articleIdx: index("idx_support_article_feedback_article").on(table.articleId),
}));

export const supportArticleFeedbackRelations = relations(supportArticleFeedback, ({ one }) => ({
  article: one(supportArticles, { fields: [supportArticleFeedback.articleId], references: [supportArticles.id] }),
  user: one(users, { fields: [supportArticleFeedback.userId], references: [users.id] }),
}));

export const insertSupportArticleFeedbackSchema = createInsertSchema(supportArticleFeedback).omit({
  id: true,
  createdAt: true,
});

export type SupportArticleFeedback = typeof supportArticleFeedback.$inferSelect;
export type InsertSupportArticleFeedback = z.infer<typeof insertSupportArticleFeedbackSchema>;

// Support tickets for bug reports and feature requests
export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: varchar("ticket_number", { length: 20 }).notNull().unique(), // e.g., TKT-001
  
  // Ticket content
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // bug_report, feature_request, question, other
  
  // Priority and status
  priority: varchar("priority", { length: 20 }).default("normal"), // low, normal, high, urgent
  status: varchar("status", { length: 30 }).notNull().default("submitted"), // submitted, in_review, in_progress, completed, closed
  
  // Submitter
  submittedById: varchar("submitted_by_id").notNull().references(() => users.id),
  
  // Assignee (typically Ryan)
  assignedToId: varchar("assigned_to_id").references(() => users.id),
  
  // Resolution
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ticketNumberIdx: index("idx_support_tickets_number").on(table.ticketNumber),
  statusIdx: index("idx_support_tickets_status").on(table.status),
  submittedByIdx: index("idx_support_tickets_submitted_by").on(table.submittedById),
  categoryIdx: index("idx_support_tickets_category").on(table.category),
  createdAtIdx: index("idx_support_tickets_created_at").on(table.createdAt),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  submittedBy: one(users, { fields: [supportTickets.submittedById], references: [users.id] }),
  assignedTo: one(users, { fields: [supportTickets.assignedToId], references: [users.id] }),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  ticketNumber: true,
  status: true,
  resolutionNotes: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

// Homer AI Business Intelligence Conversations
export const homerConversations = pgTable("homer_conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id").notNull(), // Groups related messages
  
  // Message content
  role: varchar("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  
  // Input method
  inputMethod: varchar("input_method").default("text"), // 'text', 'voice'
  
  // AI processing metadata
  queryType: varchar("query_type"), // 'financial', 'forecast', 'comparison', 'general'
  dataSourcesUsed: text("data_sources_used").array(), // ['orders', 'inventory', 'accounts']
  tokensUsed: integer("tokens_used"),
  responseTimeMs: integer("response_time_ms"),
  
  // Voice-specific
  audioUrl: varchar("audio_url"), // ElevenLabs generated audio URL
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userSessionIdx: index("idx_homer_user_session").on(table.userId, table.sessionId),
  createdAtIdx: index("idx_homer_created_at").on(table.createdAt),
  queryTypeIdx: index("idx_homer_query_type").on(table.queryType),
}));

export const homerConversationsRelations = relations(homerConversations, ({ one }) => ({
  user: one(users, { fields: [homerConversations.userId], references: [users.id] }),
}));

export const insertHomerConversationSchema = createInsertSchema(homerConversations).omit({
  id: true,
  createdAt: true,
});

export type HomerConversation = typeof homerConversations.$inferSelect;
export type InsertHomerConversation = z.infer<typeof insertHomerConversationSchema>;

// ============================================
// HOMER AI - USER PROFILES
// ============================================
export const homerUserProfiles = pgTable('homer_user_profiles', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  
  displayName: text('display_name').notNull(),
  preferredName: text('preferred_name'),
  role: text('role').notNull(),
  title: text('title'),
  
  communicationStyle: text('communication_style').default('professional'),
  preferredGreeting: text('preferred_greeting'),
  wantsDetailedAnalysis: boolean('wants_detailed_analysis').default(true),
  wantsProactiveInsights: boolean('wants_proactive_insights').default(true),
  
  focusAreas: jsonb('focus_areas').$type<string[]>().default([]),
  
  responsibilities: text('responsibilities'),
  workingHours: text('working_hours'),
  timezone: text('timezone').default('America/Chicago'),
  
  lastInteraction: timestamp('last_interaction'),
  totalInteractions: integer('total_interactions').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const homerUserProfilesRelations = relations(homerUserProfiles, ({ one }) => ({
  user: one(users, { fields: [homerUserProfiles.userId], references: [users.id] }),
}));

export const insertHomerUserProfileSchema = createInsertSchema(homerUserProfiles).omit({
  id: true,
  lastInteraction: true,
  totalInteractions: true,
  createdAt: true,
  updatedAt: true,
});

export type HomerUserProfile = typeof homerUserProfiles.$inferSelect;
export type InsertHomerUserProfile = z.infer<typeof insertHomerUserProfileSchema>;

// ============================================
// HOMER AI - MEMORIES
// ============================================
export const homerMemories = pgTable('homer_memories', {
  id: serial('id').primaryKey(),
  
  userId: text('user_id'),
  
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  
  importance: integer('importance').default(5),
  expiresAt: timestamp('expires_at'),
  
  sourceConversationId: text('source_conversation_id'),
  sourceMessageId: text('source_message_id'),
  
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdIdx: index('homer_memories_user_id_idx').on(table.userId),
  categoryIdx: index('homer_memories_category_idx').on(table.category),
  importanceIdx: index('homer_memories_importance_idx').on(table.importance),
}));

export const insertHomerMemorySchema = createInsertSchema(homerMemories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HomerMemory = typeof homerMemories.$inferSelect;
export type InsertHomerMemory = z.infer<typeof insertHomerMemorySchema>;

// ============================================
// HOMER AI - FILES
// ============================================
export const homerFiles = pgTable('homer_files', {
  id: serial('id').primaryKey(),
  
  fileId: text('file_id').notNull().unique(),
  
  uploadedBy: text('uploaded_by').notNull(),
  
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  
  storagePath: text('storage_path').notNull(),
  storageType: text('storage_type').default('local'),
  
  description: text('description'),
  extractedText: text('extracted_text'),
  tags: jsonb('tags').$type<string[]>().default([]),
  
  isShared: boolean('is_shared').default(false),
  sharedWith: jsonb('shared_with').$type<string[]>().default([]),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uploadedByIdx: index('homer_files_uploaded_by_idx').on(table.uploadedBy),
  fileIdIdx: index('homer_files_file_id_idx').on(table.fileId),
}));

export const homerFilesRelations = relations(homerFiles, ({ one }) => ({
  uploader: one(users, { fields: [homerFiles.uploadedBy], references: [users.id] }),
}));

export const insertHomerFileSchema = createInsertSchema(homerFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HomerFile = typeof homerFiles.$inferSelect;
export type InsertHomerFile = z.infer<typeof insertHomerFileSchema>;

// ============================================
// HOMER AI - FILE-MESSAGE LINKS
// ============================================
export const homerFileMessages = pgTable('homer_file_messages', {
  id: serial('id').primaryKey(),
  
  fileId: text('file_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  messageId: text('message_id').notNull(),
  
  direction: text('direction').notNull(),
  context: text('context'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  fileIdIdx: index('homer_file_messages_file_id_idx').on(table.fileId),
  conversationIdIdx: index('homer_file_messages_conversation_id_idx').on(table.conversationId),
}));

export const insertHomerFileMessageSchema = createInsertSchema(homerFileMessages).omit({
  id: true,
  createdAt: true,
});

export type HomerFileMessage = typeof homerFileMessages.$inferSelect;
export type InsertHomerFileMessage = z.infer<typeof insertHomerFileMessageSchema>;

// ============================================
// PRACTITIONER DASHBOARD - SERVICE CONTACTS
// ============================================
export const practitionerContacts = pgTable('practitioner_contacts', {
  id: serial('id').primaryKey(),
  
  clientFirstName: text('client_first_name').notNull(),
  clientLastName: text('client_last_name').notNull(),
  clientEmail: text('client_email'),
  clientPhone: text('client_phone'),
  clientNotes: text('client_notes'),
  
  serviceType: text('service_type').notNull(),
  status: text('status').notNull().default('pending'),
  
  assignedPractitionerId: text('assigned_practitioner_id').references(() => users.id),
  
  priority: text('priority').default('normal'),
  preferredContactMethod: text('preferred_contact_method').default('phone'),
  preferredDateTime: timestamp('preferred_date_time'),
  
  practitionerComments: text('practitioner_comments'),
  
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  statusIdx: index('practitioner_contacts_status_idx').on(table.status),
  serviceTypeIdx: index('practitioner_contacts_service_type_idx').on(table.serviceType),
  assignedIdx: index('practitioner_contacts_assigned_idx').on(table.assignedPractitionerId),
  createdByIdx: index('practitioner_contacts_created_by_idx').on(table.createdBy),
}));

export const practitionerContactsRelations = relations(practitionerContacts, ({ one }) => ({
  assignedPractitioner: one(users, { 
    fields: [practitionerContacts.assignedPractitionerId], 
    references: [users.id],
    relationName: 'assignedPractitioner'
  }),
  createdByUser: one(users, { 
    fields: [practitionerContacts.createdBy], 
    references: [users.id],
    relationName: 'createdByUser'
  }),
}));

export const insertPractitionerContactSchema = createInsertSchema(practitionerContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const updatePractitionerContactSchema = z.object({
  clientFirstName: z.string().optional(),
  clientLastName: z.string().optional(),
  clientEmail: z.string().email().optional().nullable(),
  clientPhone: z.string().optional().nullable(),
  clientNotes: z.string().optional().nullable(),
  serviceType: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  assignedPractitionerId: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  preferredContactMethod: z.enum(['phone', 'email', 'text']).optional(),
  preferredDateTime: z.string().optional().nullable(),
  practitionerComments: z.string().optional().nullable(),
});

export type PractitionerContact = typeof practitionerContacts.$inferSelect;
export type InsertPractitionerContact = z.infer<typeof insertPractitionerContactSchema>;
export type UpdatePractitionerContact = z.infer<typeof updatePractitionerContactSchema>;

// BigCommerce Product Mapping - Maps Clover inventory items to BigCommerce products
export const bigcommerceProductMappings = pgTable("bigcommerce_product_mappings", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  sku: varchar("sku").notNull(), // BigCommerce variant SKU
  cloverSku: varchar("clover_sku"), // Manual override: Clover SKU to match for inventory lookup
  cloverMerchantId: varchar("clover_merchant_id", { length: 50 }), // Optional: Target specific Clover merchant for this product
  bigcommerceProductId: integer("bigcommerce_product_id").notNull(),
  bigcommerceVariantId: integer("bigcommerce_variant_id"),
  productName: varchar("product_name"),
  isActive: boolean("is_active").default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  skuIdx: index("idx_bc_mapping_sku").on(table.sku),
  cloverSkuIdx: index("idx_bc_mapping_clover_sku").on(table.cloverSku),
  bcProductIdx: index("idx_bc_mapping_bc_product").on(table.bigcommerceProductId),
  inventoryItemIdx: index("idx_bc_mapping_inventory_item").on(table.inventoryItemId),
  skuUnique: unique("idx_bc_mapping_sku_unique").on(table.sku),
}));

export const insertBigcommerceProductMappingSchema = createInsertSchema(bigcommerceProductMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BigcommerceProductMapping = typeof bigcommerceProductMappings.$inferSelect;
export type InsertBigcommerceProductMapping = z.infer<typeof insertBigcommerceProductMappingSchema>;

// BigCommerce Inventory Sync Config - Configuration for scheduled inventory syncs
export const bigcommerceInventorySyncConfig = pgTable("bigcommerce_inventory_sync_config", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().default("Watertown → BigCommerce Sync"),
  sourceMerchantId: varchar("source_merchant_id").notNull(), // Clover merchant ID
  sourceLocationName: varchar("source_location_name").notNull().default("Watertown Retail"),
  channelId: integer("channel_id").references(() => marketplaceChannels.id),
  
  // Sync rules
  percentageAllocation: integer("percentage_allocation").notNull().default(80), // 80% of stock sent to BigCommerce
  minimumStock: integer("minimum_stock").default(0), // Don't list if stock below this
  
  // Scheduling
  syncEnabled: boolean("sync_enabled").default(false),
  syncSchedule: varchar("sync_schedule").default("0 20 * * *"), // Cron: 8 PM daily
  syncTimeLocal: varchar("sync_time_local").default("20:00"), // Human readable time
  timezone: varchar("timezone").default("America/Chicago"),
  
  // Alert settings
  alertOnFailure: boolean("alert_on_failure").default(true),
  alertEmail: varchar("alert_email"),
  alertInApp: boolean("alert_in_app").default(true),
  
  // Status
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // success, failed, partial
  lastSyncJobId: integer("last_sync_job_id").references(() => marketplaceSyncJobs.id),
  nextScheduledSync: timestamp("next_scheduled_sync"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBigcommerceInventorySyncConfigSchema = createInsertSchema(bigcommerceInventorySyncConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BigcommerceInventorySyncConfig = typeof bigcommerceInventorySyncConfig.$inferSelect;
export type InsertBigcommerceInventorySyncConfig = z.infer<typeof insertBigcommerceInventorySyncConfigSchema>;
