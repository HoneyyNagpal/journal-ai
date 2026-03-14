# Architecture Notes — ArvyaX Journal

## 1. How would you scale this to 100k users?

The current single-process Node/MongoDB setup hits limits somewhere around a few thousand concurrent users. Getting to 100k requires work at every layer.

**Database layer**

MongoDB scales horizontally well. At 100k users I'd move to a sharded cluster (shard key: `userId`) so reads and writes spread across nodes. Add compound indexes on `{ userId: 1, createdAt: -1 }` to keep journal lookups fast regardless of total document count. Consider a read replica for the insights aggregation query - those are expensive full collection scans on a per user basis and don't need to hit the primary.

**Application layer**

Replace the single Express process with a cluster of stateless instances behind a load balancer (NGINX or a managed option like AWS ALB). Stateless means no session data lives in the process, which is already true here. Horizontal scaling becomes a matter of adding instances.

For the insights endpoint specifically, the aggregation runs on every request. At scale, precompute insights asynchronously: when an entry is created or analyzed, publish an event to a queue (Redis Streams or a managed queue). A worker consumes the event, recomputes the user's insights, and writes the result to a dedicated `UserInsights` collection. The GET endpoint then becomes a simple document lookup instead of a real-time aggregation.

**LLM calls**

LLM requests are slow (1-3 seconds) and should never block a request thread. Move analysis to a background job: the POST `/analyze` endpoint enqueues a job and immediately returns a `202 Accepted` with a job ID. The frontend polls or uses a WebSocket subscription to receive the result. This keeps API response times fast and decouples LLM throughput from web request throughput.

**Auth**

The current `userId` is a plain string from the client, obviously not production safe. At scale, add JWT auth with a short lived access token and a refresh token. User identity is verified server side on every request. This is table stakes before any real user data enters the system.

---

## 2. How would you reduce LLM cost?

Several compounding strategies:

**Model selection** - Claude Haiku is already used here because it costs roughly 25× less than Opus while being more than adequate for single-emotion classification and keyword extraction. Always start at the cheapest capable model.

**Prompt compression** - The current prompt includes a full journal entry verbatim. Long entries inflate token counts. A simple preprocessing step (truncate to 500 characters, strip repeated whitespace) reduces input tokens with negligible impact on output quality for emotion analysis.

**Caching** - Identical or near-identical texts should never hit the LLM twice. See section 3 below.

**Batching** - If the system ever needs to analyze historical entries in bulk (e.g., a data migration or retroactive analysis), batch requests during off peak hours and use asynchronous processing rather than real time calls.

**Client-side gating** - Don't auto analyze on every keystroke or save. The current design requires an explicit user action ("Analyze" button), which means LLM calls only happen when the user actually wants them.

---

## 3. How would you cache repeated analysis?

**In-memory cache (current implementation)**

`node-cache` is used in `llmService.js`. The cache key is a hash of the normalized input text (lowercased, whitespace collapsed). TTL is 1 hour. This works for a single process deployment and is already in place.

**Distributed cache (production)**

In a multi instance setup, in memory caches are per process and useless for deduplication. Replace with Redis. The key structure stays the same (hash of normalized text), and Redis TTL handles expiry. Any instance that handles an analyze request checks Redis first before calling the LLM.

**Persistent cache**

For a second layer, store analysis results directly on the journal entry document in MongoDB (`analysis` subdocument + `analyzed: true` flag). When a previously analyzed entry is retrieved, the result is already embedded - no cache lookup, no LLM call. This is already implemented in the current data model. The `entryId` parameter on `/analyze` triggers this persistence.

**Cache invalidation**

Analysis results are treated as immutable once generated. There's no scenario where re-analyzing the same text would produce a different result that needs to be reflected, so TTL expiry is the only invalidation needed.

---

## 4. How would you protect sensitive journal data?

Journal entries are personal mental health data. This requires defense in depth.

**Encryption at rest**

Enable MongoDB's Encrypted Storage Engine (available in MongoDB Enterprise / Atlas). This encrypts data files on disk. For higher assurance, use MongoDB's Client-Side Field Level Encryption (CSFLE) to encrypt the `text` field before it ever leaves the application process, the database stores only ciphertext and cannot be read even by a compromised DB admin.

**Encryption in transit**

All connections use TLS: HTTPS for the API (terminate at the load balancer), TLS for the MongoDB connection string. The `.env.example` already uses `mongodb://` - production should enforce `mongodb+srv://` with TLS enforced in the connection options.

**Access control**

- MongoDB: each service uses its own DB user with the minimum required role (readWrite on the `arvyax` database only, not admin).
- API: routes are scoped per user. A user can only read or write their own entries - enforced server-side by matching the authenticated JWT subject against the `userId` parameter, not trusting client supplied values.

**Data minimization**

Don't store more than necessary. Analysis keywords and summaries are useful; the raw LLM response beyond that is not. Don't log journal text to application logs (currently, only errors are logged, not request bodies).

**Audit logging**

For compliance, log reads and writes of journal entries to a separate append-only audit log: who accessed what, and when. This is separate from application logs and should be tamper-evident (e.g., stored in a write once S3 bucket or a dedicated audit log service).

**Data retention**

Offer users the ability to delete their entries. Implement a soft-delete (`deletedAt` timestamp) with a hard delete job that purges records after a retention window. This is both a privacy feature and a cost control mechanism.

---

## Current Architecture Diagram (simplified)

```
Browser (React)
     │
     │ HTTPS
     ▼
Express API (Node.js)
     ├── Rate limiter (express-rate-limit)
     ├── /api/journal         ── CRUD ──► MongoDB (Journal collection)
     ├── /api/journal/analyze ──────────► node-cache
     │                                        │ miss
     │                                        ▼
     │                                   Anthropic API (Claude Haiku)
     │                                        │
     │                                   result cached + persisted
     └── /api/journal/insights/:userId ── aggregation ──► MongoDB
```

## Production Target Architecture

```
Browser (React)
     │
     │ HTTPS
     ▼
CDN (static assets)    Load Balancer
                            │
                    ┌───────┴───────┐
               Express           Express
               (instance)        (instance)
                    └───────┬───────┘
                            │
                    ┌───────┼──────────────┐
                    ▼       ▼              ▼
                MongoDB  Redis Cache   Job Queue
                Cluster  (analysis)   (async LLM)
                    │                      │
                    │               LLM Worker Pool
                    │                      │
                    └──────────────────────┘
                        (results persisted)
```
