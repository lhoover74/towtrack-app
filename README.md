# TowTrack App

Tow tracking platform for private property vehicle enforcement workflows.

## Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm start`
4. Open http://localhost:3000
5. Login with username: `admin`, password: `admin123`

## Features

- Authentication with roles (Admin, Manager, Officer/Staff, Viewer)
- Dashboard with counts and recent activity
- Vehicle management with full tow workflow
- Photo uploads for evidence
- Activity timeline for audit trail
- Search and filters by plate, VIN, make/model, color, status, etc.
- Property and towing company management
- Basic reports
- Stolen vehicle check integration with Chicago Police Department

## Architecture

- **Backend**: Node.js with Express.js
- **Database**: SQLite
- **Frontend**: Server-rendered EJS templates
- **Authentication**: Session-based with bcrypt
- **File Uploads**: Multer for photos
- **Styling**: Basic CSS

## Tech Stack

- Node.js
- Express
- SQLite3
- bcrypt
- express-session
- multer
- ejs

## Project Structure

- `/` - Server files
- `/public` - Static assets (CSS)
- `/views` - EJS templates
- `/db` - Database files
- `/uploads` - Uploaded photos

## Known Limitations

- No email notifications
- No advanced user permissions beyond roles
- Basic mobile responsiveness
- No automated tests
- No API endpoints (server-rendered only)
- CPD integration opens external link only

## Deployment

The app is designed to be deployment-ready with minimal setup. Ensure the uploads directory is writable and consider using a process manager like PM2 for production.
