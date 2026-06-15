# BINA Sync Agent - Installation Guide

## Prerequisites
- Node.js 18+ installed on the BINA server (https://nodejs.org)
- Access to the BINA SQL Server database (localhost)

## Step 1: Copy files
Copy the entire `bina-sync-agent` folder to the BINA server (e.g., `C:\bina-sync-agent`)

## Step 2: Install dependencies
Open Command Prompt as Administrator:
```
cd C:\bina-sync-agent
npm install
```

## Step 3: Configure
Copy `.env.example` to `.env` and fill in the values:
```
copy .env.example .env
notepad .env
```

## Step 4: Discover available data (first time only)
```
npm run discover
```
This creates `discover-report.json` — send this file back to us.

## Step 5: Build and run
```
npm run build
npm start
```

## Step 6: Install as Windows Service (auto-start on boot)
```
npm run install-service
```
The service will appear in Windows Services as "BINA Sync Agent".

## To uninstall the service
```
npm run uninstall-service
```
