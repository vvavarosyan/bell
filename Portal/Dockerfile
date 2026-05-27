# Bell Data Intelligence — Portal Dockerfile (for Railway)
# =========================================================
# Why this exists:
#   Railway's auto-detector (Railpack/Nixpacks) doesn't reliably handle our
#   monorepo layout where the actual Node app lives in `server/` but needs
#   sibling folders (`ui/`, `migrations/`). A Dockerfile makes the build
#   100% predictable: copy the WHOLE Portal folder, install in server/, run
#   from server/ as cwd so sibling-folder paths resolve correctly.
#
# Local Mac is unaffected — `Open Bell.qa Portal.command` doesn't use Docker.

FROM node:18-bookworm-slim

# Working dir is the Portal folder root.
WORKDIR /app

# Copy the entire Portal/ contents into /app.
# This includes server/, ui/, and migrations/ — all needed at runtime.
COPY . .

# Install server dependencies (omit dev for smaller image; we're past lint).
WORKDIR /app/server
RUN npm ci --omit=dev

# Runtime config
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Railway sets $PORT; the server reads it. Default 8080 if unset.
ENV PORT=8080
EXPOSE 8080

# Start the server. cwd is /app/server so __dirname='/app/server',
# making ../ui = /app/ui and ../migrations = /app/migrations. Correct.
CMD ["node", "server.js"]
