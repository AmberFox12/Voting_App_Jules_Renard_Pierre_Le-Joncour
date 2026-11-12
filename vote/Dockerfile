FROM python:3.15.2-alpine3.24
WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

RUN adduser -D appuser
USER appuser
COPY --chown=appuser:appuser . .

EXPOSE 8080
CMD ["python", "app.py"]    