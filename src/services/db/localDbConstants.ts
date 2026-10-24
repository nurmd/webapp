/**
 * Leaf module declaring local database names, persistence keys, and registry identifiers.
 * Zero external dependencies; safe to import in storage engines, singletons, and unit tests.
 */

export const DEFAULT_LOCAL_DB_NAME = 'vyapar_fintech_store';
export const DEMO_LOCAL_DB_NAME = 'vyapar_demo';

export const POUCH_PERSIST_KEYS = {
  ACTIVE_LOCAL_DB: 'gst_active_local_db',
  SYNC_REMOTE_URL: 'gst_sync_remote_url',
  DEMO_MODE: 'gst_demo_mode',
  PRE_DEMO_DB: 'gst_pre_demo_db',
  PRE_DEMO_REMOTE: 'gst_pre_demo_remote',
  LAST_HYDRATED_DB: 'gst_last_hydrated_db',
  PENDING_DEMO_LOAD: 'gst_pending_demo_load',
  LAST_SYNCED_AT: 'gst_pouch_last_synced_at',
} as const;

export const LOCAL_DATABASES_REGISTRY_KEY = 'gst_local_databases';
