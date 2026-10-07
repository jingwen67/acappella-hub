import { sqliteTable, text, integer, primaryKey, uniqueIndex, check, customType } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
const nocaseText = customType<{data:string}>({dataType(){return 'text COLLATE NOCASE';}});
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: nocaseText('name').unique().notNull(),
  password_hash: text('password_hash').notNull(),
  created_at: text('created_at').notNull(),
  is_admin: integer('is_admin').notNull().default(0),
  can_start: integer('can_start').notNull().default(0),
  is_md: integer('is_md').notNull().default(0),
  is_arranger: integer('is_arranger').notNull().default(0),
  is_alumni: integer('is_alumni').notNull().default(0),
  is_president: integer('is_president').notNull().default(0),
  is_vp: integer('is_vp').notNull().default(0),
  is_secretary: integer('is_secretary').notNull().default(0),
  is_treasurer: integer('is_treasurer').notNull().default(0),
  is_media: integer('is_media').notNull().default(0),
  full_name: text('full_name').notNull().default(""),
  pronouns: text('pronouns').notNull().default(""),
  position: text('position').notNull().default(""),
  voice_part: text('voice_part').notNull().default(""),
  school: text('school').notNull().default(""),
  grad_year: text('grad_year').notNull().default(""),
  program: text('program').notNull().default(""),
  fun_fact: text('fun_fact').notNull().default(""),
  favorite_food: text('favorite_food').notNull().default(""),
  avatar_ext: text('avatar_ext').notNull().default(""),
});
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
});
export const phases = sqliteTable('phases', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  created_by: integer('created_by').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
  closed_at: text('closed_at'),
  arranger_id: integer('arranger_id').references(() => users.id),
}, (t) => [uniqueIndex("one_open_phase").on(t.status).where(sql`${t.status} = 'open'`), check("phase_status", sql`${t.status} in ('open', 'closed')`)]);
export const candidacies = sqliteTable('candidacies', {
  phase_id: integer('phase_id').notNull().references(() => phases.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.phase_id, t.user_id] })]);
export const votes = sqliteTable('votes', {
  phase_id: integer('phase_id').notNull().references(() => phases.id),
  voter_id: integer('voter_id').notNull().references(() => users.id),
  candidate_id: integer('candidate_id').notNull().references(() => users.id),
  reaction: text('reaction').notNull(),
}, (t) => [primaryKey({ columns: [t.phase_id, t.voter_id, t.candidate_id] }), check("vote_reaction", sql`${t.reaction} in ('like', 'again')`)]);
export const arrangers = sqliteTable('arrangers', {
  id: integer('id').primaryKey(),
  name: nocaseText('name').unique().notNull(),
  created_at: text('created_at').notNull(),
});
export const semesters = sqliteTable('semesters', {
  id: integer('id').primaryKey(),
  label: nocaseText('label').unique().notNull(),
  folder_id: text('folder_id').notNull(),
  created_at: text('created_at').notNull(),
});
export const scores = sqliteTable('scores', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  arranger: text('arranger').notNull(),
  kind: text('kind').notNull(),
  semester_id: integer('semester_id').references(() => semesters.id),
  semester_label: text('semester_label').notNull(),
  file_name: text('file_name').notNull(),
  drive_file_id: text('drive_file_id'),
  drive_url: text('drive_url'),
  uploaded_by: integer('uploaded_by').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
  kinds: text('kinds').notNull().default(""),
}, (t) => [check("score_kind", sql`${t.kind} in ('big', 'small')`)]);
