# GCP Setup Guide for Ghost CMS

This guide walks you through setting up Ghost CMS on Google Cloud Platform.

## Step 1: Prerequisites

1. **Install Google Cloud SDK:**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

3. **Set your project:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

## Step 2: Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com
```

## Step 3: Create Cloud SQL Instance

```bash
gcloud sql instances create ghost-db \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_SECURE_ROOT_PASSWORD
```

**Note:** Choose an appropriate tier based on your needs:
- `db-f1-micro`: Development/Small sites (shared CPU, 0.6GB RAM)
- `db-g1-small`: Small production sites (1.7GB RAM)
- `db-n1-standard-1`: Production (3.75GB RAM)

## Step 4: Create Database and User

```bash
# Create database
gcloud sql databases create ghost --instance=ghost-db

# Create database user
gcloud sql users create ghost \
  --instance=ghost-db \
  --password=YOUR_SECURE_PASSWORD
```

## Step 5: Store Secrets in Secret Manager

```bash
# Store database username
echo -n 'ghost' | gcloud secrets create ghost-db-user --data-file=-

# Store database password
echo -n 'YOUR_SECURE_PASSWORD' | gcloud secrets create ghost-db-password --data-file=-

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding ghost-db-user \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding ghost-db-password \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 6: Create Service Account (Optional but Recommended)

```bash
gcloud iam service-accounts create ghost-sa \
  --display-name="Ghost CMS Service Account"

# Grant necessary permissions
PROJECT_ID=$(gcloud config get-value project)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ghost-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ghost-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 7: Update Configuration Files

### Update `cloudrun-service.yaml`:

Replace the following placeholders:
- `PROJECT_ID`: Your GCP project ID
- `REGION`: Your region (e.g., `us-central1`)
- `INSTANCE_NAME`: Your Cloud SQL instance name (e.g., `ghost-db`)

```yaml
run.googleapis.com/cloudsql-instances: YOUR_PROJECT_ID:us-central1:ghost-db
serviceAccountName: ghost-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Update `cloudbuild.yaml`:

Replace `$PROJECT_ID` with your actual project ID, or ensure the `PROJECT_ID` environment variable is set.

## Step 8: Build and Push Container Image

```bash
# Set your project ID
export PROJECT_ID=$(gcloud config get-value project)

# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/ghost:latest
```

## Step 9: Deploy to Cloud Run

### Option A: Using the YAML file

```bash
# Update cloudrun-service.yaml with your values first
gcloud run services replace cloudrun-service.yaml --region=us-central1
```

### Option B: Using gcloud command

```bash
PROJECT_ID=$(gcloud config get-value project)

gcloud run deploy ghost \
  --image gcr.io/$PROJECT_ID/ghost:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances $PROJECT_ID:us-central1:ghost-db \
  --set-env-vars URL=https://inquirer.inquiry.institute,NODE_ENV=production \
  --set-secrets database__connection__user=ghost-db-user:latest,database__connection__password=ghost-db-password:latest \
  --port 2368 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10
```

## Step 10: Set Up Custom Domain

1. **Create domain mapping:**
   ```bash
   gcloud run domain-mappings create \
     --service=ghost \
     --domain=inquirer.inquiry.institute \
     --region=us-central1
   ```

2. **Get DNS records:**
   ```bash
   gcloud run domain-mappings describe inquirer.inquiry.institute --region=us-central1
   ```

3. **Add DNS records** at your domain registrar:
   - Add the A record and CNAME record as shown in the output

4. **Verify domain:**
   ```bash
   gcloud run domain-mappings describe inquirer.inquiry.institute --region=us-central1
   ```
   Wait until status is `ACTIVE`

## Step 11: Set Up Load Balancer (Optional - for better performance)

If you need a global load balancer or more advanced routing:

```bash
# Create a serverless NEG (Network Endpoint Group)
gcloud compute network-endpoint-groups create ghost-neg \
  --region=us-central1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=ghost

# Then set up a load balancer using the GCP Console or gcloud commands
```

## Step 12: Configure Email (Optional)

Ghost requires email configuration for:
- Password resets
- Member invitations
- Newsletter sending

### Using Gmail SMTP:

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Update your secrets:
   ```bash
   echo -n 'smtp.gmail.com' | gcloud secrets create smtp-host --data-file=-
   echo -n '587' | gcloud secrets create smtp-port --data-file=-
   echo -n 'your-email@gmail.com' | gcloud secrets create smtp-user --data-file=-
   echo -n 'your-app-password' | gcloud secrets create smtp-password --data-file=-
   ```

4. Update `cloudrun-service.yaml` to include SMTP environment variables from secrets.

### Using SendGrid or other providers:

Update the SMTP configuration accordingly.

## Step 13: Initial Ghost Setup

1. **Access your Ghost admin:**
   - Navigate to `https://inquirer.inquiry.institute/ghost`
   - Complete the initial setup wizard

2. **Create your admin account** and configure your site.

## Monitoring and Maintenance

### View Logs:

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ghost" --limit 50 --format json

# Stream logs
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=ghost"
```

### Monitor Performance:

- Use Cloud Console ? Cloud Run ? ghost service
- Set up alerts in Cloud Monitoring
- Review Cloud SQL performance insights

### Backup Strategy:

1. **Automate Cloud SQL backups:**
   ```bash
   gcloud sql instances patch ghost-db \
     --backup-start-time=03:00 \
     --enable-bin-log
   ```

2. **Export database manually:**
   ```bash
   gcloud sql export sql ghost-db gs://your-bucket/ghost-backup-$(date +%Y%m%d).sql \
     --database=ghost
   ```

3. **Backup Ghost content** (stored in persistent volume on Cloud Run):
   - Consider using Cloud Storage for content backups
   - Set up a Cloud Function to periodically backup the content directory

## Cost Optimization

- Use Cloud Run's scale-to-zero (minimum instances set to 0 for development)
- Choose appropriate Cloud SQL tier
- Enable Cloud CDN for static assets (requires Load Balancer)
- Set up billing alerts in GCP Console

## Troubleshooting

### Container fails to start:
- Check Cloud Run logs
- Verify environment variables are set correctly
- Ensure Cloud SQL connection is configured properly

### Database connection issues:
- Verify Cloud SQL instance is running
- Check Cloud SQL Proxy is connected (visible in logs)
- Verify database credentials in Secret Manager
- Check service account has `cloudsql.client` role

### High latency:
- Consider using a region closer to your users
- Enable Cloud CDN
- Review Cloud SQL performance

## Security Checklist

- [ ] Database passwords are strong and stored in Secret Manager
- [ ] Service account has minimal required permissions
- [ ] Cloud SQL instance has authorized networks restricted
- [ ] HTTPS is enforced (default on Cloud Run)
- [ ] Regular security updates are applied
- [ ] Backups are automated and tested
- [ ] Access logs are monitored

## Next Steps

- Configure Ghost themes and content
- Set up custom domain SSL (automatic with Cloud Run)
- Configure analytics
- Set up CI/CD pipeline for automated deployments
- Configure monitoring and alerts
