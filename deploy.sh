#!/bin/bash

# Ghost CMS Deployment Script for GCP
# This script helps deploy Ghost to Google Cloud Platform

set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="ghost"

echo "?? Deploying Ghost CMS to GCP..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "? gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Set the project
echo "?? Setting GCP project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "?? Enabling required GCP APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Build and deploy using Cloud Build
echo "???  Building and deploying with Cloud Build..."
gcloud builds submit --config cloudbuild.yaml

echo "? Deployment complete!"
echo "?? Your Ghost site should be available at: https://inquirer.inquiry.institute/villa.diodati/"
echo ""
echo "Next steps:"
echo "1. Set up Cloud SQL instance if not already done:"
echo "   gcloud sql instances create ghost-db --database-version=MYSQL_8_0 --tier=db-f1-micro --region=$REGION"
echo ""
echo "2. Create database and user:"
echo "   gcloud sql databases create ghost --instance=ghost-db"
echo "   gcloud sql users create ghost --instance=ghost-db --password=YOUR_SECURE_PASSWORD"
echo ""
echo "3. Store secrets in Secret Manager:"
echo "   echo -n 'ghost' | gcloud secrets create ghost-db-user --data-file=-"
echo "   echo -n 'YOUR_SECURE_PASSWORD' | gcloud secrets create ghost-db-password --data-file=-"
echo ""
echo "4. Update cloudrun-service.yaml with your PROJECT_ID, REGION, and INSTANCE_NAME"
echo "5. Deploy the Cloud Run service:"
echo "   gcloud run services replace cloudrun-service.yaml --region=$REGION"
