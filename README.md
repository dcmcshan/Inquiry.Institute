# Ghost CMS Deployment for inquirer.inquiry.institute

This repository contains the configuration and deployment files for running Ghost CMS on Google Cloud Platform (GCP) using Docker.

## Overview

This project deploys Ghost CMS to `inquirer.inquiry.institute/villa.diodati/` using:
- **Docker** for containerization
- **Google Cloud Run** or **App Engine** for hosting
- **Cloud SQL (MySQL)** for the database
- **Cloud Build** for CI/CD

## Prerequisites

1. Google Cloud Platform account
2. `gcloud` CLI installed and configured
3. Docker installed (for local development)
4. Domain `inquirer.inquiry.institute` configured

## Quick Start

### Local Development

1. **Clone and navigate to the repository:**
   ```bash
   cd Inquiry.Institute
   ```

2. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your configuration:**
   ```bash
   nano .env
   ```

4. **Start the services:**
   ```bash
   docker-compose up -d
   ```

5. **Access Ghost at:** `http://localhost:2368`

### GCP Deployment

#### Option 1: Using Cloud Run (Recommended)

1. **Set up Cloud SQL instance:**
   ```bash
   gcloud sql instances create ghost-db \
     --database-version=MYSQL_8_0 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

2. **Create database and user:**
   ```bash
   gcloud sql databases create ghost --instance=ghost-db
   gcloud sql users create ghost \
     --instance=ghost-db \
     --password=YOUR_SECURE_PASSWORD
   ```

3. **Store secrets in Secret Manager:**
   ```bash
   echo -n 'ghost' | gcloud secrets create ghost-db-user --data-file=-
   echo -n 'YOUR_SECURE_PASSWORD' | gcloud secrets create ghost-db-password --data-file=-
   ```

4. **Update `cloudrun-service.yaml`:**
   - Replace `PROJECT_ID` with your GCP project ID
   - Replace `REGION` with your region
   - Replace `INSTANCE_NAME` with your Cloud SQL instance name

5. **Deploy using the deployment script:**
   ```bash
   export GCP_PROJECT_ID=your-project-id
   chmod +x deploy.sh
   ./deploy.sh
   ```

6. **Or deploy manually:**
   ```bash
   gcloud builds submit --config cloudbuild.yaml
   gcloud run services replace cloudrun-service.yaml --region=us-central1
   ```

#### Option 2: Using App Engine

1. **Update `app.yaml`:**
   - Replace `PROJECT_ID`, `REGION`, and `INSTANCE_NAME`

2. **Deploy:**
   ```bash
   gcloud app deploy
   ```

## Configuration

### Environment Variables

Key environment variables to configure:

- `URL`: Your Ghost site URL (https://inquirer.inquiry.institute/villa.diodati/)
- `MYSQL_HOST`: Database host
- `MYSQL_DATABASE`: Database name
- `MYSQL_USER`: Database user
- `MYSQL_PASSWORD`: Database password
- `SMTP_*`: Email configuration (optional)

### Ghost Configuration

Ghost configuration files should be placed in the `ghost-config/` directory. These will be copied into the container during build.

## Database Setup

### Using Cloud SQL

When using Cloud SQL, the connection is made through the Cloud SQL Proxy:

```yaml
database__connection__host: 127.0.0.1
database__connection__port: 3306
```

The Cloud SQL instance connection is configured in the Cloud Run service annotations:

```yaml
run.googleapis.com/cloudsql-instances: PROJECT_ID:REGION:INSTANCE_NAME
```

## Domain Configuration

To set up the custom domain `inquirer.inquiry.institute`:

1. **Create a Cloud Run service** (already done above)

2. **Map custom domain:**
   ```bash
   gcloud run domain-mappings create \
     --service=ghost \
     --domain=inquirer.inquiry.institute \
     --region=us-central1
   ```

3. **Follow DNS instructions:**
   The command will output DNS records to add to your domain registrar.

4. **Update DNS records** at your domain registrar with the provided values.

## Maintenance

### Backup Database

```bash
gcloud sql export sql ghost-db gs://your-bucket/ghost-backup-$(date +%Y%m%d).sql \
  --database=ghost
```

### Restore Database

```bash
gcloud sql import sql ghost-db gs://your-bucket/ghost-backup-YYYYMMDD.sql \
  --database=ghost
```

### View Logs

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ghost" --limit 50

# Or using Docker Compose locally
docker-compose logs -f ghost
```

## Security Considerations

1. **Use Secret Manager** for sensitive values (database passwords, API keys)
2. **Enable SSL/TLS** - Cloud Run automatically provides HTTPS
3. **Restrict database access** to Cloud Run service only
4. **Regular updates** - Keep Ghost and dependencies up to date
5. **Backup regularly** - Automated backups should be configured

## Troubleshooting

### Ghost can't connect to database

- Check Cloud SQL instance is running
- Verify Cloud SQL Proxy is configured correctly
- Check database credentials in Secret Manager

### Domain not resolving

- Verify DNS records are correctly set
- Wait for DNS propagation (can take up to 48 hours)
- Check domain mapping status: `gcloud run domain-mappings describe --domain=inquirer.inquiry.institute`

### Container build fails

- Check Dockerfile syntax
- Verify all required files are present
- Review Cloud Build logs: `gcloud builds list`

## Faculty Club Widget (OpenRouter chat)

The `faculty-club-widget/` directory contains a lightweight Express + vanilla JS app that replaces the old Rocket.Chat links on [`inquiry.institute/faculty.club`](https://inquiry.institute/faculty.club) with an in-page, multi-participant simulation powered by OpenRouter’s `got-oss-120b`.

### Features
- Streams each participant’s reply with per-speaker “thinking” pauses and a typewriter reveal to mimic real conversation pacing
- Builds prompts from table metadata, persona briefs, and the running chat history so every round feels coherent
- Requests JSON from OpenRouter so the UI knows the suggested topic, delays, and speaking speeds per persona

### Running locally
```bash
cd faculty-club-widget
cp .env.example .env             # add your OpenRouter API key
npm install
npm run dev                      # serves http://localhost:4173
```

Set `OPENROUTER_REFERER` to the production URL so the request is accepted by OpenRouter, and keep your API key server-side only.

To embed the widget in the existing Next.js page, deploy the Express app (e.g., on Cloud Run) and iframe or proxy `/api/generate` + the static assets into the Faculty Club route.

## Resources

- [Ghost Docker Documentation](https://docs.ghost.org/install/docker)
- [GCP Cloud Run Documentation](https://cloud.google.com/run/docs)
- [GCP Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Ghost Configuration Options](https://ghost.org/docs/config/)

## License

This project follows the same license as Ghost CMS.
