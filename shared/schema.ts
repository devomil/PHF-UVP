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

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"),
  isActive: boolean("is_active").default(true),
  phone: varchar("phone"),
  notes: text("notes"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  roleIdx: index("idx_users_role").on(table.role),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  type: varchar("type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  url: varchar("url", { length: 1000 }).notNull(),
  thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
  classification: varchar("classification", { length: 50 }).default("uncategorized"),
  brandMediaId: integer("brand_media_id").references(() => brandMediaLibrary.id),
  source: varchar("source").notNull(),
  sourceId: varchar("source_id"),
  licenseType: varchar("license_type"),
  duration: integer("duration"),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  fps: integer("fps"),
  codec: varchar("codec"),
  bitrate: integer("bitrate"),
  qualityScore: integer("quality_score"),
  relevanceScore: integer("relevance_score"),
  technicalScore: integer("technical_score"),
  emotionalScore: integer("emotional_score"),
  prompt: text("prompt"),
  keywords: text("keywords").array(),
  category: varchar("category"),
  mood: varchar("mood"),
  style: varchar("style"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  isPublic: boolean("is_public").default(true),
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

export const assetTags = pgTable("asset_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  category: varchar("category"),
  description: text("description"),
  color: varchar("color"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_asset_tags_category").on(table.category),
}));

export const mediaAssetTagMap = pgTable("media_asset_tag_map", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => assetTags.id, { onDelete: "cascade" }),
  confidence: integer("confidence").default(100),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  assetTagUnique: unique("media_asset_tag_unique").on(table.assetId, table.tagId),
  assetIdx: index("idx_media_asset_tag_map_asset").on(table.assetId),
  tagIdx: index("idx_media_asset_tag_map_tag").on(table.tagId),
}));

export const videoProductions = pgTable("video_productions", {
  id: serial("id").primaryKey(),
  productionId: varchar("production_id", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  mode: varchar("mode").notNull().default("script"),
  targetDuration: integer("target_duration").notNull().default(60),
  platform: varchar("platform").default("youtube"),
  style: varchar("style").default("professional"),
  voiceStyle: varchar("voice_style").default("professional"),
  voiceGender: varchar("voice_gender").default("female"),
  musicMood: varchar("music_mood").default("uplifting"),
  script: text("script"),
  visualDirections: text("visual_directions"),
  brief: jsonb("brief"),
  status: varchar("status").notNull().default("pending"),
  currentPhase: varchar("current_phase"),
  overallProgress: integer("overall_progress").default(0),
  overallQualityScore: integer("overall_quality_score"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedDuration: integer("estimated_duration"),
  actualDuration: integer("actual_duration"),
  outputUrl: varchar("output_url", { length: 1000 }),
  previewUrl: varchar("preview_url", { length: 1000 }),
  outputFormat: varchar("output_format").default("mp4"),
  outputResolution: varchar("output_resolution").default("1920x1080"),
  createdBy: varchar("created_by").references(() => users.id),
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

export const productionPhases = pgTable("production_phases", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  phase: varchar("phase").notNull(),
  status: varchar("status").notNull().default("pending"),
  estimatedDuration: integer("estimated_duration"),
  actualDuration: integer("actual_duration"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  progress: integer("progress").default(0),
  qualityScore: integer("quality_score"),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  logs: jsonb("logs"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productionPhaseIdx: index("idx_production_phases_production").on(table.productionId),
  phaseIdx: index("idx_production_phases_phase").on(table.phase),
  statusIdx: index("idx_production_phases_status").on(table.status),
}));

export const productionAssets = pgTable("production_assets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id),
  sceneNumber: integer("scene_number"),
  section: varchar("section"),
  role: varchar("role"),
  startTime: integer("start_time"),
  endTime: integer("end_time"),
  duration: integer("duration"),
  transition: varchar("transition"),
  transitionDuration: integer("transition_duration"),
  effects: jsonb("effects"),
  zIndex: integer("z_index").default(0),
  opacity: integer("opacity").default(100),
  position: jsonb("position"),
  qualityScore: integer("quality_score"),
  wasRegenerated: boolean("was_regenerated").default(false),
  regenerationCount: integer("regeneration_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productionIdx: index("idx_production_assets_production").on(table.productionId),
  assetIdx: index("idx_production_assets_asset").on(table.assetId),
  sceneIdx: index("idx_production_assets_scene").on(table.sceneNumber),
}));

export const userMediaUploads = pgTable("user_media_uploads", {
  id: serial("id").primaryKey(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  description: text("description"),
  type: varchar("type").notNull(),
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"),
  url: varchar("url", { length: 1000 }).notNull(),
  thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
  storageKey: varchar("storage_key", { length: 500 }),
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  category: varchar("category"),
  tags: text("tags").array(),
  assetId: integer("asset_id").references(() => mediaAssets.id),
  status: varchar("status").default("pending"),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uploadedByIdx: index("idx_user_media_uploads_uploaded_by").on(table.uploadedBy),
  typeIdx: index("idx_user_media_uploads_type").on(table.type),
  statusIdx: index("idx_user_media_uploads_status").on(table.status),
}));

export const productionLogs = pgTable("production_logs", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id, { onDelete: "cascade" }),
  phaseId: integer("phase_id").references(() => productionPhases.id),
  level: varchar("level").notNull().default("info"),
  category: varchar("category"),
  message: text("message").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow(),
  duration: integer("duration"),
  apiService: varchar("api_service"),
  apiEndpoint: varchar("api_endpoint"),
  apiResponseCode: integer("api_response_code"),
  apiCost: decimal("api_cost", { precision: 10, scale: 4 }),
}, (table) => ({
  productionIdx: index("idx_production_logs_production").on(table.productionId),
  phaseIdx: index("idx_production_logs_phase").on(table.phaseId),
  levelIdx: index("idx_production_logs_level").on(table.level),
  timestampIdx: index("idx_production_logs_timestamp").on(table.timestamp),
}));

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

export const brandAssets = pgTable("brand_assets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  isDefault: boolean("is_default").default(false),
  settings: jsonb("settings"),
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

export const brandMediaLibrary = pgTable("brand_media_library", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  assetCategory: varchar("asset_category", { length: 50 }),
  assetType: varchar("asset_type", { length: 100 }),
  entityName: varchar("entity_name", { length: 255 }),
  entityType: varchar("entity_type", { length: 100 }),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  duration: decimal("duration", { precision: 10, scale: 2 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  matchKeywords: text("match_keywords").array().default([]),
  excludeKeywords: text("exclude_keywords").array().default([]),
  usageContexts: text("usage_contexts").array().default([]),
  visualAttributes: jsonb("visual_attributes"),
  placementSettings: jsonb("placement_settings"),
  personInfo: jsonb("person_info"),
  productInfo: jsonb("product_info"),
  priority: integer("priority").default(0),
  isDefault: boolean("is_default").default(false),
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

export const universalVideoProjects = pgTable("universal_video_projects", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id", { length: 100 }).notNull().unique(),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetAudience: text("target_audience"),
  totalDuration: integer("total_duration").notNull(),
  fps: integer("fps").notNull().default(30),
  outputFormat: jsonb("output_format").notNull(),
  brand: jsonb("brand").notNull(),
  scenes: jsonb("scenes").notNull(),
  assets: jsonb("assets").notNull(),
  progress: jsonb("progress").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  history: jsonb("history"),
  qualityReport: jsonb("quality_report"),
  qualityTier: varchar("quality_tier", { length: 20 }).notNull().default("premium"),
  mediaMode: varchar("media_mode", { length: 10 }),
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

export const videoGenerationJobs = pgTable("video_generation_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(),
  projectId: varchar("project_id", { length: 100 }).notNull(),
  sceneId: varchar("scene_id", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  progress: integer("progress").default(0),
  prompt: text("prompt"),
  fallbackPrompt: text("fallback_prompt"),
  duration: integer("duration").default(6),
  aspectRatio: varchar("aspect_ratio", { length: 20 }).default("16:9"),
  negativePrompt: text("negative_prompt"),
  style: varchar("style", { length: 50 }),
  sourceImageUrl: text("source_image_url"),
  i2vSettings: jsonb("i2v_settings"),
  motionControl: jsonb("motion_control"),
  sceneType: varchar("scene_type", { length: 50 }),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
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

export const assetLibrary = pgTable("asset_library", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id", { length: 100 }),
  sceneId: varchar("scene_id", { length: 100 }),
  assetUrl: text("asset_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  assetType: varchar("asset_type", { length: 20 }).notNull(),
  provider: varchar("provider", { length: 50 }),
  prompt: text("prompt"),
  visualDirection: text("visual_direction"),
  duration: decimal("duration", { precision: 10, scale: 2 }),
  width: integer("width"),
  height: integer("height"),
  qualityScore: integer("quality_score"),
  isFavorite: boolean("is_favorite").default(false),
  tags: text("tags").array().default([]),
  contentType: varchar("content_type", { length: 50 }),
  useCount: integer("use_count").default(1),
  lastUsedAt: timestamp("last_used_at"),
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
