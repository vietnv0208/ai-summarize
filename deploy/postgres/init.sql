-- Auto-runs on first container init (docker-entrypoint-initdb.d)
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
