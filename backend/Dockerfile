FROM public.ecr.aws/docker/library/python:3.11-slim

# Use Tsinghua Pip Mirror
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# Use Tsinghua Apt Mirror (Debian Bookworm)
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources

# Install Pandoc
RUN apt-get update && apt-get install -y pandoc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
