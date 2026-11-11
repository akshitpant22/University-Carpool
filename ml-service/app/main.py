from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import os

app = FastAPI(title="Campus Carpool - ML Semantic Matching Service", version="1.0.0")

class SimilarityRequest(BaseModel):
    query_text: str
    candidate_texts: List[str]

class SimilarityResult(BaseModel):
    candidate_text: str
    similarity_score: float

class SimilarityResponse(BaseModel):
    success: bool
    results: List[SimilarityResult]

# Global model cache to avoid re-instantiating 100MB+ model on every HTTP request
_model_instance = None

def get_model():
    global _model_instance
    if _model_instance is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")
        print(f"[ML Service] Loading SentenceTransformer model '{model_name}'...")
        _model_instance = SentenceTransformer(model_name)
        print(f"[ML Service] Model '{model_name}' ready.")
    return _model_instance

@app.on_event("startup")
def preload_model():
    """Attempt warm-up preload on startup if sentence_transformers is available"""
    try:
        get_model()
    except Exception as e:
        print(f"[ML Service Startup Warning] Could not preload model: {e}")

@app.get("/health")
def health_check():
    model_ready = _model_instance is not None
    return {
        "status": "healthy",
        "service": "ml-similarity",
        "model_loaded": model_ready
    }

@app.post("/embed-similarity", response_model=SimilarityResponse)
def compute_similarity(req: SimilarityRequest):
    if not req.candidate_texts:
        return SimilarityResponse(success=True, results=[])

    try:
        from sentence_transformers import util
        model = get_model()

        query_emb = model.encode(req.query_text, convert_to_tensor=True)
        cand_embs = model.encode(req.candidate_texts, convert_to_tensor=True)

        cos_scores = util.cos_sim(query_emb, cand_embs)[0]

        results = [
            SimilarityResult(
                candidate_text=cand,
                similarity_score=max(0.0, min(1.0, float(cos_scores[idx])))
            )
            for idx, cand in enumerate(req.candidate_texts)
        ]

        return SimilarityResponse(success=True, results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

