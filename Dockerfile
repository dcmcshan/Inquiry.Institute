# Multi-stage build for Ghost on GCP
FROM ghost:5-alpine

# Copy custom config if needed
COPY ghost-config/ /var/lib/ghost/config/

# Expose port
EXPOSE 2368

# Use the default Ghost entrypoint
CMD ["node", "current/index.js"]
