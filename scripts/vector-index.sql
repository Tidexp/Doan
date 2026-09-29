CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops);
