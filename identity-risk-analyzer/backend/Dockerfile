FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY data/mock_ad.json ./data/mock_ad.json
# run as an unprivileged user
RUN useradd --create-home --uid 10001 ira && mkdir -p /data && chown ira /data
USER ira
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
