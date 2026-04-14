# RAG Engine Analysis & Fix Summary

## What Was Wrong

Your RAG (Retrieval-Augmented Generation) engine was not producing output from Gemini because:

### Critical Issue: Invalid Model Name
The engine was configured to use `"gemini-3-flash-preview"` - a model that **does not exist** in the Gemini API.

When LangChain tried to initialize this model:
1. It failed silently during `RAGEngine.__init__()`
2. Set `self.enabled = False`
3. All subsequent explanation requests returned the fallback message: "LLM Explanation Engine offline. Please check API configuration."

This appeared as if Gemini wasn't working when actually the model name was invalid.

## What Was Fixed

### 1. **Updated to Current Gemini Models**
   - Replaced hardcoded invalid model with a list of current models:
     - `gemini-2.0-flash` (latest, recommended)
     - `gemini-1.5-flash` (faster alternative)
     - `gemini-1.5-pro` (for complex queries)

### 2. **Implemented Model Fallback Logic**
   - RAG engine now tries each model in sequence
   - Uses the first one that initializes successfully
   - Logs which model is in use
   - Gracefully handles all models being unavailable

### 3. **Enhanced Error Visibility**
   - Added comprehensive logging at each step:
     - Model initialization attempts
     - LLM API calls
     - Error classification (quota, auth, rate limit, etc.)
     - Response parsing
   - Specific error messages for debugging

### 4. **Improved Error Recovery**
   - Distinguishes between different failure types
   - Returns appropriate error messages for each case
   - Implements intelligent fallback (graceful degradation)
   - Caches both successes and failures appropriately

## Files Changed

### `server/app/core/rag.py`
- **Added:** `GEMINI_MODELS` constant with current model names
- **Updated:** `RAGEngine.__init__()` for model fallback logic
- **Enhanced:** `generate_explanation()` with detailed logging
- **Improved:** Error handling with specific error type detection

### `server/diagnose_rag.py` (NEW)
- Comprehensive diagnostic script to test RAG setup
- Checks environment, dependencies, and LLM connectivity
- Tests actual explanation generation
- Provides detailed troubleshooting report

### `server/RAG_TROUBLESHOOTING.md` (NEW)
- Complete troubleshooting guide
- Explanation of fixes implemented
- Common issues and solutions
- Testing procedures

## Testing the Fix

### Quick Test
```bash
cd server
python diagnose_rag.py
```

This will:
- ✓ Verify GEMINI_API_KEY is configured
- ✓ Check all dependencies are installed
- ✓ Test RAG engine initialization
- ✓ Attempt LLM connectivity test
- ✓ Generate a sample explanation
- ✓ Report overall status

### Integration Test
```bash
curl -X POST http://localhost:8000/api/analysis/explain \
  -H "Content-Type: application/json" \
  -d '{
    "norad_id": "12110",
    "object_name": "COSMOS 1231",
    "uncertainty_score": 85,
    "risk_score": 72,
    "event_class": "super_close_call",
    "min_separation_km": 15.5,
    "tca_minutes": 45
  }'
```

### What Success Looks Like

Server logs should show:
```
INFO: Attempting to initialize ChatGoogleGenerativeAI with model: gemini-2.0-flash
INFO: Successfully initialized Gemini LLM with model: gemini-2.0-flash
INFO: Generating RAG explanation for target 12110 using model: gemini-2.0-flash
INFO: Successfully generated explanation for target 12110
```

Response should show actual AI-generated explanation, not fallback message.

## Next Steps

1. **Restart the server** to load the updated RAG engine
2. **Run diagnose_rag.py** to verify everything is working
3. **Review server logs** if there are any remaining issues
4. **Test the explain endpoint** with a real conjunction scenario
5. **Monitor logs** for any "LLM Generation failed" messages

## Potential Remaining Issues

If you still see "LLM Explanation Engine offline" after fix:

- **Invalid GEMINI_API_KEY?**
  - Ensure your API key from Google Cloud is correct
  - The key in `.env` should start with `AIza...`
  - Generate a new key if unsure

- **No API quota?**
  - Check Google Cloud Console for API quota limits
  - May need to upgrade account or wait for quota reset

- **Network connectivity?**
  - Verify connection to `api.generativeai.google.com`
  - Check firewall/proxy settings

- **Dependency issues?**
  - Run: `pip install --upgrade langchain-google-genai`
  - Ensure Python >= 3.8

## Architecture Overview

The fixed RAG flow:
```
API Request (/api/analysis/explain)
    ↓
ExplanationRequest validation
    ↓
Gather context from ML model + request fields
    ↓
Check cache (RAGEngine._get_cached)
    ↓
If cache miss → Call Gemini LLM
    ↓
Parse response (handle list or string)
    ↓
Coerce to operational brief format
    ↓
Cache result (600s TTL for success, 45s for errors)
    ↓
Return to client
```

If LLM unavailable → Skip step and use `_coerce_plain_operational_brief()` for fallback

## Root Cause Analysis

Why the error wasn't obvious:
1. Invalid model name → Silent initialization failure
2. `except Exception` was too broad → Errors weren't logged detail
3. No logging of which model was being attempted
4. `self.enabled = False` silently disabled the engine
5. Fallback message made it look like intentional offline state

The fix adds visibility at each step so future issues are immediately apparent in logs.

---

**Status:** ✅ READY FOR TESTING
**Test Script:** `python diagnose_rag.py`
**Expected Time to Fix:** ~2-5 min (including server restart)
