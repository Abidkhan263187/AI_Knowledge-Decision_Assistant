
# AI Knowledge & Decision Assistant

A multi-tenant SaaS MVP that enables organizations to upload PDF documents, create a public AI assistant, and allow visitors to ask questions through a shareable URL or embedded widget.

The assistant retrieves relevant information from the organization's knowledge base and generates answers grounded in the retrieved document content, including document and page references.

## 1. Setup and Installation

### Prerequisites

- Node.js 20+
- npm
- MongoDB Atlas account
- Groq API key

### Environment Configuration

**Backend**

Create the backend environment file:

```
cd backend
copy .env.example .env
```

Configure the following variables in `backend/.env` using the names defined in `.env.example`:

**Frontend**

Create the frontend environment file:

```
cd frontend
copy .env.local.example .env.local
```

Configure the backend API URL according to the existing frontend environment example.

### Installation and Run Commands

**1. Start the backend**

```
cd backend
npm install
npm run seed
npm run dev
```

**2. Start the frontend in a separate terminal**

```
cd frontend
npm install
npm run dev
```

Open the application:

[http://localhost:3000](http://localhost:3000)

### Demo Credentials

| Organization             | Email                                                 | Password    |
| ------------------------ | ----------------------------------------------------- | ----------- |
| Northridge University    | [admin@northridge.test](mailto:admin@northridge.test) | password123 |
| Harbor Technical College | [admin@harbor.test](mailto:admin@harbor.test)         | password123 |

### Tenant Isolation Test

Run the isolation test:

```
cd backend
npm run test:isolation
```

This test verifies that organization-specific data remains isolated.

---

## 2. System Architecture

### High-Level Architecture

```
                    ORGANIZATION ADMIN
                            |
                            v
                    Next.js Dashboard
                            |
                            v
                    Express Backend API
                            |
                    JWT Authentication
                            |
                            v
                      MongoDB Atlas
                            |
                +-----------+-----------+
                |           |           |
          Organizations  Documents   Chunks
                |           |           |
                +-----------+-----------+
                            |
                            |
                      KNOWLEDGE BASE
                            |
                            |
VISITOR / EMBED WIDGET      |
          |                 |
          v                 |
    Public Assistant        |
          |                 |
          v                 |
     POST /api/ask          |
          |                 |
          v                 |
  Assistant Token Validation
          |
          v
  Organization Resolution
          |
          v
  Organization-scoped Retrieval
          |
          v
  Relevance Scoring and Filtering
          |
          v
    LLM Answer Generation
          |
          v
  Grounded Answer + References
          |
          v
       Visitor
```

### Main Components

**Frontend – Next.js**

Responsible for:

- Organization registration and login.
- Dashboard and knowledge base management.
- PDF upload and document listing.
- Public assistant interface.
- Shareable assistant URL.
- Embeddable iframe widget.
- Usage and question statistics.

**Backend – Express.js**

Responsible for:

- Authentication and authorization.
- Organization management.
- PDF validation and text extraction.
- Document and chunk storage.
- Knowledge retrieval.
- AI answer generation.
- Assistant token validation.
- Usage tracking and rate limiting.

**Database – MongoDB Atlas**

Stores:

- Organization information.
- Authentication-related data.
- Uploaded document metadata.
- Extracted document chunks.
- Organization-specific assistant tokens.
- Usage statistics.

Every organization-owned resource is associated with an `organizationId`.

### Request and Data Flow

**Document ingestion flow**

1. An organization administrator logs in.
2. The administrator uploads a PDF.
3. The backend validates the PDF.
4. Text is extracted page by page.
5. Extracted content is divided into smaller chunks.
6. Chunks are stored with organization and document metadata.
7. The document becomes available for organization-specific retrieval.

**Question-answering flow**

1. A visitor opens the public assistant URL or embedded widget.
2. The visitor submits a question.
3. The frontend sends the question and assistant token to `POST /api/ask`.
4. The backend validates the assistant token.
5. The associated organization is resolved.
6. Retrieval searches only that organization's document chunks.
7. Relevant passages are ranked using keyword/TF-style scoring.
8. If the retrieved information is insufficient, the system avoids generating an unsupported answer.
9. The LLM generates a response using the retrieved content.
10. The response includes document names and page references.

---

## 3. Knowledge Base and PDF Processing

The knowledge base is designed around organization-specific document ingestion and retrieval.

### PDF Validation

Uploaded documents are validated against the following limits:

- Maximum file size: 10 MB.
- Maximum pages: 20.
- Maximum documents: 10.

Invalid or unsupported files are rejected before processing.

### Text Extraction

The backend uses:

- `pdf-lib` for PDF page-count and document validation.
- `pdfjs` for extracting text from individual pages.

Text is extracted page by page to preserve document references.

### Chunking Strategy

Extracted text is divided into smaller chunks using page and sentence boundaries.

Each chunk maintains metadata such as:

- `organizationId`
- Document identifier
- Original filename
- Page number
- Extracted text

This allows retrieved passages to retain their original document context.

### Indexing and Retrieval

The current implementation uses lexical keyword/TF-style scoring rather than vector embeddings.

Retrieval follows this process:

1. Receive the visitor's question.
2. Identify relevant terms.
3. Score available chunks using keyword/TF-style matching.
4. Restrict candidate chunks to the resolved organization.
5. Rank the matching passages.
6. Use sufficiently relevant passages as context for answer generation.

### Document References

use upload_to_ui folder for document reference to upload

## 4. AI Architecture and Decision-Making

The assistant separates deterministic application logic from LLM-based natural language generation.

### System 1 – Deterministic Processing

System 1 refers to fast, predictable application-level processing that does not require an LLM call.

In the current implementation, deterministic operations include:

- PDF validation.
- Assistant token validation.
- Organization resolution.
- Tenant-scoped retrieval.
- Keyword/TF-style relevance scoring.
- Retrieval sufficiency checks.
- Usage limits and authorization checks.

These operations are handled through application logic rather than asking an LLM to make every decision.

### LLM – Natural Language Understanding and Generation

The LLM is used when natural language understanding and response generation are required.

Its responsibilities include:

- Understanding the visitor's question.
- Using retrieved document passages as context.
- Generating concise, readable answers.
- Staying grounded in the available document content.
- Avoiding unsupported claims.

The current integration uses the Groq API.

### Question Processing Strategy

The current MVP follows this pipeline:

```
User Question
      |
      v
Input Validation
      |
      v
Organization Resolution
      |
      v
Document Retrieval
      |
      v
Relevance Scoring
      |
      v
Sufficiency Check
      |
      +------ Insufficient Context
      |              |
      |              v
      |        Safe Fallback
      |
      +------ Sufficient Context
                     |
                     v
               LLM Generation
                     |
                     v
             Grounded Response
                     |
                     v
             Document References
```

### Decomposition and Combination

Complex questions may require multiple conditions or information from different document passages.

The current MVP retrieves and ranks relevant passages before generating a response. It does not implement a separate multi-stage LLM decomposition and decision-combination engine.

A future enhancement would introduce:

1. Question decomposition into smaller sub-questions.
2. Independent retrieval for each sub-question.
3. Deterministic evaluation of structured conditions where applicable.
4. Combination of individual results into a consolidated answer.
5. A final explanation with supporting document references.

### Decision Rationale

The architecture follows these principles:

- Use deterministic logic for predictable application decisions.
- Use the LLM for language understanding and response generation.
- Retrieve only organization-specific information.
- Require supporting context before generating factual answers.
- Preserve document and page references for traceability.

This avoids unnecessary LLM calls for routine application operations and reduces unsupported responses.

---

## 5. Security and Multi-Tenant Isolation

Security and tenant isolation are core design considerations.

### Organization Isolation

Each organization has its own `organizationId`.

Organization-owned documents and chunks are associated with this identifier.

Every retrieval operation is scoped to the organization resolved from the authenticated session or assistant token.

This prevents one organization's assistant from retrieving another organization's content.

### Dashboard Authentication

- Dashboard authentication uses JWT.
- Protected dashboard APIs require valid JWT authentication.
- `/api/auth/me` requires dashboard authentication.
- Assistant tokens cannot be used as dashboard JWTs.

### Public Assistant Authentication

Each organization receives a unique `assistantToken`.

The public assistant uses this token to identify the organization associated with a question.

The backend validates the token server-side before retrieving any organization-specific content.

The token can be regenerated through the authenticated assistant management endpoint.

### Document Access Controls

- Visitors do not need dashboard accounts.
- Visitors interact through the public assistant interface.
- Original PDFs are not publicly listed through the assistant.
- Retrieval returns relevant extracted content rather than granting visitors access to document administration.
- Document management is handled through authenticated dashboard APIs.

### Rate Limiting and Usage Controls

The application includes:

- Rate limiting for login, registration and assistant questions.
- A configurable daily assistant question limit using `ASK_DAILY_LIMIT`.
- Usage tracking for questions and answers.

### Security Considerations

Before production deployment, additional hardening should include:

- Strong password policies.
- Secure secret management.
- HTTPS enforcement.
- More comprehensive authorization tests.
- File malware scanning.
- Audit logging.
- Additional protection against automated abuse.

---

## 6. Major API Endpoints

| Method | Endpoint                    | Authentication         | Purpose                               |
| ------ | --------------------------- | ---------------------- | ------------------------------------- |
| POST   | `/api/auth/register`        | None                   | Register organization                 |
| POST   | `/api/auth/login`           | None                   | Authenticate administrator            |
| GET    | `/api/auth/me`              | JWT                    | Retrieve dashboard profile and usage  |
| GET    | `/api/documents`            | JWT                    | List organization documents           |
| POST   | `/api/documents`            | JWT                    | Upload and process PDF                |
| DELETE | `/api/documents`            | JWT                    | Document management                   |
| GET    | `/api/assistant`            | JWT                    | Retrieve assistant URL and embed code |
| POST   | `/api/assistant/regenerate` | JWT                    | Regenerate public assistant token     |
| POST   | `/api/ask`                  | Assistant token        | Submit visitor question               |
| GET    | `/api/ask/meta/:token`      | Public assistant token | Retrieve public assistant metadata    |

Authentication and authorization are enforced on the backend, rather than relying on frontend access restrictions.


## 7. Known Limitations and Future Improvements

The current application is an MVP intended to demonstrate multi-tenant document-based question answering.

### Current Limitations

1. **Lexical Retrieval:** Uses keyword/TF-style scoring rather than semantic vector search.
2. **Limited PDF Processing:** Upload restrictions include file size, page count and document count.
3. **No Dedicated Decomposition Engine:** Complex questions are handled through retrieval and LLM generation rather than a separate multi-stage reasoning pipeline.
4. **Basic Document Processing:** Large-scale asynchronous document processing is not implemented.
5. **Production Security:** Additional security hardening and monitoring are required before production deployment.
6. **LLM Dependency:** Answer generation depends on the availability of the configured Groq API.

### Recommended Production Improvements

- Introduce vector embeddings and semantic retrieval.
- Add hybrid search combining lexical and semantic retrieval.
- Implement multi-step question decomposition and structured decision models.
- Add background PDF processing using job queues.
- Introduce cloud object storage for uploaded documents.
- Add comprehensive audit logs and observability.
- Implement stronger password policies and account security.
- Add automated integration and end-to-end tests.
- Improve document versioning and re-indexing.
- Add advanced usage analytics and configurable organization quotas.

---

## 8. Test Data and Verification

The project includes two sample organizations:

1. Northridge University.
2. Harbor Technical College.



This initializes the sample organization data in MongoDB Atlas.

### Sample PDF Documents

Upload the provided PDFs through the frontend:

`frontend/sample_data/upload_to_ui`

### Test Questions

Refer to:

`sample_data/TEST_QUESTIONS.md`


### Dashboard Usage Metrics

The dashboard tracks:

- Questions asked.
- Questions answered.
- Questions unable to be answered.
- Questions requiring review.

The needs-review status identifies cases where the model failed and a retrieved-text fallback was returned.

---

## 9. Project Summary

The AI Knowledge & Decision Assistant demonstrates:

- Multi-tenant SaaS architecture.
- Organization-specific PDF knowledge bases.
- Document extraction and chunking.
- Tenant-scoped information retrieval.
- LLM-powered grounded question answering.
- Document and page-level references.
- JWT-based dashboard authentication.
- Token-based public assistant access.
- Embeddable public assistant widgets.
- Usage tracking and isolation testing.

The architecture provides a foundation for evolving the MVP into a production-grade multi-tenant knowledge and decision-support platform.

One final recommendation before submission: Verify the actual backend implementation of PDF deletion, token regeneration, JWT expiry, retrieval thresholds, and fallback behavior against this README. The documentation now clearly separates implemented functionality from proposed improvements, which is important during technical evaluation.