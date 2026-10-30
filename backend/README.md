# Backend – Setup & Run

### Prerequisites
- Node.js 18.18 or later
- npm
- MongoDB Atlas account
- OpenAI API key

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the backend directory:

```env
PORT=4000
JWT_SECRET="change-this-to-a-long-random-string"
ASK_DAILY_LIMIT="300"
FRONTEND_URL="http://localhost:3000"
TRUST_PROXY="0"
MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?appName=Cluster"
MONGODB_DB="knowledge_assistant"


LLM_PROVIDER="groq"
OPENAI_API_KEY=""
GROQ_API_KEY=""
GROQ_MODEL="openai/gpt-oss-20b"
OPENAI_MODEL="gpt-4o-mini"

```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Verify Backend

Visit:

http://localhost:5000/api/health

### 5. Start Production Server

```bash
npm start
```