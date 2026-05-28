FROM python:3.11-slim

# uv for fast, reproducible installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1

# Install runtime deps first (layer cache)
COPY requirements.txt ./
RUN uv pip install --system -r requirements.txt

# App code
COPY . .

EXPOSE 8000

# Run DB migrations, then serve.
ENTRYPOINT ["/bin/sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
