FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent ./agent
COPY server ./server
COPY addin ./addin
COPY skill ./skill

ENV PYTHONUNBUFFERED=1 \
    BIND_HOST=0.0.0.0 \
    TLS=0 \
    HOSTED=1 \
    PORT=8787

EXPOSE 8787

CMD ["python", "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8787", "--log-level", "info"]
