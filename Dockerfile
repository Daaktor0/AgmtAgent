FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent ./agent
COPY server ./server
COPY addin ./addin
COPY skill ./skill

# Non-root runtime user
RUN useradd -m -u 10001 agmt
USER agmt

ENV PYTHONUNBUFFERED=1 \
    BIND_HOST=0.0.0.0 \
    TLS=0 \
    HOSTED=1 \
    PORT=8787

ENV DATA_DIR=/data
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8787')+'/api/health')" || exit 1

EXPOSE 10000

CMD ["sh", "-c", "python -m uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8787} --log-level info"]
