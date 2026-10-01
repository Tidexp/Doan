-- Fix embedding dimension from 768 to 3072 for gemini-embedding-2
-- WARNING: This will delete all existing embeddings

ALTER TABLE document_chunks
DROP COLUMN embedding;

ALTER TABLE document_chunks
ADD COLUMN embedding vector(3072);
