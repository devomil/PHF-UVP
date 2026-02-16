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
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  roleIdx: index("idx_users_role").on(table.role),
}));

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  fileName: varchar("file_name").notNull(),
  fileType: varchar("file_type"),
  fileSize: integer("file_size"),
  s3Url: varchar("s3_url").notNull(),
  duration: integer("duration"),
  width: integer("width"),
  height: integer("height"),
  frameRate: integer("frame_rate"),
  metadata: jsonb("metadata"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_media_assets_user_id").on(table.userId),
  s3UrlIdx: index("idx_media_assets_s3_url").on(table.s3Url),
}));

export const assetTags = pgTable("asset_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  color: varchar("color"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mediaAssetTagMap = pgTable("media_asset_tag_map", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id),
  tagId: integer("tag_id").notNull().references(() => assetTags.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const videoProductions = pgTable("video_productions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("draft"),
  aspectRatio: varchar("aspect_ratio").default("16:9"),
  duration: integer("duration"),
  outputFormat: varchar("output_format"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_video_productions_user_id").on(table.userId),
  statusIdx: index("idx_video_productions_status").on(table.status),
}));

export const productionAssets = pgTable("production_assets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull().references(() => videoProductions.id),
  assetId: integer("asset_id").notNull().references(() => mediaAssets.id),
  layerOrder: integer("layer_order"),
  timing: jsonb("timing"),
  effects: jsonb("effects"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productionIdIdx: index("idx_production_assets_production_id").on(table.productionId),
  assetIdIdx: index("idx_production_assets_asset_id").on(table.assetId),
}));

export const brandAssets = pgTable("brand_assets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  assetType: varchar("asset_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_brand_assets_user_id").on(table.userId),
  assetTypeIdx: index("idx_brand_assets_type").on(table.assetType),
}));

export const brandMediaLibrary = pgTable("brand_media_library", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  brandAssetId: integer("brand_asset_id").notNull().references(() => brandAssets.id),
  mediaUrl: varchar("media_url").notNull(),
  mediaType: varchar("media_type"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_brand_media_user_id").on(table.userId),
  brandAssetIdIdx: index("idx_brand_media_brand_asset_id").on(table.brandAssetId),
}));

export const universalVideoProjects = pgTable("universal_video_projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  projectData: jsonb("project_data"),
  status: varchar("status").notNull().default("draft"),
  outputFormats: text("output_formats").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_universal_video_projects_user_id").on(table.userId),
  statusIdx: index("idx_universal_video_projects_status").on(table.status),
}));

export const videoGenerationJobs = pgTable("video_generation_jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  projectId: integer("project_id").notNull().references(() => universalVideoProjects.id),
  status: varchar("status").notNull().default("pending"),
  provider: varchar("provider"),
  inputData: jsonb("input_data"),
  outputUrl: varchar("output_url"),
  progress: integer("progress").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("idx_video_generation_jobs_user_id").on(table.userId),
  projectIdIdx: index("idx_video_generation_jobs_project_id").on(table.projectId),
  statusIdx: index("idx_video_generation_jobs_status").on(table.status),
}));

export const sceneRegenerationHistory = pgTable("scene_regeneration_history", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => videoGenerationJobs.id),
  sceneIndex: integer("scene_index"),
  provider: varchar("provider"),
  reason: text("reason"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  jobIdIdx: index("idx_scene_regen_history_job_id").on(table.jobId),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  user: one(users, { fields: [mediaAssets.userId], references: [users.id] }),
  tags: many(mediaAssetTagMap),
}));

export const assetTagsRelations = relations(assetTags, ({ many }) => ({
  assets: many(mediaAssetTagMap),
}));

export const mediaAssetTagMapRelations = relations(mediaAssetTagMap, ({ one }) => ({
  asset: one(mediaAssets, { fields: [mediaAssetTagMap.assetId], references: [mediaAssets.id] }),
  tag: one(assetTags, { fields: [mediaAssetTagMap.tagId], references: [assetTags.id] }),
}));

export const videoProductionsRelations = relations(videoProductions, ({ one, many }) => ({
  user: one(users, { fields: [videoProductions.userId], references: [users.id] }),
  assets: many(productionAssets),
}));

export const productionAssetsRelations = relations(productionAssets, ({ one }) => ({
  production: one(videoProductions, { fields: [productionAssets.productionId], references: [videoProductions.id] }),
  asset: one(mediaAssets, { fields: [productionAssets.assetId], references: [mediaAssets.id] }),
}));

export const brandAssetsRelations = relations(brandAssets, ({ one, many }) => ({
  user: one(users, { fields: [brandAssets.userId], references: [users.id] }),
  media: many(brandMediaLibrary),
}));

export const brandMediaLibraryRelations = relations(brandMediaLibrary, ({ one }) => ({
  user: one(users, { fields: [brandMediaLibrary.userId], references: [users.id] }),
  brandAsset: one(brandAssets, { fields: [brandMediaLibrary.brandAssetId], references: [brandAssets.id] }),
}));

export const universalVideoProjectsRelations = relations(universalVideoProjects, ({ one, many }) => ({
  user: one(users, { fields: [universalVideoProjects.userId], references: [users.id] }),
  jobs: many(videoGenerationJobs),
}));

export const videoGenerationJobsRelations = relations(videoGenerationJobs, ({ one, many }) => ({
  user: one(users, { fields: [videoGenerationJobs.userId], references: [users.id] }),
  project: one(universalVideoProjects, { fields: [videoGenerationJobs.projectId], references: [universalVideoProjects.id] }),
  regenerationHistory: many(sceneRegenerationHistory),
}));

export const insertMediaAssetSchema = createInsertSchema(mediaAssets).omit({
  id: true,
  uploadedAt: true,
  createdAt: true,
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

export const insertProductionAssetSchema = createInsertSchema(productionAssets).omit({
  id: true,
  createdAt: true,
});

export const insertBrandAssetSchema = createInsertSchema(brandAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBrandMediaSchema = createInsertSchema(brandMediaLibrary).omit({
  id: true,
  createdAt: true,
});

export const insertUniversalVideoProjectSchema = createInsertSchema(universalVideoProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVideoGenerationJobSchema = createInsertSchema(videoGenerationJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertSceneRegenerationHistorySchema = createInsertSchema(sceneRegenerationHistory).omit({
  id: true,
  createdAt: true,
});
