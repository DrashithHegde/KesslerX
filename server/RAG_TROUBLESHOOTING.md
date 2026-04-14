# RAG Engine Troubleshooting Guide

## Issue Found: Outdated Gemini Model Name

### Root Cause
The RAG engine was configured to use the model `"gemini-3-flash-preview"` which:
- Does not exist in the current Gemini API
- Results in silent initialization failures
- Causes all RAG requests to return the offline fallback message

### Solution Applied

#### 1. Updated Model Support
The RAG engine now supports and tries multiple Gemini models in order of preference:
```python
GEMINI_MODELS = [
    "gemini-2.0-flash",      # Latest and recommended
    "gemini-1.5-flash",      # Faster alternative
    "gemini-1.5-pro",        # Most capable (if available)
]
```

#### 2. Enhanced Error Logging
Added comprehensive logging to help identify issues:
- Model initialization attempts with success/failure reasons
- API call logging with target tracking
- Specific error type identification (quota, rate limit, auth, etc.)
- Cache hit/miss statistics

#### 3. Improved Error Handling
- Distinguishes between different error types (quota, auth, etc.)
- Provides specific error messages for each case
- Implements fallback explanations gracefully
- Retries with different models if first initialization fails

### Files Modified

1. **server/app/core/rag.py**
   - Added `GEMINI_MODELS` list with current Gemini models
   - Updated `RAGEngine.__init__()` to try multiple models
   - Enhanced error handling in `generate_explanation()`
   - Added comprehensive logging throughout

### How to Verify the Fix

Use the new diagnostic script to verify the setup:

```bash
cd server
python diagnose_rag.py
```

This will:
1. Check environment variables
2. Verify dependencies
3. Test RAG engine initialization
4. Attempt a sample explanation generation
5. Report detailed diagnostics

### Common Issues & Solutions

#### "API quota exceeded"
- Check your Gemini API quota limits in Google Cloud Console
- Implement rate limiting if needed
- Consider using local fallback explanations

#### "Invalid API key" 
- Verify GEMINI_API_KEY in server/.env is correct
- Generate a new API key from Google Cloud Console if needed
- Ensure the key has the required permissions

#### "Connection timeout"
- Check network connectivity
- Verify firewall doesn't block api.generativeai.google.com
- Check Google Cloud service status

#### "All models failed to initialize"
- Ensure langchain-google-genai is installed: `pip install langchain-google-genai`
- Verify Python >= 3.8
- Check if other dependencies conflict

### Working Correctly When

Successful initialization logs show:
```
INFO: Attempting to initialize ChatGoogleGenerativeAI with model: gemini-2.0-flash
INFO: Successfully initialized Gemini LLM with model: gemini-2.0-flash
```

Successful explanation generation shows:
```
INFO: Generating RAG explanation for target {NORAD_ID} using model: gemini-2.0-flash
INFO: Successfully generated explanation for target {NORAD_ID}
```

### Debug Mode

To enable verbose logging, set environment variable:
```bash
export LOG_LEVEL=debug
```

Or pass to server startup:
```bash
uvicorn app.main:app --log-level debug
```

### Testing the API

Once fixed, test the `/api/analysis/explain` endpoint:

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

Expected response (if working):
```json
{
  "status": "success",
  "explanation": "Assessment: ...",
  "uncertainty_score": 85,
  "uncertainty_source": "client"
}
```

### Next Steps

1. Run `diagnose_rag.py` to identify any remaining issues
2. Ensure server is restarted after changes
3. Check server logs for detailed error information
4. Test with the diagnostic script first before using in production

### Support Resources

- Gemini API Docs: https://ai.google.dev/gemini-api/docs
- LangChain Gemini: https://python.langchain.com/docs/integrations/llms/google_generative_ai
- Common Error Codes: https://ai.google.dev/gemini-api/docs/quotas-errors

---

**Last Updated:** 2026-04-09  
**Status:** Ready for testing
