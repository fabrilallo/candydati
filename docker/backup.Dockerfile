# Backup image: the same Postgres major version as the database (pg_dump / pg_restore) plus curl for the S3 upload.
# Pinned by digest like the other images; Dependabot (docker ecosystem) bumps tag and digest together.
FROM postgres:17@sha256:4d89c904835259bc58876520e56267ca07a4ebd6a027f7814bbbf91b50d685be
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
 && mkdir -p /backups && chown postgres:postgres /backups
USER postgres
VOLUME /backups
# The postgres image's entrypoint would start a server: this container only runs the scripts.
ENTRYPOINT []
CMD ["backup.sh", "loop"]
