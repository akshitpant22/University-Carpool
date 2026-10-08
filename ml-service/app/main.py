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

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ml-similarity"}

@app.post("/embed-similarity", response_model=SimilarityResponse)
def compute_similarity(req: SimilarityRequest):
    try:
        from sentence_transformers import SentenceTransformer, util

        model_name = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")
        model = SentenceTransformer(model_name)

        query_emb = model.encode(req.query_text, convert_to_tensor=True)
        cand_embs = model.encode(req.candidate_texts, convert_to_tensor=True)

        cos_scores = util.cos_sim(query_emb, cand_embs)[0]

        results = [
            SimilarityResult(
                candidate_text=cand,
                similarity_score=float(cos_scores[idx])
            )
            for idx, cand in enumerate(req.candidate_texts)
        ]

        return SimilarityResponse(success=True, results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
