# Frontend – Setup & Run

### Prerequisites
- Node.js 18.18 or later
- npm

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Open Application

Visit:

http://localhost:3000

### 5. Production Build

```bash
npm run build
npm run start
```