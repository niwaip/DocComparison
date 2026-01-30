FROM python:3.11-slim

WORKDIR /app

RUN bash -lc "if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i 's|http://deb.debian.org|https://mirrors.tuna.tsinghua.edu.cn|g; s|http://security.debian.org|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources; fi; if [ -f /etc/apt/sources.list ]; then sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g; s|http://security.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list; fi"

RUN apt-get update && apt-get install -y --no-install-recommends \
  libreoffice-writer \
  poppler-utils \
  tesseract-ocr \
  pandoc \
  libmagic1 \
  && rm -rf /var/lib/apt/lists/*

ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir "fastapi==0.115.6" "uvicorn[standard]==0.34.0" "python-multipart==0.0.20" "python-docx==1.1.2" "unstructured[all-docs]==0.16.12"

COPY app.py ./app.py

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
