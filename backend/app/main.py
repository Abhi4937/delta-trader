from fastapi import FastAPI

app = FastAPI(title="Delta Trader")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
