# Notez 📝

A modern, self-hosted note-taking application with AI-powered features.

## Features

✅ **Complete MVP Implementation**

- 🔐 **Authentication** - Secure JWT-based auth with first-boot admin setup
- 📝 **Note Management** - Create, edit, delete notes with Monaco editor
- 📁 **Organization** - Folders and tags for organizing notes
- 🔍 **Full-Text Search** - Fast PostgreSQL-powered search with snippets
- 🤖 **AI Integration** - Summarize notes, suggest titles, extract tags (Claude, GPT, Gemini)
- 🎨 **Dark Mode** - Beautiful light/dark theme with system preference detection
- 👥 **User Management** - Admin panel for managing users
- 🐳 **Docker Ready** - Single-command deployment with Docker Compose

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/notez.git
cd notez

# Copy environment template
cp .env.example .env

# Edit .env and set secure secrets (see DEPLOYMENT.md)
nano .env

# Start the application
docker-compose up -d

# Access Notez
open http://localhost:3000
```

The first time you access Notez, you'll create an admin account through the setup wizard.

### Manual Development Setup

**Prerequisites:**
- Node.js 20+
- PostgreSQL 16+

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npx prisma migrate dev
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete deployment instructions including:

- 🐳 Docker Compose deployment
- 🚢 Portainer setup
- 🔄 GitHub Actions CI/CD
- 📦 Updating and maintenance
- 💾 Backup and restore
- 🔧 Troubleshooting

**TL;DR for Portainer:**

1. Pull from GitHub Container Registry: `ghcr.io/yourusername/notez:latest`
2. Create stack with docker-compose.yml
3. Set environment variables
4. Deploy!

## Technology Stack

### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify
- **Language:** TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Authentication:** JWT

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Language:** TypeScript
- **Editor:** Monaco Editor
- **Styling:** Tailwind CSS
- **Routing:** React Router v6

### AI Providers
- Anthropic Claude (Sonnet, Opus)
- OpenAI (GPT-4, GPT-3.5)
- Google Gemini

## Features in Detail

### Note Management
- Rich text editing with Monaco editor (VS Code's editor)
- Auto-save every 2 seconds
- Manual save with visual feedback
- Full markdown support
- Syntax highlighting for code blocks

### Organization
- Create unlimited folders
- Assign notes to folders
- Multi-tag support per note
- "All Notes" and "Unfiled" views
- Tag-based filtering

### Search
- Full-text search across title and content
- PostgreSQL tsvector for fast queries
- Search result snippets with highlighting
- Relevance-based ranking
- Real-time search with debouncing

### AI Features
- **Summarize Note** - Generate concise summaries
- **Suggest Title** - AI-powered title recommendations
- **Extract Tags** - Automatic tag suggestions from content
- Per-user API key configuration
- Supports multiple AI providers

### Security
- JWT-based authentication
- Secure password hashing (bcrypt)
- Encrypted AI API key storage (AES-256-GCM)
- CSRF protection
- HTTP-only refresh tokens
- Rate limiting ready

### Admin Features
- User management (create, list, deactivate)
- Force password change on first login
- Role-based access control
- System health monitoring

## Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - JWT access token secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `COOKIE_SECRET` - Cookie signing secret
- `ENCRYPTION_KEY` - AI API key encryption key

**Optional:**
- `PORT` - Server port (default: 3000)
- `CORS_ORIGIN` - Allowed CORS origin
- `LOG_LEVEL` - Logging level (default: info)

## Development

### Project Structure

```
notez/
├── backend/           # Fastify backend
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic
│   │   ├── middleware/# Auth, validation
│   │   └── lib/       # Utilities
│   └── prisma/        # Database schema & migrations
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/# UI components
│   │   ├── pages/     # Page components
│   │   ├── contexts/  # React contexts
│   │   └── lib/       # API client, utilities
├── docs/              # Documentation
├── .github/           # GitHub Actions workflows
└── docker-compose.yml # Docker Compose config
```

### Database Migrations

```bash
# Create a new migration
cd backend
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (⚠️ DESTROYS DATA)
npx prisma migrate reset
```

### Building for Production

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

## Contributing

This is a personal project, but suggestions and bug reports are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Built with [Claude Code](https://claude.com/claude-code) assistance
- Icons by [Lucide](https://lucide.dev)
- Editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/)

---

**Made with ❤️ for better note-taking**
